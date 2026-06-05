-- =============================================================================
-- eliteOS SlabCloud inventory scope upgrade
-- Draft migration — DO NOT apply automatically.
-- Apply manually in Supabase SQL editor after review.
-- =============================================================================
--
-- PURPOSE
-- ───────
-- Extends the SlabCloud inventory cache schema to track the inventory scope
-- (Slab vs Remnant vs all) and to distinguish the public slug from the API and
-- asset company codes.
--
-- BACKGROUND
-- ──────────
-- Live diagnostic (2026-06-05) proved that the ESF manager page uses company
-- code "kbyd" at the API level while the public URL slug is "esf". The current
-- sync fetches type=Slab only (145 summary rows). Fetching type=Remnant returns
-- 689 additional summary rows. The bare endpoint (no type param) returns 742
-- total. Missing inventory is a type/filter scope gap, not a company-code error.
--
-- SAFETY
-- ──────
-- No DML (no INSERT, UPDATE, DELETE, TRUNCATE).
-- No permissive RLS policies.
-- No deletions or inactive marking.
-- All ALTER TABLE statements use IF NOT EXISTS to be idempotent.
-- Apply in a transaction; roll back if any error occurs.
--
-- ORDER OF OPERATIONS
-- ───────────────────
-- 1. slabcloud_sync_runs — new scope tracking columns
-- 2. slab_inventory       — new source/type/scope columns + generated is_remnant
-- 3. slab_inventory_raw_records — lightweight type/scope columns
-- 4. slab_images          — optional asset company code column
-- 5. New indexes
--
-- AFTER APPLYING
-- ──────────────
-- Existing rows will have NULL in all new columns — this is intentional.
-- Old syncs (pre-upgrade) are classified as is_remnant = false (via COALESCE).
-- Run a new write-enabled sync with SLABCLOUD_INVENTORY_SCOPE=all to populate.
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. slabcloud_sync_runs — scope metadata for every sync run
-- ---------------------------------------------------------------------------

-- The public-facing ESF URL slug (e.g. "esf" in /inventory/esf/manager.php).
-- Distinguished from the API company code because they differ for ESF: slug=esf,
-- API code=kbyd. Stored for traceability; does not affect the API requests.
ALTER TABLE public.slabcloud_sync_runs
  ADD COLUMN IF NOT EXISTS source_public_slug text NULL;

-- The company code actually used in API requests (e.g. "kbyd").
-- This is the value that appears in /api/slabs/{apiCompanyCode}.
ALTER TABLE public.slabcloud_sync_runs
  ADD COLUMN IF NOT EXISTS source_api_company_code text NULL;

-- The company code used to construct image/asset URLs (e.g. "kbyd").
-- Usually identical to source_api_company_code but separated so they can
-- diverge without a schema change if SlabCloud ever moves assets to a CDN.
ALTER TABLE public.slabcloud_sync_runs
  ADD COLUMN IF NOT EXISTS source_asset_company_code text NULL;

-- The inventory scope used for this run.
-- Values: 'slab'     → type=Slab&edges=true (historic default)
--         'remnant'  → type=Remnant&edges=true
--         'all'      → no type param, edges=true (returns full catalog: ~742 rows for ESF)
ALTER TABLE public.slabcloud_sync_runs
  ADD COLUMN IF NOT EXISTS inventory_scope text NULL;

-- Type-breakdown counts recorded at normalization time (before writes).
-- Populated by the sync script; null for runs that predate this upgrade.
ALTER TABLE public.slabcloud_sync_runs
  ADD COLUMN IF NOT EXISTS slab_row_count integer NULL;
ALTER TABLE public.slabcloud_sync_runs
  ADD COLUMN IF NOT EXISTS remnant_row_count integer NULL;
ALTER TABLE public.slabcloud_sync_runs
  ADD COLUMN IF NOT EXISTS all_inventory_row_count integer NULL;

COMMENT ON COLUMN public.slabcloud_sync_runs.source_public_slug IS
  'Public URL slug for the ESF inventory page (e.g. "esf" from /inventory/esf/). '
  'Not the same as source_api_company_code for ESF.';
