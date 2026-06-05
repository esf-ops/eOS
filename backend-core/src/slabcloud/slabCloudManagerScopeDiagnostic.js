/**
 * slabCloudManagerScopeDiagnostic — pure helpers for the manager-scope diagnostic.
 *
 * All functions here are pure (no network, no filesystem, no Supabase).
 * Exported so the test suite can exercise them without I/O.
 *
 * Background / discovery:
 *   The ESF public manager URL is https://slabcloud.com/inventory/esf/manager.php
 *   but the browser console on that page logs:
 *     company  kbyd           ← API company code is NOT "esf"
 *     edges    true
 *     showZoom true
 *     filterOpen true
 *     measure  true
 *
 *   Image assets also use the kbyd company code:
 *     https://slabcloud.com/slabs/kbyd/{lowercase-uuid}(_thumb)?.jpg
 *
 *   The current slabOS sync fetches type=Slab only. The manager UI supports:
 *     Any Type / Full Slabs / Remnants / Min Length / Min Width
 *   Missing inventory is likely due to type/filter scope, not a kbyd→esf swap.
 *
 * READ ONLY. No writes, no mutations, no auth headers.
 */

import { DEFAULT_SLABCLOUD_BASE_URL, DEFAULT_SLABCLOUD_COMPANY_CODE } from "./slabCloudClient.js";

// ── Endpoint variant list ─────────────────────────────────────────────────────

/**
 * Generate the full list of endpoint variants to probe for a given company code.
 * Pure function — no network I/O.
 *
 * @param {string} [baseUrl]      Defaults to DEFAULT_SLABCLOUD_BASE_URL
 * @param {string} [companyCode]  Defaults to DEFAULT_SLABCLOUD_COMPANY_CODE
 * @returns {Array<{label: string, url: string, kind: "materials"|"slabs", type: string|null}>}
 */
export function buildEndpointVariants(
  baseUrl = DEFAULT_SLABCLOUD_BASE_URL,
  companyCode = DEFAULT_SLABCLOUD_COMPANY_CODE
) {
  const base = String(baseUrl || DEFAULT_SLABCLOUD_BASE_URL).replace(/\/+$/, "");
  const code = encodeURIComponent(String(companyCode || DEFAULT_SLABCLOUD_COMPANY_CODE));

  return [
    // ── Materials ──────────────────────────────────────────────────────────
    {
      label: "materials",
      url: `${base}/api/materials/${code}`,
      kind: "materials",
      type: null,
      edges: null,
    },
    // ── Slab summary — explicit types ──────────────────────────────────────
    {
      label: "slabs?type=Slab&edges=true",
      url: `${base}/api/slabs/${code}?type=Slab&edges=true`,
      kind: "slabs",
      type: "Slab",
      edges: true,
    },
    {
      label: "slabs?type=Remnant&edges=true",
      url: `${base}/api/slabs/${code}?type=Remnant&edges=true`,
      kind: "slabs",
      type: "Remnant",
      edges: true,
    },
    {
      label: "slabs?type=Full%20Slab&edges=true",
      url: `${base}/api/slabs/${code}?type=Full%20Slab&edges=true`,
      kind: "slabs",
      type: "Full Slab",
      edges: true,
    },
    {
      label: "slabs?type=Full%20Slabs&edges=true",
      url: `${base}/api/slabs/${code}?type=Full%20Slabs&edges=true`,
      kind: "slabs",
      type: "Full Slabs",
      edges: true,
    },
    {
      label: "slabs?type=All&edges=true",
      url: `${base}/api/slabs/${code}?type=All&edges=true`,
      kind: "slabs",
      type: "All",
      edges: true,
    },
    // ── Slab summary — no explicit type (server default) ───────────────────
    {
      label: "slabs?edges=true",
      url: `${base}/api/slabs/${code}?edges=true`,
      kind: "slabs",
      type: null,
      edges: true,
    },
    {
      label: "slabs (no params)",
      url: `${base}/api/slabs/${code}`,
      kind: "slabs",
      type: null,
      edges: null,
    },
  ];
}

