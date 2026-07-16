-- Enable Supabase Realtime (postgres_changes) for pipeline tables.
-- Run once in SQL Editor if Dashboard → Database → Publications →
-- supabase_realtime still shows 0 tables.
-- Safe to re-run: errors on "already member" can be ignored per table.

alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.qa_records;
alter publication supabase_realtime add table public.sql_assignments;
alter publication supabase_realtime add table public.closer_deals;
alter publication supabase_realtime add table public.ops_verifications;
alter publication supabase_realtime add table public.msp_onboarding;
alter publication supabase_realtime add table public.fulfillment;
alter publication supabase_realtime add table public.leasing;
alter publication supabase_realtime add table public.retention;
