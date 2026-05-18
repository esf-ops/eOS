-- Moraware Sync Foundation v1 (additive only).
--
-- Manual apply (Supabase SQL editor):
--   1) Open Supabase -> SQL -> New query.
--   2) Paste this file; run once. Re-run is safe (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--   3) Do not paste live Moraware customer/job payloads into this file.
--
-- Intent:
--   Moraware records the work; eliteOS explains/moves the work from Brain-owned staging and
--   normalized tables. Credentials stay server-side/worker-side only.

create extension if not exists pgcrypto;

-- Sentinel used only when an organization_id is not yet known/configured.
-- Production should set MORAWARE_DEFAULT_ORGANIZATION_ID or pass organization_id in import payloads.
-- This avoids nullable unique-key behavior during upserts without hardcoding an Elite-specific UUID.

create table if not exists public.moraware_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  source_system text not null default 'moraware',
  mode text not null,
  runner text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  row_counts jsonb not null default '{}'::jsonb,
  data_quality_counts jsonb not null default '{}'::jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moraware_sync_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  entity_type text,
  source_record_id text,
  severity text not null default 'error',
  message text not null,
  raw_error jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.moraware_raw_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_record_id text not null,
  source_modified_at timestamptz,
  raw_payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);

create table if not exists public.moraware_raw_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_record_id text not null,
  source_modified_at timestamptz,
  raw_payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);

create table if not exists public.moraware_raw_job_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_record_id text not null,
  source_modified_at timestamptz,
  raw_payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);

create table if not exists public.moraware_raw_job_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_record_id text not null,
  source_modified_at timestamptz,
  raw_payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);

create table if not exists public.moraware_raw_job_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_record_id text not null,
  source_modified_at timestamptz,
  raw_payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);

create table if not exists public.moraware_raw_assignees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_record_id text not null,
  source_modified_at timestamptz,
  raw_payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);

create table if not exists public.brain_moraware_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_account_id text not null,
  account_name text,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_account_id)
);

create table if not exists public.brain_moraware_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_job_id text not null,
  source_account_id text,
  account_name text,
  job_name text,
  job_number text,
  process_name text,
  status_name text,
  salesperson_name text,
  created_at_source timestamptz,
  modified_at_source timestamptz,
  scheduled_at_source timestamptz,
  completed_at_source timestamptz,
  install_at_source timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_job_id)
);

create table if not exists public.brain_moraware_job_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_activity_id text not null,
  source_job_id text,
  activity_type_name text,
  activity_status_name text,
  phase_name text,
  scheduled_date date,
  scheduled_time text,
  duration_minutes numeric,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_activity_id)
);

create table if not exists public.brain_moraware_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_system text not null default 'moraware',
  source_resource_id text not null,
  resource_name text,
  resource_type text,
  is_active boolean,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_resource_id)
);

create table if not exists public.moraware_data_quality_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  finding_type text not null,
  severity text not null default 'warning',
  entity_type text not null,
  entity_id text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (sync_run_id, finding_type, entity_type, entity_id)
);

create index if not exists idx_moraware_sync_runs_org_started on public.moraware_sync_runs(organization_id, started_at desc);
create index if not exists idx_moraware_sync_runs_status on public.moraware_sync_runs(status, started_at desc);
create index if not exists idx_moraware_sync_errors_run on public.moraware_sync_errors(sync_run_id);
create index if not exists idx_brain_moraware_jobs_org_status on public.brain_moraware_jobs(organization_id, status_name);
create index if not exists idx_brain_moraware_jobs_org_account on public.brain_moraware_jobs(organization_id, source_account_id);
create index if not exists idx_brain_moraware_jobs_modified on public.brain_moraware_jobs(organization_id, modified_at_source desc);
create index if not exists idx_brain_moraware_activities_org_job on public.brain_moraware_job_activities(organization_id, source_job_id);
create index if not exists idx_brain_moraware_activities_date on public.brain_moraware_job_activities(organization_id, scheduled_date);
create index if not exists idx_moraware_quality_open on public.moraware_data_quality_findings(organization_id, resolved_at, finding_type);
