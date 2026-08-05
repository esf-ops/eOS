/**
 * Studio V2 — staff-safe Customer Selection Review read model.
 *
 * Builds estimator-facing review data from the latest Digital Estimate
 * configuration selection + calculation. Does not mutate approved estimates,
 * publish, accept, or invent priced totals. Browser never owns these numbers.
 */

import { buildCustomerConfigurationSummary } from "../digitalEstimate/catalog/customerConfigurationSummary.mjs";
import {
  CUSTOMER_CONFIGURATION_FOUNDATION_KEY,
  classifyCustomerConfigurationForReview,
  finalizeCustomerConfigurationFoundation,
  sanitizeCustomerConfigurationFoundation,
  enrichFoundationFromSelectionQuantities,
  resolveCustomerEdgeLabel
} from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import { splitSelectionPayloadMeta } from "../digitalEstimate/configuration/customerConfigurationDraft.mjs";
import { sanitizeSelectionPayloadMeta } from "../digitalEstimate/configuration/sanitizeExclusiveRoomSelections.mjs";
import { getElite100CustomerMaterial } from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";

const FORBIDDEN_REVIEW_KEYS = [
  "pricing_evidence",
  "pricingEvidence",
  "internal_evidence",
  "internalEvidence",
  "service_role",
  "serviceRole",
  "raw_payload",
  "rawPayload",
  "selection_payload_json",
  "customer_result_json",
  "internal_evidence_json",
  "cost",
  "wholesale",
  "exactTotal",
  "baselineExactTotal",
  "configuredExactTotal"
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function moneyFromStoredTotal(v) {
  const n = num(v);
  if (n == null) return null;
  // Calculation rows store display dollars (exact totals from config-delta).
  return Math.round(n * 100) / 100;
}

function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function humanizeToken(token) {
  const t = str(token);
  if (!t) return null;
  return t
    .replace(/^e100[-_]/i, "")
    .replace(/^edge[_-]?/i, "")
    .replace(/^group[_-]?/i, "Group ")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefer Elite 100 catalog display names over raw material ids / slugs.
 * @param {unknown} token
 * @returns {string|null}
 */
export function friendlyMaterialLabel(token) {
  const raw = str(token);
  if (!raw) return null;
  const candidates = [raw];
  if (!/^e100[-_]/i.test(raw)) candidates.push(`e100-${raw}`);
  for (const id of candidates) {
    const mat = getElite100CustomerMaterial(id);
    if (mat?.displayName) return String(mat.displayName);
  }
  // Already a friendly name (spaces / title case) — keep as-is.
  if (/\s/.test(raw) && !/^e100[-_]/i.test(raw)) return raw;
  return humanizeToken(raw);
}

function roomDisplayLabel(room) {
  if (!room || typeof room !== "object") return "Room";
  return str(room.displayName) || str(room.name) || str(room.roomKey) || "Room";
}

/**
 * Strip staff-forbidden fields from a review DTO (defense in depth).
 * @param {unknown} value
 * @param {string} [path]
 * @returns {unknown}
 */
export function scrubSelectionReviewDto(value, path = "") {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item, i) => scrubSelectionReviewDto(item, `${path}[${i}]`));
  }
  if (typeof value !== "object") return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REVIEW_KEYS.includes(key) || /^internal/i.test(key)) continue;
    out[key] = scrubSelectionReviewDto(child, path ? `${path}.${key}` : key);
  }
  return out;
}

/**
 * Empty / clean state when no customer selections have been saved.
 * @param {{ publicationId?: string|null, envelopeId?: string|null }} [opts]
 */
export function buildEmptyCustomerSelectionReview(opts = {}) {
  return scrubSelectionReviewDto({
    hasSavedSelections: false,
    lastSavedAt: null,
    selectionId: null,
    selectionHash: null,
    publicationId: opts.publicationId || null,
    envelopeId: opts.envelopeId || null,
    reviewRequested: false,
    requiresEliteReview: false,
    selectionOnlySubmitted: false,
    reviewKind: "none",
    pricedSelections: {
      rooms: [],
      selectionChangeCount: 0,
      selectionChangeItems: []
    },
    scopeRequests: {
      count: 0,
      items: [],
      openings: [],
      waterfalls: [],
      customerNotes: [],
      projectNote: null,
      backsplashChangeRequest: null
    },
    totals: {
      publishedBaselineTotal: null,
      customerEstimateTotal: null,
      difference: null
    },
    selectionComparison: {
      rows: [],
      totalDelta: null
    },
    pricingAuthority: null,
    staffDiagnostics: []
  });
}

