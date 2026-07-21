-- ============================================================================
-- TGT Nexus CRM — 45_sales_head_roster.sql
-- Sales Head (Arish) may insert/update Sales floor profiles only
-- (lg_agent, lg_sup, closer, qa_agent). Hard delete stays admin-only.
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

create or replace function private.sales_roster_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.role_key() in ('ceo', 'super_admin', 'sales_head');
$$;

create or replace function private.is_sales_floor_role(p_role text)
returns boolean
language sql
immutable
as $$
  select p_role in ('lg_agent', 'lg_sup', 'closer', 'qa_agent');
$$;

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    private.is_admin()
    or (
      private.sales_roster_admin()
      and dept = 'SALES'
      and private.is_sales_floor_role(role_key)
    )
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    private.is_admin()
    or (
      private.sales_roster_admin()
      and dept = 'SALES'
      and private.is_sales_floor_role(role_key)
    )
  )
  with check (
    private.is_admin()
    or (
      private.sales_roster_admin()
      and dept = 'SALES'
      and private.is_sales_floor_role(role_key)
    )
  );
