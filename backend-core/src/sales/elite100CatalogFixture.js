/**
 * Local Elite 100 fixture catalog (elite100-2026.json).
 * Shared by sales classification and Supabase catalog fallback loader.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeColorName, normalizeMaterialName } from "../slabInventory/colorProgramMatching.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "../slabInventory/fixtures/elite100-2026.json");

let cachedFixtureCatalog = null;

/** @returns {Array<{ price_group: string, color_name: string, material_name: string, display_name: string, normalized_color_name: string, normalized_material_name: string }>} */
export function loadElite100CatalogItems() {
  if (cachedFixtureCatalog) return cachedFixtureCatalog;
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const items = [];
  for (const [group, rows] of Object.entries(raw.groups || {})) {
    for (const row of rows) {
      items.push({
        price_group: row.price_group || group,
        color_name: row.color_name,
        material_name: row.material_name,
        display_name: row.display_name || `${row.color_name} - ${row.material_name}`,
        normalized_color_name: normalizeColorName(row.color_name),
        normalized_material_name: normalizeMaterialName(row.material_name)
      });
    }
  }
  cachedFixtureCatalog = Object.freeze(items);
  return cachedFixtureCatalog;
}

/** Reset cached catalog (tests only). */
export function resetElite100FixtureCache() {
  cachedFixtureCatalog = null;
}
