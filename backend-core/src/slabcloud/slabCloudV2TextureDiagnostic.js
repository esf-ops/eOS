/**
 * slabCloudV2TextureDiagnostic — pure helpers for the SlabCloud v2 texture
 * endpoint investigation.
 *
 * SCOPE / SAFETY (read this before extending):
 *   - Pure functions only: no network, no filesystem, no Supabase, no secrets.
 *   - READ ONLY diagnostic tools. No writes, no mutations.
 *   - Texture images are VISUAL ENRICHMENT ONLY. The typed slab_inventory table
 *     remains the sole source of truth for counts, physical slabs, and remnants.
 *   - No auth headers, no cookies, no private tokens required for public endpoints.
 *
 * V2 endpoint observations (from HAR / public inventory):
 *   GET /api/v2/inventory/{companyCode}?cq_type=&cq_material=
 *     → Returns product-level color rows, each may include:
 *         Name, Material, slug, texture, scColor, count, SlabID, ...
 *   GET /api/v2/product/{companyCode}?slug={slug}&cq_type=&cq_material=&mat={material}
 *     → Returns detailed product page for one color/material combination.
 *   Texture images:
 *     https://slabcloud.com/scdata/textures/600/{textureHash}.jpg
 *     https://slabcloud.com/scdata/textures/1024/{textureHash}.jpg
 *
 * Future image priority (for Elite 100 cards):
 *   1. SlabCloud v2 texture image (/scdata/textures/600 or /1024)
 *   2. Representative verified slab thumbnail from typed inventory
 *   3. Initials / placeholder
 */

import {
  DEFAULT_SLABCLOUD_BASE_URL,
  DEFAULT_SLABCLOUD_COMPANY_CODE,
} from "./slabCloudClient.js";

import {
  normalizeColorName,
  normalizeMaterialName,
  MATERIAL_ALIAS_GROUPS,
} from "../slabInventory/colorProgramMatching.js";

export const TEXTURE_BASE_PATH = "/scdata/textures";
export const TEXTURE_SIZES = Object.freeze(["600", "1024"]);
export const DEFAULT_TEXTURE_SIZE = "600";
export const V2_INVENTORY_PATH = "/api/v2/inventory";
export const V2_PRODUCT_PATH = "/api/v2/product";

// ── URL builders ──────────────────────────────────────────────────────────────

/**
 * Build the v2 inventory endpoint URL.
 * No auth required — this is the same public JSON used by the SlabCloud manager UI.
 *
 * @param {string} [baseUrl]
 * @param {string} [companyCode]
 * @returns {string}
 */
export function buildV2InventoryUrl(
  baseUrl = DEFAULT_SLABCLOUD_BASE_URL,
  companyCode = DEFAULT_SLABCLOUD_COMPANY_CODE
) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const code = String(companyCode).trim();
  return `${base}${V2_INVENTORY_PATH}/${code}?cq_type=&cq_material=`;
}

/**
 * Build the v2 product detail endpoint URL for a specific slug + material.
 *
 * @param {string} baseUrl
 * @param {string} companyCode
 * @param {string} slug        Product slug
 * @param {string} [material]  Material/manufacturer filter
 * @returns {string}
 */
export function buildV2ProductUrl(
  baseUrl = DEFAULT_SLABCLOUD_BASE_URL,
  companyCode = DEFAULT_SLABCLOUD_COMPANY_CODE,
  slug,
  material = ""
) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const code = String(companyCode).trim();
  const s = encodeURIComponent(String(slug || "").trim());
  const m = encodeURIComponent(String(material || "").trim());
  return `${base}${V2_PRODUCT_PATH}/${code}?slug=${s}&cq_type=&cq_material=&mat=${m}`;
}

/**
 * Build a texture image URL from a hash and size.
 *
 * @param {string} baseUrl
 * @param {string} textureHash   The raw texture hash from the v2 row
 * @param {string} [size]        "600" or "1024" (default "600")
 * @returns {string|null}        null if textureHash is empty/null
 */
