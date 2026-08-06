/**
 * Open / exposed edge linear feet helpers for Quote Flow official scope.
 * Canonical write field: piece.openEdgeLf (LF). Compatibility aliases synced on stamp.
 */

import { resolvePieceOpeningCounts } from "./quoteFlowCutouts.mjs";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Resolve open/exposed edge LF from common piece field aliases.
 * Positive LF aliases win; otherwise fall through to finishedEdge inches.
 * Explicit 0 does not hide richer finishedEdge inch data (seed often wrote 0).
 * Blank / missing / non-finite → 0 (never NaN).
 * @param {object|null|undefined} piece
 */
export function resolvePieceOpenEdgeLf(piece) {
  if (!piece || typeof piece !== "object") return 0;
  const candidates = [
    piece.openEdgeLf,
    piece.exposedEdgeLf,
    piece.exposedEdgeLinearFeet,
    piece.openEdgeLinearFeet,
    piece.edgeLinearFeet,
    piece.edgeLf,
    piece.finishedEdgeLf
  ];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return round2(n);
  }
  const fe = piece.finishedEdge;
  if (fe && typeof fe === "object") {
    const totalIn = Number(fe.totalFinishedEdgeLengthIn);
    if (Number.isFinite(totalIn) && totalIn > 0) return round2(totalIn / 12);
    const lfAlias = Number(fe.totalFinishedEdgeLengthLf ?? fe.linearFeet ?? fe.total);
    if (Number.isFinite(lfAlias) && lfAlias > 0) return round2(lfAlias);
  }
  // Truly blank / explicit zeros with no finishedEdge inches → 0
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return 0;
  }
  return 0;
}

/**
 * Stamp canonical openEdgeLf (+ compatibility aliases) onto a piece.
 * Does not remove existing legacy fields.
 *
 * When `opts.confirmOfficial` is true (Quote Flow official scope / publish),
 * also write Studio-compatible finishedEdge approval flags so Digital Estimate
 * publication freezes room.edgeLinearFeet the same way as working Studio DE.
 * Takeoff draft stamping must leave confirmOfficial false.
 *
 * @param {object} piece
 * @param {number} [explicitLf] when provided, use this LF instead of resolving
 * @param {{ confirmOfficial?: boolean }} [opts]
 */
export function stampPieceOpenEdgeLf(piece, explicitLf = undefined, opts = {}) {
  if (!piece || typeof piece !== "object") return piece;
  const value =
    explicitLf != null && Number.isFinite(Number(explicitLf)) && Number(explicitLf) >= 0
      ? round2(Number(explicitLf))
      : resolvePieceOpenEdgeLf(piece);
  const inches = round2(value * 12);
  const fe =
    piece.finishedEdge && typeof piece.finishedEdge === "object" ? { ...piece.finishedEdge } : {};
  const totalIn =
    Number.isFinite(Number(fe.totalFinishedEdgeLengthIn)) && Number(fe.totalFinishedEdgeLengthIn) > 0
      ? Number(fe.totalFinishedEdgeLengthIn)
      : inches;
  const frontIn =
    Number.isFinite(Number(fe.frontEdgeLengthIn)) && Number(fe.frontEdgeLengthIn) > 0
      ? Number(fe.frontEdgeLengthIn)
      : totalIn;
  /** @type {Record<string, unknown>} */
  const finishedEdge = {
    ...fe,
    totalFinishedEdgeLengthIn: totalIn,
    frontEdgeLengthIn: frontIn
  };
  if (opts.confirmOfficial === true) {
    // Match working Studio DE publication authority (pieceFinishedEdgeApproved).
    finishedEdge.approved = true;
    finishedEdge.finishedEdgeConfirmed = true;
    finishedEdge.source = fe.source || "estimator_confirmed";
  }
  return {
    ...piece,
    openEdgeLf: value,
    finishedEdgeLf: value,
    exposedEdgeLf: value,
    finishedEdge
  };
}

/**
 * Stamp openEdgeLf on every piece in official scope rooms, with Studio DE
 * finishedEdge approval flags so publication freezes edgeLinearFeet correctly.
 * @param {unknown} rooms
 */
export function stampOpenEdgeLfOnOfficialRooms(rooms) {
  if (!Array.isArray(rooms)) return [];
  return rooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const pieces = Array.isArray(room.pieces)
      ? room.pieces.map((p) => stampPieceOpenEdgeLf(p, undefined, { confirmOfficial: true }))
      : [];
    return { ...room, pieces };
  });
}

/**
 * Aggregate piece-level openings into scope.addOns (same contract as Studio V2
 * scope editor). Quote Flow often prices cutouts from piece openings while
 * leaving addOns empty — DE publish freezes and envelope baseline flags need
 * qty-sink / qty-bar / qty-cook / qty-outlet on scope.addOns.
 *
 * Accepts Studio V2 fields (`kitchenSinkCutouts`) and takeoff `piece.cutouts[]`.
 *
 * @param {object|null|undefined} scope
 * @returns {object}
 */
