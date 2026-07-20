/**
 * Structured missing-information requirements for Digital Estimate customer drafts.
 * Does not block saves, review requests, or acceptance — durable codes for later sold-job tasks.
 */

import {
  CUSTOMER_INFO_DRAFT_KEY
} from "../configuration/customerConfigurationDraft.mjs";

/** @typedef {import('./esfPlumbingCatalogContract.mjs').MissingInfoRequirementCode} MissingInfoRequirementCode */

export const MISSING_INFO_REQUIREMENT_CODES = Object.freeze({
  customer_sink_model_required: "customer_sink_model_required",
  customer_faucet_model_required: "customer_faucet_model_required",
  faucet_hole_count_required: "faucet_hole_count_required",
  custom_backsplash_height_review: "custom_backsplash_height_review",
  full_height_measurement_required: "full_height_measurement_required",
  specialty_item_quote_required: "specialty_item_quote_required",
  product_availability_confirmation_required: "product_availability_confirmation_required"
});

/**
 * @typedef {Object} MissingInformationRequirement
 * @property {MissingInfoRequirementCode} code
 * @property {string} [roomKey]
 * @property {string} message
 * @property {string} customerCopy
 * @property {'info' | 'review'} severity
 * @property {boolean} blocksSave Always false for this phase
 */

/**
 * @param {string} code
 * @param {Partial<MissingInformationRequirement>} [extra]
 * @returns {MissingInformationRequirement}
 */
function req(code, extra = {}) {
  const defaults = {
    customer_sink_model_required: {
      message: "Customer-provided sink is missing manufacturer/model",
      customerCopy: "You can provide this later. We will need the sink model before fabrication.",
      severity: /** @type {const} */ ("info")
    },
    customer_faucet_model_required: {
      message: "Customer-provided faucet is missing manufacturer/model",
      customerCopy:
        "You can provide this later. We will need the faucet model before installation coordination.",
      severity: /** @type {const} */ ("info")
    },
    faucet_hole_count_required: {
      message: "Faucet hole count / drilling configuration is unknown",
      customerCopy: "Hole count will be confirmed with your estimator before fabrication.",
      severity: /** @type {const} */ ("review")
    },
    custom_backsplash_height_review: {
      message: "Custom backsplash height requires estimator review",
      customerCopy: "Final measurements and pricing require estimator review.",
      severity: /** @type {const} */ ("review")
    },
    full_height_measurement_required: {
      message: "Full-height backsplash lacks estimator-defined measurements",
      customerCopy: "Full-height backsplash measurements will be confirmed by your estimator.",
      severity: /** @type {const} */ ("review")
    },
    specialty_item_quote_required: {
      message: "Specialty item requires a custom quote",
      customerCopy: "This specialty item will be quoted by your estimator.",
      severity: /** @type {const} */ ("review")
    },
    product_availability_confirmation_required: {
      message: "Special-order product availability should be confirmed",
      customerCopy: "Availability for special-order items will be confirmed by your estimator.",
      severity: /** @type {const} */ ("info")
    }
  };
  const d = defaults[/** @type {keyof typeof defaults} */ (code)] || {
    message: code,
    customerCopy: code,
    severity: /** @type {const} */ ("info")
  };
  return {
    code: /** @type {MissingInfoRequirementCode} */ (code),
    message: d.message,
    customerCopy: d.customerCopy,
    severity: d.severity,
    blocksSave: false,
    ...extra
  };
}

/**
 * @param {unknown} value
 */
function isBlank(value) {
  return value == null || String(value).trim() === "";
}

/**
 * Inspect a selection / draft payload and return structured missing-info requirements.
 * Never throws; never implies a save block.
 *
 * Supported shapes (best-effort):
 * - { rooms: [{ roomKey, sink, faucet, backsplash, specialtyItems }] }
 * - { sinkSelections, faucetSelections, backsplashSelections, specialtySelections }
 * - flat keys under payload.__plumbingDraft / payload.plumbing
 *
 * @param {unknown} selectionPayload
 * @returns {MissingInformationRequirement[]}
 */
