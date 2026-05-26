-- ============================================================
-- Run this in Supabase > SQL Editor to enable Xero product sync.
-- Safe to run once; adds columns only if missing.
-- ============================================================

alter table products add column if not exists xero_item_id text;
alter table products add column if not exists xero_code text;

-- optional: stops duplicate products if you sync twice
create unique index if not exists products_xero_item_id_key
  on products (xero_item_id) where xero_item_id is not null;

-- customers table already has xero_contact_id; ensure it's unique too
create unique index if not exists customers_xero_contact_id_key
  on customers (xero_contact_id) where xero_contact_id is not null;
