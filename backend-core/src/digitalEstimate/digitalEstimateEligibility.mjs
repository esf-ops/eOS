/**
 * Elite 100 Digital Estimate eligibility — fail closed.
 *
 * Authority is the persisted quote_headers.calculation_snapshot only.
 * Publish request bodies cannot supply material_program_default / elite_100 —
 * those keys are rejected by publishDigitalEstimate. A browser claiming
 * "elite_100" on the publish POST is never consulted.
 *
 * material_program_default evidence source:
 * - Written by Internal Estimate save path (backend-core internalQuotesApi
 *   hardcodes material_program_default: "elite_100" into calculation_snapshot).
 * - Assessed here from that persisted snapshot (internal_ui or root field).
 * - Must be EXPLICIT — missing ⇒ elite_100_eligibility_ambiguous.
 *
 * Authoritative checks:
 * 1. quote_source === "internal_quote"
 * 2. Explicit material_program_default / materialProgramDefault === "elite_100"
 * 3. No room resolves to out_of_collection
 * 4. customer_display_total on the same calculation_snapshot; print snapshot
 *    finalRounded (same snapshot) matches when present
 * 5. Not archived
 *
 * Non-Elite-100 / custom / partner / public sources are never eligible.
 */

import {
  normalizeMaterialProgramDefault,
  resolveRoomMaterialProgram
} from "../quotes/internalEstimateMaterialProgram.js";

/**
 * @param {Record<string, unknown>|null|undefined} header quote_headers row
 * @returns {{
 *   eligible: boolean,
 *   code: string,
 *   message: string,
 *   details?: Record<string, unknown>
 * }}
 */
export function assessElite100PublicationEligibility(header) {
  if (!header || typeof header !== "object") {
    return {
      eligible: false,
      code: "quote_not_found",
      message: "Quote not found"
    };
  }

  const quoteSource = String(header.quote_source ?? "").trim();
  if (quoteSource !== "internal_quote") {
    return {
      eligible: false,
      code: "not_elite_100_internal",
      message: "Only saved Internal Estimate quotes can be published",
      details: { quoteSource }
    };
  }

  if (header.archived_at) {
    return {
      eligible: false,
      code: "quote_archived",
      message: "Archived quotes cannot be published"
    };
  }

  const snapshot =
    header.calculation_snapshot && typeof header.calculation_snapshot === "object"
      ? header.calculation_snapshot
      : null;
  if (!snapshot || Object.keys(snapshot).length === 0) {
    return {
      eligible: false,
      code: "calculation_snapshot_missing",
      message: "Quote is missing a calculation snapshot"
    };
  }

  const iu =
    snapshot.internal_ui && typeof snapshot.internal_ui === "object" ? snapshot.internal_ui : {};

  const programRaw =
    iu.material_program_default ??
    iu.materialProgramDefault ??
    snapshot.materialProgramDefault ??
    snapshot.material_program_default;

  if (programRaw == null || String(programRaw).trim() === "") {
    return {
      eligible: false,
      code: "elite_100_eligibility_ambiguous",
      message:
        "Missing authoritative material_program_default on calculation_snapshot — cannot confirm Elite 100",
      details: { missingField: "calculation_snapshot.internal_ui.material_program_default" }
    };
  }

  const program = normalizeMaterialProgramDefault(programRaw);
  if (program !== "elite_100") {
    return {
      eligible: false,
      code: "not_elite_100_internal",
      message: "Quote material program is not Elite 100",
      details: { materialProgramDefault: program }
    };
  }

  const rooms = Array.isArray(iu.estimate_rooms)
    ? iu.estimate_rooms
    : Array.isArray(snapshot.estimate_rooms)
      ? snapshot.estimate_rooms
      : [];

  const oocRooms = [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    if (resolveRoomMaterialProgram(room, "elite_100") === "out_of_collection") {
      oocRooms.push(String(room.name ?? room.room_name ?? "Room"));
    }
  }
  if (oocRooms.length) {
    return {
      eligible: false,
      code: "not_elite_100_internal",
      message: "Out-of-collection rooms are not eligible for Elite 100 digital publication",
      details: { rooms: oocRooms }
    };
  }

  const cdt = Number(iu.customer_display_total);
  if (!Number.isFinite(cdt) || cdt <= 0) {
    return {
      eligible: false,
      code: "customer_display_total_missing",
      message: "customer_display_total is required before publishing"
    };
  }

  const printSnap = iu.customer_estimate_print_snapshot;
  if (printSnap && typeof printSnap === "object") {
    const finalRounded = Math.round(Number(printSnap.finalRounded));
    if (!Number.isFinite(finalRounded) || finalRounded <= 0) {
      return {
        eligible: false,
        code: "print_snapshot_invalid",
        message: "customer_estimate_print_snapshot.finalRounded is invalid"
      };
    }
    if (finalRounded !== Math.round(cdt)) {
      return {
        eligible: false,
        code: "print_snapshot_mismatch",
        message: "Print snapshot total does not match customer_display_total"
      };
    }
  }

  return {
    eligible: true,
    code: "eligible",
    message: "Eligible Elite 100 Internal Estimate",
    details: {
      materialProgramDefault: "elite_100",
      customerDisplayTotal: Math.round(cdt)
    }
  };
}
