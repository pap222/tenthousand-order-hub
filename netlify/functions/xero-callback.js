// netlify/functions/xero-callback.js
// Xero redirects here with ?code=... — exchange for tokens, save to Supabase.
// Logs every step to Netlify function logs (Logs & metrics > Functions).
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  console.log("=== XERO CALLBACK ===");
  console.log("Query params received:", JSON.stringify(qs));

  // If Xero sent an error straight to the callback, surface it.
  if (qs.error) {
    console.log("Xero returned error:", qs.error, qs.error_description);
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: `<h2>Xero returned an error</h2><p><b>${qs.error}</b></p><p>${qs.error_description || ""}</p><a href="/admin">Back</a>`,
    };
  }

  const code = qs.code;
  if (!code) {
    console.log("No code in callback");
    return { statusCode: 400, body: "Missing authorization code from Xero" };
  }

  try {
    const clientId = process.env.XERO_CLIENT_ID || "";
    const clientSecret = process.env.XERO_CLIENT_SECRET || "";
    const redirectUri = process.env.XERO_REDIRECT_URI || "";

    console.log("CLIENT_ID length:", clientId.length);
    console.log("CLIENT_SECRET length:", clientSecret.length);
    console.log("REDIRECT_URI:", JSON.stringify(redirectUri));

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const rawToken = await tokenRes.text();
    console.log("Token endpoint status:", tokenRes.status);
    console.log("Token endpoint raw response:", rawToken);

    let tokens;
    try { tokens = JSON.parse(rawToken); }
    catch { throw new Error("Xero token response wasn't JSON: " + rawToken.slice(0, 200)); }

    if (tokens.error) {
      throw new Error(`Xero token error: ${tokens.error} — ${tokens.error_description || ""}`);
    }

    // get tenant
    const connRes = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const conns = await connRes.json();
    console.log("Connections returned:", JSON.stringify(conns));
    const tenantId = conns[0]?.tenantId;
    if (!tenantId) throw new Error("No Xero organisation connected — accept the org on the consent screen.");

    const { error: dbErr } = await supabase.from("xero_tokens").upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      tenant_id: tenantId,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });
    if (dbErr) throw new Error("Saved to Xero but DB write failed: " + dbErr.message);

    console.log("=== XERO CONNECTED OK, tenant:", tenantId, "===");
    return { statusCode: 302, headers: { Location: "/admin?xero=connected" } };
  } catch (e) {
    console.log("CALLBACK ERROR:", e.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h2>Xero connection failed</h2><p>${e.message}</p><a href="/admin">Back to admin</a>`,
    };
  }
};
