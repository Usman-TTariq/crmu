-- 37_record_delete_yasal_only.sql
-- Pipeline record delete (leads + stage tables) only for yasal.khan@tgtnexus.net.
-- Team Setup profile delete stays on private.is_admin().

create or replace function private.can_delete_rows()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'yasal.khan@tgtnexus.net'
  );
$$;
