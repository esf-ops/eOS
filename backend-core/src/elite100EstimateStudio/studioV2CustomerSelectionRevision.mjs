/**
 * Conservative server-side mapping from an immutable Digital Estimate review
 * request into a new Studio V2 sibling revision.
 *
 * Only existing Studio V2 design/configuration fields are applied. Physical
 * scope requests and product choices without a first-class Studio draft field
 * are retained as estimator-review metadata and never mutate geometry.
 */
import { createHash } from "node:crypto";
import { getElite100CustomerMaterial } from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";
import {
  classifyCustomerConfigurationForReview,
  enrichFoundationFromSelectionQuantities,
  finalizeCustomerConfigurationFoundation,
  sanitizeCustomerConfigurationFoundation
} from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import { splitSelectionPayloadMeta } from "../digitalEstimate/configuration/customerConfigurationDraft.mjs";
import { parseProductOptionKey } from "../digitalEstimate/catalog/digitalEstimateProductOptions.mjs";
import { normalizeStudioV2EdgeProfileToken } from "./studioV2ScopeEditor.mjs";

const MATERIAL_GROUP_LABELS = Object.freeze({
  promo: "Group Promo",
  group_a: "Group A",
  group_b: "Group B",
  group_c: "Group C",
  group_d: "Group D",
  group_e: "Group E",
  group_f: "Group F",
  remnant: "Remnant"
});

function text(value, max = 500) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, max);
}

function selectedOptions(reviewRequest) {
  const rows = reviewRequest?.request_snapshot_json?.selectedOptions;
  return Array.isArray(rows)
    ? rows.filter((row) => row && Number(row.quantity) > 0 && text(row.optionKey, 300))
    : [];
}

function sourceRoomIndex(scope) {
  return new Map(
    (Array.isArray(scope?.rooms) ? scope.rooms : [])
      .filter((room) => room && room.included !== false && text(room.id, 120))
      .map((room) => [text(room.id, 120), room])
  );
}

function materialForToken(token) {
  const raw = text(token, 160);
  if (!raw) return null;
  return (
    getElite100CustomerMaterial(raw) ||
    (!/^e100[-_]/i.test(raw) ? getElite100CustomerMaterial(`e100-${raw}`) : null)
  );
}

function materialGroupLabel(material) {
  return MATERIAL_GROUP_LABELS[String(material?.pricingGroupCode || "").toLowerCase()] || null;
}

function selectionLabel(row, fallback) {
  return text(row?.displayLabel || row?.label || fallback, 240) || fallback;
}

function pushNotApplied(target, input) {
  target.push({
    kind: text(input.kind, 60) || "customer_request",
    roomId: text(input.roomId, 120) || null,
    label: text(input.label, 500) || "Customer request requires estimator review",
    reason:
      text(input.reason, 500) ||
      "Not automatically applied. Review and update the editable Studio scope manually."
  });
}

function physicalScopeRequests(selectionPayload, foundation, split) {
  const requests = [];
  for (const opening of foundation.requestedOpenings || []) {
    pushNotApplied(requests, {
      kind: "opening",
      roomId: opening.roomId,
      label: `${text(opening.type, 60).replace(/_/g, " ")} ×${Number(opening.quantity) || 1}`,
      reason: "Opening quantities and placement were not changed automatically."
    });
  }
  for (const waterfall of foundation.requestedWaterfalls || []) {
    pushNotApplied(requests, {
      kind: "waterfall",
      roomId: waterfall.roomId,
      label: `Waterfall request${waterfall.side ? ` (${text(waterfall.side, 40)})` : ""}`,
      reason: "Waterfall geometry and labor were not changed automatically."
    });
  }
  for (const note of foundation.customerNotes || []) {
    pushNotApplied(requests, {
      kind: "customer_note",
      label: text(note.note, 500),
      reason: "Customer notes require estimator judgment."
    });
  }
  if (foundation.backsplashPreference?.preference === "request_change") {
    pushNotApplied(requests, {
      kind: "backsplash_change_request",
      label: "Backsplash change request",
      reason: "Backsplash physical scope was not changed automatically."
    });
  }
  for (const [roomId, note] of Object.entries(split.roomNotes || {})) {
    if (!text(note, 500)) continue;
    pushNotApplied(requests, {
      kind: "room_note",
      roomId,
      label: text(note, 500),
      reason: "Room notes require estimator review."
    });
  }
  const projectNote = text(split.projectNote || selectionPayload?.__projectNote, 500);
  if (projectNote) {
    pushNotApplied(requests, {
      kind: "project_note",
      label: projectNote,
      reason: "Project notes require estimator review."
    });
  }
  return requests;
}

