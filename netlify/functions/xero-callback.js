// netlify/functions/xero-callback.js
// Xero redirects here with ?code=... — exchange for tokens, save to Supabase.
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key: server-side only
);

exports.handler = async (event) => {
  const code = new URLSearchParams(event.rawQuery || event.queryStringParameters)
    .get
    ? event.queryStringParameters.code
    : null;

  if (!code) return { statusCode: 400, body: "Missing code" };

  try {
    // 1. Exchange code for tokens
    const basic = Buffer.from(
      `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
    ).toString("base64");

    const tokenRes = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.XERO_REDIRECT_URI,
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // 2. Get the tenant (organisation) id
    const connRes = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const conns = await connRes.json();
    const tenantId = conns[0]?.tenantId;

    // 3. Store tokens (single-row table, id=1)
    await supabase.from("xero_tokens").upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      tenant_id: tenantId,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });

    return {
      statusCode: 302,
      headers: { Location: "/admin?xero=connected" },
    };
  } catch (e) {
    return { statusCode: 500, body: "Xero auth failed: " + e.message };
  }
};
