-- ============================================================================
-- TGT Nexus CRM — 34_lg_notifications.sql
-- In-app (Teams-style) notifications for Lead Gen when QA disqualifies their lead.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

create table if not exists public.crm_notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_name  text not null,
  kind            text not null default 'qa_disqualified',
  title           text not null default '',
  body            text not null default '',
  lead_id         text not null default '',
  meta            jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists crm_notifications_recipient_idx
  on public.crm_notifications (recipient_name, created_at desc);

create index if not exists crm_notifications_unread_idx
  on public.crm_notifications (recipient_name, created_at desc)
  where read_at is null;

alter table public.crm_notifications enable row level security;

drop policy if exists crm_notifications_select on public.crm_notifications;
create policy crm_notifications_select on public.crm_notifications
  for select to authenticated
  using (
    recipient_name = private.identity()
    or private.is_admin()
  );

drop policy if exists crm_notifications_update on public.crm_notifications;
create policy crm_notifications_update on public.crm_notifications
  for update to authenticated
  using (recipient_name = private.identity())
  with check (recipient_name = private.identity());

-- Inserts only via trigger / security definer
drop policy if exists crm_notifications_insert on public.crm_notifications;

grant select, update on public.crm_notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Notify owning Lead Gen when QA decision becomes Disqualified
-- ---------------------------------------------------------------------------
create or replace function private.notify_lg_on_disqualify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  v_biz   text;
  v_notes text;
begin
  if new.qa_decision is distinct from 'Disqualified' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.qa_decision is not distinct from 'Disqualified' then
    return new;
  end if;

  select coalesce(nullif(trim(l.lead_gen_agent), ''), ''),
         coalesce(nullif(trim(l.business_name), ''), new.lead_id)
    into v_agent, v_biz
  from public.leads l
  where l.lead_id = new.lead_id;

  if v_agent = '' then
    return new;
  end if;

  v_notes := coalesce(nullif(trim(new.qa_notes), ''), '');

  insert into public.crm_notifications (recipient_name, kind, title, body, lead_id, meta)
  values (
    v_agent,
    'qa_disqualified',
    'Lead disqualified',
    v_biz || ' (' || new.lead_id || ') was disqualified by QA. Open to dispute if needed.',
    new.lead_id,
    jsonb_build_object(
      'business_name', v_biz,
      'qa_agent', coalesce(new.qa_agent, ''),
      'qa_notes', v_notes
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_qa_notify_lg_disqualify on public.qa_records;
create trigger trg_qa_notify_lg_disqualify
  after insert or update of qa_decision on public.qa_records
  for each row
  execute function private.notify_lg_on_disqualify();

-- Mark one / all read
create or replace function public.notifications_mark_read(p_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := private.identity();
begin
  if me is null or me = '' then
    raise exception 'Not authenticated';
  end if;

  if p_id is null then
    update public.crm_notifications
       set read_at = coalesce(read_at, now())
     where recipient_name = me
       and read_at is null;
  else
    update public.crm_notifications
       set read_at = coalesce(read_at, now())
     where id = p_id
       and recipient_name = me;
  end if;
end;
$$;

revoke all on function public.notifications_mark_read(uuid) from public;
grant execute on function public.notifications_mark_read(uuid) to authenticated;

-- Realtime for live toasts
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_notifications'
  ) and to_regclass('public.crm_notifications') is not null then
    alter publication supabase_realtime add table public.crm_notifications;
  end if;
end $$;
