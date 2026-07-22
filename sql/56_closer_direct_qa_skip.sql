-- ============================================================================
-- TGT Nexus CRM — 56_closer_direct_qa_skip.sql
-- Ensure closer-direct / ops-manual leads skip auto QA create.
-- Safe to re-run (re-applies on_lead_insert).
-- ============================================================================

create or replace function private.on_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_origin in ('closer_direct', 'ops_manual') then
    return new;
  end if;

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
