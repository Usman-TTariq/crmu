-- ============================================================================
-- TGT Nexus CRM — 74_screenshot_alerts.sql
-- Screenshot attempt alerts for CEO / Super Admin.
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

create table if not exists public.screenshot_alerts (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid not null references auth.users(id) on delete cascade,
  actor_name      text not null,
  actor_role      text not null default '',
  page_path       text not null default '',
  storage_path    text not null,
  created_at      timestamptz not null default now()
);

create index if not exists screenshot_alerts_created_idx
  on public.screenshot_alerts (created_at desc);

create index if not exists screenshot_alerts_actor_idx
  on public.screenshot_alerts (actor_user_id, created_at desc);

alter table public.screenshot_alerts enable row level security;

drop policy if exists screenshot_alerts_admin_select on public.screenshot_alerts;
create policy screenshot_alerts_admin_select on public.screenshot_alerts
  for select to authenticated
  using (private.is_admin());

-- Inserts / deletes only via service role (server action)
drop policy if exists screenshot_alerts_insert on public.screenshot_alerts;
drop policy if exists screenshot_alerts_update on public.screenshot_alerts;
drop policy if exists screenshot_alerts_delete on public.screenshot_alerts;

grant select on public.screenshot_alerts to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket (JPEG/PNG/WebP, 5 MB)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshot_alerts',
  'screenshot_alerts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public = false;

drop policy if exists screenshot_alerts_storage_read on storage.objects;
create policy screenshot_alerts_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'screenshot_alerts'
    and private.is_admin()
  );

-- Writes only via service role
drop policy if exists screenshot_alerts_storage_insert on storage.objects;
drop policy if exists screenshot_alerts_storage_update on storage.objects;
drop policy if exists screenshot_alerts_storage_delete on storage.objects;

-- Realtime for CEO dashboard live refresh
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and to_regclass('public.screenshot_alerts') is not null then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'screenshot_alerts'
    ) then
      alter publication supabase_realtime add table public.screenshot_alerts;
    end if;
  end if;
end $$;
