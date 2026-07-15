-- eliteOS Quote Intake v1 — central persistence (Phase 6P.2)
--
-- DO NOT APPLY AUTOMATICALLY. Manual apply only after review:
--   Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
--
-- Scope:
--   Additive quote_intake_* tables only.
--   No changes to quote_headers, quote_takeoff_jobs, quote_takeoff_results,
--   quote_files, pricing, Quote Library, or Internal Estimate tables.
--
-- Security posture:
--   - RLS enabled on every table
--   - Org membership via user_profiles.organization_id = auth.uid()
--   - anon: no privileges (tables or functions)
--   - authenticated: org-scoped SELECT/INSERT(/UPDATE on cases only); no DELETE;
--     no audit UPDATE/DELETE; no UPDATE on child tables
--   - RLS helper quote_intake_user_organization_id(): REVOKE ALL FROM PUBLIC/anon,
--     then GRANT EXECUTE TO authenticated (and service_role) so RLS policies can
--     evaluate; never GRANT EXECUTE TO anon or PUBLIC
--   - Trigger-only functions: REVOKE ALL FROM PUBLIC/anon/authenticated — no
--     direct EXECUTE for JWT roles (triggers still fire as table side-effects)
--   - Brain API typically uses service_role (bypasses RLS) and MUST still filter by
--     trusted organization_id in application code on every query
--   - takeoff_job_id is a UUID placeholder WITHOUT FK to quote_takeoff_jobs
--     (avoids cascade/coupling risk)
--
-- Dedupe:
--   PRIMARY: UNIQUE (organization_id, internet_message_id) WHERE Message-ID present
--   FALLBACK: UNIQUE (organization_id, content_hash) WHERE content_hash present
--             AND Message-ID is absent (null/blank). Must NOT merge distinct
--             Message-IDs that happen to share a normalized content hash.
--   UNIQUE (intake_case_id, sha256) on attachments
--   UNIQUE (organization_id, idempotency_key) on takeoff links

create extension if not exists pgcrypto;

-- ── Helper: authenticated user's organization ────────────────────────────────

create or replace function public.quote_intake_user_organization_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select up.organization_id
  from public.user_profiles up
  where up.id = (select auth.uid())
    and coalesce(up.is_active, true) = true
  limit 1;
$$;

comment on function public.quote_intake_user_organization_id() is
  'Returns organization_id for auth.uid() from user_profiles; used by quote_intake_* RLS. Authenticated must hold EXECUTE after PUBLIC revoke.';

-- Default CREATE FUNCTION grants EXECUTE to PUBLIC; strip that, then re-grant
-- narrowly so authenticated JWT sessions can evaluate RLS policies that call this.
revoke all on function public.quote_intake_user_organization_id() from public;
revoke all on function public.quote_intake_user_organization_id() from anon;
grant execute on function public.quote_intake_user_organization_id() to authenticated;
grant execute on function public.quote_intake_user_organization_id() to service_role;

-- ── Cases ────────────────────────────────────────────────────────────────────

create table if not exists public.quote_intake_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  status text not null default 'qil_received'
    check (status in (
      'qil_received',
      'qil_validating',
      'qil_classifying',
      'qil_manual_review',
      'qil_not_quote',
      'qil_not_elite_100',
      'qil_ready_for_takeoff',
      'qil_takeoff_queued',
      'qil_takeoff_processing',
      'qil_takeoff_ready_for_review',
      'qil_takeoff_manual_review',
      'qil_takeoff_failed',
      'qil_estimator_review',
      'qil_accepted_takeoff',
      'qil_failed'
    )),
  source_type text not null default 'api'
    check (source_type in ('api', 'manual', 'graph_mailbox', 'fixture')),
  mailbox_identity text,
  graph_message_id_hash text,
  internet_message_id text,
  content_hash text,
  from_address_hash text,
  received_at timestamptz,
  -- Privacy: raw subject/body are NOT stored. Fingerprints / lengths only.
  subject_hash text,
  body_char_count integer check (body_char_count is null or body_char_count >= 0),
  classification_state text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  assigned_estimator_user_id uuid,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'archived', 'purged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quote_intake_cases_org_created
  on public.quote_intake_cases (organization_id, created_at desc);

create index if not exists idx_quote_intake_cases_org_status
  on public.quote_intake_cases (organization_id, status, created_at desc);

