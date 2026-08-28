-- eliteOS Sales Ops v1 — additive foundation tables
-- Manual apply only: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
-- Do NOT apply automatically from CI/agents. Do not run against production unless instructed.
--
-- Purpose:
--   Personalized sales plans with versioned lifecycle (draft → in_review → approved →
--   active / superseded / archived), reusable templates, acknowledgements, period/KPI
--   targets, scorecards with target snapshots, Monday account cache, manager assignments,
--   webhook dedupe, and sync logging.
--   Plans default to draft. This file does not seed a salesperson UUID or activate any plan.
--   The Cedar Valley / Thera 2026–2028 ramp is prototype/reference material only.
--   Does NOT drop or rewrite quote, pricing, or existing sales dashboard tables.
--
-- Rollback (if applied and empty):
--   DROP TABLE IF EXISTS public.sales_ops_webhook_events CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_sync_log CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_activity_events CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_account_intelligence CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_accounts CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_scorecards CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_metric_targets CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_period_targets CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_copy CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_rep_mappings CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_config CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_manager_assignments CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_commission_snapshots CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_acknowledgements CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_events CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_template_copy CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_template_metric_targets CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_template_period_targets CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plan_templates CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_plans CASCADE;
--   DROP FUNCTION IF EXISTS public.sales_ops_set_updated_at() CASCADE;
-- If this file was never applied: nothing to roll back.
--
-- Security:
--   RLS enabled; service_role bypasses RLS (backend-core uses service role).
--   authenticated SELECT is org + ownership/manager scoped. Mutations via service_role only.

create or replace function public.sales_ops_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ── plans ────────────────────────────────────────────────────────────────────

create table if not exists public.sales_ops_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  plan_family_id uuid not null,
  version_number integer not null default 1,
  status text not null default 'draft',
  plan_name text not null,
  territory_name text null,
  manager_user_id uuid null,
  start_date date not null,
  end_date date not null,
  effective_start_date date not null,
  effective_end_date date null,
  north_star_metric text not null default 'installed_sqft_per_month',
  north_star_target numeric not null default 0,
  north_star_target_date date null,
  stretch_target numeric null,
  blueprint_key text null,
  template_id uuid null,
  is_prototype boolean not null default false,
  headline text null,
  subtitle text null,
  commission_enabled boolean not null default false,
  commission_rules jsonb not null default '{}'::jsonb,
  account_expectations jsonb not null default '{}'::jsonb,
  rhythms jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  supersedes_plan_id uuid null,
  superseded_by_plan_id uuid null,
  submitted_by uuid null,
  submitted_at timestamptz null,
  approved_by uuid null,
  approved_at timestamptz null,
  published_by uuid null,
  published_at timestamptz null,
  archived_by uuid null,
  archived_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_plans_name_nonempty check (length(btrim(plan_name)) > 0),
  constraint sales_ops_plans_status_chk check (
    status in ('draft', 'in_review', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint sales_ops_plans_version_pos check (version_number >= 1)
);

create index if not exists sales_ops_plans_org_user_status_idx
  on public.sales_ops_plans (organization_id, user_id, status);

create index if not exists sales_ops_plans_org_status_idx
  on public.sales_ops_plans (organization_id, status, effective_start_date);

create unique index if not exists sales_ops_plans_family_version_uidx
  on public.sales_ops_plans (organization_id, plan_family_id, version_number);

create unique index if not exists sales_ops_plans_one_active_per_user
  on public.sales_ops_plans (organization_id, user_id)
  where status = 'active';

drop trigger if exists sales_ops_plans_updated_at on public.sales_ops_plans;
create trigger sales_ops_plans_updated_at
  before update on public.sales_ops_plans
  for each row execute function public.sales_ops_set_updated_at();

-- ── period targets ───────────────────────────────────────────────────────────

create table if not exists public.sales_ops_plan_period_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null references public.sales_ops_plans(id) on delete cascade,
  period text not null,
  label text not null,
  year text not null,
  installed_target numeric not null default 0,
  rolling_three_month_target numeric not null default 0,
  qualified_pipeline_target numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_period_yyyy_mm check (period ~ '^[0-9]{4}-[0-9]{2}$')
);

