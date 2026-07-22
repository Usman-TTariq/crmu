-- ============================================================================
-- TGT Nexus CRM — 67_ceo_monitor_hr_leadership.sql
-- CEO / Super Admin Employee Monitor: include HR + all leadership
-- (sales_head, avp_sales, floor_manager, ops_manager, etc.).
-- Only ceo / super_admin profiles stay hidden from the board.
-- HR viewers still do not see other HR or top admins.
-- Safe to re-run.
-- ============================================================================

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
      and (
        (
          private.is_admin()
          and p.role_key not in ('ceo', 'super_admin')
        )
        or (
          private.role_key() in ('hr', 'hr_monitor')
          and p.role_key not in ('ceo', 'super_admin', 'hr', 'hr_monitor')
        )
        or (
          private.role_key() = 'sales_head'
          and p.role_key in (
            'lg_agent', 'lg_sup', 'team_captain', 'closer',
            'floor_manager', 'avp_sales', 'qa_agent'
          )
        )
        or (
          private.role_key() = 'ops_manager'
          and p.dept = 'OPS'
          and p.role_key not in ('ceo', 'super_admin')
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
        and (
          (
            private.is_admin()
            and p.role_key not in ('ceo', 'super_admin')
          )
          or (
            private.role_key() in ('hr', 'hr_monitor')
            and p.role_key not in ('ceo', 'super_admin', 'hr', 'hr_monitor')
          )
          or (
            private.role_key() = 'sales_head'
            and p.role_key in (
              'lg_agent', 'lg_sup', 'team_captain', 'closer',
              'floor_manager', 'avp_sales', 'qa_agent'
            )
          )
          or (
            private.role_key() = 'ops_manager'
            and p.dept = 'OPS'
            and p.role_key not in ('ceo', 'super_admin')
          )
        )
    ) x
  );
end;
$$;

grant execute on function public.dash_presence(date) to authenticated;
