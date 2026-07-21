-- ============================================================================
-- TGT Nexus CRM — 50_team_captain.sql
-- Team Captain: same team-scoped Lead Gen access as Lead Gen Supervisor.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

create or replace function private.is_lg_team_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.role_key() in ('lg_sup', 'team_captain');
$$;

-- ---------------------------------------------------------------------------
-- leads / sql (keep floor_manager + finance pipeline_viewer from sql/43–44)
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
    or (private.is_lg_team_lead() and lead_gen_agent in (
         select full_name from public.profiles where team = private.my_team()
       ))
  );

drop policy if exists sql_select on public.sql_assignments;
create policy sql_select on public.sql_assignments
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.role_key() = 'floor_manager'
    or (private.is_lg_team_lead() and exists (
      select 1 from public.leads l
      join public.profiles p on p.full_name = l.lead_gen_agent
      where l.lead_id = sql_assignments.lead_id
        and p.team = private.my_team()
    ))
  );

-- ---------------------------------------------------------------------------
-- QA disputes
-- ---------------------------------------------------------------------------
drop policy if exists qa_disputes_select on public.qa_disputes;
create policy qa_disputes_select on public.qa_disputes
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or (private.role_key() = 'lg_agent' and opened_by = private.identity())
    or (private.is_lg_team_lead() and team = private.my_team())
  );

create or replace function public.dispute_review(p_dispute_id uuid, p_decision text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me text;
  my_role text;
  my_team text;
  d public.qa_disputes%rowtype;
  decision text := lower(trim(coalesce(p_decision, '')));
  note text := left(trim(coalesce(p_note, '')), 2000);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  me := private.identity();
  my_role := private.role_key();
  my_team := coalesce(private.my_team(), '');

  if not private.is_lg_team_lead() and not private.sales_writer() then
    raise exception 'Only Lead Gen supervisors or team captains can review disputes.';
  end if;
  if decision not in ('approved', 'disapproved') then
    raise exception 'Decision must be approved or disapproved.';
  end if;

  select * into d from public.qa_disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found.'; end if;
  if d.status is distinct from 'open' then
    raise exception 'This dispute was already reviewed.';
  end if;
  if private.is_lg_team_lead() and not private.sales_writer()
     and d.team is distinct from my_team then
    raise exception 'You can only review disputes for your team.';
  end if;

  update public.qa_disputes
  set status = decision,
      reviewed_by = me,
      reviewed_at = now(),
      review_note = note,
      updated_at = now()
  where id = p_dispute_id;

  if decision = 'approved' then
    update public.qa_records
    set qa_decision = 'Pending',
        returned_after_dispute = true,
        qa_agent = '',
        updated_at = now()
    where lead_id = d.lead_id;
  end if;

  return jsonb_build_object(
    'id', p_dispute_id,
    'lead_id', d.lead_id,
    'status', decision
  );
end;
$$;

grant execute on function public.dispute_review(uuid, text, text) to authenticated;

create or replace function public.dispute_list_open()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_role text := private.role_key();
  my_team text := coalesce(private.my_team(), '');
  me text := private.identity();
begin
  if private.is_lg_team_lead() or private.sales_writer() then
    return (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
      from (
        select
          d.id,
          d.lead_id,
          d.opened_by,
          d.team,
          d.reason,
          d.status,
          d.created_at,
          coalesce(l.business_name, q.business_name, '') as business_name,
          coalesce(l.owner_name, q.owner_name, '') as owner_name
        from public.qa_disputes d
        left join public.leads l on l.lead_id = d.lead_id
        left join public.qa_records q on q.lead_id = d.lead_id
        where d.status = 'open'
          and (private.sales_writer() or d.team = my_team)
      ) x
    );
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
    from (
      select
        d.id,
        d.lead_id,
        d.opened_by,
        d.team,
        d.reason,
        d.status,
        d.created_at,
        coalesce(l.business_name, q.business_name, '') as business_name,
        coalesce(l.owner_name, q.owner_name, '') as owner_name
      from public.qa_disputes d
      left join public.leads l on l.lead_id = d.lead_id
      left join public.qa_records q on q.lead_id = d.lead_id
      where d.status = 'open'
        and d.opened_by = me
    ) x
  );