create unique index if not exists sales_ops_period_targets_plan_period_uidx
  on public.sales_ops_plan_period_targets (plan_id, period);

create index if not exists sales_ops_period_targets_org_idx
  on public.sales_ops_plan_period_targets (organization_id, plan_id);

drop trigger if exists sales_ops_period_targets_updated_at on public.sales_ops_plan_period_targets;
create trigger sales_ops_period_targets_updated_at
  before update on public.sales_ops_plan_period_targets
  for each row execute function public.sales_ops_set_updated_at();

-- ── metric targets ───────────────────────────────────────────────────────────

create table if not exists public.sales_ops_plan_metric_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null references public.sales_ops_plans(id) on delete cascade,
  metric_key text not null,
  label text not null,
  unit text not null default 'count',
  cadence text not null default 'weekly',
  target_value numeric not null default 0,
  warning_threshold numeric null,
  source_authority text not null default 'plan',
  display_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_metric_targets_plan_key_uidx
  on public.sales_ops_plan_metric_targets (plan_id, metric_key);

create index if not exists sales_ops_metric_targets_org_idx
  on public.sales_ops_plan_metric_targets (organization_id, plan_id);

drop trigger if exists sales_ops_metric_targets_updated_at on public.sales_ops_plan_metric_targets;
create trigger sales_ops_metric_targets_updated_at
  before update on public.sales_ops_plan_metric_targets
  for each row execute function public.sales_ops_set_updated_at();

-- ── plan copy / insights ─────────────────────────────────────────────────────

create table if not exists public.sales_ops_plan_copy (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null references public.sales_ops_plans(id) on delete cascade,
  copy_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_plan_copy_uidx
  on public.sales_ops_plan_copy (plan_id, copy_key);

drop trigger if exists sales_ops_plan_copy_updated_at on public.sales_ops_plan_copy;
create trigger sales_ops_plan_copy_updated_at
  before update on public.sales_ops_plan_copy
  for each row execute function public.sales_ops_set_updated_at();

-- ── plan templates (independent after clone) ─────────────────────────────────

create table if not exists public.sales_ops_plan_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_key text null,
  template_name text not null,
  active boolean not null default true,
  is_prototype boolean not null default false,
  default_duration_months integer null,
  north_star_metric text not null default 'installed_sqft_per_month',
  north_star_target numeric not null default 0,
  north_star_target_date date null,
  stretch_target numeric null,
  territory_name text null,
  commission_enabled boolean not null default false,
  commission_rules jsonb not null default '{}'::jsonb,
  account_expectations jsonb not null default '{}'::jsonb,
  rhythms jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_templates_name_nonempty check (length(btrim(template_name)) > 0)
);

create unique index if not exists sales_ops_templates_org_key_uidx
  on public.sales_ops_plan_templates (organization_id, template_key)
  where template_key is not null;

create index if not exists sales_ops_templates_org_idx
  on public.sales_ops_plan_templates (organization_id, active);

drop trigger if exists sales_ops_templates_updated_at on public.sales_ops_plan_templates;
create trigger sales_ops_templates_updated_at
  before update on public.sales_ops_plan_templates
  for each row execute function public.sales_ops_set_updated_at();

create table if not exists public.sales_ops_plan_template_period_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null references public.sales_ops_plan_templates(id) on delete cascade,
  period text not null,
  label text not null,
  year text not null,
  installed_target numeric not null default 0,
  rolling_three_month_target numeric not null default 0,
  qualified_pipeline_target numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_tpl_period_yyyy_mm check (period ~ '^[0-9]{4}-[0-9]{2}$')
);

create unique index if not exists sales_ops_tpl_period_uidx
  on public.sales_ops_plan_template_period_targets (template_id, period);

