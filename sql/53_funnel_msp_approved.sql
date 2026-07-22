-- ============================================================================
-- TGT Nexus CRM — 53_funnel_msp_approved.sql
-- CEO conversion funnel: insert MSP Approved between Closed and Funded.
-- Safe to re-run (replaces dash_ceo).
-- ============================================================================

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
      jsonb_build_object('label', 'MSP Approved', 'count', (select count(*) from msp_onboarding where final_status = 'Approved')),
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

grant execute on function public.dash_ceo(text) to authenticated;
