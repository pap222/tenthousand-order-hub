// netlify/functions/xero-sync-products.js
// Pulls ALL Xero Items that are sold, upserts them as products in Supabase.
// Uses each item's sales UnitPrice. Returns a count.
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

// crude category guess from the item name so the order page groups nicely
function guessCategory(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("mushroom") || n.includes("oyster") || n.includes("lion")) return "Mushrooms";
  if (n.includes("egg")) return "Eggs";
  if (n.includes("microgreen") || n.includes("pea") || n.includes("radish") || n.includes("broccoli")) return "Microgreens";
  return "Other";
}

exports.handler = async () => {
  try {
    const { token, tenantId } = await getValidToken();

    // Items endpoint isn't paged the same way; one call returns all items.
    const res = await fetch("https://api.xero.com/api.xro/2.0/Items", {
      headers: { Authorization: `Bearer ${token}`, "Xero-tenant-id": tenantId, Accept: "application/json" },
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.Detail || out.Message || JSON.stringify(out));
    const items = (out.Items || []).filter((i) => i.IsSold !== false); // sold items only

    // existing products keyed by xero item id
    const { data: existing } = await supabase.from("products").select("*");
    const byItemId = {};
    (existing || []).forEach((p) => { if (p.xero_item_id) byItemId[p.xero_item_id] = p; });

    let added = 0, updated = 0;
    for (const it of items) {
      const price = it.SalesDetails?.UnitPrice ?? 0;
      // guess if sold by weight from any unit hint on the item
      const unitHint = ((it.SalesDetails?.TaxType || "") + " " + (it.Name || "")).toLowerCase();
      const byWeight = /\b(kg|kilo|gram|\/kg|per kg|weight)\b/.test(unitHint) || /mushroom/.test((it.Name||"").toLowerCase());
      const row = {
        name: it.Name || it.Code,
        category: guessCategory(it.Name),
        unit: byWeight ? "kg" : "each",
        price,
        active: true,
        sold_by_weight: byWeight,
        xero_item_id: it.ItemID,
        xero_code: it.Code || null,
      };
      const match = byItemId[it.ItemID];
      if (match) {
        await supabase.from("products").update({ name: row.name, price: row.price, xero_code: row.xero_code }).eq("id", match.id);
        updated++;
      } else {
        await supabase.from("products").insert(row);
        added++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: items.length, added, updated }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
