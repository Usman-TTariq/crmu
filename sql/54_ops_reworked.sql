-- ============================================================================
-- TGT Nexus CRM — 54_ops_reworked.sql
-- OPS status Reworked → return to Documentation (highlight + reasoning).
-- Pass after Reworked resets OPS to Pending. Safe to re-run.
-- ============================================================================

-- Docs: rework return flag + OPS reasoning snapshot
alter table public.documentation_reviews
  add column if not exists returned_after_ops_rework boolean not null default false,
  add column if not exists ops_rework_reasoning text not null default '';

-- OPS status check: allow Reworked
do $$
declare
  c name;
begin
  select con.conname into c
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'ops_verifications'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%ops_status%';
  if c is not null then
    execute format('alter table public.ops_verifications drop constraint %I', c);
  end if;
end $$;

alter table public.ops_verifications
  add constraint ops_verifications_ops_status_check
  check (ops_status in ('Pending', 'Approved', 'Disapproved', 'Reworked'));

-- ---------------------------------------------------------------------------
-- OPS before: Reworked needs reasoning
-- ---------------------------------------------------------------------------
create or replace function private.before_ops_change()
returns trigger
language plpgsql
as $$
declare
  missing int := 0;
begin
  if new.ops_status = 'Reworked' and coalesce(new.reasoning, '') = '' then
    raise exception 'Reworked needs a reasoning.';
  end if;

  if new.ops_status = 'Approved' then
    select count(*) into missing
    from (values (new.dl_recd), (new.voided_check), (new.bank_stmt),
                 (new.owner_name_verified), (new.owner_phone_verified),
                 (new.business_verified)) as checks(v)
    where v <> 'Yes';

    if missing > 0 then
      new.ops_status := 'Disapproved';
      if coalesce(new.reasoning, '') = '' then
        new.reasoning := missing || ' item(s) unverified';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- OPS after: Approved → MSP; Reworked → Docs Pending + highlight
-- ---------------------------------------------------------------------------
create or replace function private.after_ops_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ops_status = 'Approved'
     and (tg_op = 'INSERT' or old.ops_status is distinct from 'Approved') then
    insert into public.msp_onboarding
      (lead_id, business_name, owner_name, monthly_volume, ops_approved_date, final_status)
    values
      (new.lead_id, new.business_name, new.owner_name, new.monthly_volume,
       coalesce(new.ops_date, current_date), 'Pending')
    on conflict (lead_id) do nothing;
  end if;

  if new.ops_status = 'Reworked'
     and (tg_op = 'INSERT' or old.ops_status is distinct from 'Reworked') then
    update public.documentation_reviews
    set decision = 'Pending',
        fail_reason = '',
        review_date = null,
        returned_after_ops_rework = true,
        ops_rework_reasoning = coalesce(new.reasoning, ''),
        updated_at = now()
    where lead_id = new.lead_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_ops_change on public.ops_verifications;
create trigger trg_after_ops_change
after insert or update on public.ops_verifications
for each row execute function private.after_ops_change();

-- ---------------------------------------------------------------------------
-- Docs Pass: create OPS or reset Reworked → Pending; clear rework highlight
-- ---------------------------------------------------------------------------
create or replace function private.after_documentation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decision = 'Pass' and (tg_op = 'INSERT' or old.decision is distinct from 'Pass') then
    insert into public.ops_verifications
      (lead_id, closed_date, business_name, owner_name, phone, closer, monthly_volume, ops_status)
    values
      (new.lead_id, coalesce(new.closed_date, current_date), new.business_name,
       new.owner_name, new.phone, new.closer, new.monthly_volume, 'Pending')
    on conflict (lead_id) do update set
      closed_date = excluded.closed_date,
      business_name = excluded.business_name,
      owner_name = excluded.owner_name,
      phone = excluded.phone,
      closer = excluded.closer,
      monthly_volume = excluded.monthly_volume,
      ops_status = case
        when public.ops_verifications.ops_status = 'Reworked' then 'Pending'
        else public.ops_verifications.ops_status
      end,
      updated_at = now();

    update public.documentation_reviews
    set returned_after_ops_rework = false,
        updated_at = now()
    where lead_id = new.lead_id
      and returned_after_ops_rework = true;
  end if;

  if new.decision = 'Fail' and (tg_op = 'INSERT' or old.decision is distinct from 'Fail') then
    update public.closer_deals
    set stage = 'Docs Pending',
        updated_at = now()
    where lead_id = new.lead_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_documentation_change on public.documentation_reviews;
create trigger trg_after_documentation_change
after insert or update on public.documentation_reviews
for each row execute function private.after_documentation_change();

-- ---------------------------------------------------------------------------
-- Closer Closed: reset docs; clear rework highlight; keep ops_rework_reasoning
-- ---------------------------------------------------------------------------
create or replace function private.after_closer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage in ('Closed', 'Closed Won') then
    insert into public.documentation_reviews
      (lead_id, closed_date, business_name, owner_name, phone, state,
       monthly_volume, closer, decision)
    values
      (new.lead_id, coalesce(new.closed_date, current_date), new.business_name,
       new.owner_name, new.phone, new.state, new.monthly_volume, new.closer, 'Pending')
    on conflict (lead_id) do update set
      closed_date    = excluded.closed_date,
      business_name  = excluded.business_name,
      owner_name     = excluded.owner_name,
      phone          = excluded.phone,
      state          = excluded.state,
      monthly_volume = excluded.monthly_volume,
      closer         = excluded.closer,
      decision       = 'Pending',
      fail_reason    = '',
      review_date    = null,
      returned_after_ops_rework = false,
      updated_at     = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_closer_change on public.closer_deals;
create trigger trg_after_closer_change
after insert or update on public.closer_deals
for each row execute function private.after_closer_change();
