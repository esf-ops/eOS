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

// ── Deep sweep — product endpoint helpers ─────────────────────────────────────

/**
 * Extract a texture hash string from a raw v2 product endpoint response.
 * Handles the shapes seen in diagnostics:
 *   - top-level `texture` as a string
 *   - top-level `texture` as an array (first non-empty string element)
 *   - top-level `texture` as an object with a `hash` key
 *   - `config.texture` if top-level `texture` is absent
 * Returns null if no hash can be extracted.
 * Pure function — no I/O.
 *
 * IMPORTANT: slab count / display count fields in the product response are
 * NEVER read by this function and MUST NOT be used as inventory authority.
 *
 * @param {Object} rawProductResponse
 * @returns {string|null}
 */
export function extractTextureHashFromProductResponse(rawProductResponse) {
  if (!rawProductResponse || typeof rawProductResponse !== "object") return null;

  const candidates = [
    rawProductResponse.texture,
    rawProductResponse.Texture,
    rawProductResponse.config?.texture,
    rawProductResponse.Config?.texture,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;

    // String — most common case
    if (typeof candidate === "string") {
      const cleaned = candidate.trim();
      if (cleaned) return cleaned;
      continue;
    }

    // Array — take first non-empty string element; also try {hash} objects
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === "string" && item.trim()) return item.trim();
        if (item && typeof item === "object") {
          const h = item.hash ?? item.value ?? item.texture ?? item.id;
          if (typeof h === "string" && h.trim()) return h.trim();
        }
      }
      continue;
    }

    // Object — try common hash field names
    if (typeof candidate === "object") {
      for (const field of ["hash", "value", "texture", "id"]) {
        if (candidate[field] && typeof candidate[field] === "string" && candidate[field].trim()) {
          return candidate[field].trim();
        }
      }
    }
  }

  return null;
}

/**
 * Build the list of product endpoint candidates for a deep sweep.
 * Deduplicates by `product_slug + normalized_material_name`.
 * By default only includes rows without a bulk texture hash.
 * Pure function — no I/O.
 *
 * @param {Array}  normalizedRows  Output of normalizeV2Rows()
 * @param {Object} [opts]
 * @param {boolean} [opts.onlyMissing=true]  Only include rows lacking bulk texture_hash
 * @param {number}  [opts.limit=0]            Cap on candidates (0 = no cap)
 * @returns {Array}
 */
export function buildProductEndpointCandidates(normalizedRows, opts = {}) {
  const onlyMissing = opts.onlyMissing !== false; // default true
  const limit = Math.max(0, Number.isFinite(+opts.limit) ? +opts.limit : 0);

  const seen = new Set();
  const candidates = [];

  for (const row of Array.isArray(normalizedRows) ? normalizedRows : []) {
    if (!row.product_slug) continue;
    if (onlyMissing && row.has_texture) continue;

    const dedupKey = `${row.product_slug}||${row.normalized_material_name ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    candidates.push(row);
    if (limit > 0 && candidates.length >= limit) break;
  }

  return candidates;
}

/**
 * Merge a product-endpoint-discovered texture hash into a normalized v2 row.
 * Returns a new object (does not mutate). Returns the original row when
 * textureHash is empty.
 * Pure function — no I/O.
 *
 * IMPORTANT: The product response may contain slab counts and display counts.
 * Those are NEVER stored in the merged row and MUST NOT be used as inventory
 * authority. Only the texture hash is extracted.
 *
 * @param {Object}      normalizedRow      Source row from normalizeV2Row()
 * @param {string|null} textureHash        Hash discovered from product endpoint
 * @param {string|null} productUrl         URL that was fetched (for raw metadata)
 * @param {Object|null} sweepResult        Full result object from runDeepSweep (for metadata)
 * @param {string}      [baseUrl]          SlabCloud base URL (default https://slabcloud.com)
 * @returns {Object}
 */
export function mergeProductTextureIntoRow(
  normalizedRow,
  textureHash,
  productUrl,
  sweepResult,
  baseUrl = "https://slabcloud.com"
) {
  if (!textureHash || !String(textureHash).trim()) return normalizedRow;

  const cleanHash = String(textureHash).trim();
  const base = String(baseUrl || "https://slabcloud.com").replace(/\/+$/, "");

  return {
    ...normalizedRow,
    texture_hash:     cleanHash,
    texture_url_600:  `${base}/scdata/textures/600/${cleanHash}.jpg`,
    texture_url_1024: `${base}/scdata/textures/1024/${cleanHash}.jpg`,
    has_texture:      true,
    raw: {
      ...(normalizedRow.raw ?? {}),
      texture_discovery_source: "product_endpoint",
      product_endpoint_url:     productUrl ?? null,
      product_response_keys:    sweepResult?.responseKeys ?? null,
      product_texture_value:    String(cleanHash),
    },
  };
}

/**
 * Apply deep sweep texture results to a set of normalized rows, returning
 * enriched copies. Also annotates all rows (including bulk-texture rows) with
 * `raw.texture_discovery_source` so the audit trail is complete.
 *
 * - Bulk rows that already have texture: `texture_discovery_source = "bulk_inventory"`
 * - Rows upgraded via product endpoint:  `texture_discovery_source = "product_endpoint"`
 * - Rows still missing texture:          annotated with `texture_discovery_source = "bulk_inventory"`
 *   and will be skipped by buildVisualAssetPayloads (texture_hash still null).
 *
 * Pure function — no I/O.
 *
 * @param {Array}  normalizedRows      Output of normalizeV2Rows()
 * @param {Map}    deepSweepResultsMap  Map<"slug||normMaterial" → sweepResult> from runDeepSweep()
 * @param {string} [baseUrl]
 * @returns {Array}  New array of enriched normalized rows
 */
export function applyDeepSweepTextures(normalizedRows, deepSweepResultsMap, baseUrl = "https://slabcloud.com") {
  const sweepMap = deepSweepResultsMap instanceof Map ? deepSweepResultsMap : new Map();

  return (Array.isArray(normalizedRows) ? normalizedRows : []).map((row) => {
    const dedupKey = `${row.product_slug ?? ""}||${row.normalized_material_name ?? ""}`;
    const sweepResult = sweepMap.get(dedupKey) ?? null;

    // Row already has bulk texture — annotate source and keep as-is
    if (row.has_texture) {
      return {
        ...row,
        raw: {
          ...(row.raw ?? {}),
          texture_discovery_source: "bulk_inventory",
        },
      };
    }

    // No bulk texture — check if deep sweep found one
    if (sweepResult?.textureHash) {
      return mergeProductTextureIntoRow(
        row,
        sweepResult.textureHash,
        sweepResult.url ?? null,
        sweepResult,
        baseUrl
      );
    }

    // No texture from either source — annotate and pass through (will be skipped by payload builder)
    return {
      ...row,
      raw: {
        ...(row.raw ?? {}),
        texture_discovery_source: "bulk_inventory",
      },
    };
  });
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