export function buildTextureUrl(
  baseUrl = DEFAULT_SLABCLOUD_BASE_URL,
  textureHash,
  size = DEFAULT_TEXTURE_SIZE
) {
  if (!textureHash || !String(textureHash).trim()) return null;
  const base = String(baseUrl).replace(/\/+$/, "");
  const sz = TEXTURE_SIZES.includes(String(size)) ? String(size) : DEFAULT_TEXTURE_SIZE;
  const hash = String(textureHash).trim();
  return `${base}${TEXTURE_BASE_PATH}/${sz}/${hash}.jpg`;
}

// ── Row normalization ─────────────────────────────────────────────────────────

/**
 * Known field name candidates for each logical property.
 * v2 responses have been observed with PascalCase and camelCase variants.
 */
const V2_FIELD_ALIASES = {
  colorName:    ["Name",    "name",    "ColorName",  "color_name"],
  material:     ["Material","material","Manufacturer","manufacturer"],
  slug:         ["slug",    "Slug",    "product_slug"],
  texture:      ["texture", "Texture", "textureHash"],
  scColor:      ["scColor", "ScColor", "colorFamily", "color_family"],
  count:        ["count",   "Count",   "qty",         "Qty"],
  slabId:       ["SlabID",  "slabId",  "slab_id",     "id"],
};

function pickField(row, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null) {
      const v = row[key];
      if (typeof v === "string" && v.trim() === "") continue;
      return v;
    }
  }
  return null;
}

/**
 * Normalize a single raw v2 inventory row into a stable diagnostic shape.
 * Pure function — no I/O.
 *
 * WARNING: `source_count` is a SlabCloud display count and is NOT physical
 * inventory authority. slabOS typed slab_inventory is the sole count source.
 *
 * @param {Object} rawRow
 * @param {string} [baseUrl]
 * @returns {Object}
 */
export function normalizeV2Row(rawRow, baseUrl = DEFAULT_SLABCLOUD_BASE_URL) {
  if (!rawRow || typeof rawRow !== "object") return null;

  const colorName   = pickField(rawRow, V2_FIELD_ALIASES.colorName);
  const material    = pickField(rawRow, V2_FIELD_ALIASES.material);
  const slug        = pickField(rawRow, V2_FIELD_ALIASES.slug);
  const textureHash = pickField(rawRow, V2_FIELD_ALIASES.texture);
  const scColor     = pickField(rawRow, V2_FIELD_ALIASES.scColor);
  const count       = pickField(rawRow, V2_FIELD_ALIASES.count);
  const slabId      = pickField(rawRow, V2_FIELD_ALIASES.slabId);

  const normColor    = normalizeColorName(colorName);
  const normMaterial = normalizeMaterialName(material);

  const cleanHash = textureHash ? String(textureHash).trim() : null;
  const hasTexture = Boolean(cleanHash);

  return {
    source_color_name:         colorName    ? String(colorName).trim()    : null,
    source_material_name:      material     ? String(material).trim()     : null,
    normalized_color_name:     normColor    || null,
    normalized_material_name:  normMaterial || null,
    product_slug:              slug         ? String(slug).trim()         : null,
    texture_hash:              cleanHash,
    texture_url_600:           buildTextureUrl(baseUrl, cleanHash, "600"),
    texture_url_1024:          buildTextureUrl(baseUrl, cleanHash, "1024"),
    has_texture:               hasTexture,
    source_count:              count != null ? Number(count) : null,
    // NOTE: source_count is a SlabCloud display count, NOT physical inventory authority.
    source_count_is_display_only: true,
    source_color_family:       scColor      ? String(scColor).trim()      : null,
    source_slab_id:            slabId       ? String(slabId).trim()       : null,
    raw:                       rawRow,
  };
}

/**
 * Normalize an array of raw v2 rows. Skips null results from normalizeV2Row.
 *
 * @param {Array} rawRows
 * @param {string} [baseUrl]
 * @returns {Array}
 */
export function normalizeV2Rows(rawRows, baseUrl = DEFAULT_SLABCLOUD_BASE_URL) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows
    .map((row) => normalizeV2Row(row, baseUrl))
    .filter(Boolean);
}

// ── Diagnostic summary ────────────────────────────────────────────────────────

/**
 * Compute a full diagnostic summary from an array of normalized v2 rows.
 * Returns plain data — no I/O.
 *
 * @param {Array} normalizedRows
 * @param {number} [sampleSize]  Max rows in sample arrays (default 5)
 * @returns {Object}
 */
