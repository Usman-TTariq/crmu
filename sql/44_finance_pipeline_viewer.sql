-- ============================================================================
-- TGT Nexus CRM — 44_finance_pipeline_viewer.sql
-- Finance role: view-only Lead Gen → Customer Success (all teams).
-- Adds private.pipeline_viewer(), select policies, and Finance roster row.
-- Does NOT grant insert/update. Safe to re-run.
-- ============================================================================

create or replace function private.pipeline_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.role_key() = 'finance';
$$;

-- ---------------------------------------------------------------------------
-- Roster
-- ---------------------------------------------------------------------------
insert into public.profiles (full_name, title, dept, team, role_key, target)
values ('Finance', 'Finance', 'ALL', '', 'finance', '')
on conflict (full_name) do update
set title = excluded.title,
    dept = excluded.dept,
    team = excluded.team,
    role_key = excluded.role_key,
    is_active = true,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- leads / qa (keep floor_manager from sql/43)
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
    or (private.role_key() = 'lg_sup' and lead_gen_agent in (
         select full_name from public.profiles where team = private.my_team()
       ))
  );

drop policy if exists qa_select on public.qa_records;
create policy qa_select on public.qa_records
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'qa_agent' and (qa_agent = private.identity() or qa_agent = ''))
  );

-- ---------------------------------------------------------------------------
-- sql / closer
-- ---------------------------------------------------------------------------
drop policy if exists sql_select on public.sql_assignments;
create policy sql_select on public.sql_assignments
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'lg_sup' and exists (
      select 1 from public.leads l
      join public.profiles p on p.full_name = l.lead_gen_agent
      where l.lead_id = sql_assignments.lead_id
        and p.team = private.my_team()
    ))
  );

drop policy if exists closer_select on public.closer_deals;
create policy closer_select on public.closer_deals
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or (private.role_key() = 'closer' and closer = private.identity())
  );

-- ---------------------------------------------------------------------------
-- documentation
-- ---------------------------------------------------------------------------
drop policy if exists documentation_select on public.documentation_reviews;
create policy documentation_select on public.documentation_reviews
  for select to authenticated
  using (
    private.is_admin()
    or private.pipeline_viewer()
    or private.role_key() in (
      'project_manager', 'sales_head', 'avp_sales',
      'ops_manager', 'ops_am', 'ops_verifier', 'ops_qa_onb'
    )
  );

-- ---------------------------------------------------------------------------
-- OPS journey
-- ---------------------------------------------------------------------------
drop policy if exists ops_select on public.ops_verifications;
create policy ops_select on public.ops_verifications
  for select to authenticated
  using (
    private.is_manager()
    or private.pipeline_viewer()
    or private.role_key() in ('sales_head','ops_verifier','ops_qa_onb')
    or (private.role_key() = 'ops_qa_agent' and (ops_agent = private.identity() or ops_agent = ''))
  );

drop policy if exists msp_select on public.msp_onboarding;
create policy msp_select on public.msp_onboarding
  for select to authenticated
  using (
    private.is_manager()
    or private.pipeline_viewer()
    or private.role_key() in ('sales_head','onboarding_lead','ops_qa_onb')
    or (private.role_key() = 'onb_agent' and (onboarding_sp = private.identity() or onboarding_sp = ''))
  );

drop policy if exists fulfillment_select on public.fulfillment;
create policy fulfillment_select on public.fulfillment
  for select to authenticated
  using (
    private.is_manager()
    or private.pipeline_viewer()
    or private.role_key() in ('sales_head','onboarding_lead','ops_qa_onb')
  );

drop policy if exists leasing_select on public.leasing;
create policy leasing_select on public.leasing
  for select to authenticated
  using (
    private.is_manager()
    or private.pipeline_viewer()
    or private.role_key() in ('sales_head','onboarding_lead','ops_qa_onb')
  );

drop policy if exists retention_select on public.retention;
create policy retention_select on public.retention
  for select to authenticated
  using (
    private.is_manager()
    or private.pipeline_viewer()
    or private.role_key() in ('sales_head','cs_head','cs_lead','ops_qa_onb')
    or (
      private.role_key() = 'cs_agent'
      and (
        agent_name = private.identity()
        or agent_name = ''
        or substitute = private.identity()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- lead comments (drawer)
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
      or private.pipeline_viewer()
      or private.role_key() in (
        'floor_manager', 'ops_verifier', 'ops_qa_onb', 'onboarding_lead', 'cs_head', 'cs_lead',
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
