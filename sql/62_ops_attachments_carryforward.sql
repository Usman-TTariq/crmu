-- OPS QA / Documentation must see Closer-uploaded documents.
-- Previously attachments_select only allowed closer-stage rows when the
-- viewer could SELECT closer_deals (OPS agents often cannot), so OPS QA
-- showed "No documents attached" even when DL / cheque existed.

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (
    -- Closer uploads: visible to anyone who can see the closer deal,
    -- OR anyone who can see Docs / OPS for that lead (carry-forward).
    (
      stage = 'closer'
      and (
        exists (select 1 from public.closer_deals cd where cd.lead_id = attachments.lead_id)
        or exists (
          select 1 from public.documentation_reviews d where d.lead_id = attachments.lead_id
        )
        or exists (
          select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id
        )
      )
    )
    or (
      stage = 'documentation'
      and exists (
        select 1 from public.documentation_reviews d where d.lead_id = attachments.lead_id
      )
    )
    or (
      stage = 'ops'
      and exists (
        select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id
      )
    )
  );
