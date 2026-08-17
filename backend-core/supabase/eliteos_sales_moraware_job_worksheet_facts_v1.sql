-- eliteOS Moraware Job Worksheet scope facts (TRUSTED_NOW raw worksheet grain)
-- Manual apply only. Do NOT auto-apply from app code.
--
-- Why a new table (not sales_moraware_job_facts):
--   sales_moraware_job_facts is job-grain (unique org + import_group_id + source_job_id).
--   Scope intelligence requires one row per Job Worksheet form instance
--   (org + import_group_id + source_job_id + source_form_id). Overloading the job table
--   would either collapse multi-worksheet jobs or break the existing job uniqueness.
--
-- Population epoch:
--   import_group_id = latest successful complete uncapped FULL census id
--   (same Option D contract as sales_moraware_job_facts). Incremental overlays update
--   rows inside the current epoch; they never redefine the universe.

create table if not exists public.sales_moraware_job_worksheet_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  import_group_id text not null,
  sync_run_id uuid references public.moraware_sync_runs(id) on delete set null,
  source_job_id text not null,
  source_account_id text,
  source_form_id text not null,
  form_name_raw text,
  room_raw text,
  color_raw text,
  color_is_placeholder boolean not null default false,
  sqft numeric,
  edge_raw text,
  thickness_raw text,
  backsplash_type_raw text,
  backsplash_height_raw text,
  sink_type_raw text,
  faucet_type_raw text,
  stove_type_raw text,
  electrical_cutouts_raw text,
  overhang_raw text,
  braces_raw text,
  dry_treat_raw text,
  stone_care_kit_raw text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, import_group_id, source_job_id, source_form_id)
);

create index if not exists idx_sales_mw_ws_facts_org_epoch
  on public.sales_moraware_job_worksheet_facts(organization_id, import_group_id);

create index if not exists idx_sales_mw_ws_facts_org_epoch_account
  on public.sales_moraware_job_worksheet_facts(organization_id, import_group_id, source_account_id);

create index if not exists idx_sales_mw_ws_facts_org_epoch_job
  on public.sales_moraware_job_worksheet_facts(organization_id, import_group_id, source_job_id);

create index if not exists idx_sales_mw_ws_facts_org_epoch_color
  on public.sales_moraware_job_worksheet_facts(organization_id, import_group_id, color_raw);

create index if not exists idx_sales_mw_ws_facts_org_epoch_room
  on public.sales_moraware_job_worksheet_facts(organization_id, import_group_id, room_raw);

comment on table public.sales_moraware_job_worksheet_facts is
  'TRUSTED_NOW Moraware Job Worksheet scope facts at form grain. Epoch = FULL census import_group_id. No material_family / upgrade_score / normalized backsplash.';
