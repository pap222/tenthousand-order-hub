-- ============================================================
-- Run in Supabase > SQL Editor.
-- Configurable egg batch settings (stored on the single app_settings row).
-- ============================================================

alter table app_settings add column if not exists batch_prefix       text default '';
alter table app_settings add column if not exists batch_include_date boolean default true;
alter table app_settings add column if not exists batch_suffix_num    int default 1;
alter table app_settings add column if not exists batch_rollover_hour int default 0;   -- 0 = midnight, 6 = 6am
alter table app_settings add column if not exists batch_last_rolled    date;            -- last date the suffix auto-advanced
