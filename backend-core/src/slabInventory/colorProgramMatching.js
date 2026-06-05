/**
 * Color Program Matching — pure, dependency-free helpers for classifying
 * SlabCloud color groups against the Elite 100 catalog.
 *
 * Matching order:
 *   1. exact  — normalized color name match + exact or empty material match
 *   2. alias  — normalized color name match + compatible material (known alias group)
 *   3. fuzzy  — color similarity >= threshold + compatible material
 *   4. none   — no match found → Non-Stock candidate
 *
 * Safety rules:
 *   - Low-confidence fuzzy matches MUST NOT silently classify as Elite 100.
 *     All fuzzy results return review_status = "needs_review".
 *   - Exact and alias matches return review_status = "approved".
 *   - Unmatched (none) colors are Non-Stock candidates.
 *   - No network, no Supabase, no side effects. All functions are pure.
 *
 * Screenshot parsing rule (for fixture validation):
 *   Each Elite 100 list item is "Color Name - Manufacturer/Brand".
 *   color_name is everything BEFORE the final " - " delimiter.
 *   material_name is everything AFTER. Do NOT reverse these fields.
 */

/** Active ESF price groups in canonical display order. Group G is NOT included. */
export const ACTIVE_PRICE_GROUPS = Object.freeze(["Promo", "A", "B", "C", "D", "E", "F"]);

/**
 * Material name alias groups. Any two names within the same sub-array are
 * considered compatible (same brand, different naming convention).
 * All values stored pre-lowercased for efficient comparison.
 *
 * "ESF" and "ESF Quartz" are the same brand (Elite Stone Fabrication).
 * "Aggranite" and "Agranite" are the same brand (alternate spelling in source data).
 */
export const MATERIAL_ALIAS_GROUPS = Object.freeze([
  Object.freeze(["esf", "esf quartz"]),
  Object.freeze(["aggranite", "agranite"]),
]);