export function syncPieceOpeningsIntoOfficialScopeAddOns(scope) {
  if (!scope || typeof scope !== "object") return scope || {};
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  let kitchenSink = 0;
  let vanityBar = 0;
  let cooktop = 0;
  let outlet = 0;
  let hasPieceOpenings = false;
  for (const room of rooms) {
    if (!room || room.included === false) continue;
    for (const p of Array.isArray(room.pieces) ? room.pieces : []) {
      if (!p || p.included === false || p.excluded === true) continue;
      const counts = resolvePieceOpeningCounts(p);
      if (!counts.hasExplicit) continue;
      hasPieceOpenings = true;
      kitchenSink += counts.kitchenSinkCutouts;
      vanityBar += counts.vanityBarSinkCutouts;
      cooktop += counts.cooktopCutouts;
      outlet += counts.outletCutouts;
    }
  }
  if (!hasPieceOpenings) return scope;
  const existing =
    scope.addOns && typeof scope.addOns === "object" ? { ...scope.addOns } : {};
  return {
    ...scope,
    addOns: {
      ...existing,
      "qty-sink": kitchenSink,
      "qty-bar": vanityBar,
      "qty-cook": cooktop,
      "qty-outlet": outlet
    }
  };
}

/**
 * Normalize official scope for Digital Estimate publish / freeze preview.
 * Maps Quote Flow openEdgeLf into the finishedEdge shape the working DE path uses,
 * and syncs piece openings into addOns for cutout freeze / baseline parity.
 * @param {object|null|undefined} scope
 */
export function normalizeQuoteFlowScopeForDigitalEstimatePublish(scope) {
  if (!scope || typeof scope !== "object") return scope || {};
  const withOpenings = syncPieceOpeningsIntoOfficialScopeAddOns(scope);
  return {
    ...withOpenings,
    rooms: stampOpenEdgeLfOnOfficialRooms(withOpenings.rooms)
  };
}

/**
 * Collect piece-level open edge LF from a reviewed takeoffResult (rooms→areas→runs).
 * Keys: run id and lowercase label.
 * @param {object|null|undefined} takeoffResult
 * @returns {Map<string, number>}
 */
export function collectOpenEdgeLfFromTakeoffResult(takeoffResult) {
  /** @type {Map<string, number>} */
  const map = new Map();
  if (!takeoffResult || typeof takeoffResult !== "object") return map;
  for (const room of Array.isArray(takeoffResult.rooms) ? takeoffResult.rooms : []) {
    for (const area of Array.isArray(room?.areas) ? room.areas : []) {
      for (const run of Array.isArray(area?.runs) ? area.runs : []) {
        if (!run || run.included === false) continue;
        const lf = resolvePieceOpenEdgeLf(run);
        if (!(lf > 0) && !(Number(run.openEdgeLf) >= 0)) {
          // Still record explicit 0 when openEdgeLf was set.
          if (run.openEdgeLf == null && run.finishedEdge == null && run.finishedEdgeLf == null) {
            continue;
          }
        }
        const value = resolvePieceOpenEdgeLf(run);
        const runId = String(run.id || "").trim();
        const label = String(run.label || run.name || "")
          .trim()
          .toLowerCase();
        if (runId) map.set(`id:${runId}`, value);
        if (label) map.set(`name:${label}`, value);
      }
    }
  }
  return map;
}

/**
 * Prefer reviewed takeoffResult open-edge values; otherwise stamp from piece aliases.
 * Matches official pieces by takeoffRunId / id / name.
 * @param {unknown} rooms
 * @param {object|null|undefined} takeoffResult
 */
export function applyTakeoffOpenEdgeLfToOfficialRooms(rooms, takeoffResult = null) {
  const fromTakeoff = collectOpenEdgeLfFromTakeoffResult(takeoffResult);
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
          let explicit;
          if (runId && fromTakeoff.has(`id:${runId}`)) explicit = fromTakeoff.get(`id:${runId}`);
          else if (name && fromTakeoff.has(`name:${name}`)) explicit = fromTakeoff.get(`name:${name}`);
          return stampPieceOpenEdgeLf(piece, explicit, { confirmOfficial: true });
        })
      : [];
    return { ...room, pieces };
  });
}

/**
 * Ensure each takeoff run carries canonical openEdgeLf for Set Scope postMessage.
 * Preserves existing finishedEdge / aliases.
 * @param {object|null|undefined} takeoffResult
 */
export function stampOpenEdgeLfOnTakeoffResult(takeoffResult) {
  if (!takeoffResult || typeof takeoffResult !== "object") return takeoffResult;
  const rooms = Array.isArray(takeoffResult.rooms) ? takeoffResult.rooms : [];
  return {
    ...takeoffResult,
    rooms: rooms.map((room) => {
      if (!room || typeof room !== "object") return room;
      const areas = Array.isArray(room.areas) ? room.areas : [];
      return {
        ...room,
        areas: areas.map((area) => {
          if (!area || typeof area !== "object") return area;
          const runs = Array.isArray(area.runs) ? area.runs : [];
          return {
            ...area,
            runs: runs.map((run) => {
              if (!run || typeof run !== "object") return run;
              return stampPieceOpenEdgeLf(run);
            })
          };
        })
      };
    })
  };
}
