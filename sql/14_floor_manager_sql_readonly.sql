-- ============================================================================
-- TGT Nexus CRM — 14_floor_manager_sql_readonly.sql
-- Floor Manager (Roshaan) can view all SQLs but cannot assign/edit.
-- Only Sales Head (Arish) and AVP Sales (Ubaid) — via sales_writer() — can update.
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

drop policy if exists sql_update on public.sql_assignments;
create policy sql_update on public.sql_assignments
  for update to authenticated
  using (private.sales_writer() or private.is_ops_manager())
  with check (private.sales_writer() or private.is_ops_manager());
