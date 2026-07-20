-- ============================================================================
-- TGT Nexus CRM — 31_qa_email.sql
-- Add email to QA records (shown in QA drawer). Copy from leads on create + backfill.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

alter table public.qa_records
  add column if not exists email text not null default '';

-- Backfill from Lead Gen for existing QA rows
update public.qa_records q
set email = coalesce(l.email, '')
from public.leads l
where l.lead_id = q.lead_id
  and coalesce(q.email, '') = ''
  and coalesce(l.email, '') <> '';

create or replace function private.on_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.qa_records
    (lead_id, qa_date, lead_gen_agent, business_name, owner_name, phone, email, state, monthly_volume)
  values
    (new.lead_id, new.date_created, new.lead_gen_agent, new.business_name,
     new.owner_name, new.phone, new.email, new.state, new.monthly_volume)
  on conflict (lead_id) do nothing;
  return new;
end;
$$;