export function computeDiagnosticSummary(normalizedRows, sampleSize = 5) {
  const rows = Array.isArray(normalizedRows) ? normalizedRows : [];

  const withTexture    = rows.filter((r) => r.has_texture);
  const withoutTexture = rows.filter((r) => !r.has_texture);

  const slugSet      = new Set(rows.map((r) => r.product_slug).filter(Boolean));
  const materialSet  = new Set(rows.map((r) => r.source_material_name).filter(Boolean));
  const colorMatSet  = new Set(
    rows.map((r) => `${r.normalized_color_name}||${r.normalized_material_name}`)
  );

  // Display count sum — CLEARLY LABELED as not physical inventory authority.
  const displayCountSum = rows.reduce((sum, r) => {
    return r.source_count != null ? sum + r.source_count : sum;
  }, 0);

  return {
    total_rows:             rows.length,
    distinct_slugs:         slugSet.size,
    distinct_color_material_groups: colorMatSet.size,
    rows_with_texture:      withTexture.length,
    rows_without_texture:   withoutTexture.length,
    texture_coverage_pct:   rows.length > 0
      ? Math.round((withTexture.length / rows.length) * 1000) / 10
      : 0,
    distinct_materials:     materialSet.size,
    sample_materials:       [...materialSet].slice(0, sampleSize),
    sample_rows_with_texture: withTexture.slice(0, sampleSize).map((r) => ({
      color_name:     r.source_color_name,
      material:       r.source_material_name,
      slug:           r.product_slug,
      texture_hash:   r.texture_hash,
      texture_url_600: r.texture_url_600,
    })),
    sample_rows_without_texture: withoutTexture.slice(0, sampleSize).map((r) => ({
      color_name:  r.source_color_name,
      material:    r.source_material_name,
      slug:        r.product_slug,
    })),
    // This sum comes from SlabCloud display counts, NOT from typed slab_inventory.
    // Do NOT use as inventory count authority.
    slabcloud_display_count_sum_NOT_inventory_authority: displayCountSum,
  };
}

// ── Duplicate detection ───────────────────────────────────────────────────────

/**
 * Detect duplicate product slugs and duplicate color/material pairs in
 * an array of normalized v2 rows.
 *
 * @param {Array} normalizedRows
 * @param {number} [sampleSize]
 * @returns {{ duplicateSlugs: Object, duplicateColorMaterials: Object }}
 */
export function detectDuplicates(normalizedRows, sampleSize = 5) {
  const rows = Array.isArray(normalizedRows) ? normalizedRows : [];

  // Slugs
  const slugMap = new Map();
  for (const r of rows) {
    if (!r.product_slug) continue;
    const existing = slugMap.get(r.product_slug) ?? [];
    existing.push(r);
    slugMap.set(r.product_slug, existing);
  }
  const dupSlugs = [...slugMap.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([slug, arr]) => ({
      slug,
      count: arr.length,
      sample_rows: arr.slice(0, sampleSize).map((r) => ({
        color_name: r.source_color_name,
        material:   r.source_material_name,
      })),
    }));

  // Normalized color + material pairs
  const cmMap = new Map();
  for (const r of rows) {
    const key = `${r.normalized_color_name}||${r.normalized_material_name}`;
    const existing = cmMap.get(key) ?? [];
    existing.push(r);
    cmMap.set(key, existing);
  }
  const dupCM = [...cmMap.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([key, arr]) => ({
      normalized_key: key,
      count: arr.length,
      sample_rows: arr.slice(0, sampleSize).map((r) => ({
        color_name: r.source_color_name,
        material:   r.source_material_name,
        slug:       r.product_slug,
      })),
    }));

  return {
    duplicateSlugs: {
      total_affected_slugs:  dupSlugs.length,
      sample:                dupSlugs.slice(0, sampleSize),
    },
    duplicateColorMaterials: {
      total_affected_groups: dupCM.length,
      sample:                dupCM.slice(0, sampleSize),
    },
  };
}

// ── Catalog comparison ────────────────────────────────────────────────────────

