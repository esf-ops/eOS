-- eliteOS Moraware completed-install form facts (additive).
-- Manual apply: authenticated CLI against verified eliteOS production.
-- Do NOT rewrite eliteos_moraware_report_feeds.sql.
--
-- Purpose:
--   Typed worksheet/form-grain COMPLETED_INSTALLATION_SF observations from
--   JobTracker view 219 First Install in-Job fields.
--   Does not populate sales_ops_sf_attribution_facts.
--   Does not enable Moraware writes.

alter table public.moraware_report_feeds
  add column if not exists accepted_header_hashes jsonb not null default '[]'::jsonb;

comment on column public.moraware_report_feeds.accepted_header_hashes is
  'Explicit accepted view-219 header hashes/versions (e.g. CS Challenging vs Billable). Unknown hashes remain blocking schema drift.';

alter table public.moraware_report_runs
  add column if not exists observed_contract_version text;

comment on column public.moraware_report_runs.observed_contract_version is
  'Matched accepted header-hash version for this run, when the feed uses accepted_header_hashes.';

create table if not exists public.moraware_prepared_completed_install_form_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  report_feed_id uuid not null references public.moraware_report_feeds(id) on delete cascade,
  report_run_id uuid not null references public.moraware_report_runs(id) on delete restrict,
  source_job_id text,
  source_form_id text,
  source_account_id text,
  form_name_raw text,
  form_identity_status text not null,
  completed_install_status text,
  completed_install_activity_type text,
  completed_install_date date,
  sqft numeric,
  source_row_hashes jsonb not null default '[]'::jsonb,
  source_updated_at timestamptz,
  observation_key text not null,
  creditable boolean not null default false,
  is_active boolean not null default true,
  promoted_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by uuid references public.moraware_prepared_completed_install_form_facts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moraware_completed_install_form_identity_chk check (
    form_identity_status in ('MATCHED', 'FORM_IDENTITY_UNRESOLVED', 'JOB_IDENTITY_UNRESOLVED')
  )
);

comment on table public.moraware_prepared_completed_install_form_facts is
  'View 219 First Install in-Job observations at organization + source_job_id + source_form_id grain. FORM_IDENTITY_UNRESOLVED rows are not creditable.';

create unique index if not exists uq_mw_completed_install_form_active_matched
  on public.moraware_prepared_completed_install_form_facts (
    organization_id, report_feed_id, source_job_id, source_form_id
  )
  where is_active = true and source_form_id is not null;

create unique index if not exists uq_mw_completed_install_form_active_key
  on public.moraware_prepared_completed_install_form_facts (
    organization_id, report_feed_id, observation_key
  )
  where is_active = true;

create index if not exists idx_mw_completed_install_form_org_feed_active
  on public.moraware_prepared_completed_install_form_facts (organization_id, report_feed_id)
  where is_active = true;

create index if not exists idx_mw_completed_install_form_creditable
  on public.moraware_prepared_completed_install_form_facts (organization_id, completed_install_date)
  where is_active = true and creditable = true;

alter table public.moraware_prepared_completed_install_form_facts enable row level security;
revoke all on public.moraware_prepared_completed_install_form_facts from anon, authenticated;

-- Production view 219 contract: accept both CS Challenging and CS Billable header hashes.
update public.moraware_report_feeds
set
  accepted_header_hashes = '[
    {"version":"v1_cs_challenging","hash":"8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade","label":"Customer Service Challenging (May 2026 contract)"},
    {"version":"v1_cs_billable","hash":"f08ad089002e593a212d49d716c06cf32776daa583d8ebaff7bf1bea74143c8b","label":"Customer Service Billable (Report 4 / live 2026-08-28)"}
  ]'::jsonb,
  cadence = 'daily_after_incremental',
  notes = 'View 219 Sales Worksheet Facts. First Install in-Job status/date are the COMPLETED_INSTALLATION_SF source. Accepted header hashes version Challenging vs Billable CS columns. Unknown hashes block.',
  updated_at = now()
where organization_id = '89180433-9fab-4024-bec9-a14d870bd0a8'
  and report_type = 'sales_worksheet_facts'
  and moraware_view_id = 219;
