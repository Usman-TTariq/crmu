-- ============================================================================
-- TGT Nexus CRM — 01_schema.sql
-- Tables, sequences, indexes, storage bucket.
-- Paste into the Supabase SQL editor and run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Private schema for helper functions (not exposed via Data API).
-- Authenticated users need USAGE so RLS policies can call the helpers.
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Org: teams, profiles
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- Profiles are seeded from the roster before auth users exist; user_id is
-- linked when the admin creates the login for that person.
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,
  full_name   text not null unique,
  title       text not null default '',
  dept        text not null default 'SALES' check (dept in ('SALES','OPS','ALL','DOCUMENTATION')),
  team        text not null default '',
  role_key    text not null default 'lg_agent',
  target      text not null default '',
  is_active   boolean not null default true,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lead ID sequence: L-1001, L-1002, ...
-- ---------------------------------------------------------------------------
create sequence if not exists public.lead_id_seq start with 1001;

create or replace function public.next_lead_id()
returns text
language sql
volatile
as $$
  select 'L-' || nextval('public.lead_id_seq')::text;
$$;

-- ---------------------------------------------------------------------------
-- Core: leads (stage 1 — Lead Gen)
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            text not null unique default public.next_lead_id(),
  date_created       date not null default current_date,
  lead_gen_agent     text not null default '',
  lead_source        text not null default 'Cold Calling',
  business_name      text not null default '',
  owner_name         text not null default '',
  phone              text not null default '',
  email              text not null default '',
  business_address   text not null default '',
  city               text not null default '',
  zip_code           text not null default '',
  state              text not null default '',
  current_processor  text not null default 'None',
  current_device     text not null default '',
  current_rate       text not null default '',
  monthly_volume     numeric,
  notes              text not null default '',
  created_by         uuid references auth.users (id),
  updated_by         uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 2: QA
