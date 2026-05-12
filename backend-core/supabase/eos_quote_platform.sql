-- eliteOS Quote / Partner Quoting Platform — ADDITIVE SCHEMA
-- DO NOT RUN AUTOMATICALLY. Apply manually in Supabase after review.
--
-- Principles (see docs/quote-platform/PHASE0_IMPLEMENTATION_PLAN.md):
-- - Pricing authority lives in Supabase + backend APIs (not browser totals).
-- - Public retail pricing must maintain at least 25% markup over partner wholesale economics.
-- - calculation_snapshot + line items preserve historical quotes when pricing rules change.
-- - Monday.com sync is staged and logged first; live API calls only when configured.

-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Pricing structures (public vs partner modes, default markup for retail)
CREATE TABLE IF NOT EXISTS public.quote_pricing_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  pricing_mode text NOT NULL,
  retail_markup_percent numeric DEFAULT 25,
  is_public_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT quote_pricing_structures_public_retail_markup_ck
    CHECK (pricing_mode IS DISTINCT FROM 'public_retail' OR COALESCE(retail_markup_percent, 0) >= 25)
);

COMMENT ON TABLE public.quote_pricing_structures IS 'Database-driven pricing modes; public_retail must enforce minimum 25% retail_markup_percent.';
COMMENT ON COLUMN public.quote_pricing_structures.pricing_mode IS 'Examples: public_retail, partner, dealer, builder, designer, internal, custom.';

CREATE INDEX IF NOT EXISTS idx_quote_pricing_structures_mode ON public.quote_pricing_structures (pricing_mode);
CREATE INDEX IF NOT EXISTS idx_quote_pricing_structures_active ON public.quote_pricing_structures (is_active);

-- 2) Line-level rules per structure
CREATE TABLE IF NOT EXISTS public.quote_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_structure_id uuid NOT NULL REFERENCES public.quote_pricing_structures (id) ON DELETE CASCADE,
  category text NOT NULL,
  item_code text NOT NULL,
  item_name text NOT NULL,
  unit_type text NOT NULL,
  base_cost numeric,
  price numeric,
  markup_percent numeric,
  min_charge numeric,
  effective_from timestamptz DEFAULT now(),
  effective_to timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.quote_pricing_rules.category IS 'material, material_group, vanity, edge, sink, cutout, install, template, backsplash, tearout, trip, fee, hardware, labor, custom';

CREATE INDEX IF NOT EXISTS idx_quote_pricing_rules_structure ON public.quote_pricing_rules (pricing_structure_id);
CREATE INDEX IF NOT EXISTS idx_quote_pricing_rules_cat_code ON public.quote_pricing_rules (pricing_structure_id, category, item_code);

-- 3) Partner / dealer accounts (link columns for future identity resolution)
CREATE TABLE IF NOT EXISTS public.quote_partner_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  account_type text NOT NULL,
  monday_account_id text,
  moraware_account_id text,
  default_sales_rep text,
  default_branch text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.quote_partner_accounts.account_type IS 'Examples: dealer, builder, designer, remodeler, retail, internal, commercial, custom.';

CREATE INDEX IF NOT EXISTS idx_quote_partner_accounts_active ON public.quote_partner_accounts (is_active);

-- 4) Partner → structure assignment (soft history via starts_at / ends_at)
CREATE TABLE IF NOT EXISTS public.quote_partner_pricing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id uuid NOT NULL REFERENCES public.quote_partner_accounts (id) ON DELETE CASCADE,
  pricing_structure_id uuid NOT NULL REFERENCES public.quote_pricing_structures (id) ON DELETE RESTRICT,
  assigned_by text,
  assigned_at timestamptz DEFAULT now(),
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.quote_partner_pricing_assignments IS 'Expect one active current row per partner in application logic; no hard partial unique index yet.';

CREATE INDEX IF NOT EXISTS idx_quote_partner_pricing_assignments_partner ON public.quote_partner_pricing_assignments (partner_account_id);
CREATE INDEX IF NOT EXISTS idx_quote_partner_pricing_assignments_active ON public.quote_partner_pricing_assignments (partner_account_id, is_active);

