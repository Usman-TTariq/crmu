-- 27_activity_logs.sql
-- Activity audit log — visible to CEO / Super Admin only.
-- Inserts go through service-role from the app (no client insert policy).

create table if not exists public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  actor_user_id   uuid,
  actor_name      text not null default '',
  actor_role      text not null default '',
  action          text not null,
  entity_tab      text,
  entity_id       text,
  summary         text not null default '',
  meta            jsonb not null default '{}'::jsonb
);

create index if not exists idx_activity_logs_created_at on public.activity_logs (created_at desc);
create index if not exists idx_activity_logs_actor_name on public.activity_logs (actor_name);
create index if not exists idx_activity_logs_action on public.activity_logs (action);

alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (private.role_key() in ('ceo', 'super_admin'));

-- No insert/update/delete for authenticated — service role bypasses RLS.