COMMENT ON COLUMN public.slabcloud_sync_runs.source_api_company_code IS
  'Company code used in API requests to SlabCloud (e.g. "kbyd"). '
  'Confirmed by manager console: company=kbyd even on /inventory/esf/manager.php.';
COMMENT ON COLUMN public.slabcloud_sync_runs.source_asset_company_code IS
  'Company code used in image/asset URL paths (e.g. "kbyd" in /slabs/kbyd/{id}.jpg).';
COMMENT ON COLUMN public.slabcloud_sync_runs.inventory_scope IS
  'Inventory fetch scope: slab | remnant | all. '
  '"all" fetches /api/slabs/kbyd?edges=true (no type param) returning the full catalog.';
COMMENT ON COLUMN public.slabcloud_sync_runs.slab_row_count IS
  'Count of normalized records with source_inventory_type=Slab from this run.';
COMMENT ON COLUMN public.slabcloud_sync_runs.remnant_row_count IS
  'Count of normalized records with source_inventory_type=Remnant from this run.';
COMMENT ON COLUMN public.slabcloud_sync_runs.all_inventory_row_count IS
  'Total normalized record count regardless of inventory type.';

-- ---------------------------------------------------------------------------
-- 2. slab_inventory — source/type/scope + generated is_remnant
-- ---------------------------------------------------------------------------

-- The inventory type as imported from SlabCloud or inferred from the fetch scope.
-- Examples: 'Slab', 'Remnant', 'unknown'
-- IMPORTANT: This is the SOURCE type as reported/inferred from SlabCloud.
-- It is NOT slabOS classification authority. Do not use this column to drive
-- pricing decisions. source_price_group (stored as price_group) is also
-- imported-only and must not be treated as slabOS pricing authority.
ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS source_inventory_type text NULL;

-- GENERATED column: true iff source_inventory_type = 'Remnant'.
-- Uses COALESCE so that NULL source_inventory_type → false (not NULL).
-- Existing rows from pre-upgrade syncs will have false (not NULL).
-- Because this is GENERATED ALWAYS, slabOS code must NOT include this column
-- in upsert payloads; the DB computes it automatically.
ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS is_remnant boolean
    GENERATED ALWAYS AS (COALESCE(source_inventory_type = 'Remnant', false)) STORED;

-- The fetch scope used when this row was last synced.
-- Values: 'slab' | 'remnant' | 'all' — maps to the SLABCLOUD_INVENTORY_SCOPE
-- env var used during the sync run that last touched this row.
ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS source_inventory_scope text NULL;

-- The public URL slug for the ESF inventory page (e.g. "esf").
-- Stored for traceability. Not an API code.
ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS source_public_slug text NULL;

-- The API company code used in the SlabCloud API request (e.g. "kbyd").
ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS source_api_company_code text NULL;

-- The company code used for image/asset URL construction (e.g. "kbyd").
-- Usually the same as source_api_company_code.
ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS source_asset_company_code text NULL;

COMMENT ON COLUMN public.slab_inventory.source_inventory_type IS
  'Inventory type as imported from SlabCloud or inferred from query scope. '
  'Examples: Slab, Remnant, unknown. SOURCE-ONLY — not slabOS classification authority. '
  'Do not drive pricing from this field.';
COMMENT ON COLUMN public.slab_inventory.is_remnant IS
  'Generated boolean: true iff source_inventory_type = ''Remnant''. '
  'COALESCE ensures NULL source_inventory_type → false. '
  'DO NOT include this column in upsert payloads (GENERATED ALWAYS).';
COMMENT ON COLUMN public.slab_inventory.source_inventory_scope IS
  'Inventory fetch scope when last synced: slab | remnant | all. '
  'Reflects which SLABCLOUD_INVENTORY_SCOPE value was active during that sync run.';
COMMENT ON COLUMN public.slab_inventory.source_public_slug IS
  'Public ESF inventory slug (e.g. "esf"). For traceability only.';
COMMENT ON COLUMN public.slab_inventory.source_api_company_code IS
  'SlabCloud API company code (e.g. "kbyd"). Not the same as the public slug.';
COMMENT ON COLUMN public.slab_inventory.source_asset_company_code IS
  'Company code in image URL paths (e.g. "kbyd" in /slabs/kbyd/{uuid}.jpg).';

