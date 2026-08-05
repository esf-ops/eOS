/**
 * Digital Estimate — Customer Configuration Foundation
 *
 * Customer-safe selection + scope-request layer stored in selection_payload_json
 * (meta key). Never mutates the approved Studio / publication snapshot.
 * Browser does not own pricing totals.
 */

import { getElite100CustomerMaterial } from "./elite100CustomerMaterialCatalog.mjs";
import { edgeProfileDisplayLabel } from "../catalog/studioEdgeAuthority.mjs";
import { sanitizeExclusiveRoomSelectionQuantities } from "./sanitizeExclusiveRoomSelections.mjs";

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

/** True when a string looks like an internal option key / slug, not a customer label. */
export function looksLikeRawOptionToken(raw) {
  const s = String(raw || "").trim();
  if (!s) return true;
  // Option keys like "backsplash:kitchen:none" — not labels like "Backsplash: No backsplash".
  if (
    /^(material|edge|sink|faucet|accessory|specialty|backsplash|sidesplash):[a-z0-9_.:-]+$/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^e100[-_]/i.test(s)) return true;
  if (/^edge[_-]/i.test(s)) return true;
  // snake_case / kebab technical tokens (aura_taj, edge_eased) — not display names.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return true;
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) && !/\s/.test(s) && s.length < 40) {
    // Allow short hyphenated display names only when they contain a capital (rare);
    // all-lowercase kebab ids are treated as raw.
    if (s === s.toLowerCase()) return true;
  }
  return false;
}

const BACKSPLASH_MODE_LABELS = Object.freeze({
  none: "No backsplash",
  standard_4in: "4-inch backsplash",
  full_height: "Full-height backsplash",
  custom_height: "Custom-height backsplash"
});

/**
 * Resolve a customer-safe material label from color id / stored name.
 * Never returns raw ids like e100-aurataj or aura_taj.
 */
export function resolveCustomerMaterialLabel(colorId, storedName = null) {
  const tries = [];
  const id = String(colorId || "").trim();
  if (id) {
    tries.push(id);
    if (!/^e100[-_]/i.test(id)) {
      tries.push(`e100-${id}`);
      tries.push(`e100-${id.replace(/_/g, "-")}`);
      tries.push(`e100-${id.replace(/[_-]/g, "")}`);
    } else {
      tries.push(id.replace(/_/g, "-"));
      tries.push(`e100-${id.replace(/^e100[-_]?/i, "").replace(/[_-]/g, "")}`);
    }
  }
  for (const candidate of tries) {
    const catalog = getElite100CustomerMaterial(candidate);
    if (catalog?.displayName) {
      return {
        colorId: catalog.materialId,
        colorName: catalog.displayName,
        materialGroup: catalog.pricingGroupCode || null
      };
    }
  }
  // Collapsed-separator fallback (aura_taj / aura-taj → e100-aurataj).
  if (id) {
    const collapsed = id.replace(/^e100[-_]?/i, "").replace(/[_-]/g, "").toLowerCase();
    if (collapsed) {
      const catalog = getElite100CustomerMaterial(`e100-${collapsed}`);
      if (catalog?.displayName) {
        return {
          colorId: catalog.materialId,
          colorName: catalog.displayName,
          materialGroup: catalog.pricingGroupCode || null
        };
      }
    }
  }
  const name = String(storedName || "").trim();
  if (name && !looksLikeRawOptionToken(name)) {
    return { colorId: id || null, colorName: name, materialGroup: null };
  }
  return { colorId: id || null, colorName: null, materialGroup: null };
}

/**
 * Customer-safe edge label from profile token / stored name.
 */
export function resolveCustomerEdgeLabel(profileToken, storedName = null) {
  const token = String(profileToken || "").trim();
  if (token) {
    const fromCatalog = edgeProfileDisplayLabel(token);
    if (fromCatalog && !looksLikeRawOptionToken(fromCatalog)) {
      return fromCatalog;
    }
  }
  const name = String(storedName || "").trim();
  if (name && !looksLikeRawOptionToken(name)) return name;
  return token ? edgeProfileDisplayLabel(token) : null;
}