/**
 * Check whether two material names are compatible (same brand / alias group).
 * Uses MATERIAL_ALIAS_GROUPS from colorProgramMatching.
 *
 * @param {string} a  Pre-normalized material name
 * @param {string} b  Pre-normalized material name
 * @returns {boolean}
 */
export function areMaterialsCompatible(a, b) {
  const na = String(a || "").toLowerCase().trim();
  const nb = String(b || "").toLowerCase().trim();
  if (!na || !nb) return true; // empty matches anything
  if (na === nb) return true;
  for (const group of MATERIAL_ALIAS_GROUPS) {
    if (group.includes(na) && group.includes(nb)) return true;
  }
  return false;
}

/**
 * Build a lookup key for a catalog item (for O(1) comparison).
 * @param {string} normColor
 * @param {string} normMaterial
 * @returns {string}
 */
export function buildCatalogKey(normColor, normMaterial) {
  return `${normColor || ""}||${normMaterial || ""}`;
}

/**
 * Compare normalized v2 rows with:
 *   - typedColorGroups: array of { normalized_color_name, normalized_material_name }
 *   - elite100Items:    array of { normalized_color_name, normalized_material_name, id }
 *   - aliases:          array of { normalized_alias_color_name, normalized_alias_material_name,
 *                                  catalog_item_id, is_active }
 *
 * All read-only. Returns comparison report.
 *
 * @param {Array} normalizedRows
 * @param {Array} typedColorGroups
 * @param {Array} elite100Items
 * @param {Array} [aliases]
 * @param {number} [sampleSize]
 * @returns {Object}
 */
export function compareWithCatalog(
  normalizedRows,
  typedColorGroups,
  elite100Items,
  aliases = [],
  sampleSize = 5
) {
  const rows = Array.isArray(normalizedRows) ? normalizedRows : [];

  // Build lookup sets for typed inventory
  const typedExactSet = new Set(
    (typedColorGroups || []).map((g) =>
      buildCatalogKey(g.normalized_color_name, g.normalized_material_name)
    )
  );

  // Build lookup map for Elite 100 exact (by key → item id)
  const e100ExactMap = new Map(
    (elite100Items || []).map((item) => [
      buildCatalogKey(item.normalized_color_name, item.normalized_material_name),
      item,
    ])
  );

  // Build alias lookup: normalized alias → catalog_item_id
  const aliasMap = new Map();
  for (const alias of (aliases || [])) {
    if (alias.is_active === false) continue;
    const key = buildCatalogKey(
      alias.normalized_alias_color_name,
      alias.normalized_alias_material_name
    );
    if (!aliasMap.has(key)) aliasMap.set(key, alias.catalog_item_id);
  }

  // Build id set for Elite 100 items (used to check alias resolution)
  const e100IdSet = new Set((elite100Items || []).map((item) => item.id));

  let matchedTypedExact      = 0;
  let matchedTypedMaterialAlias = 0;
  let matchedE100Exact       = 0;
  let matchedE100Alias       = 0;
  const unmatchedTyped       = [];
  const e100WithTexture      = new Set();
  const e100WithoutTexture   = new Set();
  const nonStockWithTexture  = [];
  const nonStockWithoutTexture = [];

  for (const row of rows) {
    const key = buildCatalogKey(row.normalized_color_name, row.normalized_material_name);

    // Match typed inventory — exact
    const matchesTypedExact = typedExactSet.has(key);
    if (matchesTypedExact) {
      matchedTypedExact++;
    } else {
      // Try material alias match against typed inventory
      let aliasTypedMatch = false;
      for (const tg of (typedColorGroups || [])) {
        if (
          tg.normalized_color_name === row.normalized_color_name &&
          areMaterialsCompatible(tg.normalized_material_name, row.normalized_material_name)
        ) {
          aliasTypedMatch = true;
          break;
        }
      }
      if (aliasTypedMatch) {
        matchedTypedMaterialAlias++;
      } else {
        unmatchedTyped.push(row);
      }
    }

    // Match Elite 100 — exact
    const e100ExactMatch = e100ExactMap.get(key);
    if (e100ExactMatch) {
      matchedE100Exact++;
      if (row.has_texture) {
        e100WithTexture.add(e100ExactMatch.id);
      } else {
        e100WithoutTexture.add(e100ExactMatch.id);
      }
    } else {
      // Try alias match
      const aliasItemId = aliasMap.get(key);
      if (aliasItemId && e100IdSet.has(aliasItemId)) {
        matchedE100Alias++;
        if (row.has_texture) {
          e100WithTexture.add(aliasItemId);
        } else {
          e100WithoutTexture.add(aliasItemId);
        }
      } else {
        // Non-stock
        if (row.has_texture) {
          nonStockWithTexture.push(row);
        } else {
          nonStockWithoutTexture.push(row);
        }
      }
    }
  }

  // Elite 100 items without any v2 texture match
  const e100TotalItems = (elite100Items || []).length;
  const e100ItemsWithTexture    = e100WithTexture.size;
  const e100ItemsWithoutTexture = e100TotalItems - e100ItemsWithTexture;

  const sampleUnmatchedE100 = (elite100Items || [])
    .filter((item) => !e100WithTexture.has(item.id) && !e100WithoutTexture.has(item.id))
    .slice(0, sampleSize)
    .map((item) => ({
      color_name:   item.color_name ?? item.normalized_color_name,
      material:     item.material_name ?? item.normalized_material_name,
      price_group:  item.price_group,
    }));

  return {
    typed_color_groups_count:     (typedColorGroups || []).length,
    elite100_item_count:          e100TotalItems,
    v2_rows_matching_typed_exact: matchedTypedExact,
    v2_rows_matching_typed_material_alias: matchedTypedMaterialAlias,
    v2_rows_unmatched_to_typed:   unmatchedTyped.length,
    v2_rows_matching_e100_exact:  matchedE100Exact,
    v2_rows_matching_e100_alias:  matchedE100Alias,
    e100_items_with_texture_candidate: e100ItemsWithTexture,
    e100_items_without_texture_candidate: e100ItemsWithoutTexture,
    non_stock_rows_with_texture:  nonStockWithTexture.length,
    non_stock_rows_without_texture: nonStockWithoutTexture.length,
    sample_unmatched_e100_items:  sampleUnmatchedE100,
    sample_v2_rows_unmatched_typed: unmatchedTyped.slice(0, sampleSize).map((r) => ({
      color_name: r.source_color_name,
      material:   r.source_material_name,
      slug:       r.product_slug,
      has_texture: r.has_texture,
    })),
  };
}

