/**
 * slabCloudSync — orchestrates fetch → normalize → persist for the SlabCloud
 * inventory cache.
 *
 * SCOPE / SAFETY:
 *   - Read-only fetches via slabCloudClient (no cookies/auth, GET only).
 *   - Normalization via normalizeSlabCloudInventory (pure).
 *   - Persistence via slabCloudPersistence (write-gated; dry-run by default).
 *   - No UI, no API route, no scheduling. This is a callable function only.
 *   - Never writes back to SlabCloud/Slabsmith.
 *
 * The fetchers are injectable so this can be unit-tested without network access,
 * but the persistence write gate still governs whether any DB write occurs.
 */

import {
  buildClientConfig,
  fetchMaterials as defaultFetchMaterials,
  fetchSlabSummary as defaultFetchSlabSummary,
  fetchSlabDetail as defaultFetchSlabDetail,
  mapWithConcurrency,
  buildMaterialsUrl,
  buildSlabSummaryUrl,
  buildSlabDetailUrl,
} from "./slabCloudClient.js";
import {
  normalizeSlabRecords,
  extractDistinctColorNames,
} from "./normalizeSlabCloudInventory.js";
import { persistSlabCloudInventory, isCacheWriteEnabled } from "./slabCloudPersistence.js";

/**
 * Run a full SlabCloud inventory sync.
 *
 * @param {object} params
 * @param {object} [params.config] - client config (baseUrl, companyCode, type, timeoutMs, ...)
 * @param {boolean} [params.fetchDetails=true]
 * @param {number} [params.maxDetails=0] - 0 = no cap
 * @param {number} [params.concurrency=2]
 * @param {string|null} [params.organizationId]
 * @param {import("@supabase/supabase-js").SupabaseClient|null} [params.db]
 * @param {boolean} [params.writeEnabled] - defaults to env gate
 * @param {object} [params.fetchers] - { fetchMaterials, fetchSlabSummary, fetchSlabDetail } (test injection)
 * @returns {Promise<object>} combined fetch + persistence summary
 */
export async function runSlabCloudInventorySync({
  config = buildClientConfig(),
  fetchDetails = true,
  maxDetails = 0,
  concurrency = 2,
  organizationId = null,
  db = null,
  writeEnabled = isCacheWriteEnabled(),
  fetchers = {},
} = {}) {
  const fetchMaterials = fetchers.fetchMaterials || defaultFetchMaterials;
  const fetchSlabSummary = fetchers.fetchSlabSummary || defaultFetchSlabSummary;
  const fetchSlabDetail = fetchers.fetchSlabDetail || defaultFetchSlabDetail;

  const cfg = config.companyCode ? config : buildClientConfig(config);
  const warnings = [];
  const normalizeOpts = { baseUrl: cfg.baseUrl, companyCode: cfg.companyCode };

  // 1) Materials (non-fatal).
  let materials = [];
  try {
    materials = await fetchMaterials(cfg);
  } catch (err) {
    warnings.push(`materials fetch failed: ${err?.message || String(err)}`);
  }

  // 2) Slab summary list — backbone. Fatal if it cannot load.
  const summaryRaw = await fetchSlabSummary(cfg);

  // 3) Optional per-color detail fetches.
  let detailRecordsRaw = [];
  let detailColorNames = [];
  if (fetchDetails) {
    let names = extractDistinctColorNames(summaryRaw);
    if (maxDetails > 0) names = names.slice(0, maxDetails);
    detailColorNames = names;

    const perName = await mapWithConcurrency(names, Math.max(1, concurrency), async (name) => {
      try {
        const rows = await fetchSlabDetail(name, cfg);
        return rows;
      } catch (err) {
        warnings.push(`detail fetch failed for "${name}": ${err?.message || String(err)}`);
        return [];
      }
    });
    for (const rows of perName) detailRecordsRaw.push(...rows);
  }

  const primaryRaw = detailRecordsRaw.length > 0 ? detailRecordsRaw : summaryRaw;
  const recordSource = detailRecordsRaw.length > 0 ? "detail" : "summary";
  const normalized = normalizeSlabRecords(primaryRaw, normalizeOpts);

  const runMeta = {
    triggeredBy: "script",
    fetchMode: fetchDetails ? "with_details" : "summary_only",
    maxDetails: maxDetails || null,
    concurrency,
    materialRowCount: materials.length,
    slabSummaryRowCount: summaryRaw.length,
    slabDetailRowCount: detailRecordsRaw.length,
  };

  // 4) Persist (write-gated; dry-run unless explicitly enabled).
  const persistence = await persistSlabCloudInventory({
    db,
    organizationId,
    config: cfg,
    normalized,
    materials,
    warnings,
    recordSource,
    runMeta,
    writeEnabled,
  });

  return {
    endpoints: {
      materials: buildMaterialsUrl(cfg),
      slabSummary: buildSlabSummaryUrl(cfg),
      detailExample: buildSlabDetailUrl({ ...cfg, name: detailColorNames[0] || "Alabaster" }),
    },
    fetch: {
      materialRowCount: materials.length,
      slabSummaryRowCount: summaryRaw.length,
      slabDetailRowCount: detailRecordsRaw.length,
      detailColorNames,
      recordSource,
    },
    normalizedCount: normalized.length,
    warnings,
    persistence,
  };
}
