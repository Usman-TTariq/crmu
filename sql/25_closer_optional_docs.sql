-- ============================================================================
-- TGT Nexus CRM — 25_closer_optional_docs.sql
-- Closer: 4 optional typed docs besides DL + Voided Cheque.
-- Safe to re-run.
-- ============================================================================

alter table public.attachments drop constraint if exists attachments_doc_type_check;
alter table public.attachments
  add constraint attachments_doc_type_check
  check (
    doc_type is null
    or doc_type in (
      'driving_license',
      'voided_cheque',
      'bank_statement',
      'business_license',
      'proof_of_address',
      'processing_statement',
      'other'
    )
  );

drop index if exists idx_attachments_lead_stage_doctype;
create unique index if not exists idx_attachments_lead_stage_doctype
  on public.attachments (lead_id, stage, doc_type)
  where doc_type in (
    'driving_license',
    'voided_cheque',
    'bank_statement',
    'business_license',
    'proof_of_address',
    'processing_statement'
  );
