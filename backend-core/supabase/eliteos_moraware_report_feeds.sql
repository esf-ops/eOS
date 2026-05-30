-- eliteOS Moraware Report Feeds (additive only).
--
-- Manual apply (Supabase SQL editor):
--   1) Open Supabase -> SQL -> New query.
--   2) Paste this file; run once. Re-run is safe (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--   3) Do NOT paste live Moraware customer/job exports into this file.
--
-- Intent:
--   Add an ingestion lane beside the existing Moraware API sync. Saved report CSV exports
--   supply business-friendly columns; rendered report HTML supplies stable /sys/job and
--   /sys/account IDs for identity enrichment before prepared facts promotion.

create extension if not exists pgcrypto;

create table if not exists public.moraware_report_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  name text not null,
  moraware_view_id integer not null,
  report_type text not null,
  export_path text,
  export_url_template text,
  html_path text,
  html_url_template text,
  expected_columns jsonb not null default '[]'::jsonb,
  expected_column_hash text,
  cadence text not null default 'manual',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, report_type)
);

create index if not exists idx_moraware_report_feeds_org_active
  on public.moraware_report_feeds(organization_id, is_active);

create table if not exists public.moraware_report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_feed_id uuid not null references public.moraware_report_feeds(id) on delete cascade,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_mode text not null default 'local_file',
  csv_storage_path text,
  html_storage_path text,
  observed_header_hash text,
  expected_header_hash text,
  row_count integer not null default 0,
  matched_identity_count integer not null default 0,
  unmatched_identity_count integer not null default 0,
  ambiguous_identity_count integer not null default 0,
  schema_drift jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moraware_report_runs_feed_started
  on public.moraware_report_runs(report_feed_id, started_at desc);

create table if not exists public.moraware_report_column_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_run_id uuid not null references public.moraware_report_runs(id) on delete cascade,
  header_hash text not null,
  row_count integer not null default 0,
  column_count integer not null default 0,
  columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_moraware_report_column_profiles_run
  on public.moraware_report_column_profiles(report_run_id);

create table if not exists public.moraware_report_raw_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_run_id uuid not null references public.moraware_report_runs(id) on delete cascade,
  row_number integer not null,
  row_hash text not null,
  raw_row jsonb not null,
  account_name text,
  job_name text,
  account_id text,
  job_id text,
  identity_status text not null default 'needs_identity_review',
  identity_reason text,
  created_at timestamptz not null default now(),
  unique (report_run_id, row_number)
);

create index if not exists idx_moraware_report_raw_rows_run
  on public.moraware_report_raw_rows(report_run_id);

create index if not exists idx_moraware_report_raw_rows_hash
  on public.moraware_report_raw_rows(organization_id, row_hash);

create table if not exists public.moraware_report_identity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_run_id uuid not null references public.moraware_report_runs(id) on delete cascade,
  match_key text not null,
  account_id text,
  account_name text,
  job_id text,
  job_name text,
  source text not null default 'html_report',
  is_ambiguous boolean not null default false,
  created_at timestamptz not null default now(),
  unique (report_run_id, match_key)
);

create index if not exists idx_moraware_report_identity_links_run
  on public.moraware_report_identity_links(report_run_id);

create table if not exists public.moraware_prepared_sales_worksheet_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_feed_id uuid not null references public.moraware_report_feeds(id) on delete cascade,
  report_run_id uuid not null references public.moraware_report_runs(id) on delete cascade,
  row_hash text not null,
  account_id text,
  account_name text,
  job_id text,
  job_name text,
  job_status text,
  job_creation_date text,
  job_salesperson text,
  total_worksheet_sqft numeric,
  color text,
  stone text,
  room text,
  branch_or_process text,
  identity_status text not null default 'matched',
  raw_row jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  promoted_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, report_feed_id, row_hash, is_active)
);

create index if not exists idx_moraware_prepared_sales_worksheet_facts_active
  on public.moraware_prepared_sales_worksheet_facts(organization_id, report_feed_id, is_active);

create index if not exists idx_moraware_prepared_sales_worksheet_facts_job
  on public.moraware_prepared_sales_worksheet_facts(organization_id, job_id);

-- Seed / contract documentation (run after tables exist; replace organization_id before production use):
--
-- insert into public.moraware_report_feeds (
--   organization_id,
--   name,
--   moraware_view_id,
--   report_type,
--   export_path,
--   html_path,
--   expected_columns,
--   expected_column_hash,
--   cadence,
--   notes
-- ) values (
--   '00000000-0000-0000-0000-000000000000',
--   'eliteOS - Sales Worksheet Facts',
--   219,
--   'sales_worksheet_facts',
--   '/sys/report/?view=219&spreadsheet=1&exportType=AllPages&table=Report',
--   '/sys/report/?view=219',
--   '["Account Name","Job Name","Job Status","Job Creation Date","Job Salesperson","Total Job Worksheet Sq.Ft.","Color","Stone","Room","Branch"]'::jsonb,
--   null,
--   'manual',
--   'Additive report-feed lane beside Moraware API sync. Set expected_column_hash after first validated import.'
-- )
-- on conflict (organization_id, report_type) do nothing;
