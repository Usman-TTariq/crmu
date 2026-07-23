-- ============================================================================
-- TGT Nexus CRM — 84_qa_sale_type.sql
-- QA tab: Sale Type dropdown (Lease / Rental / Free Rental).
-- Safe to re-run.
-- ============================================================================

alter table public.qa_records
  add column if not exists sale_type text not null default '';

alter table public.qa_records drop constraint if exists qa_records_sale_type_check;
alter table public.qa_records
  add constraint qa_records_sale_type_check
  check (sale_type in ('', 'Lease', 'Rental', 'Free Rental'));
