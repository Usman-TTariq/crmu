-- ============================================================================
-- TGT Nexus CRM — 47_general_break.sql
-- Replace tea / smoke with a single general break. Lunch unchanged.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

-- Migrate existing open / stored break types
update public.user_presence
set break_type = 'general'
where break_type in ('tea', 'smoke');

alter table public.user_presence drop constraint if exists user_presence_break_type_check;
alter table public.user_presence
  add constraint user_presence_break_type_check
  check (break_type in ('', 'general', 'lunch'));

-- Start a declared break (general / lunch).
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
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Legacy aliases → general
  if btype in ('tea', 'smoke') then
    btype := 'general';
  end if;

  if btype not in ('general', 'lunch') then
    raise exception 'Invalid break type. Use general or lunch.';
  end if;

  select * into prev from public.user_presence where user_id = uid;

  -- Flush time under previous status before switching to break
  if found and prev.last_heartbeat_at is not null then
    delta := least(180, greatest(0, floor(extract(epoch from (now() - prev.last_heartbeat_at)))::int));
    day_local := (now() at time zone 'Asia/Karachi')::date;
    if delta > 0 and prev.status in ('working', 'idle', 'away', 'break') then
      insert into public.presence_day as pd (
        user_id, day, working_seconds, idle_seconds, away_seconds, break_seconds, heartbeats
      )
      values (
        uid, day_local,
        case when prev.status in ('working', 'idle') then delta else 0 end,
        0,
        case when prev.status = 'away' then delta else 0 end,
        case when prev.status = 'break' then delta else 0 end,
        0
      )
      on conflict (user_id, day) do update set
        working_seconds = pd.working_seconds + excluded.working_seconds,
        idle_seconds    = pd.idle_seconds + excluded.idle_seconds,
        away_seconds    = pd.away_seconds + excluded.away_seconds,
        break_seconds   = pd.break_seconds + excluded.break_seconds;
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