-- ---------------------------------------------------------------------------
create table if not exists public.qa_records (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            text not null unique references public.leads (lead_id) on delete cascade,
  qa_date            date not null default current_date,
  lead_gen_agent     text not null default '',
  lead_source        text not null default 'Cold Calling',
  business_name      text not null default '',
  owner_name         text not null default '',
  phone              text not null default '',
  email              text not null default '',
  business_address   text not null default '',
  city               text not null default '',
  zip_code           text not null default '',
  state              text not null default '',
  current_processor  text not null default 'None',
  current_device     text not null default '',
  current_rate       text not null default '',
  monthly_volume     numeric,
  notes              text not null default '',
  us_business        text not null default '' check (us_business in ('','Yes','No')),
  owner_reached      text not null default '' check (owner_reached in ('','Yes','No')),
  interested         text not null default '' check (interested in ('','Yes','No')),
  physical_loc       text not null default '' check (physical_loc in ('','Yes','No')),
  not_restricted     text not null default '' check (not_restricted in ('','Yes','No')),
  qa_agent           text not null default '',
  qa_decision        text not null default 'Pending' check (qa_decision in ('Pending','Qualified','Disqualified')),
  qa_notes           text not null default '',
  returned_after_dispute boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 3: SQL Assignment
-- ---------------------------------------------------------------------------
create table if not exists public.sql_assignments (
  id               uuid primary key default gen_random_uuid(),
  lead_id          text not null unique references public.leads (lead_id) on delete cascade,
  qa_date          date,
  business_name    text not null default '',
  owner_name       text not null default '',
  phone            text not null default '',
  state            text not null default '',
  monthly_volume   numeric,
  assigned_closer  text not null default '',
  assignment_date  date,
  assigned_at      timestamptz,
  assigned_by      text not null default '',
  sql_status       text not null default 'Pending' check (sql_status in ('Pending','Assigned')),
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 4: Closer Pipeline
-- ---------------------------------------------------------------------------
create table if not exists public.closer_deals (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            text not null unique references public.leads (lead_id) on delete cascade,
  business_name      text not null default '',
  owner_name         text not null default '',
  phone              text not null default '',
  state              text not null default '',
  monthly_volume     numeric,
  assigned_date      date,
  closer             text not null default '',
  stage              text not null default 'No Answer' check (stage in ('No Answer','Follow Up','Docs Pending','Docs Received','Closed','Closed Lost','Not Interested')),
  lost_reason        text not null default '',
  connected_date     date,
  docs_pending_date  date,
  docs_recd_date     date,
  closed_date        date,
  notes              text not null default '',
  created_by         uuid references auth.users (id),
  updated_by         uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 5: Documentation review (Project Manager) — between Closer and OPS
-- ---------------------------------------------------------------------------
create table if not exists public.documentation_reviews (
  id              uuid primary key default gen_random_uuid(),
  lead_id         text not null unique references public.leads (lead_id) on delete cascade,
  business_name   text not null default '',
  owner_name      text not null default '',
  phone           text not null default '',
  state           text not null default '',
  monthly_volume  numeric,
  closer          text not null default '',
  closed_date     date,
  pm_name         text not null default '',
  decision        text not null default 'Pending'
                    check (decision in ('Pending', 'Pass', 'Fail')),
  fail_reason     text not null default '',
  review_date     date,
  notes           text not null default '',
  returned_after_ops_rework boolean not null default false,
  ops_rework_reasoning text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 6: OPS verification
-- ---------------------------------------------------------------------------
create table if not exists public.ops_verifications (
  id                    uuid primary key default gen_random_uuid(),
  lead_id               text not null unique references public.leads (lead_id) on delete cascade,
  closed_date           date,
  business_name         text not null default '',
  owner_name            text not null default '',
  phone                 text not null default '',
  closer                text not null default '',
  monthly_volume        numeric,
  brand                 text not null default '',
  dl_recd               text not null default '' check (dl_recd in ('','Yes','No')),
  voided_check          text not null default '' check (voided_check in ('','Yes','No')),
  bank_stmt             text not null default '' check (bank_stmt in ('','Yes','No')),
  owner_name_verified   text not null default '' check (owner_name_verified in ('','Yes','No')),
  owner_phone_verified  text not null default '' check (owner_phone_verified in ('','Yes','No')),
  business_verified     text not null default '' check (business_verified in ('','Yes','No')),
  ops_status            text not null default 'Pending' check (ops_status in ('Pending','Approved','Disapproved','Reworked')),
  reasoning             text not null default '',
  ops_agent             text not null default '',
  ops_date              date,
  accuracy_review       text not null default '' check (accuracy_review in ('','Pass','Fail')),
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 6: MSP Onboarding (up to 3 attempts)
-- ---------------------------------------------------------------------------
create table if not exists public.msp_onboarding (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            text not null unique references public.leads (lead_id) on delete cascade,
  business_name      text not null default '',
  owner_name         text not null default '',
  monthly_volume     numeric,
  ops_approved_date  date,
  onboarding_sp      text not null default '',
  a1_date            date,
  a1_provider        text not null default '',
  a1_result          text not null default '' check (a1_result in ('','Yes','No')),
  a1_reason          text not null default '',
  a2_date            date,
  a2_provider        text not null default '',
  a2_result          text not null default '' check (a2_result in ('','Yes','No')),
  a2_reason          text not null default '',
  a3_date            date,
  a3_provider        text not null default '',
  a3_result          text not null default '' check (a3_result in ('','Yes','No')),
  a3_reason          text not null default '',
  final_reasoning    text not null default '',
  approved_date      date,
  final_status       text not null default 'Pending' check (final_status in ('Pending','Approved','Archived')),
  equip_order_date   date,
  device             text not null default '',
  tracking_number    text not null default '',
  delivery_date      date,
  shipping_cost      numeric,
  notes              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 7: Fulfillment
-- ---------------------------------------------------------------------------
create table if not exists public.fulfillment (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            text not null unique references public.leads (lead_id) on delete cascade,
  funded_date        date,
  business_name      text not null default '',
  owner_name         text not null default '',
  fulfillment_stage  text not null default 'Pending' check (fulfillment_stage in ('Pending','Equipment Shipped','Installed','Live')),
  hardware           text not null default '',
  serial             text not null default '',
  live_date          date,
  notes              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 8: Leasing
-- ---------------------------------------------------------------------------
create table if not exists public.leasing (
  id                uuid primary key default gen_random_uuid(),
  lead_id           text not null unique references public.leads (lead_id) on delete cascade,
  business_name     text not null default '',
  owner_name        text not null default '',
  leasing_company   text not null default '',
  order_activation  date,
  monthly_lease     numeric,
  approved_funding  numeric,
  shipping_cost     numeric,
  funding_status    text not null default 'Pending' check (funding_status in ('Pending','Submitted','Funded','Declined')),
  funding_date      date,
  invoice_no        text not null default '',
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 9: Retention (Customer Success) + append-only comments
-- ---------------------------------------------------------------------------
create table if not exists public.retention (
  id              uuid primary key default gen_random_uuid(),
  lead_id         text not null unique references public.leads (lead_id) on delete cascade,
  business_name   text not null default '',
  team            text not null default 'Customer Success',
  agent_name      text not null default '',
  status          text not null default 'Active' check (status in ('Active','At Risk','Closed by MSP','On Hold','Retained','Churned','Chargeback','Cancelled')),
  substitute      text not null default '',
  handover_notes  text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.retention_comments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      text not null references public.leads (lead_id) on delete cascade,
  author       text not null,
  author_id    uuid references auth.users (id),
  body         text not null,
  created_at   timestamptz not null default now()
);

-- Shared append-only comments across the lead pipeline (Lead Gen → Leasing)
create table if not exists public.lead_comments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      text not null references public.leads (lead_id) on delete cascade,
  author       text not null,
  author_id    uuid references auth.users (id),
  body         text not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Attachments (metadata; binaries live in Storage bucket "documents")
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  lead_id       text not null references public.leads (lead_id) on delete cascade,
  stage         text not null check (stage in ('closer','ops','documentation')),
  storage_path  text not null unique,
  file_name     text not null,
  file_size     bigint not null,
  file_ext      text not null,
  doc_type      text check (doc_type is null or doc_type in (
    'driving_license', 'voided_cheque', 'bank_statement', 'business_license',
    'proof_of_address', 'processing_statement', 'other'
  )),
  uploaded_by   uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_attachments_lead_stage_doctype
  on public.attachments (lead_id, stage, doc_type)
  where doc_type in (
    'driving_license', 'voided_cheque', 'bank_statement', 'business_license',
    'proof_of_address', 'processing_statement'
  );

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','leads','qa_records','sql_assignments','closer_deals',
    'documentation_reviews','ops_verifications','msp_onboarding','fulfillment','leasing','retention'
  ] loop
    execute format('drop trigger if exists trg_touch_%I on public.%I', t, t);
    execute format(
      'create trigger trg_touch_%I before update on public.%I
       for each row execute function private.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_leads_date_created     on public.leads (date_created);
create index if not exists idx_leads_agent            on public.leads (lead_gen_agent);
create index if not exists idx_leads_source           on public.leads (lead_source);
create index if not exists idx_qa_date                on public.qa_records (qa_date);
create index if not exists idx_qa_agent               on public.qa_records (qa_agent);
create index if not exists idx_qa_decision            on public.qa_records (qa_decision);
create index if not exists idx_sql_assignment_date    on public.sql_assignments (assignment_date);
create index if not exists idx_sql_status             on public.sql_assignments (sql_status);
create index if not exists idx_closer_assigned_date   on public.closer_deals (assigned_date);
create index if not exists idx_closer_closer          on public.closer_deals (closer);
create index if not exists idx_closer_stage           on public.closer_deals (stage);
create index if not exists idx_ops_date               on public.ops_verifications (ops_date);
create index if not exists idx_ops_agent              on public.ops_verifications (ops_agent);
create index if not exists idx_ops_status             on public.ops_verifications (ops_status);
create index if not exists idx_msp_approved_date      on public.msp_onboarding (ops_approved_date);
create index if not exists idx_msp_sp                 on public.msp_onboarding (onboarding_sp);
create index if not exists idx_msp_final              on public.msp_onboarding (final_status);
create index if not exists idx_fulfillment_funded     on public.fulfillment (funded_date);
create index if not exists idx_fulfillment_stage      on public.fulfillment (fulfillment_stage);
create index if not exists idx_leasing_activation     on public.leasing (order_activation);
create index if not exists idx_leasing_status         on public.leasing (funding_status);
create index if not exists idx_retention_agent        on public.retention (agent_name);
create index if not exists idx_retention_status       on public.retention (status);
create index if not exists idx_comments_lead          on public.retention_comments (lead_id);
create index if not exists idx_lead_comments_lead     on public.lead_comments (lead_id, created_at);
create index if not exists idx_attachments_lead       on public.attachments (lead_id, stage);

-- ---------------------------------------------------------------------------
-- Storage bucket for documents (10 MB, pdf/images only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/gif','image/webp']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
