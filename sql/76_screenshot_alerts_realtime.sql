-- ============================================================================
-- TGT Nexus CRM — 76_screenshot_alerts_realtime.sql
-- If you already ran 74_screenshot_alerts.sql, run this to enable live CEO panel refresh.
-- Safe to re-run.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and to_regclass('public.screenshot_alerts') is not null then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'screenshot_alerts'
    ) then
      alter publication supabase_realtime add table public.screenshot_alerts;
    end if;
  end if;
end $$;
