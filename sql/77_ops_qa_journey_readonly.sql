-- ============================================================================
-- TGT Nexus CRM — 77_ops_qa_journey_readonly.sql
-- From OPS QA, Lead / Closer / Docs journey pills open view-only.
-- Grants SELECT (no write) for OPS QA roles. Safe to re-run.
-- ============================================================================

-- Full OPS QA readers (all pipeline rows)
create or replace function private.ops_journey_reader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.role_key() in ('ops_verifier', 'ops_qa_onb');
$$;

-- OPS QA agent: only leads on their OPS verification queue
create or replace function private.ops_qa_agent_can_read_lead(p_lead_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.role_key() = 'ops_qa_agent'
    and exists (
      select 1
      from public.ops_verifications o
      where o.lead_id = p_lead_id
        and (o.ops_agent = private.identity() or o.ops_agent = '')
    );
$$;

-- ---------------------------------------------------------------------------
-- leads (preserve closer-own + team captain rules from 57 / 50)
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.ops_journey_reader()
    or private.ops_qa_agent_can_read_lead(lead_id)
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
    or (private.is_lg_team_lead() and lead_gen_agent in (
         select full_name from public.profiles where team = private.my_team()
       ))
    or (
      private.role_key() = 'closer'
      and (
        created_by = auth.uid()
        or exists (
          select 1 from public.closer_deals c
          where c.lead_id = leads.lead_id
            and c.closer = private.identity()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- closer (preserve qa_agent readonly from 72)
-- ---------------------------------------------------------------------------
drop policy if exists closer_select on public.closer_deals;
create policy closer_select on public.closer_deals
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
    or private.ops_journey_reader()
    or private.ops_qa_agent_can_read_lead(lead_id)
    or private.role_key() = 'qa_agent'
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
    or private.ops_journey_reader()
    or private.ops_qa_agent_can_read_lead(lead_id)
    or private.role_key() in (
      'project_manager', 'sales_head', 'avp_sales',
      'ops_manager', 'ops_am'
    )
  );