create table if not exists public.sales_ops_plan_template_metric_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null references public.sales_ops_plan_templates(id) on delete cascade,
  metric_key text not null,
  label text not null,
  unit text not null default 'count',
  cadence text not null default 'weekly',
  target_value numeric not null default 0,
  warning_threshold numeric null,
  source_authority text not null default 'plan',
  display_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_tpl_metric_uidx
  on public.sales_ops_plan_template_metric_targets (template_id, metric_key);

create table if not exists public.sales_ops_plan_template_copy (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null references public.sales_ops_plan_templates(id) on delete cascade,
  copy_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_tpl_copy_uidx
  on public.sales_ops_plan_template_copy (template_id, copy_key);

-- ── plan workflow events (timeline) ──────────────────────────────────────────

create table if not exists public.sales_ops_plan_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null references public.sales_ops_plans(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists sales_ops_plan_events_plan_idx
  on public.sales_ops_plan_events (plan_id, created_at);

-- ── acknowledgements ─────────────────────────────────────────────────────────

create table if not exists public.sales_ops_plan_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null references public.sales_ops_plans(id) on delete cascade,
  user_id uuid not null,
  ack_type text not null default 'published_plan',
  comment text null,
  acknowledged_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_plan_ack_uidx
  on public.sales_ops_plan_acknowledgements (organization_id, plan_id, user_id);

-- ── scorecards ───────────────────────────────────────────────────────────────

create table if not exists public.sales_ops_scorecards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null references public.sales_ops_plans(id) on delete cascade,
  user_id uuid not null,
  period text not null,
  installed numeric not null default 0,
  pipeline numeric not null default 0,
  quoted numeric not null default 0,
  awarded numeric not null default 0,
  touches numeric not null default 0,
  meetings numeric not null default 0,
  opportunities numeric not null default 0,
  follow_up numeric not null default 0,
  repeat_share numeric not null default 0,
  note text not null default '',
  sources jsonb not null default '{}'::jsonb,
  target_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_scorecards_period_yyyy_mm check (period ~ '^[0-9]{4}-[0-9]{2}$')
);

create unique index if not exists sales_ops_scorecards_user_period_uidx
  on public.sales_ops_scorecards (organization_id, user_id, period);

create index if not exists sales_ops_scorecards_plan_idx
  on public.sales_ops_scorecards (plan_id, period);

drop trigger if exists sales_ops_scorecards_updated_at on public.sales_ops_scorecards;
create trigger sales_ops_scorecards_updated_at
  before update on public.sales_ops_scorecards
  for each row execute function public.sales_ops_set_updated_at();

-- ── Monday config (org-scoped; secrets stay in env / secret_ref) ─────────────

create table if not exists public.sales_ops_monday_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique,
  enabled boolean not null default false,
  account_master_board_id text null,
  column_map jsonb not null default '{}'::jsonb,
  webhook_ids jsonb not null default '[]'::jsonb,
  last_full_sync_at timestamptz null,
  last_webhook_at timestamptz null,
  last_success_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists sales_ops_monday_config_updated_at on public.sales_ops_monday_config;
create trigger sales_ops_monday_config_updated_at
  before update on public.sales_ops_monday_config
  for each row execute function public.sales_ops_set_updated_at();

-- Elite seed: board ID is tenant config for elite_stone_fabrication only, not a SaaS-global constant.
insert into public.sales_ops_monday_config (
  organization_id, enabled, account_master_board_id, column_map
)
select o.id, false, '18397092941', '{}'::jsonb
from public.organizations o
where o.organization_key = 'elite_stone_fabrication'
on conflict (organization_id) do nothing;

-- ── Monday rep mappings ──────────────────────────────────────────────────────

create table if not exists public.sales_ops_monday_rep_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  monday_user_id text not null,
  salesperson_label text null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_monday_rep_org_monday_uidx
  on public.sales_ops_monday_rep_mappings (organization_id, monday_user_id)
  where active = true;

create unique index if not exists sales_ops_monday_rep_org_user_uidx
  on public.sales_ops_monday_rep_mappings (organization_id, user_id)
  where active = true;

drop trigger if exists sales_ops_monday_rep_updated_at on public.sales_ops_monday_rep_mappings;
create trigger sales_ops_monday_rep_updated_at
  before update on public.sales_ops_monday_rep_mappings
  for each row execute function public.sales_ops_set_updated_at();

-- ── accounts cache ───────────────────────────────────────────────────────────

create table if not exists public.sales_ops_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  monday_item_id text not null,
  account_name text not null,
  monday_url text null,
  monday_group text null,
  monday_assigned_user_id text null,
  assigned_user_id uuid null,
  status text null,
  last_contact date null,
  next_contact date null,
  market text null,
  branch text null,
  account_type text null,
  sample_program text null,
  current_primary_supplier text null,
  primary_pain_point text null,
  esf_solution text null,
  next_strategic_milestone text null,
  target_sqft_per_month numeric null,
  monday_updated_at timestamptz null,
  synced_at timestamptz null,
  archived boolean not null default false,
  last_eliteos_mutation_hash text null,
  last_eliteos_mutation_at timestamptz null,
  raw_columns jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_accounts_org_item_uidx
  on public.sales_ops_accounts (organization_id, monday_board_id, monday_item_id);

create index if not exists sales_ops_accounts_assigned_idx
  on public.sales_ops_accounts (organization_id, assigned_user_id)
  where archived = false;

drop trigger if exists sales_ops_accounts_updated_at on public.sales_ops_accounts;
create trigger sales_ops_accounts_updated_at
  before update on public.sales_ops_accounts
  for each row execute function public.sales_ops_set_updated_at();

-- ── account intelligence (eliteOS-owned) ─────────────────────────────────────

create table if not exists public.sales_ops_account_intelligence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.sales_ops_accounts(id) on delete cascade,
  recommended_tier text null,
  strategic_play text null,
  recommended_monthly_target numeric null,
  next_actions jsonb not null default '[]'::jsonb,
  performance jsonb null,
  identity_match jsonb null,
  snapshot_at timestamptz not null default timezone('utc', now()),
  source text not null default 'eliteos',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_account_intel_uidx
  on public.sales_ops_account_intelligence (account_id);

drop trigger if exists sales_ops_account_intel_updated_at on public.sales_ops_account_intelligence;
create trigger sales_ops_account_intel_updated_at
  before update on public.sales_ops_account_intelligence
  for each row execute function public.sales_ops_set_updated_at();

-- ── activity events ──────────────────────────────────────────────────────────

create table if not exists public.sales_ops_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid null references public.sales_ops_accounts(id) on delete set null,
  user_id uuid null,
  event_type text not null,
  source text not null default 'eliteos',
  external_id text null,
  occurred_at timestamptz not null default timezone('utc', now()),
  status text null,
  summary text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_activity_external_uidx
  on public.sales_ops_activity_events (organization_id, source, external_id)
  where external_id is not null;

create index if not exists sales_ops_activity_account_idx
  on public.sales_ops_activity_events (organization_id, account_id, occurred_at desc);

create index if not exists sales_ops_activity_user_idx
  on public.sales_ops_activity_events (organization_id, user_id, occurred_at desc);

-- ── sync log ─────────────────────────────────────────────────────────────────

create table if not exists public.sales_ops_sync_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  direction text not null,
  entity text not null,
  monday_item_id text null,
  monday_update_id text null,
  operation text not null,
  outcome text not null,
  error text null,
  actor_user_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists sales_ops_sync_log_org_idx
  on public.sales_ops_sync_log (organization_id, created_at desc);

-- ── webhook event identity ───────────────────────────────────────────────────

create table if not exists public.sales_ops_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id text not null,
  event_type text null,
  monday_item_id text null,
  processed_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_webhook_events_uidx
  on public.sales_ops_webhook_events (organization_id, event_id);

-- ── manager assignments ──────────────────────────────────────────────────────

create table if not exists public.sales_ops_manager_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  manager_user_id uuid not null,
  report_user_id uuid not null,
  can_view_commission boolean not null default false,
  can_mutate_accounts boolean not null default false,
  active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_manager_not_self check (manager_user_id <> report_user_id)
);

