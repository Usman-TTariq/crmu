-- ============================================================================
-- TGT Nexus CRM — 04_dashboards.sql
-- Dashboard RPC functions. Called from the app via supabase.rpc() with the
-- timeframe in the payload (never in URL params). Run after 03_rls.sql.
-- Timeframes: 'Daily' | 'Weekly' | 'Last 7 days' | 'Monthly' | 'All time' | YYYY-MM-DD
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Timeframe helper: matches the prototype's matchTimeframe (blank dates pass)
-- ---------------------------------------------------------------------------
create or replace function private.in_tf(d date, tf text)
returns boolean
language sql
stable
as $$
  select case
    when tf = 'All time' then true
    when d is null then true
    -- Calendar day from the app (YYYY-MM-DD)
    when tf ~ '^\d{4}-\d{2}-\d{2}$' then d = tf::date
    when tf = 'Daily'   then d = current_date
    when tf = 'Weekly'  then d >= (current_date - extract(dow from current_date)::int) and d <= current_date
    when tf = 'Last 7 days' then d >= (current_date - 6) and d <= current_date
    when tf = 'Monthly' then date_trunc('month', d) = date_trunc('month', current_date)
    else true
  end;
$$;

-- ---------------------------------------------------------------------------
-- Customer Success metrics for a timeframe (denominator = funded this period)
-- ---------------------------------------------------------------------------
create or replace function private.cs_metrics(tf text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d int; n_active int; n_churned int; n_atrisk int; n_chargeback int; n_closedmsp int;
begin
  with funded as (
    select l.lead_id
    from public.leasing l
    where l.funding_status = 'Funded'
      and private.in_tf(coalesce(l.funding_date, l.order_activation), tf)
  ),
  st as (
    select f.lead_id, r.status
    from funded f
    left join public.retention r on r.lead_id = f.lead_id
  )
  select count(*),
         count(*) filter (where status = 'Active'),
         count(*) filter (where status = 'Churned'),
         count(*) filter (where status = 'At Risk'),
         count(*) filter (where status = 'Chargeback'),
         count(*) filter (where status = 'Closed by MSP')
  into d, n_active, n_churned, n_atrisk, n_chargeback, n_closedmsp
  from st;

  return jsonb_build_object(
    'funded', d,
    'active', n_active,
    'churned', n_churned,
    'atRisk', n_atrisk,
    'chargeback', n_chargeback,
    'closedMsp', n_closedmsp,
    'retentionRate', case when d > 0 then round(n_active::numeric * 1000 / d) / 10 end,
    'churnRate',     case when d > 0 then round(n_churned::numeric * 1000 / d) / 10 end,
    'atRiskRate',    case when d > 0 then round(n_atrisk::numeric * 1000 / d) / 10 end,
    'buybackRate',   case when d > 0 then round(n_chargeback::numeric * 1000 / d) / 10 end,
    'closedMspRate', case when d > 0 then round(n_closedmsp::numeric * 1000 / d) / 10 end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- CEO dashboard (admins only)
-- ---------------------------------------------------------------------------
create or replace function public.dash_ceo(tf text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'CEO dashboard is restricted.';
  end if;

  select jsonb_build_object(
    'leads', (select count(*) from leads where private.in_tf(date_created, tf)),
    'qaQualified', (select count(*) from qa_records where qa_decision = 'Qualified' and private.in_tf(qa_date, tf)),
    'qaRejected', (select count(*) from qa_records where qa_decision = 'Disqualified' and private.in_tf(qa_date, tf)),
    'qaTotal', (select count(*) from qa_records where private.in_tf(qa_date, tf)),
    'sqlsAssigned', (select count(*) from sql_assignments where sql_status = 'Assigned'),
    'won', (select count(*) from closer_deals where stage = 'Closed'),
    'lost', (select count(*) from closer_deals where stage = 'Closed Lost'),
    'fundedLeases', (select count(*) from leasing where funding_status = 'Funded'),
    'revenue', (select coalesce(sum(approved_funding), 0) from leasing where funding_status = 'Funded'),
    'approvedMids', (select count(*) from msp_onboarding where final_status = 'Approved'),
    'live', (select count(*) from fulfillment where fulfillment_stage = 'Live'),
    'lostAfterOnb', (select count(*) from retention where status in ('Churned','Cancelled')),
    'fatalCount', (select count(*) from msp_onboarding m where public.msp_is_fatal(m)),
    'cs', private.cs_metrics(tf),
    'stageCounts', (
      select coalesce(jsonb_agg(jsonb_build_object('stage', s.stage, 'n', s.n) order by s.n desc), '[]'::jsonb)
      from (select stage, count(*) as n from closer_deals group by stage) s
    ),
    'opsAll', (select count(*) from ops_verifications),
    'opsApproved', (select count(*) from ops_verifications where ops_status = 'Approved'),
    'opsDisapproved', (select count(*) from ops_verifications where ops_status = 'Disapproved'),
    'funnel', jsonb_build_array(
      jsonb_build_object('label', 'Leads Generated', 'count', (select count(*) from leads)),
      jsonb_build_object('label', 'QA Qualified', 'count', (select count(*) from qa_records where qa_decision = 'Qualified')),
      jsonb_build_object('label', 'SQL Assigned', 'count', (select count(*) from sql_assignments where sql_status = 'Assigned')),
      jsonb_build_object('label', 'Closed', 'count', (select count(*) from closer_deals where stage = 'Closed')),
      jsonb_build_object('label', 'Funded', 'count', (select count(*) from leasing where funding_status = 'Funded')),
      jsonb_build_object('label', 'Live Merchants', 'count', (select count(*) from fulfillment where fulfillment_stage = 'Live'))
    ),
    'leadSources', (
      select coalesce(jsonb_agg(jsonb_build_object('label', s.lead_source, 'count', s.n) order by s.n desc), '[]'::jsonb)
      from (select lead_source, count(*) as n from leads group by lead_source) s
    ),
    'mspRates', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.provider, 'rate', p.rate) order by p.rate desc), '[]'::jsonb)
      from (
        -- alias must not be named "result": it would clash with the plpgsql variable
        select provider, round(count(*) filter (where res = 'Yes')::numeric * 100 / count(*)) as rate
        from (
          select a1_provider as provider, a1_result as res from msp_onboarding where a1_provider <> ''
          union all
          select a2_provider, a2_result from msp_onboarding where a2_provider <> ''
          union all
          select a3_provider, a3_result from msp_onboarding where a3_provider <> ''
        ) attempts
        group by provider
      ) p
    ),
    'leaseRates', (
      select coalesce(jsonb_agg(jsonb_build_object('name', c.leasing_company, 'rate', c.rate) order by c.rate desc), '[]'::jsonb)
      from (
        select leasing_company, round(count(*) filter (where funding_status = 'Funded')::numeric * 100 / count(*)) as rate
        from leasing
        where leasing_company <> ''
        group by leasing_company
      ) c
    ),
    'dropOffs', jsonb_build_array(
      jsonb_build_object('label', 'Rejected at QA', 'n', (select count(*) from qa_records where qa_decision = 'Disqualified')),
      jsonb_build_object('label', 'Lost at Closer', 'n', (select count(*) from closer_deals where stage = 'Closed Lost')),
      jsonb_build_object('label', 'Disapproved at OPS', 'n', (select count(*) from ops_verifications where ops_status = 'Disapproved')),
      jsonb_build_object('label', 'Archived at Onboarding', 'n', (select count(*) from msp_onboarding where final_status = 'Archived')),
      jsonb_build_object('label', 'Churned or Cancelled', 'n', (select count(*) from retention where status in ('Churned','Cancelled')))
    ),
    'onbAll', (select count(*) from msp_onboarding),
    'onbApproved', (select count(*) from msp_onboarding where final_status = 'Approved'),
    'recent', (
      select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
      from (
        select lead_id, business_name, stage, closer, assigned_date
        from closer_deals
        order by assigned_date desc nulls last
        limit 8
      ) r
    )
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales KPIs
-- ---------------------------------------------------------------------------
create or replace function public.dash_sales_kpi(tf text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'qaTotal', (select count(*) from qa_records where private.in_tf(qa_date, tf)),
    'qualified', (select count(*) from qa_records where qa_decision = 'Qualified' and private.in_tf(qa_date, tf)),
    'decided', (select count(*) from closer_deals where stage in ('Closed','Closed Lost','Not Interested')),
    'won', (select count(*) from closer_deals where stage = 'Closed')
  );
