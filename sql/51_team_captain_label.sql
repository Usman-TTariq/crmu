-- ============================================================================
-- TGT Nexus CRM — 51_team_captain_label.sql
-- Team Captain is a roster label only (no extra permissions).
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

alter table public.profiles
  add column if not exists is_team_captain boolean not null default false;

-- Anyone created with the old team_captain role_key: keep captain label,
-- restore a real access role (Lead Gen Supervisor) so logins keep working.
update public.profiles
set
  is_team_captain = true,
  role_key = 'lg_sup',
  title = case
    when title = 'Team Captain' then 'Lead Gen Supervisor'
    else title
  end,
  updated_at = now()
where role_key = 'team_captain';

-- Helper from sql/50: captains are no longer a role — only lg_sup is team lead.
create or replace function private.is_lg_team_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.role_key() = 'lg_sup';
$$;

-- Counselling: drop obsolete team_captain role_key from sales-floor list
create or replace function private.counselling_role_ok(p_role text)
returns boolean
language sql
stable
as $$
  select case
    when private.role_key() in ('ceo', 'super_admin') then true
    when private.role_key() = 'sales_head' then p_role in (
      'lg_agent', 'lg_sup', 'qa_agent', 'closer', 'floor_manager', 'avp_sales'
    )
    else false
  end;
$$;
