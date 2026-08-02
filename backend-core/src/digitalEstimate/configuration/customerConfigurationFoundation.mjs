/**
 * Digital Estimate — Customer Configuration Foundation
 *
 * Customer-safe selection + scope-request layer stored in selection_payload_json
 * (meta key). Never mutates the approved Studio / publication snapshot.
 * Browser does not own pricing totals.
 */

import { getElite100CustomerMaterial } from "./elite100CustomerMaterialCatalog.mjs";

export const CUSTOMER_CONFIGURATION_FOUNDATION_KEY = "__customerConfigurationFoundation";
export const CUSTOMER_CONFIGURATION_FOUNDATION_VERSION = 1;

const NOTE_MAX = 2000;
const TEXT_MAX = 120;
const OPENING_TYPES = new Set([
  "kitchen_sink",
  "vanity_sink",
  "cooktop",
  "outlet",
  "popup_outlet",
  "other"
]);
const BACKSPLASH_PREFS = new Set([
  "keep_approved",
  "include",
  "remove",
  "request_change"
]);

/** Fields that must never be accepted from the public client. */
const FORBIDDEN_INTERNAL_KEYS = [
  "cost",
  "costBasis",
  "cost_basis",
  "wholesale",
  "wholesaleRate",
  "directRate",
  "internal",
  "internalNotes",
  "internal_notes",
  "internalReason",
  "internal_reason",
  "hiddenAdjustment",
  "hidden_adjustment",
  "pricingEvidence",
  "pricing_evidence",
  "internalEvidence",
  "internal_evidence",
  "serviceRole",
  "service_role",
  "rawSnapshot",
  "raw_snapshot",
  "calculatorInput",
  "calculator_input",
  "approvedSnapshot",
  "approved_snapshot",
  "exactTotal",
  "baselineExactTotal",
  "configuredExactTotal"
];

function sanitizePlainText(raw, maxLen) {
  let s = String(raw ?? "")
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function newId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function collectForbiddenCustomerConfigurationFields(raw, path = "") {
  /** @type {string[]} */
  const hits = [];
  if (!raw || typeof raw !== "object") return hits;
  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      hits.push(...collectForbiddenCustomerConfigurationFields(item, `${path}[${i}]`));
    });
    return hits;
  }
  for (const [key, value] of Object.entries(raw)) {
    const next = path ? `${path}.${key}` : key;
    if (FORBIDDEN_INTERNAL_KEYS.includes(key) || /^internal/i.test(key) || /cost_?basis/i.test(key)) {
      hits.push(next);
      continue;
    }
    if (value && typeof value === "object") {
      hits.push(...collectForbiddenCustomerConfigurationFields(value, next));
    }
  }
  return hits;
}

export function buildEmptyCustomerConfigurationFoundation(overrides = {}) {
  return {
    version: CUSTOMER_CONFIGURATION_FOUNDATION_VERSION,
    selectedMaterial: null,
    selectedEdgeProfile: null,
    backsplashPreference: null,
    requestedOpenings: [],
    requestedWaterfalls: [],
    customerNotes: [],
    requiresEstimatorReview: false,
    selectionChanges: { count: 0, items: [] },
    scopeChangeRequests: { count: 0, items: [] },
    lastSavedAt: null,
    // Unchanged published estimate may be accepted as-is (no selection/scope deltas).
    canSubmitForFinalReview: true,
    ...overrides
  };
}

function sanitizeSelectedMaterial(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {
    materialGroup: sanitizePlainText(raw.materialGroup ?? raw.priceGroup ?? "", TEXT_MAX) || null,
    colorId: sanitizePlainText(raw.colorId ?? "", TEXT_MAX) || null,
    colorName: sanitizePlainText(raw.colorName ?? "", TEXT_MAX) || null,
    roomId: sanitizePlainText(raw.roomId ?? raw.roomKey ?? "", TEXT_MAX) || null,
    pieceId: sanitizePlainText(raw.pieceId ?? "", TEXT_MAX) || null
  };
  return Object.values(out).some(Boolean) ? out : null;
}

function sanitizeSelectedEdgeProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {
    profileToken: sanitizePlainText(raw.profileToken ?? raw.token ?? "", TEXT_MAX) || null,
    profileName: sanitizePlainText(raw.profileName ?? raw.name ?? "", TEXT_MAX) || null,
    roomId: sanitizePlainText(raw.roomId ?? raw.roomKey ?? "", TEXT_MAX) || null,
    pieceId: sanitizePlainText(raw.pieceId ?? "", TEXT_MAX) || null,
    estimateWide: raw.estimateWide === true
  };
  if (!out.profileToken && !out.profileName) return null;
  return out;
}

function sanitizeBacksplashPreference(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const preference = sanitizePlainText(raw.preference ?? raw.mode ?? "", 40);
  if (!BACKSPLASH_PREFS.has(preference)) return null;
  const note = sanitizePlainText(raw.note ?? "", NOTE_MAX) || null;
  return { preference, note };
}

function sanitizeRequestedOpenings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const type = sanitizePlainText(row.type ?? "", 40);
      if (!OPENING_TYPES.has(type)) return null;
      const quantity = Math.max(1, Math.min(20, Math.floor(Number(row.quantity) || 1)));
      return {
        id: sanitizePlainText(row.id ?? "", 64) || newId("opening"),
        type,
        quantity,
        roomId: sanitizePlainText(row.roomId ?? row.roomKey ?? "", TEXT_MAX) || null,
        pieceId: sanitizePlainText(row.pieceId ?? "", TEXT_MAX) || null,
        note: sanitizePlainText(row.note ?? "", NOTE_MAX) || null,
        requiresEstimatorReview: true
      };
    })
    .filter(Boolean);
}

function sanitizeRequestedWaterfalls(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const side = sanitizePlainText(row.side ?? "", 40) || null;
      const pieceId = sanitizePlainText(row.pieceId ?? "", TEXT_MAX) || null;
      const roomId = sanitizePlainText(row.roomId ?? row.roomKey ?? "", TEXT_MAX) || null;
      const note = sanitizePlainText(row.note ?? "", NOTE_MAX) || null;
      const legRaw = Number(row.legHeight ?? row.legHeightInches);
      const legHeight =
        Number.isFinite(legRaw) && legRaw > 0 && legRaw <= 120
          ? Math.round(legRaw * 100) / 100
          : null;
      if (!side && !pieceId && !note && legHeight == null) return null;
      return {
        id: sanitizePlainText(row.id ?? "", 64) || newId("waterfall"),
        pieceId,
        roomId,
        side,
        legHeight,
        backsidePolishRequested: row.backsidePolishRequested === true,
        note,
        requiresEstimatorReview: true,
        priced: false
      };
    })
    .filter(Boolean);
}

function sanitizeCustomerNotes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map((row) => {
      if (typeof row === "string") {
        const note = sanitizePlainText(row, NOTE_MAX);
        if (!note) return null;
        return { id: newId("note"), note, requiresEstimatorReview: true };
      }
      if (!row || typeof row !== "object") return null;
      const note = sanitizePlainText(row.note ?? row.text ?? "", NOTE_MAX);
      if (!note) return null;
      return {
        id: sanitizePlainText(row.id ?? "", 64) || newId("note"),
        note,
        requiresEstimatorReview: true
      };
    })
    .filter(Boolean);
}

/**
 * Sanitize customer-authored foundation payload. Rejects/strips internals.
 * @param {unknown} raw
 * @param {{ lastSavedAt?: string|null, rejectForbidden?: boolean }} [opts]
 */
export function sanitizeCustomerConfigurationFoundation(raw, opts = {}) {
  const rejectForbidden = opts.rejectForbidden !== false;
  if (raw == null) return buildEmptyCustomerConfigurationFoundation({ lastSavedAt: opts.lastSavedAt ?? null });
  if (typeof raw !== "object" || Array.isArray(raw)) {
    const err = new Error("Invalid customer configuration");
    err.code = "invalid_customer_configuration";
    err.statusCode = 400;
    throw err;
  }
  const forbidden = collectForbiddenCustomerConfigurationFields(raw);
  if (rejectForbidden && forbidden.length) {
    const err = new Error("Internal fields are not allowed in customer configuration");
    err.code = "forbidden_customer_configuration_fields";
    err.statusCode = 400;
    err.fields = forbidden.slice(0, 20);
    throw err;
  }

  const selectedMaterial = sanitizeSelectedMaterial(raw.selectedMaterial);
  const selectedEdgeProfile = sanitizeSelectedEdgeProfile(raw.selectedEdgeProfile);
  const backsplashPreference = sanitizeBacksplashPreference(raw.backsplashPreference);
  const requestedOpenings = sanitizeRequestedOpenings(raw.requestedOpenings);
  const requestedWaterfalls = sanitizeRequestedWaterfalls(raw.requestedWaterfalls);
  const customerNotes = sanitizeCustomerNotes(raw.customerNotes);

  return finalizeCustomerConfigurationFoundation({
    version: CUSTOMER_CONFIGURATION_FOUNDATION_VERSION,
    selectedMaterial,
    selectedEdgeProfile,
    backsplashPreference,
    requestedOpenings,
    requestedWaterfalls,
    customerNotes,
    lastSavedAt: opts.lastSavedAt ?? null
  });
}

