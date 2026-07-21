/**
 * DE.Polish-3 — governed backsplash location + geometry authority.
 *
 * Pure, deterministic, server-only. Resolves *billed square footage* for a
 * room's original (baseline) and customer-selected backsplash mode from
 * estimator-approved geometry only. Never computes a dollar amount — that is
 * the calc engine's job (elite100ConfigDeltaEngineV2.mjs), which resolves the
 * material $/SF rate. This module never sees a rate, a markup, or a browser
 * value; it only ever reads frozen room geometry.
 *
 * ---------------------------------------------------------------------------
 * ELIGIBILITY AUTHORITY (see FEATURE_DECISIONS.md §137 for the full trace)
 * ---------------------------------------------------------------------------
 * There is no per-piece / per-edge wall-adjacency ("this edge is wall-backed,
 * that edge is an open island edge") data model anywhere in eliteOS today —
 * Studio, Internal Estimate, and Takeoff were all traced and confirmed to
 * have no such field. The estimator-approved authority that DOES exist is a
 * per-room aggregate: `backsplashSf` (billed, already independently ceiled),
 * `backsplashMeasuredLengthIn` (linear inches of wall-backed run the
 * estimator/AI takeoff measured — islands and open peninsula ends are
 * instructed to be excluded at measurement time, see
 * takeoffExtractionPrompt.mjs), and `backsplashHeightMode`/`backsplashHeightIn`
 * (the ORIGINAL approved height/mode). This module treats that per-room
 * aggregate as the estimator-defined "eligible backsplash location" —
 * `backsplashMeasuredLengthIn > 0` (or, for legacy rooms measured before
 * length was tracked, `backsplashSf > 0`) is exactly "this room has one or
 * more estimator-approved, wall-backed backsplash locations." A room with
 * neither is reported as having no eligible backsplash locations at all —
 * see `roomHasEligibleBacksplashLocations`.
 *
 * A true segment-level model (roomId/pieceId/segmentId/eligibleLength with
 * per-edge wall/island classification) would require new estimator-side data
 * capture in Studio/Takeoff and is out of scope for this phase — flagged as a
 * business decision in the deliverable report.
 */

import { ceilBillableSquareFeet } from "../../quotes/billableSquareFeet.mjs";

/** Customer-facing backsplash modes. */
export const BACKSPLASH_MODES = Object.freeze(["none", "standard_4in", "custom_height", "full_height"]);

/** Fixed height for the 4-inch mode. */
export const STANDARD_BACKSPLASH_HEIGHT_IN = 4;

/**
 * Governed custom-height auto-price range. No business rule authorizing
 * automatic pricing beyond this existed before this phase — this exact
 * range is a new, explicit, documented default and is called out in
 * FEATURE_DECISIONS.md as a business decision pending confirmation. Heights
 * outside this range always require estimator review rather than being
 * auto-priced, regardless of whether geometry is known.
 */
export const GOVERNED_CUSTOM_HEIGHT_MIN_IN = 4;
export const GOVERNED_CUSTOM_HEIGHT_MAX_IN = 24;

/** Structured, non-blocking review codes (section 12). */
export const BACKSPLASH_REVIEW_CODES = Object.freeze({
  FULL_HEIGHT_MEASUREMENT_REQUIRED: "full_height_measurement_required",
  CUSTOM_HEIGHT_REVIEW: "custom_backsplash_height_review",
  GEOMETRY_MISSING: "backsplash_geometry_missing",
  REMOVAL_CREDIT_UNRESOLVED: "backsplash_removal_credit_unresolved",
  HEIGHT_OUT_OF_RANGE: "backsplash_height_out_of_range"
});

function mapStudioHeightModeToBacksplashMode(studioMode, backsplashSf) {
  const m = String(studioMode || "").toLowerCase();
  if (m === "full_height") return "full_height";
  if (m === "custom") return "custom_height";
  if (m === "standard") return "standard_4in";
  // Legacy rooms frozen before backsplashHeightMode existed: infer from the
  // only number available, never invent a new one.
  return Number(backsplashSf) > 0 ? "standard_4in" : "none";
}

