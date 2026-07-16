-- eliteOS Digital Estimate Configuration + Pricing-Policy Foundation (Phase DE.2B)
-- Additive / idempotent. DO NOT APPLY in DE.2B automation.
-- Apply manually in staging/production only when explicitly approved.
--
-- Prerequisite (when applying):
--   public.quote_publications / quote_publication_snapshots (eliteos_digital_estimate_v1.sql)
--   public.quote_partner_accounts (eos_quote_platform.sql + org columns)
--
-- Does NOT:
--   alter quote_headers, quote_pricing_*, Takeoff, delivery tables
--   seed production rates / Watt's / Spahn & Rose membership
--   change calculateQuote()
--
-- Brain (service_role) is the only intended runtime accessor.

create extension if not exists pgcrypto;

-- =============================================================================
-- Pricing-policy foundation (versioned; not wired to calculateQuote in DE.2B)
-- =============================================================================

create table if not exists public.digital_estimate_pricing_policy_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  version_label text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'superseded', 'archived')),
  policy_fingerprint text,
  notes_internal text,
  created_by_user_id uuid,
  approved_by_user_id uuid,
  approved_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint de_pricing_policy_versions_dates_ck check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

create index if not exists idx_de_pricing_policy_versions_org
  on public.digital_estimate_pricing_policy_versions (organization_id, status, created_at desc);

comment on table public.digital_estimate_pricing_policy_versions is
  'Version header for Digital Estimate pricing policies. Not consumed by calculateQuote() in DE.2B.';

-- Base material schedules (Wholesale vs Direct are explicit — never derived by %)
create table if not exists public.digital_estimate_material_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_version_id uuid not null
    references public.digital_estimate_pricing_policy_versions (id) on delete cascade,
  schedule_code text not null
    check (schedule_code in ('wholesale', 'direct')),
  display_name text not null,
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint de_material_schedules_dates_ck check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  ),
  constraint uq_de_material_schedules_policy_code unique (policy_version_id, schedule_code)
);

create index if not exists idx_de_material_schedules_org
  on public.digital_estimate_material_schedules (organization_id, schedule_code);

comment on table public.digital_estimate_material_schedules is
  'Explicit Wholesale and Direct/Retail material schedules. Do not derive Direct from Wholesale.';

create table if not exists public.digital_estimate_material_group_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  schedule_id uuid not null
    references public.digital_estimate_material_schedules (id) on delete cascade,
  group_code text not null,
  display_name text not null,
  rate_per_sqft numeric not null check (rate_per_sqft >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_de_material_group_rates_schedule_group unique (schedule_id, group_code)
);

create index if not exists idx_de_material_group_rates_org
  on public.digital_estimate_material_group_rates (organization_id, group_code);

comment on table public.digital_estimate_material_group_rates is
  'Per-group $/SF within a schedule. Remnant and Promo are first-class groups when present.';

-- Global material use-tax policy (confirmed business: 2% on material sell amount)
create table if not exists public.digital_estimate_material_tax_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_version_id uuid not null
    references public.digital_estimate_pricing_policy_versions (id) on delete cascade,
  tax_code text not null default 'material_use_tax',
  display_name_internal text not null default 'Material use tax',
  rate numeric not null check (rate >= 0),
  taxable_basis text not null default 'material_sell_amount'
    check (taxable_basis in ('material_sell_amount')),
  applies_to_schedules text[] not null default array['wholesale','direct','account']::text[],
  excludes_categories text[] not null default array[
    'products','labor','fabrication_addons','entire_estimate'
  ]::text[],
  customer_presentation text not null default 'unresolved'
    check (customer_presentation in (
      'unresolved', 'embedded', 'separate_line', 'hidden_internal'
    )),
  calculation_order_hint integer,
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  policy_version_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint de_material_tax_dates_ck check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

create index if not exists idx_de_material_tax_policies_org
  on public.digital_estimate_material_tax_policies (organization_id, is_active);

