-- =============================================================================
-- eliteOS Slab Inventory Color Catalog
-- Draft migration — DO NOT apply automatically.
-- Apply manually in Supabase SQL editor after review.
-- =============================================================================
--
-- PURPOSE
-- ───────
-- Creates the catalog layer that lets slabOS classify SlabCloud color groups
-- into Elite 100 colors, Non-Stock colors, and needs-review fuzzy candidates.
-- This is the data foundation for the future Elite 100 carousel UI.
--
-- TABLES
-- ──────
-- A. slab_color_collections          — versioned collection records (e.g. elite100-2026)
-- B. slab_color_catalog_items        — individual color entries within a collection
-- C. slab_color_aliases              — alternate names for catalog items (for matching)
-- D. slab_color_program_match_reviews — per-color match results + review status
--
-- PRICE GROUP RULE
-- ────────────────
-- Active ESF price groups: Promo, A, B, C, D, E, F.
-- Group G is NOT an active ESF price group.
-- Catalog items are constrained to the 7 active groups via CHECK.
--
-- SAFETY
-- ──────
-- No DML (no INSERT, UPDATE, DELETE, TRUNCATE).
-- No permissive RLS policies — service-role access only.
-- No deletions or deactivation of existing rows.
-- All CREATE TABLE statements use IF NOT EXISTS (idempotent).
-- Apply in a transaction; roll back if any error occurs.
--
-- AFTER APPLYING
-- ──────────────
-- 1. Run the dry-run import: npm run eos:elite100:import-catalog
-- 2. Review output; have Chris verify the fixture transcription.
-- 3. After review: ELITE100_CATALOG_WRITE_ENABLED=1 npm run eos:elite100:import-catalog
-- 4. Run preview: npm run eos:elite100:preview-matches
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A. slab_color_collections — versioned Elite 100 collection records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.slab_color_collections (
  id               uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  collection_key   text        NOT NULL,
  display_name     text        NOT NULL,
  collection_year  integer     NULL,
  is_active        boolean     NOT NULL DEFAULT false,
  effective_start  date        NULL,
  effective_end    date        NULL,
  notes            text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_slab_color_collections_org_key
    UNIQUE (organization_id, collection_key)
);

COMMENT ON TABLE  public.slab_color_collections IS
  'Versioned color collection records (e.g. "elite100-2026"). '
  'One row per year per organization. is_active=true marks the current active catalog.';
COMMENT ON COLUMN public.slab_color_collections.collection_key IS
  'Stable slug identifier, e.g. "elite100-2026". Never change after publish.';
COMMENT ON COLUMN public.slab_color_collections.is_active IS
  'True for the currently active catalog. Only one collection should be active per org.';

-- ---------------------------------------------------------------------------
-- B. slab_color_catalog_items — individual Elite 100 color entries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.slab_color_catalog_items (
  id                        uuid    NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid    NOT NULL,
  collection_id             uuid    NOT NULL
    REFERENCES public.slab_color_collections(id) ON DELETE CASCADE,

  price_group               text    NOT NULL,
  color_name                text    NOT NULL,
  material_name             text    NOT NULL,
  display_name              text    NOT NULL,
  normalized_color_name     text    NOT NULL,
  normalized_material_name  text    NOT NULL,
  color_key                 text    NOT NULL,
  sort_order                integer NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  notes                     text    NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- Active ESF price groups: Promo, A, B, C, D, E, F.
  -- Group G is not included in current active group definitions.
  CONSTRAINT chk_slab_color_catalog_items_price_group
    CHECK (price_group IN ('Promo', 'A', 'B', 'C', 'D', 'E', 'F')),

  CONSTRAINT uq_slab_color_catalog_items_org_collection_color_key
    UNIQUE (organization_id, collection_id, color_key)
);

COMMENT ON TABLE  public.slab_color_catalog_items IS
  'Individual color entries within an Elite 100 collection. '
  'price_group reflects the slabOS program tier, not SlabCloud price group. '
  'color_key is a stable slug computed from (color_name, material_name, price_group) '
  'matching the makeColorKey() algorithm in slabInventoryApi.js.';
COMMENT ON COLUMN public.slab_color_catalog_items.price_group IS
  'slabOS program tier: Promo, A, B, C, D, E, or F. Group G is not active.';
