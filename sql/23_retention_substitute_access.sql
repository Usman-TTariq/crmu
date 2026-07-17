-- ============================================================================
-- TGT Nexus CRM — 23_retention_substitute_access.sql
-- CS agents see/edit cases where they are agent_name OR substitute.
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

drop policy if exists retention_select on public.retention;
create policy retention_select on public.retention
  for select to authenticated
  using (
    private.is_manager()
    or private.role_key() in ('sales_head','cs_head','cs_lead')
    or (
      private.role_key() = 'cs_agent'
      and (
        agent_name = private.identity()
        or agent_name = ''
        or substitute = private.identity()
      )
    )
  );

drop policy if exists retention_update on public.retention;
create policy retention_update on public.retention
  for update to authenticated
  using (
    private.ops_writer()
    or private.role_key() in ('cs_head','cs_lead')
    or (
      private.role_key() = 'cs_agent'
      and (
        agent_name = private.identity()
        or agent_name = ''
        or substitute = private.identity()
      )
    )
  )
  with check (
    private.ops_writer()
    or private.role_key() in ('cs_head','cs_lead')
    or (
      private.role_key() = 'cs_agent'
      and (
        agent_name = private.identity()
        or substitute = private.identity()
      )
    )
  );

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
          where r.lead_id = p_lead_id
            and (
              r.agent_name = private.identity()
              or r.substitute = private.identity()
            )
        )
      )
    );
$$;
