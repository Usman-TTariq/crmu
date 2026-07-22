-- ============================================================================
-- TGT Nexus CRM — 68_ops_qa_dl_void_mandatory.sql
-- OPS QA Approve: only DL Recd + Voided Cheque must be Yes.
-- Bank stmt / owner / business verified may be No and still approve → Onboarding.
-- Safe to re-run.
-- ============================================================================

create or replace function private.before_ops_change()
returns trigger
language plpgsql
as $$
declare
  missing int := 0;
begin
  if new.ops_status = 'Rework' and coalesce(new.reasoning, '') = '' then
    raise exception 'Rework needs a reasoning.';
  end if;

  if new.ops_status = 'Approved' then
    select count(*) into missing
    from (values (new.dl_recd), (new.voided_check)) as checks(v)
    where v <> 'Yes';

    if missing > 0 then
      new.ops_status := 'Disapproved';
      if coalesce(new.reasoning, '') = '' then
        new.reasoning := 'DL Recd and Voided Cheque must both be Yes to approve';
      end if;
    end if;
  end if;
  return new;
end;
$$;