/**
 * Normalize a color name for comparison (not for display or key generation).
 * Lowercases, trims, collapses whitespace, normalizes apostrophes, & → and.
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function normalizeColorName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[''`´]/g, "'")
    .replace(/\s*&\s*/g, " and ")
    .replace(/[^a-z0-9 '.,\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a material/brand name for comparison (not for display or key generation).
 * Lowercases, trims, removes non-alphanum except spaces.
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function normalizeMaterialName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Internal slug helper — mirrors makeColorKey in slabInventoryApi.js. */
function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a stable, URL-safe color_key from (colorName, materialName, priceGroup).
 *
 * Mirrors makeColorKey() in slabInventoryApi.js — same algorithm, same output
 * for the same raw inputs. Use this to generate color_key values for catalog items.
 * Not reversible (slug only). Not a DB ID.
 *
 * @param {string|null|undefined} colorName
 * @param {string|null|undefined} materialName
 * @param {string|null|undefined} priceGroup
 * @returns {string}
 */
export function buildColorKey(colorName, materialName, priceGroup = "") {
  return [slugify(colorName), slugify(materialName), slugify(priceGroup)]
    .map((s) => s || "unknown")
    .join("--");
}

/**
 * Return true if two material names are considered compatible, accounting
 * for known alias groups (e.g. "ESF" ≡ "ESF Quartz").
 * If either value is empty/unknown, returns true (don't block on unknown material).
 *
 * @param {string|null|undefined} mat1
 * @param {string|null|undefined} mat2
 * @returns {boolean}
 */
export function materialsCompatible(mat1, mat2) {
  const m1 = normalizeMaterialName(mat1 || "");
  const m2 = normalizeMaterialName(mat2 || "");
  if (!m1 || !m2) return true;
  if (m1 === m2) return true;
  for (const group of MATERIAL_ALIAS_GROUPS) {
    if (group.includes(m1) && group.includes(m2)) return true;
  }
  return false;
}

/**
 * Compute Levenshtein edit distance between two strings.
 * Pure O(m·n) time, O(n) space implementation. No dependencies.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Single row rolling array
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let diagPrev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] =
        a[i - 1] === b[j - 1]
          ? diagPrev
          : 1 + Math.min(diagPrev, row[j], row[j - 1]);
      diagPrev = tmp;
    }
  }
  return row[n];
}

/**
 * Similarity score in [0, 1] based on Levenshtein distance.
 * 1.0 = identical, 0.0 = completely different.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarityScore(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

/** Minimum color similarity for a fuzzy candidate to be returned. */
export const DEFAULT_FUZZY_THRESHOLD = 0.75;

/**
 * Minimum similarity for a fuzzy match to be considered "high-confidence".
 * Even high-confidence fuzzy matches still require human review — they are
 * never auto-approved as Elite 100.
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.92;

/**
 * Compare one source color against one catalog item.
 *
 * Returns null if there is no meaningful match within the threshold.
 *
 * @param {{ color_name: string, material_name?: string|null }} source
 * @param {{ color_name: string, material_name: string }} catalogItem
 * @param {number} [fuzzyThreshold]
 * @returns {{ method: 'exact'|'alias'|'fuzzy', confidence: number }|null}
 */
export function compareCatalogToSourceColor(
  source,
  catalogItem,
  fuzzyThreshold = DEFAULT_FUZZY_THRESHOLD
) {
  const srcColor = normalizeColorName(source.color_name);
  const srcMat = normalizeMaterialName(source.material_name || "");
  const catColor = normalizeColorName(catalogItem.color_name);
  const catMat = normalizeMaterialName(catalogItem.material_name || "");

  if (srcColor === catColor) {
    // Exact normalized color name match
    const srcMatNorm = srcMat;
    const catMatNorm = catMat;
    if (srcMatNorm === catMatNorm || (!srcMatNorm && !catMatNorm)) {
      return { method: "exact", confidence: 1.0 };
    }
    if (materialsCompatible(srcMat, catMat)) {
      // Color exact but material is a known alias — "alias" step
      return { method: "alias", confidence: 0.98 };
    }
    // Same color name, incompatible material — not a match for this item
    return null;
  }

  // Fuzzy color similarity + compatible material
  const colorSim = similarityScore(srcColor, catColor);
  if (colorSim >= fuzzyThreshold && materialsCompatible(srcMat, catMat)) {
    return { method: "fuzzy", confidence: colorSim };
  }

  return null;
}

/**
 * Match a source color group to the best catalog item.
 *
 * Matching priority: exact > alias > fuzzy (highest confidence wins within tier).
 *
 * SAFETY: All fuzzy matches return review_status = "needs_review" regardless
 * of confidence score. They MUST NOT silently classify as Elite 100.
 *
 * @param {{ color_name: string, material_name?: string|null, source_price_group?: string|null }} source
 * @param {Array<{ color_name: string, material_name: string, price_group: string }>} catalogItems
 * @param {{ fuzzyThreshold?: number }} [opts]
 * @returns {{ match: object|null, method: string, confidence: number, review_status: string }}
 */
export function matchSourceColorToCatalog(source, catalogItems = [], opts = {}) {
  const fuzzyThreshold = opts.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;
  const METHOD_RANK = { exact: 2, alias: 1, fuzzy: 0 };

  let bestMatch = null;
  let bestResult = null;

  for (const item of Array.isArray(catalogItems) ? catalogItems : []) {
    const result = compareCatalogToSourceColor(source, item, fuzzyThreshold);
    if (!result) continue;

    const prevRank = bestResult ? (METHOD_RANK[bestResult.method] ?? -1) : -1;
    const thisRank = METHOD_RANK[result.method] ?? -1;

    if (
      !bestResult ||
      thisRank > prevRank ||
      (thisRank === prevRank && result.confidence > bestResult.confidence)
    ) {
      bestMatch = item;
      bestResult = result;
    }
  }

  if (!bestMatch || !bestResult) {
    return { match: null, method: "none", confidence: 0, review_status: "needs_review" };
  }

  // exact and alias are auto-approvable (known match). fuzzy always needs human review.
  const reviewStatus =
    bestResult.method === "exact" || bestResult.method === "alias"
      ? "approved"
      : "needs_review";

  return {
    match: bestMatch,
    method: bestResult.method,
    confidence: bestResult.confidence,
    review_status: reviewStatus,
  };
}

/**
 * Run matching for a full set of source color groups against catalog items.
 * Unmatched colors (method=none) are Non-Stock candidates.
 *
 * @param {Array<{ color_name: string, material_name?: string|null }>} sourceColors
 * @param {Array<object>} catalogItems
 * @param {{ fuzzyThreshold?: number }} [opts]
 * @returns {{ total: number, exact: number, alias: number, fuzzy: number, none: number, results: Array }}
 */
export function matchAllSourceColors(sourceColors, catalogItems = [], opts = {}) {
  const results = [];
  let exactCount = 0;
  let aliasCount = 0;
  let fuzzyCount = 0;
  let noneCount = 0;

  for (const source of Array.isArray(sourceColors) ? sourceColors : []) {
    const r = matchSourceColorToCatalog(source, catalogItems, opts);
    if (r.method === "exact") exactCount += 1;
    else if (r.method === "alias") aliasCount += 1;
    else if (r.method === "fuzzy") fuzzyCount += 1;
    else noneCount += 1;
    results.push({ source, ...r });
  }

  return {
    total: results.length,
    exact: exactCount,
    alias: aliasCount,
    fuzzy: fuzzyCount,
    none: noneCount,
    results,
  };
}
