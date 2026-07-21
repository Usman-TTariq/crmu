-- ============================================================================
-- TGT Nexus CRM — 42_counselling_person_work.sql
-- Clickable work lists for every role: leads / QA / closer / docs / OPS / onboard / CS.
-- Also extends journey totals. Safe to re-run. Needs sql/39 (+41 optional).
-- ============================================================================

-- Extra totals on person journey
create or replace function public.counselling_person_journey(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  day1 date;
  today_k date := (now() at time zone 'Asia/Karachi')::date;
  tenure int;
  zoom_from date;
begin
  if not private.counselling_allowed() then
    raise exception 'Stats Counselling is restricted to CEO / Super Admin / Sales Head.';
  end if;

  select * into p from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'Profile not found.';
  end if;
  if p.role_key in ('ceo', 'super_admin') or not private.counselling_role_ok(p.role_key) then
    raise exception 'This person is outside your counselling scope.';
  end if;

  day1 := (p.created_at at time zone 'Asia/Karachi')::date;
  tenure := greatest(0, today_k - day1);
  zoom_from := greatest(day1, today_k - 29);

  return jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'full_name', p.full_name,
    'title', p.title,
    'team', p.team,
    'role_key', p.role_key,
    'day1', day1,
    'today', today_k,
    'tenure_days', tenure,
    'totals', jsonb_build_object(
      'leads', (
        select count(*)::int from public.leads l
        where l.lead_gen_agent = p.full_name
          and l.date_created >= day1 and l.date_created <= today_k
      ),
      'qa_qualified', (
        select count(*)::int from public.qa_records q
        where q.qa_agent = p.full_name
          and q.qa_decision = 'Qualified'
          and q.qa_date >= day1 and q.qa_date <= today_k
      ),
      'qa_disqualified', (
        select count(*)::int from public.qa_records q
        where q.qa_agent = p.full_name
          and q.qa_decision = 'Disqualified'
          and q.qa_date >= day1 and q.qa_date <= today_k
      ),
      'qa_decided', (
        select count(*)::int from public.qa_records q
        where q.qa_agent = p.full_name
          and q.qa_decision in ('Qualified', 'Disqualified')
          and q.qa_date >= day1 and q.qa_date <= today_k
      ),
      'closer_assigned', (
        select count(*)::int from public.closer_deals c
        where c.closer = p.full_name
          and c.assigned_date >= day1 and c.assigned_date <= today_k
      ),
      'closer_wins', (
        select count(*)::int from public.closer_deals c
        where c.closer = p.full_name
          and c.stage in ('Closed', 'Closed Won')
          and c.closed_date >= day1 and c.closed_date <= today_k
      ),
      'closer_lost', (
        select count(*)::int from public.closer_deals c
        where c.closer = p.full_name
          and c.stage in ('Closed Lost', 'Not Interested')
          and c.closed_date >= day1 and c.closed_date <= today_k
      ),
      'docs_reviewed', (
        select count(*)::int from public.documentation_reviews d
        where d.pm_name = p.full_name
          and coalesce(d.review_date, d.created_at::date) >= day1
          and coalesce(d.review_date, d.created_at::date) <= today_k
      ),
      'ops_decided', (
        select count(*)::int from public.ops_verifications o
        where o.ops_agent = p.full_name
          and o.ops_status in ('Approved', 'Disapproved')
          and coalesce(o.ops_date, o.created_at::date) >= day1
          and coalesce(o.ops_date, o.created_at::date) <= today_k
      ),
      'onboard_handled', (
        select count(*)::int from public.msp_onboarding m
        where m.onboarding_sp = p.full_name
          and m.created_at::date >= day1 and m.created_at::date <= today_k
      ),
      'cs_cases', (
        select count(*)::int from public.retention r
        where (r.agent_name = p.full_name or r.substitute = p.full_name)
          and r.created_at::date >= day1 and r.created_at::date <= today_k
      ),
      'working_seconds', (
        select coalesce(sum(pd.working_seconds), 0)::bigint
        from public.presence_day pd
        where pd.user_id = p.user_id and pd.day >= day1 and pd.day <= today_k
      ),
      'break_seconds', (
        select coalesce(sum(coalesce(pd.break_seconds, 0)), 0)::bigint
        from public.presence_day pd
        where pd.user_id = p.user_id and pd.day >= day1 and pd.day <= today_k
      ),
      'away_seconds', (
        select coalesce(sum(pd.away_seconds + pd.idle_seconds), 0)::bigint
        from public.presence_day pd
        where pd.user_id = p.user_id and pd.day >= day1 and pd.day <= today_k
      )
    ),
    'output_weeks', (
      select coalesce(jsonb_agg(row_to_json(w)::jsonb order by w.week_start), '[]'::jsonb)
      from (
        select
          gs::date as week_start,
          (
            select count(*)::int from public.leads l
            where l.lead_gen_agent = p.full_name
              and l.date_created >= gs::date and l.date_created < gs::date + 7
          ) as leads,
          (
            select count(*)::int from public.qa_records q
            where q.qa_agent = p.full_name and q.qa_decision = 'Qualified'
              and q.qa_date >= gs::date and q.qa_date < gs::date + 7
          ) as qa_q,
          (
            select count(*)::int from public.qa_records q
            where q.qa_agent = p.full_name and q.qa_decision = 'Disqualified'
              and q.qa_date >= gs::date and q.qa_date < gs::date + 7
          ) as qa_rej,
          (
            select count(*)::int from public.closer_deals c
            where c.closer = p.full_name and c.stage in ('Closed', 'Closed Won')
              and c.closed_date >= gs::date and c.closed_date < gs::date + 7
          ) as wins,
          (
            select count(*)::int from public.closer_deals c
            where c.closer = p.full_name and c.stage in ('Closed Lost', 'Not Interested')
              and c.closed_date >= gs::date and c.closed_date < gs::date + 7
          ) as lost
        from generate_series(
          date_trunc('week', day1::timestamp)::date,
          date_trunc('week', today_k::timestamp)::date,
          interval '7 days'
        ) gs
        where gs::date >= greatest(
          date_trunc('week', day1::timestamp)::date,
          date_trunc('week', (today_k - 364)::timestamp)::date
        )
      ) w
    ),
    'attendance_days', (
      select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.day), '[]'::jsonb)
      from (
        select
          pd.day,
          pd.working_seconds,
          coalesce(pd.break_seconds, 0) as break_seconds,
          (pd.away_seconds + pd.idle_seconds) as away_seconds
        from public.presence_day pd
        where pd.user_id = p.user_id
          and pd.day >= zoom_from and pd.day <= today_k
        order by pd.day
      ) d
    ),
    'attendance_months', (
      select coalesce(jsonb_agg(row_to_json(m)::jsonb order by m.month_start), '[]'::jsonb)
      from (
        select
          date_trunc('month', pd.day)::date as month_start,
          sum(pd.working_seconds)::bigint as working_seconds,
          sum(coalesce(pd.break_seconds, 0))::bigint as break_seconds,
          sum(pd.away_seconds + pd.idle_seconds)::bigint as away_seconds
        from public.presence_day pd
        where pd.user_id = p.user_id
          and pd.day >= day1 and pd.day <= today_k
        group by 1
      ) m
    )
  );
