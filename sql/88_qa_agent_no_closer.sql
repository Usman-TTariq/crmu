-- ============================================================================
-- TGT Nexus CRM — 88_qa_agent_no_closer.sql
-- Sales QA (qa_agent) should only see the QA pipeline. Removes the read-only
-- Closer Pipeline access granted in 72 (kept by 77). Safe to re-run.
-- ============================================================================

drop policy if exists closer_select on public.closer_deals;
create policy closer_select on public.closer_deals
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.ops_journey_reader()
    or private.ops_qa_agent_can_read_lead(lead_id)
    or (private.role_key() = 'closer' and closer = private.identity())
  );