/**
 * True when the room has any estimator-approved backsplash location at all
 * (independent of the customer's current choice — a room saved as "none"
 * this session may still have eligible wall-backed runs from the original
 * takeoff). See module doc for the exact authority used.
 * @param {{ backsplashSf?: number, rawBacksplashSf?: number, backsplashMeasuredLengthIn?: number|null }} room
 */
export function roomHasEligibleBacksplashLocations(room) {
  const measuredLengthIn = Number(room?.backsplashMeasuredLengthIn);
  if (Number.isFinite(measuredLengthIn) && measuredLengthIn > 0) return true;
  const rawSf = Number(room?.rawBacksplashSf ?? room?.backsplashSf);
  return Number.isFinite(rawSf) && rawSf > 0;
}

/**
 * Resolve the room's ORIGINAL (baseline) backsplash mode from frozen
 * publication evidence — never from a customer selection.
 * @param {{ backsplashHeightMode?: string|null, backsplashSf?: number }} room
 */
export function resolveOriginalBacksplashMode(room) {
  return mapStudioHeightModeToBacksplashMode(room?.backsplashHeightMode, room?.backsplashSf);
}

function ceilRawSfToBilled(rawSf) {
  return ceilBillableSquareFeet(rawSf);
}

/**
 * Resolve billed SF for a given backsplash mode against a room's frozen
 * geometry. Independent-section rounding: the raw SF for the mode being
 * priced is ceiled on its own, never combined with countertop or another
 * backsplash mode before ceiling.
 *
 * @param {{
 *   backsplashSf?: number,
 *   rawBacksplashSf?: number,
 *   backsplashHeightMode?: string|null,
 *   backsplashHeightIn?: number|null,
 *   backsplashMeasuredLengthIn?: number|null
 * }} room
 * @param {"none"|"standard_4in"|"custom_height"|"full_height"} mode
 * @param {{ requestedHeightInches?: number|null }} [customerInput]
 * @returns {{ billedSf: number|null, rawSf: number|null, reviewCode: string|null, resolvedHeightInches: number|null, source: string }}
 */
