-- eliteOS / Quote Platform — additive SaaS foundation (non-destructive).
-- Safe to run after eos_quote_platform.sql and related quote migrations.
-- Does NOT drop/rename tables or columns. organization_id nullable until a future strict phase.
--
-- Brand: user-facing product name is eliteOS; legacy identifiers (eos_*, npm eos:*) remain unchanged.

-- ---------------------------------------------------------------------------
-- 1) Organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  legal_name text,
  industry text DEFAULT 'stone_fabrication',
  website text,
  primary_email text,
  primary_phone text,
  default_branch text,
  timezone text DEFAULT 'America/Chicago',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS 'SaaS tenant (fabricator). Default row seeds Elite Stone Fabrication.';
COMMENT ON COLUMN public.organizations.organization_key IS 'Stable slug for APIs and headers (e.g. elite_stone_fabrication).';

-- ---------------------------------------------------------------------------
-- 2) Tenant public quote branding / config (future; env remains fallback today)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_public_quote_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  public_slug text UNIQUE,
  display_name text,
  logo_url text,
  primary_color text,
  accent_color text,
  quote_disclaimer text,
  default_project_type text,
  public_retail_markup_min_percent numeric DEFAULT 25,
  enabled_measurement_methods jsonb DEFAULT '["manual_sqft","cabinet_lengths","guided_layout"]'::jsonb,
  enabled_addons jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_public_quote_settings IS 'Per-tenant public quote UX; optional until apps read it.';

-- ---------------------------------------------------------------------------
-- 3) Tenant integration metadata (secrets stay in env / secret manager; secret_ref optional pointer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  display_name text,
  is_enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_key)
);

COMMENT ON COLUMN public.organization_integration_configs.secret_ref IS 'Pointer to env/secret manager key — do not store raw API tokens in config.';
COMMENT ON COLUMN public.organization_integration_configs.config IS 'Non-secret board IDs, column env key names, sync flags, etc.';

-- ---------------------------------------------------------------------------
-- 4) Tenant branches / locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  branch_key text NOT NULL,
  display_name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_key)
);

