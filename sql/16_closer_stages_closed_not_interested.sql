-- ============================================================================
-- TGT Nexus CRM — 16_closer_stages_closed_not_interested.sql
-- Rename Closed Won -> Closed; add Not Interested stage.
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

-- Drop any stage check constraint, migrate data, add new check
do $$
declare c name;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'closer_deals'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%stage%'
  loop
    execute format('alter table public.closer_deals drop constraint %I', c);
  end loop;
end $$;

update public.closer_deals
set stage = 'Closed'
where stage = 'Closed Won';

alter table public.closer_deals
  add constraint closer_deals_stage_check
  check (stage in (
    'No Answer',
    'Follow Up',
    'Docs Pending',
    'Docs Received',
    'Closed',
    'Closed Lost',
    'Not Interested'
  ));

-- Triggers: Closed (and legacy Closed Won) -> OPS; Not Interested terminal
create or replace function private.before_closer_change()
returns trigger
language plpgsql
as $$
begin
  if new.stage = 'Closed Lost' and coalesce(new.lost_reason, '') = '' then
    raise exception 'Closed Lost needs a reason.';
  end if;
  if new.stage in ('Closed', 'Closed Won', 'Not Interested') and new.closed_date is null then
    new.closed_date := current_date;
  end if;
  return new;
end;
$$;

create or replace function private.after_closer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage in ('Closed', 'Closed Won') then
    insert into public.ops_verifications
      (lead_id, closed_date, business_name, owner_name, phone, closer, monthly_volume, ops_status)
    values
      (new.lead_id, coalesce(new.closed_date, current_date), new.business_name,
       new.owner_name, new.phone, new.closer, new.monthly_volume, 'Pending')
    on conflict (lead_id) do nothing;
  end if;
  return new;
end;
$$;
