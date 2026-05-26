// netlify/functions/xero-contacts.js
// Searches Xero contacts by name. Returns [{ id, name }].
// GET /.netlify/functions/xero-contacts?q=brew
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getValidToken() {
  const { data: tok } = await supabase
    .from("xero_tokens").select("*").eq("id", 1).single();
  if (!tok) throw new Error("Xero not connected. Click 'Connect Xero' in admin first.");

  if (new Date(tok.expires_at).getTime() - Date.now() < 120000) {
    const basic = Buffer.from(
      `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
    ).toString("base64");
    const r = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tok.refresh_token,
      }),
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

exports.handler = async (event) => {
  const q = ((event.queryStringParameters || {}).q || "").trim();

  try {
    const { token, tenantId } = await getValidToken();

    // Xero "where" filter: Name.Contains("..."), customers only.
    // If no query, just return first page of contacts.
    const params = new URLSearchParams({ page: "1", includeArchived: "false" });
    if (q) {
      // escape double quotes in the query
      const safe = q.replace(/"/g, '\\"');
      params.set("where", `Name.Contains("${safe}")`);
    }
    params.set("order", "Name");

    const res = await fetch(
      "https://api.xero.com/api.xro/2.0/Contacts?" + params,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Xero-tenant-id": tenantId,
          Accept: "application/json",
        },
      }
    );
    const out = await res.json();
    if (!res.ok) {
      const msg = out.Detail || out.Message || JSON.stringify(out);
      throw new Error(msg);
    }

    const contacts = (out.Contacts || [])
      .slice(0, 25)
      .map((c) => ({ id: c.ContactID, name: c.Name }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