end;
$$;

grant execute on function public.dispute_list_open() to authenticated;

-- ---------------------------------------------------------------------------
-- Lead notes (team leads may update team notes)
-- ---------------------------------------------------------------------------
create or replace function public.lead_notes_update(p_lead_id text, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me text;
  my_role text;
  lead public.leads%rowtype;
  notes text := left(coalesce(p_notes, ''), 8000);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  me := private.identity();
  my_role := private.role_key();

  select * into lead from public.leads where lead_id = p_lead_id for update;
  if not found then raise exception 'Lead not found.'; end if;

  if private.sales_writer() then
    null;
  elsif my_role = 'lg_agent' and lead.lead_gen_agent = me then
    null;
  elsif private.is_lg_team_lead() and lead.lead_gen_agent in (
    select full_name from public.profiles where team = private.my_team()
  ) then
    null;
  else
    raise exception 'You can only update notes on your own leads.';
  end if;

  begin
    update public.leads
    set notes = notes,
        updated_by = uid,
        updated_at = now()
    where lead_id = p_lead_id;
  exception
    when undefined_column then
      update public.leads
      set notes = notes,
          updated_at = now()
      where lead_id = p_lead_id;
  end;

  update public.qa_records
  set notes = notes,
      updated_at = now()
  where lead_id = p_lead_id;

  return jsonb_build_object('lead_id', p_lead_id, 'notes', notes);
end;
$$;

grant execute on function public.lead_notes_update(text, text) to authenticated;

-- Comments: team captains can read/write on team leads (mirror lg_sup; keep sql/44 branches)
create or replace function private.can_access_lead_comments(p_lead_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.leads l where l.lead_id = p_lead_id)
    and (
      private.is_admin()
      or private.sales_reader()
      or private.is_ops_manager()
      or private.pipeline_viewer()
      or private.role_key() in (
        'floor_manager', 'ops_verifier', 'ops_qa_onb', 'onboarding_lead', 'cs_head', 'cs_lead',
        'project_manager'
      )
      or (
        private.role_key() = 'lg_agent'
        and exists (
          select 1 from public.leads l
          where l.lead_id = p_lead_id and l.lead_gen_agent = private.identity()
        )
      )
      or (
        private.is_lg_team_lead()
        and exists (
          select 1 from public.leads l
          join public.profiles p on p.full_name = l.lead_gen_agent
          where l.lead_id = p_lead_id and p.team = private.my_team()
        )
      )
      or (
        private.role_key() = 'qa_agent'
        and exists (
          select 1 from public.qa_records q
          where q.lead_id = p_lead_id and q.qa_agent = private.identity()
        )
      )
      or (
        private.role_key() = 'closer'
        and exists (
          select 1 from public.closer_deals c
          where c.lead_id = p_lead_id and c.closer = private.identity()
        )
      )
      or (
        private.role_key() = 'ops_qa_agent'
        and exists (
          select 1 from public.ops_verifications o
          where o.lead_id = p_lead_id and o.ops_agent = private.identity()
        )
      )
      or (
        private.role_key() = 'onb_agent'
        and exists (
          select 1 from public.msp_onboarding m
          where m.lead_id = p_lead_id and m.onboarding_sp = private.identity()
        )
      )
      or (
        private.role_key() = 'cs_agent'
        and exists (
          select 1 from public.retention r
          where r.lead_id = p_lead_id
            and (
              r.agent_name = private.identity()
              or r.substitute = private.identity()
            )
        )
      )
    );
$$;

-- Counselling roster: captains are sales-floor people
create or replace function private.counselling_role_ok(p_role text)
returns boolean
language sql
stable
as $$
  select case
    when private.role_key() in ('ceo', 'super_admin') then true
    when private.role_key() = 'sales_head' then p_role in (
      'lg_agent', 'lg_sup', 'team_captain', 'qa_agent', 'closer', 'floor_manager', 'avp_sales'
    )
    else false
  end;
$$;

-- Presence monitor (sales_head scope): include team captains
create or replace function public.dash_presence(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  day_local date := coalesce(p_day, (now() at time zone 'Asia/Karachi')::date);
  week_start date := day_local - ((extract(dow from day_local)::int + 6) % 7);
  week_end date := week_start + 6;
begin
  if not private.can_view_presence() then
    raise exception 'Presence monitor is restricted.';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by
      case x.status
        when 'working' then 0
        when 'break' then 1
        when 'idle' then 2
        when 'away' then 3
        else 4
      end,
      x.name
    ), '[]'::jsonb)
    from (
      select
        p.user_id,
        p.full_name                                              as name,
        coalesce(p.title, '')                                    as title,
        coalesce(p.role_key, '')                                 as role_key,
        coalesce(p.team, '')                                     as team,
        coalesce(p.dept, '')                                     as dept,
        case
          when up.user_id is null then 'offline'
          when up.last_heartbeat_at is null then 'offline'
          when up.last_heartbeat_at < now() - interval '90 seconds' then 'offline'
          else up.status
        end                                                      as status,
        coalesce(up.current_tab, '')                             as current_tab,
        up.last_heartbeat_at,
        up.last_input_at,
        up.session_started_at,
        coalesce(up.idle_seconds, 0)                             as idle_seconds,
        coalesce(up.focused, false)                              as focused,
        coalesce(up.clicks_1m, 0)                                as clicks_1m,
        coalesce(up.keys_1m, 0)                                  as keys_1m,
        coalesce(up.scrolls_1m, 0)                               as scrolls_1m,
        coalesce(up.user_agent, '')                              as user_agent,
        coalesce(up.break_type, '')                              as break_type,
        up.break_started_at,
        coalesce(pd.working_seconds, 0)                          as working_seconds,
        coalesce(pd.idle_seconds, 0)                             as idle_seconds_today,
        coalesce(pd.away_seconds, 0)                             as away_seconds,
        coalesce(pd.break_seconds, 0)                            as break_seconds,
        coalesce(pd.general_break_seconds, 0)                    as general_break_seconds,
        coalesce(pd.lunch_break_seconds, 0)                      as lunch_break_seconds,
        coalesce(pd.interactions, 0)                             as interactions,
        coalesce(pd.heartbeats, 0)                               as heartbeats,
        coalesce(pd.tabs, '{}'::jsonb)                           as tabs,
        coalesce(pw.week_working_seconds, 0)                     as week_working_seconds,
        coalesce(pw.week_idle_seconds, 0)                        as week_idle_seconds,
        coalesce(pw.week_away_seconds, 0)                        as week_away_seconds,
        coalesce(pw.week_break_seconds, 0)                       as week_break_seconds,
        coalesce(pw.week_general_break_seconds, 0)               as week_general_break_seconds,
        coalesce(pw.week_lunch_break_seconds, 0)                 as week_lunch_break_seconds,
        coalesce(pw.week_interactions, 0)                        as week_interactions,
        week_start                                               as week_start,
        week_end                                                 as week_end
      from public.profiles p
      left join public.user_presence up on up.user_id = p.user_id
      left join public.presence_day pd on pd.user_id = p.user_id and pd.day = day_local
      left join lateral (
        select
          sum(d.working_seconds)::int as week_working_seconds,
          sum(d.idle_seconds)::int    as week_idle_seconds,
          sum(d.away_seconds)::int    as week_away_seconds,
          sum(coalesce(d.break_seconds, 0))::int as week_break_seconds,
          sum(coalesce(d.general_break_seconds, 0))::int as week_general_break_seconds,
          sum(coalesce(d.lunch_break_seconds, 0))::int as week_lunch_break_seconds,
          sum(d.interactions)::int    as week_interactions
        from public.presence_day d
        where d.user_id = p.user_id
          and d.day >= week_start
          and d.day <= week_end
      ) pw on true
      where p.is_active = true
        and p.user_id is not null
        and p.role_key not in ('ceo', 'super_admin')
        and (
          private.is_admin()
          or (
            private.role_key() = 'sales_head'
            and p.role_key in ('lg_agent', 'lg_sup', 'team_captain', 'closer', 'floor_manager')
          )
          or (
            private.role_key() = 'ops_manager'
            and p.dept = 'OPS'
          )
        )
    ) x
  );
end;
$$;

grant execute on function public.dash_presence(date) to authenticated;