COMMENT ON COLUMN public.slab_color_catalog_items.color_key IS
  'Stable slug: slugify(color_name) + "--" + slugify(material_name) + "--" + slugify(price_group). '
  'Same algorithm as makeColorKey() in slabInventoryApi.js.';
COMMENT ON COLUMN public.slab_color_catalog_items.normalized_color_name IS
  'Lowercased, trimmed, & → and, for fuzzy/exact matching. Not used for display.';
COMMENT ON COLUMN public.slab_color_catalog_items.normalized_material_name IS
  'Lowercased, trimmed, for fuzzy/exact matching. Not used for display.';

-- ---------------------------------------------------------------------------
-- C. slab_color_aliases — alternate names / spelling variants for matching
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.slab_color_aliases (
  id                             uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                uuid NOT NULL,
  catalog_item_id                uuid NULL
    REFERENCES public.slab_color_catalog_items(id) ON DELETE SET NULL,
  alias_color_name               text NOT NULL,
  alias_material_name            text NULL,
  normalized_alias_color_name    text NOT NULL,
  normalized_alias_material_name text NULL,
  source_system                  text NOT NULL DEFAULT 'slabcloud',
  is_active                      boolean NOT NULL DEFAULT true,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.slab_color_aliases IS
  'Alternate color names / spelling variants from external sources (e.g. SlabCloud) '
  'that should map to a catalog item. Used by the alias-exact matching step. '
  'catalog_item_id is nullable: NULL means the alias is under review.';
COMMENT ON COLUMN public.slab_color_aliases.source_system IS
  'Where this alias originated: "slabcloud", "manual", etc.';

-- ---------------------------------------------------------------------------
-- D. slab_color_program_match_reviews — per-color match results + review
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.slab_color_program_match_reviews (
  id                              uuid    NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid    NOT NULL,
  source_color_name               text    NOT NULL,
  source_material_name            text    NULL,
  normalized_source_color_name    text    NOT NULL,
  normalized_source_material_name text    NULL,
  source_price_group              text    NULL,
  matched_catalog_item_id         uuid    NULL
    REFERENCES public.slab_color_catalog_items(id) ON DELETE SET NULL,
  match_method                    text    NOT NULL,
  confidence_score                numeric NULL,
  review_status                   text    NOT NULL,
  reviewer_user_id                uuid    NULL,
  reviewed_at                     timestamptz NULL,
  notes                           text    NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_slab_color_program_match_reviews_method
    CHECK (match_method IN ('exact', 'alias', 'fuzzy', 'manual', 'none')),

  CONSTRAINT chk_slab_color_program_match_reviews_status
    CHECK (review_status IN ('approved', 'needs_review', 'rejected'))
);

COMMENT ON TABLE  public.slab_color_program_match_reviews IS
  'Records the result of matching a SlabCloud source color group to the Elite 100 catalog. '
  'match_method=exact/alias → review_status=approved. '
  'match_method=fuzzy → review_status=needs_review (must not auto-classify as Elite 100). '
  'match_method=none → Non-Stock candidate.';
COMMENT ON COLUMN public.slab_color_program_match_reviews.match_method IS
  'exact: color + material name match. alias: exact color, material alias. '
  'fuzzy: similarity-based (needs human review). manual: operator override. '
  'none: no match found — Non-Stock candidate.';
COMMENT ON COLUMN public.slab_color_program_match_reviews.confidence_score IS
  'Similarity score [0, 1] for fuzzy matches. NULL for exact/alias/manual/none.';
COMMENT ON COLUMN public.slab_color_program_match_reviews.review_status IS
  'approved: safe to classify as Elite 100. '
  'needs_review: fuzzy or uncertain — operator must confirm. '
  'rejected: explicitly not Elite 100 (Non-Stock).';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Collection lookup by org + key
CREATE INDEX IF NOT EXISTS idx_slab_color_collections_org_active
  ON public.slab_color_collections (organization_id, is_active)
  WHERE is_active = true;

-- Catalog items by collection
CREATE INDEX IF NOT EXISTS idx_slab_color_catalog_items_collection
  ON public.slab_color_catalog_items (collection_id, price_group, sort_order);

-- Catalog items by org + active status for quick full-catalog loads
CREATE INDEX IF NOT EXISTS idx_slab_color_catalog_items_org_active
  ON public.slab_color_catalog_items (organization_id, is_active)
  WHERE is_active = true;

-- Aliases by catalog item
CREATE INDEX IF NOT EXISTS idx_slab_color_aliases_catalog_item
  ON public.slab_color_aliases (catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

-- Aliases by normalized name (for alias lookup during matching)
CREATE INDEX IF NOT EXISTS idx_slab_color_aliases_org_norm_color
  ON public.slab_color_aliases (organization_id, normalized_alias_color_name)
  WHERE is_active = true;

-- Match reviews by org + review_status
CREATE INDEX IF NOT EXISTS idx_slab_color_match_reviews_org_status
  ON public.slab_color_program_match_reviews (organization_id, review_status);

-- Match reviews by org + source color name (for dedup lookup)
CREATE INDEX IF NOT EXISTS idx_slab_color_match_reviews_org_src_color
  ON public.slab_color_program_match_reviews (organization_id, normalized_source_color_name);

-- ---------------------------------------------------------------------------
-- Unique indexes for idempotent alias/review import
-- These allow ON CONFLICT-based upsert AND protect against import duplicates.
-- NULLS NOT DISTINCT: rows with the same NULLs are treated as duplicates,
-- which is correct for import deduplication (requires PostgreSQL 15+).
-- ---------------------------------------------------------------------------

-- Alias import key: org + catalog_item + normalized alias name + system
-- Allows safe re-import of the alias seed without creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_slab_color_aliases_import_key
  ON public.slab_color_aliases (
    organization_id,
    catalog_item_id,
    normalized_alias_color_name,
    normalized_alias_material_name,
    source_system
  ) NULLS NOT DISTINCT;

-- Review import key: org + normalized source color + method + status + matched item
-- Allows safe re-import of rejected fuzzy reviews without creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_slab_color_program_match_reviews_import_key
  ON public.slab_color_program_match_reviews (
    organization_id,
    normalized_source_color_name,
    normalized_source_material_name,
    match_method,
    review_status,
    matched_catalog_item_id
  ) NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- RLS — enable on all four tables; no permissive policies.
-- Service-role access only (reads via backend-core server client).
-- ---------------------------------------------------------------------------

ALTER TABLE public.slab_color_collections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slab_color_catalog_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slab_color_aliases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slab_color_program_match_reviews ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- MANUAL APPLY STEPS
-- =============================================================================
-- 1. Open Supabase SQL editor for the target project.
-- 2. Paste this entire file.
-- 3. Verify the BEGIN / COMMIT wraps all statements.
-- 4. Run it. All CREATE TABLE / CREATE INDEX statements are idempotent (IF NOT EXISTS).
-- 5. Confirm four new tables and the unique indexes appear in the Supabase table editor.
-- 6. Have Chris verify elite100-2026.json fixture transcription (see _review notes).
-- 7. Run dry-run import:
--      npm run eos:elite100:import-catalog
-- 8. After Chris approves the fixture:
--      ELITE100_CATALOG_WRITE_ENABLED=1 \
--        SLABOS_ORGANIZATION_ID=<org-uuid> \
--        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
--        npm run eos:elite100:import-catalog
-- 9. Apply approved aliases and rejected fuzzy reviews:
--      ELITE100_ALIAS_REVIEW_WRITE_ENABLED=1 \
--        SLABOS_ORGANIZATION_ID=<org-uuid> \
--        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
--        npm run eos:elite100:import-alias-reviews
--    (Script is idempotent — safe to re-run; existing rows are detected and skipped.)
-- 10. Run match preview:
--      npm run eos:elite100:preview-matches
--
-- NOTE (production unblock 2026-06-05):
--   The 8 approved aliases and 2 rejected fuzzy reviews for the elite100-2026
--   collection were manually inserted via SQL after the initial upsert-based script
--   failed due to missing unique indexes. Future runs of importElite100AliasReviews.js
--   use SELECT-then-INSERT and do not require the unique indexes to be present,
--   but the unique indexes above are now part of the schema for safety.
-- =============================================================================
