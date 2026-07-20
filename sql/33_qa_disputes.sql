-- ============================================================================
-- TGT Nexus CRM — 33_qa_disputes.sql
-- Disqualified → Lead Gen dispute → Supervisor approve/disapprove → QA reopen.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

alter table public.qa_records
  add column if not exists returned_after_dispute boolean not null default false;

create table if not exists public.qa_disputes (
  id           uuid primary key default gen_random_uuid(),
  lead_id      text not null references public.leads (lead_id) on delete cascade,
  opened_by    text not null default '',
  team         text not null default '',
  reason       text not null default '',
  status       text not null default 'open'
               check (status in ('open', 'approved', 'disapproved')),
  reviewed_by  text not null default '',
  reviewed_at  timestamptz,
  review_note  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists qa_disputes_lead_idx on public.qa_disputes (lead_id, created_at desc);
create index if not exists qa_disputes_team_status_idx on public.qa_disputes (team, status, created_at desc);

drop index if exists qa_disputes_one_open_per_lead;
create unique index qa_disputes_one_open_per_lead
  on public.qa_disputes (lead_id)
  where status = 'open';

alter table public.qa_disputes enable row level security;

drop policy if exists qa_disputes_select on public.qa_disputes;
create policy qa_disputes_select on public.qa_disputes
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or (private.role_key() = 'lg_agent' and opened_by = private.identity())
    or (private.role_key() = 'lg_sup' and team = private.my_team())
  );

-- Mutations only via RPCs (security definer)
drop policy if exists qa_disputes_insert on public.qa_disputes;
drop policy if exists qa_disputes_update on public.qa_disputes;

grant select on public.qa_disputes to authenticated;

-- Keep returned_after_dispute permanently once set (history marker).
-- Do not clear on Qualified / Disqualified.
drop trigger if exists trg_clear_returned_after_dispute on public.qa_records;

-- Lead Gen opens a dispute on a Disqualified lead
create or replace function public.dispute_open(p_lead_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me text;
  my_role text;
  my_team text;
  qa public.qa_records%rowtype;
  lead_row public.leads%rowtype;
  reason text := trim(coalesce(p_reason, ''));
  new_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  me := private.identity();
  my_role := private.role_key();
  my_team := coalesce(private.my_team(), '');

  if my_role is distinct from 'lg_agent' then
    raise exception 'Only Lead Gen agents can open a dispute.';
  end if;
  if reason = '' then
    raise exception 'Dispute reason is required.';
  end if;

  select * into lead_row from public.leads where lead_id = p_lead_id;
  if not found then raise exception 'Lead not found.'; end if;
  if lead_row.lead_gen_agent is distinct from me then
    raise exception 'You can only dispute your own leads.';
  end if;

  select * into qa from public.qa_records where lead_id = p_lead_id;
  if not found then raise exception 'QA record not found.'; end if;
  if qa.qa_decision is distinct from 'Disqualified' then
    raise exception 'Only disqualified leads can be disputed.';
  end if;

  if exists (select 1 from public.qa_disputes where lead_id = p_lead_id and status = 'open') then
    raise exception 'A dispute is already open for this lead.';
  end if;

  insert into public.qa_disputes (lead_id, opened_by, team, reason, status)
  values (p_lead_id, me, my_team, left(reason, 4000), 'open')
  returning id into new_id;

  return jsonb_build_object(
    'id', new_id,
    'lead_id', p_lead_id,
    'status', 'open'
  );
end;
$$;

grant execute on function public.dispute_open(text, text) to authenticated;

-- Supervisor reviews an open dispute
create or replace function public.dispute_review(
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
  my_team text;
  d public.qa_disputes%rowtype;
  decision text := lower(trim(coalesce(p_decision, '')));
  note text := left(trim(coalesce(p_note, '')), 2000);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  me := private.identity();
  my_role := private.role_key();
  my_team := coalesce(private.my_team(), '');

  if my_role is distinct from 'lg_sup' and not private.sales_writer() then
    raise exception 'Only Lead Gen supervisors can review disputes.';
  end if;
  if decision not in ('approved', 'disapproved') then
    raise exception 'Decision must be approved or disapproved.';
  end if;

  select * into d from public.qa_disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found.'; end if;
  if d.status is distinct from 'open' then
    raise exception 'This dispute was already reviewed.';
  end if;
  if my_role = 'lg_sup' and d.team is distinct from my_team then
    raise exception 'You can only review disputes for your team.';
  end if;

  update public.qa_disputes
  set status = decision,
      reviewed_by = me,
      reviewed_at = now(),
      review_note = note,
      updated_at = now()
  where id = p_dispute_id;

  if decision = 'approved' then
    update public.qa_records
    set qa_decision = 'Pending',
        returned_after_dispute = true,
        qa_agent = '',
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

grant execute on function public.dispute_review(uuid, text, text) to authenticated;

-- List open disputes for the caller's team (supervisors) or own (agents)
create or replace function public.dispute_list_open()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_role text := private.role_key();
  my_team text := coalesce(private.my_team(), '');
  me text := private.identity();
begin
  if my_role = 'lg_sup' or private.sales_writer() then
    return (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
      from (
        select
          d.id,
          d.lead_id,
          d.opened_by,
          d.team,
          d.reason,
          d.status,
          d.created_at,
          coalesce(l.business_name, q.business_name, '') as business_name,
          coalesce(l.owner_name, q.owner_name, '') as owner_name
        from public.qa_disputes d
        left join public.leads l on l.lead_id = d.lead_id
        left join public.qa_records q on q.lead_id = d.lead_id
        where d.status = 'open'
          and (private.sales_writer() or d.team = my_team)
      ) x
    );
  end if;

  if my_role = 'lg_agent' then
    return (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
      from (
        select
          d.id,
          d.lead_id,
          d.opened_by,
          d.team,
          d.reason,
          d.status,
          d.created_at,
          coalesce(l.business_name, '') as business_name,
          coalesce(l.owner_name, '') as owner_name
        from public.qa_disputes d
        left join public.leads l on l.lead_id = d.lead_id
        where d.status = 'open' and d.opened_by = me
      ) x
    );
  end if;

  return '[]'::jsonb;
end;
$$;

grant execute on function public.dispute_list_open() to authenticated;
