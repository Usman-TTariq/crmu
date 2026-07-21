-- ============================================================================
-- TGT Nexus CRM — 41_counselling_person_leads.sql
-- Stats Counselling: full lead list for a person (Day 1 → today) with QA outcome.
-- Safe to re-run. Requires sql/39_stats_counselling.sql helpers.
-- ============================================================================

create or replace function public.counselling_person_leads(p_profile_id uuid)
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

  return jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'day1', day1,
    'today', today_k,
    'leads', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.date_created desc, x.created_at desc), '[]'::jsonb)
      from (
        select
          l.lead_id,
          l.date_created,
          l.created_at,
          l.updated_at,
          l.lead_gen_agent,
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
          q.qa_notes
        from public.leads l
        left join public.qa_records q on q.lead_id = l.lead_id
        where l.lead_gen_agent = p.full_name
          and l.date_created >= day1
          and l.date_created <= today_k
      ) x
    )
  );
end;
$$;

grant execute on function public.counselling_person_leads(uuid) to authenticated;
