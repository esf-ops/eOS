/**
 * Elite 100 color classification for Sales Command Center.
 * Primary: Supabase slab_color_catalog_items (when loaded).
 * Fallback: local elite100-2026.json fixture.
 */

import {
  matchSourceColorToCatalog,
  matchSourceColorWithAliases,
  normalizeColorName,
  normalizeMaterialName
} from "../slabInventory/colorProgramMatching.js";
import { loadElite100CatalogItems, resetElite100FixtureCache } from "./elite100CatalogFixture.js";
import {
  buildCatalogColorNameIndex,
  findVendorSuffixColorCandidate,
  isExcludedColorNoise,
  normalizeMorawareColorLabel,
  normalizeMorawareStoneLabel
} from "./salesColorNormalization.js";

let runtimeCatalogConfig = null;

export { loadElite100CatalogItems } from "./elite100CatalogFixture.js";

/**
 * Configure runtime catalog for dashboard classification (set per request/load).
 * @param {{ items: Array<object>, aliases?: Array<object>, source?: string }|null} config
 */
export function configureSalesColorCatalog(config) {
  runtimeCatalogConfig = config;
}

export function getSalesColorCatalogConfig() {
  return runtimeCatalogConfig;
}

function getCatalogItems(opts = {}) {
  if (opts.catalogItems?.length) return opts.catalogItems;
  if (runtimeCatalogConfig?.items?.length) return runtimeCatalogConfig.items;
  return loadElite100CatalogItems();
}

function getCatalogAliases(opts = {}) {
  if (opts.aliases) return opts.aliases;
  return runtimeCatalogConfig?.aliases ?? [];
}

function toClassificationResult({
  collectionStatus,
  eliteGroup,
  manufacturer,
  matchMethod,
  matchReason,
  confidence,
  catalogDisplayName,
  catalogItemId,
  catalogSource,
  matchedColorNormalized
}) {
  return {
    collectionStatus,
    eliteGroup: eliteGroup ?? null,
    manufacturer: manufacturer ?? null,
    matchMethod: matchMethod ?? "none",
    match_reason: matchReason ?? matchMethod ?? "none",
    matchReason: matchReason ?? matchMethod ?? "none",
    confidence: confidence ?? null,
    catalogDisplayName: catalogDisplayName ?? null,
    catalogItemId: catalogItemId ?? null,
    catalogSource: catalogSource ?? null,
    matchedColorNormalized: matchedColorNormalized ?? null
  };
}

/**
 * Classify using fixture catalog only (for before/after diagnostics).
 */
export function classifySalesColorFixtureOnly(colorName, materialName) {
  const colorRaw = String(colorName ?? "").trim();
  const stoneRaw = String(materialName ?? "").trim();
  const match = matchSourceColorToCatalog(
    { color_name: colorRaw, material_name: stoneRaw },
    loadElite100CatalogItems()
  );
  if (!match || match.method === "none" || !match.match) {
    return toClassificationResult({
      collectionStatus: colorRaw ? "out_of_collection" : "unknown",
      manufacturer: stoneRaw || null,
      matchMethod: "none",
      matchReason: "fixture_exact_only:no_match",
      confidence: null,
      catalogSource: "fixture_elite100_2026"
    });
  }
  const approved = match.review_status === "approved";
  const item = match.match;
  return toClassificationResult({
    collectionStatus: approved ? "elite100" : colorRaw ? "out_of_collection" : "unknown",
    eliteGroup: approved ? item.price_group ?? null : null,
    manufacturer: item.material_name ?? (stoneRaw || null),
    matchMethod: match.method,
    matchReason: approved ? "fixture_exact_only:approved" : "fixture_exact_only:needs_review",
    confidence: match.confidence ?? null,
    catalogDisplayName: item.display_name ?? null,
    catalogSource: "fixture_elite100_2026"
  });
}

/**
 * @param {string|null|undefined} colorName
 * @param {string|null|undefined} materialName
 * @param {{ catalogItems?: Array<object>, aliases?: Array<object>, skipMorawareNormalization?: boolean }} [opts]
 */