/**
 * Map a room summary row into staff-safe priced selection lines.
 * @param {object} room
 * @param {object|null} foundation
 */
function mapPricedRoom(room, foundation) {
  const roomKey = str(room?.roomKey);
  const materialFromFoundation =
    foundation?.selectedMaterial &&
    (!foundation.selectedMaterial.roomId ||
      String(foundation.selectedMaterial.roomId) === roomKey)
      ? foundation.selectedMaterial
      : null;
  const edgeFromFoundation =
    foundation?.selectedEdgeProfile &&
    (!foundation.selectedEdgeProfile.roomId ||
      foundation.selectedEdgeProfile.estimateWide === true ||
      String(foundation.selectedEdgeProfile.roomId) === roomKey)
      ? foundation.selectedEdgeProfile
      : null;

  const materialLabel =
    // Qty-derived summary material wins over stale foundation color.
    friendlyMaterialLabel(room?.material?.displayName) ||
    friendlyMaterialLabel(room?.material?.materialToken) ||
    friendlyMaterialLabel(materialFromFoundation?.colorName) ||
    friendlyMaterialLabel(materialFromFoundation?.colorId) ||
    (materialFromFoundation?.materialGroup
      ? `Group ${String(materialFromFoundation.materialGroup).replace(/^group[_ ]?/i, "").toUpperCase()}`
      : null) ||
    null;

  const materialGroup =
    str(materialFromFoundation?.materialGroup) ||
    null;

  const edgeLabel =
    // Qty-derived room summary wins over stale foundation edge (repair / prior saves).
    (room?.edgeMode ? resolveCustomerEdgeLabel(room.edgeMode, null) : null) ||
    str(edgeFromFoundation?.profileName) ||
    humanizeToken(edgeFromFoundation?.profileToken) ||
    humanizeToken(room?.edgeMode) ||
    null;

  const sink = room?.sink
    ? {
        source: room.sink.source || null,
        label:
          str(room.sink.displayName) ||
          (room.sink.source === "customer_provided"
            ? [room.sink.manufacturer, room.sink.model].filter(Boolean).join(" ") ||
              "Customer-provided sink"
            : room.sink.source === "none"
              ? "No sink"
              : null),
        manufacturer: str(room.sink.manufacturer),
        model: str(room.sink.model)
      }
    : null;

  const faucet = room?.faucet
    ? {
        source: room.faucet.source || null,
        label:
          str(room.faucet.displayName) ||
          (room.faucet.source === "customer_provided"
            ? [room.faucet.manufacturer, room.faucet.model].filter(Boolean).join(" ") ||
              "Customer-provided faucet"
            : room.faucet.source === "none"
              ? "No faucet"
              : null)
      }
    : null;

  const accessories = Array.isArray(room?.accessories)
    ? room.accessories.map((a) => ({
        label: str(a.displayName) || "Accessory",
        quantity: Number(a.quantity) || 1
      }))
    : [];

  const specialty = Array.isArray(room?.specialty)
    ? room.specialty.map((s) => ({
        label: str(s.displayName) || "Specialty item",
        quantity: Number(s.quantity) || 1
      }))
    : [];

  const backsplashLabel =
    room?.backsplash?.mode === "custom_height"
      ? room.backsplash.requestedHeightInches != null
        ? `Custom height (${room.backsplash.requestedHeightInches}")`
        : "Custom height"
      : room?.backsplashMode
        ? humanizeToken(room.backsplashMode)
        : foundation?.backsplashPreference?.preference &&
            foundation.backsplashPreference.preference !== "request_change"
          ? humanizeToken(foundation.backsplashPreference.preference)
          : null;

  const hasAny =
    materialLabel ||
    edgeLabel ||
    backsplashLabel ||
    sink ||
    faucet ||
    accessories.length ||
    specialty.length ||
    str(room?.notes);

  if (!hasAny) return null;

  return {
    roomKey,
    roomName: roomDisplayLabel(room),
    // Staff-safe: friendly catalog label only — never raw e100-* color ids.
    material: materialLabel ? { label: materialLabel, group: materialGroup } : null,
    edge: edgeLabel ? { label: edgeLabel } : null,
    backsplash: backsplashLabel ? { label: backsplashLabel } : null,
    sink,
    faucet,
    accessories,
    specialty,
    notes: str(room?.notes)
  };
}

