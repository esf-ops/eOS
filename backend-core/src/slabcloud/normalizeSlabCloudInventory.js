/**
 * normalizeSlabCloudInventory — pure helpers for the SlabCloud inventory POC.
 *
 * SCOPE / SAFETY:
 *   - Pure functions only: no network, no filesystem, no Supabase, no secrets.
 *   - Normalizes raw SlabCloud JSON records into a stable internal shape.
 *   - Converts Width_Actual / Length_Actual (meters) to inches.
 *   - Preserves raw values where the meaning is uncertain (UsableA / UsableD).
 *   - Builds *guessed* image URLs only; it never downloads anything.
 *
 * This module is intentionally read-only and dumb about external systems so it
 * is trivially testable and safe to import anywhere.
 */

export const SLABCLOUD_EXTERNAL_SOURCE = "slabcloud";

// 1 meter = 39.3701 inches (matches the screen-observed conversion examples).
export const METERS_TO_INCHES = 39.3701;

/**
 * Coerce an arbitrary value (string | number | null) into a finite number.
 * Returns null for empty/invalid input rather than NaN, so callers can branch.
 */
export function toFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n, decimals) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Trim a value to a non-empty string, or null. Keeps the normalized record free
 * of empty strings and stray whitespace.
 */
export function cleanString(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Convert meters → inches. Returns null for missing/invalid input.
 * Default rounding is 2 decimals, which matches the observed UI values
 * (2.07475210775013 m → 81.68 in, 3.52267981545561 m → 138.69 in).
 */
export function metersToInches(meters, { decimals = 2 } = {}) {
  const n = toFiniteNumber(meters);
  if (n === null) return null;
  return roundTo(n * METERS_TO_INCHES, decimals);
}

/**
 * Build *guessed* image URLs from the observed pattern:
 *   /slabs/{companyCode}/{SlabID}.jpg
 *   /slabs/{companyCode}/{lowercase-slabid}_thumb.jpg
 *
 * SlabCloud's real image scheme uses the SAME SlabID UUID but LOWERCASED in the
 * URL path (confirmed via manual browser/network inspection 2026-06-04 after the
 * initial uppercase guess returned 404). Example:
 *   SlabID 437D9CA4-76B0-453B-BDE9-9007FFC44C5A
 *   → /slabs/kbyd/437d9ca4-76b0-453b-bde9-9007ffc44c5a.jpg
 *
 * Only the URL path segment is lowercased — the slab's identity (external_slab_id)
 * is preserved unchanged elsewhere. Returns nulls when companyCode or slabId is
 * missing. These are still derived URLs; verification is a separate explicit step.
 */
export function buildImageUrlGuesses({ baseUrl = "https://slabcloud.com", companyCode, slabId } = {}) {
  const base = String(baseUrl || "https://slabcloud.com").replace(/\/+$/, "");
  const code = cleanString(companyCode);
  const id = cleanString(slabId);
  if (!code || !id) {
    return { image_url_guess: null, thumbnail_url_guess: null };
  }
  // Lowercase ONLY the URL path segment; identity (external_slab_id) is untouched.
  const idLower = id.toLowerCase();
  return {
    image_url_guess: `${base}/slabs/${code}/${idLower}.jpg`,
    thumbnail_url_guess: `${base}/slabs/${code}/${idLower}_thumb.jpg`,
  };
}

/**
 * Normalize a single raw SlabCloud record into the internal POC shape.
 *
 * Unknown/missing fields normalize to null instead of throwing, so a malformed
 * upstream payload never crashes the dry run.
 */
export function normalizeSlabRecord(
  raw,
  { baseUrl = "https://slabcloud.com", companyCode = "kbyd" } = {}
) {
  const record = raw && typeof raw === "object" ? raw : {};
  const slabId = cleanString(record.SlabID);
  const code = cleanString(companyCode);

  const widthM = toFiniteNumber(record.Width_Actual);
  const lengthM = toFiniteNumber(record.Length_Actual);

  const { image_url_guess, thumbnail_url_guess } = buildImageUrlGuesses({
    baseUrl,
    companyCode: code,
    slabId,
  });

  return {
    external_source: SLABCLOUD_EXTERNAL_SOURCE,
    external_company_code: code,
    external_slab_id: slabId,
    inventory_id: cleanString(record.InventoryID),
    color_name: cleanString(record.Name),
    material_name: cleanString(record.Material),
    distributor: cleanString(record.Distributor),
    price_group: cleanString(record.Price_Group),
    thickness_nominal: cleanString(record.Thickness_Nominal),
    rack: cleanString(record.Rack),
    lot: cleanString(record.Lot),
    count_for_color: toFiniteNumber(record.count),

    // Dimensions: meters are authoritative upstream; inches are a derived
    // convenience. Do NOT use these for quote pricing in this POC.
    width_actual_m: widthM,
    length_actual_m: lengthM,
    width_actual_in: metersToInches(widthM),
    length_actual_in: metersToInches(lengthM),

    // Uncertain semantics — preserve raw strings, do not interpret yet.
    usable_a_raw: cleanString(record.UsableA),
    usable_d_raw: cleanString(record.UsableD),

    image_url_guess,
    thumbnail_url_guess,

    // Always keep the untouched original for later mapping/debugging.
    raw: record,
  };
}

/**
 * Normalize an array of raw records. Non-arrays return [].
 */
export function normalizeSlabRecords(rawRecords, opts) {
  if (!Array.isArray(rawRecords)) return [];
  return rawRecords.map((r) => normalizeSlabRecord(r, opts));
}

/**
 * Extract distinct color names (record.Name) from a raw summary list, in first-
 * seen order. Used to drive optional detail fetches.
 */
export function extractDistinctColorNames(rawRecords) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(rawRecords)) return out;
  for (const r of rawRecords) {
    const name = cleanString(r && typeof r === "object" ? r.Name : null);
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Aggregate counts for the summary file. Pure and defensive.
 */
export function summarizeInventory(
  normalizedRecords,
  { warnings = [], materials = [] } = {}
) {
  const records = Array.isArray(normalizedRecords) ? normalizedRecords : [];
  const colorSet = new Set();
  const materialSet = new Set();
  const distributorSet = new Set();
  let summedSlabCount = 0;
  let recordsMissingDimensions = 0;
  let recordsMissingSlabId = 0;

  for (const r of records) {
    if (r.color_name) colorSet.add(r.color_name);
    if (r.material_name) materialSet.add(r.material_name);
    if (r.distributor) distributorSet.add(r.distributor);
    if (Number.isFinite(r.count_for_color)) summedSlabCount += r.count_for_color;
    if (r.width_actual_in === null || r.length_actual_in === null) {
      recordsMissingDimensions += 1;
    }
    if (!r.external_slab_id) recordsMissingSlabId += 1;
  }

  return {
    slabRecordCount: records.length,
    distinctColorCount: colorSet.size,
    distinctMaterialCount: materialSet.size,
    distinctDistributorCount: distributorSet.size,
    materialsEndpointCount: Array.isArray(materials) ? materials.length : 0,
    summedSlabCount,
    recordsMissingDimensions,
    recordsMissingSlabId,
    warningCount: Array.isArray(warnings) ? warnings.length : 0,
  };
}
