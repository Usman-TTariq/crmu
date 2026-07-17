-- 26_rida_ops_qa_onb_role.sql
-- Hybrid OPS role: edit OPS QA + Onboarding; view-only Fulfillment / Leasing / CS.
-- Assign Rida Waseem → ops_qa_onb.

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------
update public.profiles
set
  role_key = 'ops_qa_onb',
  title = 'OPS QA & Onboarding',
  dept = 'OPS'
where full_name = 'Rida Waseem';

-- ---------------------------------------------------------------------------
-- leads insert (manual OPS add creates lead row)
-- ---------------------------------------------------------------------------
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    private.sales_writer()
    or private.ops_writer()
    or private.role_key() in ('ops_verifier', 'ops_qa_onb')
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
  );

-- ---------------------------------------------------------------------------
-- ops_verifications — full access like ops_verifier
-- ---------------------------------------------------------------------------
drop policy if exists ops_select on public.ops_verifications;
create policy ops_select on public.ops_verifications
  for select to authenticated
  using (
    private.is_manager()
    or private.role_key() in ('sales_head','ops_verifier','ops_qa_onb')
    or (private.role_key() = 'ops_qa_agent' and (ops_agent = private.identity() or ops_agent = ''))
  );

drop policy if exists ops_insert on public.ops_verifications;
create policy ops_insert on public.ops_verifications
  for insert to authenticated
  with check (private.ops_writer() or private.role_key() in ('ops_verifier','ops_qa_onb'));

drop policy if exists ops_update on public.ops_verifications;
create policy ops_update on public.ops_verifications
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() in ('ops_verifier','ops_qa_onb')
    or (private.role_key() = 'ops_qa_agent' and (ops_agent = private.identity() or ops_agent = ''))
  )
  with check (
    private.ops_writer()
    or private.role_key() in ('ops_verifier','ops_qa_onb')
    or (private.role_key() = 'ops_qa_agent' and ops_agent = private.identity())
  );

-- ---------------------------------------------------------------------------
-- msp_onboarding — write like onboarding_lead
-- ---------------------------------------------------------------------------
drop policy if exists msp_select on public.msp_onboarding;
create policy msp_select on public.msp_onboarding
  for select to authenticated
  using (
    private.is_manager()
    or private.role_key() in ('sales_head','onboarding_lead','ops_qa_onb')
    or (private.role_key() = 'onb_agent' and (onboarding_sp = private.identity() or onboarding_sp = ''))
  );

drop policy if exists msp_update on public.msp_onboarding;
create policy msp_update on public.msp_onboarding
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() in ('onboarding_lead','ops_qa_onb')
    or (private.role_key() = 'onb_agent' and (onboarding_sp = private.identity() or onboarding_sp = ''))
  )
  with check (
    private.ops_writer()
    or private.role_key() in ('onboarding_lead','ops_qa_onb')
    or (private.role_key() = 'onb_agent' and onboarding_sp = private.identity())
  );

-- ---------------------------------------------------------------------------
-- fulfillment / leasing — select only (no update)
-- ---------------------------------------------------------------------------
drop policy if exists fulfillment_select on public.fulfillment;
create policy fulfillment_select on public.fulfillment
  for select to authenticated
  using (private.is_manager() or private.role_key() in ('sales_head','onboarding_lead','ops_qa_onb'));

drop policy if exists leasing_select on public.leasing;
create policy leasing_select on public.leasing
  for select to authenticated
  using (private.is_manager() or private.role_key() in ('sales_head','onboarding_lead','ops_qa_onb'));

-- ---------------------------------------------------------------------------
-- retention — select only
-- ---------------------------------------------------------------------------
drop policy if exists retention_select on public.retention;
create policy retention_select on public.retention
  for select to authenticated
  using (
    private.is_manager()
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
-- documentation — view
-- ---------------------------------------------------------------------------
drop policy if exists documentation_select on public.documentation_reviews;
create policy documentation_select on public.documentation_reviews
  for select to authenticated
  using (
    private.is_admin()
    or private.role_key() in (
      'project_manager', 'sales_head', 'avp_sales',
      'ops_manager', 'ops_am', 'ops_verifier', 'ops_qa_onb'
    )
  );

-- ---------------------------------------------------------------------------
-- lead_comments access
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
