-- 36_closer_direct_leads.sql
-- Closers can create leads that skip QA / SQL and land directly in closer_deals.

-- ---------------------------------------------------------------------------
-- Origin flag on parent leads
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists lead_origin text not null default 'leadgen';

alter table public.leads drop constraint if exists leads_lead_origin_check;
alter table public.leads
  add constraint leads_lead_origin_check
  check (lead_origin in ('leadgen', 'closer_direct', 'ops_manual'));

create index if not exists idx_leads_origin on public.leads (lead_origin);

-- ---------------------------------------------------------------------------
-- Skip QA auto-create for closer-direct leads
-- ---------------------------------------------------------------------------
create or replace function private.on_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_origin = 'closer_direct' then
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

-- ---------------------------------------------------------------------------
-- RLS: closers may insert parent lead when origin is closer_direct
-- ---------------------------------------------------------------------------
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    private.sales_writer()
    or private.ops_writer()
    or private.role_key() in ('ops_verifier', 'ops_qa_onb')
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
    or (private.role_key() = 'closer' and lead_origin = 'closer_direct')
  );

-- ---------------------------------------------------------------------------
-- RLS: allow insert into closer_deals (sales writers + own closer)
-- ---------------------------------------------------------------------------
drop policy if exists closer_insert on public.closer_deals;
create policy closer_insert on public.closer_deals
  for insert to authenticated
  with check (
    private.sales_writer()
    or (private.role_key() = 'closer' and closer = private.identity())
  );
