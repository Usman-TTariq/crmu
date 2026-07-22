-- ============================================================================
-- TGT Nexus CRM — 60_ops_rework_comment_thread.sql
-- Log OPS Rework + Documentation Fail/Pass into lead_comments (thread).
-- Fix ops_qa_agent comment access when ops_agent is blank. Safe to re-run.
-- ============================================================================

-- OPS QA agents: same visibility as OPS row (assigned or unassigned)
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
      or private.pipeline_viewer()
      or private.role_key() in (
        'floor_manager', 'ops_verifier', 'ops_qa_onb', 'onboarding_lead', 'cs_head', 'cs_lead',
        'project_manager'
      )
      or (
        private.role_key() = 'lg_agent'
        and exists (
          select 1 from public.leads l
          where l.lead_id = p_lead_id and l.lead_gen_agent = private.identity()
        )
      )
      or (
        private.is_lg_team_lead()
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
          where o.lead_id = p_lead_id
            and (o.ops_agent = private.identity() or o.ops_agent = '')
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
          where r.lead_id = p_lead_id
            and (
              r.agent_name = private.identity()
              or r.substitute = private.identity()
            )
        )
      )
    );
$$;

create or replace function private.after_ops_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      insert into public.lead_comments (lead_id, author, body)
      values (
        new.lead_id,
        coalesce(nullif(trim(new.ops_agent), ''), 'OPS QA'),
        '[OPS Rework]' || E'\n' || trim(new.reasoning)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_ops_change on public.ops_verifications;
create trigger trg_after_ops_change
after insert or update on public.ops_verifications
for each row execute function private.after_ops_change();

create or replace function private.after_documentation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  docs_comments text;
  was_rework boolean := false;
  fail_body text;
begin
  if new.decision = 'Pass' and (tg_op = 'INSERT' or old.decision is distinct from 'Pass') then
    select (o.ops_status = 'Rework') into was_rework
    from public.ops_verifications o
    where o.lead_id = new.lead_id;

    was_rework := coalesce(was_rework, false)
      or coalesce(new.returned_after_ops_rework, false);

    docs_comments := trim(both from concat_ws(
      E'\n\n',
      nullif(trim(coalesce(new.notes, '')), ''),
      case
        when coalesce(trim(new.fail_reason), '') <> '' then
          'Fail reason: ' || trim(new.fail_reason)
        when coalesce(trim(new.pm_rework_comments), '') <> '' then
          'Fail reason: ' || trim(new.pm_rework_comments)
        else null
      end
    ));

    insert into public.ops_verifications
      (lead_id, closed_date, business_name, owner_name, phone, closer, monthly_volume,
       ops_status, documentation_rework_comments)
    values
      (new.lead_id, coalesce(new.closed_date, current_date), new.business_name,
       new.owner_name, new.phone, new.closer, new.monthly_volume, 'Pending',
       coalesce(docs_comments, ''))
    on conflict (lead_id) do update set
      closed_date = excluded.closed_date,
      business_name = excluded.business_name,
      owner_name = excluded.owner_name,
      phone = excluded.phone,
      closer = excluded.closer,
      monthly_volume = excluded.monthly_volume,
      ops_status = case
        when public.ops_verifications.ops_status = 'Rework' then 'Pending'
        else public.ops_verifications.ops_status
      end,
      -- Keep / restore prior OPS reasoning when returning from Rework
      reasoning = case
        when public.ops_verifications.ops_status = 'Rework' then
          coalesce(
            nullif(trim(public.ops_verifications.reasoning), ''),
            nullif(trim(new.ops_rework_reasoning), ''),
            public.ops_verifications.reasoning
          )
        else public.ops_verifications.reasoning
      end,
      documentation_rework_comments = case
        when coalesce(docs_comments, '') <> '' then docs_comments
        else public.ops_verifications.documentation_rework_comments
      end,
      updated_at = now();

    if was_rework and coalesce(docs_comments, '') <> '' then
      insert into public.lead_comments (lead_id, author, body)
      values (
        new.lead_id,
        coalesce(nullif(trim(new.pm_name), ''), 'Documentation'),
        '[Documentation Pass]' || E'\n' || docs_comments
      );
    end if;

    update public.documentation_reviews
    set returned_after_ops_rework = false,
        updated_at = now()
    where lead_id = new.lead_id
      and returned_after_ops_rework = true;
  end if;

  if new.decision = 'Fail' and (tg_op = 'INSERT' or old.decision is distinct from 'Fail') then
    update public.closer_deals
    set stage = 'Docs Pending',
        updated_at = now()
    where lead_id = new.lead_id;

    fail_body := coalesce(nullif(trim(new.fail_reason), ''), nullif(trim(new.notes), ''));
    if fail_body is not null then
      insert into public.lead_comments (lead_id, author, body)
      values (
        new.lead_id,
        coalesce(nullif(trim(new.pm_name), ''), 'Documentation'),
        '[Documentation Fail]' || E'\n' || fail_body
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_documentation_change on public.documentation_reviews;
create trigger trg_after_documentation_change
after insert or update on public.documentation_reviews
for each row execute function private.after_documentation_change();

-- Restore empty OPS reasoning from Docs rework snapshot
update public.ops_verifications o
set reasoning = d.ops_rework_reasoning,
    updated_at = now()
from public.documentation_reviews d
where d.lead_id = o.lead_id
  and coalesce(trim(o.reasoning), '') = ''
  and coalesce(trim(d.ops_rework_reasoning), '') <> '';

-- Backfill thread from existing rework snapshots (skip if already logged)
insert into public.lead_comments (lead_id, author, body)
select d.lead_id,
       'OPS QA',
       '[OPS Rework]' || E'\n' || trim(d.ops_rework_reasoning)
from public.documentation_reviews d
where coalesce(trim(d.ops_rework_reasoning), '') <> ''
  and not exists (
    select 1 from public.lead_comments c
    where c.lead_id = d.lead_id
      and c.body like '[OPS Rework]%'
  );

insert into public.lead_comments (lead_id, author, body)
select o.lead_id,
       'Documentation',
       '[Documentation Pass]' || E'\n' || trim(o.documentation_rework_comments)
from public.ops_verifications o
where coalesce(trim(o.documentation_rework_comments), '') <> ''
  and not exists (
    select 1 from public.lead_comments c
    where c.lead_id = o.lead_id
      and c.body like '[Documentation Pass]%'
  );
