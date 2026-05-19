/**
 * Internal Estimates Monday board — column registry, title resolution, payload builders.
 * Server-side only; never log MONDAY_API_TOKEN.
 */

/** @typedef {{ id: string, title: string, type: string, settings_str?: string|null }} MondayColumnMeta */
/** @typedef {{ id: string, title: string }} MondayGroupMeta */
/** @typedef {{ boardId: string, boardName?: string|null, columns: MondayColumnMeta[], groups: MondayGroupMeta[] }} MondayBoardSchema */

/** @typedef {{ key: string, envKeys: string[], titles: string[], valueKind: 'text'|'long_text'|'number'|'money'|'integer'|'date'|'status'|'email'|'phone'|'link' }} InternalFieldSpec */

export const INTERNAL_MONDAY_FIELD_SPECS = /** @type {InternalFieldSpec[]} */ ([
  { key: "quote_id", envKeys: ["MONDAY_INTERNAL_COL_QUOTE_ID"], titles: ["Quote ID", "ESF Quote #", "Quote #"], valueKind: "text" },
  { key: "quote_date", envKeys: ["MONDAY_INTERNAL_COL_QUOTE_DATE", "MONDAY_INTERNAL_COL_CREATED_DATE"], titles: ["Quote Date", "Created Date", "Date"], valueKind: "date" },
  { key: "salesperson", envKeys: ["MONDAY_INTERNAL_COL_SALESPERSON", "MONDAY_INTERNAL_COL_SALES_REP_TEXT"], titles: ["Salesperson", "Sales Rep", "Sales Representative"], valueKind: "text" },
  {
    key: "account",
    envKeys: ["MONDAY_INTERNAL_COL_ACCOUNT", "MONDAY_INTERNAL_COL_CUSTOMER"],
    titles: ["Account Master List", "Account", "Customer", "Customer Name"],
    valueKind: "text"
  },
  {
    key: "estimated_by",
    envKeys: ["MONDAY_INTERNAL_COL_ESTIMATED_BY", "MONDAY_INTERNAL_COL_ENTERED_BY"],
    titles: ["Estimated By", "Entered By", "Prepared By"],
    valueKind: "text"
  },
  {
    key: "branch",
    envKeys: ["MONDAY_INTERNAL_COL_BRANCH", "MONDAY_INTERNAL_COL_BRANCH_TEXT"],
    titles: ["Branch Location", "Branch"],
    valueKind: "text"
  },
  {
    key: "est_sq_ft",
    envKeys: ["MONDAY_INTERNAL_COL_EST_SQ_FT", "MONDAY_INTERNAL_COL_ESTIMATED_SQFT"],
    titles: ["Est Sq Ft", "Estimated Sq Ft", "Sq Ft", "Square Footage"],
    valueKind: "integer"
  },
  {
    key: "quote_amount",
    envKeys: ["MONDAY_INTERNAL_COL_QUOTE_AMOUNT", "MONDAY_INTERNAL_COL_QUOTE_VALUE"],
    titles: ["Quote Amount", "Quote Value", "Grand Total"],
    valueKind: "money"
  },
  { key: "room_count", envKeys: ["MONDAY_INTERNAL_COL_ROOM_COUNT"], titles: ["Room Count", "Rooms"], valueKind: "integer" },
  { key: "status", envKeys: ["MONDAY_INTERNAL_COL_STATUS"], titles: ["Status"], valueKind: "status" },
  { key: "phone", envKeys: ["MONDAY_INTERNAL_COL_PHONE"], titles: ["Phone"], valueKind: "phone" },
  { key: "email", envKeys: ["MONDAY_INTERNAL_COL_EMAIL"], titles: ["Email"], valueKind: "email" },
  {
    key: "project_address",
    envKeys: ["MONDAY_INTERNAL_COL_PROJECT_ADDRESS", "MONDAY_INTERNAL_COL_PROJECT"],
    titles: ["Project Address", "Address", "Job Address"],
    valueKind: "text"
  },
  { key: "city", envKeys: ["MONDAY_INTERNAL_COL_CITY"], titles: ["City"], valueKind: "text" },
  { key: "state", envKeys: ["MONDAY_INTERNAL_COL_STATE"], titles: ["State"], valueKind: "text" },
  {
    key: "estimate_summary",
    envKeys: ["MONDAY_INTERNAL_COL_ESTIMATE_SUMMARY"],
    titles: ["Estimate Summary"],
    valueKind: "long_text"
  },
  { key: "estimate_link", envKeys: ["MONDAY_INTERNAL_COL_ESTIMATE_LINK"], titles: ["Estimate Link", "Quote Link", "Link"], valueKind: "link" },
  { key: "revision", envKeys: ["MONDAY_INTERNAL_COL_REVISION"], titles: ["Revision", "Rev"], valueKind: "text" },
  {
    key: "last_revised",
    envKeys: ["MONDAY_INTERNAL_COL_LAST_REVISED"],
    titles: ["Last Revised", "Last Updated"],
    valueKind: "date"
  },
  { key: "pricing_mode", envKeys: ["MONDAY_INTERNAL_COL_PRICING_MODE"], titles: ["Pricing Mode"], valueKind: "text" }
]);

