/**
 * Elite 100 color classification for Sales Command Center.
 * Uses the local elite100-2026 fixture catalog — no network calls.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchSourceColorToCatalog } from "../slabInventory/colorProgramMatching.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "../slabInventory/fixtures/elite100-2026.json");

let cachedCatalog = null;

/** @returns {Array<{ price_group: string, color_name: string, material_name: string, display_name: string }>} */
export function loadElite100CatalogItems() {
  if (cachedCatalog) return cachedCatalog;
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const items = [];
  for (const [group, rows] of Object.entries(raw.groups || {})) {
    for (const row of rows) {
      items.push({
        price_group: row.price_group || group,
        color_name: row.color_name,
        material_name: row.material_name,
        display_name: row.display_name || `${row.color_name} - ${row.material_name}`
      });
    }
  }
  cachedCatalog = Object.freeze(items);
  return cachedCatalog;
}

/**
 * @param {string|null|undefined} colorName
 * @param {string|null|undefined} materialName
 */
export function classifySalesColor(colorName, materialName) {
  const catalog = loadElite100CatalogItems();
  const match = matchSourceColorToCatalog(
    { color_name: String(colorName ?? "").trim(), material_name: String(materialName ?? "").trim() },
    catalog
  );
  if (!match || match.method === "none" || !match.match) {
    return {
      collectionStatus: "unknown",
      eliteGroup: null,
      manufacturer: String(materialName ?? "").trim() || null,
      matchMethod: "none",
      confidence: null
    };
  }
  const approved = match.review_status === "approved";
  return {
    collectionStatus: approved ? "elite100" : "unknown",
    eliteGroup: approved ? match.match.price_group ?? null : null,
    manufacturer: match.match.material_name ?? (String(materialName ?? "").trim() || null),
    matchMethod: match.method,
    confidence: match.confidence ?? null,
    catalogDisplayName: match.match.display_name ?? null
  };
}

/**
 * @param {Array<{ color?: string, stone?: string, material?: string, total_worksheet_sqft?: number, sqft?: number }>} rows
 */
export function aggregateColorMix(rows = []) {
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
    const cls = classifySalesColor(color, material);

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
        const [color, material] = key.split("|||");
        return { color, material, sqft, share: pct(sqft) };
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
  cachedCatalog = null;
}
