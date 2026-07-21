-- ============================================================================
-- TGT Nexus CRM — 43_floor_manager_leadgen_qa_readonly.sql
-- Floor Manager (Roshaan) can view all Lead Gen leads and QA records
-- (same full-floor read as SQL Assignment). Cannot insert/update —
-- Sales Head / AVP (sales_writer) and agents keep write access.
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
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
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'qa_agent' and (qa_agent = private.identity() or qa_agent = ''))
  );