end;
$$;

grant execute on function public.counselling_person_journey(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Work detail lists by kind
-- p_kind: leads | qa | closer | docs | ops | onboard | cs
-- ---------------------------------------------------------------------------
create or replace function public.counselling_person_work(p_profile_id uuid, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  day1 date;
  today_k date := (now() at time zone 'Asia/Karachi')::date;
  kind text := lower(trim(coalesce(p_kind, '')));
  items jsonb := '[]'::jsonb;
begin
  if not private.counselling_allowed() then
    raise exception 'Stats Counselling is restricted to CEO / Super Admin / Sales Head.';
  end if;

  select * into p from public.profiles where id = p_profile_id;
  if not found then raise exception 'Profile not found.'; end if;
  if p.role_key in ('ceo', 'super_admin') or not private.counselling_role_ok(p.role_key) then
    raise exception 'This person is outside your counselling scope.';
  end if;

  day1 := (p.created_at at time zone 'Asia/Karachi')::date;

  if kind = 'leads' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_date desc, x.lead_id desc), '[]'::jsonb)
      into items
    from (
      select
        l.lead_id,
        l.date_created as sort_date,
        l.date_created,
        l.lead_source,
        l.business_name,
        l.owner_name,
        l.phone,
        l.email,
        l.business_address,
        l.city,
        l.zip_code,
        l.state,
        l.current_processor,
        l.current_device,
        l.current_rate,
        l.monthly_volume,
        l.notes,
        coalesce(q.qa_decision, 'Not in QA') as qa_outcome,
        coalesce(q.qa_agent, '') as qa_agent,
        q.qa_date,
        coalesce(q.qa_notes, '') as qa_notes
      from public.leads l
      left join public.qa_records q on q.lead_id = l.lead_id
      where l.lead_gen_agent = p.full_name
        and l.date_created >= day1 and l.date_created <= today_k
    ) x;

  elsif kind = 'qa' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_date desc nulls last, x.lead_id desc), '[]'::jsonb)
      into items
    from (
      select
        q.lead_id,
        q.qa_date as sort_date,
        q.qa_date,
        q.qa_decision,
        q.qa_agent,
        coalesce(q.qa_notes, '') as qa_notes,
        q.lead_gen_agent,
        q.lead_source,
        q.business_name,
        q.owner_name,
        q.phone,
        coalesce(q.email, '') as email,
        coalesce(q.business_address, '') as business_address,
        coalesce(q.city, '') as city,
        coalesce(q.zip_code, '') as zip_code,
        q.state,
        q.monthly_volume,
        coalesce(q.notes, '') as notes,
        q.us_business,
        q.owner_reached,
        q.interested,
        q.physical_loc,
        q.not_restricted
      from public.qa_records q
      where q.qa_agent = p.full_name
        and q.qa_decision in ('Qualified', 'Disqualified')
        and q.qa_date >= day1 and q.qa_date <= today_k
    ) x;

  elsif kind = 'closer' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_date desc nulls last, x.lead_id desc), '[]'::jsonb)
      into items
    from (
      select
        c.lead_id,
        coalesce(c.closed_date, c.assigned_date, c.created_at::date) as sort_date,
        c.assigned_date,
        c.closed_date,
        c.stage,
        c.closer,
        c.business_name,
        c.owner_name,
        c.phone,
        c.monthly_volume,
        coalesce(c.lost_reason, '') as lost_reason,
        coalesce(c.notes, '') as notes,
        c.connected_date,
        c.docs_pending_date,
        c.docs_recd_date
      from public.closer_deals c
      where c.closer = p.full_name
        and (
          (c.assigned_date >= day1 and c.assigned_date <= today_k)
          or (c.closed_date >= day1 and c.closed_date <= today_k)
        )
    ) x;

  elsif kind = 'docs' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_date desc nulls last, x.lead_id desc), '[]'::jsonb)
      into items
    from (
      select
        d.lead_id,
        coalesce(d.review_date, d.created_at::date) as sort_date,
        d.review_date,
        d.decision,
        d.pm_name,
        d.business_name,
        d.owner_name,
        d.phone,
        d.closer,
        d.monthly_volume,
        coalesce(d.fail_reason, '') as fail_reason,
        coalesce(d.notes, '') as notes
      from public.documentation_reviews d
      where d.pm_name = p.full_name
        and coalesce(d.review_date, d.created_at::date) >= day1
        and coalesce(d.review_date, d.created_at::date) <= today_k
    ) x;

  elsif kind = 'ops' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_date desc nulls last, x.lead_id desc), '[]'::jsonb)
      into items
    from (
      select
        o.lead_id,
        coalesce(o.ops_date, o.created_at::date) as sort_date,
        o.ops_date,
        o.ops_status,
        o.ops_agent,
        o.business_name,
        o.owner_name,
        o.phone,
        o.closer,
        o.brand,
        o.monthly_volume,
        coalesce(o.reasoning, '') as reasoning,
        coalesce(o.notes, '') as notes,
        o.accuracy_review
      from public.ops_verifications o
      where o.ops_agent = p.full_name
        and o.ops_status in ('Approved', 'Disapproved')
        and coalesce(o.ops_date, o.created_at::date) >= day1
        and coalesce(o.ops_date, o.created_at::date) <= today_k
    ) x;

  elsif kind = 'onboard' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_date desc nulls last, x.lead_id desc), '[]'::jsonb)
      into items
    from (
      select
        m.lead_id,
        m.created_at::date as sort_date,
        m.onboarding_sp,
        m.business_name,
        m.owner_name,
        m.monthly_volume,
        m.final_status,
        m.a1_result,
        m.a2_result,
        m.a3_result,
        coalesce(m.final_reasoning, '') as final_reasoning,
        coalesce(m.notes, '') as notes,
        m.device,
        m.tracking_number
      from public.msp_onboarding m
      where m.onboarding_sp = p.full_name
        and m.created_at::date >= day1 and m.created_at::date <= today_k
    ) x;

  elsif kind = 'cs' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_date desc nulls last, x.lead_id desc), '[]'::jsonb)
      into items
    from (
      select
        r.lead_id,
        r.created_at::date as sort_date,
        r.business_name,
        r.team,
        r.agent_name,
        r.substitute,
        r.status,
        coalesce(r.handover_notes, '') as handover_notes
      from public.retention r
      where (r.agent_name = p.full_name or r.substitute = p.full_name)
        and r.created_at::date >= day1 and r.created_at::date <= today_k
    ) x;

  else
    raise exception 'Unknown work kind. Use leads, qa, closer, docs, ops, onboard, or cs.';
  end if;

  return jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'kind', kind,
    'day1', day1,
    'today', today_k,
    'items', coalesce(items, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.counselling_person_work(uuid, text) to authenticated;

-- Widen CEO roster already via counselling_role_ok; ensure sales_head also sees QA agents (already) and project_manager / ops if needed for counselling — keep sales floor; CEO sees all.
