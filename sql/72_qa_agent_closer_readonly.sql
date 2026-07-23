-- ============================================================================
-- TGT Nexus CRM — 72_qa_agent_closer_readonly.sql
-- Sales QA (qa_agent): read-only Closer Pipeline (all deals) to monitor
-- SQLs not yet converted. No insert/update on closer_deals. Safe to re-run.
-- ============================================================================

drop policy if exists closer_select on public.closer_deals;
create policy closer_select on public.closer_deals
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.role_key() = 'qa_agent'
    or (private.role_key() = 'closer' and closer = private.identity())
  );

-- Roster: Perpetual D'Cruz — Sales QA
insert into public.profiles (full_name, title, dept, team, role_key, target, is_active)
values (
  'Perpetual D''Cruz',
  'QA Agent',
  'SALES',
  '',
  'qa_agent',
  '',
  true
)
on conflict (full_name) do update
set title = excluded.title,
    dept = excluded.dept,
    role_key = excluded.role_key,
    is_active = true,
    updated_at = now();
