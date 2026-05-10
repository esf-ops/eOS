-- Moraware operational Brain expansion (additive only).
-- Apply after operational_schema.sql / schema.sql.
-- No DROP statements; uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS only.

-- ---------------------------------------------------------------------------
-- brain_job_activities — richer schedule / phase metadata (key-shape proven)
-- Existing columns retained: activity_type, activity_status, phase_name, start_date, etc.
-- ---------------------------------------------------------------------------
alter table brain_job_activities add column if not exists activity_type_id text;
alter table brain_job_activities add column if not exists activity_type_name text;
alter table brain_job_activities add column if not exists status_id text;
alter table brain_job_activities add column if not exists status_name text;
alter table brain_job_activities add column if not exists phase_id text;
alter table brain_job_activities add column if not exists phase_seq_num integer;

create index if not exists idx_brain_job_activities_activity_type_name on brain_job_activities(activity_type_name);
create index if not exists idx_brain_job_activities_status_name on brain_job_activities(status_name);
create index if not exists idx_brain_job_activities_phase_name_ops on brain_job_activities(phase_name);

-- ---------------------------------------------------------------------------
-- brain_job_addresses — operational job.address (site / contact block)
-- ---------------------------------------------------------------------------
create table if not exists brain_job_addresses (
  job_id text primary key references brain_jobs(job_id) on delete cascade,
  address_line1 text,
  city text,
  state text,
  zip text,
  contact_name text,
  email text,
  cell text,
  notes text,
  raw_json jsonb,
  synced_at timestamptz default now()
);

create index if not exists idx_brain_job_addresses_city on brain_job_addresses(city);

-- ---------------------------------------------------------------------------
-- brain_job_phases — ordering (table already exists in operational_schema.sql)
-- ---------------------------------------------------------------------------
alter table brain_job_phases add column if not exists phase_seq_num integer;

-- ---------------------------------------------------------------------------
-- brain_job_notes_scope_signals — non-authoritative job-notes heuristics
-- ---------------------------------------------------------------------------
create table if not exists brain_job_notes_scope_signals (
  job_id text primary key references brain_jobs(job_id) on delete cascade,
  has_scope_like_lines boolean,
  detected_sqft_line_count integer,
  detected_phase_label_count integer,
  raw_notes text,
  parsed_signals jsonb default '{}'::jsonb,
  synced_at timestamptz default now()
);

create index if not exists idx_brain_job_notes_scope_has_scope on brain_job_notes_scope_signals(has_scope_like_lines);
