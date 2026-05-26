// netlify/functions/xero-sync-contacts.js
// Pulls ALL Xero contacts and upserts them as customers in Supabase.
// Each gets an order token if they don't have one. Returns a count.
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getValidToken() {
  const { data: tok } = await supabase
    .from("xero_tokens").select("*").eq("id", 1).single();
  if (!tok) throw new Error("Xero not connected. Click 'Connect Xero' first.");
  if (new Date(tok.expires_at).getTime() - Date.now() < 120000) {
    const basic = Buffer.from(
      `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
    ).toString("base64");
    const r = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token }),
    });
    const fresh = await r.json();
    if (fresh.error) throw new Error("Token refresh failed: " + fresh.error);
    await supabase.from("xero_tokens").update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    }).eq("id", 1);
    return { token: fresh.access_token, tenantId: tok.tenant_id };
  }
  return { token: tok.access_token, tenantId: tok.tenant_id };
}

function genToken() {
  return Math.random().toString(36).slice(2, 10);
}

exports.handler = async () => {
  try {
    const { token, tenantId } = await getValidToken();

    // page through all customer contacts
    let page = 1, all = [];
    while (true) {
      const params = new URLSearchParams({
        page: String(page),
        includeArchived: "false",
        where: "IsCustomer==true",
        order: "Name",
      });
      const res = await fetch("https://api.xero.com/api.xro/2.0/Contacts?" + params, {
        headers: { Authorization: `Bearer ${token}`, "Xero-tenant-id": tenantId, Accept: "application/json" },
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.Detail || out.Message || JSON.stringify(out));
      const batch = out.Contacts || [];
      all = all.concat(batch);
      if (batch.length < 100) break; // Xero pages are 100; fewer = last page
      page++;
      if (page > 20) break; // safety cap (2000 contacts)
    }

    // existing customers (to keep their tokens & not duplicate)
    const { data: existing } = await supabase.from("customers").select("*");
    const byXeroId = {};
    (existing || []).forEach((c) => { if (c.xero_contact_id) byXeroId[c.xero_contact_id] = c; });

    let added = 0, updated = 0;
    for (const c of all) {
      const match = byXeroId[c.ContactID];
      const email = c.EmailAddress || null;
      if (match) {
        // update name and email if either changed (don't wipe an email Rick typed manually if Xero has none)
        const patch = {};
        if (match.name !== c.Name) patch.name = c.Name;
        if (email && match.email !== email) patch.email = email;
        if (Object.keys(patch).length) {
          await supabase.from("customers").update(patch).eq("id", match.id);
          updated++;
        }
      } else {
        await supabase.from("customers").insert({
          name: c.Name,
          xero_contact_id: c.ContactID,
          email,
          token: genToken(),
        });
        added++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: all.length, added, updated }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