comment on table public.digital_estimate_material_tax_policies is
  'Global material use-tax policies. Confirmed commercial rate is 0.02 on material sell; presentation/order deferred to DE.2C.';

-- Stable pricing account groups (Watt's, Spahn & Rose, …) — never keyed by customer display name
create table if not exists public.digital_estimate_pricing_account_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  group_code text not null,
  display_name_internal text not null,
  customer_safe_label text,
  is_active boolean not null default true,
  created_by_user_id uuid,
  approved_by_user_id uuid,
  approval_evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_de_pricing_account_groups_org_code unique (organization_id, group_code)
);

create index if not exists idx_de_pricing_account_groups_org
  on public.digital_estimate_pricing_account_groups (organization_id, is_active);

comment on table public.digital_estimate_pricing_account_groups is
  'Stable pricing account groups. Membership uses partner_account_id — never quote_headers.customer_name.';

create table if not exists public.digital_estimate_pricing_account_group_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_group_id uuid not null
    references public.digital_estimate_pricing_account_groups (id) on delete cascade,
  -- Stable identity: quote_partner_accounts.id (org-scoped partner/dealer account).
  partner_account_id uuid not null
    references public.quote_partner_accounts (id) on delete restrict,
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint de_account_group_members_dates_ck check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  ),
  constraint uq_de_account_group_members unique (account_group_id, partner_account_id)
);

create index if not exists idx_de_account_group_members_partner
  on public.digital_estimate_pricing_account_group_members (organization_id, partner_account_id);

comment on table public.digital_estimate_pricing_account_group_members is
  'Membership by partner_account_id UUID only. Free-form customer-name matching is forbidden.';

