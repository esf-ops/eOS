-- Moraware Brain persistence schema (draft)
-- Requires: pgcrypto for gen_random_uuid()
--   create extension if not exists pgcrypto;

create table if not exists brain_sync_runs (
  id uuid primary key default gen_random_uuid(),
  mode text,
  started_at timestamptz,
  finished_at timestamptz,
  process_count int,
  job_ids_discovered int,
  jobs_detailed int,
  jobs_ingested int,
  forms_extracted int,
  fields_extracted int,
  worksheet_sqft_total numeric,
  status text,
  error_message text,
  raw_summary jsonb
);

create table if not exists brain_jobs (
  job_id text primary key,
  job_name text,
  account_id text,
  account_name text,
  creation_date date,
  job_status text,
  salesperson_name text,
  notes text,
  worksheet_sqft numeric,
  total_sqft numeric,
  form_count int,
  field_count int,
  job_worksheet_forms int,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create table if not exists brain_forms (
  form_id text primary key,
  job_id text references brain_jobs(job_id) on delete cascade,
  form_name text,
  raw_form_name text,
  form_template_id text,
  form_template_name text,
  phase_id text,
  phase_name text,
  phase_seq_num int,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create table if not exists brain_fields (
  id bigserial primary key,
  job_id text references brain_jobs(job_id) on delete cascade,
  form_id text references brain_forms(form_id) on delete cascade,
  field_id text,
  label text,
  normalized_label text,
  value text,
  numeric_value numeric,
  field_value_id text,
  data_type text,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create index if not exists idx_brain_jobs_account_id on brain_jobs(account_id);
create index if not exists idx_brain_jobs_salesperson_name on brain_jobs(salesperson_name);
create index if not exists idx_brain_jobs_creation_date on brain_jobs(creation_date);
create index if not exists idx_brain_forms_job_id on brain_forms(job_id);
create index if not exists idx_brain_fields_job_id on brain_fields(job_id);
create index if not exists idx_brain_fields_form_id on brain_fields(form_id);
create index if not exists idx_brain_fields_normalized_label on brain_fields(normalized_label);
create index if not exists idx_brain_fields_job_label on brain_fields(job_id, normalized_label);