-- ---------------------------------------------------------------------------
-- 3. slab_inventory_raw_records — lightweight type/scope columns
-- ---------------------------------------------------------------------------

-- Same semantics as slab_inventory.source_inventory_type.
ALTER TABLE public.slab_inventory_raw_records
  ADD COLUMN IF NOT EXISTS source_inventory_type text NULL;

-- Same semantics as slab_inventory.source_inventory_scope.
ALTER TABLE public.slab_inventory_raw_records
  ADD COLUMN IF NOT EXISTS source_inventory_scope text NULL;

COMMENT ON COLUMN public.slab_inventory_raw_records.source_inventory_type IS
  'Inventory type at time of this raw record capture. Mirrors slab_inventory.source_inventory_type.';
COMMENT ON COLUMN public.slab_inventory_raw_records.source_inventory_scope IS
  'Fetch scope at time of capture: slab | remnant | all.';

-- ---------------------------------------------------------------------------
-- 4. slab_images — asset company code for image URL traceability
-- ---------------------------------------------------------------------------

-- The company code segment actually used in this image URL (e.g. "kbyd").
-- Useful if the asset company code ever diverges from the API company code.
ALTER TABLE public.slab_images
  ADD COLUMN IF NOT EXISTS source_asset_company_code text NULL;

COMMENT ON COLUMN public.slab_images.source_asset_company_code IS
  'Company code segment in the image URL path (e.g. "kbyd" in /slabs/kbyd/{uuid}.jpg). '
  'Usually the same as slab_inventory.source_asset_company_code.';

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------

-- Filter by active status + inventory type (most common UI query)
CREATE INDEX IF NOT EXISTS idx_slab_inventory_org_active_type
  ON public.slab_inventory (organization_id, is_active, source_inventory_type)
  WHERE is_active = true;

-- Filter by organization + inventory type (admin/diagnostic queries)
CREATE INDEX IF NOT EXISTS idx_slab_inventory_org_type
  ON public.slab_inventory (organization_id, source_inventory_type);

-- Support color+material+type filters (gallery queries with type filter)
CREATE INDEX IF NOT EXISTS idx_slab_inventory_org_color_material_type
  ON public.slab_inventory (organization_id, color_name, material_name, source_inventory_type);

-- Filter remnants specifically (after SQL applied, is_remnant is always computed)
CREATE INDEX IF NOT EXISTS idx_slab_inventory_org_is_remnant
  ON public.slab_inventory (organization_id, is_remnant)
  WHERE is_remnant = true;

COMMIT;

-- =============================================================================
-- MANUAL APPLY STEPS
-- =============================================================================
-- 1. Open Supabase SQL editor for the target project.
-- 2. Paste this entire file.
-- 3. Verify the BEGIN / COMMIT transaction wraps all statements.
-- 4. Run it. All ALTER TABLE statements are idempotent (IF NOT EXISTS).
-- 5. Confirm the new columns appear in the Supabase table editor.
-- 6. Run the dry-run all-scope smoke:
--      SLABCLOUD_INVENTORY_SCOPE=all \
--        SLABCLOUD_API_COMPANY_CODE=kbyd \
--        SLABCLOUD_ASSET_COMPANY_CODE=kbyd \
--        SLABCLOUD_PUBLIC_SLUG=esf \
--        npm run eos:slabcloud:cache
-- 7. Review the JSON output at debug/slabcloud/slabcloud-cache-dry-run-*.json
-- 8. Only after review, run a capped write-enabled smoke:
--      SLABCLOUD_CACHE_WRITE_ENABLED=1 \
--        SLABCLOUD_ORGANIZATION_ID=<org-uuid> \
--        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
--        SLABCLOUD_INVENTORY_SCOPE=all \
--        SLABCLOUD_API_COMPANY_CODE=kbyd \
--        SLABCLOUD_ASSET_COMPANY_CODE=kbyd \
--        SLABCLOUD_PUBLIC_SLUG=esf \
--        SLABCLOUD_MAX_DETAILS=20 \
--        npm run eos:slabcloud:cache
-- =============================================================================
