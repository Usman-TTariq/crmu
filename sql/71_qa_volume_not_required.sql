-- ============================================================================
-- TGT Nexus CRM — 71_qa_volume_not_required.sql
-- Confirm: monthly volume is NOT checked on Qualify / Disqualify.
-- Only the 5 Yes/No fields must be Yes to Qualify. Safe to re-run.
-- ============================================================================

create or replace function private.on_qa_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.qa_decision = 'Qualified' then
    if new.us_business  <> 'Yes' or new.owner_reached  <> 'Yes'
    or new.interested   <> 'Yes' or new.physical_loc   <> 'Yes'
    or new.not_restricted <> 'Yes' then
      raise exception 'Cannot qualify: the 5 Yes/No checks must all be Yes. Monthly volume does not matter.';
    end if;

    insert into public.sql_assignments
      (lead_id, qa_date, business_name, owner_name, phone, state, monthly_volume, sql_status)
    values
      (new.lead_id, new.qa_date, new.business_name, new.owner_name,
       new.phone, new.state, new.monthly_volume, 'Pending')
    on conflict (lead_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_qa_change on public.qa_records;
create trigger trg_qa_change
after insert or update on public.qa_records
for each row execute function private.on_qa_change();
