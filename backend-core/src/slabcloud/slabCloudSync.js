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
 *
 * Inventory scopes:
 *   slab    — single fetch, type=Slab&edges=true (default, backward-compat)
 *   remnant — single fetch, type=Remnant&edges=true
 *   all     — single fetch, no type param, edges=true (full catalog, type unknown)
 *   typed   — TWO fetches: Slab lane + Remnant lane, merged with type tagging.
 *             Each record gets source_inventory_type = Slab or Remnant.
 *             Duplicate SlabID detection across lanes is performed before write.
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
  scopeToInventoryType,
  INVENTORY_SCOPE_SLAB,
  INVENTORY_SCOPE_REMNANT,
  INVENTORY_SCOPE_TYPED,
} from "./slabCloudClient.js";
import {
  normalizeSlabRecords,
  extractDistinctColorNames,
} from "./normalizeSlabCloudInventory.js";
import { persistSlabCloudInventory, isCacheWriteEnabled } from "./slabCloudPersistence.js";

// ── Typed overlap detection (pure, exported for tests) ────────────────────────

/**
 * Detect duplicate external_slab_id values across the Slab and Remnant lanes.
 * Comparison is case-insensitive (SlabIDs are UUIDs; casing varies by source).
 *
 * Returns an overlap report object with counts and a sample of duplicate IDs.
 * A non-zero typed_duplicate_slab_id_count means the same physical slab was
 * returned by both the Slab and Remnant lanes — which should not happen in a
 * correctly configured SlabCloud account.
 *
 * @param {Array<object>} slabNormalized - normalized records from the Slab lane
 * @param {Array<object>} remnantNormalized - normalized records from the Remnant lane
 * @returns {object} overlap result
 */
export function detectSlabIdOverlap(slabNormalized, remnantNormalized) {
  const slabArr = Array.isArray(slabNormalized) ? slabNormalized : [];
  const remArr = Array.isArray(remnantNormalized) ? remnantNormalized : [];

  const slabIds = new Set(
    slabArr.map((r) => r?.external_slab_id?.toLowerCase()).filter(Boolean)
  );
  const remnantIds = new Set(
    remArr.map((r) => r?.external_slab_id?.toLowerCase()).filter(Boolean)
  );

  const duplicates = [];
  for (const id of slabIds) {
    if (remnantIds.has(id)) duplicates.push(id);
  }

  const allIds = new Set([...slabIds, ...remnantIds]);

  return {
    typed_slab_record_count: slabArr.length,
    typed_remnant_record_count: remArr.length,
    typed_combined_record_count: slabArr.length + remArr.length,
    typed_distinct_slab_id_count: allIds.size,
    typed_duplicate_slab_id_count: duplicates.length,
    typed_duplicate_slab_id_sample: duplicates.slice(0, 10),
  };
}

// ── Typed two-lane sync (internal) ────────────────────────────────────────────

