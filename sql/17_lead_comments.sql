-- ============================================================================
-- TGT Nexus CRM — 17_lead_comments.sql
-- Shared append-only comments on any in-flight lead (pipeline stages).
-- Safe to re-run. Paste into Supabase SQL editor.
-- ============================================================================

create table if not exists public.lead_comments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      text not null references public.leads (lead_id) on delete cascade,
  author       text not null,
  author_id    uuid references auth.users (id),
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_lead_comments_lead
  on public.lead_comments (lead_id, created_at);

-- Append-only (same blocker as retention_comments)
drop trigger if exists trg_lead_comments_no_update on public.lead_comments;
create trigger trg_lead_comments_no_update
  before update or delete on public.lead_comments
  for each row execute function private.block_comment_mutation();

alter table public.lead_comments enable row level security;

-- Who may see / comment on a lead (security definer so stage RLS does not block the check)
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
          where r.lead_id = p_lead_id and r.agent_name = private.identity()
        )
      )
    );
$$;

drop policy if exists lead_comments_select on public.lead_comments;
create policy lead_comments_select on public.lead_comments
  for select to authenticated
  using (private.can_access_lead_comments(lead_id));

drop policy if exists lead_comments_insert on public.lead_comments;
create policy lead_comments_insert on public.lead_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.can_access_lead_comments(lead_id)
  );

-- No UPDATE/DELETE policies — trigger blocks mutations anyway