export function classifySalesColor(colorName, materialName, opts = {}) {
  const colorRaw = String(colorName ?? "").trim();
  const stoneRaw = String(materialName ?? "").trim();

  if (isExcludedColorNoise(colorRaw, stoneRaw)) {
    return toClassificationResult({
      collectionStatus: colorRaw ? "out_of_collection" : "unknown",
      manufacturer: stoneRaw || null,
      matchMethod: "none",
      matchReason: "excluded_noise:remnant_or_non_catalog",
      confidence: null
    });
  }

  const catalogItems = getCatalogItems(opts);
  const aliases = getCatalogAliases(opts);
  const catalogSource =
    opts.catalogItems?.length && opts.catalogItems !== loadElite100CatalogItems()
      ? "override"
      : runtimeCatalogConfig?.source ?? "fixture_elite100_2026";

  const normalizedColor = opts.skipMorawareNormalization
    ? normalizeColorName(colorRaw)
    : normalizeMorawareColorLabel(colorRaw);
  const normalizedStone = opts.skipMorawareNormalization
    ? normalizeMaterialName(stoneRaw)
    : normalizeMorawareStoneLabel(stoneRaw);

  const catalogIndex = buildCatalogColorNameIndex(catalogItems);

  /** @type {Array<{ color: string, material: string, reason: string }>} */
  const candidates = [];
  if (normalizedColor) {
    candidates.push({ color: normalizedColor, material: normalizedStone, reason: "normalized_full_color" });
    if (normalizedStone) {
      candidates.push({ color: normalizedColor, material: "", reason: "normalized_color_empty_material" });
    }
    if (!opts.skipMorawareNormalization) {
      const suffix = findVendorSuffixColorCandidate(normalizedColor, catalogIndex);
      if (suffix && suffix.normalizedColor !== normalizedColor) {
        candidates.push({
          color: suffix.normalizedColor,
          material: normalizedStone,
          reason: `vendor_suffix_exact:${suffix.tokenCount}_tokens`
        });
        candidates.push({
          color: suffix.normalizedColor,
          material: "",
          reason: `vendor_suffix_exact:${suffix.tokenCount}_tokens_no_material`
        });
      }
    }
  }

  let best = null;
  for (const cand of candidates) {
    const source = {
      color_name: cand.color,
      material_name: cand.material || null
    };
    const match = aliases.length
      ? matchSourceColorWithAliases(source, catalogItems, aliases)
      : matchSourceColorToCatalog(source, catalogItems);

    if (!match?.match) continue;

    const approved = match.review_status === "approved";
    const isVendorSuffix = cand.reason.startsWith("vendor_suffix_exact");
    const eliteApproved = approved || (isVendorSuffix && (match.method === "exact" || match.method === "alias"));

    const rank = eliteApproved ? 3 : match.method === "fuzzy" ? 1 : 2;
    const prevRank = best?.rank ?? -1;
    if (!best || rank > prevRank || (rank === prevRank && (match.confidence ?? 0) > (best.confidence ?? 0))) {
      best = {
        match,
        cand,
        rank,
        eliteApproved
      };
    }
  }

  if (!best?.match?.match) {
    return toClassificationResult({
      collectionStatus: colorRaw ? "out_of_collection" : "unknown",
      manufacturer: stoneRaw || null,
      matchMethod: "none",
      matchReason: "no_catalog_match",
      confidence: null,
      catalogSource
    });
  }

  const { match, cand, eliteApproved } = best;
  const item = match.match;

  if (eliteApproved) {
    return toClassificationResult({
      collectionStatus: "elite100",
      eliteGroup: item.price_group ?? null,
      manufacturer: item.material_name ?? (stoneRaw || null),
      matchMethod: match.method,
      matchReason: cand.reason,
      confidence: match.confidence ?? 1,
      catalogDisplayName: item.display_name ?? null,
      catalogItemId: item.id ?? null,
      catalogSource,
      matchedColorNormalized: cand.color
    });
  }

  return toClassificationResult({
    collectionStatus: colorRaw ? "out_of_collection" : "unknown",
    eliteGroup: null,
    manufacturer: item.material_name ?? (stoneRaw || null),
    matchMethod: match.method,
    matchReason: match.method === "fuzzy" ? "fuzzy_needs_review:not_elite100" : cand.reason,
    confidence: match.confidence ?? null,
    catalogDisplayName: item.display_name ?? null,
    catalogItemId: item.id ?? null,
    catalogSource,
    matchedColorNormalized: cand.color
  });
}

