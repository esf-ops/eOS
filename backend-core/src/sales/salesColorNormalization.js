/**
 * Conservative Moraware color/stone normalization for sales dashboard classification.
 * Does not mutate source values — produces match candidates only.
 */

import { normalizeColorName, normalizeMaterialName } from "../slabInventory/colorProgramMatching.js";

const FINISH_SUFFIXES = Object.freeze([
  "polished",
  "honed",
  "leathered",
  "brushed",
  "matte",
  "satin",
  "leather",
  "natural"
]);

const EXCLUDED_COLOR_PATTERNS = [
  /\bremnant\b/i,
  /\btagged at shop\b/i,
  /\bsee below\b/i,
  /\bshop only\b/i,
  /\bwarehouse\b/i,
  /\bdiscontinued\b/i,
  /\bn\/a\b/i,
  /^tbd$/i,
  /^none$/i,
  /^unknown$/i
];

/**
 * Strip leading thickness tokens (2cm, 3 cm, 2 cm, etc.).
 * @param {string} raw
 */
export function stripThicknessPrefix(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^\d+\s*cm\s+/i, "");
  s = s.replace(/^\d+\.?\d*\s*cm\s+/i, "");
  return s.trim();
}

/**
 * Strip trailing finish suffixes from a normalized lowercase string.
 * @param {string} normalized
 */
export function stripFinishSuffix(normalized) {
  let s = String(normalized ?? "").trim();
  for (const finish of FINISH_SUFFIXES) {
    const re = new RegExp(`\\s+${finish}$`, "i");
    if (re.test(s)) s = s.replace(re, "").trim();
  }
  return s;
}

/**
 * Normalize a Moraware color label for catalog matching (not display).
 * @param {string|null|undefined} raw
 */
export function normalizeMorawareColorLabel(raw) {
  let s = stripThicknessPrefix(String(raw ?? "").trim());
  s = normalizeColorName(s);
  s = stripFinishSuffix(s);
  return s;
}

/**
 * Normalize Moraware stone/material field for matching.
 * @param {string|null|undefined} raw
 */
export function normalizeMorawareStoneLabel(raw) {
  let s = stripThicknessPrefix(String(raw ?? "").trim());
  s = normalizeMaterialName(s);
  return s;
}

/**
 * True when row should never auto-classify as Elite 100.
 */
export function isExcludedColorNoise(colorRaw, stoneRaw) {
  const blob = `${colorRaw ?? ""} ${stoneRaw ?? ""}`.trim();
  if (!blob) return true;
  return EXCLUDED_COLOR_PATTERNS.some((re) => re.test(blob));
}

/**
 * Build exact catalog color name lookup from catalog items.
 * @param {Array<object>} catalogItems
 */
export function buildCatalogColorNameIndex(catalogItems = []) {
  const byNorm = new Map();
  for (const item of catalogItems) {
    const norm = String(item.normalized_color_name ?? normalizeColorName(item.color_name)).trim();
    if (!norm) continue;
    const list = byNorm.get(norm) ?? [];
    list.push(item);
    byNorm.set(norm, list);
  }
  return byNorm;
}

/**
 * Conservative vendor-prefix handling: last N tokens must exactly match a catalog color name.
 * @param {string} normalizedColor - already normalized Moraware color
 * @param {Map<string, object[]>} catalogColorIndex
 * @returns {{ normalizedColor: string, tokenCount: number }|null}
 */
export function findVendorSuffixColorCandidate(normalizedColor, catalogColorIndex) {
  const tokens = String(normalizedColor ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;

  for (let k = 1; k <= tokens.length; k++) {
    const candidate = tokens.slice(-k).join(" ");
    if (catalogColorIndex.has(candidate)) {
      return { normalizedColor: candidate, tokenCount: k };
    }
  }
  return null;
}

/**
 * Pick best catalog item for normalized color + material hint.
 * @param {Map<string, object[]>} catalogColorIndex
 * @param {string} normalizedColor
 * @param {string} materialHint
 */
export function pickCatalogItemForColor(catalogColorIndex, normalizedColor, materialHint = "") {
  const items = catalogColorIndex.get(normalizedColor) ?? [];
  if (!items.length) return null;
  if (!materialHint) return items[0];
  const matNorm = normalizeMaterialName(materialHint);
  const exactMat = items.find(
    (i) => normalizeMaterialName(i.normalized_material_name ?? i.material_name) === matNorm
  );
  return exactMat ?? items[0];
}