async function runTypedInventorySync({
  cfg,
  fetchDetails,
  maxDetails,
  concurrency,
  organizationId,
  db,
  writeEnabled,
  fetchMaterials,
  fetchSlabSummary,
  fetchSlabDetail,
}) {
  const warnings = [];

  // Build per-lane client configs with explicit type= values.
  // Must set type explicitly because cfg.type may be "Slab" (the safe fallback
  // for scopeToInventoryType("typed")) and spreading it would win over the
  // inventoryScope-derived type in buildClientConfig.
  const slabCfg = buildClientConfig({ ...cfg, inventoryScope: INVENTORY_SCOPE_SLAB, type: "Slab" });
  const remnantCfg = buildClientConfig({ ...cfg, inventoryScope: INVENTORY_SCOPE_REMNANT, type: "Remnant" });

  // Shared normalizer base: source_inventory_scope = "typed" for all records in both lanes.
  const normalizeBase = {
    baseUrl: cfg.baseUrl,
    companyCode: cfg.companyCode,
    apiCompanyCode: cfg.apiCompanyCode || cfg.companyCode,
    assetCompanyCode: cfg.assetCompanyCode || cfg.apiCompanyCode || cfg.companyCode,
    publicSlug: cfg.publicSlug || null,
    inventoryScope: INVENTORY_SCOPE_TYPED,
  };

  // 1) Materials (non-fatal, fetched once for both lanes).
  let materials = [];
  try {
    materials = await fetchMaterials(cfg);
  } catch (err) {
    warnings.push(`materials fetch failed: ${err?.message || String(err)}`);
  }

  // 2) Slab lane summary.
  let slabSummaryRaw = [];
  try {
    slabSummaryRaw = await fetchSlabSummary(slabCfg);
  } catch (err) {
    warnings.push(`slab lane summary fetch failed: ${err?.message || String(err)}`);
  }

  // 3) Remnant lane summary.
  let remnantSummaryRaw = [];
  try {
    remnantSummaryRaw = await fetchSlabSummary(remnantCfg);
  } catch (err) {
    warnings.push(`remnant lane summary fetch failed: ${err?.message || String(err)}`);
  }

  // 4) Optional per-color detail fetches for each lane.
  let slabDetailRaw = [];
  let remnantDetailRaw = [];

  if (fetchDetails) {
    // Slab lane details: name+type=Slab config ensures ?name=X&type=Slab&edges=true.
    let slabNames = extractDistinctColorNames(slabSummaryRaw);
    if (maxDetails > 0) slabNames = slabNames.slice(0, maxDetails);
    const slabPerName = await mapWithConcurrency(
      slabNames,
      Math.max(1, concurrency),
      async (name) => {
        try {
          return await fetchSlabDetail(name, slabCfg);
        } catch (err) {
          warnings.push(`slab detail failed for "${name}": ${err?.message || String(err)}`);
          return [];
        }
      }
    );
    for (const rows of slabPerName) slabDetailRaw.push(...rows);

    // Remnant lane details: name+type=Remnant config ensures ?name=X&type=Remnant&edges=true.
    let remnantNames = extractDistinctColorNames(remnantSummaryRaw);
    if (maxDetails > 0) remnantNames = remnantNames.slice(0, maxDetails);
    const remnantPerName = await mapWithConcurrency(
      remnantNames,
      Math.max(1, concurrency),
      async (name) => {
        try {
          return await fetchSlabDetail(name, remnantCfg);
        } catch (err) {
          warnings.push(`remnant detail failed for "${name}": ${err?.message || String(err)}`);
          return [];
        }
      }
    );
    for (const rows of remnantPerName) remnantDetailRaw.push(...rows);
  }

  // 5) Normalize each lane with its explicit inventoryType.
  //    source_inventory_scope = "typed" on all records (set via normalizeBase).
  const slabPrimary = slabDetailRaw.length > 0 ? slabDetailRaw : slabSummaryRaw;
  const remnantPrimary = remnantDetailRaw.length > 0 ? remnantDetailRaw : remnantSummaryRaw;
  const recordSource =
    slabDetailRaw.length > 0 || remnantDetailRaw.length > 0 ? "detail" : "summary";

  const slabNormalized = normalizeSlabRecords(slabPrimary, {
    ...normalizeBase,
    inventoryType: "Slab",
  });
  const remnantNormalized = normalizeSlabRecords(remnantPrimary, {
    ...normalizeBase,
    inventoryType: "Remnant",
  });

  // 6) Detect physical SlabID overlap across lanes.
  //    Overlap means the same slab UUID was returned by both ?type=Slab and ?type=Remnant.
  //    This should not happen in a correctly configured SlabCloud account.
  const overlapResult = detectSlabIdOverlap(slabNormalized, remnantNormalized);

  // 7) Fail safely before any write if overlap exists.
  //    In dry-run, overlap is reported as a warning so operators can investigate.
  if (overlapResult.typed_duplicate_slab_id_count > 0) {
    const msg =
      `typed sync: ${overlapResult.typed_duplicate_slab_id_count} duplicate external_slab_id(s) ` +
      `found across Slab and Remnant lanes. ` +
      `Sample: ${overlapResult.typed_duplicate_slab_id_sample.slice(0, 3).join(", ")}. ` +
      `The same physical slab UUID must not appear in both lanes.`;
    if (writeEnabled) {
      // Write-enabled: throw before creating the sync run or touching any table.
      const err = new Error(
        `Typed sync aborted — write blocked. ${msg} ` +
          `Upsert with duplicate IDs would silently corrupt source_inventory_type classification.`
      );
      err.overlapResult = overlapResult;
      throw err;
    } else {
      // Dry-run: warn clearly, then proceed with the report.
      warnings.push(`DRY-RUN WARNING — ${msg}`);
    }
  }

  // 8) Combine both lanes for persistence.
  const combined = [...slabNormalized, ...remnantNormalized];
  const typeBreakdown = {
    Slab: slabNormalized.length,
    Remnant: remnantNormalized.length,
  };

  const runMeta = {
    triggeredBy: "script",
    fetchMode: fetchDetails ? "with_details" : "summary_only",
    maxDetails: maxDetails || null,
    concurrency,
    materialRowCount: materials.length,
    slabSummaryRowCount: slabSummaryRaw.length,
    // slabDetailRowCount stores the combined detail count for typed runs.
    slabDetailRowCount: slabDetailRaw.length + remnantDetailRaw.length,
    inventoryScope: INVENTORY_SCOPE_TYPED,
    slabRowCount: slabNormalized.length,
    remnantRowCount: remnantNormalized.length,
    allInventoryRowCount: combined.length,
    typeBreakdown,
    overlapResult,
  };

  // 9) Persist (write-gated).
  const persistence = await persistSlabCloudInventory({
    db,
    organizationId,
    config: { ...cfg, inventoryScope: INVENTORY_SCOPE_TYPED },
    normalized: combined,
    materials,
    warnings,
    recordSource,
    runMeta,
    writeEnabled,
  });

  return {
    endpoints: {
      materials: buildMaterialsUrl(cfg),
      slabSummary: buildSlabSummaryUrl(slabCfg),
      remnantSummary: buildSlabSummaryUrl(remnantCfg),
      detailExample: buildSlabDetailUrl({ ...slabCfg, name: "Alabaster" }),
    },
    fetch: {
      materialRowCount: materials.length,
      slabSummaryRowCount: slabSummaryRaw.length,
      remnantSummaryRowCount: remnantSummaryRaw.length,
      slabDetailRowCount: slabDetailRaw.length,
      remnantDetailRowCount: remnantDetailRaw.length,
      recordSource,
    },
    normalizedCount: combined.length,
    inventoryScope: INVENTORY_SCOPE_TYPED,
    typeBreakdown,
    overlapResult,
    warnings,
    persistence,
  };
}

