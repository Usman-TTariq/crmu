-- ============================================================================
-- TGT Nexus CRM — 78_lead_journey_stages.sql
-- Single-roundtrip Lead Journey stage lookup (replaces 10 separate selects).
-- Safe to re-run.
-- ============================================================================

create or replace function public.lead_journey_stages(p_lead_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'leadgen',       (select id::text from public.leads where lead_id = p_lead_id limit 1),
    'qa',            (select id::text from public.qa_records where lead_id = p_lead_id limit 1),
    'sqlassign',     (select id::text from public.sql_assignments where lead_id = p_lead_id limit 1),
    'closer',        (select id::text from public.closer_deals where lead_id = p_lead_id limit 1),
    'documentation', (select id::text from public.documentation_reviews where lead_id = p_lead_id limit 1),
    'ops',           (select id::text from public.ops_verifications where lead_id = p_lead_id limit 1),
    'msp',           (select id::text from public.msp_onboarding where lead_id = p_lead_id limit 1),
    'fulfillment',   (select id::text from public.fulfillment where lead_id = p_lead_id limit 1),
    'leasing',       (select id::text from public.leasing where lead_id = p_lead_id limit 1),
    'retention',     (select id::text from public.retention where lead_id = p_lead_id limit 1)
  );
$$;

revoke all on function public.lead_journey_stages(text) from public;
grant execute on function public.lead_journey_stages(text) to authenticated;
grant execute on function public.lead_journey_stages(text) to service_role;
