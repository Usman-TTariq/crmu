-- ============================================================================
-- TGT Nexus CRM — 08_roles_floor_avp.sql
-- Adds AVP Sales (full sales) + Floor Manager (all SQL assign) to existing DBs.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

-- Sales-side write/read: include AVP Sales
create or replace function private.sales_writer()
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_admin() or private.role_key() in ('sales_head', 'avp_sales');
$$;

create or replace function private.sales_reader()
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_admin() or private.role_key() in ('sales_head', 'avp_sales');
$$;

-- Floor Manager: every SQL visible + assignable
drop policy if exists sql_select on public.sql_assignments;
create policy sql_select on public.sql_assignments
  for select to authenticated
  using (
    private.sales_reader()
    or private.is_ops_manager()
    or private.role_key() = 'floor_manager'
    or (private.role_key() = 'lg_sup' and exists (
      select 1 from public.leads l
      join public.profiles p on p.full_name = l.lead_gen_agent
      where l.lead_id = sql_assignments.lead_id
        and p.team = private.my_team()
    ))
  );

drop policy if exists sql_update on public.sql_assignments;
create policy sql_update on public.sql_assignments
  for update to authenticated
  using (private.sales_writer() or private.is_ops_manager() or private.role_key() = 'floor_manager')
  with check (private.sales_writer() or private.is_ops_manager() or private.role_key() = 'floor_manager');

-- Roster rows (login still created from Team Setup → Create Login)
insert into public.profiles (full_name, title, dept, team, role_key, target) values
  ('Muhammad Ubaid', 'AVP Sales',     'SALES', '', 'avp_sales',     ''),
  ('Roshaan Aamir',  'Floor Manager', 'SALES', '', 'floor_manager', '')
on conflict (full_name) do update set
  title = excluded.title,
  dept = excluded.dept,
  team = excluded.team,
  role_key = excluded.role_key,
  target = excluded.target,
  updated_at = now();
