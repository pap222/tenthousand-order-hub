-- ============================================================
-- Run in Supabase > SQL Editor.
-- Stores the egg batch number used when an order was invoiced.
-- ============================================================

alter table orders add column if not exists egg_batch text;
