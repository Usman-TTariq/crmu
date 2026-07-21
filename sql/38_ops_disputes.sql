-- ============================================================================
-- TGT Nexus CRM — 38_ops_disputes.sql
-- OPS Disapproved → notify closer → closer dispute → AVP review → back to OPS QA.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

alter table public.ops_verifications
  add column if not exists returned_after_ops_dispute boolean not null default false;

create table if not exists public.ops_disputes (
  id           uuid primary key default gen_random_uuid(),
  lead_id      text not null references public.leads (lead_id) on delete cascade,
  opened_by    text not null default '',
  closer       text not null default '',
  reason       text not null default '',
  status       text not null default 'open'
               check (status in ('open', 'approved', 'disapproved')),
  reviewed_by  text not null default '',
  reviewed_at  timestamptz,
  review_note  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ops_disputes_lead_idx on public.ops_disputes (lead_id, created_at desc);
create index if not exists ops_disputes_status_idx on public.ops_disputes (status, created_at desc);
create index if not exists ops_disputes_closer_idx on public.ops_disputes (closer, status, created_at desc);

drop index if exists ops_disputes_one_open_per_lead;
create unique index ops_disputes_one_open_per_lead
  on public.ops_disputes (lead_id)
  where status = 'open';

alter table public.ops_disputes enable row level security;

drop policy if exists ops_disputes_select on public.ops_disputes;
create policy ops_disputes_select on public.ops_disputes
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.role_key() = 'avp_sales'
    or (private.role_key() = 'closer' and closer = private.identity())
  );

drop policy if exists ops_disputes_insert on public.ops_disputes;
drop policy if exists ops_disputes_update on public.ops_disputes;

grant select on public.ops_disputes to authenticated;

-- ---------------------------------------------------------------------------
-- Notify closer when OPS status becomes Disapproved
-- ---------------------------------------------------------------------------
create or replace function private.notify_closer_on_ops_disapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closer text;
  v_biz    text;
  v_reason text;
