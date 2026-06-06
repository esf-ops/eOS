-- =============================================================================
-- eliteOS Slab Color Visual Asset Cache
-- Draft migration — DO NOT apply automatically.
-- Apply manually in Supabase SQL editor after review.
-- =============================================================================
--
-- PURPOSE
-- ───────
-- Stores texture images and other visual assets for color programs so the
-- Elite 100 carousel and Non-Stock gallery can show product-quality visuals
-- even when a verified physical slab photo is not available.
--
-- AUTHORITY RULE — READ BEFORE EXTENDING
-- ────────────────────────────────────────
-- slab_color_visual_assets is PRESENTATION ENRICHMENT ONLY.
-- Typed slab_inventory rows remain the SOLE SOURCE OF TRUTH for:
--   - physical slab and remnant counts
--   - rack, lot, dimensions, availability
--   - pricing and reservation decisions
-- Never use SlabCloud v2 display counts or any field from this table as
-- inventory authority.  Never use count_for_color.
--
-- IMAGE PRIORITY (consumed by GET /api/slab-inventory/elite100-programs)
-- ───────────────────────────────────────────────────────────────────────
-- 1. approved + is_primary visual asset for the catalog item
-- 2. imported visual asset from slabcloud_v2
-- 3. best representative verified slab photo (scored: Slab >> Remnant, area tiebreaker)
-- 4. initials placeholder
--
-- TABLES
-- ──────
-- A. slab_color_visual_assets  — one row per source product/color/asset combo
--
-- SAFETY
-- ──────
-- No DML (no INSERT, UPDATE, DELETE, TRUNCATE).
-- No permissive RLS policies — service-role access only.
-- All CREATE TABLE / INDEX statements use IF NOT EXISTS (idempotent).
-- Apply in a transaction; roll back on any error.
--
-- AFTER APPLYING
-- ──────────────
-- 1. Run dry-run texture cache:
--      npm run eos:slabcloud:v2-texture-cache
-- 2. Review dry-run output — confirm row counts.
-- 3. Write-enable with credentials:
--      SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1 \
--        SLABOS_ORGANIZATION_ID=<org-uuid> \
--        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
--        npm run eos:slabcloud:v2-texture-cache
-- 4. Verify Elite 100 cards show texture images via GET /api/slab-inventory/elite100-programs.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A. slab_color_visual_assets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.slab_color_visual_assets (
  id                       uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL,

  -- Link to Elite 100 catalog item (null = non-stock or unmatched)
  catalog_item_id          uuid        NULL
    REFERENCES public.slab_color_catalog_items(id) ON DELETE SET NULL,

  -- Source identification
  source_system            text        NOT NULL DEFAULT 'slabcloud_v2',
  source_public_slug       text        NULL     DEFAULT 'esf',
  source_api_company_code  text        NULL     DEFAULT 'kbyd',
  source_asset_company_code text       NULL     DEFAULT 'kbyd',

  -- Source color identification (display values from v2)
  source_color_name        text        NOT NULL,
  source_material_name     text        NULL,

  -- Normalized for matching (same algorithm as colorProgramMatching.js)
  normalized_color_name    text        NOT NULL,
  normalized_material_name text        NULL,

  source_price_group       text        NULL,
  product_slug             text        NULL,

  -- Texture image data (from SlabCloud v2 /scdata/textures/{size}/{hash}.jpg)
  texture_hash             text        NULL,
  texture_url_600          text        NULL,
  texture_url_1024         text        NULL,

  -- General image URLs (for non-texture asset kinds)
  original_image_url       text        NULL,
  thumbnail_url            text        NULL,
  hero_url                 text        NULL,

  -- Asset classification
  asset_kind               text        NOT NULL DEFAULT 'texture',
  CONSTRAINT chk_slab_color_visual_assets_kind
    CHECK (asset_kind IN ('texture', 'slab_photo', 'manufacturer', 'manual_upload', 'generated')),

  -- Review / approval lifecycle
  review_status            text        NOT NULL DEFAULT 'imported',
  CONSTRAINT chk_slab_color_visual_assets_review_status
    CHECK (review_status IN ('imported', 'approved', 'needs_review', 'rejected')),

  -- Display priority
  is_primary               boolean     NOT NULL DEFAULT false,
  is_active                boolean     NOT NULL DEFAULT true,

  -- Matching metadata
  confidence_score         numeric     NULL,
  match_method             text        NULL,
  CONSTRAINT chk_slab_color_visual_assets_match_method
    CHECK (match_method IS NULL OR match_method IN ('exact', 'alias', 'manual', 'none')),

  -- Raw source payload (diagnostic / audit only — never used for inventory)
  raw                      jsonb       NULL,

  -- Timestamps
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.slab_color_visual_assets IS
  'Presentation-only visual asset cache for color program cards (Elite 100, Non-Stock). '
  'Source: SlabCloud v2 texture endpoint and future manual/manufacturer uploads. '
  'AUTHORITY: slab_inventory typed rows remain the sole source of truth for physical '
  'slabs, counts, rack, lot, and availability. This table is enrichment only.';

COMMENT ON COLUMN public.slab_color_visual_assets.catalog_item_id IS
  'Link to Elite 100 catalog item. NULL = non-stock or unmatched color.';
COMMENT ON COLUMN public.slab_color_visual_assets.source_system IS
  'Origin of the asset: slabcloud_v2, manual_upload, manufacturer, generated.';
COMMENT ON COLUMN public.slab_color_visual_assets.asset_kind IS
  'texture: SlabCloud v2 texture image. slab_photo: verified slab image from inventory. '
  'manufacturer: official brand image. manual_upload: operator-added photo. generated: AI/design.';
COMMENT ON COLUMN public.slab_color_visual_assets.review_status IS
  'imported: auto-imported, pending review. approved: operator-verified. '
  'needs_review: uncertain match. rejected: explicitly excluded.';
COMMENT ON COLUMN public.slab_color_visual_assets.is_primary IS
  'True for the operator-designated primary display image for a catalog item. '
  'At most one row per catalog_item_id should have is_primary=true.';
COMMENT ON COLUMN public.slab_color_visual_assets.raw IS
  'Raw source payload for diagnostics and audit. Never used for inventory decisions.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Active assets by org (for broad loads)
CREATE INDEX IF NOT EXISTS idx_slab_color_visual_assets_org_active
  ON public.slab_color_visual_assets (organization_id, is_active)
  WHERE is_active = true;

-- Assets by catalog item (main Elite 100 lookup)
CREATE INDEX IF NOT EXISTS idx_slab_color_visual_assets_org_catalog_item
  ON public.slab_color_visual_assets (organization_id, catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

-- Assets by normalized color+material (for non-stock lookup)
CREATE INDEX IF NOT EXISTS idx_slab_color_visual_assets_org_norm_color
  ON public.slab_color_visual_assets (organization_id, normalized_color_name, normalized_material_name);

-- Assets by source_system + texture_hash (for dedup / cache refresh)
CREATE INDEX IF NOT EXISTS idx_slab_color_visual_assets_org_system_hash
  ON public.slab_color_visual_assets (organization_id, source_system, texture_hash)
  WHERE texture_hash IS NOT NULL;

-- Primary assets per catalog item (fast lookup for display)
CREATE INDEX IF NOT EXISTS idx_slab_color_visual_assets_org_primary
  ON public.slab_color_visual_assets (organization_id, catalog_item_id)
  WHERE is_primary = true;

-- ---------------------------------------------------------------------------
-- Unique index for idempotent imports
-- Prevents duplicate visual asset rows for the same source product/color.
-- NULLS NOT DISTINCT (PostgreSQL 15+): two rows with the same NULL product_slug
-- or texture_hash are treated as duplicates.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_slab_color_visual_assets_import_key
  ON public.slab_color_visual_assets (
    organization_id,
    source_system,
    source_api_company_code,
    product_slug,
    texture_hash
  ) NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- RLS — enable; no permissive policies. Service-role access only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.slab_color_visual_assets ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- MANUAL APPLY STEPS
-- =============================================================================
-- 1. Open Supabase SQL editor for the target project.
-- 2. Paste this entire file.
-- 3. Verify BEGIN / COMMIT wrap all statements.
-- 4. Run it. All CREATE TABLE / INDEX statements are idempotent (IF NOT EXISTS).
-- 5. Confirm the table and indexes appear in the Supabase table editor.
-- 6. Run dry-run texture cache to preview what would be written:
--      npm run eos:slabcloud:v2-texture-cache
-- 7. After reviewing dry-run output, write-enable with org + Supabase creds:
--      SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1 \
--        SLABOS_ORGANIZATION_ID=<org-uuid> \
--        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
--        npm run eos:slabcloud:v2-texture-cache
-- 8. Verify API response includes visual_asset_url_600 for matched catalog items:
--      GET /api/slab-inventory/elite100-programs
-- 9. Confirm Elite 100 cards show texture images in the UI.
--
-- NOTE: The visual asset cache is ENRICHMENT ONLY.
--   - Typed slab_inventory rows remain the authority for counts and availability.
--   - SlabCloud v2 display counts are never used as inventory authority.
--   - All writes to this table are write-gated (SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1).
-- =============================================================================
