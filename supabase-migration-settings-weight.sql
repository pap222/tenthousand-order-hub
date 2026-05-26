-- ============================================================
-- Run in Supabase > SQL Editor.
-- Adds: app settings (for admin PIN), and per-product weight flag.
-- ============================================================

-- 1. settings table (single row, holds the admin PIN)
create table if not exists app_settings (
  id        int primary key default 1,
  admin_pin text
);
insert into app_settings (id, admin_pin) values (1, null)
  on conflict (id) do nothing;

alter table app_settings enable row level security;
create policy "anon manage settings" on app_settings
  for all using (true) with check (true);

-- 2. per-product: is it sold by weight? (decimals allowed) default false = whole count
alter table products add column if not exists sold_by_weight boolean default false;

-- seed sensible defaults: mushrooms by weight, others by count
update products set sold_by_weight = true
  where lower(category) = 'mushrooms';
