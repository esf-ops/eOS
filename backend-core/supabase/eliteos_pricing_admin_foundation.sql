-- eliteOS Pricing Admin — ADDITIVE SCHEMA FOUNDATION
-- DO NOT RUN AUTOMATICALLY. Apply manually in Supabase SQL editor after review.
--
-- Prerequisite: `public.organizations` must exist (e.g. apply `eos_saas_foundation.sql` / org bootstrap first),
-- because tenant-owned tables reference `organizations(id)`.
--
-- Purpose: long-term configurable pricing (material tiers, add-ons, policy rules) separate from
-- legacy `quote_pricing_rules` / `quote_pricing_structures` catalog rows.
--
-- Manual apply:
--   1. Open Supabase → SQL → New query
--   2. Paste this file → Run
--
-- Notes:
-- - `organization_id` is nullable for global template rows; SaaS installs should copy rows per org.
-- - RLS is NOT enabled here; tighten in a dedicated security milestone.
-- - **Stock Blanco sink:** `quoteCalculator.js` / `PROTOTYPE_ADDON_UNIT_PRICES` still use **450** until
--   calculator cutover to resolver. This seed uses **495** per latest Pricing Admin seed request;
--   see `docs/quote-platform/pricing-seed-map.md` § Blanco discrepancy — reconcile with finance before cutover.

-- Requires gen_random_uuid() (Supabase default: pgcrypto).

-- ---------------------------------------------------------------------------
-- 1) Material price groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_price_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  group_code text NOT NULL,
  display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_price_groups_global_code
  ON public.quote_price_groups (group_code)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_price_groups_org_code
  ON public.quote_price_groups (organization_id, group_code)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_price_groups_org ON public.quote_price_groups (organization_id);

COMMENT ON TABLE public.quote_price_groups IS 'Pricing Admin material tiers (Promo → F); org-scoped or global template.';

-- ---------------------------------------------------------------------------
-- 2) Rates per group (Direct, Wholesale, future partner/public tiers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_price_group_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  price_group_id uuid NOT NULL REFERENCES public.quote_price_groups (id) ON DELETE CASCADE,
  rate_type text NOT NULL,
  rate_per_sqft numeric NOT NULL,
  effective_start_date date NOT NULL DEFAULT CURRENT_DATE,
  effective_end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_price_group_rates_type_ck CHECK (
    rate_type IN ('direct', 'wholesale', 'public', 'partner_tier_1', 'partner_tier_2', 'partner_tier_3')
  ),
  CONSTRAINT quote_price_group_rates_rate_pos_ck CHECK (rate_per_sqft >= 0),
  CONSTRAINT quote_price_group_rates_dates_ck CHECK (
    effective_end_date IS NULL OR effective_end_date >= effective_start_date
  )
);

CREATE INDEX IF NOT EXISTS idx_quote_price_group_rates_group ON public.quote_price_group_rates (price_group_id);
CREATE INDEX IF NOT EXISTS idx_quote_price_group_rates_org ON public.quote_price_group_rates (organization_id);
CREATE INDEX IF NOT EXISTS idx_quote_price_group_rates_type_active ON public.quote_price_group_rates (rate_type, is_active);

-- ---------------------------------------------------------------------------
-- 3) Policy rules (JSON values) — distinct from legacy quote_pricing_rules line catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_pricing_policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  rule_name text NOT NULL,
  rule_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  effective_start_date date NOT NULL DEFAULT CURRENT_DATE,
  effective_end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_pricing_policy_rules_dates_ck CHECK (
    effective_end_date IS NULL OR effective_end_date >= effective_start_date
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_pricing_policy_rules_global_key
  ON public.quote_pricing_policy_rules (rule_key)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_pricing_policy_rules_org_key
  ON public.quote_pricing_policy_rules (organization_id, rule_key)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Add-on / service catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_addon_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  addon_code text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL DEFAULT 'addon',
  base_price numeric NOT NULL DEFAULT 0,
  pricing_mode text NOT NULL DEFAULT 'flat',
  applies_to text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_addon_catalog_price_ck CHECK (base_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_addon_catalog_global_code
  ON public.quote_addon_catalog (addon_code)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_addon_catalog_org_code
  ON public.quote_addon_catalog (organization_id, addon_code)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) Material / color → group mapping (optional rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_material_color_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  material_name text NOT NULL DEFAULT '',
  supplier text,
  price_group_id uuid NOT NULL REFERENCES public.quote_price_groups (id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_material_color_mappings_org ON public.quote_material_color_mappings (organization_id);
CREATE INDEX IF NOT EXISTS idx_quote_material_color_mappings_group ON public.quote_material_color_mappings (price_group_id);

-- ---------------------------------------------------------------------------
-- 6) Audit log for Pricing Admin mutations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_pricing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  actor_user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_pricing_audit_log_org ON public.quote_pricing_audit_log (organization_id);
CREATE INDEX IF NOT EXISTS idx_quote_pricing_audit_log_created ON public.quote_pricing_audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- 7) Global template seeds (organization_id NULL)
-- ---------------------------------------------------------------------------

INSERT INTO public.quote_price_groups (organization_id, group_code, display_name, sort_order, is_active)
SELECT NULL, v.code, v.name, v.ord, true
FROM (VALUES
  ('promo', 'Group Promo', 10),
  ('group_a', 'Group A', 20),
  ('group_b', 'Group B', 30),
  ('group_c', 'Group C', 40),
  ('group_d', 'Group D', 50),
  ('group_e', 'Group E', 60),
  ('group_f', 'Group F', 70)
) AS v(code, name, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.quote_price_groups g WHERE g.organization_id IS NULL AND g.group_code = v.code
);

INSERT INTO public.quote_price_group_rates (organization_id, price_group_id, rate_type, rate_per_sqft, is_active, created_by)
SELECT NULL, g.id, 'direct', v.rate, true, 'seed:eliteos_pricing_admin_foundation'
FROM public.quote_price_groups g
JOIN (VALUES
  ('promo', 70::numeric),
  ('group_a', 77),
  ('group_b', 85),
  ('group_c', 95),
  ('group_d', 105),
  ('group_e', 120),
  ('group_f', 135)
) AS v(code, rate) ON v.code = g.group_code
WHERE g.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.quote_price_group_rates r
    WHERE r.price_group_id = g.id AND r.rate_type = 'direct' AND r.organization_id IS NULL AND r.is_active = true
  );

