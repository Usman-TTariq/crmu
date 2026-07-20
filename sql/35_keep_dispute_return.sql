-- ============================================================================
-- TGT Nexus CRM — 35_keep_dispute_return.sql
-- Dispute-return flag must stay after QA Qualifies / Disqualifies again.
-- Safe to re-run.
-- ============================================================================

-- Stop clearing the flag on final QA decisions
drop trigger if exists trg_clear_returned_after_dispute on public.qa_records;

-- Restore flag for leads that already had an approved dispute (cleared earlier)
update public.qa_records q
   set returned_after_dispute = true
 where q.returned_after_dispute = false
   and exists (
     select 1
       from public.qa_disputes d
      where d.lead_id = q.lead_id
        and d.status = 'approved'
   );
