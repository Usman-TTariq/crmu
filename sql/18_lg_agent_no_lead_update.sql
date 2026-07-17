-- ============================================================================
-- TGT Nexus CRM — 18_lg_agent_no_lead_update.sql
-- Lead Gen agents can create leads but cannot update them afterward.
-- They may still add append-only lead_comments. Safe to re-run.
-- ============================================================================

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (private.sales_writer())
  with check (private.sales_writer());