// ── HAR image UUID extraction ─────────────────────────────────────────────────

/**
 * RegExp to extract lowercase UUID slugs from SlabCloud image URLs.
 * Matches both:
 *   /slabs/{company}/{uuid}.jpg
 *   /slabs/{company}/{uuid}_thumb.jpg
 * Case-insensitive on the capture so we can normalise to lowercase.
 */
const HAR_UUID_RE = /\/slabs\/[^/\s"']+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_thumb)?\.jpg/gi;

/**
 * Parse a HAR file (as string or pre-parsed JSON/object) and extract all unique
 * slab image UUIDs.  Comparison is always case-insensitive (normalised to lower).
 *
 * @param {string|object} harContent  Raw JSON text, parsed HAR object, or any string
 * @returns {Set<string>} Set of lowercase UUID strings
 */
export function extractHarImageUuids(harContent) {
  const text =
    typeof harContent === "string" ? harContent : JSON.stringify(harContent ?? "");
  const uuids = new Set();
  HAR_UUID_RE.lastIndex = 0;
  let m;
  while ((m = HAR_UUID_RE.exec(text)) !== null) {
    uuids.add(m[1].toLowerCase());
  }
  return uuids;
}

// ── UUID set comparison ───────────────────────────────────────────────────────

/**
 * Compare an endpoint's collected SlabID set against HAR image UUIDs.
 * All comparisons are case-insensitive (both sides lowercased).
 *
 * @param {Iterable<string>} endpointIds  SlabIDs seen across endpoint rows
 * @param {Iterable<string>} harIds       UUIDs extracted from a HAR file
 * @returns {object} Overlap statistics
 */
export function compareUuidSets(endpointIds, harIds) {
  const endSet = new Set([...endpointIds].map((id) => id.toLowerCase()));
  const harSet = new Set([...harIds].map((id) => id.toLowerCase()));

  const inBoth = [...endSet].filter((id) => harSet.has(id));
  const harMissingFromEndpoint = [...harSet].filter((id) => !endSet.has(id));
  const endpointNotInHar = [...endSet].filter((id) => !harSet.has(id));

  return {
    endpoint_id_count: endSet.size,
    har_id_count: harSet.size,
    endpoint_ids_in_har_count: inBoth.length,
    har_ids_missing_from_endpoint_count: harMissingFromEndpoint.length,
    har_ids_missing_from_endpoint_sample: harMissingFromEndpoint.slice(0, 10),
    endpoint_ids_not_in_har_count: endpointNotInHar.length,
    endpoint_ids_not_in_har_sample: endpointNotInHar.slice(0, 10),
  };
}

// ── Row analysis ──────────────────────────────────────────────────────────────

/** Fields we specifically report presence/absence of. */
const INTERESTING_FIELDS = [
  "count",
  "Price_Group",
  "Rack",
  "Thickness_Nominal",
  "Width_Actual",
  "Length_Actual",
  "SlabID",
  "InventoryID",
  "Image",
  "image",
  "Photo",
  "photo",
  "Texture",
  "texture",
  "Thumbnail",
  "thumbnail",
];

/**
 * Analyse an array of rows returned by a slab endpoint.
 * Pure — no I/O.
 *
 * @param {Array<object>} rows
 * @returns {object} Analysis summary
 */
export function analyzeEndpointRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      row_count: 0,
      distinct_slab_id_count: 0,
      distinct_name_count: 0,
      distinct_material_count: 0,
      sample_names: [],
      sample_slab_ids: [],
      fields_present: {},
    };
  }

  const slabIds = new Set();
  const names = new Set();
  const materials = new Set();
  const fieldsPresent = {};

  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    if (row.SlabID) slabIds.add(String(row.SlabID).toLowerCase());
    if (row.Name) names.add(String(row.Name));
    if (row.Material) materials.add(String(row.Material));

    for (const field of INTERESTING_FIELDS) {
      if (!(field in fieldsPresent)) {
        fieldsPresent[field] = Object.prototype.hasOwnProperty.call(row, field);
      }
    }
  }

  return {
    row_count: rows.length,
    distinct_slab_id_count: slabIds.size,
    distinct_name_count: names.size,
    distinct_material_count: materials.size,
    sample_names: [...names].slice(0, 8),
    sample_slab_ids: [...slabIds].slice(0, 5),
    fields_present: fieldsPresent,
  };
}