/**
 * Derive public summaries + review flags (display only).
 * @param {object} foundation
 */
export function finalizeCustomerConfigurationFoundation(foundation) {
  const base = buildEmptyCustomerConfigurationFoundation(foundation || {});
  /** @type {Array<{ kind: string, label: string }>} */
  const selectionItems = [];
  if (base.selectedMaterial) {
    selectionItems.push({
      kind: "material",
      label:
        base.selectedMaterial.colorName ||
        base.selectedMaterial.materialGroup ||
        "Material selection"
    });
  }
  if (base.selectedEdgeProfile) {
    selectionItems.push({
      kind: "edge_profile",
      label:
        base.selectedEdgeProfile.profileName ||
        base.selectedEdgeProfile.profileToken ||
        "Edge profile"
    });
  }
  if (
    base.backsplashPreference &&
    (base.backsplashPreference.preference === "keep_approved" ||
      base.backsplashPreference.preference === "include" ||
      base.backsplashPreference.preference === "remove")
  ) {
    selectionItems.push({
      kind: "backsplash_preference",
      label: `Backsplash: ${base.backsplashPreference.preference.replace(/_/g, " ")}`
    });
  }

  /** @type {Array<{ kind: string, label: string, requiresEstimatorReview: true }>} */
  const scopeItems = [];
  for (const opening of base.requestedOpenings || []) {
    scopeItems.push({
      kind: "opening",
      label: `${opening.type.replace(/_/g, " ")} ×${opening.quantity}`,
      requiresEstimatorReview: true
    });
  }
  for (const wf of base.requestedWaterfalls || []) {
    scopeItems.push({
      kind: "waterfall",
      label: `Waterfall request${wf.side ? ` (${wf.side})` : ""} — not priced yet`,
      requiresEstimatorReview: true
    });
  }
  for (const note of base.customerNotes || []) {
    scopeItems.push({
      kind: "customer_note",
      label: note.note.length > 80 ? `${note.note.slice(0, 77)}…` : note.note,
      requiresEstimatorReview: true
    });
  }
  if (base.backsplashPreference?.preference === "request_change") {
    scopeItems.push({
      kind: "backsplash_change_request",
      label: "Backsplash change request",
      requiresEstimatorReview: true
    });
  }

  const requiresEstimatorReview = scopeItems.length > 0;
  // Accept original published estimate only when there are no priced selection
  // deltas and no physical scope requests. Changed selections → Send selections.
  const canSubmitForFinalReview =
    !requiresEstimatorReview && selectionItems.length === 0;

  return {
    ...base,
    version: CUSTOMER_CONFIGURATION_FOUNDATION_VERSION,
    requestedOpenings: (base.requestedOpenings || []).map((o) => ({
      ...o,
      requiresEstimatorReview: true
    })),
    requestedWaterfalls: (base.requestedWaterfalls || []).map((w) => ({
      ...w,
      requiresEstimatorReview: true,
      priced: false
    })),
    customerNotes: (base.customerNotes || []).map((n) => ({
      ...n,
      requiresEstimatorReview: true
    })),
    requiresEstimatorReview,
    selectionChanges: { count: selectionItems.length, items: selectionItems },
    scopeChangeRequests: { count: scopeItems.length, items: scopeItems },
    canSubmitForFinalReview
  };
}