/**
 * @param {{
 *   sourceScope?: object|null,
 *   reviewRequest: object,
 *   selection?: object|null,
 *   actorUserId?: string|null,
 *   now?: string
 * }} input
 */
export function mapCustomerConfigurationToStudioV2DraftPatch(input) {
  const sourceScope =
    input?.sourceScope && typeof input.sourceScope === "object" ? input.sourceScope : {};
  const scope = structuredClone(sourceScope);
  scope.rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const roomsById = sourceRoomIndex(scope);
  const options = selectedOptions(input?.reviewRequest);
  const selectionPayload =
    input?.selection?.selection_payload_json ||
    input?.selection?.selectionPayloadJson ||
    {};
  const split = splitSelectionPayloadMeta(selectionPayload);
  let foundation = sanitizeCustomerConfigurationFoundation(split.customerConfiguration, {
    rejectForbidden: false
  });
  foundation = enrichFoundationFromSelectionQuantities(foundation, split.quantities || {});
  foundation = finalizeCustomerConfigurationFoundation(foundation);
  const classification = classifyCustomerConfigurationForReview({
    foundation,
    selectionPayload,
    quantities: split.quantities || {},
    roomNotes: split.roomNotes || {},
    projectNote: split.projectNote || selectionPayload?.__projectNote || null,
    customerNote: input?.reviewRequest?.customer_note || null,
    selectedOptions: options
  });

  const appliedSummary = [];
  const notAppliedRequests = physicalScopeRequests(selectionPayload, foundation, split);
  const warnings = [];
  const materialSelections = [];
  const edgeSelections = [];

  if (
    foundation.backsplashPreference?.preference === "keep_approved" ||
    foundation.backsplashPreference?.preference === "include" ||
    foundation.backsplashPreference?.preference === "remove"
  ) {
    appliedSummary.push({
      kind: "backsplash_preference",
      roomId: null,
      label: `Backsplash: ${text(foundation.backsplashPreference.preference, 60).replace(/_/g, " ")}`
    });
  }

  for (const row of options) {
    const optionKey = text(row.optionKey, 300);
    const parts = optionKey.split(":");
    if (parts[0] === "material" && parts.length >= 3) {
      const roomId = parts[1];
      const materialToken = parts.slice(2).join(":");
      const room = roomsById.get(roomId);
      const material = materialForToken(materialToken);
      const group = materialGroupLabel(material);
      if (!room || !material || material.customerVisible === false || !group) {
        pushNotApplied(notAppliedRequests, {
          kind: "material",
          roomId,
          label: selectionLabel(row, materialToken),
          reason: "Material could not be mapped safely to an existing Studio V2 room and pricing group."
        });
        continue;
      }
      materialSelections.push({ roomId, room, material, group });
      continue;
    }

    if (parts[0] === "edge" && parts.length >= 3) {
      const roomId = parts[1];
      const rawToken = parts.slice(2).join(":");
      const room = roomsById.get(roomId);
      const normalized = normalizeStudioV2EdgeProfileToken(rawToken);
      if (!room || !normalized.ok || !normalized.value) {
        pushNotApplied(notAppliedRequests, {
          kind: "edge",
          roomId,
          label: selectionLabel(row, rawToken),
          reason: "Edge selection could not be mapped safely to an existing Studio V2 room/profile."
        });
        continue;
      }
      edgeSelections.push({ roomId, room, token: normalized.value, label: selectionLabel(row, rawToken) });
      continue;
    }

    const parsed = parseProductOptionKey(optionKey);
    if (
      parsed &&
      ["sink", "faucet", "accessory", "specialty"].includes(String(parsed.kind || ""))
    ) {
      // Digital Estimate owns allowed product selections. Record them as applied
      // customer configuration, not as Studio V2 physical-scope warnings.
      appliedSummary.push({
        kind: parsed.kind,
        roomId: parsed.roomKey || null,
        label: selectionLabel(row, optionKey)
      });
      continue;
    }
    if (
      parsed?.kind === "backsplash" &&
      ["keep_approved", "include", "remove"].includes(String(parsed.mode || ""))
    ) {
      if (!appliedSummary.some((item) => item.kind === "backsplash_preference")) {
        appliedSummary.push({
          kind: "backsplash_preference",
          roomId: parsed.roomKey || null,
          label: `Backsplash: ${String(parsed.mode).replace(/_/g, " ")}`
        });
      }
      continue;
    }
    if (
      parsed?.kind === "backsplash" &&
      ["custom_height", "request_change"].includes(String(parsed.mode || ""))
    ) {
      pushNotApplied(notAppliedRequests, {
        kind: "backsplash_scope",
        roomId: parsed.roomKey,
        label: selectionLabel(row, optionKey),
        reason: "Backsplash physical scope was not changed automatically."
      });
      continue;
    }
    if (parsed?.kind === "sidesplash") {
      pushNotApplied(notAppliedRequests, {
        kind: parsed.kind,
        roomId: parsed.roomKey,
        label: selectionLabel(row, optionKey),
        reason: "Physical splash scope was not changed automatically."
      });
      continue;
    }

    warnings.push(`Ignored unsupported customer selection: ${selectionLabel(row, optionKey)}`);
  }

  const includedRoomIds = [...roomsById.keys()];
  const uniqueMaterialIds = new Set(
    materialSelections.map((item) => String(item.material.materialId))
  );
  const selectedMaterialRoomIds = new Set(materialSelections.map((item) => item.roomId));
  const canUseEstimateWideMaterial =
    materialSelections.length > 0 &&
    uniqueMaterialIds.size === 1 &&
    (includedRoomIds.length === 1 ||
      includedRoomIds.every((roomId) => selectedMaterialRoomIds.has(roomId)));

  for (const item of materialSelections) {
    item.room.materialGroupOverride = item.group;
    appliedSummary.push({
      kind: "material_group",
      roomId: item.roomId,
      label: `${text(item.room.name || item.roomId, 120)} material pricing group: ${item.group}`
    });
  }
  if (canUseEstimateWideMaterial) {
    const chosen = materialSelections[0];
    scope.materialGroup = chosen.group;
    scope.colorName = text(chosen.material.displayName, 160);
    scope.colorTbd = false;
    appliedSummary.push({
      kind: "material_color",
      roomId: null,
      label: `Material/color: ${scope.colorName} (${chosen.group})`
    });
  } else if (materialSelections.length > 0) {
    warnings.push(
      "Room material pricing groups were applied, but the estimate-wide color label was left unchanged because the customer selections do not map to one common Studio V2 color."
    );
  }

  const uniqueEdgeTokens = new Set(edgeSelections.map((item) => item.token));
  const selectedEdgeRoomIds = new Set(edgeSelections.map((item) => item.roomId));
  const canUseEstimateWideEdge =
    edgeSelections.length > 0 &&
    uniqueEdgeTokens.size === 1 &&
    (includedRoomIds.length === 1 ||
      includedRoomIds.every((roomId) => selectedEdgeRoomIds.has(roomId)));
  for (const item of edgeSelections) {
    const pieces = Array.isArray(item.room.pieces)
      ? item.room.pieces.filter((piece) => piece && piece.included !== false)
      : [];
    if (!pieces.length && !canUseEstimateWideEdge) {
      pushNotApplied(notAppliedRequests, {
        kind: "edge",
        roomId: item.roomId,
        label: item.label,
        reason: "No editable Studio V2 pieces were available for the room edge selection."
      });
      continue;
    }
    for (const piece of pieces) piece.edgeProfileToken = item.token;
    appliedSummary.push({
      kind: "edge",
      roomId: item.roomId,
      label: `${text(item.room.name || item.roomId, 120)} edge: ${item.label}`
    });
  }
  if (canUseEstimateWideEdge) scope.edgeProfileToken = edgeSelections[0].token;

  return {
    scope,
    appliedSummary,
    notAppliedRequests,
    warnings,
    classification,
    source: {
      publicationId: text(input?.reviewRequest?.publication_id, 120) || null,
      reviewRequestId: text(input?.reviewRequest?.id, 120) || null,
      selectionId:
        text(input?.reviewRequest?.selection_id || input?.selection?.id, 120) || null,
      selectionHash:
        text(input?.reviewRequest?.selection_hash || input?.selection?.selection_hash, 160) ||
        null
    }
  };
}

