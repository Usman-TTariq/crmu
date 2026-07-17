-- ============================================================================
-- TGT Nexus CRM — 13_audit_edit_tracking.sql
-- Track who last edited leads / closer deals (updated_by), plus created_by on closer.
-- Paste into the Supabase SQL editor and run.
-- ============================================================================

alter table public.leads
  add column if not exists updated_by uuid references auth.users (id);

alter table public.closer_deals
  add column if not exists created_by uuid references auth.users (id);

alter table public.closer_deals
  add column if not exists updated_by uuid references auth.users (id);

create or replace function private.set_row_audit_user()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    return new;
  end if;

  -- UPDATE
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_audit_leads on public.leads;
create trigger trg_audit_leads
  before insert or update on public.leads
  for each row execute function private.set_row_audit_user();

drop trigger if exists trg_audit_closer_deals on public.closer_deals;
create trigger trg_audit_closer_deals
  before insert or update on public.closer_deals
  for each row execute function private.set_row_audit_user();

-- Prefer audit trigger for updated_at on these tables (avoid double-touch race)
drop trigger if exists trg_touch_leads on public.leads;
drop trigger if exists trg_touch_closer_deals on public.closer_deals;