/**
 * @param {Array<{ color?: string, stone?: string, material?: string, total_worksheet_sqft?: number, sqft?: number }>} rows
 * @param {{ catalogItems?: Array<object>, aliases?: Array<object> }} [opts]
 */
export function aggregateColorMix(rows = [], opts = {}) {
  let eliteSqft = 0;
  let outSqft = 0;
  let unknownSqft = 0;
  let totalSqft = 0;
  const byGroup = new Map();
  const byManufacturer = new Map();
  const byColor = new Map();
  const unknownColors = new Map();

  for (const row of rows) {
    const sqft = Number(row.total_worksheet_sqft ?? row.sqft ?? row.worksheet_sqft ?? 0) || 0;
    if (sqft <= 0) continue;
    totalSqft += sqft;
    const color = String(row.color ?? "").trim();
    const material = String(row.stone ?? row.material ?? row.stone_name ?? "").trim();
    const cls = classifySalesColor(color, material, opts);

    if (cls.collectionStatus === "elite100") {
      eliteSqft += sqft;
      const g = cls.eliteGroup || "Unknown group";
      byGroup.set(g, (byGroup.get(g) || 0) + sqft);
    } else if (color) {
      outSqft += sqft;
      const key = `${color}|||${material}`;
      byColor.set(key, (byColor.get(key) || 0) + sqft);
    } else {
      unknownSqft += sqft;
      unknownColors.set("(missing color)", (unknownColors.get("(missing color)") || 0) + sqft);
    }

    const mfg = cls.manufacturer || material || "Unknown";
    byManufacturer.set(mfg, (byManufacturer.get(mfg) || 0) + sqft);
  }

  const pct = (n) => (totalSqft > 0 ? (n / totalSqft) * 100 : 0);

  return {
    totalSqft,
    eliteSqft,
    outSqft,
    unknownSqft,
    eliteShare: pct(eliteSqft),
    outShare: pct(outSqft),
    unknownShare: pct(unknownSqft),
    eliteGroupBreakdown: [...byGroup.entries()]
      .map(([group, sqft]) => ({ group, sqft, share: pct(sqft) }))
      .sort((a, b) => b.sqft - a.sqft),
    manufacturerBreakdown: [...byManufacturer.entries()]
      .map(([manufacturer, sqft]) => ({ manufacturer, sqft, share: pct(sqft) }))
      .sort((a, b) => b.sqft - a.sqft),
    topEliteColors: [],
    topOutOfCollectionColors: [...byColor.entries()]
      .map(([key, sqft]) => {
        const [c, m] = key.split("|||");
        return { color: c, material: m, sqft, share: pct(sqft) };
      })
      .sort((a, b) => b.sqft - a.sqft)
      .slice(0, 25),
    unknownColorRows: [...unknownColors.entries()]
      .map(([color, sqft]) => ({ color, sqft, share: pct(sqft) }))
      .sort((a, b) => b.sqft - a.sqft)
  };
}

/** Reset cached catalog (tests only). */
export function resetElite100CatalogCache() {
  resetElite100FixtureCache();
  runtimeCatalogConfig = null;
}

