-- ============================================================================
-- TGT Nexus CRM — 07_sessions.sql
-- Active login sessions (who is signed in, from which device/IP) plus
-- admin remote sign-out. Powers the Active Logins dropdown in the top bar.
-- Admin-only. Run after 05_seed.sql. Safe to re-run.
-- ============================================================================

create or replace function public.dash_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'Login sessions are restricted to admins.';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.last_seen desc), '[]'::jsonb)
    from (
      select
        u.id                                           as user_id,
        coalesce(p.full_name, u.email, 'Unknown')      as name,
        coalesce(p.title, '')                          as title,
        coalesce(p.role_key, '')                       as role_key,
        coalesce(u.email, '')                          as email,
        coalesce(s.user_agent, '')                     as user_agent,
        coalesce(host(s.ip), '')                       as ip,
        s.created_at                                   as signed_in_at,
        coalesce(s.refreshed_at, s.updated_at, s.created_at) as last_seen,
        (s.id = (auth.jwt()->>'session_id')::uuid)     as is_current
      from auth.sessions s
      join auth.users u on u.id = s.user_id
      left join public.profiles p on p.user_id = u.id
      where s.not_after is null or s.not_after > now()
    ) x
  );
end;
$$;

grant execute on function public.dash_sessions() to authenticated;

-- ---------------------------------------------------------------------------
-- Sign a user out of ALL their devices (deletes their sessions; the admin's
-- own current session is always spared so they don't kick themselves out).
-- ---------------------------------------------------------------------------
create or replace function public.admin_logout_user(target uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not private.is_admin() then
    raise exception 'Remote sign-out is restricted to admins.';
  end if;

  delete from auth.sessions
  where user_id = target
    and id is distinct from (auth.jwt()->>'session_id')::uuid;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.admin_logout_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sign EVERYONE out of all devices (except the admin's own current session).
-- ---------------------------------------------------------------------------
create or replace function public.admin_logout_all()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not private.is_admin() then
    raise exception 'Remote sign-out is restricted to admins.';
  end if;

  delete from auth.sessions
  where id is distinct from (auth.jwt()->>'session_id')::uuid;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.admin_logout_all() to authenticated;
