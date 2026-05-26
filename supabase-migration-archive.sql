-- ============================================================
-- Run in Supabase > SQL Editor.
-- Lets Rick archive orders to keep the Orders page tidy.
-- ============================================================

alter table orders add column if not exists archived boolean default false;