export const INTERNAL_MONDAY_GROUP_ENV_KEYS = {
  new_quotes: "MONDAY_INTERNAL_GROUP_NEW_QUOTES",
  in_review: "MONDAY_INTERNAL_GROUP_IN_REVIEW",
  approved: "MONDAY_INTERNAL_GROUP_APPROVED_QUOTES"
};

export const INTERNAL_MONDAY_GROUP_TITLES = {
  new_quotes: "New Quotes",
  in_review: "In Review",
  approved: "Approved Quotes"
};

/** Flat list of env var names that enable internal column mapping. */
export const INTERNAL_MONDAY_COLUMN_MAPPING_ENV_NAMES = [
  ...new Set(INTERNAL_MONDAY_FIELD_SPECS.flatMap((s) => s.envKeys))
];

const UNSUPPORTED_MONDAY_TYPES = new Set([
  "people",
  "multiple-person",
  "dropdown",
  "tags",
  "board_relation",
  "connect_boards",
  "mirror",
  "dependency",
  "item_id",
  "subtasks",
  "hour",
  "week",
  "timeline",
  "world_clock",
  "country",
  "location",
  "color_picker",
  "vote",
  "rating",
  "progress",
  "button",
  "doc",
  "file",
  "auto_number"
]);

export function normalizeMondayBoardTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function internalMondayColumnMappingConfigured(env = process.env) {
  return INTERNAL_MONDAY_COLUMN_MAPPING_ENV_NAMES.some((k) => String(env[k] || "").trim().length > 0);
}

/**
 * @param {string} title
 * @param {MondayColumnMeta[]} columns
 * @returns {MondayColumnMeta|null}
 */
export function findMondayColumnByTitle(title, columns) {
  const want = normalizeMondayBoardTitle(title);
  if (!want) return null;
  for (const c of columns || []) {
    if (normalizeMondayBoardTitle(c.title) === want) return c;
  }
  return null;
}

/**
 * @param {string} title
 * @param {MondayGroupMeta[]} groups
 * @returns {MondayGroupMeta|null}
 */
export function findMondayGroupByTitle(title, groups) {
  const want = normalizeMondayBoardTitle(title);
  if (!want) return null;
  for (const g of groups || []) {
    if (normalizeMondayBoardTitle(g.title) === want) return g;
  }
  return null;
}

/**
 * @param {InternalFieldSpec} spec
 * @param {Record<string, string>} [env]
 * @param {MondayColumnMeta[]} [columns]
 * @returns {{ columnId: string|null, columnType: string|null, source: 'env'|'title'|null, envKeyUsed?: string|null }}
 */
export function resolveInternalFieldColumn(spec, env = process.env, columns = []) {
  for (const envKey of spec.envKeys) {
    const id = String(env[envKey] || "").trim();
    if (id) {
      const col = columns.find((c) => c.id === id);
      return { columnId: id, columnType: col?.type ?? null, source: "env", envKeyUsed: envKey };
    }
  }
  for (const title of spec.titles) {
    const col = findMondayColumnByTitle(title, columns);
    if (col?.id) return { columnId: col.id, columnType: col.type ?? null, source: "title", envKeyUsed: null };
  }
  return { columnId: null, columnType: null, source: null, envKeyUsed: null };
}

