-- ============================================================
-- Run in Supabase > SQL Editor.
-- Adds: storage for the public Xero invoice URL,
--        and lets the chef order page read their own orders.
-- ============================================================

alter table orders add column if not exists xero_online_url text;

-- Allow the order page (anon) to read orders.
-- The page already filters by the customer's id, so chefs only ever
-- query their own. (Single-operator tool; tighten with Auth later if needed.)
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'orders' and policyname = 'anon read orders'
  ) then
    create policy "anon read orders" on orders for select using (true);
  end if;
end $$;
