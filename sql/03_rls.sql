-- ============================================================================
-- TGT Nexus CRM — 03_rls.sql
-- Row Level Security: helper functions + per-table policies matching the
-- prototype's ROLES matrix. Run after 02_triggers.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (private schema, security definer so they can read
-- profiles regardless of the caller's own row access)
-- ---------------------------------------------------------------------------
create or replace function private.role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role_key from public.profiles where user_id = auth.uid();
$$;

create or replace function private.identity()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select full_name from public.profiles where user_id = auth.uid();
$$;

create or replace function private.my_team()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select team from public.profiles where user_id = auth.uid();
$$;

-- Role groups
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select private.role_key() in ('ceo','super_admin');
$$;

create or replace function private.is_ops_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select private.role_key() in ('ops_manager','ops_am');
$$;

create or replace function private.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select private.role_key() in ('ceo','super_admin','ops_manager','ops_am');
$$;

create or replace function private.can_delete_rows()
returns boolean language sql stable security definer set search_path = public as $$
  select private.role_key() in ('ceo','super_admin','ops_manager','ops_am','cs_head','cs_lead');
$$;

-- Sales-side write access (admin, sales head, AVP Sales)
create or replace function private.sales_writer()
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_admin() or private.role_key() in ('sales_head', 'avp_sales');
$$;

-- OPS-side write access (admin or ops managers)
create or replace function private.ops_writer()
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_admin() or private.is_ops_manager();
$$;

-- Read access to everything on the sales side (admin, sales head, AVP Sales)
create or replace function private.sales_reader()
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_admin() or private.role_key() in ('sales_head', 'avp_sales');
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.teams              enable row level security;
alter table public.profiles           enable row level security;
alter table public.leads              enable row level security;
alter table public.qa_records         enable row level security;
alter table public.sql_assignments    enable row level security;
alter table public.closer_deals       enable row level security;
alter table public.ops_verifications  enable row level security;
alter table public.msp_onboarding     enable row level security;
alter table public.fulfillment        enable row level security;
alter table public.leasing            enable row level security;
alter table public.retention          enable row level security;
alter table public.retention_comments enable row level security;
alter table public.lead_comments      enable row level security;
alter table public.attachments        enable row level security;

-- ---------------------------------------------------------------------------
-- teams / profiles: readable by all authenticated (needed for dropdowns),
-- writable only by user admins
-- ---------------------------------------------------------------------------
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (true);

drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams
  for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (private.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- leads (Lead Gen)
-- View: admins/sales head all; lg_agent own rows. OPS managers can read
--       (they own leads across OPS journeys and the CEO dashboard drill-in).
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
    or (private.role_key() = 'lg_sup' and lead_gen_agent in (
         select full_name from public.profiles where team = private.my_team()
       ))
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    private.sales_writer()
    or private.ops_writer()          -- manual OPS additions create their lead
    or private.role_key() = 'ops_verifier'
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
  );

-- Lead Gen agents can INSERT only; after create, fields are locked (comments via lead_comments).
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (private.sales_writer())
  with check (private.sales_writer());

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated using (private.can_delete_rows());

-- ---------------------------------------------------------------------------
-- qa_records
-- ---------------------------------------------------------------------------
drop policy if exists qa_select on public.qa_records;
create policy qa_select on public.qa_records
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or (private.role_key() = 'qa_agent' and (qa_agent = private.identity() or qa_agent = ''))
  );

drop policy if exists qa_update on public.qa_records;
create policy qa_update on public.qa_records
  for update to authenticated
  using (
    private.sales_writer()
    or (private.role_key() = 'qa_agent' and (qa_agent = private.identity() or qa_agent = ''))
  )
  with check (
    private.sales_writer()
    or (private.role_key() = 'qa_agent' and qa_agent = private.identity())
  );

drop policy if exists qa_delete on public.qa_records;
create policy qa_delete on public.qa_records
  for delete to authenticated using (private.can_delete_rows());

-- ---------------------------------------------------------------------------
-- sql_assignments
-- lg_sup: read-only, team scope (SQLs whose lead was generated by their team)
-- floor_manager: all SQLs, view only (cannot assign — Sales Head / AVP only)
-- ---------------------------------------------------------------------------
drop policy if exists sql_select on public.sql_assignments;
create policy sql_select on public.sql_assignments
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'lg_sup' and exists (
      select 1 from public.leads l
      join public.profiles p on p.full_name = l.lead_gen_agent
      where l.lead_id = sql_assignments.lead_id
        and p.team = private.my_team()
    ))
  );

