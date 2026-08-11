/**
 * Quote Flow / Takeoff — vanity top depth overhang normalization.
 *
 * AI / cabinet reads often land near 21.5". Quoted vanity tops should use 22.5"
 * unless staff already overrode depth. Does not change kitchen / pantry / island.
 */

export const VANITY_QUOTED_DEPTH_IN = 22.5;
export const VANITY_CABINET_DEPTH_MIN_IN = 21.0;
export const VANITY_CABINET_DEPTH_MAX_IN = 21.75;

const VANITY_ROOM_RE = /\b(bath(?:room)?|vanity|powder|lav(?:atory)?|half[\s-]?bath)\b/i;
const VANITY_PIECE_RE = /\b(vanity(?:\s*top)?|bath(?:room)?\s*vanity|lav(?:atory)?\s*top)\b/i;
const NON_VANITY_RE =
  /\b(kitchen|pantry|island|sink\s*run|stove|cooktop|desk|bar\s*top|laundry(?!\s*vanity))\b/i;

/**
 * @param {object|null|undefined} piece
 * @param {{ roomName?: string|null, roomType?: string|null, planFilename?: string|null }} [ctx]
 */
export function isVanityPieceForDepthNormalization(piece, ctx = {}) {
  if (!piece || typeof piece !== "object") return false;
  if (piece.excluded === true || piece.included === false) return false;

  const pieceType = String(piece.pieceType || piece.type || "").toLowerCase();
  const pieceName = String(piece.name || piece.label || "");
  const roomName = String(ctx.roomName || piece.roomName || piece.areaLabel || "");
  const roomType = String(ctx.roomType || piece.roomType || piece.areaType || "");
  const planFilename = String(ctx.planFilename || piece.planFilename || "");

  if (NON_VANITY_RE.test(pieceName) && !VANITY_PIECE_RE.test(pieceName)) return false;
  if (NON_VANITY_RE.test(roomName) && !VANITY_ROOM_RE.test(roomName) && !VANITY_PIECE_RE.test(pieceName)) {
    return false;
  }

  if (pieceType.includes("vanity")) return true;
  if (VANITY_PIECE_RE.test(pieceName)) return true;
  if (VANITY_ROOM_RE.test(roomType) || VANITY_ROOM_RE.test(roomName)) {
    // Room is bath-like: treat counter pieces as vanity tops unless clearly kitchen.
    if (!NON_VANITY_RE.test(pieceName)) return true;
  }
  if (/bath(?:room)?\s*countertops?/i.test(planFilename) && !NON_VANITY_RE.test(pieceName)) {
    return true;
  }
  return false;
}

/**
 * @param {object} piece
 */
export function pieceDepthIsStaffOwned(piece) {
  if (!piece || typeof piece !== "object") return false;
  if (piece.depthStaffEdited === true) return true;
  if (piece.staffEditedDepth === true) return true;
  const src = String(piece.depthSource || piece.depthNormalizedBy || "").toLowerCase();
  if (src === "staff" || src === "estimator_confirmed" || src === "manual") return true;
  if (piece.depthLocked === true) return true;
  return false;
}

/**
 * Normalize vanity cabinet-depth reads to quoted top depth (22.5").
 * @param {object} piece
 * @param {{ roomName?: string|null, roomType?: string|null, planFilename?: string|null }} [ctx]
 * @returns {object} piece (same ref mutated + returned, or clone fields)
 */
export function normalizeVanityQuotedDepth(piece, ctx = {}) {
  if (!piece || typeof piece !== "object") return piece;
  if (pieceDepthIsStaffOwned(piece)) return piece;
  if (!isVanityPieceForDepthNormalization(piece, ctx)) return piece;

  const raw = Number(piece.depthIn);
  if (!Number.isFinite(raw) || raw <= 0) return piece;

  // Already at quoted overhang depth (±0.2).
  if (Math.abs(raw - VANITY_QUOTED_DEPTH_IN) <= 0.2) {
    return piece;
  }

  if (raw < VANITY_CABINET_DEPTH_MIN_IN || raw > VANITY_CABINET_DEPTH_MAX_IN) {
    return piece;
  }

  const next = {
    ...piece,
    rawAiDepthIn: Number.isFinite(Number(piece.rawAiDepthIn)) ? Number(piece.rawAiDepthIn) : raw,
    depthIn: VANITY_QUOTED_DEPTH_IN,
    normalizedBy: "vanity_overhang_default",
    depthSource: "vanity_overhang_default",
    normalizationNote: `AI read ${raw} in; quoted vanity depth set to ${VANITY_QUOTED_DEPTH_IN} in for overhang.`,
    vanityDepthNormalization: {
      rawAiDepthIn: raw,
      quotedDepthIn: VANITY_QUOTED_DEPTH_IN,
      reason: "vanity_overhang_default"
    }
  };
  // Recompute sqft when length present and prior sqft looked dimension-derived.
  const lengthIn = Number(next.lengthIn);
  const qty = Math.max(1, Math.floor(Number(next.quantity) || 1));
  if (Number.isFinite(lengthIn) && lengthIn > 0) {
    next.sqft = Math.round(((lengthIn * VANITY_QUOTED_DEPTH_IN * qty) / 144) * 100) / 100;
  }
  return next;
}

/**
 * Walk takeoff-shaped rooms (areas/runs or pieces) and normalize vanity depths.
 * @param {unknown} rooms
 * @param {{ planFilename?: string|null }} [opts]
 */
export function normalizeVanityDepthsInRooms(rooms, opts = {}) {
  if (!Array.isArray(rooms)) return [];
  return rooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const roomCtx = {
      roomName: room.name || room.label || null,
      roomType: room.roomType || room.type || null,
      planFilename: opts.planFilename || null
    };

    let next = { ...room };

    if (Array.isArray(room.pieces)) {
      next.pieces = room.pieces.map((p) => normalizeVanityQuotedDepth(p, roomCtx));
    }

    if (Array.isArray(room.areas)) {
      next.areas = room.areas.map((area) => {
        if (!area || typeof area !== "object") return area;
        const areaCtx = {
          ...roomCtx,
          roomName: area.label || area.name || roomCtx.roomName
        };
        const runs = Array.isArray(area.runs)
          ? area.runs.map((run) => normalizeVanityQuotedDepth(run, areaCtx))
          : area.runs;
        return { ...area, runs };
      });
    }

    return next;
  });
}