begin
  if new.ops_status is distinct from 'Disapproved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.ops_status is not distinct from 'Disapproved' then
    return new;
  end if;

  select coalesce(nullif(trim(c.closer), ''), nullif(trim(new.closer), ''), '')
    into v_closer
  from public.closer_deals c
  where c.lead_id = new.lead_id;

  if v_closer is null or v_closer = '' then
    v_closer := coalesce(nullif(trim(new.closer), ''), '');
  end if;

  if v_closer = '' then
    return new;
  end if;

  v_biz := coalesce(nullif(trim(new.business_name), ''), new.lead_id);
  v_reason := coalesce(nullif(trim(new.reasoning), ''), '');

  insert into public.crm_notifications (recipient_name, kind, title, body, lead_id, meta)
  values (
    v_closer,
    'ops_disqualified',
    'Disqualified by OPS',
    v_biz || ' (' || new.lead_id || ') was disapproved by OPS QA. Open to dispute with AVP if needed.',
    new.lead_id,
    jsonb_build_object(
      'business_name', v_biz,
      'ops_agent', coalesce(new.ops_agent, ''),
      'reasoning', v_reason
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_ops_notify_closer_disapprove on public.ops_verifications;
create trigger trg_ops_notify_closer_disapprove
  after insert or update of ops_status on public.ops_verifications
  for each row
  execute function private.notify_closer_on_ops_disapprove();

-- ---------------------------------------------------------------------------
-- Closer opens a dispute on an OPS-Disapproved deal
-- ---------------------------------------------------------------------------
create or replace function public.ops_dispute_open(p_lead_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me text;
  my_role text;
  ops public.ops_verifications%rowtype;
  deal public.closer_deals%rowtype;
  reason text := trim(coalesce(p_reason, ''));
  new_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  me := private.identity();
  my_role := private.role_key();

  if my_role is distinct from 'closer' then
    raise exception 'Only closers can open an OPS dispute.';
  end if;
  if reason = '' then
    raise exception 'Dispute reason is required.';
  end if;

  select * into deal from public.closer_deals where lead_id = p_lead_id;
  if not found then raise exception 'Closer deal not found.'; end if;
  if deal.closer is distinct from me then
    raise exception 'You can only dispute your own deals.';
  end if;

  select * into ops from public.ops_verifications where lead_id = p_lead_id;
  if not found then raise exception 'OPS record not found.'; end if;
  if ops.ops_status is distinct from 'Disapproved' then
    raise exception 'Only OPS-disapproved deals can be disputed.';
  end if;

  if exists (select 1 from public.ops_disputes where lead_id = p_lead_id and status = 'open') then
    raise exception 'A dispute is already open for this lead.';
  end if;

  insert into public.ops_disputes (lead_id, opened_by, closer, reason, status)
  values (p_lead_id, me, me, left(reason, 4000), 'open')
  returning id into new_id;

  return jsonb_build_object(
    'id', new_id,
    'lead_id', p_lead_id,
    'status', 'open'
  );
end;
$$;

grant execute on function public.ops_dispute_open(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AVP (or sales writer) reviews OPS dispute
-- ---------------------------------------------------------------------------
create or replace function public.ops_dispute_review(
  p_dispute_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me text;
  my_role text;
  d public.ops_disputes%rowtype;
  decision text := lower(trim(coalesce(p_decision, '')));
  note text := left(trim(coalesce(p_note, '')), 2000);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  me := private.identity();
  my_role := private.role_key();

  if my_role is distinct from 'avp_sales' and not private.sales_writer() then
    raise exception 'Only AVP Sales can review OPS disputes.';
  end if;
  if decision not in ('approved', 'disapproved') then
    raise exception 'Decision must be approved or disapproved.';
  end if;

  select * into d from public.ops_disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found.'; end if;
  if d.status is distinct from 'open' then
    raise exception 'This dispute was already reviewed.';
  end if;

  update public.ops_disputes
  set status = decision,
      reviewed_by = me,
      reviewed_at = now(),
      review_note = note,
      updated_at = now()
  where id = p_dispute_id;

  if decision = 'approved' then
    update public.ops_verifications
    set ops_status = 'Pending',
        returned_after_ops_dispute = true,
        ops_agent = '',
        updated_at = now()
    where lead_id = d.lead_id;
  end if;

  return jsonb_build_object(
    'id', p_dispute_id,
    'lead_id', d.lead_id,
    'status', decision
  );
end;
$$;

grant execute on function public.ops_dispute_review(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- List open OPS disputes (AVP / sales writers see all; closers see own)
-- ---------------------------------------------------------------------------
create or replace function public.ops_dispute_list_open()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_role text := private.role_key();
  me text := private.identity();
begin
  if my_role = 'avp_sales' or private.sales_writer() then
    return (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
      from (
        select
          d.id,
          d.lead_id,
          d.opened_by,
          d.closer,
          d.reason,
          d.status,
          d.created_at,
          coalesce(o.business_name, l.business_name, '') as business_name,
          coalesce(o.owner_name, l.owner_name, '') as owner_name
        from public.ops_disputes d
        left join public.ops_verifications o on o.lead_id = d.lead_id
        left join public.leads l on l.lead_id = d.lead_id
        where d.status = 'open'
      ) x
    );
  end if;

  if my_role = 'closer' then
    return (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
      from (
        select
          d.id,
          d.lead_id,
          d.opened_by,
          d.closer,
          d.reason,
          d.status,
          d.created_at,
          coalesce(o.business_name, '') as business_name,
          coalesce(o.owner_name, '') as owner_name
        from public.ops_disputes d
        left join public.ops_verifications o on o.lead_id = d.lead_id
        where d.status = 'open' and d.closer = me
      ) x
    );
  end if;

  return '[]'::jsonb;
end;
$$;

grant execute on function public.ops_dispute_list_open() to authenticated;
