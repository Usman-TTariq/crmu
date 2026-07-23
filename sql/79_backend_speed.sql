-- ============================================================================
-- TGT Nexus CRM — 79_backend_speed.sql
-- Phase-1 backend speed: closer open-load aggregation, tab counts RPC,
-- OPS accuracy counts, presence badge summary.
-- Safe to re-run. Paste into Supabase SQL editor after 78.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Closer open loads (SQL Assign) — one GROUP BY instead of scanning all rows
-- ---------------------------------------------------------------------------
create or replace function public.closer_open_loads()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_object_agg(closer, cnt)
      from (
        select closer, count(*)::int as cnt
        from public.closer_deals
        where closer is not null
          and closer <> ''
          and stage not in ('Closed', 'Closed Won', 'Closed Lost', 'Not Interested')
        group by closer
      ) s
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.closer_open_loads() from public;
grant execute on function public.closer_open_loads() to authenticated;
grant execute on function public.closer_open_loads() to service_role;

-- ---------------------------------------------------------------------------
-- Sidebar tab counts — one round-trip (RLS via security invoker)
-- Matches applyOpsQueueFilter / applyLeadgenOriginFilter + private.in_tf
-- ---------------------------------------------------------------------------
create or replace function public.dash_tab_counts(p_tf text default 'All time')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  n bigint;
begin
  select count(*) into n
  from public.leads l
  where l.lead_origin = 'leadgen'
    and private.in_tf(l.date_created, p_tf);
  result := result || jsonb_build_object('leadgen', coalesce(n, 0));

  select count(*) into n
  from public.qa_records q
  where private.in_tf(q.qa_date, p_tf);
  result := result || jsonb_build_object('qa', coalesce(n, 0));

  select count(*) into n
  from public.sql_assignments s
  where private.in_tf(s.assignment_date, p_tf);
  result := result || jsonb_build_object('sqlassign', coalesce(n, 0));

  select count(*) into n
  from public.closer_deals c
  where private.in_tf(c.assigned_date, p_tf);
  result := result || jsonb_build_object('closer', coalesce(n, 0));

  select count(*) into n
  from public.documentation_reviews d
  where private.in_tf(d.review_date, p_tf);
  result := result || jsonb_build_object('documentation', coalesce(n, 0));

  select count(*) into n
  from public.ops_verifications o
  where o.ops_status is distinct from 'Rework'
    and o.ops_status is distinct from 'Reworked'
    and private.in_tf(o.ops_date, p_tf);
  result := result || jsonb_build_object('ops', coalesce(n, 0));

  select count(*) into n
  from public.msp_onboarding m
  where private.in_tf(m.ops_approved_date, p_tf);
  result := result || jsonb_build_object('msp', coalesce(n, 0));

  select count(*) into n
  from public.fulfillment f
  where private.in_tf(f.funded_date, p_tf);
  result := result || jsonb_build_object('fulfillment', coalesce(n, 0));

  select count(*) into n
  from public.leasing l
  where private.in_tf(l.order_activation, p_tf);
  result := result || jsonb_build_object('leasing', coalesce(n, 0));

  select count(*) into n from public.retention;
  result := result || jsonb_build_object('retention', coalesce(n, 0));

  select count(*) into n from public.profiles;
  result := result || jsonb_build_object('teamsetup', coalesce(n, 0));

  return result;
end;
$$;

revoke all on function public.dash_tab_counts(text) from public;
grant execute on function public.dash_tab_counts(text) to authenticated;
grant execute on function public.dash_tab_counts(text) to service_role;

-- ---------------------------------------------------------------------------
-- OPS accuracy banner — SQL GROUP BY (no row download into Node)
-- ---------------------------------------------------------------------------
create or replace function public.ops_accuracy_stats(p_tf text default 'All time')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  passes bigint := 0;
  fails bigint := 0;
  reviewed bigint := 0;
  acc numeric;
begin
  select
    count(*) filter (where accuracy_review = 'Pass'),
    count(*) filter (where accuracy_review = 'Fail')
  into passes, fails
  from public.ops_verifications
  where accuracy_review in ('Pass', 'Fail')
    and private.in_tf(ops_date, p_tf);

  reviewed := coalesce(passes, 0) + coalesce(fails, 0);
  if reviewed > 0 then
    acc := round((passes::numeric / reviewed::numeric) * 1000) / 10;
  else
    acc := null;
  end if;

  return jsonb_build_object(
    'reviewed', reviewed,
    'passes', coalesce(passes, 0),
    'fails', coalesce(fails, 0),
    'acc', acc,
    'met', (acc is null or acc >= 95)
  );
end;
$$;

revoke all on function public.ops_accuracy_stats(text) from public;
grant execute on function public.ops_accuracy_stats(text) to authenticated;
grant execute on function public.ops_accuracy_stats(text) to service_role;

-- ---------------------------------------------------------------------------
-- Presence badge — tiny online/away/break counts (not full board + week)
-- ---------------------------------------------------------------------------
create or replace function public.presence_badge_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rk text := coalesce(private.role_key(), '');
  exclude text[];
  online_n int := 0;
  away_n int := 0;
  break_n int := 0;
begin
  if rk in ('ceo', 'super_admin') then
    exclude := array['ceo', 'super_admin'];
  elsif rk in ('hr', 'hr_monitor') then
    exclude := array['ceo', 'super_admin', 'hr', 'hr_monitor'];
  else
    return jsonb_build_object('online', 0, 'away', 0, 'break', 0);
  end if;

  select
    count(*) filter (where effective = 'working'),
    count(*) filter (where effective in ('away', 'idle')),
    count(*) filter (where effective = 'break')
  into online_n, away_n, break_n
  from (
    select
      case
        when up.last_heartbeat_at is null
          or up.last_heartbeat_at < now() - interval '90 seconds'
        then 'offline'
        else coalesce(up.status, 'offline')
      end as effective
    from public.profiles p
    left join public.user_presence up on up.user_id = p.user_id
    where p.is_active is distinct from false
      and p.user_id is not null
      and not (p.role_key = any (exclude))
  ) s;

  return jsonb_build_object(
    'online', coalesce(online_n, 0),
    'away', coalesce(away_n, 0),
    'break', coalesce(break_n, 0)
  );
end;
$$;

revoke all on function public.presence_badge_summary() from public;
grant execute on function public.presence_badge_summary() to authenticated;
grant execute on function public.presence_badge_summary() to service_role;

notify pgrst, 'reload schema';
