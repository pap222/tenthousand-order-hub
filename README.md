# Wagga Fruit Supply — Order Hub

Customer order pages → central admin → finalised Xero invoice.

## How it works
- **Customers** order via a unique link: `yoursite.com/?c=<token>` (no login)
- **You** review orders at `yoursite.com/admin` (PIN gate)
- One click pushes an order to Xero as a **finalised (AUTHORISED) invoice**

## Setup (≈15 min)

### 1. Supabase
1. Create a project at supabase.com
2. SQL Editor → paste `supabase-schema.sql` → Run
3. Settings → API → copy the **Project URL**, **anon key**, and **service_role key**

### 2. Xero app
Reuse your existing GST-tool Xero app, OR create a new one at developer.xero.com:
- Add redirect URI: `https://YOURSITE.netlify.app/.netlify/functions/xero-callback`
- Note the **Client ID** and **Client Secret**
- Scopes needed: `accounting.transactions`, `accounting.contacts.read`, `offline_access`

### 3. Netlify env vars
Site settings → Environment variables:

```
VITE_SUPABASE_URL        = https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY   = eyJ...        (anon key)
VITE_ADMIN_PIN           = 4729          (pick your own)

SUPABASE_URL             = https://xxx.supabase.co
SUPABASE_SERVICE_KEY     = eyJ...        (service_role key — server only)
XERO_CLIENT_ID           = ...
XERO_CLIENT_SECRET       = ...
XERO_REDIRECT_URI        = https://YOURSITE.netlify.app/.netlify/functions/xero-callback
XERO_SALES_ACCOUNT       = 200           (your sales account code in Xero)
```

### 4. Deploy
Push to a Git repo and connect to Netlify, or drag the folder into Netlify.
Build command `npm run build`, publish dir `dist` (already in netlify.toml).

## First run
1. Go to `/admin`, enter PIN
2. **Customers tab** → add each customer + paste their **Xero Contact ID**
   (find it in Xero: open the contact, it's in the URL after `contactID=`)
3. Copy each customer's order link, text it to them
4. **Products tab** → adjust the seeded products / prices
5. **Orders tab** → click **Connect Xero** once (authorises the connection)
6. Orders roll in → click **Push to Xero** → finalised invoice created

## Important caveats

- **GST treatment**: invoices use `TaxType: EXEMPTOUTPUT` (GST-free) for all lines,
  since fresh produce is GST-free. If you sell anything GST-applicable (some
  processed/packaged lines), change the TaxType per product in
  `netlify/functions/xero-invoice.js`. This mirrors the logic in your GST journal tool.

- **Admin security**: currently a PIN + anon key. Fine for a single trusted operator.
  If the /admin URL could leak, switch to Supabase Auth and tighten the RLS policies
  noted in the schema file.

- **Finalised = sent state**: AUTHORISED invoices in Xero are locked (not editable
  like drafts). If a chef changes their mind after you've pushed, you'll void/credit
  in Xero. Say the word if you'd rather push as DRAFT — it's a one-word change
  (`Status: "DRAFT"`) in xero-invoice.js.
