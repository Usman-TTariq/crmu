-- ============================================================================
-- TGT Nexus CRM — 86_ops_sale_type.sql
-- Sale Type moves from QA tab to OPS QA tab (Lease / Rental / Free Rental).
-- Carries any values already entered in QA into ops_verifications, then
-- removes the QA column. Safe to re-run.
-- ============================================================================

alter table public.ops_verifications
  add column if not exists sale_type text not null default '';

alter table public.ops_verifications drop constraint if exists ops_verifications_sale_type_check;
alter table public.ops_verifications
  add constraint ops_verifications_sale_type_check
  check (sale_type in ('', 'Lease', 'Rental', 'Free Rental'));

-- Carry forward anything already picked on the QA tab.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'qa_records' and column_name = 'sale_type'
  ) then
    update public.ops_verifications o
    set sale_type = q.sale_type
    from public.qa_records q
    where q.lead_id = o.lead_id
      and coalesce(o.sale_type, '') = ''
      and coalesce(q.sale_type, '') <> '';

    alter table public.qa_records drop constraint if exists qa_records_sale_type_check;
    alter table public.qa_records drop column sale_type;
  end if;
end $$;
