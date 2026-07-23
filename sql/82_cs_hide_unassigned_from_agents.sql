-- ============================================================================
-- TGT Nexus CRM — 82_cs_hide_unassigned_from_agents.sql
-- Unassigned Customer Success rows (agent_name = '') must NOT appear on
-- every cs_agent portal. Only cs_head / cs_lead / managers see the queue
-- until assigned. Agents keep access when they are agent or substitute.
-- Safe to re-run.
-- ============================================================================

drop policy if exists retention_select on public.retention;
create policy retention_select on public.retention
  for select to authenticated
  using (
    private.is_manager()
    or private.pipeline_viewer()
    or private.role_key() in ('sales_head','cs_head','cs_lead','ops_qa_onb')
    or (
      private.role_key() = 'cs_agent'
      and (
        agent_name = private.identity()
        or substitute = private.identity()
      )
    )
  );

drop policy if exists retention_update on public.retention;
create policy retention_update on public.retention
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() in ('cs_head','cs_lead')
    or (
      private.role_key() = 'cs_agent'
      and (
        agent_name = private.identity()
        or substitute = private.identity()
      )
    )
  )
  with check (
    private.ops_writer()
    or private.role_key() in ('cs_head','cs_lead')
    or (
      private.role_key() = 'cs_agent'
      and (
        agent_name = private.identity()
        or substitute = private.identity()
      )
    )
  );
