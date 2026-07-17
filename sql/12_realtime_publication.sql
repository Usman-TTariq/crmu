-- ============================================================================
-- TGT Nexus CRM — 12_realtime_publication.sql
-- Enable Supabase Realtime (postgres_changes) for pipeline list tabs ONLY.
-- App listens in PipelinePage via TAB_TABLE — one channel per open tab.
--
-- INCLUDE (10):
--   leads, qa_records, sql_assignments, closer_deals, documentation_reviews,
--   ops_verifications, msp_onboarding, fulfillment, leasing, retention
--
-- DO NOT add (no client subscriber; wastes Realtime fan-out):
--   lead_comments, retention_comments, attachments, profiles, teams
--
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

do $$
declare
  t text;
  pipeline text[] := array[
    'leads',
    'qa_records',
    'sql_assignments',
    'closer_deals',
    'documentation_reviews',
    'ops_verifications',
    'msp_onboarding',
    'fulfillment',
    'leasing',
    'retention'
  ];
  skip text[] := array[
    'lead_comments',
    'retention_comments',
    'attachments',
    'profiles',
    'teams'
  ];
begin
  foreach t in array pipeline loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      continue;
    end if;
    if to_regclass('public.' || t) is null then
      raise notice 'skip add % — table missing', t;
      continue;
    end if;
    execute format('alter publication supabase_realtime add table public.%I', t);
    raise notice 'added % to supabase_realtime', t;
  end loop;

  -- Keep publication lean if these were added by mistake
  foreach t in array skip loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
      raise notice 'removed % from supabase_realtime (not used by app)', t;
    end if;
  end loop;
end $$;
