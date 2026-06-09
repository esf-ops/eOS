/**
 * normalizeSlabsmithInventory — pure Slabsmith XML → slabOS inventory shape.
 *
 * SCOPE / SAFETY:
 *   - Pure functions only: no network, no filesystem, no Supabase, no SQL Server.
 *   - Parses Slabsmith export XML (self-closing `<Slabsmith.dbo.Slabs ... />` nodes).
 *   - Normalizes into records suitable for later upsert into `slab_inventory`.
 *   - `source_price_group` is imported SlabCloud/Slabsmith authority only — never
 *     a managed slabOS price group override.
 *
 * UNIT ASSUMPTIONS (verified against ESF `debug/slabsmith/source-samples/slabs.xml`):
 *   - `Length_x0024_Actual` and `Width_x0024_Actual` are **meters** (XML-escaped
 *     Slabsmith field names for Length$Actual / Width$Actual). Output inches via × 39.3701.
 *   - `Area_x0024_Usable` (preferred) and `Area_x0024_Actual` are **square meters**.
 *     Output `usable_sqft` via × 10.76391041671. UsableA/B/C/D/X/Y are preserved in
 *     raw_payload only — their mm semantics are not used for sqft in v1.
 */

import { createHash } from "node:crypto";

export const SLABSMITH_EXTERNAL_SOURCE = "slabsmith";
export const SLABSMITH_SOURCE_SCOPE = "typed";

/** SlabCloud-aligned conversion constant. */
export const METERS_TO_INCHES = 39.3701;

/** 1 m² = 10.76391041671 ft² (international foot). */
export const SQ_METERS_TO_SQFT = 10.76391041671;

/** Active ESF source price groups — reference only; source values outside this set are preserved, not remapped. Group G is excluded. */
export const ACTIVE_ESF_SOURCE_PRICE_GROUPS = Object.freeze([
  "Promo",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
]);

export const SLABSMITH_SLAB_TAG = "Slabsmith.dbo.Slabs";

/** Slabsmith XML attribute names (including `_x0024_` / `_x0020_` encodings). */
export const SLABSMITH_ATTR = Object.freeze({
  slabId: "SlabID",
  parentSlabUid: "ParentSlabUID",
  inventoryId: "InventoryID",
  name: "Name",
  material: "Material",
  type: "Type",
  status: "Status",
  priceGroup: "Price_x0020_Group",
  rack: "Rack",
  lot: "Lot",
  finish: "Finish",
  thicknessNominal: "Thickness_x0024_Nominal",
  lengthActual: "Length_x0024_Actual",
  widthActual: "Width_x0024_Actual",
  areaUsable: "Area_x0024_Usable",
  areaActual: "Area_x0024_Actual",
});

const SLABSMITH_TAG_OPEN_RE = /<Slabsmith\.dbo\.Slabs\b/g;
const XML_ATTR_RE = /([A-Za-z0-9_.]+)="([^"]*)"/g;

const KNOWN_INVENTORY_TYPES = new Set(["Slab", "Remnant"]);

/**
 * Coerce scientific-notation or decimal strings to a finite number, or null.
 * @param {unknown} value
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
 * Trim to non-empty string or null.
 * @param {unknown} value
 */
