/**
 * Strip internal-only fields from quote snapshot payloads before customer delivery.
 */

const INTERNAL_SNAPSHOT_KEYS = new Set([
  "internal_ui",
  "internal_estimate_math",
  "inputSummary",
  "lineItemDetails",
  "roomLines",
  "roomMeasurementSummaries",
  "measurement_source",
  "quoteInputMode",
  "ruleCount",
  "readiness",
  "file_checklist"
]);

const INTERNAL_UI_KEYS = new Set([
  "custom_line_items",
  "custom_passthrough_items",
  "internal_material_basis",
  "estimate_room_drafts",
  "job_info"
]);

const RATE_FIELD_RE = /(?:price|rate|markup|margin|cost|wholesale|direct).*?(?:sqft|sf|per)/i;
const INTERNAL_NOTE_KEYS = new Set(["internalNote", "internal_note", "worksheetNote", "worksheet_note"]);

/**
 * @param {unknown} line
 */
export function isCustomerFacingCustomLine(line) {
  if (!line || typeof line !== "object") return false;
  return line.customerFacing === true || line.customer_facing === true;
}

/**
 * @param {Array<unknown>} lines
 */
export function filterCustomerFacingCustomLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(isCustomerFacingCustomLine).map(sanitizeCustomLineForCustomer);
}

/**
 * @param {Record<string, unknown>} line
 */
function sanitizeCustomLineForCustomer(line) {
  return {
    name: str(line.name) || str(line.item_name) || "Custom item",
    description: str(line.description) || null,
    qty: num(line.qty ?? line.quantity),
    lineTotal: num(line.lineTotal ?? line.line_total ?? line.amount)
  };
}

function str(v) {
  return v != null && String(v).trim() ? String(v).trim() : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>|null|undefined} snapshot
 */
export function sanitizeSnapshotForCustomer(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { sanitized: {}, warnings: ["Quote snapshot missing or invalid"] };
  }

  const warnings = [];
  const iu =
    snapshot.internal_ui && typeof snapshot.internal_ui === "object" ? snapshot.internal_ui : {};

  const customerLines = filterCustomerFacingCustomLines(iu.custom_line_items);
  const nonCustomerLineCount = Array.isArray(iu.custom_line_items)
    ? iu.custom_line_items.filter((ln) => !isCustomerFacingCustomLine(ln)).length
    : 0;
  if (nonCustomerLineCount > 0) {
    warnings.push(`${nonCustomerLineCount} internal-only custom line(s) excluded from delivery content`);
  }

  const notes = parseCustomerFacingNotes(
    iu.customer_estimate_customer_facing_notes ?? iu.customerFacingNotes ?? null
  );

  const displayTotal = num(iu.customer_display_total);
  const roomSummaries = buildRoomSummaries(iu, snapshot, warnings);

  const sanitized = {
    customerDisplayTotal: displayTotal,
    customerFacingCustomLines: customerLines,
    customerFacingNotes: notes,
    roomSummaries,
    materialGroup: str(snapshot.materialGroup ?? snapshot.material_group) || null,
    estimatedSqft: num(snapshot.totals?.estimated_sqft)
  };

  return { sanitized, warnings };
}

/**
 * @param {string|null|undefined} raw
 */
function parseCustomerFacingNotes(raw) {
  if (raw == null || !String(raw).trim()) return [];
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * @param {Record<string, unknown>} iu
 * @param {Record<string, unknown>} snapshot
 * @param {string[]} warnings
 */
function buildRoomSummaries(iu, snapshot, warnings) {
  const rooms = Array.isArray(iu.estimate_rooms)
    ? iu.estimate_rooms
    : Array.isArray(snapshot.estimate_rooms)
      ? snapshot.estimate_rooms
      : [];

  if (!rooms.length) {
    warnings.push("Room breakdown unavailable from snapshot — summary only");
    return [];
  }

  return rooms.slice(0, 40).map((room, idx) => {
    const name = str(room.name ?? room.room_name) || `Area ${idx + 1}`;
    const ct = num(room.countertopSqft ?? room.countertop_sqft ?? room.roomCounter);
    const bs = num(room.backsplashSqft ?? room.backsplash_sqft ?? room.roomSplash);
    return { name, countertopSqft: ct, backsplashSqft: bs };
  });
}

/**
 * Ensure serialized customer content never leaks internal keys or rate fields.
 * @param {string} text
 */
export function assertCustomerSafeText(text) {
  const s = String(text || "");
  for (const key of INTERNAL_SNAPSHOT_KEYS) {
    if (s.includes(key)) return false;
  }
  if (/\$\s*[\d.]+\s*\/\s*sf/i.test(s)) return false;
  if (RATE_FIELD_RE.test(s)) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} obj
 */
export function redactInternalFieldsFromObject(obj) {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (INTERNAL_SNAPSHOT_KEYS.has(key) || INTERNAL_UI_KEYS.has(key)) continue;
    if (INTERNAL_NOTE_KEYS.has(key)) continue;
    if (typeof value === "string" && RATE_FIELD_RE.test(value)) continue;
    out[key] = value;
  }
  return out;
}