export function resolveBilledSfForMode(room, mode, customerInput = {}) {
  const originalMode = resolveOriginalBacksplashMode(room);
  const originalBilledSfKnown =
    room?.backsplashSf != null && Number.isFinite(Number(room.backsplashSf));
  const originalRawSf = originalBilledSfKnown ? Number(room?.rawBacksplashSf ?? room?.backsplashSf) : null;
  const originalBilledSf = originalBilledSfKnown ? Number(room?.backsplashSf) : null;
  const lengthIn = Number(room?.backsplashMeasuredLengthIn);
  const lengthKnown = Number.isFinite(lengthIn) && lengthIn > 0;

  if (mode === "none") {
    return { billedSf: 0, rawSf: 0, reviewCode: null, resolvedHeightInches: null, source: "none" };
  }

  if (mode === "standard_4in") {
    if (originalMode === "standard_4in" && originalBilledSfKnown) {
      // Exact reuse of the already-billed original — no mode-change delta.
      return {
        billedSf: originalBilledSf,
        rawSf: originalRawSf,
        reviewCode: null,
        resolvedHeightInches: STANDARD_BACKSPLASH_HEIGHT_IN,
        source: "original_billed_sf"
      };
    }
    if (lengthKnown) {
      const rawSf = (lengthIn * STANDARD_BACKSPLASH_HEIGHT_IN) / 144;
      return {
        billedSf: ceilRawSfToBilled(rawSf),
        rawSf,
        reviewCode: null,
        resolvedHeightInches: STANDARD_BACKSPLASH_HEIGHT_IN,
        source: "measured_length_recompute"
      };
    }
    // No original 4-inch billed SF and no linear length to recompute from — cannot
    // determine the eligible run without inventing a number.
    return {
      billedSf: null,
      rawSf: null,
      reviewCode: BACKSPLASH_REVIEW_CODES.GEOMETRY_MISSING,
      resolvedHeightInches: STANDARD_BACKSPLASH_HEIGHT_IN,
      source: "unresolved"
    };
  }

  if (mode === "full_height") {
    // Authoritative vertical height only exists when the ORIGINAL approved mode
    // was itself full-height (that is the only place a true wall-height
    // measurement was ever captured — see module doc / studioRoomBacksplash.mjs).
    if (originalMode === "full_height" && originalBilledSfKnown) {
      return {
        billedSf: originalBilledSf,
        rawSf: originalRawSf,
        reviewCode: null,
        resolvedHeightInches: Number.isFinite(Number(room?.backsplashHeightIn))
          ? Number(room.backsplashHeightIn)
          : null,
        source: "original_billed_sf"
      };
    }
    return {
      billedSf: null,
      rawSf: null,
      reviewCode: BACKSPLASH_REVIEW_CODES.FULL_HEIGHT_MEASUREMENT_REQUIRED,
      resolvedHeightInches: null,
      source: "unresolved"
    };
  }

  if (mode === "custom_height") {
    const requested = Number(customerInput?.requestedHeightInches);
    const heightKnown = Number.isFinite(requested) && requested > 0;
    if (!heightKnown) {
      return {
        billedSf: null,
        rawSf: null,
        reviewCode: BACKSPLASH_REVIEW_CODES.CUSTOM_HEIGHT_REVIEW,
        resolvedHeightInches: null,
        source: "unresolved"
      };
    }
    if (requested < GOVERNED_CUSTOM_HEIGHT_MIN_IN || requested > GOVERNED_CUSTOM_HEIGHT_MAX_IN) {
      return {
        billedSf: null,
        rawSf: null,
        reviewCode: BACKSPLASH_REVIEW_CODES.HEIGHT_OUT_OF_RANGE,
        resolvedHeightInches: requested,
        source: "unresolved"
      };
    }
    if (!lengthKnown) {
      return {
        billedSf: null,
        rawSf: null,
        reviewCode: BACKSPLASH_REVIEW_CODES.CUSTOM_HEIGHT_REVIEW,
        resolvedHeightInches: requested,
        source: "unresolved"
      };
    }
    // Approved run length only — customer selects height, never length.
    const rawSf = (lengthIn * requested) / 144;
    return {
      billedSf: ceilRawSfToBilled(rawSf),
      rawSf,
      reviewCode: null,
      resolvedHeightInches: requested,
      source: "measured_length_recompute"
    };
  }

  return {
    billedSf: null,
    rawSf: null,
    reviewCode: BACKSPLASH_REVIEW_CODES.GEOMETRY_MISSING,
    resolvedHeightInches: null,
    source: "unresolved"
  };
}

/**
 * Canonical governed backsplash pricing input (section 10). Geometry-only —
 * the caller (engine) fills in materialGroup/amount fields once it resolves
 * the $/SF rate.
 *
 * @param {object} room frozen/trusted room row
 * @param {"none"|"standard_4in"|"custom_height"|"full_height"} selectedMode
 * @param {{ requestedHeightInches?: number|null }} [customerInput]
 */
export function buildBacksplashPricingInput(room, selectedMode, customerInput = {}) {
  const originalMode = resolveOriginalBacksplashMode(room);
  const original = resolveBilledSfForMode(room, originalMode, {});
  const configured = resolveBilledSfForMode(room, selectedMode, customerInput);
  const hasEligibleLocations = roomHasEligibleBacksplashLocations(room);

  const reviewCodes = [];
  if (configured.reviewCode) reviewCodes.push(configured.reviewCode);
  if (
    selectedMode === "none" &&
    originalMode !== "none" &&
    original.billedSf == null
  ) {
    reviewCodes.push(BACKSPLASH_REVIEW_CODES.REMOVAL_CREDIT_UNRESOLVED);
  }

  return {
    roomKey: String(room?.roomKey || room?.id || ""),
    mode: selectedMode,
    originalMode,
    hasEligibleLocations,
    approvedGeometrySource: "estimator_approved_room_aggregate",
    selectedHeightInches: configured.resolvedHeightInches,
    originalRawSf: original.rawSf,
    originalBilledSf: original.billedSf,
    rawSf: configured.rawSf,
    billedSf: configured.billedSf,
    reviewRequired: reviewCodes.length > 0,
    reviewCodes
  };
}
