-- ============================================================================
-- TGT Nexus CRM — 80_ops_qa_onb_leasing_edit.sql
-- ops_qa_onb (Rida Waseem): keep OPS QA + Onboarding edit; add Leasing edit.
-- Safe to re-run.
-- ============================================================================

drop policy if exists leasing_update on public.leasing;
create policy leasing_update on public.leasing
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() in ('onboarding_lead', 'ops_qa_onb')
  )
  with check (
    private.ops_writer()
    or private.role_key() in ('onboarding_lead', 'ops_qa_onb')
  );
