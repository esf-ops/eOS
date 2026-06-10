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

const INTERNAL_NOTE_KEYS = new Set(["internalNote", "internal_note", "worksheetNote", "worksheet_note"]);

/** Pricing-rate leaks — intentionally excludes CSS `margin:` and area labels like `35 sf counter`. */
const PRICING_LEAK_PATTERNS = [
  { patternId: "dollar_per_sf", re: /\$\s*[\d.,]+\s*\/\s*(?:sqft|sf)\b/i },
  { patternId: "price_per_sf", re: /\bprice\s+per\s+(?:sqft|sf)\b/i },
  { patternId: "rate_per_sf", re: /\brate\s+per\s+(?:sqft|sf)\b/i },
  { patternId: "wholesale_pricing", re: /\bwholesale\s+(?:rate|price|markup)\b/i },
  { patternId: "direct_pricing", re: /\bdirect\s+(?:rate|price|markup)\b/i },
  { patternId: "markup_percent_leak", re: /\b(?:dealer|retail|planning)\s+markup\s*[:=]?\s*\d+\s*%/i }
];

/** Snapshot / worksheet identifiers unlikely in customer prose — word-boundary or JSON-key shaped. */
const INTERNAL_CONTENT_PATTERNS = [
  { patternId: "internal_ui", re: /\binternal_ui\b/i, category: "internal_snapshot_key" },
  { patternId: "internal_estimate_math", re: /\binternal_estimate_math\b/i, category: "internal_snapshot_key" },
  { patternId: "input_summary", re: /\binputSummary\b/, category: "internal_snapshot_key" },
  { patternId: "line_item_details", re: /\blineItemDetails\b/, category: "internal_snapshot_key" },
  { patternId: "room_lines", re: /\broomLines\b/, category: "internal_snapshot_key" },
  { patternId: "room_measurement_summaries", re: /\broomMeasurementSummaries\b/, category: "internal_snapshot_key" },
  { patternId: "measurement_source", re: /\bmeasurement_source\b/i, category: "internal_snapshot_key" },
  { patternId: "quote_input_mode", re: /\bquoteInputMode\b/, category: "internal_snapshot_key" },
  { patternId: "rule_count", re: /\bruleCount\b/, category: "internal_snapshot_key" },
  { patternId: "file_checklist", re: /\bfile_checklist\b/i, category: "internal_snapshot_key" },
  { patternId: "readiness_json_key", re: /["']readiness["']\s*:/, category: "internal_snapshot_key" },
  { patternId: "internal_note_key", re: /\binternal_note\s*:|"internalNote"\s*:/i, category: "worksheet_diagnostic" },
  { patternId: "worksheet_note", re: /\bworksheet_note\b|\bworksheetNote\b/i, category: "worksheet_diagnostic" },
  {
    patternId: "raw_snapshot_json",
    re: /"calculation_snapshot"\s*:|"custom_line_items"\s*:/,
    category: "worksheet_diagnostic"
  }
];

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
 * Audit customer-facing HTML/text for leaked internal identifiers or pricing rates.
 * Returns violation categories/pattern ids only — never matched secret substrings.
 * @param {string} text
 */
export function auditCustomerSafeText(text) {
  const s = String(text || "");
  /** @type {Array<{ category: string, patternId: string }>} */
  const violations = [];

  for (const p of INTERNAL_CONTENT_PATTERNS) {
    if (p.re.test(s)) {
      violations.push({ category: p.category, patternId: p.patternId });
    }
  }
  for (const p of PRICING_LEAK_PATTERNS) {
    if (p.re.test(s)) {
      violations.push({ category: "pricing_rate_leak", patternId: p.patternId });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * @param {string} text
 */
export function assertCustomerSafeText(text) {
  return auditCustomerSafeText(text).ok;
}

/**
 * @param {"HTML"|"Text"} channel
 * @param {{ ok: boolean, violations: Array<{ category: string, patternId: string }> }} audit
 */
export function formatCustomerSafeViolationWarning(channel, audit) {
  if (audit.ok) return null;
  const byCategory = new Map();
  for (const v of audit.violations) {
    if (!byCategory.has(v.category)) byCategory.set(v.category, []);
    byCategory.get(v.category).push(v.patternId);
  }
  const parts = [...byCategory.entries()].map(([cat, ids]) => `${cat}(${ids.join("|")})`);
  return `${channel} preview failed customer-safe check: ${parts.join("; ")}`;
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
    const isPricingString =
      PRICING_LEAK_PATTERNS.some((p) => typeof value === "string" && p.re.test(value));
    if (isPricingString) continue;
    out[key] = value;
  }
  return out;
}
