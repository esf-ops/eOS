/**
 * After Studio Repair rebuilds a configuration envelope, migrate the latest
 * customer selection onto the new active envelope with exclusive-role sanitation.
 *
 * Does not change pricing formulas. Display calc is sanitized for exclusive
 * losers; a full reprice happens on the next successful public save.
 */

import {
  mergeSelectionPayloadMeta,
  splitSelectionPayloadMeta
} from "./customerConfigurationDraft.mjs";
import {
  sanitizeExclusiveRoomSelectionQuantities,
  sanitizeSelectionPayloadMeta,
  sanitizeCustomerCalculationForExclusiveSelections
} from "./sanitizeExclusiveRoomSelections.mjs";
import { hashCanonical } from "./configurationValidation.mjs";

/**
 * Some callers persist `{ quantities: {...}, __meta... }`. Public saves use a
 * flat map. Accept both so repair sanitation sees real option keys.
 * @param {object} payload
 */
function flattenSelectionPayloadIfNested(payload) {
  const src = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const nested = src.quantities;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return src;
  const hasFlatOptionKeys = Object.keys(src).some(
    (k) => k !== "quantities" && !String(k).startsWith("__") && String(k).includes(":")
  );
  if (hasFlatOptionKeys) return src;
  const { quantities: _drop, ...rest } = src;
  return { ...nested, ...rest };
}

/**
 * @param {object} deps
 * @param {object} deps.configurationRepository
 * @param {string} deps.organizationId
 * @param {string} deps.publicationId
 * @param {string} deps.envelopeId — newly activated envelope
 * @param {string|null} [deps.actorUserId]
 * @param {Array<object>} [deps.options] — envelope option rows
 * @param {Array<{ roomKey?: string, displayName?: string }>} [deps.rooms]
 */
export async function migrateSanitizedSelectionsToRepairedEnvelope(deps) {
  const {
    configurationRepository,
    organizationId,
    publicationId,
    envelopeId,
    actorUserId = null,
    options = [],
    rooms = []
  } = deps || {};

  if (!configurationRepository || !organizationId || !publicationId || !envelopeId) {
    return {
      migrated: false,
      reason: "missing_args",
      removedKeys: [],
      remappedKeys: [],
      changed: false
    };
  }

  let prior = null;
  if (typeof configurationRepository.getLatestSelectionForPublication === "function") {
    prior = await configurationRepository.getLatestSelectionForPublication(
      organizationId,
      publicationId
    );
  }
  if (!prior) {
    return {
      migrated: false,
      reason: "no_prior_selection",
      removedKeys: [],
      remappedKeys: [],
      changed: false
    };
  }

  const split = splitSelectionPayloadMeta(
    flattenSelectionPayloadIfNested(prior.selection_payload_json || {})
  );
  const sanitizedMeta = sanitizeSelectionPayloadMeta(split, options, {
    throwOnAmbiguous: false
  });
  const firstPass = sanitizedMeta._exclusiveSanitization || {
    removedKeys: [],
    remappedKeys: [],
    changed: false
  };

  // Drop positive qty keys that are not on the rebuilt envelope (except
  // canonical backsplash orphans already handled by sanitize + normalize).
  const envelopeKeys = new Set(
    (options || []).map((o) => String(o.option_key || o.optionKey || "")).filter(Boolean)
  );
  /** @type {string[]} */
  const droppedOffEnvelope = [];
  /** @type {Record<string, number>} */
  const quantities = {};
  for (const [key, qty] of Object.entries(sanitizedMeta.quantities || {})) {
    const n = Number(qty) || 0;
    if (!(n > 0)) continue;
    // Never migrate governed fabrication qty keys into the public selection map —
    // they round-trip through the UI and break /selections after repair.
    if (
      key === "qty-cook" ||
      key === "qty-sink" ||
      key === "qty-bar" ||
      key === "qty-outlet" ||
      key === "qty-ss" ||
      key === "qty-v-rect" ||
      key === "qty-v-oval" ||
      key === "qty-blanco" ||
      key === "tearout" ||
      key === "waterfall" ||
      key === "popup_outlet_cutout" ||
      /^qty-(cook|sink|bar|outlet)(:|$)/i.test(key)
    ) {
      droppedOffEnvelope.push(key);
      continue;
    }
    if (envelopeKeys.size && !envelopeKeys.has(key)) {
      // Finish-specific ESF may have been remapped already; anything else drops.
      droppedOffEnvelope.push(key);
      continue;
    }
    quantities[key] = n;
  }

  const exclusive = sanitizeExclusiveRoomSelectionQuantities(quantities, options, {
    throwOnAmbiguous: false
  });

  const removedKeys = [
    ...(firstPass.removedKeys || []),
    ...(exclusive.removedKeys || []),
    ...droppedOffEnvelope
  ];
  const remappedKeys = [
    ...(firstPass.remappedKeys || []),
    ...(exclusive.remappedKeys || [])
  ];
  const changed =
    Boolean(firstPass.changed) ||
    Boolean(exclusive.changed) ||
    droppedOffEnvelope.length > 0;

  const selectionPayload = mergeSelectionPayloadMeta(exclusive.quantities, {
    customerInfoDraft: sanitizedMeta.customerInfoDraft,
    roomLabelDrafts: sanitizedMeta.roomLabelDrafts,
    roomNotes: sanitizedMeta.roomNotes,
    projectNote: sanitizedMeta.projectNote,
    customerProductDrafts: sanitizedMeta.customerProductDrafts,
    backsplashDrafts: sanitizedMeta.backsplashDrafts,
    sideSplashDrafts: sanitizedMeta.sideSplashDrafts,
    customerConfiguration: sanitizedMeta.customerConfiguration
  });
  const selectionHash = hashCanonical(exclusive.quantities);

  let priorCalc = null;
  if (typeof configurationRepository.getCalculationBySelectionId === "function") {
    priorCalc = await configurationRepository.getCalculationBySelectionId(
      organizationId,
      prior.id
    );
  }

  const customerResultJson = sanitizeCustomerCalculationForExclusiveSelections(
    priorCalc?.customer_result_json || priorCalc?.customerResultJson || {
      configuredDisplayTotal: priorCalc?.configured_total ?? null,
      baselineDisplayTotal: priorCalc?.baseline_total ?? null
    },
    exclusive.quantities,
    rooms
  );

  if (typeof configurationRepository.saveRepairedPublicationSelection !== "function") {
    return {
      migrated: false,
      reason: "save_helper_missing",
      removedKeys,
      remappedKeys,
      changed
    };
  }

  const saved = await configurationRepository.saveRepairedPublicationSelection({
    organizationId,
    publicationId,
    envelopeId,
    actorUserId,
    selectionPayload,
    selectionHash,
    customerResultJson,
    baselineTotal: priorCalc?.baseline_total ?? null,
    configuredTotal:
      customerResultJson?.configuredDisplayTotal ??
      priorCalc?.configured_total ??
      null,
    sourceSelectionId: prior.id
  });

  return {
    migrated: Boolean(saved?.selection?.id),
    reason: saved?.selection?.id ? "ok" : "save_failed",
    selectionId: saved?.selection?.id || null,
    sessionId: saved?.session?.id || null,
    removedKeys,
    remappedKeys,
    changed,
    optionCount: envelopeKeys.size
  };
}