/**
 * Map Digital Estimate `roomPricingChanges` (customer-safe DE calculation DTO)
 * into staff-facing before/after comparison rows. Does not recalculate prices.
 *
 * @param {object|null|undefined} calculation
 * @returns {{
 *   rows: Array<{
 *     room: string|null,
 *     category: string,
 *     publishedSelection: string,
 *     customerSelection: string,
 *     priceDelta: number|null,
 *     status: string|null
 *   }>,
 *   totalDelta: number|null
 * }}
 */
export function presentSelectionComparisonFromCalculation(calculation) {
  const customerResult =
    calculation?.customer_result_json ||
    calculation?.customerResultJson ||
    null;
  const changes =
    customerResult?.roomPricingChanges && typeof customerResult.roomPricingChanges === "object"
      ? customerResult.roomPricingChanges
      : null;
  const rawRows = Array.isArray(changes?.rows) ? changes.rows : [];
  const rows = rawRows
    .map((r) => {
      const published = str(r?.originalLabel) || "Published selection";
      const customer = str(r?.updatedLabel) || "Customer selection";
      const category = str(r?.categoryLabel) || str(r?.category) || "Selection";
      const delta =
        moneyFromStoredTotal(r?.amountDelta) ??
        (r?.amountDeltaCents != null && Number.isFinite(Number(r.amountDeltaCents))
          ? Math.round(Number(r.amountDeltaCents)) / 100
          : null);
      return {
        room: str(r?.roomName) || str(r?.room) || null,
        category,
        publishedSelection: published,
        customerSelection: customer,
        priceDelta: delta,
        status: str(r?.status)
      };
    })
    .filter((r) => r.publishedSelection || r.customerSelection);

  const totalDelta =
    moneyFromStoredTotal(changes?.totalDelta) ??
    (changes?.totalDeltaCents != null && Number.isFinite(Number(changes.totalDeltaCents))
      ? Math.round(Number(changes.totalDeltaCents)) / 100
      : null);

  return { rows, totalDelta };
}

/**
 * Build staff-safe selection review from persisted DE selection + calculation.
 *
 * @param {{
 *   selection?: object|null,
 *   calculation?: object|null,
 *   rooms?: Array<{ roomKey?: string, id?: string, name?: string, displayName?: string }>|null,
 *   publicationId?: string|null,
 *   envelopeId?: string|null,
 *   reviewRequested?: boolean
 * }} input
 */
