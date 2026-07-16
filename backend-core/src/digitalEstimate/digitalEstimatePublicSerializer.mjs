/**
 * Public-safe Digital Estimate DTO — explicit allowlist builder.
 * Never starts from an internal quote API response.
 */

export const PUBLIC_ESTIMATE_DTO_KEYS = Object.freeze([
  "documentTitle",
  "quoteNumber",
  "revisionLabel",
  "revisionNumber",
  "publishedAt",
  "pricingValidThrough",
  "project",
  "rooms",
  "lineItems",
  "totals",
  "notes",
  "disclosures",
  "print"
]);

export const PUBLIC_PROJECT_KEYS = Object.freeze([
  "customerName",
  "projectName",
  "projectAddress"
]);

export const PUBLIC_ROOM_KEYS = Object.freeze([
  "name",
  "summaryLines",
  "materialLabel",
  "colorLabel"
]);

export const PUBLIC_LINE_KEYS = Object.freeze(["label", "amount"]);

export const PUBLIC_TOTALS_KEYS = Object.freeze([
  "estimatedProjectTotal",
  "currency",
  "rounding"
]);

/**
 * @param {Record<string, unknown>} customerSnapshot frozen customer_snapshot_json
 * @param {{ accessExpiresAt?: string|null }} [access]
 */
export function buildPublicDigitalEstimateDto(customerSnapshot, access = {}) {
  const snap = customerSnapshot && typeof customerSnapshot === "object" ? customerSnapshot : {};
  const projectIn = snap.project && typeof snap.project === "object" ? snap.project : {};
  const totalsIn = snap.totals && typeof snap.totals === "object" ? snap.totals : {};
  const disclosuresIn =
    snap.disclosures && typeof snap.disclosures === "object" ? snap.disclosures : {};

  const rooms = Array.isArray(snap.rooms)
    ? snap.rooms.map((r) => pickKeys(r, PUBLIC_ROOM_KEYS)).filter(Boolean)
    : [];
  const lineItems = Array.isArray(snap.lineItems)
    ? snap.lineItems.map((l) => pickKeys(l, PUBLIC_LINE_KEYS)).filter(Boolean)
    : [];

  const estimate = {
    documentTitle: str(snap.documentTitle) || "Digital Estimate",
    quoteNumber: str(snap.quoteNumber),
    revisionLabel: str(snap.revisionLabel),
    revisionNumber: num(snap.revisionNumber),
    publishedAt: str(snap.publishedAt),
    pricingValidThrough: str(snap.pricingValidThrough),
    project: {
      customerName: str(projectIn.customerName),
      projectName: str(projectIn.projectName),
      projectAddress: str(projectIn.projectAddress)
    },
    rooms,
    lineItems,
    totals: {
      estimatedProjectTotal: num(totalsIn.estimatedProjectTotal),
      currency: str(totalsIn.currency) || "USD",
      rounding: str(totalsIn.rounding) || "integer_usd"
    },
    notes: Array.isArray(snap.notes)
      ? snap.notes.map((n) => str(n)).filter(Boolean).slice(0, 12)
      : [],
    disclosures: {
      version: str(disclosuresIn.version),
      text: str(disclosuresIn.text)
    },
    print: {
      supported: true,
      quoteNumber: str(snap.quoteNumber),
      revisionLabel: str(snap.revisionLabel),
      publishedAt: str(snap.publishedAt),
      pricingValidThrough: str(snap.pricingValidThrough),
      estimatedProjectTotal: num(totalsIn.estimatedProjectTotal)
    }
  };

  assertAllowlistedObject(estimate, PUBLIC_ESTIMATE_DTO_KEYS);

  return {
    ok: true,
    estimate,
    access: {
      expiresAt: access.accessExpiresAt ? String(access.accessExpiresAt) : null
    }
  };
}

/**
 * Exact-key allowlist check for tests / defense.
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} keys
 */
export function assertAllowlistedObject(obj, keys) {
  const allowed = new Set(keys);
  for (const k of Object.keys(obj || {})) {
    if (!allowed.has(k)) {
      const err = new Error(`Public DTO contains non-allowlisted key: ${k}`);
      err.code = "public_dto_leak";
      throw err;
    }
  }
}

/**
 * Forbidden substrings that must never appear in serialized public JSON.
 */
export const PUBLIC_DTO_FORBIDDEN_SUBSTRINGS = Object.freeze([
  "wholesale",
  "direct rate",
  "margin",
  "internal_ui",
  "internal_estimate_math",
  "calculation_snapshot",
  "service_role",
  "pricingStructure",
  "material_breakdown",
  "inputSummary",
  "lineItemDetails",
  "roomLines",
  "gemini",
  "confidence"
]);

/**
 * @param {unknown} dto
 */
export function assertPublicDtoHasNoForbiddenContent(dto) {
  const raw = JSON.stringify(dto).toLowerCase();
  for (const needle of PUBLIC_DTO_FORBIDDEN_SUBSTRINGS) {
    if (raw.includes(needle.toLowerCase())) {
      const err = new Error(`Public DTO contains forbidden content: ${needle}`);
      err.code = "public_dto_leak";
      throw err;
    }
  }
}

function pickKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