-- Account material-rate overrides (e.g. Watt's Promo $40/SF)
create table if not exists public.digital_estimate_account_material_rate_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_version_id uuid
    references public.digital_estimate_pricing_policy_versions (id) on delete set null,
  account_group_id uuid not null
    references public.digital_estimate_pricing_account_groups (id) on delete restrict,
  schedule_code text not null
    check (schedule_code in ('wholesale', 'direct')),
  group_code text not null,
  rate_per_sqft numeric not null check (rate_per_sqft >= 0),
  priority integer not null default 100,
  reason_internal text not null,
  created_by_user_id uuid,
  approved_by_user_id uuid,
  approval_evidence_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint de_account_material_override_dates_ck check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

create index if not exists idx_de_account_material_overrides_group
  on public.digital_estimate_account_material_rate_overrides (
    organization_id, account_group_id, schedule_code, group_code, is_active
  );

comment on table public.digital_estimate_account_material_rate_overrides is
  'Account-group material $/SF overrides (e.g. Watt''s Promo). Public DTO must not expose base vs override.';

-- Estimate-level account adjustments (e.g. Spahn & Rose +3% entire estimate)
create table if not exists public.digital_estimate_account_estimate_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_version_id uuid
    references public.digital_estimate_pricing_policy_versions (id) on delete set null,
  account_group_id uuid not null
    references public.digital_estimate_pricing_account_groups (id) on delete restrict,
  adjustment_code text not null,
  display_name_internal text not null,
  customer_safe_label text,
  adjustment_type text not null default 'percent'
    check (adjustment_type in ('percent', 'fixed')),
  rate numeric not null,
  -- Commercial description: entire estimate. Exact order vs material use tax is DE.2C.
  basis_policy text not null default 'entire_estimate'
    check (basis_policy in ('entire_estimate', 'configured_subtotal_before_tax', 'configured_subtotal_after_tax')),
  includes_categories text[] not null default array[
    'material','products','addons','custom_lines','discounts','credits','use_tax'
  ]::text[],
  excludes_categories text[] not null default array[]::text[],
  calculation_order_hint integer,
  customer_presentation text not null default 'unresolved'
    check (customer_presentation in (
      'unresolved', 'embedded', 'separate_line', 'hidden_internal'
    )),
  reason_internal text not null,
  created_by_user_id uuid,
  approved_by_user_id uuid,
  approval_evidence_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint de_account_estimate_adj_dates_ck check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

create index if not exists idx_de_account_estimate_adj_group
  on public.digital_estimate_account_estimate_adjustments (
    organization_id, account_group_id, is_active
  );

comment on table public.digital_estimate_account_estimate_adjustments is
  'Estimate-level account adjustments (e.g. Spahn & Rose +3%). Order vs 2% use tax is an explicit DE.2C decision.';

-- Estimator-authorized overrides (caps/limits placeholder; immutable audit evidence)
create table if not exists public.digital_estimate_estimator_override_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  envelope_id uuid,
  publication_id uuid,
  override_scope text not null
    check (override_scope in ('option', 'group', 'estimate', 'session')),
  target_key text,
  override_value numeric not null,
  value_basis text not null
    check (value_basis in ('absolute', 'delta', 'percent')),
  reason_internal text not null,
  approver_user_id uuid,
  created_by_user_id uuid,
  caps_policy_json jsonb not null default '{}'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_de_estimator_overrides_org
  on public.digital_estimate_estimator_override_records (organization_id, created_at desc);

comment on table public.digital_estimate_estimator_override_records is
  'Immutable estimator override audit. Cap enforcement is DE.2C+; schema stores caps_policy_json placeholder.';

-- =============================================================================
-- Configuration envelopes / sessions / calculations
-- =============================================================================

create table if not exists public.digital_estimate_configuration_envelopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  publication_id uuid not null
    references public.quote_publications (id) on delete restrict,
  publication_snapshot_id uuid
    references public.quote_publication_snapshots (id) on delete restrict,
  source_quote_id uuid not null,
  quote_family_root_id uuid,
  source_quote_revision_number integer,
  source_calculation_evidence_fingerprint text not null,
  envelope_version integer not null check (envelope_version >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'active', 'superseded', 'expired')),
  cloned_from_envelope_id uuid
    references public.digital_estimate_configuration_envelopes (id) on delete set null,
  superseded_by_envelope_id uuid
    references public.digital_estimate_configuration_envelopes (id) on delete set null,
  baseline_customer_snapshot_hash text not null,
  baseline_pricing_evidence_hash text not null,
  pricing_engine_version text not null default 'elite100_config_delta_v1_placeholder',
  pricing_policy_version_id uuid
    references public.digital_estimate_pricing_policy_versions (id) on delete restrict,
  pricing_policy_fingerprint text,
  catalog_fingerprint text,
  pricing_valid_through date,
  row_version integer not null default 1 check (row_version >= 1),
  activated_at timestamptz,
  activated_by_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_de_config_one_active_envelope_per_publication
  on public.digital_estimate_configuration_envelopes (organization_id, publication_id)
  where status = 'active';

create index if not exists idx_de_config_envelopes_org_pub
  on public.digital_estimate_configuration_envelopes (organization_id, publication_id, envelope_version desc);

comment on table public.digital_estimate_configuration_envelopes is
  'Estimator-authored configuration allowlist bound to an immutable publication. Activated rows are immutable.';

create table if not exists public.digital_estimate_configuration_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  envelope_id uuid not null
    references public.digital_estimate_configuration_envelopes (id) on delete cascade,
  group_key text not null,
  display_label text not null,
  description_customer text,
  selection_mode text not null default 'single'
    check (selection_mode in ('single', 'multi')),
  required boolean not null default false,
  mutually_exclusive boolean not null default true,
  sort_order integer not null default 0,
  compatibility_json jsonb not null default '{}'::jsonb,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_de_config_groups_envelope_key unique (envelope_id, group_key)
);

create index if not exists idx_de_config_groups_org
  on public.digital_estimate_configuration_groups (organization_id, envelope_id);