create unique index if not exists uq_quote_intake_cases_org_internet_message_id
  on public.quote_intake_cases (organization_id, internet_message_id)
  where internet_message_id is not null and trim(internet_message_id) <> '';

create unique index if not exists uq_quote_intake_cases_org_content_hash
  on public.quote_intake_cases (organization_id, content_hash)
  where content_hash is not null
    and trim(content_hash) <> ''
    and (internet_message_id is null or trim(internet_message_id) = '');

comment on table public.quote_intake_cases is
  'Quote Intake cases (Phase 6P.2). Org-scoped. No raw email subject/body.';

-- ── Attachments (metadata only — no bytes) ───────────────────────────────────

create table if not exists public.quote_intake_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  intake_case_id uuid not null references public.quote_intake_cases (id) on delete cascade,
  source_attachment_id text,
  safe_filename text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text not null
    check (sha256 ~ '^[a-f0-9]{64}$'),
  page_count integer check (page_count is null or page_count >= 0),
  security_validation_state text not null default 'pending'
    check (security_validation_state in (
      'pending', 'passed', 'failed', 'skipped'
    )),
  storage_path_placeholder text,
  ingest_state text not null default 'metadata_only'
    check (ingest_state in ('metadata_only', 'ready', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_intake_attachments_case
  on public.quote_intake_attachments (intake_case_id, created_at);

create index if not exists idx_quote_intake_attachments_org
  on public.quote_intake_attachments (organization_id, created_at desc);

create unique index if not exists uq_quote_intake_attachments_case_sha256
  on public.quote_intake_attachments (intake_case_id, sha256);

comment on table public.quote_intake_attachments is
  'Quote Intake attachment metadata only. No file bytes. No eliteos-quote-files writes in 6P.2.';

-- ── Automation decisions ─────────────────────────────────────────────────────

create table if not exists public.quote_intake_automation_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  intake_case_id uuid not null references public.quote_intake_cases (id) on delete cascade,
  path text not null
    check (path in (
      'path_a_trusted_automatic_takeoff',
      'path_b_manual_review'
    )),
  reason_codes jsonb not null default '[]'::jsonb,
  decision_version text not null default '6p2_v1',
  eligible boolean not null default false,
  would_start_takeoff boolean not null default false,
  reason_summary text,
  actor_type text not null
    check (actor_type in ('user', 'system')),
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_intake_automation_decisions_case
  on public.quote_intake_automation_decisions (intake_case_id, created_at desc);

create index if not exists idx_quote_intake_automation_decisions_org
  on public.quote_intake_automation_decisions (organization_id, created_at desc);

comment on table public.quote_intake_automation_decisions is
  'Path A/B automation gate outcomes. No raw email or provider secrets.';

-- ── Audit events (append-only) ───────────────────────────────────────────────

create table if not exists public.quote_intake_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  intake_case_id uuid not null references public.quote_intake_cases (id) on delete cascade,
  event_type text not null,
  actor_type text not null
    check (actor_type in ('user', 'system')),
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_intake_audit_events_case
  on public.quote_intake_audit_events (intake_case_id, created_at);

create index if not exists idx_quote_intake_audit_events_org
  on public.quote_intake_audit_events (organization_id, created_at desc);

comment on table public.quote_intake_audit_events is
  'Append-only Quote Intake audit. metadata must be sanitized (no subject/body/addresses/bytes/tokens).';

-- Block UPDATE/DELETE via trigger for all roles (including service_role mistakes).
create or replace function public.quote_intake_audit_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'quote_intake_audit_events are append-only'
    using errcode = '42501';
end;
$$;

revoke all on function public.quote_intake_audit_immutable() from public;
revoke all on function public.quote_intake_audit_immutable() from anon, authenticated;

drop trigger if exists trg_quote_intake_audit_no_update on public.quote_intake_audit_events;
create trigger trg_quote_intake_audit_no_update
  before update on public.quote_intake_audit_events
  for each row execute function public.quote_intake_audit_immutable();

drop trigger if exists trg_quote_intake_audit_no_delete on public.quote_intake_audit_events;
create trigger trg_quote_intake_audit_no_delete
  before delete on public.quote_intake_audit_events
  for each row execute function public.quote_intake_audit_immutable();

-- ── Takeoff links (structure only — no FK to production takeoff jobs) ────────

create table if not exists public.quote_intake_takeoff_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  intake_case_id uuid not null references public.quote_intake_cases (id) on delete cascade,
  intake_attachment_id uuid references public.quote_intake_attachments (id) on delete set null,
  attachment_sha256 text
    check (attachment_sha256 is null or attachment_sha256 ~ '^[a-f0-9]{64}$'),
  -- External linkage only — NOT a FK to quote_takeoff_jobs.
  takeoff_job_id uuid,
  relationship_status text not null default 'requested'
    check (relationship_status in (
      'requested', 'queued', 'processing', 'ready',
      'manual_review', 'failed', 'superseded'
    )),
  initiation_mode text not null default 'manual'
    check (initiation_mode in ('automatic', 'manual')),
  automation_decision_id uuid references public.quote_intake_automation_decisions (id) on delete set null,
  idempotency_key text not null,
  actor_type text not null default 'user'
    check (actor_type in ('user', 'system')),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_quote_intake_takeoff_links_case
  on public.quote_intake_takeoff_links (intake_case_id, created_at desc);

create unique index if not exists uq_quote_intake_takeoff_links_org_idempotency
  on public.quote_intake_takeoff_links (organization_id, idempotency_key);

comment on table public.quote_intake_takeoff_links is
  'Structure-only intake↔takeoff links. takeoff_job_id has no FK. No job creation in 6P.2.';

-- ── updated_at trigger for cases ─────────────────────────────────────────────

create or replace function public.quote_intake_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.quote_intake_touch_updated_at() from public;
revoke all on function public.quote_intake_touch_updated_at() from anon, authenticated;

drop trigger if exists trg_quote_intake_cases_touch on public.quote_intake_cases;
create trigger trg_quote_intake_cases_touch
  before update on public.quote_intake_cases
  for each row execute function public.quote_intake_touch_updated_at();

-- ── Child org consistency (case must match child organization_id) ────────────

create or replace function public.quote_intake_enforce_child_org()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  parent_org uuid;
begin
  select c.organization_id into parent_org
  from public.quote_intake_cases c
  where c.id = new.intake_case_id;

  if parent_org is null then
    raise exception 'intake_case_id not found'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from parent_org then
    raise exception 'organization_id must match parent quote_intake_cases.organization_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.quote_intake_enforce_child_org() from public;
revoke all on function public.quote_intake_enforce_child_org() from anon, authenticated;

drop trigger if exists trg_quote_intake_attachments_org on public.quote_intake_attachments;
create trigger trg_quote_intake_attachments_org
  before insert or update on public.quote_intake_attachments
  for each row execute function public.quote_intake_enforce_child_org();

drop trigger if exists trg_quote_intake_decisions_org on public.quote_intake_automation_decisions;
create trigger trg_quote_intake_decisions_org
  before insert or update on public.quote_intake_automation_decisions
  for each row execute function public.quote_intake_enforce_child_org();

drop trigger if exists trg_quote_intake_audit_org on public.quote_intake_audit_events;
create trigger trg_quote_intake_audit_org
  before insert or update on public.quote_intake_audit_events
  for each row execute function public.quote_intake_enforce_child_org();

drop trigger if exists trg_quote_intake_links_org on public.quote_intake_takeoff_links;
create trigger trg_quote_intake_links_org
  before insert or update on public.quote_intake_takeoff_links
  for each row execute function public.quote_intake_enforce_child_org();

-- Prevent moving a case across organizations
create or replace function public.quote_intake_cases_org_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'quote_intake_cases.organization_id is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.quote_intake_cases_org_immutable() from public;
revoke all on function public.quote_intake_cases_org_immutable() from anon, authenticated;

drop trigger if exists trg_quote_intake_cases_org_immutable on public.quote_intake_cases;
create trigger trg_quote_intake_cases_org_immutable
  before update on public.quote_intake_cases
  for each row execute function public.quote_intake_cases_org_immutable();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.quote_intake_cases enable row level security;
alter table public.quote_intake_attachments enable row level security;
alter table public.quote_intake_automation_decisions enable row level security;
alter table public.quote_intake_audit_events enable row level security;
alter table public.quote_intake_takeoff_links enable row level security;

-- Cases
drop policy if exists quote_intake_cases_select_org on public.quote_intake_cases;
create policy quote_intake_cases_select_org
  on public.quote_intake_cases for select to authenticated
  using (organization_id = public.quote_intake_user_organization_id());

drop policy if exists quote_intake_cases_insert_org on public.quote_intake_cases;
create policy quote_intake_cases_insert_org
  on public.quote_intake_cases for insert to authenticated
  with check (organization_id = public.quote_intake_user_organization_id());

drop policy if exists quote_intake_cases_update_org on public.quote_intake_cases;
create policy quote_intake_cases_update_org
  on public.quote_intake_cases for update to authenticated
  using (organization_id = public.quote_intake_user_organization_id())
  with check (organization_id = public.quote_intake_user_organization_id());

-- Attachments
drop policy if exists quote_intake_attachments_select_org on public.quote_intake_attachments;
create policy quote_intake_attachments_select_org
  on public.quote_intake_attachments for select to authenticated
  using (organization_id = public.quote_intake_user_organization_id());

drop policy if exists quote_intake_attachments_insert_org on public.quote_intake_attachments;
create policy quote_intake_attachments_insert_org
  on public.quote_intake_attachments for insert to authenticated
  with check (organization_id = public.quote_intake_user_organization_id());

-- Automation decisions
drop policy if exists quote_intake_decisions_select_org on public.quote_intake_automation_decisions;
create policy quote_intake_decisions_select_org
  on public.quote_intake_automation_decisions for select to authenticated
  using (organization_id = public.quote_intake_user_organization_id());

drop policy if exists quote_intake_decisions_insert_org on public.quote_intake_automation_decisions;
create policy quote_intake_decisions_insert_org
  on public.quote_intake_automation_decisions for insert to authenticated
  with check (organization_id = public.quote_intake_user_organization_id());

-- Audit: select + insert only (append-only)
drop policy if exists quote_intake_audit_select_org on public.quote_intake_audit_events;
create policy quote_intake_audit_select_org
  on public.quote_intake_audit_events for select to authenticated
  using (organization_id = public.quote_intake_user_organization_id());

drop policy if exists quote_intake_audit_insert_org on public.quote_intake_audit_events;
create policy quote_intake_audit_insert_org
  on public.quote_intake_audit_events for insert to authenticated
  with check (organization_id = public.quote_intake_user_organization_id());

-- Takeoff links
drop policy if exists quote_intake_links_select_org on public.quote_intake_takeoff_links;
create policy quote_intake_links_select_org
  on public.quote_intake_takeoff_links for select to authenticated
  using (organization_id = public.quote_intake_user_organization_id());

drop policy if exists quote_intake_links_insert_org on public.quote_intake_takeoff_links;
create policy quote_intake_links_insert_org
  on public.quote_intake_takeoff_links for insert to authenticated
  with check (organization_id = public.quote_intake_user_organization_id());

-- Privileges: deny anon; allow authenticated column access under RLS
revoke all on table public.quote_intake_cases from anon;
revoke all on table public.quote_intake_attachments from anon;
revoke all on table public.quote_intake_automation_decisions from anon;
revoke all on table public.quote_intake_audit_events from anon;
revoke all on table public.quote_intake_takeoff_links from anon;

grant select, insert, update on table public.quote_intake_cases to authenticated;
grant select, insert on table public.quote_intake_attachments to authenticated;
grant select, insert on table public.quote_intake_automation_decisions to authenticated;
grant select, insert on table public.quote_intake_audit_events to authenticated;
grant select, insert on table public.quote_intake_takeoff_links to authenticated;

-- Authenticated users have no normal DELETE on intake records.
-- Non-case tables are insert/select only (no UPDATE grant).
revoke delete on table public.quote_intake_cases from authenticated;
revoke delete on table public.quote_intake_attachments from authenticated;
revoke delete on table public.quote_intake_automation_decisions from authenticated;
revoke delete on table public.quote_intake_audit_events from authenticated;
revoke delete on table public.quote_intake_takeoff_links from authenticated;
revoke update on table public.quote_intake_attachments from authenticated;
revoke update on table public.quote_intake_automation_decisions from authenticated;
revoke update on table public.quote_intake_audit_events from authenticated;
revoke update on table public.quote_intake_takeoff_links from authenticated;

grant select, insert, update, delete on table public.quote_intake_cases to service_role;
grant select, insert, update, delete on table public.quote_intake_attachments to service_role;
grant select, insert, update, delete on table public.quote_intake_automation_decisions to service_role;
grant select, insert, update, delete on table public.quote_intake_audit_events to service_role;
grant select, insert, update, delete on table public.quote_intake_takeoff_links to service_role;
