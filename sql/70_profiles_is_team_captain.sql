-- ============================================================================
-- TGT Nexus CRM — 70_profiles_is_team_captain.sql
-- Fixes Team Setup save error:
--   Could not find the 'is_team_captain' column of 'profiles' in the schema cache
-- Safe to re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists is_team_captain boolean not null default false;

notify pgrst, 'reload schema';