/**
 * Customer-safe backsplash mode label.
 */
export function resolveCustomerBacksplashModeLabel(mode) {
  const m = String(mode || "").trim().toLowerCase();
  return BACKSPLASH_MODE_LABELS[m] || null;
}

/**
 * Strip finish suffixes from ESF option keys for display fallback only.
 * Prefer product draft displayLabel when available.
 */
export function customerSafePlumbingOptionLabel(optionKey, displayLabel = null) {
  const label = String(displayLabel || "").trim();
  if (label && !looksLikeRawOptionToken(label)) return label;
  const key = String(optionKey || "").trim();
  const parts = key.split(":");
  if (parts.length < 3) return null;
  const role = parts[0];
  const mode = parts[2];
  if (role === "sink" || role === "faucet") {
    if (mode === "none") return role === "sink" ? "No sink" : "No faucet";
    if (mode === "customer_provided" || mode === "customer") {
      return role === "sink" ? "Customer-provided sink" : "Customer-provided faucet";
    }
    if (mode === "esf") {
      const productToken = parts.slice(3).join(":");
      if (!productToken) return role === "sink" ? "ESF sink selected" : "ESF faucet selected";
      // Never echo the raw product id; use a generic safe label.
      return role === "sink" ? "ESF sink selected" : "ESF faucet selected";
    }
  }
  if (role === "accessory") return "Accessory selected";
  if (role === "specialty") return "Specialty item selected";
  return null;
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
    const resolved = resolveCustomerMaterialLabel(
      base.selectedMaterial.colorId,
      base.selectedMaterial.colorName
    );
    const materialLabel =
      resolved.colorName ||
      (base.selectedMaterial.materialGroup &&
      !looksLikeRawOptionToken(base.selectedMaterial.materialGroup)
        ? base.selectedMaterial.materialGroup
        : null);
    if (materialLabel) {
      selectionItems.push({
        kind: "material",
        label: materialLabel
      });
    }
  }
  if (base.selectedEdgeProfile) {
    const edgeLabel = resolveCustomerEdgeLabel(
      base.selectedEdgeProfile.profileToken,
      base.selectedEdgeProfile.profileName
    );
    if (edgeLabel) {
      selectionItems.push({
        kind: "edge_profile",
        label: edgeLabel
      });
    }
  }
  if (
    base.backsplashPreference &&
    (base.backsplashPreference.preference === "keep_approved" ||
      base.backsplashPreference.preference === "include" ||
      base.backsplashPreference.preference === "remove")
  ) {
    const pref = String(base.backsplashPreference.preference);
    selectionItems.push({
      kind: "backsplash_preference",
      label:
        pref === "remove"
          ? "Backsplash: No backsplash"
          : pref === "include"
            ? "Backsplash: Include"
            : "Backsplash: Keep approved"
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
      const kind = optionKey.startsWith("sink:") ? "sink" : "faucet";
      const label = customerSafePlumbingOptionLabel(optionKey, null);
      if (label) {
        pushUniqueReviewItem(selectionSummary, selectionSeen, { kind, label });
      }
      continue;
    }
    if (optionKey.startsWith("accessory:") || optionKey.startsWith("specialty:")) {
      const kind = optionKey.startsWith("accessory:") ? "accessory" : "specialty";
      const label = customerSafePlumbingOptionLabel(optionKey, null);
      if (label) {
        pushUniqueReviewItem(selectionSummary, selectionSeen, { kind, label });
      }
      continue;
    }
    if (optionKey.startsWith("backsplash:")) {
      const mode = optionKey.split(":").slice(2).join(":") || "";
      if (mode === "custom_height" || mode === "request_change") {
        pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
          kind: "backsplash_scope",
          label: `Backsplash ${mode.replace(/_/g, " ")}`,
          requiresEstimatorReview: true
        });
      } else {
        const label = resolveCustomerBacksplashModeLabel(mode);
        if (label) {
          pushUniqueReviewItem(selectionSummary, selectionSeen, {
            kind: "backsplash",
            label: `Backsplash: ${label}`
          });
        }
      }
      continue;
    }
    if (optionKey.startsWith("sidesplash:")) {
      // Live-priced side splash modes are selection-owned (DE.2 catalog).
      // Baseline / explicit "none" must never force Elite review or hide Accept.
      const mode = String(optionKey.split(":").pop() || "").toLowerCase();
      if (mode === "none") {
        continue;
      }
      if (mode === "left" || mode === "right" || mode === "both") {
        pushUniqueReviewItem(selectionSummary, selectionSeen, {
          kind: "sidesplash",
          label: `Side splash: ${mode}`
        });
        continue;
      }
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
      const rawLabel = String(row.label || "");
      const label =
        (rawLabel && !looksLikeRawOptionToken(rawLabel) ? rawLabel : null) ||
        (kind === "material"
          ? resolveCustomerMaterialLabel(optionKey.split(":").slice(2).join(":"), rawLabel)
              .colorName
          : null) ||
        (kind === "edge"
          ? resolveCustomerEdgeLabel(optionKey.split(":").slice(2).join(":"), rawLabel)
          : null) ||
        customerSafePlumbingOptionLabel(optionKey, rawLabel);
      if (label) {
        pushUniqueReviewItem(selectionSummary, selectionSeen, { kind, label });
      }
      continue;
    }
    if (optionKey.startsWith("backsplash:")) {
      const mode = optionKey.split(":").slice(2).join(":") || "";
      if (mode === "custom_height" || mode === "request_change") {
        pushUniqueReviewItem(scopeRequestSummary, scopeSeen, {
          kind: "backsplash_scope",
          label: String(row.label || `Backsplash ${mode.replace(/_/g, " ")}`),
          requiresEstimatorReview: true
        });
      } else {
        const safeLabel =
          (String(row.label || "").trim() &&
          !looksLikeRawOptionToken(String(row.label || "").trim())
            ? String(row.label).trim()
            : null) || resolveCustomerBacksplashModeLabel(mode);
        if (safeLabel) {
          pushUniqueReviewItem(selectionSummary, selectionSeen, {
            kind: "backsplash",
            label: safeLabel.startsWith("Backsplash") ? safeLabel : `Backsplash: ${safeLabel}`
          });
        }
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
 * Prefer effective selection quantities over a stale foundation material/edge.
 * Display only — does not invent priced totals. Exclusive-role sanitation collapses
 * contaminated duplicates first so Crescent cannot lose to a leftover Eased qty.
 * @param {object} foundation
 * @param {Record<string, number>} quantities
 */
export function enrichFoundationFromSelectionQuantities(foundation, quantities = {}) {
  const next = finalizeCustomerConfigurationFoundation(foundation);
  const cleanedQty = sanitizeExclusiveRoomSelectionQuantities(quantities || {}, [], {
    throwOnAmbiguous: false
  }).quantities;

  /** @type {{ roomId: string|null, colorId: string|null, colorName: string|null, materialGroup: string|null, pieceId: null }|null} */
  let materialFromQty = null;
  for (const [key, qty] of Object.entries(cleanedQty || {})) {
    if (!(Number(qty) > 0)) continue;
    if (!String(key).startsWith("material:")) continue;
    const parts = String(key).split(":");
    const colorId = parts.slice(2).join(":") || null;
    const resolved = resolveCustomerMaterialLabel(colorId, null);
    materialFromQty = {
      roomId: parts[1] || null,
      colorId: resolved.colorId || colorId,
      colorName: resolved.colorName,
      materialGroup: resolved.materialGroup,
      pieceId: null
    };
    break;
  }
  if (materialFromQty) {
    next.selectedMaterial = materialFromQty;
  } else if (next.selectedMaterial) {
    const resolved = resolveCustomerMaterialLabel(
      next.selectedMaterial.colorId,
      next.selectedMaterial.colorName
    );
    if (resolved.colorName) {
      next.selectedMaterial = {
        ...next.selectedMaterial,
        colorId: resolved.colorId || next.selectedMaterial.colorId,
        colorName: resolved.colorName,
        materialGroup:
          next.selectedMaterial.materialGroup || resolved.materialGroup || null
      };
    } else if (looksLikeRawOptionToken(next.selectedMaterial.colorName)) {
      next.selectedMaterial = {
        ...next.selectedMaterial,
        colorName: null
      };
    }
  }

  /** @type {{ roomId: string|null, profileToken: string|null, profileName: string|null, pieceId: null, estimateWide: boolean }|null} */
  let edgeFromQty = null;
  for (const [key, qty] of Object.entries(cleanedQty || {})) {
    if (!(Number(qty) > 0)) continue;
    if (!String(key).startsWith("edge:")) continue;
    const parts = String(key).split(":");
    const profileToken = parts.slice(2).join(":") || null;
    if (!profileToken) continue;
    edgeFromQty = {
      roomId: parts[1] || null,
      profileToken,
      profileName: resolveCustomerEdgeLabel(profileToken, null),
      pieceId: null,
      estimateWide: !parts[1]
    };
    break;
  }
  if (edgeFromQty) {
    next.selectedEdgeProfile = edgeFromQty;
  } else if (next.selectedEdgeProfile?.profileToken) {
    next.selectedEdgeProfile = {
      ...next.selectedEdgeProfile,
      profileName: resolveCustomerEdgeLabel(
        next.selectedEdgeProfile.profileToken,
        next.selectedEdgeProfile.profileName
      )
    };
  }

  return finalizeCustomerConfigurationFoundation(next);
}

/**
 * Public read model for Digital Estimate UI.
 * @param {unknown} stored
 * @param {{
 *   quantities?: Record<string, number>,
 *   lastSavedAt?: string|null,
 *   productDrafts?: Record<string, object>|null,
 *   selectedOptions?: Array<{ optionKey?: string, label?: string, quantity?: number }>|null
 * }} [ctx]
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
  const selectedOptions = Array.isArray(ctx.selectedOptions)
    ? ctx.selectedOptions
    : selectedOptionsFromProductDrafts(ctx.productDrafts);
  const classified = classifyCustomerConfigurationForReview({
    foundation: enriched,
    quantities: ctx.quantities || {},
    selectedOptions
  });
  // Prefer product-draft display labels over generic ESF fallbacks for the same role.
  const selectionItems = (
    classified.selectionSummary.length > 0
      ? classified.selectionSummary
      : enriched.selectionChanges?.items || []
  ).filter((item) => item?.label && !looksLikeRawOptionToken(item.label));
  const deduped = [];
  const seenKinds = new Set();
  for (const item of selectionItems) {
    const kind = String(item.kind || "");
    // Keep the last sink/faucet label (draft-specific wins over generic).
    if ((kind === "sink" || kind === "faucet") && seenKinds.has(kind)) {
      const idx = deduped.findIndex((row) => row.kind === kind);
      if (idx >= 0) deduped[idx] = item;
      continue;
    }
    seenKinds.add(kind);
    deduped.push(item);
  }
  return {
    ...enriched,
    selectionChanges: {
      count: deduped.length,
      items: deduped
    },
    lastSavedAt: ctx.lastSavedAt ?? enriched.lastSavedAt ?? null,
    approvedBaselinePreserved: true,
    canSubmitForFinalReview:
      canAcceptFromStored && enriched.requiresEstimatorReview !== true
  };
}

/**
 * @param {Record<string, object>|null|undefined} productDrafts
 * @returns {Array<{ optionKey: string, label: string, quantity: number }>}
 */
function selectedOptionsFromProductDrafts(productDrafts) {
  /** @type {Array<{ optionKey: string, label: string, quantity: number }>} */
  const out = [];
  if (!productDrafts || typeof productDrafts !== "object") return out;
  for (const drafts of Object.values(productDrafts)) {
    if (!drafts || typeof drafts !== "object") continue;
    for (const role of ["sink", "faucet", "accessory", "specialty"]) {
      const draft = drafts[role];
      if (!draft || typeof draft !== "object") continue;
      const optionKey = String(draft.optionKey || "").trim();
      const label = String(draft.displayLabel || "").trim();
      if (!optionKey || !label || looksLikeRawOptionToken(label)) continue;
      out.push({ optionKey, label, quantity: 1 });
    }
  }
  return out;
}
