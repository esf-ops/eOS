-- eliteOS Quote Catalog — ADDITIVE SCHEMA (Quote Catalog Admin foundation)
-- Run manually AFTER: backend-core/supabase/eos_quote_platform.sql
-- Does NOT alter quote_pricing_rules, quote_headers, or Moraware/Sales tables.
--
-- Goals:
-- - Programs (shower, vanity, countertops, hardware, …) as data, not code.
-- - Catalog items + options + media + visibility rules.
-- - Per–pricing-structure prices via quote_catalog_pricing_rules → quote_pricing_structures.
-- - Public APIs must project only public-safe fields (enforced in application layer).

-- ---------------------------------------------------------------------------
-- 1) Programs (commercial / operational groupings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  program_kind text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_programs IS 'Quote programs (countertop, shower, hardware, …); drives Catalog Admin navigation.';
COMMENT ON COLUMN public.quote_programs.program_kind IS 'Loose label for UI/calculator routing, e.g. countertop, shower, fee, accessory.';

CREATE INDEX IF NOT EXISTS idx_quote_programs_active ON public.quote_programs (is_active);
CREATE INDEX IF NOT EXISTS idx_quote_programs_sort ON public.quote_programs (sort_order, name);

-- ---------------------------------------------------------------------------
-- 2) Catalog items (SKUs / configurable lines)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.quote_programs (id) ON DELETE RESTRICT,
  parent_catalog_item_id uuid REFERENCES public.quote_catalog_items (id) ON DELETE SET NULL,
  item_code text NOT NULL,
  item_name text NOT NULL,
  description text,
  unit_type text NOT NULL,
  pricing_behavior text NOT NULL DEFAULT 'unit_price',
  visible_to_public boolean NOT NULL DEFAULT false,
  visible_to_partner boolean NOT NULL DEFAULT true,
  visible_to_internal boolean NOT NULL DEFAULT true,
  requires_review boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  image_url text,
  spec_document_url text,
  monday_item_id text,
  monday_board_id text,
  moraware_product_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_catalog_items_program_code_uniq UNIQUE (program_id, item_code)
);

COMMENT ON TABLE public.quote_catalog_items IS 'Sellable/configurable catalog lines; prices live in quote_catalog_pricing_rules per structure.';
COMMENT ON COLUMN public.quote_catalog_items.pricing_behavior IS 'unit_price | per_sqft | tier_matrix | percent_of_line | passthrough | quote_only | custom (app-defined).';
COMMENT ON COLUMN public.quote_catalog_items.visible_to_public IS 'If true, item may appear in public catalog projections (still strip prices server-side).';

CREATE INDEX IF NOT EXISTS idx_quote_catalog_items_program ON public.quote_catalog_items (program_id);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_items_parent ON public.quote_catalog_items (parent_catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_items_active ON public.quote_catalog_items (is_active);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_items_public ON public.quote_catalog_items (visible_to_public) WHERE visible_to_public = true;

-- ---------------------------------------------------------------------------
-- 3) Item options (matrix add-ons, finishes, sub-lines)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_catalog_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.quote_catalog_items (id) ON DELETE CASCADE,
  option_code text NOT NULL,
  option_name text NOT NULL,
  description text,
  unit_type text,
  pricing_behavior text NOT NULL DEFAULT 'unit_price',
  visible_to_public boolean NOT NULL DEFAULT false,
  visible_to_partner boolean NOT NULL DEFAULT true,
  visible_to_internal boolean NOT NULL DEFAULT true,
  requires_review boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_catalog_item_options_item_code_uniq UNIQUE (catalog_item_id, option_code)
);

COMMENT ON TABLE public.quote_catalog_item_options IS 'Child options for a catalog item (e.g. finish tier); pricing may inherit or use separate catalog pricing rows in future.';

CREATE INDEX IF NOT EXISTS idx_quote_catalog_item_options_item ON public.quote_catalog_item_options (catalog_item_id);

-- ---------------------------------------------------------------------------
-- 4) Media (images, spec sheets, documents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_catalog_item_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.quote_catalog_items (id) ON DELETE CASCADE,
  media_kind text NOT NULL,
  title text,
  storage_path text,
  public_url text,
  is_public_safe boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_catalog_item_media_kind_ck CHECK (
    media_kind = ANY (
      ARRAY['image'::text, 'spec_sheet'::text, 'document'::text, 'video'::text, 'other'::text]
    )
  )
);

COMMENT ON TABLE public.quote_catalog_item_media IS 'Assets for catalog items; public responses should only include is_public_safe rows.';
CREATE INDEX IF NOT EXISTS idx_quote_catalog_item_media_item ON public.quote_catalog_item_media (catalog_item_id);

-- ---------------------------------------------------------------------------
-- 5) Visibility rules (conditional overrides beyond booleans on items)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_catalog_visibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.quote_programs (id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.quote_catalog_items (id) ON DELETE CASCADE,
  rule_scope text NOT NULL,
  rule_type text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_catalog_visibility_target_ck CHECK (
    (program_id IS NOT NULL)::int + (catalog_item_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT quote_catalog_visibility_scope_ck CHECK (
    rule_scope = ANY (
      ARRAY[
        'public_wizard'::text,
        'partner_portal'::text,
        'internal_estimate'::text,
        'api'::text
      ]
    )
  ),
  CONSTRAINT quote_catalog_visibility_type_ck CHECK (
    rule_type = ANY (ARRAY['always_show'::text, 'always_hide'::text, 'conditional'::text])
  )
);

COMMENT ON TABLE public.quote_catalog_visibility_rules IS 'Optional overrides for channel-specific show/hide (e.g. hide until review approved).';
CREATE INDEX IF NOT EXISTS idx_quote_catalog_visibility_program ON public.quote_catalog_visibility_rules (program_id);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_visibility_item ON public.quote_catalog_visibility_rules (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_visibility_scope ON public.quote_catalog_visibility_rules (rule_scope, is_active);

-- ---------------------------------------------------------------------------
-- 6) Catalog pricing rules (per pricing structure × catalog item)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_catalog_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_structure_id uuid NOT NULL REFERENCES public.quote_pricing_structures (id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES public.quote_catalog_items (id) ON DELETE RESTRICT,
  base_cost numeric,
  price numeric,
  markup_percent numeric,
  min_charge numeric,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_catalog_pricing_rules IS 'Unit economics for a catalog item under a specific quote_pricing_structures row; authoritative for catalog-backed quoting when wired.';
COMMENT ON COLUMN public.quote_catalog_pricing_rules.metadata IS 'Tier matrices, uplift factors, etc. until normalized further.';

CREATE INDEX IF NOT EXISTS idx_quote_catalog_pricing_structure ON public.quote_catalog_pricing_rules (pricing_structure_id);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_pricing_item ON public.quote_catalog_pricing_rules (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_pricing_effective ON public.quote_catalog_pricing_rules (effective_from, effective_to);

-- At most one *active* price row per structure × item (history via is_active / effective_to).
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_catalog_pricing_active
  ON public.quote_catalog_pricing_rules (pricing_structure_id, catalog_item_id)
  WHERE is_active = true;
