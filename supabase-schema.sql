-- ============================================================
-- Wagga Fruit Supply — Order Hub : Supabase schema
-- Run this in Supabase > SQL Editor
-- ============================================================

create table if not exists products (
  id          bigint generated always as identity primary key,
  name        text not null,
  category    text default 'Other',
  unit        text default 'kg',
  price       numeric(10,2) not null default 0,
  active      boolean default true,
  created_at  timestamptz default now()
);

create table if not exists customers (
  id              bigint generated always as identity primary key,
  name            text not null,
  token           text unique not null,      -- goes in the order link ?c=token
  xero_contact_id text,                       -- Xero ContactID (required to invoice)
  created_at      timestamptz default now()
);

create table if not exists orders (
  id                  bigint generated always as identity primary key,
  customer_id         bigint references customers(id),
  customer_name       text,
  status              text default 'new',     -- new | invoiced
  delivery_date       date,
  notes               text,
  lines               jsonb,                  -- [{product_id,name,unit,qty,unit_price,line_total}]
  total               numeric(10,2),
  xero_invoice_id     text,
  xero_invoice_number text,
  created_at          timestamptz default now()
);

-- single-row token store for the Xero connection (server-side only)
create table if not exists xero_tokens (
  id            int primary key default 1,
  access_token  text,
  refresh_token text,
  tenant_id     text,
  expires_at    timestamptz
);

-- ------------------------------------------------------------
-- Row Level Security
-- Customers (anon) need: read products, read own-ish customer, insert orders.
-- Admin + Xero functions use the SERVICE key which bypasses RLS.
-- ------------------------------------------------------------
alter table products  enable row level security;
alter table customers enable row level security;
alter table orders    enable row level security;
alter table xero_tokens enable row level security; -- no anon policies = locked to service key

-- anon can read active products (for the order page)
create policy "anon read products" on products
  for select using (active = true);

-- anon can look up a customer by token (the order page does this)
create policy "anon read customers" on customers
  for select using (true);

-- anon can place orders
create policy "anon insert orders" on orders
  for insert with check (true);

-- NOTE: admin dashboard reads/updates orders & manages products/customers.
-- For simplicity it currently uses the anon key + a PIN gate. If you want the
-- admin to read all orders, add:
--   create policy "anon read orders" on orders for select using (true);
--   create policy "anon manage products" on products for all using (true) with check (true);
--   create policy "anon manage customers" on customers for all using (true) with check (true);
-- Tighten these later with Supabase Auth if the admin URL ever leaks.

-- seed a few products to start
insert into products (name, category, unit, price) values
  ('Button Mushrooms', 'Mushrooms', 'kg', 9.50),
  ('Swiss Brown Mushrooms', 'Mushrooms', 'kg', 12.00),
  ('Free Range Eggs', 'Eggs', 'dozen', 6.50),
  ('Pea Microgreens', 'Microgreens', 'punnet', 4.00),
  ('Radish Microgreens', 'Microgreens', 'punnet', 4.50)
on conflict do nothing;