function pushUniqueReviewItem(target, seen, item) {
  const kind = String(item?.kind || "").trim() || "item";
  const label = String(item?.label || "").trim() || kind;
  const key = `${kind}\u001f${label}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({
    kind,
    label,
    ...(item.requiresEstimatorReview ? { requiresEstimatorReview: true } : {})
  });
}

/**
 * Classify a customer configuration for staff review/status.
 * Allowed priced Digital Estimate selections are not Elite-review / Studio-revision
 * requests by themselves. Physical scope and unsupported manual-review requests are.
 *
 * @param {{
 *   foundation?: object|null,
 *   selectionPayload?: object|null,
 *   quantities?: Record<string, number>|null,
 *   roomNotes?: Record<string, string>|null,
 *   projectNote?: string|null,
 *   customerNote?: string|null,
 *   missingInformationRequirements?: Array<object>|null,
 *   selectedOptions?: Array<{ optionKey?: string, label?: string, quantity?: number }>|null
 * }} [input]
 */
export function classifyCustomerConfigurationForReview(input = {}) {
  const payload =
    input.selectionPayload && typeof input.selectionPayload === "object"
      ? input.selectionPayload
      : null;
  const rawFoundation =
    input.foundation ||
    payload?.[CUSTOMER_CONFIGURATION_FOUNDATION_KEY] ||
    null;
  let foundation = sanitizeCustomerConfigurationFoundation(rawFoundation, {
    rejectForbidden: false
  });
  const quantities =
    input.quantities ||
    (payload
      ? Object.fromEntries(
          Object.entries(payload).filter(([key, qty]) => {
            const k = String(key);
            return (
              !k.startsWith("__") &&
              k !== CUSTOMER_CONFIGURATION_FOUNDATION_KEY &&
              Number(qty) > 0
            );
          })
        )
      : {});
  foundation = enrichFoundationFromSelectionQuantities(foundation, quantities);
  foundation = finalizeCustomerConfigurationFoundation(foundation);

  /** @type {Array<{ kind: string, label: string }>} */
  const selectionSummary = [];
  /** @type {Array<{ kind: string, label: string, requiresEstimatorReview?: true }>} */
  const scopeRequestSummary = [];
  const selectionSeen = new Set();
  const scopeSeen = new Set();

  for (const item of foundation.selectionChanges?.items || []) {
    pushUniqueReviewItem(selectionSummary, selectionSeen, item);
  }
  for (const item of foundation.scopeChangeRequests?.items || []) {
    pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
      ...item,
      requiresEstimatorReview: true
    });
  }

  const roomNotes =
    input.roomNotes ||
    payload?.__roomNotes ||
    {};
  for (const [roomId, note] of Object.entries(roomNotes || {})) {
    const text = String(note || "").trim();
    if (!text) continue;
    pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
      kind: "room_note",
      label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
      requiresEstimatorReview: true
    });
    void roomId;
  }

  const projectNote = String(
    input.projectNote || payload?.__projectNote || ""
  ).trim();
  if (projectNote) {
    pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
      kind: "project_note",
      label: projectNote.length > 80 ? `${projectNote.slice(0, 77)}…` : projectNote,
      requiresEstimatorReview: true
    });
  }

  const customerNote = String(input.customerNote || "").trim();
  if (customerNote) {
    pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
      kind: "customer_note",
      label:
        customerNote.length > 80 ? `${customerNote.slice(0, 77)}…` : customerNote,
      requiresEstimatorReview: true
    });
  }

  for (const req of input.missingInformationRequirements || []) {
    const severity = String(req?.severity || "").toLowerCase();
    const code = String(req?.code || "").toLowerCase();
    const needsManual =
      severity === "review" ||
      /review|unsupported|manual|specialty_review|sidesplash|custom_height|dimension|opening|waterfall/i.test(
        `${severity} ${code} ${req?.customerCopy || ""}`
      );
    if (!needsManual) continue;
    // Allowed specialty/product priced paths are selection-owned; only true
    // review/manual blockers become Elite-review scope.
    if (/^specialty$|^product$|^sink$|^faucet$|^accessory$/i.test(code)) continue;
    pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
      kind: "manual_review",
      label: String(req?.customerCopy || req?.code || "Manual review required"),
      requiresEstimatorReview: true
    });
  }

  for (const [key, qtyRaw] of Object.entries(quantities || {})) {
    if (!(Number(qtyRaw) > 0)) continue;
    const optionKey = String(key);
    if (optionKey.startsWith("material:") || optionKey.startsWith("edge:")) {
      // Already represented via foundation selectionChanges when present.
      continue;
    }
    if (optionKey.startsWith("sink:") || optionKey.startsWith("faucet:")) {
      pushUniqueReviewItem(selectionSummary, selectionSeen, {
        kind: optionKey.startsWith("sink:") ? "sink" : "faucet",
        label: optionKey
      });
      continue;
    }
    if (optionKey.startsWith("accessory:") || optionKey.startsWith("specialty:")) {
      pushUniqueReviewItem(selectionSummary, selectionSeen, {
        kind: optionKey.startsWith("accessory:") ? "accessory" : "specialty",
        label: optionKey
      });
      continue;
    }
    if (optionKey.startsWith("backsplash:")) {
      const mode = optionKey.split(":")[2] || "";
      if (mode === "custom_height" || mode === "request_change") {
        pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
          kind: "backsplash_scope",
          label: `Backsplash ${mode.replace(/_/g, " ")}`,
          requiresEstimatorReview: true
        });
      } else if (mode === "keep_approved" || mode === "include" || mode === "remove") {
        pushUniqueReviewItem(selectionSummary, selectionSeen, {
          kind: "backsplash_preference",
          label: `Backsplash: ${mode.replace(/_/g, " ")}`
        });
      }
      continue;
    }
    if (optionKey.startsWith("sidesplash:")) {
      pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
        kind: "sidesplash",
        label: "Side splash request",
        requiresEstimatorReview: true
      });
    }
  }

  for (const row of input.selectedOptions || []) {
    const optionKey = String(row?.optionKey || "");
    if (!optionKey || !(Number(row?.quantity) > 0)) continue;
    if (
      /^(sink|faucet|accessory|specialty):/.test(optionKey) ||
      /^(material|edge):/.test(optionKey)
    ) {
      const kind = optionKey.split(":")[0];
      pushUniqueReviewItem(selectionSummary, selectionSeen, {
        kind,
        label: String(row.label || optionKey)
      });
      continue;
    }
    if (optionKey.startsWith("backsplash:")) {
      const mode = optionKey.split(":")[2] || "";
      if (mode === "custom_height" || mode === "request_change") {
        pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
          kind: "backsplash_scope",
          label: String(row.label || `Backsplash ${mode.replace(/_/g, " ")}`),
          requiresEstimatorReview: true
        });
      } else if (mode === "keep_approved" || mode === "include" || mode === "remove") {
        pushUniqueReviewItem(selectionSummary, selectionSeen, {
          kind: "backsplash_preference",
          label: String(row.label || `Backsplash: ${mode.replace(/_/g, " ")}`)
        });
      }
    }
  }

  const hasSelectionOnlyChanges = selectionSummary.length > 0;
  const hasPhysicalScopeRequests = scopeRequestSummary.length > 0;
  const requiresEliteReview = hasPhysicalScopeRequests;
  const reviewKind = requiresEliteReview
    ? "physical_scope"
    : hasSelectionOnlyChanges
      ? "selection_only"
      : "none";

  return {
    hasSelectionOnlyChanges,
    hasPhysicalScopeRequests,
    requiresEliteReview,
    reviewKind,
    selectionSummary,
    scopeRequestSummary
  };
}

/**
 * Classify an immutable review-request snapshot without reloading selections.
 * Falls back to selection-only when no physical-scope signals are present.
 *
 * @param {object|null|undefined} reviewRequest
 */
export function classifyReviewRequestForEliteReview(reviewRequest) {
  if (!reviewRequest) {
    return classifyCustomerConfigurationForReview();
  }
  const snapshot =
    reviewRequest.request_snapshot_json ||
    reviewRequest.requestSnapshotJson ||
    {};
  const classification = snapshot.reviewClassification;
  if (
    classification &&
    typeof classification === "object" &&
    typeof classification.requiresEliteReview === "boolean"
  ) {
    return {
      hasSelectionOnlyChanges: Boolean(classification.hasSelectionOnlyChanges),
      hasPhysicalScopeRequests: Boolean(classification.hasPhysicalScopeRequests),
      requiresEliteReview: Boolean(classification.requiresEliteReview),
      reviewKind:
        classification.reviewKind ||
        (classification.requiresEliteReview
          ? "physical_scope"
          : classification.hasSelectionOnlyChanges
            ? "selection_only"
            : "none"),
      selectionSummary: Array.isArray(classification.selectionSummary)
        ? classification.selectionSummary
        : [],
      scopeRequestSummary: Array.isArray(classification.scopeRequestSummary)
        ? classification.scopeRequestSummary
        : []
    };
  }
  return classifyCustomerConfigurationForReview({
    foundation: snapshot.customerConfiguration || null,
    selectionPayload: null,
    roomNotes: snapshot.roomNotes || {},
    projectNote: snapshot.projectNote || null,
    customerNote:
      reviewRequest.customer_note ||
      reviewRequest.customerNote ||
      snapshot.customerFacingNote ||
      null,
    missingInformationRequirements: snapshot.missingInformationRequirements || [],
    selectedOptions: snapshot.selectedOptions || []
  });
}

/**
 * When foundation material/edge are empty, mirror from existing selection quantities.
 * Display only — does not invent priced totals.
 * @param {object} foundation
 * @param {Record<string, number>} quantities
 */
export function enrichFoundationFromSelectionQuantities(foundation, quantities = {}) {
  const next = finalizeCustomerConfigurationFoundation(foundation);
  if (!next.selectedMaterial) {
    for (const [key, qty] of Object.entries(quantities || {})) {
      if (!(Number(qty) > 0)) continue;
      if (!String(key).startsWith("material:")) continue;
      const parts = String(key).split(":");
      const colorId = parts.slice(2).join(":") || null;
      const catalog =
        (colorId && getElite100CustomerMaterial(colorId)) ||
        (colorId && !/^e100[-_]/i.test(colorId)
          ? getElite100CustomerMaterial(`e100-${colorId}`)
          : null);
      next.selectedMaterial = {
        roomId: parts[1] || null,
        colorId,
        colorName: catalog?.displayName || null,
        materialGroup: catalog?.pricingGroupCode || null,
        pieceId: null
      };
      break;
    }
  } else if (
    next.selectedMaterial &&
    !next.selectedMaterial.colorName &&
    next.selectedMaterial.colorId
  ) {
    // Fill friendly catalog name when only a raw material id was stored.
    const colorId = String(next.selectedMaterial.colorId);
    const catalog =
      getElite100CustomerMaterial(colorId) ||
      (!/^e100[-_]/i.test(colorId) ? getElite100CustomerMaterial(`e100-${colorId}`) : null);
    if (catalog?.displayName) {
      next.selectedMaterial = {
        ...next.selectedMaterial,
        colorName: catalog.displayName,
        materialGroup: next.selectedMaterial.materialGroup || catalog.pricingGroupCode || null
      };
    }
  }
  if (!next.selectedEdgeProfile) {
    for (const [key, qty] of Object.entries(quantities || {})) {
      if (!(Number(qty) > 0)) continue;
      if (!String(key).startsWith("edge:")) continue;
      const parts = String(key).split(":");
      next.selectedEdgeProfile = {
        roomId: parts[1] || null,
        profileToken: parts.slice(2).join(":") || null,
        profileName: null,
        pieceId: null,
        estimateWide: !parts[1]
      };
      break;
    }
  }
  return finalizeCustomerConfigurationFoundation(next);
}

/**
 * Public read model for Digital Estimate UI.
 * @param {unknown} stored
 * @param {{ quantities?: Record<string, number>, lastSavedAt?: string|null }} [ctx]
 */
export function buildPublicCustomerConfigurationReadModel(stored, ctx = {}) {
  const sanitized =
    stored == null
      ? buildEmptyCustomerConfigurationFoundation({ lastSavedAt: ctx.lastSavedAt ?? null })
      : sanitizeCustomerConfigurationFoundation(stored, {
          lastSavedAt: ctx.lastSavedAt ?? stored?.lastSavedAt ?? null,
          rejectForbidden: false
        });
  // Accept eligibility is based on the customer's stored foundation, not on
  // display enrichment from published baseline quantities (those are not changes).
  const canAcceptFromStored = sanitized.canSubmitForFinalReview === true;
  const enriched = enrichFoundationFromSelectionQuantities(sanitized, ctx.quantities || {});
  return {
    ...enriched,
    lastSavedAt: ctx.lastSavedAt ?? enriched.lastSavedAt ?? null,
    approvedBaselinePreserved: true,
    canSubmitForFinalReview:
      canAcceptFromStored && enriched.requiresEstimatorReview !== true
  };
}
