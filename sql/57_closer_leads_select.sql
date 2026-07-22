-- ============================================================================
-- TGT Nexus CRM — 57_closer_leads_select.sql
-- Closers can read parent leads they created (closer_direct) or that are on
-- their closer_deals rows. Also keep closer_direct insert permission.
-- Safe to re-run.
-- ============================================================================

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.pipeline_viewer()
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

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    private.sales_writer()
    or private.ops_writer()
    or private.role_key() in ('ops_verifier', 'ops_qa_onb')
    or (private.role_key() = 'lg_agent' and lead_gen_agent = private.identity())
    or (private.role_key() = 'closer' and lead_origin = 'closer_direct')
  );
