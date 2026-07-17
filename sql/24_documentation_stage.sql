-- ============================================================================
-- TGT Nexus CRM — 24_documentation_stage.sql
-- Documentation stage between Closer and OPS + Project Manager role.
-- Closer Closed → documentation_reviews (Pending)
-- Pass → ops_verifications; Fail → closer stage Docs Pending
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

-- Dept: DOCUMENTATION
alter table public.profiles drop constraint if exists profiles_dept_check;
alter table public.profiles
  add constraint profiles_dept_check
  check (dept in ('SALES', 'OPS', 'ALL', 'DOCUMENTATION'));

-- Attachments stage
alter table public.attachments drop constraint if exists attachments_stage_check;
alter table public.attachments
  add constraint attachments_stage_check
  check (stage in ('closer', 'ops', 'documentation'));

-- ---------------------------------------------------------------------------
-- documentation_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.documentation_reviews (
  id              uuid primary key default gen_random_uuid(),
  lead_id         text not null unique references public.leads (lead_id) on delete cascade,
  business_name   text not null default '',
  owner_name      text not null default '',
  phone           text not null default '',
  state           text not null default '',
  monthly_volume  numeric,
  closer          text not null default '',
  closed_date     date,
  pm_name         text not null default '',
  decision        text not null default 'Pending'
                    check (decision in ('Pending', 'Pass', 'Fail')),
  fail_reason     text not null default '',
  review_date     date,
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_touch_documentation_reviews on public.documentation_reviews;
create trigger trg_touch_documentation_reviews
before update on public.documentation_reviews
for each row execute function private.touch_updated_at();

create index if not exists idx_documentation_decision on public.documentation_reviews (decision);
create index if not exists idx_documentation_review_date on public.documentation_reviews (review_date);

alter table public.documentation_reviews enable row level security;

drop policy if exists documentation_select on public.documentation_reviews;
create policy documentation_select on public.documentation_reviews
  for select to authenticated
  using (
    private.is_admin()
    or private.role_key() in (
      'project_manager', 'sales_head', 'avp_sales',
      'ops_manager', 'ops_am', 'ops_verifier'
    )
  );

drop policy if exists documentation_insert on public.documentation_reviews;
create policy documentation_insert on public.documentation_reviews
  for insert to authenticated
  with check (
    private.is_admin()
    or private.role_key() in ('project_manager', 'sales_head')
  );

drop policy if exists documentation_update on public.documentation_reviews;
create policy documentation_update on public.documentation_reviews
  for update to authenticated
  using (
    private.is_admin()
    or private.role_key() in ('project_manager', 'sales_head')
  )
  with check (
    private.is_admin()
    or private.role_key() in ('project_manager', 'sales_head')
  );

drop policy if exists documentation_delete on public.documentation_reviews;
create policy documentation_delete on public.documentation_reviews
  for delete to authenticated
  using (private.can_delete_rows());

-- ---------------------------------------------------------------------------
-- Closer Closed → Documentation (not OPS)
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
      updated_at     = now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Documentation Pass → OPS; Fail → Closer Docs Pending
-- ---------------------------------------------------------------------------
create or replace function private.before_documentation_change()
returns trigger
language plpgsql
as $$
begin
  if new.decision = 'Fail' and coalesce(new.fail_reason, '') = '' then
    raise exception 'Fail needs a reason.';
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
begin
  if new.decision = 'Pass' and (tg_op = 'INSERT' or old.decision is distinct from 'Pass') then
    insert into public.ops_verifications
      (lead_id, closed_date, business_name, owner_name, phone, closer, monthly_volume, ops_status)
    values
      (new.lead_id, coalesce(new.closed_date, current_date), new.business_name,
       new.owner_name, new.phone, new.closer, new.monthly_volume, 'Pending')
    on conflict (lead_id) do nothing;
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

-- Attachments RLS: documentation stage visible when review row exists
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (
    (stage = 'closer' and exists (select 1 from public.closer_deals cd where cd.lead_id = attachments.lead_id))
    or (stage = 'ops' and exists (select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id))
    or (stage = 'documentation' and exists (
      select 1 from public.documentation_reviews d where d.lead_id = attachments.lead_id
    ))
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      (stage = 'closer' and exists (select 1 from public.closer_deals cd where cd.lead_id = attachments.lead_id))
      or (stage = 'ops' and exists (select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id))
      or (stage = 'documentation' and exists (
        select 1 from public.documentation_reviews d where d.lead_id = attachments.lead_id
      ))
    )
  );

-- Lead comments: project_manager access
create or replace function private.can_access_lead_comments(p_lead_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.leads l where l.lead_id = p_lead_id)
    and (
      private.is_admin()
      or private.sales_reader()
      or private.is_ops_manager()
      or private.role_key() in (
        'floor_manager', 'ops_verifier', 'onboarding_lead', 'cs_head', 'cs_lead',
        'project_manager'
      )
      or (
        private.role_key() = 'lg_agent'
        and exists (
          select 1 from public.leads l
          where l.lead_id = p_lead_id and l.lead_gen_agent = private.identity()
        )
      )
      or (
        private.role_key() = 'lg_sup'
        and exists (
          select 1 from public.leads l
          join public.profiles p on p.full_name = l.lead_gen_agent
          where l.lead_id = p_lead_id and p.team = private.my_team()
        )
      )
      or (
        private.role_key() = 'qa_agent'
        and exists (
          select 1 from public.qa_records q
          where q.lead_id = p_lead_id and q.qa_agent = private.identity()
        )
      )
      or (
        private.role_key() = 'closer'
        and exists (
          select 1 from public.closer_deals c
          where c.lead_id = p_lead_id and c.closer = private.identity()
        )
      )
      or (
        private.role_key() = 'ops_qa_agent'
        and exists (
          select 1 from public.ops_verifications o
          where o.lead_id = p_lead_id and o.ops_agent = private.identity()
        )
      )
      or (
        private.role_key() = 'onb_agent'
        and exists (
          select 1 from public.msp_onboarding m
          where m.lead_id = p_lead_id and m.onboarding_sp = private.identity()
        )
      )
      or (
        private.role_key() = 'cs_agent'
        and exists (
          select 1 from public.retention r
          where r.lead_id = p_lead_id
            and (
              r.agent_name = private.identity()
              or r.substitute = private.identity()
            )
        )
      )
    );
$$;

-- Seed / update Project Manager profile
do $$
begin
  if not exists (select 1 from public.profiles where full_name = 'Esha Sajjad') then
    insert into public.profiles (full_name, title, dept, team, role_key, target, notes)
    values ('Esha Sajjad', 'Project Manager', 'DOCUMENTATION', '', 'project_manager', '', 'Documentation stage owner');
  else
    update public.profiles
    set title = 'Project Manager',
        dept = 'DOCUMENTATION',
        role_key = 'project_manager'
    where full_name = 'Esha Sajjad';
  end if;
end $$;
