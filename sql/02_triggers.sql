-- ============================================================================
-- TGT Nexus CRM — 02_triggers.sql
-- Business rules and stage auto-advance, ported from the prototype's
-- saveRecord / advanceCond logic. Run after 01_schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rule 1: New lead -> auto-create QA record (Pending)
-- ---------------------------------------------------------------------------
create or replace function private.on_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Closer-direct / OPS-manual leads skip auto QA
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

drop trigger if exists trg_lead_insert on public.leads;
create trigger trg_lead_insert
after insert on public.leads
for each row execute function private.on_lead_insert();

-- ---------------------------------------------------------------------------
-- Rule 2: QA Qualified requires 5 Yes/No checks (volume is informational only).
--         Qualified -> auto-create SQL assignment.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Rule 3: SQL Assigned + closer set -> auto-create closer deal (No Answer)
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_sql_change on public.sql_assignments;
create trigger trg_sql_change
after insert or update on public.sql_assignments
for each row execute function private.on_sql_change();

-- ---------------------------------------------------------------------------
-- Rule 4: Closer — Closed Lost needs a reason; Closed sets closed_date
--         and auto-creates the OPS verification record. Not Interested
--         is a terminal stage (no OPS).
-- ---------------------------------------------------------------------------
create or replace function private.before_closer_change()
returns trigger
language plpgsql
as $$
declare
  has_dl boolean;
  has_void boolean;
begin
  if new.stage = 'Closed Lost' and coalesce(new.lost_reason, '') = '' then
    raise exception 'Closed Lost needs a reason.';
  end if;

  -- Driving License + Voided Cheque required before Docs Received / Closed
  if new.stage in ('Docs Received', 'Closed', 'Closed Won') then
    select
      exists (
        select 1 from public.attachments a
        where a.lead_id = new.lead_id
          and a.stage = 'closer'
          and a.doc_type = 'driving_license'
      ),
      exists (
        select 1 from public.attachments a
        where a.lead_id = new.lead_id
          and a.stage = 'closer'
          and a.doc_type = 'voided_cheque'
      )
    into has_dl, has_void;

    if not has_dl or not has_void then
      raise exception
        'Driving License and Voided Cheque are required before Docs Received or Closed.';
    end if;
  end if;

  if new.stage in ('Closed', 'Closed Won', 'Not Interested') and new.closed_date is null then
    new.closed_date := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_before_closer_change on public.closer_deals;
create trigger trg_before_closer_change
before insert or update on public.closer_deals
for each row execute function private.before_closer_change();

create or replace function private.after_closer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Closed → Documentation (OPS is created only after Documentation Pass)
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

-- ---------------------------------------------------------------------------
-- Rule 4b: Documentation — Fail needs reason; Pass → OPS; Fail → Closer Docs Pending
-- ---------------------------------------------------------------------------
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

create or replace function private.after_documentation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  docs_comments text;
  was_rework boolean := false;
  fail_body text;
