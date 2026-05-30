-- eliteOS Moraware Report Feeds (additive only).
--
-- Manual apply (Supabase SQL editor):
--   1) Open Supabase -> SQL -> New query.
--   2) Paste this file; run once. Re-run is safe (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--   3) Do NOT paste live Moraware customer/job exports into this file.
--   4) Replace sentinel organization_id values with the real tenant UUID before seeding feeds.
--
-- Intent:
--   Add an ingestion lane beside the existing Moraware API sync. Saved report CSV exports
--   supply business-friendly columns; rendered report HTML supplies stable /sys/job and
--   /sys/account IDs for identity enrichment before prepared facts promotion.
--
-- RLS note:
--   RLS is intentionally NOT enabled in this draft (matches moraware_sync_foundation_v1).
--   backend-core service role writes today. Add org-scoped RLS in a dedicated security milestone
--   before external SaaS dashboard reads use anon/authenticated Supabase clients directly.

create extension if not exists pgcrypto;

-- Sentinel used only when an organization_id is not yet known/configured.
-- Production should set MORAWARE_DEFAULT_ORGANIZATION_ID or pass organization_id in import payloads.

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

comment on table public.moraware_report_feeds is
  'Org-scoped Moraware saved-report integration contracts (view id, export/html paths, expected columns).';

create index if not exists idx_moraware_report_feeds_org_active
  on public.moraware_report_feeds(organization_id, is_active);

create table if not exists public.moraware_report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_feed_id uuid not null references public.moraware_report_feeds(id) on delete cascade,
  -- Allowed values (application-enforced): running | validated | needs_review | failed | promoted
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

comment on table public.moraware_report_runs is
  'One report-feed import attempt. Failed or needs_review runs must not replace active prepared facts.';

comment on column public.moraware_report_runs.schema_drift is
  'Header/column contract drift payload when observed_header_hash != expected_header_hash or columns missing.';

create index if not exists idx_moraware_report_runs_feed_started
  on public.moraware_report_runs(report_feed_id, started_at desc);

create index if not exists idx_moraware_report_runs_org_started
  on public.moraware_report_runs(organization_id, started_at desc);

create index if not exists idx_moraware_report_runs_org_status
  on public.moraware_report_runs(organization_id, status, started_at desc);

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

comment on table public.moraware_report_column_profiles is
  'Per-run CSV column profile: row/column counts, non-empty stats, sample values, header hash.';

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
  -- Allowed values (application-enforced): matched | needs_identity_review | ambiguous_identity
  identity_status text not null default 'needs_identity_review',
  identity_reason text,
  created_at timestamptz not null default now(),
  unique (report_run_id, row_number)
);

comment on table public.moraware_report_raw_rows is
  'Raw CSV rows for a run, enriched with HTML-derived IDs when identity matching succeeds.';

create index if not exists idx_moraware_report_raw_rows_run
  on public.moraware_report_raw_rows(report_run_id);

create index if not exists idx_moraware_report_raw_rows_hash
  on public.moraware_report_raw_rows(organization_id, row_hash);

create index if not exists idx_moraware_report_raw_rows_identity_status
  on public.moraware_report_raw_rows(report_run_id, identity_status);

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

comment on table public.moraware_report_identity_links is
  'HTML-derived account/job identity map for a run (normalized Account Name + Job Name key).';

create index if not exists idx_moraware_report_identity_links_run
  on public.moraware_report_identity_links(report_run_id);

create table if not exists public.moraware_prepared_sales_worksheet_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_feed_id uuid not null references public.moraware_report_feeds(id) on delete cascade,
  report_run_id uuid not null references public.moraware_report_runs(id) on delete restrict,
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
  superseded_by uuid references public.moraware_prepared_sales_worksheet_facts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.moraware_prepared_sales_worksheet_facts is
  'Promoted dashboard-ready Sales Worksheet facts. Dashboards read is_active=true rows only.';

comment on column public.moraware_prepared_sales_worksheet_facts.superseded_by is
  'Points to the newer prepared-fact row that replaced this row during promotion.';

-- One active prepared fact per org + feed + row_hash. Historical superseded rows remain (is_active=false).
create unique index if not exists uq_moraware_prepared_sales_worksheet_facts_one_active
  on public.moraware_prepared_sales_worksheet_facts(organization_id, report_feed_id, row_hash)
  where is_active = true;

create index if not exists idx_moraware_prepared_sales_worksheet_facts_active
  on public.moraware_prepared_sales_worksheet_facts(organization_id, report_feed_id, is_active);

create index if not exists idx_moraware_prepared_sales_worksheet_facts_active_only
  on public.moraware_prepared_sales_worksheet_facts(organization_id, report_feed_id)
  where is_active = true;

create index if not exists idx_moraware_prepared_sales_worksheet_facts_job
  on public.moraware_prepared_sales_worksheet_facts(organization_id, job_id)
  where job_id is not null;

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
--   '4e657f1f731e9fb054e0b9d8d4d6b1f586e612875d139ee33e4a083a5a6cfdb8',
--   'manual',
--   'Additive report-feed lane beside Moraware API sync. Hash validated against live export run afc7b49d-af7a-4fec-85a0-0fdb11046ea3 (2026-05-30).'
-- )
-- on conflict (organization_id, report_type) do nothing;