export function buildStudioCustomerSelectionReview(input = {}) {
  const selection = input.selection;
  const calculation = input.calculation;
  const publicationId = input.publicationId || null;
  const envelopeId = input.envelopeId || null;
  const reviewRequested = Boolean(input.reviewRequested);

  if (!selection?.id) {
    const empty = buildEmptyCustomerSelectionReview({ publicationId, envelopeId });
    empty.reviewRequested = reviewRequested;
    return empty;
  }

  /** @type {string[]} */
  const staffDiagnostics = [];

  if (!calculation?.id) {
    staffDiagnostics.push({
      code: "selection_without_calculation",
      message: "Customer selection was saved but no calculation row is linked."
    });
  }

  const payload =
    selection.selection_payload_json ||
    selection.selectionPayloadJson ||
    selection.selectionPayload ||
    {};
  const split = sanitizeSelectionPayloadMeta(
    splitSelectionPayloadMeta(payload),
    [],
    { throwOnAmbiguous: false }
  );
  const rawFoundation =
    payload?.[CUSTOMER_CONFIGURATION_FOUNDATION_KEY] ||
    split.customerConfiguration ||
    null;
  let foundation = sanitizeCustomerConfigurationFoundation(rawFoundation, {
    rejectForbidden: false,
    lastSavedAt:
      rawFoundation?.lastSavedAt ||
      selection.updated_at ||
      selection.created_at ||
      null
  });
  foundation = enrichFoundationFromSelectionQuantities(foundation, split.quantities || {});
  foundation = finalizeCustomerConfigurationFoundation(foundation);

  const customerResult =
    calculation?.customer_result_json ||
    calculation?.customerResultJson ||
    null;
  const baselineFromCalc = moneyFromStoredTotal(
    calculation?.baseline_total ?? calculation?.baselineTotal
  );
  const configuredFromCalc = moneyFromStoredTotal(
    calculation?.configured_total ?? calculation?.configuredTotal
  );
  const publishedBaselineTotal =
    moneyFromStoredTotal(customerResult?.publishedBaselineTotal) ??
    moneyFromStoredTotal(customerResult?.baselineDisplayTotal) ??
    baselineFromCalc;
  const customerEstimateTotal =
    moneyFromStoredTotal(customerResult?.pricedSelectionTotal) ??
    moneyFromStoredTotal(customerResult?.configuredDisplayTotal) ??
    configuredFromCalc;
  const difference =
    publishedBaselineTotal != null && customerEstimateTotal != null
      ? Math.round((customerEstimateTotal - publishedBaselineTotal) * 100) / 100
      : moneyFromStoredTotal(customerResult?.displayTotalDelta) ??
        moneyFromStoredTotal(customerResult?.displayDelta);

  const pricingAuthority = str(customerResult?.pricingAuthority);
  if (pricingAuthority === "published_baseline_frozen") {
    staffDiagnostics.push({
      code: "pricing_frozen_to_baseline",
      message:
        "Customer calculation failed closed to the published baseline. Totals may not reflect the latest selection."
    });
  }

  const roomCatalog = (input.rooms || []).map((r) => ({
    roomKey: String(r.roomKey || r.id || ""),
    displayName: roomDisplayLabel(r)
  }));

  const summary = buildCustomerConfigurationSummary({
    selectionPayload: payload,
    quantities: split.quantities,
    customerProductDrafts: split.customerProductDrafts,
    backsplashDrafts: split.backsplashDrafts,
    roomNotes: split.roomNotes,
    projectNote: split.projectNote || foundation?.projectNote || null,
    rooms: roomCatalog,
    baselineDisplayTotal: publishedBaselineTotal,
    configuredDisplayTotal: customerEstimateTotal,
    displayDelta: difference
  });

  const pricedRooms = (summary.rooms || [])
    .map((room) => mapPricedRoom(room, foundation))
    .filter(Boolean);

  const scopeItems = Array.isArray(foundation.scopeChangeRequests?.items)
    ? foundation.scopeChangeRequests.items.map((item) => ({
        kind: str(item.kind) || "scope",
        label: str(item.label) || "Scope request",
        requiresEstimatorReview: true
      }))
    : [];

  const projectNote =
    str(summary.projectNote) ||
    str(split.projectNote) ||
    null;
  if (projectNote && !scopeItems.some((i) => i.kind === "project_note")) {
    scopeItems.push({
      kind: "project_note",
      label: projectNote.length > 80 ? `${projectNote.slice(0, 77)}…` : projectNote,
      requiresEstimatorReview: true
    });
  }

  const backsplashChangeRequest =
    foundation.backsplashPreference?.preference === "request_change"
      ? {
          label: "Backsplash change request",
          note: str(foundation.backsplashPreference.note)
        }
      : null;

  const selectionChangeItems = Array.isArray(foundation.selectionChanges?.items)
    ? foundation.selectionChanges.items.map((item) => ({
        kind: str(item.kind) || "selection",
        label: str(item.label) || "Selection"
      }))
    : [];

  // Priced product selections (sink/faucet/accessory/specialty) are not always
  // in foundation.selectionChanges — surface them from room rows for the panel.
  // Material/edge come from qty-enriched foundation selectionChanges; also mirror
  // room edge/material when foundation omitted them.
  for (const room of pricedRooms) {
    if (room.material?.label) {
      const matKind = "material";
      if (!selectionChangeItems.some((i) => i.kind === matKind)) {
        selectionChangeItems.push({
          kind: matKind,
          label: `${room.roomName}: ${room.material.label}`
        });
      }
    }
    if (room.edge?.label) {
      const edgeKind = "edge_profile";
      const existing = selectionChangeItems.findIndex(
        (i) => i.kind === edgeKind || i.kind === "edge"
      );
      const label = room.edge.label;
      if (existing >= 0) {
        // Prefer qty-derived room edge over stale foundation "Eased".
        selectionChangeItems[existing] = {
          kind: edgeKind,
          label: selectionChangeItems[existing].label?.includes(":")
            ? `${room.roomName}: ${label}`
            : label
        };
      } else {
        selectionChangeItems.push({
          kind: edgeKind,
          label: `${room.roomName}: ${label}`
        });
      }
    }
    if (room.sink?.label) {
      selectionChangeItems.push({
        kind: "sink",
        label: `${room.roomName}: ${room.sink.label}`
      });
    }
    if (room.faucet?.label) {
      selectionChangeItems.push({
        kind: "faucet",
        label: `${room.roomName}: ${room.faucet.label}`
      });
    }
    for (const a of room.accessories || []) {
      selectionChangeItems.push({
        kind: "accessory",
        label: `${room.roomName}: ${a.label}`
      });
    }
    for (const s of room.specialty || []) {
      selectionChangeItems.push({
        kind: "specialty",
        label: `${room.roomName}: ${s.label}`
      });
    }
  }

  const classification = classifyCustomerConfigurationForReview({
    foundation,
    selectionPayload: payload,
    quantities: split.quantities || {},
    roomNotes: split.roomNotes || {},
    projectNote: projectNote || split.projectNote || null
  });
  // Prefer the richer room-derived selection labels when available; fall back
  // to the classifier summary for selection-only / empty-room edge cases.
  const finalSelectionItems =
    selectionChangeItems.length > 0
      ? selectionChangeItems
      : classification.selectionSummary;
  const finalScopeItems =
    classification.scopeRequestSummary.length > 0
      ? classification.scopeRequestSummary
      : scopeItems;
  const requiresEliteReview = Boolean(
    classification.requiresEliteReview || finalScopeItems.length > 0
  );
  const selectionOnlySubmitted = Boolean(
    reviewRequested && !requiresEliteReview && finalSelectionItems.length > 0
  );

  return scrubSelectionReviewDto({
    hasSavedSelections: true,
    lastSavedAt:
      str(foundation.lastSavedAt) ||
      str(selection.updated_at) ||
      str(selection.created_at) ||
      null,
    selectionId: str(selection.id),
    selectionHash: str(selection.selection_hash || selection.selectionHash),
    publicationId,
    envelopeId,
    reviewRequested,
    requiresEliteReview,
    selectionOnlySubmitted,
    reviewKind: requiresEliteReview
      ? "physical_scope"
      : finalSelectionItems.length > 0
        ? "selection_only"
        : "none",
    pricedSelections: {
      rooms: pricedRooms,
      selectionChangeCount: finalSelectionItems.length,
      selectionChangeItems: finalSelectionItems
    },
    scopeRequests: {
      count: finalScopeItems.length,
      items: finalScopeItems,
      openings: (foundation.requestedOpenings || []).map((o) => ({
        type: str(o.type),
        quantity: Number(o.quantity) || 1,
        roomId: str(o.roomId),
        note: str(o.note)
      })),
      waterfalls: (foundation.requestedWaterfalls || []).map((w) => ({
        side: str(w.side),
        legHeight: num(w.legHeight),
        note: str(w.note),
        priced: false
      })),
      customerNotes: (foundation.customerNotes || []).map((n) => ({
        note: str(n.note)
      })),
      projectNote,
      backsplashChangeRequest
    },
    totals: {
      publishedBaselineTotal,
      customerEstimateTotal,
      difference
    },
    selectionComparison: presentSelectionComparisonFromCalculation(calculation),
    pricingAuthority,
    staffDiagnostics
  });
}
