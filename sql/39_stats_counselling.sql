-- ============================================================================
-- TGT Nexus CRM — 39_stats_counselling.sql
-- Stats Counselling: team summary + person Day-1 → today journey.
-- Access: ceo / super_admin / sales_head only.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

create or replace function private.counselling_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.role_key() in ('ceo', 'super_admin', 'sales_head');
$$;

-- Sales-floor roles visible to sales_head (same spirit as presence board + QA).
create or replace function private.counselling_role_ok(p_role text)
returns boolean
language sql
stable
as $$
  select case
    when private.role_key() in ('ceo', 'super_admin') then true
    when private.role_key() = 'sales_head' then p_role in (
      'lg_agent', 'lg_sup', 'qa_agent', 'closer', 'floor_manager', 'avp_sales'
    )
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Roster of people who can be counselled
-- ---------------------------------------------------------------------------
create or replace function public.counselling_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.counselling_allowed() then
    raise exception 'Stats Counselling is restricted to CEO / Super Admin / Sales Head.';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.full_name), '[]'::jsonb)
    from (
      select
        p.id,
        p.user_id,
        p.full_name,
        p.title,
        p.team,
        p.role_key,
        p.created_at,
        (p.created_at at time zone 'Asia/Karachi')::date as day1
      from public.profiles p
      where p.is_active = true
        and p.user_id is not null
        and p.role_key not in ('ceo', 'super_admin')
        and private.counselling_role_ok(p.role_key)
    ) x
  );
end;
$$;

grant execute on function public.counselling_roster() to authenticated;

-- ---------------------------------------------------------------------------
-- Team-wide summary for the selected timeframe
-- ---------------------------------------------------------------------------
create or replace function public.counselling_team_summary(p_tf text default 'All time')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tf text := coalesce(nullif(trim(p_tf), ''), 'All time');
  names text[];
begin
  if not private.counselling_allowed() then
    raise exception 'Stats Counselling is restricted to CEO / Super Admin / Sales Head.';
  end if;

  select coalesce(array_agg(p.full_name), array[]::text[])
    into names
  from public.profiles p
  where p.is_active = true
    and p.user_id is not null
    and p.role_key not in ('ceo', 'super_admin')
    and private.counselling_role_ok(p.role_key);

  return jsonb_build_object(
    'tf', tf,
    'people', coalesce(cardinality(names), 0),
    'leads', (
      select count(*)::int from public.leads l
      where l.lead_gen_agent = any (names)
        and private.in_tf(l.date_created, tf)
    ),
    'qa_qualified', (
      select count(*)::int from public.qa_records q
      where q.qa_agent = any (names)
        and q.qa_decision = 'Qualified'
        and private.in_tf(q.qa_date, tf)
    ),
    'qa_disqualified', (
      select count(*)::int from public.qa_records q
      where q.qa_agent = any (names)
        and q.qa_decision = 'Disqualified'
        and private.in_tf(q.qa_date, tf)
    ),
    'closer_wins', (
      select count(*)::int from public.closer_deals c
      where c.closer = any (names)
        and c.stage in ('Closed', 'Closed Won')
        and private.in_tf(c.closed_date, tf)
    ),
    'closer_lost', (
      select count(*)::int from public.closer_deals c
      where c.closer = any (names)
        and c.stage in ('Closed Lost', 'Not Interested')
        and private.in_tf(c.closed_date, tf)
    ),
    'working_seconds', (
      select coalesce(sum(pd.working_seconds), 0)::bigint
      from public.presence_day pd
      join public.profiles p on p.user_id = pd.user_id
      where p.full_name = any (names)
        and private.in_tf(pd.day, tf)
    ),
    'break_seconds', (
      select coalesce(sum(coalesce(pd.break_seconds, 0)), 0)::bigint
      from public.presence_day pd
      join public.profiles p on p.user_id = pd.user_id
      where p.full_name = any (names)
        and private.in_tf(pd.day, tf)
    ),
    'away_seconds', (
      select coalesce(sum(pd.away_seconds + pd.idle_seconds), 0)::bigint
      from public.presence_day pd
      join public.profiles p on p.user_id = pd.user_id
      where p.full_name = any (names)
        and private.in_tf(pd.day, tf)
    ),
    'by_person', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.leads desc, x.wins desc, x.name), '[]'::jsonb)
      from (
        select
          p.full_name as name,
          p.role_key,
          p.team,
          (
            select count(*)::int from public.leads l
            where l.lead_gen_agent = p.full_name
              and private.in_tf(l.date_created, tf)
          ) as leads,
          (
            select count(*)::int from public.qa_records q
            where q.qa_agent = p.full_name
              and q.qa_decision = 'Qualified'
              and private.in_tf(q.qa_date, tf)
          ) as qa_q,
          (
            select count(*)::int from public.qa_records q
            where q.qa_agent = p.full_name
              and q.qa_decision = 'Disqualified'
              and private.in_tf(q.qa_date, tf)
          ) as qa_rej,
          (
            select count(*)::int from public.closer_deals c
            where c.closer = p.full_name
              and c.stage in ('Closed', 'Closed Won')
              and private.in_tf(c.closed_date, tf)
          ) as wins,
          (
            select count(*)::int from public.closer_deals c
            where c.closer = p.full_name
              and c.stage in ('Closed Lost', 'Not Interested')
              and private.in_tf(c.closed_date, tf)
          ) as lost,
          (
            select coalesce(sum(pd.working_seconds), 0)::bigint
            from public.presence_day pd
            where pd.user_id = p.user_id
              and private.in_tf(pd.day, tf)
          ) as working_seconds
        from public.profiles p
        where p.is_active = true
          and p.user_id is not null
          and p.role_key not in ('ceo', 'super_admin')
          and private.counselling_role_ok(p.role_key)
      ) x
    )
  );
end;
$$;

grant execute on function public.counselling_team_summary(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Person journey: Day 1 (profile created_at) → today
-- ---------------------------------------------------------------------------
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
  -- Dense daily bars for recent window; weekly series covers full tenure.
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
              and l.date_created >= gs::date
              and l.date_created < gs::date + 7
          ) as leads,
          (
            select count(*)::int from public.qa_records q
            where q.qa_agent = p.full_name
              and q.qa_decision = 'Qualified'
              and q.qa_date >= gs::date
              and q.qa_date < gs::date + 7
          ) as qa_q,
          (
            select count(*)::int from public.qa_records q
            where q.qa_agent = p.full_name
              and q.qa_decision = 'Disqualified'
              and q.qa_date >= gs::date
              and q.qa_date < gs::date + 7
          ) as qa_rej,
          (
            select count(*)::int from public.closer_deals c
            where c.closer = p.full_name
              and c.stage in ('Closed', 'Closed Won')
              and c.closed_date >= gs::date
              and c.closed_date < gs::date + 7
          ) as wins,
          (
            select count(*)::int from public.closer_deals c
            where c.closer = p.full_name
              and c.stage in ('Closed Lost', 'Not Interested')
              and c.closed_date >= gs::date
              and c.closed_date < gs::date + 7
          ) as lost
        from generate_series(
          date_trunc('week', day1::timestamp)::date,
          date_trunc('week', today_k::timestamp)::date,
          interval '7 days'
        ) gs
        -- Cap very long tenures to last ~52 weeks for chart readability
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
          and pd.day >= zoom_from
          and pd.day <= today_k
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
          and pd.day >= day1
          and pd.day <= today_k
        group by 1
      ) m
    )
  );
end;
$$;

grant execute on function public.counselling_person_journey(uuid) to authenticated;
