-- ============================================================================
-- TGT Nexus CRM — 09_presence.sql
-- Live employee presence + daily activity (work vs idle/away).
-- Powers the PresenceTracker heartbeat and the Monitor admin tab.
-- Admin-only reads. Safe to re-run. Apply in Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Live presence (one row per auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  status             text not null default 'offline'
                     check (status in ('working', 'idle', 'away', 'offline')),
  current_tab        text not null default '',
  last_heartbeat_at  timestamptz,
  last_input_at      timestamptz,
  session_started_at timestamptz,
  idle_seconds       integer not null default 0,
  focused            boolean not null default true,
  clicks_1m          integer not null default 0,
  keys_1m            integer not null default 0,
  scrolls_1m         integer not null default 0,
  user_agent         text not null default '',
  updated_at         timestamptz not null default now()
);

create index if not exists user_presence_status_idx
  on public.user_presence (status, last_heartbeat_at desc);

-- ---------------------------------------------------------------------------
-- Daily aggregates (one row per user per calendar day, Asia/Karachi wall clock)
-- ---------------------------------------------------------------------------
create table if not exists public.presence_day (
  user_id           uuid not null references auth.users (id) on delete cascade,
  day               date not null,
  working_seconds   integer not null default 0,
  idle_seconds      integer not null default 0,
  away_seconds      integer not null default 0,
  interactions      integer not null default 0,
  heartbeats        integer not null default 0,
  tabs              jsonb not null default '{}'::jsonb,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Status-change timeline (for admin drill-down)
-- ---------------------------------------------------------------------------
create table if not exists public.presence_events (
  id           bigserial primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       text not null check (status in ('working', 'idle', 'away', 'offline')),
  prev_status  text,
  current_tab  text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists presence_events_user_day_idx
  on public.presence_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: users can only touch their own live row; aggregates/events via RPC
-- ---------------------------------------------------------------------------
alter table public.user_presence enable row level security;
alter table public.presence_day enable row level security;
alter table public.presence_events enable row level security;

drop policy if exists presence_select_own on public.user_presence;
create policy presence_select_own on public.user_presence
  for select to authenticated
  using (user_id = auth.uid() or private.is_admin());

drop policy if exists presence_upsert_own on public.user_presence;
create policy presence_upsert_own on public.user_presence
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists presence_update_own on public.user_presence;
create policy presence_update_own on public.user_presence
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists presence_day_admin on public.presence_day;
create policy presence_day_admin on public.presence_day
  for select to authenticated
  using (private.is_admin() or user_id = auth.uid());

drop policy if exists presence_events_admin on public.presence_events;
create policy presence_events_admin on public.presence_events
  for select to authenticated
  using (private.is_admin() or user_id = auth.uid());

grant select, insert, update on public.user_presence to authenticated;
grant select on public.presence_day to authenticated;
grant select on public.presence_events to authenticated;

-- ---------------------------------------------------------------------------
-- Heartbeat: any signed-in user reports activity; server derives status +
-- rolls seconds into today's buckets based on the PREVIOUS status.
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
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Client-reported idle + focus → status
  if not coalesce(p_focused, true) then
    new_status := 'away';
  elsif idle_s >= 300 then
    new_status := 'away';
  elsif idle_s >= 120 then
    new_status := 'idle';
  else
    new_status := 'working';
  end if;

  select * into prev from public.user_presence where user_id = uid;
  prev_status := coalesce(prev.status, 'offline');

  -- Attribute elapsed time since last heartbeat to the previous status (cap 3 min)
  if prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
  else
    delta := 0;
  end if;

  day_local := (now() at time zone 'Asia/Karachi')::date;

  if delta > 0 then
    insert into public.presence_day as pd (user_id, day, working_seconds, idle_seconds, away_seconds, interactions, heartbeats, tabs)
    values (
      uid,
      day_local,
      case when prev_status = 'working' then delta else 0 end,
      case when prev_status = 'idle' then delta else 0 end,
      case when prev_status = 'away' then delta else 0 end,
      interactions,
      1,
      jsonb_build_object(tab_key, delta)
    )
    on conflict (user_id, day) do update set
      working_seconds = pd.working_seconds + excluded.working_seconds,
      idle_seconds    = pd.idle_seconds + excluded.idle_seconds,
      away_seconds    = pd.away_seconds + excluded.away_seconds,
      interactions    = pd.interactions + excluded.interactions,
      heartbeats      = pd.heartbeats + 1,
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
    user_agent, updated_at
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
    updated_at        = now();

  if prev_status is distinct from new_status then
    insert into public.presence_events (user_id, status, prev_status, current_tab)
    values (uid, new_status, prev_status, tab_key);
  end if;

  return jsonb_build_object('status', new_status, 'tab', tab_key);
end;
$$;

grant execute on function public.presence_heartbeat(text, integer, boolean, integer, integer, integer, text) to authenticated;

-- Mark self offline (logout / tab close). Best-effort.
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
begin
  if uid is null then return; end if;

  select * into prev from public.user_presence where user_id = uid;
  if not found then return; end if;

  if prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
  else
    delta := 0;
  end if;

  day_local := (now() at time zone 'Asia/Karachi')::date;

  if delta > 0 and prev.status in ('working', 'idle', 'away') then
    insert into public.presence_day as pd (user_id, day, working_seconds, idle_seconds, away_seconds, heartbeats)
    values (
      uid, day_local,
      case when prev.status = 'working' then delta else 0 end,
      case when prev.status = 'idle' then delta else 0 end,
      case when prev.status = 'away' then delta else 0 end,
      0
    )
    on conflict (user_id, day) do update set
      working_seconds = pd.working_seconds + excluded.working_seconds,
      idle_seconds    = pd.idle_seconds + excluded.idle_seconds,
      away_seconds    = pd.away_seconds + excluded.away_seconds;
  end if;

  update public.user_presence
  set status = 'offline',
      idle_seconds = 0,
      focused = false,
      clicks_1m = 0,
      keys_1m = 0,
      scrolls_1m = 0,
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
-- Admin live board + day totals + Mon–Sun week totals (Asia/Karachi).
-- Offline if no heartbeat for 90s (stale row treated as offline).
-- Full week upgrade also in 10_presence_hours.sql (safe re-run).
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

-- Timeline for one employee on a day (admin)
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
  if not private.is_admin() then
    raise exception 'Presence events are restricted to admins.';
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

-- Day-by-day for one employee (Mon–Sun week containing p_day)
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
