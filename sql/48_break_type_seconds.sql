-- ============================================================================
-- TGT Nexus CRM — 48_break_type_seconds.sql
-- Split break time into general_break_seconds + lunch_break_seconds.
-- Keeps break_seconds as the total (general + lunch) for older consumers.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

alter table public.presence_day
  add column if not exists general_break_seconds integer not null default 0,
  add column if not exists lunch_break_seconds integer not null default 0;

-- Historical rows: unknown type → general bucket
update public.presence_day
set general_break_seconds = break_seconds
where coalesce(general_break_seconds, 0) = 0
  and coalesce(lunch_break_seconds, 0) = 0
  and coalesce(break_seconds, 0) > 0;

-- ---------------------------------------------------------------------------
-- Heartbeat
-- ---------------------------------------------------------------------------
create or replace function public.presence_heartbeat(
  p_tab            text default '',
  p_idle_seconds   integer default 0,
  p_focused        boolean default true,
  p_clicks         integer default 0,
  p_keys           integer default 0,
  p_scrolls        integer default 0,
  p_user_agent     text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prev public.user_presence%rowtype;
  new_status text;
  idle_s integer := greatest(0, coalesce(p_idle_seconds, 0));
  clicks integer := greatest(0, least(coalesce(p_clicks, 0), 5000));
  keys_n integer := greatest(0, least(coalesce(p_keys, 0), 5000));
  scrolls integer := greatest(0, least(coalesce(p_scrolls, 0), 5000));
  interactions integer := clicks + keys_n + scrolls;
  tab_key text := left(coalesce(nullif(trim(p_tab), ''), 'unknown'), 40);
  delta integer;
  day_local date;
  prev_status text;
  keep_break boolean := false;
  btype text := '';
  prev_btype text := '';
  break_delta integer := 0;
  general_delta integer := 0;
  lunch_delta integer := 0;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into prev from public.user_presence where user_id = uid;
  prev_status := coalesce(prev.status, 'offline');
  prev_btype := lower(trim(coalesce(prev.break_type, '')));
  if prev_btype in ('tea', 'smoke') then
    prev_btype := 'general';
  end if;
  keep_break := (prev_status = 'break' and prev_btype <> '');
  btype := case when keep_break then prev_btype else '' end;

  if keep_break then
    new_status := 'break';
  elsif idle_s >= 120 then
    new_status := 'away';
  else
    new_status := 'working';
  end if;

  if prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
  else
    delta := 0;
  end if;

  day_local := (now() at time zone 'Asia/Karachi')::date;

  if delta > 0 and prev_status = 'break' then
    break_delta := delta;
    if prev_btype = 'lunch' then
      lunch_delta := delta;
    else
      general_delta := delta;
    end if;
  end if;

  if delta > 0 then
    insert into public.presence_day as pd (
      user_id, day, working_seconds, idle_seconds, away_seconds, break_seconds,
      general_break_seconds, lunch_break_seconds, interactions, heartbeats, tabs
    )
    values (
      uid,
      day_local,
      case when prev_status in ('working', 'idle') then delta else 0 end,
      0,
      case when prev_status = 'away' then delta else 0 end,
      break_delta,
      general_delta,
      lunch_delta,
      interactions,
      1,
      jsonb_build_object(tab_key, delta)
    )
    on conflict (user_id, day) do update set
      working_seconds        = pd.working_seconds + excluded.working_seconds,
      idle_seconds           = pd.idle_seconds + excluded.idle_seconds,
      away_seconds           = pd.away_seconds + excluded.away_seconds,
      break_seconds          = pd.break_seconds + excluded.break_seconds,
      general_break_seconds  = pd.general_break_seconds + excluded.general_break_seconds,
      lunch_break_seconds    = pd.lunch_break_seconds + excluded.lunch_break_seconds,
      interactions           = pd.interactions + excluded.interactions,
      heartbeats             = pd.heartbeats + 1,
      tabs = (
        select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
        from (
          select key as k, sum(val)::int as v
          from (
            select key, value::int as val
            from jsonb_each_text(pd.tabs)
            union all
            select key, value::int as val
            from jsonb_each_text(excluded.tabs)
          ) u
          group by key
        ) s
      );
  else
    insert into public.presence_day as pd (user_id, day, interactions, heartbeats, tabs)
    values (uid, day_local, interactions, 1, '{}'::jsonb)
    on conflict (user_id, day) do update set
      interactions = pd.interactions + excluded.interactions,
      heartbeats   = pd.heartbeats + 1;
  end if;

  insert into public.user_presence as up (
    user_id, status, current_tab, last_heartbeat_at, last_input_at,
    session_started_at, idle_seconds, focused, clicks_1m, keys_1m, scrolls_1m,
    user_agent, break_type, break_started_at, updated_at
  ) values (
    uid,
    new_status,
    tab_key,
    now(),
    case when idle_s = 0 then now() else coalesce(prev.last_input_at, now()) end,
    coalesce(prev.session_started_at, now()),
    idle_s,
    coalesce(p_focused, true),
    clicks,
    keys_n,
    scrolls,
    left(coalesce(p_user_agent, ''), 240),
    btype,
    case when keep_break then prev.break_started_at else null end,
    now()
  )
  on conflict (user_id) do update set
    status            = excluded.status,
    current_tab       = excluded.current_tab,
    last_heartbeat_at = excluded.last_heartbeat_at,
    last_input_at     = excluded.last_input_at,
    session_started_at = case
      when prev_status = 'offline' or up.session_started_at is null then now()
      else up.session_started_at
    end,
    idle_seconds      = excluded.idle_seconds,
    focused           = excluded.focused,
    clicks_1m         = excluded.clicks_1m,
    keys_1m           = excluded.keys_1m,
    scrolls_1m        = excluded.scrolls_1m,
    user_agent        = excluded.user_agent,
    break_type        = excluded.break_type,
    break_started_at  = excluded.break_started_at,
    updated_at        = now();

  if prev_status is distinct from new_status then
    insert into public.presence_events (user_id, status, prev_status, current_tab)
    values (uid, new_status, prev_status, tab_key);
  end if;

  return jsonb_build_object(
    'status', new_status,
    'tab', tab_key,
    'break_type', btype
  );
end;
$$;

grant execute on function public.presence_heartbeat(text, integer, boolean, integer, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Offline flush
-- ---------------------------------------------------------------------------
create or replace function public.presence_offline()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prev public.user_presence%rowtype;
  delta integer;
  day_local date;
  prev_btype text := '';
  break_delta integer := 0;
  general_delta integer := 0;
  lunch_delta integer := 0;
begin
  if uid is null then return; end if;

  select * into prev from public.user_presence where user_id = uid;
  if not found then return; end if;

  prev_btype := lower(trim(coalesce(prev.break_type, '')));
  if prev_btype in ('tea', 'smoke') then
    prev_btype := 'general';
  end if;

  if prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
  else
    delta := 0;
  end if;

  day_local := (now() at time zone 'Asia/Karachi')::date;

  if delta > 0 and prev.status = 'break' then
    break_delta := delta;
    if prev_btype = 'lunch' then
      lunch_delta := delta;
    else
      general_delta := delta;
    end if;
  end if;

  if delta > 0 and prev.status in ('working', 'idle', 'away', 'break') then
    insert into public.presence_day as pd (
      user_id, day, working_seconds, idle_seconds, away_seconds, break_seconds,
      general_break_seconds, lunch_break_seconds, heartbeats
    )
    values (
      uid,
      day_local,
      case when prev.status in ('working', 'idle') then delta else 0 end,
      0,
      case when prev.status = 'away' then delta else 0 end,
      break_delta,
      general_delta,
      lunch_delta,
      0
    )
    on conflict (user_id, day) do update set
      working_seconds       = pd.working_seconds + excluded.working_seconds,
      idle_seconds          = pd.idle_seconds + excluded.idle_seconds,
      away_seconds          = pd.away_seconds + excluded.away_seconds,
      break_seconds         = pd.break_seconds + excluded.break_seconds,
      general_break_seconds = pd.general_break_seconds + excluded.general_break_seconds,
      lunch_break_seconds   = pd.lunch_break_seconds + excluded.lunch_break_seconds;
  end if;

  update public.user_presence
  set status = 'offline',
      idle_seconds = 0,
      focused = false,
      clicks_1m = 0,
      keys_1m = 0,
      scrolls_1m = 0,
      break_type = '',
      break_started_at = null,
      updated_at = now(),
      last_heartbeat_at = now()
  where user_id = uid
    and status is distinct from 'offline';

  if prev.status is distinct from 'offline' then
    insert into public.presence_events (user_id, status, prev_status, current_tab)
    values (uid, 'offline', prev.status, prev.current_tab);
  end if;
end;
$$;

grant execute on function public.presence_offline() to authenticated;

-- ---------------------------------------------------------------------------
-- Start break (general / lunch)
-- ---------------------------------------------------------------------------
create or replace function public.presence_start_break(p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prev public.user_presence%rowtype;
  btype text := lower(trim(coalesce(p_type, '')));
  day_local date;
  delta integer;
  prev_btype text := '';
  break_delta integer := 0;
  general_delta integer := 0;
  lunch_delta integer := 0;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if btype in ('tea', 'smoke') then
    btype := 'general';
  end if;

  if btype not in ('general', 'lunch') then
    raise exception 'Invalid break type. Use general or lunch.';
  end if;

  select * into prev from public.user_presence where user_id = uid;
  prev_btype := lower(trim(coalesce(prev.break_type, '')));
  if prev_btype in ('tea', 'smoke') then
    prev_btype := 'general';
  end if;

  if found and prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
    day_local := (now() at time zone 'Asia/Karachi')::date;
    if delta > 0 and prev.status = 'break' then
      break_delta := delta;
      if prev_btype = 'lunch' then
        lunch_delta := delta;
      else
        general_delta := delta;
      end if;
    end if;
    if delta > 0 and prev.status in ('working', 'idle', 'away', 'break') then
      insert into public.presence_day as pd (
        user_id, day, working_seconds, idle_seconds, away_seconds, break_seconds,
        general_break_seconds, lunch_break_seconds, heartbeats
      )
      values (
        uid, day_local,
        case when prev.status in ('working', 'idle') then delta else 0 end,
        0,
        case when prev.status = 'away' then delta else 0 end,
        break_delta,
        general_delta,
        lunch_delta,
        0
      )
      on conflict (user_id, day) do update set
        working_seconds       = pd.working_seconds + excluded.working_seconds,
        idle_seconds          = pd.idle_seconds + excluded.idle_seconds,
        away_seconds          = pd.away_seconds + excluded.away_seconds,
        break_seconds         = pd.break_seconds + excluded.break_seconds,
        general_break_seconds = pd.general_break_seconds + excluded.general_break_seconds,
        lunch_break_seconds   = pd.lunch_break_seconds + excluded.lunch_break_seconds;
    end if;
  end if;

  insert into public.user_presence as up (
    user_id, status, current_tab, last_heartbeat_at, last_input_at,
    session_started_at, idle_seconds, focused, break_type, break_started_at, updated_at
  ) values (
    uid, 'break', coalesce(prev.current_tab, ''), now(), now(),
    coalesce(prev.session_started_at, now()), 0, true, btype, now(), now()
  )
  on conflict (user_id) do update set
    status = 'break',
    break_type = excluded.break_type,
    break_started_at = now(),
    last_heartbeat_at = now(),
    idle_seconds = 0,
    updated_at = now();

  begin
    insert into public.presence_events (user_id, status, prev_status, current_tab)
    values (uid, 'break', coalesce(prev.status, 'offline'), coalesce(prev.current_tab, ''));
  exception when others then
    null;
  end;

  return jsonb_build_object('status', 'break', 'break_type', btype);
end;
$$;

grant execute on function public.presence_start_break(text) to authenticated;

-- ---------------------------------------------------------------------------
-- End break
-- ---------------------------------------------------------------------------
create or replace function public.presence_end_break()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prev public.user_presence%rowtype;
  day_local date;
  delta integer;
  prev_btype text := '';
  break_delta integer := 0;
  general_delta integer := 0;
  lunch_delta integer := 0;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into prev from public.user_presence where user_id = uid;
  if not found or prev.status is distinct from 'break' then
    return jsonb_build_object('status', coalesce(prev.status, 'offline'), 'break_type', '');
  end if;

  prev_btype := lower(trim(coalesce(prev.break_type, '')));
  if prev_btype in ('tea', 'smoke') then
    prev_btype := 'general';
  end if;

  if prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
    day_local := (now() at time zone 'Asia/Karachi')::date;
    if delta > 0 then
      break_delta := delta;
      if prev_btype = 'lunch' then
        lunch_delta := delta;
      else
        general_delta := delta;
      end if;
      insert into public.presence_day as pd (
        user_id, day, break_seconds, general_break_seconds, lunch_break_seconds, heartbeats
      )
      values (uid, day_local, break_delta, general_delta, lunch_delta, 0)
      on conflict (user_id, day) do update set
        break_seconds         = pd.break_seconds + excluded.break_seconds,
        general_break_seconds = pd.general_break_seconds + excluded.general_break_seconds,
        lunch_break_seconds   = pd.lunch_break_seconds + excluded.lunch_break_seconds;
    end if;
  end if;

  update public.user_presence
  set status = 'working',
      break_type = '',
      break_started_at = null,
      idle_seconds = 0,
      last_input_at = now(),
      last_heartbeat_at = now(),
      updated_at = now()
  where user_id = uid;

  insert into public.presence_events (user_id, status, prev_status, current_tab)
  values (uid, 'working', 'break', coalesce(prev.current_tab, ''));

  return jsonb_build_object('status', 'working', 'break_type', '');
end;
$$;

grant execute on function public.presence_end_break() to authenticated;

-- ---------------------------------------------------------------------------
-- Monitor board
-- ---------------------------------------------------------------------------
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

-- Week day rows: include split break times
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
        coalesce(pd.break_seconds, 0)   as break_seconds,
        coalesce(pd.general_break_seconds, 0) as general_break_seconds,
        coalesce(pd.lunch_break_seconds, 0)   as lunch_break_seconds,
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