/**
 * Extract product-level fields from a v2 product endpoint response.
 * Used during optional product sampling.
 *
 * @param {Object} rawProductResponse
 * @param {string} [baseUrl]
 * @returns {Object}
 */
export function normalizeV2ProductResponse(rawProductResponse, baseUrl = DEFAULT_SLABCLOUD_BASE_URL) {
  if (!rawProductResponse || typeof rawProductResponse !== "object") return null;

  const raw = rawProductResponse;

  const colorName   = pickField(raw, V2_FIELD_ALIASES.colorName);
  const material    = pickField(raw, V2_FIELD_ALIASES.material);
  const textureHash = pickField(raw, V2_FIELD_ALIASES.texture);
  const slug        = pickField(raw, V2_FIELD_ALIASES.slug);

  const palette = Array.isArray(raw.palette) ? raw.palette : null;
  const slabs   = Array.isArray(raw.slabs)   ? raw.slabs   : null;

  const cleanHash = textureHash ? String(textureHash).trim() : null;

  return {
    color_name:     colorName  ? String(colorName).trim()  : null,
    material:       material   ? String(material).trim()   : null,
    slug:           slug       ? String(slug).trim()       : null,
    texture_hash:   cleanHash,
    texture_url_600:  buildTextureUrl(baseUrl, cleanHash, "600"),
    texture_url_1024: buildTextureUrl(baseUrl, cleanHash, "1024"),
    palette_count:  palette ? palette.length : null,
    slab_count_in_product_response: slabs ? slabs.length : null,
    // NOTE: slab count from product endpoint is also a display count, not inventory authority.
    sample_slab_keys: slabs && slabs.length > 0 ? Object.keys(slabs[0]).slice(0, 20) : [],
    top_level_keys:   Object.keys(raw).slice(0, 30),
    raw_truncated:    JSON.stringify(raw).slice(0, 400),
  };
}
