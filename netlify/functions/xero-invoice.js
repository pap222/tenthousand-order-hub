// netlify/functions/xero-invoice.js
// Pushes an order to Xero as a FINALISED (AUTHORISED) invoice.
// Handles automatic token refresh.
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getValidToken() {
  const { data: tok } = await supabase
    .from("xero_tokens")
    .select("*")
    .eq("id", 1)
    .single();
  if (!tok) throw new Error("Xero not connected. Click 'Connect Xero' first.");

  // Refresh if expiring within 2 minutes
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
  try {
    const { orderId } = JSON.parse(event.body);

    // 1. Load order + customer
    const { data: order } = await supabase
      .from("orders").select("*").eq("id", orderId).single();
    if (!order) throw new Error("Order not found");
    if (order.status === "invoiced") throw new Error("Already invoiced");

    const { data: customer } = await supabase
      .from("customers").select("*").eq("id", order.customer_id).single();
    if (!customer?.xero_contact_id)
      throw new Error(`No Xero Contact ID set for ${order.customer_name}`);

    const { token, tenantId } = await getValidToken();

    // 2. Build invoice. Fresh produce = GST free (zero-rated).
    //    Adjust TaxType / AccountCode to match your Xero chart of accounts.
    const invoice = {
      Type: "ACCREC",
      Contact: { ContactID: customer.xero_contact_id },
      Date: new Date().toISOString().slice(0, 10),
      DueDate: order.delivery_date || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
      Reference: `Order #${order.id}`,
      Status: "AUTHORISED", // <-- FINALISED
      LineAmountTypes: "Exclusive",
      LineItems: (order.lines || []).map((l) => ({
        Description: `${l.name} (${l.unit})`,
        Quantity: l.qty,
        UnitAmount: l.unit_price,
        AccountCode: process.env.XERO_SALES_ACCOUNT || "200",
        TaxType: "EXEMPTOUTPUT", // GST-free fresh produce; change per item if needed
      })),
    };

    // 3. POST to Xero
    const res = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Xero-tenant-id": tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Invoices: [invoice] }),
    });
    const out = await res.json();
    if (!res.ok || out.Elements?.[0]?.ValidationErrors?.length) {
      const msg =
        out.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).join("; ") ||
        out.Detail ||
        JSON.stringify(out);
      throw new Error(msg);
    }

    const inv = out.Invoices[0];
    return {
      statusCode: 200,
      body: JSON.stringify({
        invoiceId: inv.InvoiceID,
        invoiceNumber: inv.InvoiceNumber,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