/**
 * @param {{ env?: Record<string, string>, boardSchema?: MondayBoardSchema|null, allowTitleMatch?: boolean }} opts
 * @returns {Record<string, { columnId: string, columnType: string|null, source: string, envKeyUsed?: string|null, valueKind: string }>}
 */
export function resolveInternalMondayColumnMap(opts = {}) {
  const env = opts.env && typeof opts.env === "object" ? opts.env : process.env;
  const columns = opts.boardSchema?.columns ?? [];
  const allowTitle = opts.allowTitleMatch !== false && columns.length > 0;
  /** @type {Record<string, { columnId: string, columnType: string|null, source: string, envKeyUsed?: string|null, valueKind: string }>} */
  const map = {};
  for (const spec of INTERNAL_MONDAY_FIELD_SPECS) {
    let resolved = resolveInternalFieldColumn(spec, env, columns);
    if (!resolved.columnId && !allowTitle) {
      resolved = { columnId: null, columnType: null, source: null, envKeyUsed: null };
    } else if (!resolved.columnId && allowTitle) {
      resolved = resolveInternalFieldColumn(spec, env, columns);
    }
    if (resolved.columnId) {
      map[spec.key] = {
        columnId: resolved.columnId,
        columnType: resolved.columnType,
        source: resolved.source || "unknown",
        envKeyUsed: resolved.envKeyUsed ?? null,
        valueKind: spec.valueKind
      };
    }
  }
  return map;
}

/**
 * @param {string} quoteStatus
 * @returns {string}
 */
export function mapInternalStatusToMondayLabel(quoteStatus) {
  const s = String(quoteStatus || "draft").trim().toLowerCase();
  const map = {
    draft: "Draft",
    testing_review: "In review",
    sent: "Sent",
    follow_up: "Follow up",
    revised: "Revised",
    sold: "Sold",
    lost: "Lost",
    archived: "Archived",
    submitted: "Submitted"
  };
  return map[s] || String(process.env.MONDAY_INTERNAL_STATUS_LABEL || "Draft").trim() || "Draft";
}

/**
 * @param {string} quoteStatus
 * @returns {'new_quotes'|'in_review'|'approved'|null}
 */
export function resolveInternalGroupKeyForStatus(quoteStatus) {
  const s = String(quoteStatus || "draft").trim().toLowerCase();
  if (["draft", "testing_review"].includes(s)) return "new_quotes";
  if (["sent", "follow_up", "revised", "submitted"].includes(s)) return "in_review";
  if (["sold"].includes(s)) return "approved";
  return "new_quotes";
}

/**
 * Item name: `ESF Quote # - Customer/Account - City, ST` with fallbacks.
 * @param {Record<string, unknown>} payload
 */
export function buildInternalMondayItemName(payload) {
  const qn = String(payload.quote_number || "").trim();
  const prefix = qn ? (qn.toUpperCase().startsWith("ESF") ? qn : `ESF ${qn}`) : "";
  const customer = String(payload.customer_name || "").trim();
  const account = String(payload.account_name || payload.partner_account || "").trim();
  const project = String(payload.project_name || "").trim();
  const cn = customer || account || project || "Customer";
  const city = String(payload.city || "").trim();
  const st = String(payload.state || "").trim();
  const loc = city && st ? `${city}, ${st}` : city || st || "";
  if (prefix && loc) return `${prefix} - ${cn} - ${loc}`;
  if (prefix) return `${prefix} - ${cn}`;
  if (loc) return `Internal Estimate - ${cn} - ${loc}`;
  return `Internal Estimate - ${cn}`;
}

/**
 * @param {unknown} snapshot
 * @returns {Array<{ name?: string, useTaxMode?: string, vanityProgram2026?: boolean }>}
 */