create unique index if not exists sales_ops_manager_assign_uidx
  on public.sales_ops_manager_assignments (organization_id, manager_user_id, report_user_id)
  where active = true;

drop trigger if exists sales_ops_manager_assign_updated_at on public.sales_ops_manager_assignments;
create trigger sales_ops_manager_assign_updated_at
  before update on public.sales_ops_manager_assignments
  for each row execute function public.sales_ops_set_updated_at();

-- ── commission snapshots (optional; never a substitute for payroll) ──────────

create table if not exists public.sales_ops_commission_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  plan_id uuid null references public.sales_ops_plans(id) on delete set null,
  snapshot_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_commission_uidx
  on public.sales_ops_commission_snapshots (organization_id, user_id, snapshot_key);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.sales_ops_plans enable row level security;
alter table public.sales_ops_plan_period_targets enable row level security;
alter table public.sales_ops_plan_metric_targets enable row level security;
alter table public.sales_ops_plan_copy enable row level security;
alter table public.sales_ops_scorecards enable row level security;
alter table public.sales_ops_monday_config enable row level security;
alter table public.sales_ops_monday_rep_mappings enable row level security;
alter table public.sales_ops_accounts enable row level security;
alter table public.sales_ops_account_intelligence enable row level security;
alter table public.sales_ops_activity_events enable row level security;
alter table public.sales_ops_sync_log enable row level security;
alter table public.sales_ops_webhook_events enable row level security;
alter table public.sales_ops_manager_assignments enable row level security;
alter table public.sales_ops_commission_snapshots enable row level security;
alter table public.sales_ops_plan_templates enable row level security;
alter table public.sales_ops_plan_template_period_targets enable row level security;
alter table public.sales_ops_plan_template_metric_targets enable row level security;
alter table public.sales_ops_plan_template_copy enable row level security;
alter table public.sales_ops_plan_events enable row level security;
alter table public.sales_ops_plan_acknowledgements enable row level security;

