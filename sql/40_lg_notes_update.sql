-- ============================================================================
-- TGT Nexus CRM — 40_lg_notes_update.sql
-- Lead Gen agents may update notes on their own leads; notes sync to QA "Lead Notes".
-- Safe to re-run. Apply in Supabase SQL Editor after deploying app changes.
-- ============================================================================

create or replace function public.lead_notes_update(p_lead_id text, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me text;
  my_role text;
  lead public.leads%rowtype;
  notes text := left(coalesce(p_notes, ''), 8000);
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  me := private.identity();
  my_role := private.role_key();

  select * into lead from public.leads where lead_id = p_lead_id for update;
  if not found then raise exception 'Lead not found.'; end if;

  if private.sales_writer() then
    null; -- full sales writers may always update notes
  elsif my_role = 'lg_agent' and lead.lead_gen_agent = me then
    null;
  elsif my_role = 'lg_sup' and lead.lead_gen_agent in (
    select full_name from public.profiles where team = private.my_team()
  ) then
    null;
  else
    raise exception 'You can only update notes on your own leads.';
  end if;

  begin
    update public.leads
    set notes = notes,
        updated_by = uid,
        updated_at = now()
    where lead_id = p_lead_id;
  exception
    when undefined_column then
      update public.leads
      set notes = notes,
          updated_at = now()
      where lead_id = p_lead_id;
  end;

  -- Keep QA Lead Notes in sync so QA always sees the latest LG notes
  update public.qa_records
  set notes = notes,
      updated_at = now()
  where lead_id = p_lead_id;

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'notes', notes
  );
end;
$$;

grant execute on function public.lead_notes_update(text, text) to authenticated;