create table if not exists public.digital_estimate_configuration_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  envelope_id uuid not null
    references public.digital_estimate_configuration_envelopes (id) on delete cascade,
  group_id uuid not null
    references public.digital_estimate_configuration_groups (id) on delete cascade,
  option_key text not null,
  display_label text not null,
  description_customer text,
  image_asset_ref text,
  min_qty numeric not null default 0 check (min_qty >= 0),
  max_qty numeric check (max_qty is null or max_qty >= 0),
  default_qty numeric not null default 0 check (default_qty >= 0),
  included_in_baseline boolean not null default false,
  required_selection boolean not null default false,
  availability_state text not null default 'active'
    check (availability_state in ('active', 'unavailable', 'review_required')),
  customer_price_treatment text not null default 'absolute'
    check (customer_price_treatment in (
      'included', 'absolute', 'delta', 'no_change', 'review_required', 'unavailable'
    )),
  pricing_mode text not null default 'fixed'
    check (pricing_mode in (
      'fixed', 'per_sf', 'per_lf', 'per_each', 'percentage', 'replacement', 'delta'
    )),
  -- Frozen customer-visible sell economics (set/validated at activate)
  sell_price numeric,
  sell_price_unit text,
  -- Internal-only (never public DTO)
  cost_basis numeric,
  wholesale_rate numeric,
  direct_rate numeric,
  internal_pricing_evidence_json jsonb not null default '{}'::jsonb,
  compatibility_json jsonb not null default '{}'::jsonb,
  source_catalog_ref text,
  notes_customer text,
  notes_internal text,
  is_active_in_envelope boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_de_config_options_envelope_key unique (envelope_id, option_key),
  constraint de_config_options_qty_ck check (
    max_qty is null or max_qty >= min_qty
  )
);

create index if not exists idx_de_config_options_group
  on public.digital_estimate_configuration_options (organization_id, group_id);

create table if not exists public.digital_estimate_configuration_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  publication_id uuid not null
    references public.quote_publications (id) on delete restrict,
  envelope_id uuid not null
    references public.digital_estimate_configuration_envelopes (id) on delete restrict,
  -- FK to DE.1 token row (hash-backed). Raw tokens never stored here.
  access_token_id uuid
    references public.quote_publication_access_tokens (id) on delete restrict,
  status text not null default 'configuring'
    check (status in ('configuring', 'saved', 'expired', 'abandoned')),
  row_version integer not null default 1 check (row_version >= 1),
  last_client_idempotency_key text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_de_config_sessions_org_env
  on public.digital_estimate_configuration_sessions (organization_id, envelope_id, status);

create table if not exists public.digital_estimate_configuration_selections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null
    references public.digital_estimate_configuration_sessions (id) on delete cascade,
  envelope_id uuid not null
    references public.digital_estimate_configuration_envelopes (id) on delete restrict,
  selection_payload_json jsonb not null,
  selection_hash text not null,
  client_idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_de_config_selection_idempotency
  on public.digital_estimate_configuration_selections (session_id, client_idempotency_key)
  where client_idempotency_key is not null;

create index if not exists idx_de_config_selections_hash
  on public.digital_estimate_configuration_selections (organization_id, selection_hash);

create table if not exists public.digital_estimate_configuration_calculations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  selection_id uuid not null unique
    references public.digital_estimate_configuration_selections (id) on delete restrict,
  envelope_id uuid not null
    references public.digital_estimate_configuration_envelopes (id) on delete restrict,
  engine_version text not null,
  calculation_input_fingerprint text not null,
  -- Customer-safe projection only
  customer_result_json jsonb not null,
  -- Internal evidence (rates, account rules, tax, margins) — never public
  internal_evidence_json jsonb not null,
  baseline_total numeric,
  configured_total numeric,
  pricing_valid_through date,
  created_at timestamptz not null default now()
);

create index if not exists idx_de_config_calculations_org
  on public.digital_estimate_configuration_calculations (organization_id, created_at desc);

comment on table public.digital_estimate_configuration_calculations is
  'Immutable server-authored configuration calculation snapshots. DE.2B stores structure only; DE.2C fills engine.';

