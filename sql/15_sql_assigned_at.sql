-- ============================================================================
-- TGT Nexus CRM — 15_sql_assigned_at.sql
-- Exact timestamp when a SQL is assigned to a closer.
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

alter table public.sql_assignments
  add column if not exists assigned_at timestamptz;

create or replace function private.stamp_sql_assigned_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Stamp the first time status becomes Assigned (or backfill if already Assigned with no stamp)
  if new.sql_status = 'Assigned' then
    if tg_op = 'INSERT' or old.sql_status is distinct from 'Assigned' or new.assigned_at is null then
      new.assigned_at := coalesce(new.assigned_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sql_assigned_at on public.sql_assignments;
create trigger trg_sql_assigned_at
  before insert or update on public.sql_assignments
  for each row execute function private.stamp_sql_assigned_at();

-- Existing Assigned rows: approximate from last update / create
update public.sql_assignments
set assigned_at = coalesce(updated_at, created_at)
where sql_status = 'Assigned'
  and assigned_at is null;