function roomRowsFromSnapshot(snapshot) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  const drafts = Array.isArray(iu.estimate_room_drafts) ? iu.estimate_room_drafts : null;
  if (drafts?.length) {
    return drafts.map((r) => ({
      name: r?.name ?? r?.roomName ?? r?.label,
      useTaxMode: r?.useTaxMode ?? r?.use_tax_mode,
      vanityProgram2026: Boolean(r?.vanityProgram2026 ?? r?.vanity_program_2026)
    }));
  }
  const rooms = Array.isArray(iu.estimate_rooms) ? iu.estimate_rooms : [];
  return rooms.map((r) => ({
    name: r?.name ?? r?.roomName,
    useTaxMode: r?.useTaxMode,
    vanityProgram2026: Boolean(r?.vanityProgram2026)
  }));
}

/**
 * Compact Monday estimate summary — no internal-only custom line names.
 * @param {{ calc?: Record<string, unknown>, body?: Record<string, unknown>, snapshot?: Record<string, unknown>, payload?: Record<string, unknown> }} input
 */
export function buildInternalEstimateSummaryForMonday(input = {}) {
  const calc = input.calc && typeof input.calc === "object" ? input.calc : {};
  const body = input.body && typeof input.body === "object" ? input.body : {};
  const snapshot = input.snapshot && typeof input.snapshot === "object" ? input.snapshot : {};
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};

  const rooms = roomRowsFromSnapshot(snapshot);
  const roomNames = rooms.map((r) => String(r.name || "").trim()).filter(Boolean);
  const sf = Number(calc?.totals?.estimated_sqft ?? payload.estimated_square_footage ?? 0);
  const total = Number(calc?.totals?.retail ?? payload.quote_total ?? 0);
  const parts = [];
  if (roomNames.length) parts.push(`Rooms: ${roomNames.join(", ")}.`);
  if (Number.isFinite(sf) && sf > 0) parts.push(`Sq.Ft: ${sf.toFixed(1)}.`);
  if (Number.isFinite(total)) parts.push(`Total: $${Math.round(total).toLocaleString("en-US")}.`);

  const taxRooms = rooms.filter((r) => {
    const m = String(r.useTaxMode || "").toLowerCase();
    return m && m !== "none" && m !== "off";
  });
  if (taxRooms.length === 1 && taxRooms[0].name) {
    parts.push(`Use tax: ${taxRooms[0].name} ${taxRooms[0].useTaxMode}.`);
  } else if (taxRooms.length > 1) {
    parts.push(`Use tax: ${taxRooms.length} room(s).`);
  } else {
    const pct = Math.max(0, Number(body.useTaxPercent ?? body.use_tax_percent ?? snapshot?.internal_ui?.use_tax_percent ?? 0) || 0);
    if (pct > 0) parts.push(`Use tax: ${pct}%.`);
  }

  if (rooms.some((r) => r.vanityProgram2026)) parts.push("Vanity program: Yes.");

  const mode = String(body.internalMaterialBasis ?? body.internal_material_basis ?? "wholesale").toLowerCase();
  parts.push(`Pricing: ${mode === "direct" ? "Direct" : "Wholesale"}.`);

  const customLines = Array.isArray(body.customLineItems ?? body.custom_line_items)
    ? body.customLineItems ?? body.custom_line_items
    : Array.isArray(snapshot?.internal_ui?.custom_line_items)
      ? snapshot.internal_ui.custom_line_items
      : [];
  const visibleNames = customLines
    .filter((row) => row && row.customerFacing !== false && row.customer_facing !== false)
    .map((row) => String(row.name || "").trim())
    .filter(Boolean);
  if (visibleNames.length) parts.push(`Add-ons: ${visibleNames.join(", ")}.`);

  return parts.join(" ").slice(0, 1800);
}

function formatMondayNumberString(value, mode) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (mode === "money") {
    const r = Math.round(n * 100) / 100;
    if (Number.isInteger(r) || Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
    return r.toFixed(2);
  }
  return String(Math.round(n));
}

function recordSkipped(skippedColumns, reason, detail) {
  skippedColumns.push({ reason, detail: detail ?? null });
}