create table if not exists public.digital_estimate_configuration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  envelope_id uuid
    references public.digital_estimate_configuration_envelopes (id) on delete cascade,
  publication_id uuid,
  session_id uuid,
  event_type text not null
    check (event_type in (
      'envelope_created',
      'envelope_updated',
      'envelope_validated',
      'envelope_activated',
      'envelope_cloned',
      'envelope_superseded',
      'envelope_expired',
      'session_started',
      'selection_saved',
      'calculated',
      'review_flagged'
    )),
  actor_type text not null
    check (actor_type in ('user', 'system', 'public')),
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_de_config_events_env
  on public.digital_estimate_configuration_events (envelope_id, created_at desc);

create index if not exists idx_de_config_events_org
  on public.digital_estimate_configuration_events (organization_id, event_type, created_at desc);

comment on table public.digital_estimate_configuration_events is
  'Append-only configuration activity. metadata must not contain raw tokens, secrets, or full estimate bodies.';

-- =============================================================================
-- Immutability / org guards
-- =============================================================================

create or replace function public.digital_estimate_configuration_org_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable on digital estimate configuration rows'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.digital_estimate_configuration_org_immutable() from public;
revoke all on function public.digital_estimate_configuration_org_immutable() from anon, authenticated;

create or replace function public.digital_estimate_configuration_envelope_child_org_match()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  env_org uuid;
begin
  select organization_id into env_org
  from public.digital_estimate_configuration_envelopes
  where id = new.envelope_id;
  if env_org is null then
    raise exception 'configuration envelope not found for child row';
  end if;
  if new.organization_id is distinct from env_org then
    raise exception 'child organization_id must match configuration envelope'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.digital_estimate_configuration_envelope_child_org_match() from public;
revoke all on function public.digital_estimate_configuration_envelope_child_org_match() from anon, authenticated;

create or replace function public.digital_estimate_configuration_active_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'active' and new.status = 'active' then
      if new.publication_id is distinct from old.publication_id
         or new.source_quote_id is distinct from old.source_quote_id
         or new.source_calculation_evidence_fingerprint is distinct from old.source_calculation_evidence_fingerprint
         or new.baseline_customer_snapshot_hash is distinct from old.baseline_customer_snapshot_hash
         or new.baseline_pricing_evidence_hash is distinct from old.baseline_pricing_evidence_hash
         or new.pricing_policy_fingerprint is distinct from old.pricing_policy_fingerprint
         or new.catalog_fingerprint is distinct from old.catalog_fingerprint
         or new.pricing_engine_version is distinct from old.pricing_engine_version
         or new.envelope_version is distinct from old.envelope_version
         or new.organization_id is distinct from old.organization_id then
        raise exception 'active configuration envelope content is immutable; clone to draft to edit'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.digital_estimate_configuration_active_immutable() from public;
revoke all on function public.digital_estimate_configuration_active_immutable() from anon, authenticated;

create or replace function public.digital_estimate_configuration_draft_children_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  env_status text;
begin
  select status into env_status
  from public.digital_estimate_configuration_envelopes
  where id = coalesce(new.envelope_id, old.envelope_id);
  if env_status is null then
    raise exception 'configuration envelope not found';
  end if;
  if env_status in ('active', 'superseded', 'expired') then
    raise exception 'cannot mutate groups/options on non-draft configuration envelope; clone to draft'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.digital_estimate_configuration_draft_children_guard() from public;
revoke all on function public.digital_estimate_configuration_draft_children_guard() from anon, authenticated;

create or replace function public.digital_estimate_configuration_calculations_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.customer_result_json is distinct from old.customer_result_json
       or new.internal_evidence_json is distinct from old.internal_evidence_json
       or new.calculation_input_fingerprint is distinct from old.calculation_input_fingerprint
       or new.baseline_total is distinct from old.baseline_total
       or new.configured_total is distinct from old.configured_total
       or new.selection_id is distinct from old.selection_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'configuration calculations are immutable'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'configuration calculations are not deletable via DML'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.digital_estimate_configuration_calculations_immutable() from public;
