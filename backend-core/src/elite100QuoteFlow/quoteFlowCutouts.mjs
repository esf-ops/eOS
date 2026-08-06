/**
 * Quote Flow sink / fabrication cutout carry-forward.
 * Bridges takeoff `piece.cutouts[]` / run.cutouts into Studio V2 piece openings
 * (`kitchenSinkCutouts`, …) and scope.addOns (`qty-sink`, …).
 */

import { normalizeRunCutouts } from "../takeoff/takeoffCutoutScope.mjs";

/**
 * @param {unknown} cutouts
 * @returns {{
 *   kitchenSinkCutouts: number,
 *   vanityBarSinkCutouts: number,
 *   cooktopCutouts: number,
 *   outletCutouts: number
 * }}
 */
export function openingsCountsFromCutoutsArray(cutouts) {
  const { cutouts: normalized } = normalizeRunCutouts(cutouts);
  let kitchenSinkCutouts = 0;
  let vanityBarSinkCutouts = 0;
  let cooktopCutouts = 0;
  let outletCutouts = 0;
  for (const entry of normalized) {
    const qty = Math.max(0, Math.floor(Number(entry?.quantity) || 0));
    if (qty <= 0) continue;
    switch (String(entry?.type || "")) {
      case "kitchen_sink":
        kitchenSinkCutouts += qty;
        break;
      case "vanity_bar_sink":
        vanityBarSinkCutouts += qty;
        break;
      case "cooktop":
        cooktopCutouts += qty;
        break;
      case "electrical_outlet":
        outletCutouts += qty;
        break;
      default:
        break;
    }
  }
  return {
    kitchenSinkCutouts,
    vanityBarSinkCutouts,
    cooktopCutouts,
    outletCutouts
  };
}

/**
 * Resolve Studio V2 opening counts for a piece — prefer explicit fields, else cutouts[].
 * @param {object|null|undefined} piece
 */
export function resolvePieceOpeningCounts(piece) {
  if (!piece || typeof piece !== "object") {
    return {
      kitchenSinkCutouts: 0,
      vanityBarSinkCutouts: 0,
      cooktopCutouts: 0,
      outletCutouts: 0,
      hasExplicit: false
    };
  }
  const hasExplicit =
    piece.kitchenSinkCutouts != null ||
    piece.vanityBarSinkCutouts != null ||
    piece.cooktopCutouts != null ||
    piece.outletCutouts != null ||
    piece.electricalOutletCutouts != null;

  if (hasExplicit) {
    return {
      kitchenSinkCutouts: Math.max(0, Math.floor(Number(piece.kitchenSinkCutouts) || 0)),
      vanityBarSinkCutouts: Math.max(0, Math.floor(Number(piece.vanityBarSinkCutouts) || 0)),
      cooktopCutouts: Math.max(0, Math.floor(Number(piece.cooktopCutouts) || 0)),
      outletCutouts: Math.max(
        0,
        Math.floor(Number(piece.outletCutouts ?? piece.electricalOutletCutouts) || 0)
      ),
      hasExplicit: true
    };
  }

  if (Array.isArray(piece.cutouts) && piece.cutouts.length) {
    const fromArr = openingsCountsFromCutoutsArray(piece.cutouts);
    const any =
      fromArr.kitchenSinkCutouts > 0 ||
      fromArr.vanityBarSinkCutouts > 0 ||
      fromArr.cooktopCutouts > 0 ||
      fromArr.outletCutouts > 0;
    return { ...fromArr, hasExplicit: any };
  }

  return {
    kitchenSinkCutouts: 0,
    vanityBarSinkCutouts: 0,
    cooktopCutouts: 0,
    outletCutouts: 0,
    hasExplicit: false
  };
}

/**
 * Stamp Studio V2 opening fields onto a piece (keeps cutouts[] when present).
 * @param {object} piece
 * @param {{
 *   kitchenSinkCutouts?: number,
 *   vanityBarSinkCutouts?: number,
 *   cooktopCutouts?: number,
 *   outletCutouts?: number,
 *   cutouts?: unknown
 * }|null} [override]
 */