drop policy if exists sql_update on public.sql_assignments;
create policy sql_update on public.sql_assignments
  for update to authenticated
  using (private.sales_writer() or private.is_ops_manager())
  with check (private.sales_writer() or private.is_ops_manager());

drop policy if exists sql_delete on public.sql_assignments;
create policy sql_delete on public.sql_assignments
  for delete to authenticated using (private.can_delete_rows());

-- ---------------------------------------------------------------------------
-- closer_deals
-- ---------------------------------------------------------------------------
drop policy if exists closer_select on public.closer_deals;
create policy closer_select on public.closer_deals
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or (private.role_key() = 'closer' and closer = private.identity())
  );

drop policy if exists closer_update on public.closer_deals;
create policy closer_update on public.closer_deals
  for update to authenticated
  using (
    private.sales_writer()
    or (private.role_key() = 'closer' and closer = private.identity())
  )
  with check (
    private.sales_writer()
    or (private.role_key() = 'closer' and closer = private.identity())
  );

drop policy if exists closer_delete on public.closer_deals;
create policy closer_delete on public.closer_deals
  for delete to authenticated using (private.can_delete_rows());

-- ---------------------------------------------------------------------------
-- ops_verifications
-- sales_head: read-only. ops_verifier: full. ops_qa_agent: own rows.
-- ---------------------------------------------------------------------------
drop policy if exists ops_select on public.ops_verifications;
create policy ops_select on public.ops_verifications
  for select to authenticated
  using (
    private.is_manager()
    or private.role_key() in ('sales_head','ops_verifier')
    or (private.role_key() = 'ops_qa_agent' and (ops_agent = private.identity() or ops_agent = ''))
  );

drop policy if exists ops_insert on public.ops_verifications;
create policy ops_insert on public.ops_verifications
  for insert to authenticated
  with check (private.ops_writer() or private.role_key() = 'ops_verifier');

drop policy if exists ops_update on public.ops_verifications;
create policy ops_update on public.ops_verifications
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() = 'ops_verifier'
    or (private.role_key() = 'ops_qa_agent' and (ops_agent = private.identity() or ops_agent = ''))
  )
  with check (
    private.ops_writer()
    or private.role_key() = 'ops_verifier'
    or (private.role_key() = 'ops_qa_agent' and ops_agent = private.identity())
  );

drop policy if exists ops_delete on public.ops_verifications;
create policy ops_delete on public.ops_verifications
  for delete to authenticated using (private.can_delete_rows());

-- accuracy_review is manager-only (prototype: managerOnly field)
create or replace function private.guard_accuracy_review()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;  -- service-role / seed writes
  end if;
  if tg_op = 'UPDATE'
     and new.accuracy_review is distinct from old.accuracy_review
     and not private.is_manager() then
    raise exception 'Accuracy Check is manager-only.';
  end if;
  if tg_op = 'INSERT'
     and coalesce(new.accuracy_review, '') <> ''
     and not private.is_manager() then
    raise exception 'Accuracy Check is manager-only.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_accuracy on public.ops_verifications;
create trigger trg_guard_accuracy
before insert or update on public.ops_verifications
for each row execute function private.guard_accuracy_review();

-- ---------------------------------------------------------------------------
-- msp_onboarding
-- ---------------------------------------------------------------------------
drop policy if exists msp_select on public.msp_onboarding;
create policy msp_select on public.msp_onboarding
  for select to authenticated
  using (
    private.is_manager()
    or private.role_key() in ('sales_head','onboarding_lead')
    or (private.role_key() = 'onb_agent' and (onboarding_sp = private.identity() or onboarding_sp = ''))
  );

drop policy if exists msp_update on public.msp_onboarding;
create policy msp_update on public.msp_onboarding
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() = 'onboarding_lead'
    or (private.role_key() = 'onb_agent' and (onboarding_sp = private.identity() or onboarding_sp = ''))
  )
  with check (
    private.ops_writer()
    or private.role_key() = 'onboarding_lead'
    or (private.role_key() = 'onb_agent' and onboarding_sp = private.identity())
  );

drop policy if exists msp_delete on public.msp_onboarding;
create policy msp_delete on public.msp_onboarding
  for delete to authenticated using (private.can_delete_rows());

