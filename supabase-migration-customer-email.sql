-- ============================================================
-- Run in Supabase > SQL Editor.
-- Adds an email field to customers (for sending invites).
-- ============================================================

alter table customers add column if not exists email text;