export function customerSelectionRevisionIdentity(reviewRequest) {
  return {
    reviewRequestId: text(reviewRequest?.id, 120) || null,
    selectionId: text(reviewRequest?.selection_id, 120) || null,
    selectionHash: text(reviewRequest?.selection_hash, 160) || null
  };
}

/**
 * Stable UUID-shaped estimate id for one server-resolved submitted selection
 * set. The database primary key is the cross-process idempotency barrier: two
 * concurrent workers inserting the same revision identity cannot create two
 * siblings, and a retry can retrieve the winner without a durable lock row.
 */
export function customerSelectionRevisionEstimateId({
  organizationId,
  intakeCaseId,
  sourceApprovedEstimateId,
  reviewRequest
}) {
  const identity = customerSelectionRevisionIdentity(reviewRequest);
  const seed = [
    "eliteos-studio-v2-customer-selection-revision-v1",
    text(organizationId, 120),
    text(intakeCaseId, 120),
    text(sourceApprovedEstimateId, 120),
    identity.reviewRequestId,
    identity.selectionId,
    identity.selectionHash
  ].join("\u001f");
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  // RFC 9562 version 8 (application-defined name-based UUID), variant 10.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function matchesCustomerSelectionRevision(scope, reviewRequest) {
  const marker = scope?.studioV2CustomerSelectionRevision;
  if (!marker || marker.createdFromCustomerSelections !== true) return false;
  const identity = customerSelectionRevisionIdentity(reviewRequest);
  if (identity.reviewRequestId && String(marker.sourceReviewRequestId) === identity.reviewRequestId) {
    return true;
  }
  return Boolean(
    identity.selectionId &&
      String(marker.sourceSelectionId) === identity.selectionId &&
      (!identity.selectionHash || String(marker.sourceSelectionHash) === identity.selectionHash)
  );
}

