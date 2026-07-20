-- ============================================================================
-- TGT Nexus CRM — 32_qa_full_lead_fields.sql
-- Copy every Lead Gen submitted field onto qa_records for the QA drawer.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

alter table public.qa_records add column if not exists email text not null default '';
alter table public.qa_records add column if not exists lead_source text not null default 'Cold Calling';
alter table public.qa_records add column if not exists business_address text not null default '';
alter table public.qa_records add column if not exists city text not null default '';
alter table public.qa_records add column if not exists zip_code text not null default '';
alter table public.qa_records add column if not exists current_processor text not null default 'None';
alter table public.qa_records add column if not exists current_device text not null default '';
alter table public.qa_records add column if not exists current_rate text not null default '';
alter table public.qa_records add column if not exists notes text not null default '';

-- Backfill from Lead Gen for existing QA rows
update public.qa_records q
set
  email = case when coalesce(q.email, '') = '' then coalesce(l.email, '') else q.email end,
  lead_source = case
    when coalesce(q.lead_source, '') in ('', 'Cold Calling') and coalesce(l.lead_source, '') <> ''
      then l.lead_source
    else q.lead_source
  end,
  business_address = case
    when coalesce(q.business_address, '') = '' then coalesce(l.business_address, '')
    else q.business_address
  end,
  city = case when coalesce(q.city, '') = '' then coalesce(l.city, '') else q.city end,
  zip_code = case when coalesce(q.zip_code, '') = '' then coalesce(l.zip_code, '') else q.zip_code end,
  current_processor = case
    when coalesce(q.current_processor, '') in ('', 'None') and coalesce(l.current_processor, '') <> ''
      then l.current_processor
    else q.current_processor
  end,
  current_device = case
    when coalesce(q.current_device, '') = '' then coalesce(l.current_device, '')
    else q.current_device
  end,
  current_rate = case
    when coalesce(q.current_rate, '') = '' then coalesce(l.current_rate, '')
    else q.current_rate
  end,
  notes = case when coalesce(q.notes, '') = '' then coalesce(l.notes, '') else q.notes end,
  business_name = case
    when coalesce(q.business_name, '') = '' then coalesce(l.business_name, '')
    else q.business_name
  end,
  owner_name = case
    when coalesce(q.owner_name, '') = '' then coalesce(l.owner_name, '')
    else q.owner_name
  end,
  phone = case when coalesce(q.phone, '') = '' then coalesce(l.phone, '') else q.phone end,
  state = case when coalesce(q.state, '') = '' then coalesce(l.state, '') else q.state end,
  monthly_volume = coalesce(q.monthly_volume, l.monthly_volume)
from public.leads l
where l.lead_id = q.lead_id;

create or replace function private.on_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.qa_records
    (lead_id, qa_date, lead_gen_agent, lead_source, business_name, owner_name, phone, email,
     business_address, city, zip_code, state, current_processor, current_device, current_rate,
     monthly_volume, notes)
  values
    (new.lead_id, new.date_created, new.lead_gen_agent, new.lead_source, new.business_name,
     new.owner_name, new.phone, new.email, new.business_address, new.city, new.zip_code,
     new.state, new.current_processor, new.current_device, new.current_rate,
     new.monthly_volume, new.notes)
  on conflict (lead_id) do nothing;
  return new;
end;
$$;
