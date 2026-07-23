-- ============================================================================
-- TGT Nexus CRM — 85_ceo_data_source_mix.sql
-- Data Source Mix: only official Lead Gen sources (Cold Calling, Data
-- Scrapping, SEO, PPC, SMM). Merge typo aliases; drop closer-only labels.
-- Also normalizes legacy "Data Scrap" rows. Safe to re-run.
-- ============================================================================

-- Legacy typo → canonical
update public.leads
set lead_source = 'Data Scrapping'
where lower(trim(lead_source)) in ('data scrap', 'data scraping');

update public.qa_records
set lead_source = 'Data Scrapping'
where lower(trim(lead_source)) in ('data scrap', 'data scraping');

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
    'leads', (
      select count(*) from leads where private.in_tf(date_created, tf)
    ),
    'leadsLeadgen', (
      select count(*) from leads
      where lead_origin = 'leadgen' and private.in_tf(date_created, tf)
    ),
    'leadsCloserDirect', (
      select count(*) from leads
      where lead_origin = 'closer_direct' and private.in_tf(date_created, tf)
    ),
    'leadsOpsManual', (
      select count(*) from leads
      where lead_origin = 'ops_manual' and private.in_tf(date_created, tf)
    ),
    'qaQualified', (
      select count(*) from qa_records
      where qa_decision = 'Qualified' and private.in_tf(qa_date, tf)
    ),
    'qaRejected', (
      select count(*) from qa_records
      where qa_decision = 'Disqualified' and private.in_tf(qa_date, tf)
    ),
    'qaTotal', (
      select count(*) from qa_records where private.in_tf(qa_date, tf)
    ),
    'sqlsAssigned', (
      select count(*) from sql_assignments
      where sql_status = 'Assigned' and private.in_tf(assignment_date, tf)
    ),
    'won', (
      select count(*) from closer_deals
      where stage = 'Closed' and private.in_tf(closed_date, tf)
    ),
    'lost', (
      select count(*) from closer_deals
      where stage = 'Closed Lost' and private.in_tf(closed_date, tf)
    ),
    'fundedLeases', (
      select count(*) from leasing
      where funding_status = 'Funded'
        and private.in_tf(coalesce(funding_date, order_activation), tf)
    ),
    'revenue', (
      select coalesce(sum(monthly_lease), 0) from leasing
      where funding_status = 'Funded'
        and private.in_tf(coalesce(funding_date, order_activation), tf)
    ),
    'approvedMids', (
      select count(*) from msp_onboarding
      where final_status = 'Approved' and private.in_tf(ops_approved_date, tf)
    ),
    'live', (
      select count(*) from fulfillment
      where fulfillment_stage = 'Live' and private.in_tf(live_date, tf)
    ),
    'lostAfterOnb', (
      select count(*) from retention
      where status in ('Churned', 'Cancelled')
        and private.in_tf((created_at at time zone 'Asia/Karachi')::date, tf)
    ),
    'fatalCount', (
      select count(*) from msp_onboarding m
      where public.msp_is_fatal(m) and private.in_tf(m.ops_approved_date, tf)
    ),
    'cs', private.cs_metrics(tf),
    'stageCounts', (
      select coalesce(
        jsonb_agg(jsonb_build_object('stage', s.stage, 'n', s.n) order by s.n desc),
        '[]'::jsonb
      )
      from (
        select stage, count(*) as n
        from closer_deals
        where private.in_tf(coalesce(closed_date, assigned_date), tf)
        group by stage
      ) s
    ),
    'opsAll', (
      select count(*) from ops_verifications where private.in_tf(ops_date, tf)
    ),
    'opsApproved', (
      select count(*) from ops_verifications
      where ops_status = 'Approved' and private.in_tf(ops_date, tf)
    ),
    'opsDisapproved', (
      select count(*) from ops_verifications
      where ops_status = 'Disapproved' and private.in_tf(ops_date, tf)
    ),
    'funnel', jsonb_build_array(
      jsonb_build_object(
        'label', 'Leads Generated',
        'count', (select count(*) from leads where private.in_tf(date_created, tf))
      ),
      jsonb_build_object(
        'label', 'QA Qualified',
        'count', (
          select count(*) from qa_records
          where qa_decision = 'Qualified' and private.in_tf(qa_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'SQL Assigned',
        'count', (
          select count(*) from sql_assignments
          where sql_status = 'Assigned' and private.in_tf(assignment_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'Closed',
        'count', (
          select count(*) from closer_deals
          where stage = 'Closed' and private.in_tf(closed_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'MSP Approved',
        'count', (
          select count(*) from msp_onboarding
          where final_status = 'Approved' and private.in_tf(ops_approved_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'Funded',
        'count', (
          select count(*) from leasing
          where funding_status = 'Funded'
            and private.in_tf(coalesce(funding_date, order_activation), tf)
        )
      ),
      jsonb_build_object(
        'label', 'Live Merchants',
        'count', (
          select count(*) from fulfillment
          where fulfillment_stage = 'Live' and private.in_tf(live_date, tf)
        )
      )
    ),
    'leadSources', (
      select coalesce(
        jsonb_agg(jsonb_build_object('label', s.canon, 'count', s.n) order by s.n desc),
        '[]'::jsonb
      )
      from (
        select canon, count(*) as n
        from (
          select case
            when lower(trim(lead_source)) in ('data scrap', 'data scraping', 'data scrapping')
              then 'Data Scrapping'
            when trim(lead_source) in ('Cold Calling', 'SEO', 'PPC', 'SMM')
              then trim(lead_source)
            else null
          end as canon
          from leads
          where private.in_tf(date_created, tf)
        ) x
        where canon is not null
        group by canon
      ) s
    ),
    'mspRates', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', p.provider, 'rate', p.rate) order by p.rate desc),
        '[]'::jsonb
      )
      from (
        select
          provider,
          round(count(*) filter (where res = 'Yes')::numeric * 100 / nullif(count(*), 0)) as rate
        from (
          select a1_provider as provider, a1_result as res
          from msp_onboarding
          where a1_provider <> '' and private.in_tf(ops_approved_date, tf)
          union all
          select a2_provider, a2_result
          from msp_onboarding
          where a2_provider <> '' and private.in_tf(ops_approved_date, tf)
          union all
          select a3_provider, a3_result
          from msp_onboarding
          where a3_provider <> '' and private.in_tf(ops_approved_date, tf)
        ) attempts
        group by provider
      ) p
      where p.rate is not null
    ),
    'leaseRates', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', c.leasing_company, 'rate', c.rate) order by c.rate desc),
        '[]'::jsonb
      )
      from (
        select
          leasing_company,
          round(
            count(*) filter (where funding_status = 'Funded')::numeric * 100
            / nullif(count(*), 0)
          ) as rate
        from leasing
        where leasing_company <> ''
          and private.in_tf(coalesce(funding_date, order_activation), tf)
        group by leasing_company
      ) c
      where c.rate is not null
    ),
    'dropOffs', jsonb_build_array(
      jsonb_build_object(
        'label', 'Rejected at QA',
        'n', (
          select count(*) from qa_records
          where qa_decision = 'Disqualified' and private.in_tf(qa_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'Lost at Closer',
        'n', (
          select count(*) from closer_deals
          where stage = 'Closed Lost' and private.in_tf(closed_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'Disapproved at OPS',
        'n', (
          select count(*) from ops_verifications
          where ops_status = 'Disapproved' and private.in_tf(ops_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'Archived at Onboarding',
        'n', (
          select count(*) from msp_onboarding
          where final_status = 'Archived' and private.in_tf(ops_approved_date, tf)
        )
      ),
      jsonb_build_object(
        'label', 'Churned or Cancelled',
        'n', (
          select count(*) from retention
          where status in ('Churned', 'Cancelled')
            and private.in_tf((created_at at time zone 'Asia/Karachi')::date, tf)
        )
      )
    ),
    'onbAll', (
      select count(*) from msp_onboarding where private.in_tf(ops_approved_date, tf)
    ),
    'onbApproved', (
      select count(*) from msp_onboarding
      where final_status = 'Approved' and private.in_tf(ops_approved_date, tf)
    ),
    'recent', (
      select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
      from (
        select lead_id, business_name, stage, closer, assigned_date
        from closer_deals
        where private.in_tf(coalesce(closed_date, assigned_date), tf)
        order by assigned_date desc nulls last
        limit 8
      ) r
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.dash_ceo(text) to authenticated;
