-- Moraware Brain operational persistence schema (non-destructive extension)
--
-- Depends on: brain_jobs table from schema.sql
-- Apply after schema.sql.

create table if not exists brain_job_phases (
  id bigserial primary key,
  job_id text references brain_jobs(job_id) on delete cascade,
  phase_name text,
  phase_id text,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create table if not exists brain_job_activities (
  id bigserial primary key,
  job_id text references brain_jobs(job_id) on delete cascade,
  activity_index int,
  activity_type text,
  activity_status text,
  phase_name text,
  start_date date,
  sched_time text,
  duration text,
  description text,
  notes text,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create table if not exists brain_job_contacts (
  id bigserial primary key,
  job_id text references brain_jobs(job_id) on delete cascade,
  contact_name text,
  phone text,
  cell text,
  email text,
  notes text,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create table if not exists brain_job_operational_summary (
  job_id text primary key references brain_jobs(job_id) on delete cascade,
  has_template_activity boolean,
  template_dates jsonb,
  has_install_activity boolean,
  install_dates jsonb,
  has_order_stone_activity boolean,
  has_fabrication_activity boolean,
  has_saw_activity boolean,
  has_polish_activity boolean,
  has_customer_service_signal boolean,
  has_remake_signal boolean,
  has_repair_signal boolean,
  has_change_signal boolean,
  has_slab_signal boolean,
  slab_numbers jsonb,
  activity_count int,
  phase_count int,
  contact_count int,
  operational_notes_text text,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create index if not exists idx_brain_job_phases_job_id on brain_job_phases(job_id);
create index if not exists idx_brain_job_activities_job_id on brain_job_activities(job_id);
create index if not exists idx_brain_job_activities_activity_type on brain_job_activities(activity_type);
create index if not exists idx_brain_job_activities_activity_status on brain_job_activities(activity_status);
create index if not exists idx_brain_job_activities_start_date on brain_job_activities(start_date);
create index if not exists idx_brain_job_contacts_job_id on brain_job_contacts(job_id);
create index if not exists idx_brain_job_operational_summary_job_id on brain_job_operational_summary(job_id);

