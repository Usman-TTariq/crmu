-- ============================================================================
-- TGT Nexus CRM — 75_closer_lead_source.sql
-- Closer Pipeline "Lead Source" (SQL / SQL - LT / Self Generated / Referral / Upsell).
-- Separate from leads.lead_source which is now "Data Source".
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

alter table public.closer_deals
  add column if not exists closer_lead_source text not null default '';

-- Backfill from leads when the old closer-only values were stored on lead_source
update public.closer_deals c
set closer_lead_source = l.lead_source
from public.leads l
where l.lead_id = c.lead_id
  and coalesce(c.closer_lead_source, '') = ''
  and l.lead_source in ('Referral', 'Self Generated', 'Upsell', 'SQL', 'SQL - LT');

-- Closer-direct deals without a match: default Referral if still blank
update public.closer_deals c
set closer_lead_source = 'Referral'
from public.leads l
where l.lead_id = c.lead_id
  and coalesce(c.closer_lead_source, '') = ''
  and coalesce(l.lead_origin, '') = 'closer_direct';

-- Existing SQL-pipeline deals: SQL - LT when Data Source was Live Transfer, else SQL
update public.closer_deals c
set closer_lead_source = case
  when trim(coalesce(l.lead_source, '')) = 'Live Transfer' then 'SQL - LT'
  else 'SQL'
end
from public.leads l
where l.lead_id = c.lead_id
  and coalesce(c.closer_lead_source, '') = ''
  and coalesce(l.lead_origin, '') <> 'closer_direct';

-- SQL Assigned → auto-create closer deal with Lead Source SQL / SQL - LT
create or replace function private.on_sql_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  src text;
  closer_src text;
begin
  if new.sql_status = 'Assigned' and new.assigned_closer <> '' then
    select coalesce(lead_source, '') into src
    from public.leads
    where lead_id = new.lead_id;

    closer_src := case
      when trim(src) = 'Live Transfer' then 'SQL - LT'
      else 'SQL'
    end;

    insert into public.closer_deals
      (lead_id, business_name, owner_name, phone, state, monthly_volume,
       assigned_date, closer, stage, closer_lead_source)
    values
      (new.lead_id, new.business_name, new.owner_name, new.phone, new.state,
       new.monthly_volume, coalesce(new.assignment_date, current_date),
       new.assigned_closer, 'No Answer', closer_src)
    on conflict (lead_id) do update
      set closer_lead_source = case
        when coalesce(public.closer_deals.closer_lead_source, '') = ''
          then excluded.closer_lead_source
        else public.closer_deals.closer_lead_source
      end;
  end if;
  return new;
end;
$$;
