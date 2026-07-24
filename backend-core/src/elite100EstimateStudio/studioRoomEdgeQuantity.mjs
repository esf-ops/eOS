/**
 * Room-scoped approved eligible finished/open edge LF for Digital Estimate.
 *
 * Never allocate or copy project-wide finalLf onto a single room.
 * Never invent LF from perimeter / SF / even splits.
 */

import { sumFinishedEdgeLengthIn } from "../takeoff/takeoffPieceGeometryAuthority.mjs";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function isIncludedCounterPiece(piece) {
  if (!piece || typeof piece !== "object") return false;
  if (piece.included === false || piece.includedInTakeoff === false) return false;
  const pt = String(piece.pieceType ?? piece.type ?? "counter").toLowerCase();
  return !pt.includes("backsplash") && pt !== "splash" && pt !== "fhb";
}

function pieceFinishedEdgeApproved(piece) {
  const fe = piece?.finishedEdge || piece?.finished_edge;
  if (!fe || typeof fe !== "object") return false;
  return fe.approved === true || fe.finishedEdgeConfirmed === true;
}

/**
 * @typedef {{
 *   lf: number|null,
 *   authoritative: boolean,
 *   source: string|null,
 *   missingReason: string|null
 * }} RoomEdgeQuantity
 */

/**
 * Resolve approved eligible finished-edge LF for one Studio / publication room.
 *
 * Authority order:
 *  1. Sum of approved finished-edge records on included counter pieces
 *  2. Room-level persisted approved / eligible LF fields (already room-scoped)
 *  3. Publication envelope room.edgeLinearFeet only when edgeQuantityAuthoritative
 *
 * Returns authoritative:false with lf:null when room-level quantity cannot be
 * established — callers must NOT substitute project finalLf.
 *
 * @param {object|null|undefined} room
 * @returns {RoomEdgeQuantity}
 */
export function resolveRoomApprovedEligibleEdgeLf(room) {
  if (!room || typeof room !== "object") {
    return {
      lf: null,
      authoritative: false,
      source: null,
      missingReason: "missing_room"
    };
  }

  if (room.included === false) {
    return {
      lf: 0,
      authoritative: true,
      source: "excluded_room",
      missingReason: null
    };
  }

  const pieces = Array.isArray(room.pieces) ? room.pieces : [];
  const counterPieces = pieces.filter(isIncludedCounterPiece);
  const piecesWithFinishedEdge = counterPieces.filter(
    (p) => p.finishedEdge || p.finished_edge
  );

  if (piecesWithFinishedEdge.length > 0) {
    const anyUnapproved = piecesWithFinishedEdge.some((p) => !pieceFinishedEdgeApproved(p));
    if (anyUnapproved) {
      return {
        lf: null,
        authoritative: false,
        source: null,
        missingReason: "unapproved_piece_finished_edge"
      };
    }
    // Also block when some included counters lack finished-edge while siblings have it
    // (incomplete room authority — never silently under-sum).
    if (piecesWithFinishedEdge.length !== counterPieces.length) {
      return {
        lf: null,
        authoritative: false,
        source: null,
        missingReason: "incomplete_piece_finished_edge"
      };
    }
    const approved = sumFinishedEdgeLengthIn(counterPieces, { requireApproved: true });
    return {
      lf: round2(Number(approved.totalFinishedEdgeLf) || 0),
      authoritative: true,
      source: "approved_piece_finished_edge",
      missingReason: null
    };
  }

  // Room-level persisted fields (must already be room-scoped — never project).
  const roomLevelCandidates = [
    ["room_approvedFinishedEdgeLf", room.approvedFinishedEdgeLf],
    ["room_edgeEligibleLinearFeet", room.edgeEligibleLinearFeet],
    ["room_derivedOpenEdgeLf", room.derivedOpenEdgeLf],
    ["room_edgeFinalLf", room.edgeFinalLf]
  ];
  for (const [source, raw] of roomLevelCandidates) {
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    return {
      lf: round2(n),
      authoritative: true,
      source,
      missingReason: null
    };
  }

  // Publication envelope reload: trust frozen room LF only when marked authoritative.
  if (room.edgeQuantityAuthoritative === true) {
    const n = Number(room.edgeLinearFeet ?? room.edgeFinalLf);
    if (Number.isFinite(n) && n >= 0) {
      return {
        lf: round2(n),
        authoritative: true,
        source: "publication_envelope_room_lf",
        missingReason: null
      };
    }
  }

  return {
    lf: null,
    authoritative: false,
    source: null,
    missingReason: "missing_room_edge_lf"
  };
}

/**
 * @param {object|null|undefined} room
 * @returns {number}
 */
export function roomEdgeLfOrZero(room) {
  const q = resolveRoomApprovedEligibleEdgeLf(room);
  if (!q.authoritative || q.lf == null) return 0;
  return q.lf;
}