$$;

-- ---------------------------------------------------------------------------
-- OPS KPIs
-- ---------------------------------------------------------------------------
create or replace function public.dash_ops_kpi(tf text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'opsTotal', (select count(*) from ops_verifications where private.in_tf(ops_date, tf)),
    'opsApproved', (select count(*) from ops_verifications where ops_status = 'Approved' and private.in_tf(ops_date, tf)),
    'reviewed', (select count(*) from ops_verifications where accuracy_review in ('Pass','Fail') and private.in_tf(ops_date, tf)),
    'passes', (select count(*) from ops_verifications where accuracy_review = 'Pass' and private.in_tf(ops_date, tf)),
    'onbTotal', (select count(*) from msp_onboarding where private.in_tf(ops_approved_date, tf)),
    'onbApproved', (select count(*) from msp_onboarding where final_status = 'Approved' and private.in_tf(ops_approved_date, tf)),
    'fatals', (select count(*) from msp_onboarding m where public.msp_is_fatal(m) and private.in_tf(m.ops_approved_date, tf)),
    'equipped', (select count(*) from msp_onboarding where equip_order_date is not null and delivery_date is not null and private.in_tf(ops_approved_date, tf)),
    'equip48', (select count(*) from msp_onboarding where equip_order_date is not null and delivery_date is not null and (delivery_date - equip_order_date) <= 2 and private.in_tf(ops_approved_date, tf)),
    'cs', private.cs_metrics(tf)
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------
create or replace function public.board_closers(tf text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.w desc, x.rate desc), '[]'::jsonb)
  from (
    select
      closer as name,
      count(*) filter (where private.in_tf(assigned_date, tf)) as a,
      count(*) filter (where stage = 'Closed' and private.in_tf(closed_date, tf)) as w,
      count(*) filter (where stage in ('Closed Lost', 'Not Interested') and private.in_tf(closed_date, tf)) as l,
      coalesce(sum(monthly_volume) filter (where stage = 'Closed' and private.in_tf(closed_date, tf)), 0) as vol,
      round(avg(closed_date - assigned_date) filter (
        where stage = 'Closed' and private.in_tf(closed_date, tf)
          and closed_date is not null and assigned_date is not null
      ) * 10) / 10 as avgd,
      case
        when count(*) filter (where stage in ('Closed','Closed Lost','Not Interested') and private.in_tf(closed_date, tf)) > 0
        then round(
          count(*) filter (where stage = 'Closed' and private.in_tf(closed_date, tf))::numeric * 100
          / count(*) filter (where stage in ('Closed','Closed Lost','Not Interested') and private.in_tf(closed_date, tf)))
        else 0
      end as rate
    from closer_deals
    where closer <> ''
    group by closer
  ) x
  where x.a > 0 or x.w > 0 or x.l > 0;
