-- eliteOS Moraware Calendar Schedule Feed (additive only).
--
-- Manual apply (Supabase SQL editor):
--   1) Paste and run once. Re-run is safe (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--   2) Does NOT modify existing Moraware sync or report-feed staging tables.
--
-- Purpose:
--   Typed prepared rows for Moraware calendar / install-day schedule exports so
--   Install Dashboard can read the same jobs shown on Moraware calendar views.
--   Populated via report-feed promotion (report_type = calendar_schedule_rows)
--   or operator scripts — never from the Install Dashboard frontend.

create extension if not exists pgcrypto;

create table if not exists public.moraware_calendar_schedule_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  report_feed_id uuid references public.moraware_report_feeds(id) on delete set null,
  report_run_id uuid references public.moraware_report_runs(id) on delete set null,
  row_hash text not null,
  source_system text not null default 'moraware',
  source_view_id integer,
  source_url text,
  calendar_date date not null,
  scheduled_start_time text,
  scheduled_end_time text,
  duration text,
  assigned_resource_id text,
  assigned_resource_name text,
  truck_or_crew_name text,
  activity_type text,
  activity_type_name text,
  activity_status text,
  job_id text,
  moraware_job_id text,
  job_name text,
  account_name text,
  customer_name text,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  sqft numeric,
  material text,
  color text,
  install_type text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  identity_status text not null default 'needs_identity_review',
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  promoted_at timestamptz,
  superseded_at timestamptz,
  superseded_by uuid references public.moraware_calendar_schedule_rows(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.moraware_calendar_schedule_rows is
  'Promoted Moraware calendar/install schedule rows for Install Dashboard day view. Read is_active=true only.';

create unique index if not exists uq_moraware_calendar_schedule_rows_one_active
  on public.moraware_calendar_schedule_rows(organization_id, row_hash)
  where is_active = true;

create index if not exists idx_moraware_calendar_schedule_rows_org_date
  on public.moraware_calendar_schedule_rows(organization_id, calendar_date, is_active);

create index if not exists idx_moraware_calendar_schedule_rows_org_truck_date
  on public.moraware_calendar_schedule_rows(organization_id, truck_or_crew_name, calendar_date)
  where is_active = true;

-- Optional feed seed (replace organization_id before enabling):
-- insert into public.moraware_report_feeds (
--   organization_id, name, moraware_view_id, report_type, export_path, expected_columns, cadence, notes
-- ) values (
--   '00000000-0000-0000-0000-000000000000',
--   'Moraware Install Calendar Schedule (view 222)',
--   222,
--   'calendar_schedule_rows',
--   '/sys/report/?view=222&spreadsheet=1&exportType=AllPages&table=Report',
--   '[]'::jsonb,
--   'manual',
--   'Discover exact Moraware calendar export/view id and column contract before production ingest.'
-- ) on conflict (organization_id, report_type) do nothing;