/**
 * @param {string} em
 */
export function isValidEmailForMonday(em) {
  const t = String(em || "").trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeMondayUsPhone10(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

function isUnsupportedMondayColumnType(columnType) {
  const t = String(columnType || "").trim().toLowerCase();
  if (!t) return false;
  return UNSUPPORTED_MONDAY_TYPES.has(t);
}

/**
 * @param {{ fieldKey: string, rawValue: unknown, valueKind: string, columnType: string|null, columnId: string }} p
 * @returns {{ value: unknown|null, skipReason?: string }}
 */
export function formatValueForMondayColumn(p) {
  const { rawValue, valueKind, columnType } = p;
  const colType = String(columnType || "").trim().toLowerCase();

  if (isUnsupportedMondayColumnType(colType)) {
    return { value: null, skipReason: `unsupported_column_type:${colType}` };
  }

  if (rawValue === null || rawValue === undefined) {
    return { value: null, skipReason: "empty_value" };
  }

  const effectiveKind =
    colType === "long_text" && valueKind === "text"
      ? "long_text"
      : colType === "numbers" && (valueKind === "money" || valueKind === "integer" || valueKind === "number")
        ? valueKind
        : colType === "date" && valueKind !== "date"
          ? "date"
          : colType === "status" && valueKind !== "status"
            ? "status"
            : colType === "email" && valueKind !== "email"
              ? "email"
              : colType === "phone" && valueKind !== "phone"
                ? "phone"
                : colType === "link" && valueKind !== "link"
                  ? "link"
                  : valueKind;

  if (effectiveKind === "text" || effectiveKind === "long_text") {
    const s = String(rawValue).trim();
    if (!s) return { value: null, skipReason: "empty_value" };
    if (colType && !["text", "long_text", ""].includes(colType) && colType !== effectiveKind) {
      return { value: null, skipReason: `type_mismatch:${colType}` };
    }
    return { value: s };
  }

  if (effectiveKind === "number" || effectiveKind === "money" || effectiveKind === "integer") {
    const mode = effectiveKind === "money" ? "money" : "integer";
    const s = formatMondayNumberString(rawValue, mode);
    if (s == null) return { value: null, skipReason: "invalid_number" };
    if (colType && colType !== "numbers" && colType !== "") {
      return { value: null, skipReason: `type_mismatch:${colType}` };
    }
    return { value: s };
  }

  if (effectiveKind === "date") {
    const raw = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
    const iso = Number.isFinite(raw.getTime()) ? raw.toISOString().slice(0, 10) : null;
    if (!iso) return { value: null, skipReason: "invalid_date" };
    if (colType && colType !== "date" && colType !== "") return { value: null, skipReason: `type_mismatch:${colType}` };
    return { value: { date: iso } };
  }

  if (effectiveKind === "status") {
    const label = String(rawValue).trim();
    if (!label) return { value: null, skipReason: "empty_value" };
    if (colType && colType !== "status" && colType !== "") return { value: null, skipReason: `type_mismatch:${colType}` };
    return { value: { label } };
  }

  if (effectiveKind === "email") {
    const em = String(rawValue).trim();
    if (!isValidEmailForMonday(em)) return { value: null, skipReason: "invalid_email" };
    if (colType && colType !== "email" && colType !== "") return { value: null, skipReason: `type_mismatch:${colType}` };
    return { value: { email: em, text: em } };
  }

  if (effectiveKind === "phone") {
    const phone10 = normalizeMondayUsPhone10(rawValue);
    if (!phone10) return { value: null, skipReason: "invalid_or_missing_phone" };
    if (colType && colType !== "phone" && colType !== "") return { value: null, skipReason: `type_mismatch:${colType}` };
    return { value: { phone: phone10, countryShortName: "US" } };
  }

  if (effectiveKind === "link") {
    const link = rawValue && typeof rawValue === "object" ? rawValue : null;
    const url = String(link?.url ?? rawValue ?? "").trim();
    if (!url) return { value: null, skipReason: "empty_value" };
    const text = String(link?.text ?? url).trim() || url;
    if (colType && colType !== "link" && colType !== "") return { value: null, skipReason: `type_mismatch:${colType}` };
    return { value: { url, text } };
  }

  return { value: null, skipReason: "unknown_value_kind" };
}

/**
 * Extract field values from quote Monday payload.
 * @param {Record<string, unknown>} payload
 */
export function extractInternalFieldValues(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const qn = String(p.quote_number || "").trim();
  const quoteIdDisplay = qn || (p.quote_id != null ? String(p.quote_id).trim() : "");
  const quoteDate = p.quote_date || p.created_date || null;
  const roomCount = Number(p.room_count);
  return {
    quote_id: quoteIdDisplay,
    quote_date: quoteDate,
    salesperson: p.sales_rep ?? null,
    account: p.account_name ?? p.partner_account ?? p.customer_name ?? null,
    estimated_by: p.prepared_by ?? p.entered_by ?? null,
    branch: p.branch ?? null,
    est_sq_ft: p.estimated_square_footage ?? null,
    quote_amount: p.quote_total ?? null,
    room_count: Number.isFinite(roomCount) && roomCount >= 0 ? roomCount : null,
    status: mapInternalStatusToMondayLabel(p.quote_status),
    phone: p.customer_phone ?? null,
    email: p.customer_email ?? null,
    project_address: p.project_address_street ?? p.project_address ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    estimate_summary: String(p.internal_estimate_summary || "").trim() || null,
    estimate_link: p.estimate_link ?? p.internal_estimate_deep_link ?? p.quote_library_link ?? null,
    revision: p.revision_label ?? null,
    last_revised: p.last_revised_at ?? p.updated_at ?? null,
    pricing_mode: p.pricing_mode_label ?? null
  };
}

/**
 * Build Monday column_values from resolved map + payload.
 * @param {{ payload: Record<string, unknown>, estimateSummary?: string, columnMap: Record<string, { columnId: string, columnType: string|null, valueKind: string }> }} input
 */
export function buildMondayInternalColumnValuesFromMap(input) {
  const payload = input?.payload && typeof input.payload === "object" ? input.payload : {};
  const estimateSummary = String(input?.estimateSummary ?? payload.internal_estimate_summary ?? "").trim();
  const columnMap = input?.columnMap && typeof input.columnMap === "object" ? input.columnMap : {};
  const fieldValues = extractInternalFieldValues({ ...payload, internal_estimate_summary: estimateSummary || payload.internal_estimate_summary });
  if (estimateSummary) fieldValues.estimate_summary = estimateSummary;

  /** @type {Record<string, unknown>} */
  const columnValues = {};
  /** @type {string[]} */
  const attemptedColumnIds = [];
  /** @type {Array<{ reason: string, detail?: string|null }>} */
  const skippedColumns = [];

  for (const spec of INTERNAL_MONDAY_FIELD_SPECS) {
    const mapped = columnMap[spec.key];
    if (!mapped?.columnId) {
      recordSkipped(skippedColumns, "no_column_id", spec.envKeys[0]);
      continue;
    }
    const raw = fieldValues[spec.key];
    const formatted = formatValueForMondayColumn({
      fieldKey: spec.key,
      rawValue: raw,
      valueKind: spec.valueKind,
      columnType: mapped.columnType,
      columnId: mapped.columnId
    });
    if (formatted.value == null) {
      recordSkipped(skippedColumns, formatted.skipReason || "skipped", spec.key);
      continue;
    }
    columnValues[mapped.columnId] = formatted.value;
    attemptedColumnIds.push(mapped.columnId);
  }

  return { columnValues, attemptedColumnIds, skippedColumns };
}

/**
 * Split column values into incremental groups (same shape as public sync).
 * @param {Record<string, unknown>} columnValues
 */
export function splitInternalColumnValuesIntoGroups(columnValues) {
  const entries = Object.entries(columnValues || {});
  /** @type {Record<string, unknown>} */
  const groupA = {};
  /** @type {Record<string, unknown>} */
  const groupB = {};
  /** @type {Record<string, unknown>} */
  const groupC = {};
  /** @type {Record<string, unknown>} */
  const groupD = {};
  /** @type {Record<string, unknown>} */
  const groupE = {};
  /** @type {Record<string, unknown>} */
  const groupF = {};

  for (const [colId, val] of entries) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      if ("date" in val) {
        groupC[colId] = val;
        continue;
      }
      if ("label" in val) {
        groupD[colId] = val;
        continue;
      }
      if ("email" in val) {
        groupE[colId] = val;
        continue;
      }
      if ("phone" in val) {
        groupF[colId] = val;
        continue;
      }
      if ("url" in val) {
        groupB[colId] = val;
        continue;
      }
    }
    if (typeof val === "string" && val.length > 400) {
      groupB[colId] = val;
    } else {
      groupA[colId] = val;
    }
  }

  return { groupA, groupB, groupC, groupD, groupE, groupF, skippedColumns: [] };
}