revoke all on function public.digital_estimate_configuration_calculations_immutable() from anon, authenticated;

create or replace function public.digital_estimate_configuration_events_append_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'configuration events are append-only'
    using errcode = '42501';
end;
$$;

revoke all on function public.digital_estimate_configuration_events_append_only() from public;
revoke all on function public.digital_estimate_configuration_events_append_only() from anon, authenticated;

create or replace function public.digital_estimate_estimator_overrides_append_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'estimator override records are append-only'
    using errcode = '42501';
end;
$$;

revoke all on function public.digital_estimate_estimator_overrides_append_only() from public;
revoke all on function public.digital_estimate_estimator_overrides_append_only() from anon, authenticated;

-- Triggers: org immutable
drop trigger if exists trg_de_config_envelopes_org_immutable on public.digital_estimate_configuration_envelopes;
create trigger trg_de_config_envelopes_org_immutable
  before update on public.digital_estimate_configuration_envelopes
  for each row execute function public.digital_estimate_configuration_org_immutable();

drop trigger if exists trg_de_config_envelopes_active_immutable on public.digital_estimate_configuration_envelopes;
create trigger trg_de_config_envelopes_active_immutable
  before update on public.digital_estimate_configuration_envelopes
  for each row execute function public.digital_estimate_configuration_active_immutable();

drop trigger if exists trg_de_config_groups_org_immutable on public.digital_estimate_configuration_groups;
create trigger trg_de_config_groups_org_immutable
  before update on public.digital_estimate_configuration_groups
  for each row execute function public.digital_estimate_configuration_org_immutable();

drop trigger if exists trg_de_config_options_org_immutable on public.digital_estimate_configuration_options;
create trigger trg_de_config_options_org_immutable
  before update on public.digital_estimate_configuration_options
  for each row execute function public.digital_estimate_configuration_org_immutable();

drop trigger if exists trg_de_config_groups_draft_guard on public.digital_estimate_configuration_groups;
create trigger trg_de_config_groups_draft_guard
  before insert or update or delete on public.digital_estimate_configuration_groups
  for each row execute function public.digital_estimate_configuration_draft_children_guard();

drop trigger if exists trg_de_config_options_draft_guard on public.digital_estimate_configuration_options;
create trigger trg_de_config_options_draft_guard
  before insert or update or delete on public.digital_estimate_configuration_options
  for each row execute function public.digital_estimate_configuration_draft_children_guard();

drop trigger if exists trg_de_config_groups_org_match on public.digital_estimate_configuration_groups;
create trigger trg_de_config_groups_org_match
  before insert or update on public.digital_estimate_configuration_groups
  for each row execute function public.digital_estimate_configuration_envelope_child_org_match();

drop trigger if exists trg_de_config_options_org_match on public.digital_estimate_configuration_options;
create trigger trg_de_config_options_org_match
  before insert or update on public.digital_estimate_configuration_options
  for each row execute function public.digital_estimate_configuration_envelope_child_org_match();

drop trigger if exists trg_de_config_calcs_immutable on public.digital_estimate_configuration_calculations;
create trigger trg_de_config_calcs_immutable
  before update or delete on public.digital_estimate_configuration_calculations
  for each row execute function public.digital_estimate_configuration_calculations_immutable();

drop trigger if exists trg_de_config_events_no_update on public.digital_estimate_configuration_events;
create trigger trg_de_config_events_no_update
  before update on public.digital_estimate_configuration_events
  for each row execute function public.digital_estimate_configuration_events_append_only();

drop trigger if exists trg_de_config_events_no_delete on public.digital_estimate_configuration_events;
create trigger trg_de_config_events_no_delete
  before delete on public.digital_estimate_configuration_events
  for each row execute function public.digital_estimate_configuration_events_append_only();