$$;

create or replace function public.board_leadgen(tf text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.leads desc, x.rate desc), '[]'::jsonb)
  from (
    select
      g.agent as name,
      coalesce(lg.n, 0) as leads,
      coalesce(q.q, 0) as q,
      coalesce(q.rej, 0) as rej,
      case when coalesce(q.q, 0) + coalesce(q.rej, 0) > 0
        then round(coalesce(q.q, 0)::numeric * 100 / (coalesce(q.q, 0) + coalesce(q.rej, 0)))
        else 0
      end as rate
    from (
      select lead_gen_agent as agent from leads where lead_gen_agent <> ''
      union
      select lead_gen_agent from qa_records where lead_gen_agent <> ''
    ) g
    left join (
      select lead_gen_agent, count(*) as n
      from leads
      where private.in_tf(date_created, tf)
      group by lead_gen_agent
    ) lg on lg.lead_gen_agent = g.agent
    left join (
      select lead_gen_agent,
        count(*) filter (where qa_decision = 'Qualified') as q,
        count(*) filter (where qa_decision = 'Disqualified') as rej
      from qa_records
      where private.in_tf(qa_date, tf)
      group by lead_gen_agent
    ) q on q.lead_gen_agent = g.agent
  ) x
  where x.leads > 0 or x.q > 0 or x.rej > 0;
$$;

create or replace function public.board_teams(tf text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.won desc, x.sqls desc, x.leads desc), '[]'::jsonb)
  from (
    select
      t.name as team,
      (select count(*) from leads l
        join profiles p on p.full_name = l.lead_gen_agent
        where p.team = t.name and private.in_tf(l.date_created, tf)) as leads,
      (select count(*) from sql_assignments s
        join leads l on l.lead_id = s.lead_id
        join profiles p on p.full_name = l.lead_gen_agent
        where p.team = t.name and s.sql_status = 'Assigned'
          and private.in_tf(s.assignment_date, tf)) as sqls,
      (select count(*) from closer_deals c
        join leads l on l.lead_id = c.lead_id
        join profiles p on p.full_name = l.lead_gen_agent
        where p.team = t.name and c.stage = 'Closed'
          and private.in_tf(c.closed_date, tf)) as won,
      (select count(*) from closer_deals c
        join leads l on l.lead_id = c.lead_id
        join profiles p on p.full_name = l.lead_gen_agent
        where p.team = t.name and c.stage in ('Closed Lost', 'Not Interested')
          and private.in_tf(c.closed_date, tf)) as lost
    from teams t
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- Fatal-flag list for the Onboarding tab (row tint)
-- ---------------------------------------------------------------------------
create or replace function public.msp_fatal_leads()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(m.lead_id), '[]'::jsonb)
  from public.msp_onboarding m
  where public.msp_is_fatal(m);
$$;

-- Grants
grant execute on function public.dash_ceo(text) to authenticated;
grant execute on function public.dash_sales_kpi(text) to authenticated;
grant execute on function public.dash_ops_kpi(text) to authenticated;
grant execute on function public.board_closers(text) to authenticated;
grant execute on function public.board_leadgen(text) to authenticated;
grant execute on function public.board_teams(text) to authenticated;
grant execute on function public.msp_fatal_leads() to authenticated;