// ── Detail URL builder ────────────────────────────────────────────────────────

/**
 * Build a per-name detail URL reusing the same type/edges as the summary variant.
 * Pure — no I/O.
 *
 * @param {string} baseUrl
 * @param {string} companyCode
 * @param {string} name         Color/Name value
 * @param {string|null} type    e.g. "Slab", "Remnant", null
 * @returns {string}
 */
export function generateDetailVariantUrl(baseUrl, companyCode, name, type) {
  const base = String(baseUrl || DEFAULT_SLABCLOUD_BASE_URL).replace(/\/+$/, "");
  const code = encodeURIComponent(String(companyCode || DEFAULT_SLABCLOUD_COMPANY_CODE));
  const params = new URLSearchParams();
  params.set("name", name);
  if (type) params.set("type", type);
  params.set("edges", "true");
  return `${base}/api/slabs/${code}?${params.toString()}`;
}

// ── HTML script-tag extraction ────────────────────────────────────────────────

/**
 * Extract <script src="..."> URLs from an HTML string.
 * Pure — no I/O.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function extractScriptUrls(html) {
  if (!html || typeof html !== "string") return [];
  const re = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const urls = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

/**
 * Extract any embedded JS-style config strings (e.g. company: "kbyd") from HTML/JS.
 * Pure — no I/O.  Returns raw matched snippets for manual inspection.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractEmbeddedConfigSnippets(text) {
  if (!text || typeof text !== "string") return [];
  // Look for key: value patterns around known config keys
  const keys = ["company", "edges", "showZoom", "filterOpen", "measure", "infoFields"];
  const snippets = [];
  for (const key of keys) {
    const re = new RegExp(`['"]?${key}['"]?\\s*[:=]\\s*[^,;\\n\\r]{1,80}`, "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      const snippet = m[0].trim();
      if (!snippets.includes(snippet)) snippets.push(snippet);
      if (snippets.length >= 40) return snippets; // safety cap
    }
  }
  return snippets;
}

// ── Supabase comparison (read-only helpers) ───────────────────────────────────

/**
 * Build a Supabase comparison result from previously-fetched ID sets.
 * Pure — no I/O.
 *
 * @param {Iterable<string>} harIds         UUIDs from HAR
 * @param {Iterable<string>} dbSlabIds      external_slab_id values from slab_inventory
 * @param {Iterable<string>} dbImageIds     external_slab_id values from slab_images
 * @returns {object}
 */
export function compareHarToSupabase(harIds, dbSlabIds, dbImageIds) {
  const harSet = new Set([...harIds].map((id) => id.toLowerCase()));
  const invSet = new Set([...dbSlabIds].map((id) => id.toLowerCase()));
  const imgSet = new Set([...dbImageIds].map((id) => id.toLowerCase()));

  const harMissingFromInv = [...harSet].filter((id) => !invSet.has(id));
  const invNotInHar = [...invSet].filter((id) => !harSet.has(id));
  const harMissingFromImg = [...harSet].filter((id) => !imgSet.has(id));

  return {
    har_id_count: harSet.size,
    slab_inventory_id_count: invSet.size,
    slab_images_id_count: imgSet.size,
    har_missing_from_slab_inventory_count: harMissingFromInv.length,
    har_missing_from_slab_inventory_sample: harMissingFromInv.slice(0, 10),
    slab_inventory_not_seen_in_har_count: invNotInHar.length,
    slab_inventory_not_seen_in_har_sample: invNotInHar.slice(0, 10),
    har_missing_from_slab_images_count: harMissingFromImg.length,
  };
}
