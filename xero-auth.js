// netlify/functions/xero-auth.js
// Kicks off Xero OAuth.
// DEBUG MODE: add ?debug=1 to the URL to SEE the authorize URL + env var
// values instead of redirecting. e.g.
//   https://tthorder.netlify.app/.netlify/functions/xero-auth?debug=1

exports.handler = async (event) => {
  const scopes = [
    "openid",
    "profile",
    "email",
    "accounting.invoices",
    "accounting.contacts.read",
    "offline_access",
  ].join(" ");

  const clientId = process.env.XERO_CLIENT_ID || "";
  const redirectUri = process.env.XERO_REDIRECT_URI || "";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state: "wfs-orderhub",
  });

  const url = "https://login.xero.com/identity/connect/authorize?" + params;

  // ---- log to Netlify function logs (Logs & metrics > Functions) ----
  console.log("=== XERO AUTH START ===");
  console.log("CLIENT_ID length:", clientId.length, "value:", JSON.stringify(clientId));
  console.log("REDIRECT_URI length:", redirectUri.length, "value:", JSON.stringify(redirectUri));
  console.log("Full authorize URL:", url);
  console.log("=======================");

  // ---- DEBUG view: ?debug=1 shows everything on screen ----
  const isDebug = (event.queryStringParameters || {}).debug === "1";
  if (isDebug) {
    const secretSet = process.env.XERO_CLIENT_SECRET ? "SET (" + process.env.XERO_CLIENT_SECRET.length + " chars)" : "!!! MISSING !!!";
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{font-family:system-ui;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}
code{background:#f3f0e7;padding:2px 6px;border-radius:4px;word-break:break-all}
.row{margin:14px 0;padding:12px;border:1px solid #ddd;border-radius:8px}
.k{font-weight:700;color:#2f4a3c}
.warn{color:#b00}
a.btn{display:inline-block;background:#c5703f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;margin-top:20px}
</style></head><body>
<h2>Xero Auth — Debug</h2>
<p>This shows exactly what your app will send to Xero. Compare each value to your Xero app's Configuration page.</p>
<div class="row"><span class="k">XERO_CLIENT_ID</span><br>
length: ${clientId.length}<br>
value: <code>${clientId || '!!! MISSING !!!'}</code></div>
<div class="row"><span class="k">XERO_REDIRECT_URI</span><br>
length: ${redirectUri.length}<br>
value: <code>${redirectUri || '!!! MISSING !!!'}</code><br>
${/\s/.test(redirectUri) ? '<span class="warn">⚠ WARNING: contains a space or newline!</span>' : '✓ no stray whitespace'}</div>
<div class="row"><span class="k">XERO_CLIENT_SECRET</span><br>${secretSet}</div>
<div class="row"><span class="k">Full authorize URL being sent to Xero:</span><br>
<code>${url}</code></div>
<a class="btn" href="${url}">→ Try the actual Xero connect now</a>
</body></html>`;
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  }

  return { statusCode: 302, headers: { Location: url } };
};
