-- ============================================================
-- Run in Supabase > SQL Editor.
-- Adds a message field that prints on the Xero invoice.
-- (Item "unavailable" is stored inside the existing lines JSON, no column needed.)
-- ============================================================

alter table orders add column if not exists invoice_message text;