// ── Main sync orchestrator ────────────────────────────────────────────────────

/**
 * Run a full SlabCloud inventory sync.
 *
 * @param {object} params
 * @param {object} [params.config] - client config (baseUrl, companyCode, inventoryScope, ...)
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

  // Typed scope: two-lane orchestration (Slab + Remnant fetches, merged).
  if (cfg.inventoryScope === INVENTORY_SCOPE_TYPED) {
    return runTypedInventorySync({
      cfg,
      fetchDetails,
      maxDetails,
      concurrency,
      organizationId,
      db,
      writeEnabled,
      fetchMaterials,
      fetchSlabSummary,
      fetchSlabDetail,
    });
  }

  // Single-scope path (slab / remnant / all — existing behavior unchanged).
  const warnings = [];

  // Build normalizer opts that carry full source provenance.
  // inventoryType is derived from inventoryScope so the normalizer can tag each
  // record with the SlabCloud type (Slab/Remnant/null) that was fetched.
  const normalizeOpts = {
    baseUrl: cfg.baseUrl,
    companyCode: cfg.companyCode,
    apiCompanyCode: cfg.apiCompanyCode || cfg.companyCode,
    assetCompanyCode: cfg.assetCompanyCode || cfg.apiCompanyCode || cfg.companyCode,
    publicSlug: cfg.publicSlug || null,
    inventoryScope: cfg.inventoryScope || null,
    // inventoryType: explicit type used in the API request.
    // null when inventoryScope="all" (bare endpoint, no type param).
    inventoryType: scopeToInventoryType(cfg.inventoryScope),
  };

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

  // Count source_inventory_type breakdown for runMeta (used in sync run insert).
  const typeBreakdown = {};
  for (const rec of normalized) {
    const t = rec.source_inventory_type || "unknown";
    typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
  }

  const runMeta = {
    triggeredBy: "script",
    fetchMode: fetchDetails ? "with_details" : "summary_only",
    maxDetails: maxDetails || null,
    concurrency,
    materialRowCount: materials.length,
    slabSummaryRowCount: summaryRaw.length,
    slabDetailRowCount: detailRecordsRaw.length,
    // Scope metadata for slabcloud_sync_runs columns added by scope upgrade SQL.
    inventoryScope: cfg.inventoryScope || null,
    slabRowCount: typeBreakdown["Slab"] ?? 0,
    remnantRowCount: typeBreakdown["Remnant"] ?? 0,
    allInventoryRowCount: normalized.length,
    typeBreakdown,
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
    inventoryScope: cfg.inventoryScope || null,
    typeBreakdown,
    warnings,
    persistence,
  };
}