revoke all on public.sales_ops_plans from anon, authenticated;
revoke all on public.sales_ops_plan_period_targets from anon, authenticated;
revoke all on public.sales_ops_plan_metric_targets from anon, authenticated;
revoke all on public.sales_ops_plan_copy from anon, authenticated;
revoke all on public.sales_ops_scorecards from anon, authenticated;
revoke all on public.sales_ops_monday_config from anon, authenticated;
revoke all on public.sales_ops_monday_rep_mappings from anon, authenticated;
revoke all on public.sales_ops_accounts from anon, authenticated;
revoke all on public.sales_ops_account_intelligence from anon, authenticated;
revoke all on public.sales_ops_activity_events from anon, authenticated;
revoke all on public.sales_ops_sync_log from anon, authenticated;
revoke all on public.sales_ops_webhook_events from anon, authenticated;
revoke all on public.sales_ops_manager_assignments from anon, authenticated;
revoke all on public.sales_ops_commission_snapshots from anon, authenticated;
revoke all on public.sales_ops_plan_templates from anon, authenticated;
revoke all on public.sales_ops_plan_template_period_targets from anon, authenticated;
revoke all on public.sales_ops_plan_template_metric_targets from anon, authenticated;
revoke all on public.sales_ops_plan_template_copy from anon, authenticated;
revoke all on public.sales_ops_plan_events from anon, authenticated;
revoke all on public.sales_ops_plan_acknowledgements from anon, authenticated;