/**
 * @param {{ itemName: string, groupKey: string|null, groupTitle: string|null, columnValues: Record<string, unknown>, skippedColumns: Array<{reason: string, detail?: string|null}>, action: 'create'|'update', mondayItemId?: string|null }} plan
 */
export function buildInternalMondayDryRunResult(plan) {
  return {
    dry_run: true,
    action: plan.action,
    monday_item_id: plan.mondayItemId ?? null,
    item_name: plan.itemName,
    target_group_key: plan.groupKey ?? null,
    target_group_title: plan.groupTitle ?? null,
    column_values: plan.columnValues,
    column_ids: Object.keys(plan.columnValues || {}),
    skipped_columns: plan.skippedColumns || []
  };
}

/**
 * @param {{ env?: Record<string, string>, groups?: MondayGroupMeta[] }} opts
 * @returns {{ groupId: string|null, groupTitle: string|null, groupKey: string|null }}
 */
export function resolveInternalMondayGroupId(opts) {
  const env = opts.env && typeof opts.env === "object" ? opts.env : process.env;
  const groups = opts.groups ?? [];
  const statusKey =
    opts.groupKey && typeof opts.groupKey === "string"
      ? opts.groupKey
      : resolveInternalGroupKeyForStatus(opts.quoteStatus);
  const title = INTERNAL_MONDAY_GROUP_TITLES[statusKey] || INTERNAL_MONDAY_GROUP_TITLES.new_quotes;
  const envKey = INTERNAL_MONDAY_GROUP_ENV_KEYS[statusKey];
  const fromEnv = envKey ? String(env[envKey] || "").trim() : "";
  if (fromEnv) return { groupId: fromEnv, groupTitle: title, groupKey: statusKey };
  const found = findMondayGroupByTitle(title, groups);
  if (found) return { groupId: found.id, groupTitle: title, groupKey: statusKey };
  return { groupId: null, groupTitle: title, groupKey: statusKey };
}

