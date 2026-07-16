-- ============================================================================
-- TGT Nexus CRM — 10_presence_hours.sql
-- Adds weekly work totals + per-day breakdown for Employee Monitor.
-- Run after 09_presence.sql. Safe to re-run.
-- ============================================================================

-- Live board: selected day totals + Mon–Sun week (Asia/Karachi) that contains that day
create or replace function public.dash_presence(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  day_local date := coalesce(p_day, (now() at time zone 'Asia/Karachi')::date);
  -- Monday-start week containing day_local
  week_start date := day_local - ((extract(dow from day_local)::int + 6) % 7);
  week_end date := week_start + 6;
begin
  if not private.is_admin() then
    raise exception 'Presence monitor is restricted to admins.';
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
    ) x
  );
end;
$$;

grant execute on function public.dash_presence(date) to authenticated;

-- Day-by-day rows for one employee for the Mon–Sun week containing p_day
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
  if not private.is_admin() then
    raise exception 'Presence week is restricted to admins.';
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
