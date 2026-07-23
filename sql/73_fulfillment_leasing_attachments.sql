-- ============================================================================
-- TGT Nexus CRM — 73_fulfillment_leasing_attachments.sql
-- Fulfillment + Leasing see Closer / Docs / OPS / Onboarding documents
-- (and can attach their own). Safe to re-run.
-- ============================================================================

alter table public.attachments drop constraint if exists attachments_stage_check;
alter table public.attachments
  add constraint attachments_stage_check
  check (stage in (
    'closer', 'ops', 'documentation', 'msp', 'fulfillment', 'leasing'
  ));

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (
    exists (select 1 from public.closer_deals cd where cd.lead_id = attachments.lead_id)
    or exists (
      select 1 from public.documentation_reviews d where d.lead_id = attachments.lead_id
    )
    or exists (
      select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id
    )
    or exists (
      select 1 from public.msp_onboarding m where m.lead_id = attachments.lead_id
    )
    or exists (
      select 1 from public.fulfillment f where f.lead_id = attachments.lead_id
    )
    or exists (
      select 1 from public.leasing l where l.lead_id = attachments.lead_id
    )
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      (stage = 'closer' and exists (
        select 1 from public.closer_deals cd where cd.lead_id = attachments.lead_id
      ))
      or (stage = 'documentation' and exists (
        select 1 from public.documentation_reviews d where d.lead_id = attachments.lead_id
      ))
      or (stage = 'ops' and exists (
        select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id
      ))
      or (stage = 'msp' and exists (
        select 1 from public.msp_onboarding m where m.lead_id = attachments.lead_id
      ))
      or (stage = 'fulfillment' and exists (
        select 1 from public.fulfillment f where f.lead_id = attachments.lead_id
      ))
      or (stage = 'leasing' and exists (
        select 1 from public.leasing l where l.lead_id = attachments.lead_id
      ))
    )
  );