export function stampStudioOpeningsOntoPiece(piece, override = null) {
  if (!piece || typeof piece !== "object") return piece;
  const base =
    override && typeof override === "object"
      ? {
          kitchenSinkCutouts: Math.max(0, Math.floor(Number(override.kitchenSinkCutouts) || 0)),
          vanityBarSinkCutouts: Math.max(0, Math.floor(Number(override.vanityBarSinkCutouts) || 0)),
          cooktopCutouts: Math.max(0, Math.floor(Number(override.cooktopCutouts) || 0)),
          outletCutouts: Math.max(0, Math.floor(Number(override.outletCutouts) || 0)),
          hasExplicit: true
        }
      : resolvePieceOpeningCounts(piece);

  /** @type {Record<string, unknown>} */
  const next = {
    ...piece,
    kitchenSinkCutouts: base.kitchenSinkCutouts,
    vanityBarSinkCutouts: base.vanityBarSinkCutouts,
    cooktopCutouts: base.cooktopCutouts,
    outletCutouts: base.outletCutouts
  };

  if (override && Array.isArray(override.cutouts) && override.cutouts.length) {
    next.cutouts = override.cutouts;
  } else if (Array.isArray(piece.cutouts) && piece.cutouts.length) {
    next.cutouts = piece.cutouts;
  } else if (base.kitchenSinkCutouts > 0) {
    // Stable structured representation when only Studio fields exist.
    next.cutouts = [
      {
        type: "kitchen_sink",
        quantity: base.kitchenSinkCutouts,
        source: "estimator_confirmed"
      }
    ];
  }

  return next;
}

/**
 * Collect cutout openings from a reviewed takeoffResult (rooms→areas→runs).
 * @param {object|null|undefined} takeoffResult
 * @returns {Map<string, ReturnType<typeof openingsCountsFromCutoutsArray> & { cutouts: object[] }>}
 */
export function collectCutoutsFromTakeoffResult(takeoffResult) {
  /** @type {Map<string, ReturnType<typeof openingsCountsFromCutoutsArray> & { cutouts: object[] }>} */
  const map = new Map();
  if (!takeoffResult || typeof takeoffResult !== "object") return map;

  function ingest(run) {
    if (!run || typeof run !== "object" || run.included === false) return;
    const { cutouts } = normalizeRunCutouts(run.cutouts);
    if (!cutouts.length) return;
    const counts = openingsCountsFromCutoutsArray(cutouts);
    const payload = { ...counts, cutouts };
    const runId = String(run.id || "").trim();
    const label = String(run.label || run.name || "")
      .trim()
      .toLowerCase();
    if (runId) map.set(`id:${runId}`, payload);
    if (label) map.set(`name:${label}`, payload);
  }

  for (const room of Array.isArray(takeoffResult.rooms) ? takeoffResult.rooms : []) {
    for (const area of Array.isArray(room?.areas) ? room.areas : []) {
      for (const run of Array.isArray(area?.runs) ? area.runs : []) ingest(run);
    }
    // Flat pieces shape (already seeded scope / import drafts).
    for (const piece of Array.isArray(room?.pieces) ? room.pieces : []) ingest(piece);
  }
  return map;
}

/**
 * Apply takeoff cutouts onto official rooms (match by takeoffRunId / id / name),
 * and always stamp Studio openings from any existing piece.cutouts[].
 * @param {unknown} rooms
 * @param {object|null|undefined} takeoffResult
 */
export function applyTakeoffCutoutsToOfficialRooms(rooms, takeoffResult = null) {
  const fromTakeoff = collectCutoutsFromTakeoffResult(takeoffResult);
  if (!Array.isArray(rooms)) return [];
  return rooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const pieces = Array.isArray(room.pieces)
      ? room.pieces.map((piece) => {
          if (!piece || typeof piece !== "object") return piece;
          const runId = String(piece.takeoffRunId || piece.runId || piece.id || "").trim();
          const name = String(piece.name || piece.label || "")
            .trim()
            .toLowerCase();
          let override = null;
          if (runId && fromTakeoff.has(`id:${runId}`)) override = fromTakeoff.get(`id:${runId}`);
          else if (name && fromTakeoff.has(`name:${name}`)) override = fromTakeoff.get(`name:${name}`);
          return stampStudioOpeningsOntoPiece(piece, override);
        })
      : [];
    return { ...room, pieces };
  });
}

/**
 * Stamp Studio openings on every piece from cutouts[] / existing fields (no takeoff).
 * @param {unknown} rooms
 */
export function stampStudioOpeningsOnOfficialRooms(rooms) {
  if (!Array.isArray(rooms)) return [];
  return rooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const pieces = Array.isArray(room.pieces)
      ? room.pieces.map((p) => stampStudioOpeningsOntoPiece(p))
      : [];
    return { ...room, pieces };
  });
}
