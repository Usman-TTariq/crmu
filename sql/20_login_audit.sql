-- ============================================================================
-- TGT Nexus CRM — 20_login_audit.sql
-- Diagnose why some roster logins work and others do not.
-- Working login needs BOTH:
--   1) auth.users (email + password)
--   2) profiles.user_id = that auth user's id
-- Safe read-only audit. Paste into Supabase SQL Editor.
-- ============================================================================

select
  p.full_name,
  p.title,
  p.team,
  p.is_active,
  p.user_id,
  u.email as auth_email,
  case
    when p.user_id is null then 'NO_LOGIN'
    when u.id is null then 'ORPHAN_USER_ID'
    else 'OK'
  end as status
from public.profiles p
left join auth.users u on u.id = p.user_id
where p.is_active is distinct from false
order by
  case
    when p.user_id is null then 0
    when u.id is null then 1
    else 2
  end,
  p.full_name;

-- Auth users with no linked profile (can sign in to Auth but CRM bounces to /logout)
select
  u.id as auth_user_id,
  u.email,
  u.created_at,
  'UNLINKED_AUTH' as status
from auth.users u
where not exists (
  select 1 from public.profiles p where p.user_id = u.id
)
order by u.email;
