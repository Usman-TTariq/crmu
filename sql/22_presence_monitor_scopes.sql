-- ============================================================================
-- TGT Nexus CRM — 22_presence_monitor_scopes.sql
-- Employee Monitor scopes:
--   ceo / super_admin → full board (exclude ceo/super_admin rows)
--   sales_head        → lg_agent, lg_sup, closer, floor_manager
--   ops_manager       → dept = OPS
-- Safe to re-run. Paste into Supabase SQL editor after 09/10 presence.
-- ============================================================================

create or replace function private.can_view_presence()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_admin()
      or private.role_key() in ('sales_head', 'ops_manager');
$$;

create or replace function private.presence_target_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.is_active = true
      and p.role_key not in ('ceo', 'super_admin')
      and (
        private.is_admin()
        or (
          private.role_key() = 'sales_head'
          and p.role_key in ('lg_agent', 'lg_sup', 'closer', 'floor_manager')
        )
        or (
          private.role_key() = 'ops_manager'
          and p.dept = 'OPS'
        )
      )
  );
$$;

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
      case x.status when 'working' then 0 when 'idle' then 1 when 'away' then 2 else 3 end,
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
        coalesce(pd.working_seconds, 0)                          as working_seconds,
        coalesce(pd.idle_seconds, 0)                             as idle_seconds_today,
        coalesce(pd.away_seconds, 0)                             as away_seconds,
        coalesce(pd.interactions, 0)                             as interactions,
        coalesce(pd.heartbeats, 0)                               as heartbeats,
        coalesce(pd.tabs, '{}'::jsonb)                           as tabs,
        coalesce(pw.week_working_seconds, 0)                     as week_working_seconds,
        coalesce(pw.week_idle_seconds, 0)                        as week_idle_seconds,
        coalesce(pw.week_away_seconds, 0)                        as week_away_seconds,
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
            and p.role_key in ('lg_agent', 'lg_sup', 'closer', 'floor_manager')
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

create or replace function public.dash_presence_events(
  p_user_id uuid,
  p_day date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  day_local date := coalesce(p_day, (now() at time zone 'Asia/Karachi')::date);
  day_start timestamptz;
  day_end timestamptz;
begin
  if not private.can_view_presence() then
    raise exception 'Presence events are restricted.';
  end if;
  if not private.presence_target_ok(p_user_id) then
    raise exception 'Not allowed to view this employee.';
  end if;

  day_start := (day_local::timestamp at time zone 'Asia/Karachi');
  day_end   := day_start + interval '1 day';

  return (
    select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.created_at), '[]'::jsonb)
    from (
      select
        id,
        status,
        prev_status,
        current_tab,
        created_at
      from public.presence_events
      where user_id = p_user_id
        and created_at >= day_start
        and created_at < day_end
      order by created_at
      limit 500
    ) e
  );
end;
$$;

grant execute on function public.dash_presence_events(uuid, date) to authenticated;

create or replace function public.dash_presence_week(
  p_user_id uuid,
  p_day date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  day_local date := coalesce(p_day, (now() at time zone 'Asia/Karachi')::date);
  week_start date := day_local - ((extract(dow from day_local)::int + 6) % 7);
begin
  if not private.can_view_presence() then
    raise exception 'Presence week is restricted.';
  end if;
  if not private.presence_target_ok(p_user_id) then
    raise exception 'Not allowed to view this employee.';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.day), '[]'::jsonb)
    from (
      select
        d::date as day,
        coalesce(pd.working_seconds, 0) as working_seconds,
        coalesce(pd.idle_seconds, 0)    as idle_seconds,
        coalesce(pd.away_seconds, 0)    as away_seconds,
        coalesce(pd.interactions, 0)    as interactions,
        coalesce(pd.heartbeats, 0)      as heartbeats
      from generate_series(week_start, week_start + 6, interval '1 day') as d
      left join public.presence_day pd
        on pd.user_id = p_user_id
       and pd.day = d::date
    ) x
  );
end;
$$;

grant execute on function public.dash_presence_week(uuid, date) to authenticated;
