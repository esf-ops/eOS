/**
 * elite100MatchDiagnostics — per-catalog and batch matching diagnostics for Elite 100.
 *
 * Uses the same matching rules as buildElite100InventoryMap (exact + approved alias only).
 * Fuzzy suggestions are diagnostic only — never counted as Elite 100 inventory.
 */

import {
  matchSourceColorWithAliases,
  normalizeColorName,
  normalizeMaterialName,
  materialsCompatible,
  similarityScore,
  DEFAULT_FUZZY_THRESHOLD,
} from "./colorProgramMatching.js";

/**
 * @param {Array<Record<string, unknown>>} invRows
 */
export function groupInventoryByColorMaterial(invRows) {
  /** @type {Map<string, { color_name: string|null, material_name: string|null, rows: Array<Record<string, unknown>> }>} */
  const groups = new Map();
  for (const r of Array.isArray(invRows) ? invRows : []) {
    const key = `${r.color_name ?? ""}||${r.material_name ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        color_name: r.color_name ?? null,
        material_name: r.material_name ?? null,
        rows: [],
      });
    }
    groups.get(key).rows.push(r);
  }
  return groups;
}

/**
 * Approved aliases that resolve to a catalog item (by normalized catalog color/material).
 * @param {Record<string, unknown>} catalogItem
 * @param {Array<Record<string, unknown>>} resolvedAliases
 */
export function aliasesForCatalogItem(catalogItem, resolvedAliases) {
  const catColorNorm = normalizeColorName(catalogItem.color_name);
  const catMatNorm = normalizeMaterialName(catalogItem.material_name ?? "");
  return (Array.isArray(resolvedAliases) ? resolvedAliases : [])
    .filter((a) => {
      const aCatColor = normalizeColorName(a.catalog_color_name ?? "");
      const aCatMat = normalizeMaterialName(a.catalog_material_name ?? "");
      return aCatColor === catColorNorm && materialsCompatible(aCatMat, catMatNorm);
    })
    .map((a) => ({
      alias_color_name: a.alias_color_name ?? null,
      alias_material_name: a.alias_material_name ?? null,
      normalized_alias_color_name: a.normalized_alias_color_name ?? null,
      normalized_alias_material_name: a.normalized_alias_material_name ?? null,
    }));
}

/**
 * @param {Record<string, unknown>} catalogItem
 * @param {Map<string, { color_name: string|null, material_name: string|null, rows: Array }>} inventoryGroups
 * @param {Array<Record<string, unknown>>} catalogItemList
 * @param {Array<Record<string, unknown>>} resolvedAliases
 */
export function matchInventoryToCatalogItem(
  catalogItem,
  inventoryGroups,
  catalogItemList,
  resolvedAliases
) {
  /** @type {Array<{ color_name: string|null, material_name: string|null, match_method: string, row_count: number, sample_inventory_ids: string[] }>} */
  const matchedSources = [];
  /** @type {Array<Record<string, unknown>>} */
  const matchedRows = [];
  const methods = new Set();

  for (const group of inventoryGroups.values()) {
    const source = {
      color_name: group.color_name,
      material_name: group.material_name,
    };
    const result = matchSourceColorWithAliases(
      source,
      catalogItemList,
      resolvedAliases
    );
    if (result.method !== "exact" && result.method !== "alias") continue;
    if (result.match?.id !== catalogItem.id) continue;

    methods.add(result.method);
    matchedRows.push(...group.rows);
    matchedSources.push({
      color_name: group.color_name,
      material_name: group.material_name,
      match_method: result.method,
      row_count: group.rows.length,
      sample_inventory_ids: group.rows
        .slice(0, 5)
        .map((r) => r.inventory_id ?? r.external_slab_id ?? null)
        .filter(Boolean),
    });
  }

  return { matchedRows, matchedSources, matchMethods: [...methods] };
}

/**
 * Fuzzy inventory color suggestions when a catalog item has zero exact/alias matches.
 * @param {Record<string, unknown>} catalogItem
 * @param {Map<string, { color_name: string|null, material_name: string|null, rows: Array }>} inventoryGroups
 * @param {{ limit?: number, minSimilarity?: number }} [opts]
 */
export function suggestFuzzyInventoryCandidates(catalogItem, inventoryGroups, opts = {}) {
  const limit = opts.limit ?? 5;
  const minSimilarity = opts.minSimilarity ?? 0.55;
  const catColorNorm = normalizeColorName(catalogItem.color_name);
  const catMatNorm = normalizeMaterialName(catalogItem.material_name ?? "");

  /** @type {Array<{ color_name: string|null, material_name: string|null, row_count: number, color_similarity: number, combined_score: number }>} */
  const candidates = [];

  for (const group of inventoryGroups.values()) {
    const srcColorNorm = normalizeColorName(group.color_name);
    const srcMatNorm = normalizeMaterialName(group.material_name ?? "");
    if (!materialsCompatible(srcMatNorm, catMatNorm) && srcMatNorm && catMatNorm) {
      continue;
    }
    const colorSim = similarityScore(catColorNorm, srcColorNorm);
    if (colorSim < minSimilarity) continue;
    const matBonus =
      srcMatNorm && catMatNorm && srcMatNorm === catMatNorm ? 0.05 : 0;
    candidates.push({
      color_name: group.color_name,
      material_name: group.material_name,
      row_count: group.rows.length,
      color_similarity: Math.round(colorSim * 1000) / 1000,
      combined_score: Math.round((colorSim + matBonus) * 1000) / 1000,
    });
  }

  candidates.sort((a, b) => b.combined_score - a.combined_score);
  return candidates.slice(0, limit);
}

/**
 * Debug-safe diagnostics for one Elite 100 catalog item.
 * @param {Record<string, unknown>} catalogItem
 * @param {Array<Record<string, unknown>>} invRows
 * @param {Array<Record<string, unknown>>} catalogItemList
 * @param {Array<Record<string, unknown>>} resolvedAliases
 * @param {{ fuzzyCandidateLimit?: number }} [opts]
 */
export function diagnoseElite100CatalogItem(
  catalogItem,
  invRows,
  catalogItemList,
  resolvedAliases,
  opts = {}
) {
  const inventoryGroups = groupInventoryByColorMaterial(invRows);
  const approvedAliases = aliasesForCatalogItem(catalogItem, resolvedAliases);
  const { matchedRows, matchedSources, matchMethods } = matchInventoryToCatalogItem(
    catalogItem,
    inventoryGroups,
    catalogItemList,
    resolvedAliases
  );

  const fuzzyCandidateInventory =
    matchedRows.length === 0
      ? suggestFuzzyInventoryCandidates(catalogItem, inventoryGroups, {
          limit: opts.fuzzyCandidateLimit ?? 5,
        })
      : [];

  return {
    catalog_item_id: catalogItem.id ?? null,
    catalog_color_name: catalogItem.color_name ?? null,
    catalog_material_name: catalogItem.material_name ?? null,
    normalized_catalog_color_name:
      catalogItem.normalized_color_name ??
      normalizeColorName(catalogItem.color_name),
    normalized_catalog_material_name:
      catalogItem.normalized_material_name ??
      normalizeMaterialName(catalogItem.material_name),
    price_group: catalogItem.price_group ?? null,
    approved_aliases: approvedAliases,
    matched_inventory_row_count: matchedRows.length,
    match_methods: matchMethods,
    matched_inventory_sources: matchedSources,
    sample_matched_inventory: matchedRows.slice(0, 5).map((r) => ({
      color_name: r.color_name ?? null,
      material_name: r.material_name ?? null,
      inventory_id: r.inventory_id ?? null,
      external_slab_id: r.external_slab_id ?? null,
      source_inventory_type: r.source_inventory_type ?? null,
    })),
    fuzzy_candidate_inventory: fuzzyCandidateInventory,
  };
}

/**
 * Full Elite 100 match report (catalog ↔ active inventory).
 * @param {{
 *   catalogItemList: Array<Record<string, unknown>>,
 *   invRows: Array<Record<string, unknown>>,
 *   resolvedAliases: Array<Record<string, unknown>>,
 *   activeInventorySource?: string,
 *   inventoryFetch?: {
 *     active_inventory_rows_fetched?: number,
 *     active_inventory_fetch_pages?: number,
 *     active_inventory_fetch_complete?: boolean|null,
 *     expected_active_count?: number|null,
 *     fetch_warning?: string|null,
 *   },
 * }} params
 */
export function buildElite100MatchReport({
  catalogItemList,
  invRows,
  resolvedAliases,
  activeInventorySource = null,
  inventoryFetch = null,
}) {
  const catalogItems = Array.isArray(catalogItemList) ? catalogItemList : [];
  const rows = Array.isArray(invRows) ? invRows : [];
  const aliases = Array.isArray(resolvedAliases) ? resolvedAliases : [];
  const inventoryGroups = groupInventoryByColorMaterial(rows);

  /** @type {Array<ReturnType<typeof diagnoseElite100CatalogItem>>} */
  const catalogDiagnostics = catalogItems.map((item) =>
    diagnoseElite100CatalogItem(item, rows, catalogItems, aliases)
  );

  const matchedCatalog = catalogDiagnostics.filter((d) => d.matched_inventory_row_count > 0);
  const unmatchedCatalog = catalogDiagnostics.filter((d) => d.matched_inventory_row_count === 0);

  // Inventory color groups not assigned to any Elite 100 catalog item (exact/alias).
  /** @type {Array<{ color_name: string|null, material_name: string|null, row_count: number, match_method: string }>} */
  const unmappedInventory = [];
  /** @type {Array<{ source: object, suggested_catalog: object|null, color_similarity: number, combined_score: number }>} */
  const suggestedAliasCandidates = [];

  for (const group of inventoryGroups.values()) {
    const source = {
      color_name: group.color_name,
      material_name: group.material_name,
    };
    const result = matchSourceColorWithAliases(source, catalogItems, aliases);
    if (result.method === "exact" || result.method === "alias") continue;

    unmappedInventory.push({
      color_name: group.color_name,
      material_name: group.material_name,
      row_count: group.rows.length,
      nearest_match_method: result.method,
      nearest_match_confidence:
        result.method === "fuzzy" ? result.confidence : null,
    });

    if (result.method === "fuzzy" && result.match) {
      suggestedAliasCandidates.push({
        source: {
          color_name: group.color_name,
          material_name: group.material_name,
          row_count: group.rows.length,
        },
        suggested_catalog: {
          catalog_item_id: result.match.id ?? null,
          color_name: result.match.color_name ?? null,
          material_name: result.match.material_name ?? null,
          price_group: result.match.price_group ?? null,
        },
        match_method: "fuzzy",
        color_similarity: result.confidence,
        combined_score: result.confidence,
        review_status: "needs_review",
      });
    }
  }

  suggestedAliasCandidates.sort((a, b) => b.combined_score - a.combined_score);

  const fetchMeta = inventoryFetch
    ? {
        active_inventory_rows_fetched:
          inventoryFetch.active_inventory_rows_fetched ?? rows.length,
        active_inventory_fetch_pages: inventoryFetch.active_inventory_fetch_pages ?? null,
        active_inventory_fetch_complete:
          inventoryFetch.active_inventory_fetch_complete ?? null,
        expected_active_count: inventoryFetch.expected_active_count ?? null,
        fetch_warning: inventoryFetch.fetch_warning ?? null,
      }
    : {};

  return {
    active_inventory_source: activeInventorySource,
    inventory_row_count: rows.length,
    ...fetchMeta,
    unique_inventory_color_groups: inventoryGroups.size,
    catalog_item_count: catalogItems.length,
    matched_catalog_count: matchedCatalog.length,
    unmatched_catalog_count: unmatchedCatalog.length,
    unmapped_inventory_group_count: unmappedInventory.length,
    fuzzy_threshold_note: `Fuzzy suggestions use similarity >= ${DEFAULT_FUZZY_THRESHOLD} in matcher; diagnostic candidates may use lower threshold.`,
    matched_catalog: matchedCatalog.map((d) => ({
      catalog_item_id: d.catalog_item_id,
      catalog_color_name: d.catalog_color_name,
      catalog_material_name: d.catalog_material_name,
      matched_inventory_row_count: d.matched_inventory_row_count,
      match_methods: d.match_methods,
      matched_inventory_sources: d.matched_inventory_sources,
    })),
    unmatched_catalog: unmatchedCatalog.map((d) => ({
      catalog_item_id: d.catalog_item_id,
      catalog_color_name: d.catalog_color_name,
      catalog_material_name: d.catalog_material_name,
      normalized_catalog_color_name: d.normalized_catalog_color_name,
      normalized_catalog_material_name: d.normalized_catalog_material_name,
      approved_aliases: d.approved_aliases,
      fuzzy_candidate_inventory: d.fuzzy_candidate_inventory,
    })),
    unmapped_inventory: unmappedInventory.sort((a, b) => b.row_count - a.row_count),
    suggested_alias_candidates: suggestedAliasCandidates,
    catalog_diagnostics: catalogDiagnostics,
  };
}

/**
 * Compact match_debug object for API cards (?debug=match).
 * @param {ReturnType<typeof diagnoseElite100CatalogItem>} diag
 */
export function compactElite100MatchDebug(diag) {
  return {
    normalized_catalog_color_name: diag.normalized_catalog_color_name,
    normalized_catalog_material_name: diag.normalized_catalog_material_name,
    approved_alias_count: diag.approved_aliases.length,
    approved_aliases: diag.approved_aliases,
    matched_inventory_row_count: diag.matched_inventory_row_count,
    match_methods: diag.match_methods,
    sample_matched_inventory: diag.sample_matched_inventory,
    fuzzy_candidate_inventory: diag.fuzzy_candidate_inventory,
  };
}
