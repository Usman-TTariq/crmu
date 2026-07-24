-- ============================================================================
-- TGT Nexus CRM — 89_qa_agent_verifier.sql
-- New Sales role: QA Agent Verifier (qa_verifier) — read-only Closer Pipeline
-- (all closers' deals). No insert/update anywhere. Moves Perpetual D'Cruz to
-- this role. Regular qa_agent stays QA-only (see 88). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Closer Pipeline: read access for qa_verifier (base = 88)
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
    or private.role_key() = 'qa_verifier'
    or (private.role_key() = 'closer' and closer = private.identity())
  );

-- ---------------------------------------------------------------------------
-- Lead comments: qa_verifier can read threads on leads that have a closer deal
-- (base = 60)
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
        private.is_lg_team_lead()
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
        private.role_key() = 'qa_verifier'
        and exists (
          select 1 from public.closer_deals c
          where c.lead_id = p_lead_id
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
          where o.lead_id = p_lead_id
            and (o.ops_agent = private.identity() or o.ops_agent = '')
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

-- ---------------------------------------------------------------------------
-- Roster: Perpetual D'Cruz — QA Agent Verifier
-- ---------------------------------------------------------------------------
update public.profiles
set role_key = 'qa_verifier',
    title = 'QA Agent Verifier',
    updated_at = now()
where full_name = 'Perpetual D''Cruz';