-- ---------------------------------------------------------------------------
-- 5) Seed default Elite organization + related rows (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (
  organization_key,
  display_name,
  legal_name,
  industry,
  timezone,
  is_active,
  metadata
)
VALUES (
  'elite_stone_fabrication',
  'Elite Stone Fabrication',
  'Elite Stone Fabrication',
  'stone_fabrication',
  'America/Chicago',
  true,
  '{"seed": "eos_saas_foundation"}'::jsonb
)
ON CONFLICT (organization_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  updated_at = now();

-- Public quote settings for Elite
INSERT INTO public.organization_public_quote_settings (
  organization_id,
  public_slug,
  display_name,
  public_retail_markup_min_percent,
  is_active
)
SELECT o.id, 'elite', 'Elite Stone Fabrication', 25, true
FROM public.organizations o
WHERE o.organization_key = 'elite_stone_fabrication'
ON CONFLICT (public_slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  public_retail_markup_min_percent = EXCLUDED.public_retail_markup_min_percent,
  updated_at = now();

-- Monday integration metadata (env-based tokens remain; is_enabled false until UI drives it)
INSERT INTO public.organization_integration_configs (
  organization_id,
  integration_key,
  display_name,
  is_enabled,
  config,
  metadata
)
SELECT
  o.id,
  'monday',
  'Monday.com',
  false,
  jsonb_build_object(
    'public_quotes_board_env_key', 'MONDAY_PUBLIC_QUOTES_BOARD_ID',
    'internal_quotes_board_env_key', 'MONDAY_INTERNAL_QUOTES_BOARD_ID',
    'partner_quotes_board_env_key', 'MONDAY_PARTNER_QUOTES_BOARD_ID',
    'legacy_quotes_board_env_key', 'MONDAY_QUOTES_BOARD_ID'
  ),
  '{"note": "Board IDs resolved from process.env keys above; API token stays in MONDAY_API_TOKEN env."}'::jsonb
FROM public.organizations o
WHERE o.organization_key = 'elite_stone_fabrication'
ON CONFLICT (organization_id, integration_key) DO UPDATE SET
  config = EXCLUDED.config,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.organization_branches (
  organization_id,
  branch_key,
  display_name,
  is_active
)
SELECT o.id, 'dyersville', 'Dyersville', true
FROM public.organizations o
WHERE o.organization_key = 'elite_stone_fabrication'
ON CONFLICT (organization_id, branch_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 6) Nullable organization_id on existing platform tables (additive only)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  elite_id uuid;
BEGIN
  SELECT id INTO elite_id FROM public.organizations WHERE organization_key = 'elite_stone_fabrication' LIMIT 1;

  -- quote core
  IF to_regclass('public.quote_headers') IS NOT NULL THEN
    ALTER TABLE public.quote_headers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_headers_organization_id ON public.quote_headers (organization_id);
    COMMENT ON COLUMN public.quote_headers.organization_id IS 'Nullable during migration; future NOT NULL + RLS after app verification.';
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_headers SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_pricing_structures') IS NOT NULL THEN
    ALTER TABLE public.quote_pricing_structures ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_pricing_structures_organization_id ON public.quote_pricing_structures (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_pricing_structures SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_pricing_rules') IS NOT NULL THEN
    ALTER TABLE public.quote_pricing_rules ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_pricing_rules_organization_id ON public.quote_pricing_rules (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_pricing_rules SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_partner_accounts') IS NOT NULL THEN
    ALTER TABLE public.quote_partner_accounts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_partner_accounts_organization_id ON public.quote_partner_accounts (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_partner_accounts SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_partner_pricing_assignments') IS NOT NULL THEN
    ALTER TABLE public.quote_partner_pricing_assignments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_partner_pricing_assignments_organization_id ON public.quote_partner_pricing_assignments (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_partner_pricing_assignments SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_source_configs') IS NOT NULL THEN
    ALTER TABLE public.quote_source_configs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_source_configs_organization_id ON public.quote_source_configs (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_source_configs SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_sales_territories') IS NOT NULL THEN
    ALTER TABLE public.quote_sales_territories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_sales_territories_organization_id ON public.quote_sales_territories (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_sales_territories SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_lead_assignments') IS NOT NULL THEN
    ALTER TABLE public.quote_lead_assignments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_lead_assignments_organization_id ON public.quote_lead_assignments (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_lead_assignments SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_submission_payloads') IS NOT NULL THEN
    ALTER TABLE public.quote_submission_payloads ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_submission_payloads_organization_id ON public.quote_submission_payloads (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_submission_payloads SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_forecast_events') IS NOT NULL THEN
    ALTER TABLE public.quote_forecast_events ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_forecast_events_organization_id ON public.quote_forecast_events (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_forecast_events SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_monday_sync_log') IS NOT NULL THEN
    ALTER TABLE public.quote_monday_sync_log ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_monday_sync_log_organization_id ON public.quote_monday_sync_log (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_monday_sync_log SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_rooms') IS NOT NULL THEN
    ALTER TABLE public.quote_rooms ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_rooms_organization_id ON public.quote_rooms (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_rooms SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_line_items') IS NOT NULL THEN
    ALTER TABLE public.quote_line_items ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_line_items_organization_id ON public.quote_line_items (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_line_items SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_files') IS NOT NULL THEN
    ALTER TABLE public.quote_files ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_files_organization_id ON public.quote_files (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_files SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_takeoff_jobs') IS NOT NULL THEN
    ALTER TABLE public.quote_takeoff_jobs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_takeoff_jobs_organization_id ON public.quote_takeoff_jobs (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_takeoff_jobs SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_takeoff_results') IS NOT NULL THEN
    ALTER TABLE public.quote_takeoff_results ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_takeoff_results_organization_id ON public.quote_takeoff_results (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_takeoff_results SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_visual_layouts') IS NOT NULL THEN
    ALTER TABLE public.quote_visual_layouts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_visual_layouts_organization_id ON public.quote_visual_layouts (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_visual_layouts SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.quote_measurement_sources') IS NOT NULL THEN
    ALTER TABLE public.quote_measurement_sources ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_quote_measurement_sources_organization_id ON public.quote_measurement_sources (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.quote_measurement_sources SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_organization_id ON public.user_profiles (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.user_profiles SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.user_head_access') IS NOT NULL THEN
    ALTER TABLE public.user_head_access ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
    CREATE INDEX IF NOT EXISTS idx_user_head_access_organization_id ON public.user_head_access (organization_id);
    IF elite_id IS NOT NULL THEN
      UPDATE public.user_head_access SET organization_id = elite_id WHERE organization_id IS NULL;
    END IF;
  END IF;
END $$;