grant select on public.sales_ops_plans to authenticated;
grant select on public.sales_ops_plan_period_targets to authenticated;
grant select on public.sales_ops_plan_metric_targets to authenticated;
grant select on public.sales_ops_plan_copy to authenticated;
grant select on public.sales_ops_scorecards to authenticated;
grant select on public.sales_ops_accounts to authenticated;
grant select on public.sales_ops_account_intelligence to authenticated;
grant select on public.sales_ops_activity_events to authenticated;
grant select on public.sales_ops_commission_snapshots to authenticated;
grant select on public.sales_ops_plan_acknowledgements to authenticated;

-- Defense-in-depth: reps see own rows; managers see assigned reports; org admins see org.
-- Mutations remain Brain/service_role only.

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_ops_plans'
      and policyname = 'sales_ops_plans_select_scoped'
  ) then
    create policy sales_ops_plans_select_scoped
      on public.sales_ops_plans for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
        and (
          (
            user_id = (select auth.uid())
            and status in ('approved', 'active', 'superseded', 'archived', 'in_review')
          )
          or exists (
            select 1 from public.user_profiles actor
            where actor.id = (select auth.uid())
              and actor.role in ('admin', 'super_admin', 'executive')
          )
          or exists (
            select 1 from public.sales_ops_manager_assignments ma
            where ma.organization_id = sales_ops_plans.organization_id
              and ma.manager_user_id = (select auth.uid())
              and ma.report_user_id = sales_ops_plans.user_id
              and ma.active = true
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_ops_scorecards'
      and policyname = 'sales_ops_scorecards_select_scoped'
  ) then
    create policy sales_ops_scorecards_select_scoped
      on public.sales_ops_scorecards for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
        and (
          user_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles actor
            where actor.id = (select auth.uid())
              and actor.role in ('admin', 'super_admin', 'executive')
          )
          or exists (
            select 1 from public.sales_ops_manager_assignments ma
            where ma.organization_id = sales_ops_scorecards.organization_id
              and ma.manager_user_id = (select auth.uid())
              and ma.report_user_id = sales_ops_scorecards.user_id
              and ma.active = true
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_ops_accounts'
      and policyname = 'sales_ops_accounts_select_scoped'
  ) then
    create policy sales_ops_accounts_select_scoped
      on public.sales_ops_accounts for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
        and (
          assigned_user_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles actor
            where actor.id = (select auth.uid())
              and actor.role in ('admin', 'super_admin', 'executive')
          )
          or exists (
            select 1 from public.sales_ops_manager_assignments ma
            where ma.organization_id = sales_ops_accounts.organization_id
              and ma.manager_user_id = (select auth.uid())
              and ma.report_user_id = sales_ops_accounts.assigned_user_id
              and ma.active = true
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_ops_commission_snapshots'
      and policyname = 'sales_ops_commission_select_own'
  ) then
    create policy sales_ops_commission_select_own
      on public.sales_ops_commission_snapshots for select to authenticated
      using (
        user_id = (select auth.uid())
        and organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
      );
  end if;
end $$;

comment on table public.sales_ops_plans is 'eliteOS-owned versioned sales plans. Drafts are not operational. One active version per org user.';
comment on column public.sales_ops_plans.is_prototype is 'Prototype/reference material only. Never auto-assign or auto-activate.';
comment on table public.sales_ops_plan_templates is 'Reusable plan templates. Cloning copies values; later template edits do not rewrite existing plans.';
comment on table public.sales_ops_plan_acknowledgements is 'Salesperson acknowledgment of a published plan version. Does not grant edit rights.';
comment on column public.sales_ops_scorecards.target_snapshot is 'Frozen period targets from the plan version in force when the scorecard was first saved.';
comment on table public.sales_ops_accounts is 'Normalized Monday Account Master List cache. Monday owns assignment.';
comment on table public.sales_ops_monday_config is 'Org-scoped Monday Sales Ops board/column mapping. Tokens stay in env.';
comment on column public.sales_ops_monday_config.account_master_board_id is 'Tenant board id; Elite seed 18397092941 is not a SaaS-global constant.';