export function buildMissingInformationRequirements(selectionPayload) {
  /** @type {MissingInformationRequirement[]} */
  const out = [];
  const seen = new Set();

  /**
   * @param {MissingInformationRequirement} r
   */
  const push = (r) => {
    const key = `${r.code}:${r.roomKey || ""}:${r.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };

  const payload =
    selectionPayload && typeof selectionPayload === "object" && !Array.isArray(selectionPayload)
      ? /** @type {Record<string, unknown>} */ (selectionPayload)
      : {};

  const plumbing =
    (payload.plumbing && typeof payload.plumbing === "object" ? payload.plumbing : null) ||
    (payload.__plumbingDraft && typeof payload.__plumbingDraft === "object"
      ? payload.__plumbingDraft
      : null) ||
    payload;

  /** @type {any[]} */
  let rooms = [];
  if (Array.isArray(/** @type {any} */ (plumbing).rooms)) {
    rooms = /** @type {any[]} */ (/** @type {any} */ (plumbing).rooms);
  } else if (Array.isArray(payload.rooms)) {
    rooms = /** @type {any[]} */ (payload.rooms);
  } else {
    // Synthetic single-room from top-level sink/faucet/backsplash
    rooms = [
      {
        roomKey: "default",
        sink: /** @type {any} */ (plumbing).sink || payload.sink,
        faucet: /** @type {any} */ (plumbing).faucet || payload.faucet,
        backsplash: /** @type {any} */ (plumbing).backsplash || payload.backsplash,
        specialtyItems:
          /** @type {any} */ (plumbing).specialtyItems ||
          payload.specialtyItems ||
          /** @type {any} */ (plumbing).specialty ||
          payload.specialty
      }
    ];
  }

  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const roomKey = String(room.roomKey || room.room_key || "default");

    const sink = room.sink;
    if (sink && typeof sink === "object") {
      const source = String(sink.source || sink.mode || "").toLowerCase();
      if (source === "customer_provided" || source === "customer-provided" || source === "customer") {
        if (isBlank(sink.model) && isBlank(sink.sinkModel) && isBlank(sink.manufacturer)) {
          push(req(MISSING_INFO_REQUIREMENT_CODES.customer_sink_model_required, { roomKey }));
        }
      }
      if (source === "esf" || source === "catalog") {
        const availability = String(sink.availability || "").toLowerCase();
        if (availability === "special_order" || sink.availabilityConfirmationRequired) {
          push(
            req(MISSING_INFO_REQUIREMENT_CODES.product_availability_confirmation_required, {
              roomKey
            })
          );
        }
      }
    }

    const faucet = room.faucet;
    if (faucet && typeof faucet === "object") {
      const source = String(faucet.source || faucet.mode || "").toLowerCase();
      if (source === "customer_provided" || source === "customer-provided" || source === "customer") {
        if (isBlank(faucet.model) && isBlank(faucet.faucetModel) && isBlank(faucet.manufacturer)) {
          push(req(MISSING_INFO_REQUIREMENT_CODES.customer_faucet_model_required, { roomKey }));
        }
      }
      const holeCount = faucet.holeCount ?? faucet.holes ?? faucet.faucetHoleCount;
      if (
        (source === "esf" ||
          source === "catalog" ||
          source === "customer_provided" ||
          source === "customer") &&
        (holeCount == null || holeCount === "" || holeCount === "unknown")
      ) {
        if (faucet.requiresHoleCount !== false) {
          push(req(MISSING_INFO_REQUIREMENT_CODES.faucet_hole_count_required, { roomKey }));
        }
      }
    }

    const backsplash = room.backsplash;
    if (backsplash && typeof backsplash === "object") {
      const mode = String(backsplash.mode || backsplash.heightMode || "").toLowerCase();
      if (mode === "custom" || mode === "custom_height" || mode === "custom-height") {
        push(req(MISSING_INFO_REQUIREMENT_CODES.custom_backsplash_height_review, { roomKey }));
      }
      if (mode === "full_height" || mode === "full-height") {
        const hasMeasurement =
          backsplash.measurementsLocked === true ||
          backsplash.estimatorGeometryComplete === true ||
          (backsplash.measuredLengthIn != null && Number(backsplash.measuredLengthIn) > 0);
        if (!hasMeasurement) {
          push(req(MISSING_INFO_REQUIREMENT_CODES.full_height_measurement_required, { roomKey }));
        }
      }
    }

    const specialtyItems = room.specialtyItems || room.specialty;
    const list = Array.isArray(specialtyItems)
      ? specialtyItems
      : specialtyItems && typeof specialtyItems === "object"
        ? [specialtyItems]
        : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      if (
        item.pricingTreatment === "review_only" ||
        item.estimatorReviewRequired === true ||
        item.requiresQuote === true
      ) {
        push(
          req(MISSING_INFO_REQUIREMENT_CODES.specialty_item_quote_required, {
            roomKey,
            message: `Specialty item requires a custom quote (${item.productId || item.displayName || "item"})`
          })
        );
      }
    }
  }

  // Ignore customer info draft presence — this helper does not validate CRM fields.
  void payload[CUSTOMER_INFO_DRAFT_KEY];

  return out;
}