-- ---------------------------------------------------------------------------
-- fulfillment / leasing (onboarding lead + ops managers)
-- ---------------------------------------------------------------------------
drop policy if exists fulfillment_select on public.fulfillment;
create policy fulfillment_select on public.fulfillment
  for select to authenticated
  using (private.is_manager() or private.role_key() in ('sales_head','onboarding_lead'));

drop policy if exists fulfillment_update on public.fulfillment;
create policy fulfillment_update on public.fulfillment
  for update to authenticated
  using (private.ops_writer() or private.role_key() = 'onboarding_lead')
  with check (private.ops_writer() or private.role_key() = 'onboarding_lead');

drop policy if exists fulfillment_delete on public.fulfillment;
create policy fulfillment_delete on public.fulfillment
  for delete to authenticated using (private.can_delete_rows());

drop policy if exists leasing_select on public.leasing;
create policy leasing_select on public.leasing
  for select to authenticated
  using (private.is_manager() or private.role_key() in ('sales_head','onboarding_lead'));

drop policy if exists leasing_update on public.leasing;
create policy leasing_update on public.leasing
  for update to authenticated
  using (private.ops_writer() or private.role_key() = 'onboarding_lead')
  with check (private.ops_writer() or private.role_key() = 'onboarding_lead');

drop policy if exists leasing_delete on public.leasing;
create policy leasing_delete on public.leasing
  for delete to authenticated using (private.can_delete_rows());

-- ---------------------------------------------------------------------------
-- retention + comments
-- ---------------------------------------------------------------------------
drop policy if exists retention_select on public.retention;
create policy retention_select on public.retention
  for select to authenticated
  using (
    private.is_manager()
    or private.role_key() in ('sales_head','cs_head','cs_lead')
    or (private.role_key() = 'cs_agent' and (agent_name = private.identity() or agent_name = ''))
  );

drop policy if exists retention_update on public.retention;
create policy retention_update on public.retention
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() in ('cs_head','cs_lead')
    or (private.role_key() = 'cs_agent' and (agent_name = private.identity() or agent_name = ''))
  )
  with check (
    private.ops_writer()
    or private.role_key() in ('cs_head','cs_lead')
    or (private.role_key() = 'cs_agent' and agent_name = private.identity())
  );

drop policy if exists retention_delete on public.retention;
create policy retention_delete on public.retention
  for delete to authenticated using (private.can_delete_rows());

drop policy if exists comments_select on public.retention_comments;
create policy comments_select on public.retention_comments
  for select to authenticated
  using (exists (select 1 from public.retention r where r.lead_id = retention_comments.lead_id));

drop policy if exists comments_insert on public.retention_comments;
create policy comments_insert on public.retention_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.retention r where r.lead_id = retention_comments.lead_id)
  );

-- ---------------------------------------------------------------------------
-- lead_comments (shared pipeline thread; append-only)
-- ---------------------------------------------------------------------------
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
        'floor_manager', 'ops_verifier', 'onboarding_lead', 'cs_head', 'cs_lead'
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
          where r.lead_id = p_lead_id and r.agent_name = private.identity()
        )
      )
    );
$$;

drop policy if exists lead_comments_select on public.lead_comments;
create policy lead_comments_select on public.lead_comments
  for select to authenticated
  using (private.can_access_lead_comments(lead_id));

drop policy if exists lead_comments_insert on public.lead_comments;
create policy lead_comments_insert on public.lead_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.can_access_lead_comments(lead_id)
  );

-- ---------------------------------------------------------------------------
-- attachments (visible when the parent stage row is visible)
-- ---------------------------------------------------------------------------
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (
    (stage = 'closer' and exists (select 1 from public.closer_deals cd where cd.lead_id = attachments.lead_id))
    or (stage = 'ops' and exists (select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id))
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      (stage = 'closer' and exists (select 1 from public.closer_deals cd where cd.lead_id = attachments.lead_id))
      or (stage = 'ops' and exists (select 1 from public.ops_verifications ov where ov.lead_id = attachments.lead_id))
    )
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or private.is_manager()
  );

-- ---------------------------------------------------------------------------
-- Storage policies for the documents bucket
-- ---------------------------------------------------------------------------
drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'documents');

drop policy if exists documents_insert on storage.objects;
create policy documents_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents');

drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents');
