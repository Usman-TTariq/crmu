-- ============================================================================
-- TGT Nexus CRM — 61_lead_comments_thread_order.sql
-- Stable chronological order for rework thread comments. Safe to re-run.
-- ============================================================================

-- Dedupe identical system posts (keep earliest)
delete from public.lead_comments a
using public.lead_comments b
where a.id > b.id
  and a.lead_id = b.lead_id
  and a.body = b.body
  and (
    a.body like '[OPS Rework]%'
    or a.body like '[Documentation Fail]%'
    or a.body like '[Documentation Pass]%'
  );

-- Within the same second, force logical order:
-- OPS Rework → Documentation Fail → Documentation Pass → other
with ranked as (
  select
    id,
    lead_id,
    created_at,
    case
      when body like '[OPS Rework]%' then 0
      when body like '[Documentation Fail]%' then 1
      when body like '[Documentation Pass]%' then 2
      else 3
    end as kind_rank,
    row_number() over (
      partition by lead_id, date_trunc('second', created_at)
      order by
        case
          when body like '[OPS Rework]%' then 0
          when body like '[Documentation Fail]%' then 1
          when body like '[Documentation Pass]%' then 2
          else 3
        end,
        created_at,
        id
    ) as rn
  from public.lead_comments
)
update public.lead_comments c
set created_at = r.created_at + (r.rn - 1) * interval '1 millisecond'
from ranked r
where c.id = r.id
  and r.rn > 1;

-- Future Rework posts: skip exact duplicate body
create or replace function private.after_ops_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rework_body text;
begin
  if new.ops_status = 'Approved'
     and (tg_op = 'INSERT' or old.ops_status is distinct from 'Approved') then
    insert into public.msp_onboarding
      (lead_id, business_name, owner_name, monthly_volume, ops_approved_date, final_status)
    values
      (new.lead_id, new.business_name, new.owner_name, new.monthly_volume,
       coalesce(new.ops_date, current_date), 'Pending')
    on conflict (lead_id) do nothing;
  end if;

  if new.ops_status = 'Rework'
     and (tg_op = 'INSERT' or old.ops_status is distinct from 'Rework') then
    update public.documentation_reviews
    set decision = 'Pending',
        fail_reason = '',
        review_date = null,
        returned_after_ops_rework = true,
        ops_rework_reasoning = coalesce(new.reasoning, ''),
        pm_rework_comments = '',
        updated_at = now()
    where lead_id = new.lead_id;

    if coalesce(trim(new.reasoning), '') <> '' then
      rework_body := '[OPS Rework]' || E'\n' || trim(new.reasoning);
      if not exists (
        select 1 from public.lead_comments c
        where c.lead_id = new.lead_id and c.body = rework_body
      ) then
        insert into public.lead_comments (lead_id, author, body)
        values (
          new.lead_id,
          coalesce(nullif(trim(new.ops_agent), ''), 'OPS QA'),
          rework_body
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_ops_change on public.ops_verifications;
create trigger trg_after_ops_change
after insert or update on public.ops_verifications
for each row execute function private.after_ops_change();