const MONDAY_BOARD_SCHEMA_QUERY = `
query ($boardIds: [ID!]!) {
  boards(ids: $boardIds) {
    id
    name
    columns { id title type settings_str }
    groups { id title }
  }
}
`;

/**
 * Fetch board columns + groups (server-side only).
 * @param {string} token
 * @param {string} boardId
 * @param {(token: string, query: string, variables?: Record<string, unknown>) => Promise<unknown>} graphqlFn
 * @returns {Promise<MondayBoardSchema|null>}
 */
export async function fetchMondayBoardSchema(token, boardId, graphqlFn) {
  const bid = String(boardId || "").trim();
  if (!bid || !token || typeof graphqlFn !== "function") return null;
  const json = await graphqlFn(token, MONDAY_BOARD_SCHEMA_QUERY, { boardIds: [bid] });
  const board = json?.data?.boards?.[0];
  if (!board) return null;
  return {
    boardId: String(board.id),
    boardName: board.name ?? null,
    columns: (board.columns || []).map((c) => ({
      id: String(c.id),
      title: String(c.title || ""),
      type: String(c.type || ""),
      settings_str: c.settings_str ?? null
    })),
    groups: (board.groups || []).map((g) => ({
      id: String(g.id),
      title: String(g.title || "")
    }))
  };
}
