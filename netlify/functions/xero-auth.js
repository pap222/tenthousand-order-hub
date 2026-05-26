// netlify/functions/xero-auth.js
// Kicks off Xero OAuth. Reuses the same app credentials as your GST tool.
const { createClient } = require("@supabase/supabase-js");

exports.handler = async () => {
  const scopes = [
    "openid",
    "profile",
    "email",
    "accounting.transactions", // create/read invoices
    "accounting.contacts.read",
    "offline_access", // refresh token
  ].join(" ");

  const url =
    "https://login.xero.com/identity/connect/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.XERO_CLIENT_ID,
      redirect_uri: process.env.XERO_REDIRECT_URI,
      scope: scopes,
      state: "wfs-orderhub",
    });

  return { statusCode: 302, headers: { Location: url } };
};