/** Summarize classification outcomes for diagnostics. */
export function summarizeClassificationSqft(rows, classifyFn) {
  let elite = 0;
  let out = 0;
  let unknown = 0;
  let total = 0;
  const byReason = new Map();
  for (const row of rows) {
    const sqft = Number(row.worksheet_sqft ?? row.total_worksheet_sqft ?? 0) || 0;
    if (sqft <= 0) continue;
    total += sqft;
    const colorRaw = row.color_raw ?? row.color ?? "";
    const stone = row.stone ?? row.material ?? "";
    const cls = classifyFn(colorRaw, stone);
    if (cls.collectionStatus === "elite100") elite += sqft;
    else if (String(colorRaw).trim()) out += sqft;
    else unknown += sqft;
    const reason = cls.match_reason ?? cls.matchMethod ?? "none";
    byReason.set(reason, (byReason.get(reason) || 0) + sqft);
  }
  return {
    totalSqft: total,
    eliteSqft: elite,
    outSqft: out,
    unknownSqft: unknown,
    eliteShare: total > 0 ? (elite / total) * 100 : 0,
    unknownShare: total > 0 ? (unknown / total) * 100 : 0,
    outShare: total > 0 ? (out / total) * 100 : 0,
    matchesByReason: [...byReason.entries()]
      .map(([reason, sqft]) => ({ reason, sqft }))
      .sort((a, b) => b.sqft - a.sqft)
  };
}

/**
 * Compare fixture-only vs enhanced classification on worksheet rows.
 * @param {Array<object>} rows - raw worksheet or intelligence rows with color_raw/stone
 * @param {{ catalogItems: Array<object>, aliases?: Array<object> }} colorCatalog
 */
export function compareColorClassificationImpact(rows = [], colorCatalog = null) {
  const beforeFn = (c, s) => classifySalesColorFixtureOnly(c, s);
  const afterFn = (c, s) =>
    classifySalesColor(c, s, {
      catalogItems: colorCatalog?.items,
      aliases: colorCatalog?.aliases ?? []
    });

  const before = summarizeClassificationSqft(rows, beforeFn);
  const after = summarizeClassificationSqft(rows, afterFn);

  const byColorKey = new Map();
  for (const row of rows) {
    const sqft = Number(row.worksheet_sqft ?? row.total_worksheet_sqft ?? 0) || 0;
    if (sqft <= 0) continue;
    const colorRaw = String(row.color_raw ?? row.color ?? "").trim();
    const stone = String(row.stone ?? row.material ?? "").trim();
    const key = `${colorRaw}|||${stone}`;
    const slot = byColorKey.get(key) ?? { colorRaw, stone, sqft: 0 };
    slot.sqft += sqft;
    byColorKey.set(key, slot);
  }

  const newlyMatched = [];
  const stillUnmatched = [];
  for (const { colorRaw, stone, sqft } of byColorKey.values()) {
    const b = beforeFn(colorRaw, stone);
    const a = afterFn(colorRaw, stone);
    if (b.collectionStatus !== "elite100" && a.collectionStatus === "elite100") {
      newlyMatched.push({
        color: colorRaw,
        stone,
        sqft,
        match_reason: a.match_reason,
        match_confidence: a.confidence,
        catalogDisplayName: a.catalogDisplayName
      });
    } else if (a.collectionStatus !== "elite100" && colorRaw) {
      stillUnmatched.push({ color: colorRaw, stone, sqft, match_reason: a.match_reason });
    }
  }

  newlyMatched.sort((a, b) => b.sqft - a.sqft);
  stillUnmatched.sort((a, b) => b.sqft - a.sqft);

  return {
    catalogSource: colorCatalog?.source ?? "fixture_elite100_2026",
    catalogItemCount: colorCatalog?.itemCount ?? loadElite100CatalogItems().length,
    before,
    after,
    delta: {
      eliteSqft: after.eliteSqft - before.eliteSqft,
      unknownSqft: after.unknownSqft - before.unknownSqft,
      classifiedSqft: after.totalSqft - before.totalSqft
    },
    topNewlyMatchedColors: newlyMatched.slice(0, 15),
    topStillUnmatchedColors: stillUnmatched.slice(0, 15),
    matchesByReasonAfter: after.matchesByReason
  };
}