drop trigger if exists trg_de_estimator_overrides_no_update on public.digital_estimate_estimator_override_records;
create trigger trg_de_estimator_overrides_no_update
  before update on public.digital_estimate_estimator_override_records
  for each row execute function public.digital_estimate_estimator_overrides_append_only();

drop trigger if exists trg_de_estimator_overrides_no_delete on public.digital_estimate_estimator_override_records;
create trigger trg_de_estimator_overrides_no_delete
  before delete on public.digital_estimate_estimator_override_records
  for each row execute function public.digital_estimate_estimator_overrides_append_only();

-- =============================================================================
-- Atomic activation RPC
-- =============================================================================

create or replace function public.digital_estimate_activate_configuration_envelope(
  p_organization_id uuid,
  p_envelope_id uuid,
  p_actor_user_id uuid,
  p_pricing_policy_fingerprint text,
  p_catalog_fingerprint text,
  p_expected_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_env record;
  v_pub record;
  v_snap record;
  v_group_count integer;
  v_option_count integer;
  v_prior record;
  v_superseded_count integer := 0;
begin
  if p_organization_id is null or p_envelope_id is null then
    raise exception 'required activation arguments missing';
  end if;

  select * into v_env
  from public.digital_estimate_configuration_envelopes
  where id = p_envelope_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'configuration envelope not found' using errcode = 'P0002';
  end if;

  if v_env.status not in ('draft', 'ready') then
    raise exception 'only draft/ready envelopes can be activated' using errcode = '22023';
  end if;

  if p_expected_row_version is not null and v_env.row_version is distinct from p_expected_row_version then
    raise exception 'envelope row_version conflict' using errcode = '40001';
  end if;

  select * into v_pub
  from public.quote_publications
  where id = v_env.publication_id
    and organization_id = p_organization_id
  for share;

  if not found then
    raise exception 'publication not found for envelope' using errcode = 'P0002';
  end if;

  if v_pub.status is distinct from 'active' then
    raise exception 'publication is not active' using errcode = '22023';
  end if;

  select * into v_snap
  from public.quote_publication_snapshots
  where publication_id = v_pub.id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'publication snapshot missing' using errcode = 'P0002';
  end if;

  select count(*) into v_group_count
  from public.digital_estimate_configuration_groups
  where envelope_id = p_envelope_id
    and organization_id = p_organization_id;

  select count(*) into v_option_count
  from public.digital_estimate_configuration_options
  where envelope_id = p_envelope_id
    and organization_id = p_organization_id
    and is_active_in_envelope = true;

  if v_group_count < 1 or v_option_count < 1 then
    raise exception 'envelope must include at least one group and one active option'
      using errcode = '22023';
  end if;

  -- Supersede prior active for this publication (same org)
  for v_prior in
    select id
    from public.digital_estimate_configuration_envelopes
    where organization_id = p_organization_id
      and publication_id = v_env.publication_id
      and status = 'active'
      and id is distinct from p_envelope_id
    for update
  loop
    update public.digital_estimate_configuration_envelopes
    set status = 'superseded',
        superseded_by_envelope_id = p_envelope_id,
        updated_at = v_now
    where id = v_prior.id;

    insert into public.digital_estimate_configuration_events (
      organization_id, envelope_id, publication_id, event_type, actor_type,
      actor_user_id, metadata, created_at
    ) values (
      p_organization_id, v_prior.id, v_env.publication_id, 'envelope_superseded', 'system',
      p_actor_user_id,
      jsonb_build_object('supersededByEnvelopeId', p_envelope_id),
      v_now
    );

    v_superseded_count := v_superseded_count + 1;
  end loop;

  update public.digital_estimate_configuration_envelopes
  set status = 'active',
      publication_snapshot_id = coalesce(publication_snapshot_id, v_snap.id),
      pricing_policy_fingerprint = coalesce(p_pricing_policy_fingerprint, pricing_policy_fingerprint),
      catalog_fingerprint = coalesce(p_catalog_fingerprint, catalog_fingerprint),
      activated_at = v_now,
      activated_by_user_id = p_actor_user_id,
      row_version = row_version + 1,
      updated_at = v_now
  where id = p_envelope_id
    and organization_id = p_organization_id;

  insert into public.digital_estimate_configuration_events (
    organization_id, envelope_id, publication_id, event_type, actor_type,
    actor_user_id, metadata, created_at
  ) values (
    p_organization_id, p_envelope_id, v_env.publication_id, 'envelope_activated', 'user',
    p_actor_user_id,
    jsonb_build_object(
      'supersededCount', v_superseded_count,
      'pricingPolicyFingerprint', coalesce(p_pricing_policy_fingerprint, v_env.pricing_policy_fingerprint),
      'catalogFingerprint', coalesce(p_catalog_fingerprint, v_env.catalog_fingerprint)
    ),
    v_now
  );

  return jsonb_build_object(
    'envelope_id', p_envelope_id,
    'status', 'active',
    'activated_at', v_now,
    'superseded_count', v_superseded_count
  );
end;
$$;

revoke all on function public.digital_estimate_activate_configuration_envelope(
  uuid, uuid, uuid, text, text, integer
) from public;
revoke all on function public.digital_estimate_activate_configuration_envelope(
  uuid, uuid, uuid, text, text, integer
) from anon, authenticated;
grant execute on function public.digital_estimate_activate_configuration_envelope(
  uuid, uuid, uuid, text, text, integer
) to service_role;

-- =============================================================================
-- Privileges / RLS
-- =============================================================================

revoke all on table public.digital_estimate_pricing_policy_versions from anon, authenticated;
revoke all on table public.digital_estimate_material_schedules from anon, authenticated;
revoke all on table public.digital_estimate_material_group_rates from anon, authenticated;
revoke all on table public.digital_estimate_material_tax_policies from anon, authenticated;
revoke all on table public.digital_estimate_pricing_account_groups from anon, authenticated;
revoke all on table public.digital_estimate_pricing_account_group_members from anon, authenticated;
revoke all on table public.digital_estimate_account_material_rate_overrides from anon, authenticated;
revoke all on table public.digital_estimate_account_estimate_adjustments from anon, authenticated;
revoke all on table public.digital_estimate_estimator_override_records from anon, authenticated;
revoke all on table public.digital_estimate_configuration_envelopes from anon, authenticated;
revoke all on table public.digital_estimate_configuration_groups from anon, authenticated;
revoke all on table public.digital_estimate_configuration_options from anon, authenticated;
revoke all on table public.digital_estimate_configuration_sessions from anon, authenticated;
revoke all on table public.digital_estimate_configuration_selections from anon, authenticated;
revoke all on table public.digital_estimate_configuration_calculations from anon, authenticated;
revoke all on table public.digital_estimate_configuration_events from anon, authenticated;

alter table public.digital_estimate_pricing_policy_versions enable row level security;
alter table public.digital_estimate_material_schedules enable row level security;
alter table public.digital_estimate_material_group_rates enable row level security;
alter table public.digital_estimate_material_tax_policies enable row level security;
alter table public.digital_estimate_pricing_account_groups enable row level security;
alter table public.digital_estimate_pricing_account_group_members enable row level security;
alter table public.digital_estimate_account_material_rate_overrides enable row level security;
alter table public.digital_estimate_account_estimate_adjustments enable row level security;
alter table public.digital_estimate_estimator_override_records enable row level security;
alter table public.digital_estimate_configuration_envelopes enable row level security;
alter table public.digital_estimate_configuration_groups enable row level security;
alter table public.digital_estimate_configuration_options enable row level security;
alter table public.digital_estimate_configuration_sessions enable row level security;
alter table public.digital_estimate_configuration_selections enable row level security;
alter table public.digital_estimate_configuration_calculations enable row level security;
alter table public.digital_estimate_configuration_events enable row level security;

-- No anon/authenticated policies → deny by default. service_role bypasses RLS (Brain-only).
