-- ============================================================================
-- TGT Nexus CRM — 11_last_7_days_tf.sql
-- Adds rolling "Last 7 days" timeframe to private.in_tf (dashboards / KPIs / boards).
-- App lists/counts use the matching window in src/actions/data.ts.
-- Safe to re-run. Apply in Supabase SQL Editor after 04_dashboards.sql (or on
-- an existing DB that already has private.in_tf).
-- ============================================================================

create or replace function private.in_tf(d date, tf text)
returns boolean
language sql
stable
as $$
  select case
    when tf = 'All time' then true
    when d is null then true
    when tf = 'Daily'   then d = current_date
    when tf = 'Weekly'  then d >= (current_date - extract(dow from current_date)::int) and d <= current_date
    when tf = 'Last 7 days' then d >= (current_date - 6) and d <= current_date
    when tf = 'Monthly' then date_trunc('month', d) = date_trunc('month', current_date)
    else true
  end;
$$;
