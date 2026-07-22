-- ============================================================================
-- TGT Nexus CRM — 52_closer_intake_fields.sql
-- HubSpot-style closer intake fields on closer_deals. Safe to re-run.
-- ============================================================================

alter table public.closer_deals
  add column if not exists dba_name text not null default '',
  add column if not exists business_type text not null default '',
  add column if not exists business_category text not null default '',
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists mobile_phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists business_address text not null default '',
  add column if not exists city text not null default '',
  add column if not exists zip_code text not null default '',
  add column if not exists avg_ticket_size numeric,
  add column if not exists highest_ticket_size numeric,
  add column if not exists tin_ein text not null default '',
  add column if not exists ssn text not null default '',
  add column if not exists processing_type text not null default '',
  add column if not exists processing_rate text not null default '',
  add column if not exists provider text not null default '',
  add column if not exists equipment text not null default '',
  add column if not exists lease_amount numeric,
  add column if not exists lease_term text not null default '',
  add column if not exists shipping_address text not null default '',
  add column if not exists residential_address text not null default '';

-- Prefill name parts / email / address from existing owner_name + leads where blank
update public.closer_deals c
set
  first_name = case
    when coalesce(c.first_name, '') = '' and position(' ' in trim(c.owner_name)) > 0
      then split_part(trim(c.owner_name), ' ', 1)
    when coalesce(c.first_name, '') = '' then trim(c.owner_name)
    else c.first_name
  end,
  last_name = case
    when coalesce(c.last_name, '') = '' and position(' ' in trim(c.owner_name)) > 0
      then coalesce(
        nullif(trim(substr(trim(c.owner_name), position(' ' in trim(c.owner_name)) + 1)), ''),
        ''
      )
    else c.last_name
  end,
  email = case when coalesce(c.email, '') = '' then coalesce(l.email, '') else c.email end,
  business_address = case
    when coalesce(c.business_address, '') = '' then coalesce(l.business_address, '')
    else c.business_address
  end,
  city = case when coalesce(c.city, '') = '' then coalesce(l.city, '') else c.city end,
  zip_code = case when coalesce(c.zip_code, '') = '' then coalesce(l.zip_code, '') else c.zip_code end
from public.leads l
where l.lead_id = c.lead_id;
