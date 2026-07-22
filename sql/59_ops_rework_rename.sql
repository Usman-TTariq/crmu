-- ============================================================================
-- TGT Nexus CRM — 59_ops_rework_rename.sql
-- Rename OPS status Reworked → Rework. Safe to re-run.
-- ============================================================================

-- Allow both values briefly, migrate rows, then constrain to Rework only
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
  check (ops_status in ('Pending', 'Approved', 'Disapproved', 'Reworked', 'Rework'));

update public.ops_verifications
set ops_status = 'Rework',
    updated_at = now()
where ops_status = 'Reworked';

alter table public.ops_verifications
  drop constraint ops_verifications_ops_status_check;

alter table public.ops_verifications
  add constraint ops_verifications_ops_status_check
  check (ops_status in ('Pending', 'Approved', 'Disapproved', 'Rework'));

create or replace function private.before_ops_change()
returns trigger
language plpgsql
as $$
declare
  missing int := 0;
begin
  if new.ops_status = 'Rework' and coalesce(new.reasoning, '') = '' then
    raise exception 'Rework needs a reasoning.';
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

  if new.ops_status = 'Rework'
     and (tg_op = 'INSERT' or old.ops_status is distinct from 'Rework') then
    update public.documentation_reviews
    set decision = 'Pending',
        fail_reason = '',
        review_date = null,
        returned_after_ops_rework = true,
        ops_rework_reasoning = coalesce(new.reasoning, ''),
        pm_rework_comments = '',
        updated_at = now()
    where lead_id = new.lead_id;
  end if;

  return new;
end;
$$;

create or replace function private.after_documentation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  docs_comments text;
begin
  if new.decision = 'Pass' and (tg_op = 'INSERT' or old.decision is distinct from 'Pass') then
    docs_comments := trim(both from concat_ws(
      E'\n\n',
      nullif(trim(coalesce(new.notes, '')), ''),
      case
        when coalesce(trim(new.fail_reason), '') <> '' then
          'Fail reason: ' || trim(new.fail_reason)
        when coalesce(trim(new.pm_rework_comments), '') <> '' then
          'Fail reason: ' || trim(new.pm_rework_comments)
        else null
      end
    ));

    insert into public.ops_verifications
      (lead_id, closed_date, business_name, owner_name, phone, closer, monthly_volume,
       ops_status, documentation_rework_comments)
    values
      (new.lead_id, coalesce(new.closed_date, current_date), new.business_name,
       new.owner_name, new.phone, new.closer, new.monthly_volume, 'Pending',
       coalesce(docs_comments, ''))
    on conflict (lead_id) do update set
      closed_date = excluded.closed_date,
      business_name = excluded.business_name,
      owner_name = excluded.owner_name,
      phone = excluded.phone,
      closer = excluded.closer,
      monthly_volume = excluded.monthly_volume,
      ops_status = case
        when public.ops_verifications.ops_status = 'Rework' then 'Pending'
        else public.ops_verifications.ops_status
      end,
      documentation_rework_comments = case
        when coalesce(docs_comments, '') <> '' then docs_comments
        else public.ops_verifications.documentation_rework_comments
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
