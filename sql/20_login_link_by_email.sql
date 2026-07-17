-- ============================================================================
-- TGT Nexus CRM — 20_login_link_by_email.sql
-- Link an existing Auth user to a roster profile (when Auth exists but
-- profiles.user_id is still null). Replace email + full_name, then run.
-- ============================================================================

-- update public.profiles p
-- set user_id = u.id
-- from auth.users u
-- where lower(u.email) = lower('person@tgtnexus.net')
--   and p.full_name = 'Exact Name'
--   and p.user_id is null;

-- Clear broken links (profile points at deleted Auth user):
-- update public.profiles
-- set user_id = null
-- where user_id is not null
--   and not exists (select 1 from auth.users u where u.id = profiles.user_id);