INSERT INTO public.quote_price_group_rates (organization_id, price_group_id, rate_type, rate_per_sqft, is_active, created_by)
SELECT NULL, g.id, 'wholesale', v.rate, true, 'seed:eliteos_pricing_admin_foundation'
FROM public.quote_price_groups g
JOIN (VALUES
  ('promo', 45::numeric),
  ('group_a', 57),
  ('group_b', 65),
  ('group_c', 75),
  ('group_d', 85),
  ('group_e', 100),
  ('group_f', 115)
) AS v(code, rate) ON v.code = g.group_code
WHERE g.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.quote_price_group_rates r
    WHERE r.price_group_id = g.id AND r.rate_type = 'wholesale' AND r.organization_id IS NULL AND r.is_active = true
  );

INSERT INTO public.quote_pricing_policy_rules (organization_id, rule_key, rule_name, rule_value, is_active)
SELECT NULL, 'public_consumer_markup_percent', 'Public planning markup on Direct economics', '{"percent":25}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.quote_pricing_policy_rules WHERE organization_id IS NULL AND rule_key = 'public_consumer_markup_percent');

INSERT INTO public.quote_pricing_policy_rules (organization_id, rule_key, rule_name, rule_value, is_active)
SELECT NULL, 'public_rounding_rule', 'Homeowner display rounding', '{"mode":"round_up_nearest_10"}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.quote_pricing_policy_rules WHERE organization_id IS NULL AND rule_key = 'public_rounding_rule');

INSERT INTO public.quote_pricing_policy_rules (organization_id, rule_key, rule_name, rule_value, is_active)
SELECT NULL, 'public_monday_quote_value_group', 'Monday headline tier', '{"group_code":"promo"}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.quote_pricing_policy_rules WHERE organization_id IS NULL AND rule_key = 'public_monday_quote_value_group');

INSERT INTO public.quote_pricing_policy_rules (organization_id, rule_key, rule_name, rule_value, is_active)
SELECT NULL, 'internal_default_measurement_mode', 'Internal estimate default workflow', '{"mode":"manual_sqft"}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.quote_pricing_policy_rules WHERE organization_id IS NULL AND rule_key = 'internal_default_measurement_mode');

INSERT INTO public.quote_pricing_policy_rules (organization_id, rule_key, rule_name, rule_value, is_active)
SELECT NULL, 'internal_allow_rapid_linear', 'Internal estimate rapid linear foot', '{"allowed":false}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.quote_pricing_policy_rules WHERE organization_id IS NULL AND rule_key = 'internal_allow_rapid_linear');

INSERT INTO public.quote_addon_catalog (organization_id, addon_code, display_name, category, base_price, pricing_mode, is_active, sort_order)
SELECT NULL, v.code, v.title, v.cat, v.price, 'flat', true, v.ord
FROM (VALUES
  ('kitchen_sink_cutout', 'Kitchen sink cutout', 'cutout', 200::numeric, 10),
  ('vanity_bar_sink_cutout', 'Vanity / bar sink cutout', 'cutout', 100, 20),
  ('cooktop_cutout', 'Cooktop cutout', 'cutout', 150, 30),
  ('waterfall', 'Waterfall edge', 'edge', 600, 40),
  ('polish_waterfall_backside', 'Polish waterfall backside', 'edge', 225, 50),
  ('popup_outlet_cutout', 'Pop-up outlet cutout', 'cutout', 150, 60),
  ('electrical_outlet_cutout', 'Electrical outlet cutout', 'cutout', 30, 70),
  ('esf_stainless_kitchen_sink', 'ESF stainless kitchen sink', 'sink', 160, 80),
  ('stock_blanco_sink', 'Stock Blanco sink', 'sink', 495, 90),
  ('rectangular_vanity_sink', 'Rectangular vanity sink', 'sink', 55, 100),
  ('oval_vanity_sink', 'Oval vanity sink', 'sink', 35, 110),
  ('tear_out', 'Tear-out', 'service', 750, 120),
  ('specialty_edge_per_lf', 'Specialty edge (per LF)', 'edge', 15, 130)
) AS v(code, title, cat, price, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.quote_addon_catalog c WHERE c.organization_id IS NULL AND c.addon_code = v.code
);
