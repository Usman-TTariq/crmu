-- ============================================================================
-- TGT Nexus CRM — 46_revert_sales_head_roster.sql
-- Undo sql/45: profiles insert/update admin-only again (Sales Head cannot
-- manage roster). Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (private.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());