begin
  if new.decision = 'Pass' and (tg_op = 'INSERT' or old.decision is distinct from 'Pass') then
    select (o.ops_status = 'Rework') into was_rework
    from public.ops_verifications o
    where o.lead_id = new.lead_id;

    was_rework := coalesce(was_rework, false)
      or coalesce(new.returned_after_ops_rework, false);

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
      reasoning = case
        when public.ops_verifications.ops_status = 'Rework' then
          coalesce(
            nullif(trim(public.ops_verifications.reasoning), ''),
            nullif(trim(new.ops_rework_reasoning), ''),
            public.ops_verifications.reasoning
          )
        else public.ops_verifications.reasoning
      end,
      documentation_rework_comments = case
        when coalesce(docs_comments, '') <> '' then docs_comments
        else public.ops_verifications.documentation_rework_comments
      end,
      updated_at = now();

    if was_rework and coalesce(docs_comments, '') <> '' then
      insert into public.lead_comments (lead_id, author, body)
      values (
        new.lead_id,
        coalesce(nullif(trim(new.pm_name), ''), 'Documentation'),
        '[Documentation Pass]' || E'\n' || docs_comments
      );
    end if;

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

    fail_body := coalesce(nullif(trim(new.fail_reason), ''), nullif(trim(new.notes), ''));
    if fail_body is not null then
      insert into public.lead_comments (lead_id, author, body)
      values (
        new.lead_id,
        coalesce(nullif(trim(new.pm_name), ''), 'Documentation'),
        '[Documentation Fail]' || E'\n' || fail_body
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_documentation_change on public.documentation_reviews;
create trigger trg_after_documentation_change
after insert or update on public.documentation_reviews
for each row execute function private.after_documentation_change();

-- ---------------------------------------------------------------------------
-- Rule 5: OPS — Approve requires DL Recd + Voided Cheque = Yes only.
--         Other verify fields are optional. Approved -> MSP onboarding.
-- ---------------------------------------------------------------------------
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
    from (values (new.dl_recd), (new.voided_check)) as checks(v)
    where v <> 'Yes';

    if missing > 0 then
      new.ops_status := 'Disapproved';
      if coalesce(new.reasoning, '') = '' then
        new.reasoning := 'DL Recd and Voided Cheque must both be Yes to approve';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_before_ops_change on public.ops_verifications;
create trigger trg_before_ops_change
before insert or update on public.ops_verifications
for each row execute function private.before_ops_change();

create or replace function private.after_ops_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rework_body text;
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

    if coalesce(trim(new.reasoning), '') <> '' then
      rework_body := '[OPS Rework]' || E'\n' || trim(new.reasoning);
      if not exists (
        select 1 from public.lead_comments c
        where c.lead_id = new.lead_id and c.body = rework_body
      ) then
        insert into public.lead_comments (lead_id, author, body)
        values (
          new.lead_id,
          coalesce(nullif(trim(new.ops_agent), ''), 'OPS QA'),
          rework_body
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_ops_change on public.ops_verifications;
create trigger trg_after_ops_change
after insert or update on public.ops_verifications
for each row execute function private.after_ops_change();

-- ---------------------------------------------------------------------------
-- Rule 6: MSP — any attempt Yes forces Approved (+approved_date);
--         otherwise Pending unless Archived. Approved -> create fulfillment.
-- ---------------------------------------------------------------------------
create or replace function private.before_msp_change()
returns trigger
language plpgsql
as $$
begin
  if new.final_status <> 'Archived' then
    if new.a1_result = 'Yes' or new.a2_result = 'Yes' or new.a3_result = 'Yes' then
      new.final_status := 'Approved';
      if new.approved_date is null then
        new.approved_date := current_date;
      end if;
    else
      new.final_status := 'Pending';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_before_msp_change on public.msp_onboarding;
create trigger trg_before_msp_change
before insert or update on public.msp_onboarding
for each row execute function private.before_msp_change();

create or replace function private.after_msp_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.final_status = 'Approved' then
    insert into public.fulfillment
      (lead_id, funded_date, business_name, owner_name, fulfillment_stage)
    values
      (new.lead_id, coalesce(new.approved_date, current_date),
       new.business_name, new.owner_name, 'Pending')
    on conflict (lead_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_msp_change on public.msp_onboarding;
create trigger trg_after_msp_change
after insert or update on public.msp_onboarding
for each row execute function private.after_msp_change();

-- ---------------------------------------------------------------------------
-- Rule 7: Fulfillment created -> also open Leasing record (mirrors prototype
--         flow where leasing follows fulfillment in the pipeline)
-- ---------------------------------------------------------------------------
create or replace function private.on_fulfillment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leasing (lead_id, business_name, owner_name, funding_status)
  values (new.lead_id, new.business_name, new.owner_name, 'Pending')
  on conflict (lead_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_fulfillment_insert on public.fulfillment;
create trigger trg_fulfillment_insert
after insert on public.fulfillment
for each row execute function private.on_fulfillment_insert();

-- ---------------------------------------------------------------------------
-- Rule 8: Leasing Funded -> auto-create Customer Success record (Active)
-- ---------------------------------------------------------------------------
create or replace function private.on_leasing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.funding_status = 'Funded' then
    if new.funding_date is null then
      new.funding_date := coalesce(new.order_activation, current_date);
    end if;
    insert into public.retention (lead_id, business_name, team, status)
    values (new.lead_id, new.business_name, 'Customer Success', 'Active')
    on conflict (lead_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leasing_change on public.leasing;
create trigger trg_leasing_change
before insert or update on public.leasing
for each row execute function private.on_leasing_change();

-- ---------------------------------------------------------------------------
-- Rule 9: Retention comments are append-only (no update/delete for anyone
--         except via service role)
-- ---------------------------------------------------------------------------
create or replace function private.block_comment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Comments are append-only and cannot be edited or deleted.';
end;
$$;

drop trigger if exists trg_comments_no_update on public.retention_comments;
create trigger trg_comments_no_update
before update or delete on public.retention_comments
for each row execute function private.block_comment_mutation();

drop trigger if exists trg_lead_comments_no_update on public.lead_comments;
create trigger trg_lead_comments_no_update
before update or delete on public.lead_comments
for each row execute function private.block_comment_mutation();

-- ---------------------------------------------------------------------------
-- Fatal-error helper (SLA): 2nd/3rd attempt more than 24h after a failure,
-- or a failure left unaddressed for more than 24h. Computed, not stored.
-- ---------------------------------------------------------------------------
create or replace function public.msp_is_fatal(r public.msp_onboarding)
returns boolean
language plpgsql
stable
as $$
begin
  if r.final_status in ('Approved', 'Archived') then
    return false;
  end if;

  if r.a1_result = 'No' then
    if r.a2_result = '' or r.a2_result is null then
      if r.a1_date is not null and (current_date - r.a1_date) > 1 then
        return true;
      end if;
    elsif r.a2_date is not null and r.a1_date is not null
      and (r.a2_date - r.a1_date) > 1 then
      return true;
    end if;
  end if;

  if r.a2_result = 'No' then
    if r.a3_result = '' or r.a3_result is null then
      if r.a2_date is not null and (current_date - r.a2_date) > 1 then
        return true;
      end if;
    elsif r.a3_date is not null and r.a2_date is not null
      and (r.a3_date - r.a2_date) > 1 then
      return true;
    end if;
  end if;

  return false;
end;
$$;
