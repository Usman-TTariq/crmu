-- 28_presence_realtime.sql
-- 1) Let monitor roles SELECT presence rows they can monitor (for Realtime RLS).
-- 2) Add user_presence to supabase_realtime so seat alerts update immediately.
-- Safe to re-run.

-- Scoped select: own row, or any row private.presence_target_ok allows
-- (ceo/super_admin, sales_head sales seats, ops_manager OPS seats).
drop policy if exists presence_select_own on public.user_presence;
drop policy if exists presence_select_monitor on public.user_presence;
create policy presence_select_monitor on public.user_presence
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.presence_target_ok(user_id)
  );

do $$
begin
  if to_regclass('public.user_presence') is null then
    raise notice 'user_presence missing — run 09_presence.sql first';
    return;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_presence'
  ) then
    alter publication supabase_realtime add table public.user_presence;
    raise notice 'added user_presence to supabase_realtime';
  else
    raise notice 'user_presence already in supabase_realtime';
  end if;
end $$;
