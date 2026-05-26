-- ============================================================
-- Run in Supabase > SQL Editor.
-- Tracks whether an order came from the chef's link or was added
-- manually by Rick (phone/text order).
-- ============================================================

alter table orders add column if not exists source text default 'link';
-- existing orders are from the chef link, so 'link' default is correct.
