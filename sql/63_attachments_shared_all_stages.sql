-- Bidirectional document visibility: Closer ↔ Docs ↔ OPS QA.
-- Re-run safe. Supersedes the narrower policy from sql/62 if already applied.

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
  );
