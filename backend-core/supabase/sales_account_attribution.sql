-- Sales Account Attribution + Mapping Tables (ADDITIVE ONLY)
-- DO NOT RUN AUTOMATICALLY. Apply manually after review.
--
-- Goals:
-- - Persist Monday/master accounts (source of truth for ownership where possible)
-- - Persist Moraware->Monday aliases (approved crosswalk)
-- - Persist account assignments & history (editable later without code changes)
-- - Persist Moraware report audit rows (for reconciliation / traceability)
--
-- Safety:
-- - No destructive changes
-- - No automatic approvals for fuzzy matches
-- - No overwrite of approved mappings without explicit admin intent

-- Extensions (if needed):
-- create extension if not exists "pgcrypto";

-- 1) sales_reps
create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  rep_name text not null,
  email text,
  active boolean default true,
  role text default 'sales',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed guidance (optional; run manually):
-- insert into public.sales_reps (rep_name) values
--   ('Casey Schenke'),
--   ('Thera McEnany'),
--   ('Michael Joseph')
-- on conflict do nothing;

-- 2) sales_branches
create table if not exists public.sales_branches (
  id uuid primary key default gen_random_uuid(),
  branch_name text not null,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed guidance (optional; run manually):
-- insert into public.sales_branches (branch_name) values
--   ('Lisbon'),
--   ('Dyersville'),
--   ('Iowa City'),
--   ('Unmapped')
-- on conflict do nothing;

-- 3) sales_account_master
create table if not exists public.sales_account_master (
  id uuid primary key default gen_random_uuid(),
  source text default 'monday',
  source_account_id text null,
  monday_account_name text not null,
  normalized_account_name text,
  sales_executive text,
  branch text,
  account_status text,
  account_type text,
  raw_json jsonb,
  imported_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sales_account_master_normalized on public.sales_account_master (normalized_account_name);
create index if not exists idx_sales_account_master_sales_exec on public.sales_account_master (sales_executive);
create index if not exists idx_sales_account_master_branch on public.sales_account_master (branch);

create unique index if not exists uq_sales_account_master_source_id
  on public.sales_account_master (source, source_account_id)
  where source_account_id is not null;

-- Optional (review before enabling):
-- create unique index if not exists uq_sales_account_master_source_norm
--   on public.sales_account_master (source, normalized_account_name)
--   where normalized_account_name is not null and normalized_account_name <> '';

-- 4) sales_account_aliases
create table if not exists public.sales_account_aliases (
  id uuid primary key default gen_random_uuid(),
  moraware_account_name text not null,
  normalized_moraware_name text,
  sales_account_master_id uuid references public.sales_account_master(id),
  monday_account_name text,
  normalized_monday_name text,
  assigned_salesperson text,
  branch text,
  match_type text,
  confidence text,
  approved boolean default false,
  notes text,
  created_by uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  raw_suggestion jsonb
);

create index if not exists idx_sales_account_aliases_norm_moraware on public.sales_account_aliases (normalized_moraware_name);
create index if not exists idx_sales_account_aliases_master_id on public.sales_account_aliases (sales_account_master_id);
create index if not exists idx_sales_account_aliases_approved on public.sales_account_aliases (approved);
create index if not exists idx_sales_account_aliases_salesperson on public.sales_account_aliases (assigned_salesperson);
create index if not exists idx_sales_account_aliases_branch on public.sales_account_aliases (branch);

create unique index if not exists uq_sales_account_aliases_approved_norm_moraware
  on public.sales_account_aliases (normalized_moraware_name)
  where approved = true and normalized_moraware_name is not null and normalized_moraware_name <> '';

-- 5) sales_account_assignments
create table if not exists public.sales_account_assignments (
  id uuid primary key default gen_random_uuid(),
  sales_account_master_id uuid references public.sales_account_master(id),
  assigned_salesperson text,
  branch text,
  assignment_type text default 'current_owner',
  effective_start_date date,
  effective_end_date date,
  active boolean default true,
  approved boolean default false,
  approved_by uuid null,
  approved_at timestamptz null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sales_account_assignments_master on public.sales_account_assignments (sales_account_master_id);
create index if not exists idx_sales_account_assignments_salesperson on public.sales_account_assignments (assigned_salesperson);
create index if not exists idx_sales_account_assignments_branch on public.sales_account_assignments (branch);
create index if not exists idx_sales_account_assignments_active on public.sales_account_assignments (active);
create index if not exists idx_sales_account_assignments_approved on public.sales_account_assignments (approved);

-- Optional (review before enabling; requires partial uniqueness logic):
-- create unique index if not exists uq_sales_account_assignments_one_active_approved_owner
--   on public.sales_account_assignments (sales_account_master_id)
--   where active = true and approved = true and assignment_type = 'current_owner';

-- 6) sales_account_assignment_history
create table if not exists public.sales_account_assignment_history (
  id uuid primary key default gen_random_uuid(),
  sales_account_master_id uuid references public.sales_account_master(id),
  old_salesperson text,
  new_salesperson text,
  old_branch text,
  new_branch text,
  changed_by uuid null,
  changed_at timestamptz default now(),
  reason text,
  raw_json jsonb
);

create index if not exists idx_sales_account_assignment_history_master on public.sales_account_assignment_history (sales_account_master_id);
create index if not exists idx_sales_account_assignment_history_changed_at on public.sales_account_assignment_history (changed_at);

-- 7) sales_moraware_report_audit
create table if not exists public.sales_moraware_report_audit (
  id uuid primary key default gen_random_uuid(),
  source_file text,
  imported_at timestamptz default now(),
  job_name text,
  moraware_account_name text,
  normalized_moraware_account_name text,
  moraware_job_salesperson text,
  account_salesperson text,
  job_creation_date date,
  worksheet_color text,
  sqft numeric,
  raw_json jsonb
);

create index if not exists idx_sales_moraware_report_audit_date on public.sales_moraware_report_audit (job_creation_date);
create index if not exists idx_sales_moraware_report_audit_norm_acct on public.sales_moraware_report_audit (normalized_moraware_account_name);
create index if not exists idx_sales_moraware_report_audit_job_sp on public.sales_moraware_report_audit (moraware_job_salesperson);

-- 8) sales_account_attribution_audit
create table if not exists public.sales_account_attribution_audit (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz default now(),
  moraware_account_name text,
  normalized_moraware_account_name text,
  monday_account_name text,
  assigned_salesperson text,
  branch text,
  total_sqft numeric,
  job_count integer,
  match_type text,
  confidence text,
  approved boolean,
  raw_json jsonb
);

create index if not exists idx_sales_account_attribution_audit_salesperson on public.sales_account_attribution_audit (assigned_salesperson);
create index if not exists idx_sales_account_attribution_audit_branch on public.sales_account_attribution_audit (branch);
create index if not exists idx_sales_account_attribution_audit_approved on public.sales_account_attribution_audit (approved);
create index if not exists idx_sales_account_attribution_audit_confidence on public.sales_account_attribution_audit (confidence);