export function cleanString(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Decode common XML entity sequences in attribute values.
 * @param {string} value
 */
export function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x0D;&#x0A;/gi, "\n")
    .replace(/&#x0D;/gi, "\r")
    .replace(/&#x0A;/gi, "\n")
    .replace(/&#x09;/gi, "\t")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * Convert meters → inches (2 decimal places).
 * @param {unknown} meters
 */
export function metersToInches(meters, { decimals = 2 } = {}) {
  const n = toFiniteNumber(meters);
  if (n === null) return null;
  return roundTo(n * METERS_TO_INCHES, decimals);
}

/**
 * Convert square meters → square feet (2 decimal places).
 * @param {unknown} sqMeters
 */
export function sqMetersToSqft(sqMeters, { decimals = 2 } = {}) {
  const n = toFiniteNumber(sqMeters);
  if (n === null) return null;
  return roundTo(n * SQ_METERS_TO_SQFT, decimals);
}

/**
 * Parse attribute string from one `<Slabsmith.dbo.Slabs ...>` tag into a plain object.
 * Attribute names and decoded values are preserved as exported by Slabsmith.
 * @param {string} attrString
 */
export function parseSlabsmithAttributes(attrString) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!attrString) return out;

  let match;
  XML_ATTR_RE.lastIndex = 0;
  while ((match = XML_ATTR_RE.exec(attrString)) !== null) {
    const key = match[1];
    out[key] = decodeXmlEntities(match[2]);
  }
  return out;
}

/**
 * Extract raw attribute objects for every Slabsmith slab node in an XML string.
 * Handles many top-level self-closing nodes without a document root wrapper.
 * @param {string} xmlString
 * @returns {Array<Record<string, string>>}
 */
export function extractSlabsmithSlabNodes(xmlString) {
  const xml = String(xmlString ?? "");
  if (!xml.trim()) return [];

  /** @type {Array<Record<string, string>>} */
  const rows = [];
  let openMatch;

  SLABSMITH_TAG_OPEN_RE.lastIndex = 0;
  while ((openMatch = SLABSMITH_TAG_OPEN_RE.exec(xml)) !== null) {
    const start = openMatch.index + openMatch[0].length;
    const closeIdx = xml.indexOf("/>", start);
    const gtIdx = xml.indexOf(">", start);
    let end = -1;

    if (closeIdx !== -1 && (gtIdx === -1 || closeIdx < gtIdx)) {
      end = closeIdx;
    } else if (gtIdx !== -1) {
      end = gtIdx;
    }

    if (end === -1) continue;

    const attrString = xml.slice(start, end).trim();
    const attrs = parseSlabsmithAttributes(attrString);
    if (Object.keys(attrs).length > 0) {
      rows.push(attrs);
    }
  }

  return rows;
}

/**
 * Resolve stable external identity for cache upsert.
 * Order: InventoryID → SlabID → ParentSlabUID → deterministic hash fallback.
 * @param {Record<string, string>} raw
 * @param {string} hashFallbackSeed
 */
export function resolveExternalSlabId(raw, hashFallbackSeed) {
  const inventoryId = cleanString(raw[SLABSMITH_ATTR.inventoryId]);
  if (inventoryId) return inventoryId;

  const slabId = cleanString(raw[SLABSMITH_ATTR.slabId]);
  if (slabId) return slabId;

  const parentUid = cleanString(raw[SLABSMITH_ATTR.parentSlabUid]);
  if (parentUid) return parentUid;

  return `hash:${hashFallbackSeed}`;
}

/**
 * Normalize Slabsmith Type → source_inventory_type when recognized.
 * @param {unknown} typeRaw
 */
export function normalizeInventoryType(typeRaw) {
  const t = cleanString(typeRaw);
  if (!t) return null;
  if (t === "Slab" || t === "Remnant") return t;
  return null;
}

/**
 * Preserve Slabsmith price group as imported source only. Never remap to Group G.
 * @param {unknown} priceGroupRaw
 */
export function normalizeSourcePriceGroup(priceGroupRaw) {
  return cleanString(priceGroupRaw);
}

/**
 * Fields that contribute to row_hash — meaningful source identity and attributes.
 * @param {Record<string, string>} raw
 */
export function buildRowHashInput(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    inventory_id: cleanString(r[SLABSMITH_ATTR.inventoryId]),
    slab_id: cleanString(r[SLABSMITH_ATTR.slabId]),
    parent_slab_uid: cleanString(r[SLABSMITH_ATTR.parentSlabUid]),
    color_name: cleanString(r[SLABSMITH_ATTR.name]),
    material_name: cleanString(r[SLABSMITH_ATTR.material]),
    source_inventory_type: cleanString(r[SLABSMITH_ATTR.type]),
    source_status: cleanString(r[SLABSMITH_ATTR.status]),
    source_price_group: cleanString(r[SLABSMITH_ATTR.priceGroup]),
    thickness_nominal: cleanString(r[SLABSMITH_ATTR.thicknessNominal]),
    rack: cleanString(r[SLABSMITH_ATTR.rack]),
    lot: cleanString(r[SLABSMITH_ATTR.lot]),
    finish: cleanString(r[SLABSMITH_ATTR.finish]),
    length_actual_m: toFiniteNumber(r[SLABSMITH_ATTR.lengthActual]),
    width_actual_m: toFiniteNumber(r[SLABSMITH_ATTR.widthActual]),
    area_usable_sq_m: toFiniteNumber(r[SLABSMITH_ATTR.areaUsable]),
    area_actual_sq_m: toFiniteNumber(r[SLABSMITH_ATTR.areaActual]),
  };
}

/**
 * Deterministic SHA-256 hash of normalized source fields for change detection.
 * @param {Record<string, string>} raw
 */
export function computeRowHash(raw) {
  const payload = buildRowHashInput(raw);
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Pick usable area in square meters: prefer Area$Usable, fall back to Area$Actual.
 * @param {Record<string, string>} raw
 */
export function pickUsableAreaSqMeters(raw) {
  const usable = toFiniteNumber(raw[SLABSMITH_ATTR.areaUsable]);
  if (usable !== null) return usable;
  return toFiniteNumber(raw[SLABSMITH_ATTR.areaActual]);
}

/**
 * Normalize one Slabsmith attribute object into a slabOS inventory-style record.
 * @param {Record<string, string>} rawAttrs
 */
export function normalizeSlabsmithSlab(rawAttrs) {
  const raw = rawAttrs && typeof rawAttrs === "object" ? rawAttrs : {};
  const rowHash = computeRowHash(raw);
  const externalSlabId = resolveExternalSlabId(raw, rowHash);

  const sourceInventoryType = normalizeInventoryType(raw[SLABSMITH_ATTR.type]);
  // Flag rows whose Slab/Remnant type is missing or unrecognized.
  const needsReview = sourceInventoryType === null;

  const lengthM = toFiniteNumber(raw[SLABSMITH_ATTR.lengthActual]);
  const widthM = toFiniteNumber(raw[SLABSMITH_ATTR.widthActual]);
  const usableSqM = pickUsableAreaSqMeters(raw);

  return {
    external_source: SLABSMITH_EXTERNAL_SOURCE,
    source_system: SLABSMITH_EXTERNAL_SOURCE,
    external_slab_id: externalSlabId,
    inventory_id: cleanString(raw[SLABSMITH_ATTR.inventoryId]),
    color_name: cleanString(raw[SLABSMITH_ATTR.name]),
    material_name: cleanString(raw[SLABSMITH_ATTR.material]),
    source_inventory_type: sourceInventoryType,
    source_inventory_scope: SLABSMITH_SOURCE_SCOPE,
    source_status: cleanString(raw[SLABSMITH_ATTR.status]),
    source_price_group: normalizeSourcePriceGroup(raw[SLABSMITH_ATTR.priceGroup]),
    thickness_nominal: cleanString(raw[SLABSMITH_ATTR.thicknessNominal]),
    rack: cleanString(raw[SLABSMITH_ATTR.rack]),
    lot: cleanString(raw[SLABSMITH_ATTR.lot]),
    finish: cleanString(raw[SLABSMITH_ATTR.finish]),
    width_actual_in: metersToInches(widthM),
    length_actual_in: metersToInches(lengthM),
    usable_sqft: sqMetersToSqft(usableSqM),
    raw_payload: { ...raw },
    row_hash: rowHash,
    needs_review: needsReview,
  };
}

/**
 * Parse Slabsmith XML and return normalized inventory rows.
 * @param {string} xmlString
 * @returns {{ rows: ReturnType<typeof normalizeSlabsmithSlab>[], raw_nodes: Record<string, string>[] }}
 */
export function normalizeSlabsmithInventory(xmlString) {
  const rawNodes = extractSlabsmithSlabNodes(xmlString);
  const rows = rawNodes.map((node) => normalizeSlabsmithSlab(node));
  return { rows, raw_nodes: rawNodes };
}

/**
 * Summarize normalized rows for diagnostics (pure, no I/O).
 * @param {Array<ReturnType<typeof normalizeSlabsmithSlab>>} rows
 */
export function summarizeSlabsmithRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Record<string, number>} */
  const byType = {};
  /** @type {Record<string, number>} */
  const byPriceGroup = {};
  let missingInventoryId = 0;
  let needsReview = 0;

  for (const row of list) {
    const typeKey = row.source_inventory_type ?? "(unknown)";
    byType[typeKey] = (byType[typeKey] || 0) + 1;

    const pgKey = row.source_price_group ?? "(none)";
    byPriceGroup[pgKey] = (byPriceGroup[pgKey] || 0) + 1;

    if (!row.inventory_id) missingInventoryId += 1;
    if (row.needs_review) needsReview += 1;
  }

  return {
    row_count: list.length,
    by_type: byType,
    by_source_price_group: byPriceGroup,
    missing_inventory_id: missingInventoryId,
    needs_review: needsReview,
  };
}

/**
 * Collect sorted unique XML attribute names from raw slab nodes.
 * @param {Array<Record<string, string>>} rawNodes
 */
export function collectSlabsmithFieldNames(rawNodes) {
  const set = new Set();
  for (const node of Array.isArray(rawNodes) ? rawNodes : []) {
    for (const key of Object.keys(node)) set.add(key);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
