-- ============================================================================
-- TGT Nexus CRM — 58_docs_rework_comments_to_ops.sql
-- Persist Documentation notes / fail comments onto OPS when PM Passes
-- (especially after OPS Reworked → Docs → Closer → Docs → Pass).
-- Safe to re-run.
-- ============================================================================

alter table public.documentation_reviews
  add column if not exists pm_rework_comments text not null default '';

alter table public.ops_verifications
  add column if not exists documentation_rework_comments text not null default '';

-- Snapshot Fail reason so Closer re-close does not wipe PM comments
create or replace function private.before_documentation_change()
returns trigger
language plpgsql
as $$
begin
  if new.decision = 'Fail' and coalesce(new.fail_reason, '') = '' then
    raise exception 'Fail needs a reason.';
  end if;
  if new.decision = 'Fail' then
    new.pm_rework_comments := coalesce(new.fail_reason, '');
  end if;
  if new.decision in ('Pass', 'Fail') and new.review_date is null then
    new.review_date := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_before_documentation_change on public.documentation_reviews;
create trigger trg_before_documentation_change
before insert or update on public.documentation_reviews
for each row execute function private.before_documentation_change();

-- Closer Closed: reset decision; keep ops_rework_reasoning + pm_rework_comments
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
      -- pm_rework_comments + ops_rework_reasoning intentionally preserved
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_closer_change on public.closer_deals;
create trigger trg_after_closer_change
after insert or update on public.closer_deals
for each row execute function private.after_closer_change();

-- Pass → OPS: stamp Documentation notes + PM rework comments for OPS drawer
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

drop trigger if exists trg_after_documentation_change on public.documentation_reviews;
create trigger trg_after_documentation_change
after insert or update on public.documentation_reviews
for each row execute function private.after_documentation_change();

-- Fresh Reworked cycle: clear prior PM rework snapshot
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

drop trigger if exists trg_after_ops_change on public.ops_verifications;
create trigger trg_after_ops_change
after insert or update on public.ops_verifications
for each row execute function private.after_ops_change();