export function buildCustomerSelectionRevisionInfo(scope, opts = {}) {
  const marker = scope?.studioV2CustomerSelectionRevision;
  if (!marker || marker.createdFromCustomerSelections !== true) return null;
  const status = String(opts.status || "").toLowerCase();
  const approved = status === "approved";
  const published = opts.published === true;
  return {
    createdFromCustomerSelections: true,
    createdFromCustomerSelectionsAt: marker.createdFromCustomerSelectionsAt || null,
    sourcePublicationId: marker.sourcePublicationId || null,
    sourceReviewRequestId: marker.sourceReviewRequestId || null,
    sourceSelectionId: marker.sourceSelectionId || null,
    sourceApprovedEstimateId: marker.sourceApprovedEstimateId || null,
    appliedSelectionsSummary: Array.isArray(marker.appliedSelectionsSummary)
      ? marker.appliedSelectionsSummary
      : [],
    notAppliedScopeRequests: Array.isArray(marker.notAppliedScopeRequests)
      ? marker.notAppliedScopeRequests
      : [],
    warnings: Array.isArray(marker.warnings) ? marker.warnings : [],
    needsRecalculation:
      opts.needsRecalculation != null
        ? Boolean(opts.needsRecalculation)
        : !approved,
    approved,
    published
  };
}
