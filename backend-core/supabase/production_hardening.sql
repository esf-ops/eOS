-- Production hardening (non-destructive extension)
--
-- Requires pgcrypto:
--   create extension if not exists pgcrypto;

create table if not exists eos_sync_locks (
  lock_name text primary key,
  locked_at timestamptz,
  locked_by text,
  expires_at timestamptz,
  metadata jsonb
);

create table if not exists eos_failed_job_syncs (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  sync_run_id uuid,
  sync_stage text,
  error_message text,
  payload jsonb,
  retry_count int default 0,
  resolved boolean default false,
  created_at timestamptz default now(),
  last_retry_at timestamptz
);

create index if not exists idx_eos_failed_job_syncs_sync_run_id on eos_failed_job_syncs(sync_run_id);
create index if not exists idx_eos_failed_job_syncs_job_id on eos_failed_job_syncs(job_id);
create index if not exists idx_eos_failed_job_syncs_resolved on eos_failed_job_syncs(resolved);

-- Extend brain_sync_runs with production fields (additive)
alter table if exists brain_sync_runs add column if not exists sync_start_date date;
alter table if exists brain_sync_runs add column if not exists sync_end_date date;
alter table if exists brain_sync_runs add column if not exists ingest_operational boolean;
alter table if exists brain_sync_runs add column if not exists activities_extracted int;
alter table if exists brain_sync_runs add column if not exists phases_extracted int;
alter table if exists brain_sync_runs add column if not exists contacts_extracted int;
alter table if exists brain_sync_runs add column if not exists stopped_reason text;

