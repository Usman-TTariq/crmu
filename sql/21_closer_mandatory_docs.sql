-- ============================================================================
-- TGT Nexus CRM — 21_closer_mandatory_docs.sql
-- Closer must upload Driving License + Voided Cheque before
-- Docs Received / Closed. Safe to re-run.
-- ============================================================================

alter table public.attachments
  add column if not exists doc_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attachments_doc_type_check'
  ) then
    alter table public.attachments
      add constraint attachments_doc_type_check
      check (doc_type is null or doc_type in ('driving_license', 'voided_cheque', 'other'));
  end if;
end $$;

create unique index if not exists idx_attachments_lead_stage_doctype
  on public.attachments (lead_id, stage, doc_type)
  where doc_type in ('driving_license', 'voided_cheque');

create or replace function private.before_closer_change()
returns trigger
language plpgsql
as $$
declare
  has_dl boolean;
  has_void boolean;
begin
  if new.stage = 'Closed Lost' and coalesce(new.lost_reason, '') = '' then
    raise exception 'Closed Lost needs a reason.';
  end if;

  if new.stage in ('Docs Received', 'Closed', 'Closed Won') then
    select
      exists (
        select 1 from public.attachments a
        where a.lead_id = new.lead_id
          and a.stage = 'closer'
          and a.doc_type = 'driving_license'
      ),
      exists (
        select 1 from public.attachments a
        where a.lead_id = new.lead_id
          and a.stage = 'closer'
          and a.doc_type = 'voided_cheque'
      )
    into has_dl, has_void;

    if not has_dl or not has_void then
      raise exception
        'Driving License and Voided Cheque are required before Docs Received or Closed.';
    end if;
  end if;

  if new.stage in ('Closed', 'Closed Won', 'Not Interested') and new.closed_date is null then
    new.closed_date := current_date;
  end if;
  return new;
end;
$$;
