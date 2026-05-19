-- eliteOS Sales Head prepared Moraware facts
-- Purpose: keep normal dashboard reads fast. Raw Moraware payload extraction is
-- expensive and should happen during import/sync or a controlled facts rebuild,
-- not on every Sales Head page load.

create table if not exists public.sales_moraware_job_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  import_group_id text not null,
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_job_id text not null,
  source_account_id text,
  account_name text,
  status_name text,
  process_name text,
  salesperson_name text,
  created_at_source timestamptz,
  modified_at_source timestamptz,
  scheduled_at_source timestamptz,
  completed_at_source timestamptz,
  install_at_source timestamptz,
  worksheet_sqft numeric,
  sqft_found boolean not null default false,
  sqft_source text,
  report_month_created text,
  report_month_completed text,
  report_month_install text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, import_group_id, source_job_id)
);

create index if not exists idx_sales_moraware_job_facts_group
  on public.sales_moraware_job_facts(organization_id, import_group_id);

create index if not exists idx_sales_moraware_job_facts_created_month
  on public.sales_moraware_job_facts(organization_id, import_group_id, report_month_created);

create index if not exists idx_sales_moraware_job_facts_account
  on public.sales_moraware_job_facts(organization_id, import_group_id, source_account_id);

create table if not exists public.sales_moraware_account_rollups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  import_group_id text not null,
  source_account_id text,
  account_name text,
  normalized_moraware_name text,
  job_count integer not null default 0,
  jobs_with_sqft integer not null default 0,
  jobs_missing_sqft integer not null default 0,
  total_sqft numeric not null default 0,
  first_report_date date,
  last_report_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, import_group_id, normalized_moraware_name)
);

create index if not exists idx_sales_moraware_account_rollups_group
  on public.sales_moraware_account_rollups(organization_id, import_group_id);

create index if not exists idx_sales_moraware_account_rollups_sqft
  on public.sales_moraware_account_rollups(organization_id, import_group_id, total_sqft desc);

