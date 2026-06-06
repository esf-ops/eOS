/**
 * slabCloudVisualAssetCache — pure helpers for building and managing
 * visual asset cache rows from SlabCloud v2 texture data.
 *
 * SCOPE / SAFETY (read this before extending):
 *   - Pure functions only. No network, no filesystem, no Supabase calls here.
 *   - Visual assets are PRESENTATION ENRICHMENT ONLY.
 *   - Typed slab_inventory remains the sole source of truth for physical slabs,
 *     counts, rack, lot, dimensions, and availability.
 *   - Never use count_for_color or any v2 display count as inventory authority.
 *   - Never mutate slab_inventory from anything that imports this module.
 *
 * The SELECT-then-INSERT idempotency helper (findExistingVisualAsset) is also
 * exported here so it can be tested in isolation without running the full script.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const VISUAL_ASSET_KIND_VALUES = Object.freeze([
  "texture",
  "slab_photo",
  "manufacturer",
  "manual_upload",
  "generated",
]);

export const VISUAL_ASSET_REVIEW_STATUS_VALUES = Object.freeze([
  "imported",
  "approved",
  "needs_review",
  "rejected",
]);

export const VISUAL_ASSET_MATCH_METHOD_VALUES = Object.freeze([
  "exact",
  "alias",
  "manual",
  "none",
]);

// Default source identifiers for SlabCloud v2
export const DEFAULT_SOURCE_SYSTEM      = "slabcloud_v2";
export const DEFAULT_COMPANY_CODE       = "kbyd";
export const DEFAULT_PUBLIC_SLUG        = "esf";

// ── Row builder ───────────────────────────────────────────────────────────────

/**
 * Build a slab_color_visual_assets insert payload from one normalized v2 row.
 * Returns null if the row has no texture_hash (skip rows without visual data).
 *
 * Pure function — no I/O.
 *
 * @param {Object}      normalizedV2Row   Output of normalizeV2Row()
 * @param {string}      orgId             organization_id UUID
 * @param {string|null} catalogItemId     slab_color_catalog_items.id, or null for non-stock
 * @param {string|null} matchMethod       "exact" | "alias" | "manual" | "none" | null
 * @param {Object}      [opts]
 * @param {string}      [opts.companyCode]   defaults to DEFAULT_COMPANY_CODE
 * @param {string}      [opts.publicSlug]    defaults to DEFAULT_PUBLIC_SLUG
 * @returns {Object|null}
 */
export function buildVisualAssetRow(
  normalizedV2Row,
  orgId,
  catalogItemId,
  matchMethod,
  opts = {}
) {
  if (!normalizedV2Row || typeof normalizedV2Row !== "object") return null;
  if (!normalizedV2Row.texture_hash) return null; // no visual data — skip

  const companyCode = String(opts.companyCode ?? DEFAULT_COMPANY_CODE).trim() || DEFAULT_COMPANY_CODE;
  const publicSlug  = String(opts.publicSlug  ?? DEFAULT_PUBLIC_SLUG).trim()  || DEFAULT_PUBLIC_SLUG;

  const resolvedMatchMethod =
    matchMethod != null && VISUAL_ASSET_MATCH_METHOD_VALUES.includes(String(matchMethod))
      ? String(matchMethod)
      : null;

  return {
    organization_id:          orgId,
    catalog_item_id:          catalogItemId ?? null,
    source_system:            DEFAULT_SOURCE_SYSTEM,
    source_public_slug:       publicSlug,
    source_api_company_code:  companyCode,
    source_asset_company_code: companyCode,
    source_color_name:        normalizedV2Row.source_color_name ?? null,
    source_material_name:     normalizedV2Row.source_material_name ?? null,
    normalized_color_name:    normalizedV2Row.normalized_color_name ?? null,
    normalized_material_name: normalizedV2Row.normalized_material_name ?? null,
    product_slug:             normalizedV2Row.product_slug ?? null,
    texture_hash:             normalizedV2Row.texture_hash,
    texture_url_600:          normalizedV2Row.texture_url_600 ?? null,
    texture_url_1024:         normalizedV2Row.texture_url_1024 ?? null,
    original_image_url:       null,
    thumbnail_url:            null,
    hero_url:                 null,
    asset_kind:               "texture",
    review_status:            "imported",
    is_primary:               false,
    is_active:                true,
    confidence_score:         null,
    match_method:             resolvedMatchMethod,
    raw:                      normalizedV2Row.raw ?? null,
    last_seen_at:             new Date().toISOString(),
  };
}

// ── Idempotency lookup helper ─────────────────────────────────────────────────

/**
 * Look up an existing visual asset row using the natural import key:
 *   (organization_id, source_system, source_api_company_code, product_slug)
 *
 * Exported for testing. The cache script imports this to implement
 * SELECT-then-INSERT/UPDATE instead of relying on ON CONFLICT.
 *
 * @param {Object}      supabase     Supabase client instance
 * @param {string}      orgId        organization_id UUID
 * @param {string}      companyCode  source_api_company_code
 * @param {string|null} productSlug  product_slug (may be null)
 * @returns {Promise<Object|null>}   Existing row or null
 */
export async function findExistingVisualAsset(supabase, orgId, companyCode, productSlug) {
  let query = supabase
    .from("slab_color_visual_assets")
    .select("id, texture_hash, catalog_item_id, updated_at")
    .eq("organization_id", orgId)
    .eq("source_system", DEFAULT_SOURCE_SYSTEM)
    .eq("source_api_company_code", companyCode);

  if (productSlug) {
    query = query.eq("product_slug", productSlug);
  } else {
    query = query.is("product_slug", null);
  }

  const { data, error } = await query.limit(1);
  if (error) throw new Error(`Visual asset lookup error: ${error.message}`);
  return data?.[0] ?? null;
}
