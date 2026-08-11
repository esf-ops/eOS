-- eliteOS Account Directory QuickBooks Customer Enrichment v1 (Phases 0–2)
-- Manual apply in Supabase SQL editor. DO NOT auto-run from app boot.
--
-- Transport: Windows QB Server → CData ODBC DSN (read-only)
--            → PowerShell worker → POST /api/internal/account-directory/quickbooks-customer-sync
-- Backend never connects to QuickBooks. Thryve Remote Connector is untouched.
--
-- Identity rules:
--   - Account Directory identity tables are NOT modified by this feed.
--   - Confirmed links remain account_directory_external_links (quickbooks_desktop, root ListID only).
--   - Child/job ListIDs live here as prepared facts only (is_job = true).
--   - No financial fact tables in this migration.

create table if not exists public.ad_qb_customer_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_list_id text not null,
  parent_list_id text,
  is_job boolean not null default false,
  name text,
  full_name text,
  is_active boolean not null default true,
  bill_city text,
  bill_state text,
  raw_hash text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

create index if not exists idx_ad_qb_customer_facts_org_root
  on public.ad_qb_customer_facts (organization_id, is_job, is_active);

create index if not exists idx_ad_qb_customer_facts_org_parent
  on public.ad_qb_customer_facts (organization_id, parent_list_id)
  where parent_list_id is not null;

create index if not exists idx_ad_qb_customer_facts_org_synced
  on public.ad_qb_customer_facts (organization_id, synced_at desc);

create table if not exists public.ad_qb_customer_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  worker_version text,
  company_name text,
  customers_count integer,
  jobs_count integer,
  roots_count integer,
  suggestions_open_count integer,
  warnings jsonb not null default '[]'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ad_qb_customer_sync_runs_org_started
  on public.ad_qb_customer_sync_runs (organization_id, started_at desc);

create index if not exists idx_ad_qb_customer_sync_runs_org_status
  on public.ad_qb_customer_sync_runs (organization_id, status, started_at desc);

-- One suggestion row per root QB ListID. Jobs never appear here.
create table if not exists public.ad_qb_link_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_list_id text not null,
  qb_full_name text,
  qb_name text,
  status text not null default 'open'
    check (status in ('open', 'needs_review', 'reconciled', 'linked', 'dismissed', 'conflict')),
  suggested_account_id uuid,
  rank_score numeric,
  rank_method text,
  conflict_reason text,
  candidate_accounts jsonb not null default '[]'::jsonb,
  sync_run_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

create index if not exists idx_ad_qb_link_suggestions_org_status
  on public.ad_qb_link_suggestions (organization_id, status, updated_at desc);

create index if not exists idx_ad_qb_link_suggestions_org_suggested
  on public.ad_qb_link_suggestions (organization_id, suggested_account_id)
  where suggested_account_id is not null;

alter table public.ad_qb_customer_facts enable row level security;
alter table public.ad_qb_customer_sync_runs enable row level security;
alter table public.ad_qb_link_suggestions enable row level security;

drop policy if exists "ad_qb_customer_facts service role" on public.ad_qb_customer_facts;
create policy "ad_qb_customer_facts service role"
  on public.ad_qb_customer_facts
  as permissive for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "ad_qb_customer_sync_runs service role" on public.ad_qb_customer_sync_runs;
create policy "ad_qb_customer_sync_runs service role"
  on public.ad_qb_customer_sync_runs
  as permissive for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "ad_qb_link_suggestions service role" on public.ad_qb_link_suggestions;
create policy "ad_qb_link_suggestions service role"
  on public.ad_qb_link_suggestions
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.ad_qb_customer_facts from anon, authenticated;
revoke all on public.ad_qb_customer_sync_runs from anon, authenticated;
revoke all on public.ad_qb_link_suggestions from anon, authenticated;