-- 5) Quote header
CREATE TABLE IF NOT EXISTS public.quote_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  quote_source text NOT NULL,
  quote_status text NOT NULL DEFAULT 'draft',
  partner_account_id uuid REFERENCES public.quote_partner_accounts (id),
  pricing_structure_id uuid REFERENCES public.quote_pricing_structures (id),
  customer_name text,
  customer_email text,
  customer_phone text,
  project_name text,
  project_address text,
  city text,
  state text,
  zip text,
  sales_rep text,
  branch text,
  project_type text,
  estimate_confidence text,
  prepared_by text,
  valid_days integer DEFAULT 30,
  notes_length integer,
  subtotal numeric DEFAULT 0,
  markup_total numeric DEFAULT 0,
  discount_total numeric DEFAULT 0,
  tax_total numeric DEFAULT 0,
  grand_total numeric DEFAULT 0,
  estimated_sqft numeric,
  estimated_material_group text,
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  monday_board_id text,
  monday_item_id text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.quote_headers.notes_length IS 'Optional length (characters) of freeform notes at save time for audit without storing full text twice.';
COMMENT ON COLUMN public.quote_headers.calculation_snapshot IS 'Immutable pricing inputs summary + rule references + totals as calculated by backend.';

CREATE INDEX IF NOT EXISTS idx_quote_headers_number ON public.quote_headers (quote_number);
CREATE INDEX IF NOT EXISTS idx_quote_headers_status ON public.quote_headers (quote_status);
CREATE INDEX IF NOT EXISTS idx_quote_headers_source ON public.quote_headers (quote_source);
CREATE INDEX IF NOT EXISTS idx_quote_headers_sales_rep ON public.quote_headers (sales_rep);
CREATE INDEX IF NOT EXISTS idx_quote_headers_branch ON public.quote_headers (branch);
CREATE INDEX IF NOT EXISTS idx_quote_headers_partner ON public.quote_headers (partner_account_id);
CREATE INDEX IF NOT EXISTS idx_quote_headers_created_at ON public.quote_headers (created_at DESC);

-- 6) Line items
CREATE TABLE IF NOT EXISTS public.quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  line_type text NOT NULL,
  category text NOT NULL,
  item_code text,
  item_name text NOT NULL,
  room_name text,
  quantity numeric DEFAULT 1,
  unit_type text,
  unit_price numeric DEFAULT 0,
  base_cost numeric,
  markup_percent numeric,
  line_subtotal numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote ON public.quote_line_items (quote_id);

-- 7) Rooms
CREATE TABLE IF NOT EXISTS public.quote_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  room_name text,
  room_type text,
  material_name text,
  material_supplier text,
  material_group text,
  countertop_sqft numeric DEFAULT 0,
  backsplash_sqft numeric DEFAULT 0,
  total_sqft numeric DEFAULT 0,
  measurement_source text,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_rooms_quote ON public.quote_rooms (quote_id);

-- 8) Status history
CREATE TABLE IF NOT EXISTS public.quote_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by text,
  changed_at timestamptz DEFAULT now(),
  note_length integer,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quote_status_history_quote ON public.quote_status_history (quote_id);

-- 9) Monday sync log
CREATE TABLE IF NOT EXISTS public.quote_monday_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  action text NOT NULL,
  monday_board_id text,
  monday_item_id text,
  request_payload jsonb,
  response_payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_monday_sync_quote ON public.quote_monday_sync_log (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_monday_sync_status ON public.quote_monday_sync_log (quote_id, status);

-- 10) Calculation audit
CREATE TABLE IF NOT EXISTS public.quote_calculation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  pricing_structure_id uuid REFERENCES public.quote_pricing_structures (id),
  input_payload jsonb NOT NULL,
  output_payload jsonb NOT NULL,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_calc_audit_quote ON public.quote_calculation_audit (quote_id);

-- 11) Files (paths to object storage)
CREATE TABLE IF NOT EXISTS public.quote_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  file_category text,
  file_name text,
  file_type text,
  file_size integer,
  storage_path text,
  uploaded_by text,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quote_files_quote ON public.quote_files (quote_id);

-- 12) Forecast / analytics events
CREATE TABLE IF NOT EXISTS public.quote_forecast_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_at timestamptz DEFAULT now(),
  sales_rep text,
  branch text,
  partner_account_id uuid REFERENCES public.quote_partner_accounts (id),
  quote_value numeric,
  probability_percent numeric,
  forecast_value numeric,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quote_forecast_rep ON public.quote_forecast_events (sales_rep);
CREATE INDEX IF NOT EXISTS idx_quote_forecast_branch ON public.quote_forecast_events (branch);
CREATE INDEX IF NOT EXISTS idx_quote_forecast_event_at ON public.quote_forecast_events (event_at DESC);
