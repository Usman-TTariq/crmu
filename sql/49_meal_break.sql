-- ============================================================================
-- TGT Nexus CRM — 49_meal_break.sql
-- Rename break type lunch → meal (labels: Meal break).
-- Time still accumulates in lunch_break_seconds (column kept for compatibility).
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

update public.user_presence
set break_type = 'meal'
where break_type = 'lunch';

alter table public.user_presence drop constraint if exists user_presence_break_type_check;
alter table public.user_presence
  add constraint user_presence_break_type_check
  check (break_type in ('', 'general', 'meal', 'lunch'));

-- Start a declared break (general / meal).
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
  if btype = 'lunch' then
    btype := 'meal';
  end if;

  if btype not in ('general', 'meal') then
    raise exception 'Invalid break type. Use general or meal.';
  end if;

  select * into prev from public.user_presence where user_id = uid;
  prev_btype := lower(trim(coalesce(prev.break_type, '')));
  if prev_btype in ('tea', 'smoke') then
    prev_btype := 'general';
  end if;
  if prev_btype = 'lunch' then
    prev_btype := 'meal';
  end if;

  if found and prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
    day_local := (now() at time zone 'Asia/Karachi')::date;
    if delta > 0 and prev.status = 'break' then
      break_delta := delta;
      if prev_btype = 'meal' then
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

-- Heartbeat: treat meal (and legacy lunch) as meal-break seconds
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
  if prev_btype = 'lunch' then
    prev_btype := 'meal';
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
    if prev_btype = 'meal' then
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
  if prev_btype = 'lunch' then
    prev_btype := 'meal';
  end if;

  if prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
    day_local := (now() at time zone 'Asia/Karachi')::date;
    if delta > 0 then
      break_delta := delta;
      if prev_btype = 'meal' then
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
  if prev_btype = 'lunch' then
    prev_btype := 'meal';
  end if;

  if prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
  else
    delta := 0;
  end if;

  day_local := (now() at time zone 'Asia/Karachi')::date;

  if delta > 0 and prev.status = 'break' then
    break_delta := delta;
    if prev_btype = 'meal' then
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
