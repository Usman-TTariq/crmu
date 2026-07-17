-- ============================================================================
-- TGT Nexus CRM — 19_in_tf_calendar_day.sql
-- Allow timeframe = YYYY-MM-DD for a single calendar day filter.
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

create or replace function private.in_tf(d date, tf text)
returns boolean
language sql
stable
as $$
  select case
    when tf = 'All time' then true
    when d is null then true
    when tf ~ '^\d{4}-\d{2}-\d{2}$' then d = tf::date
    when tf = 'Daily'   then d = current_date
    when tf = 'Weekly'  then d >= (current_date - extract(dow from current_date)::int) and d <= current_date
    when tf = 'Last 7 days' then d >= (current_date - 6) and d <= current_date
    when tf = 'Monthly' then date_trunc('month', d) = date_trunc('month', current_date)
    else true
  end;
$$;
