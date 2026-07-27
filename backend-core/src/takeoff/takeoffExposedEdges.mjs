/**
 * Physical exposed-edge model for AI Takeoff (four sides + topology presets).
 *
 * Authority: AI Takeoff owns which sides are physically exposed and physical LF.
 * Pricing Setup owns commercial edge profile / price — never set here.
 *
 * Storage: additive JSON on finishedEdge / run flags (no SQL).
 * Legacy: otherExposedEdgeLengthIn === back side length.
 */

export const EXPOSED_SIDES = Object.freeze(["front", "back", "left", "right"]);

export const PIECE_TOPOLOGIES = Object.freeze({
  WALL_RUN: "wall_run",
  ISLAND: "island",
  PENINSULA: "peninsula",
  VANITY: "vanity",
  CUSTOM: "custom"
});

/**
 * @typedef {{ front: boolean, back: boolean, left: boolean, right: boolean }} ExposedSides
 */

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * @param {unknown} value
 * @returns {ExposedSides}
 */
export function normalizeExposedSides(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    front: v.front === true,
    back: v.back === true,
    left: v.left === true,
    right: v.right === true
  };
}

/**
 * Map legacy finishedEdge / run flags → four-side model (back defaults false).
 * @param {object|null|undefined} pieceOrEdge
 * @returns {ExposedSides}
 */
export function mapLegacyExposedSides(pieceOrEdge) {
  const p = pieceOrEdge && typeof pieceOrEdge === "object" ? pieceOrEdge : {};
  const fe = p.finishedEdge && typeof p.finishedEdge === "object" ? p.finishedEdge : p;
  if (fe.exposedSides && typeof fe.exposedSides === "object") {
    return normalizeExposedSides(fe.exposedSides);
  }
  const hasAnyLength =
    Number(fe.frontEdgeLengthIn) > 0 ||
    Number(fe.leftExposedEdgeLengthIn) > 0 ||
    Number(fe.rightExposedEdgeLengthIn) > 0 ||
    Number(fe.otherExposedEdgeLengthIn) > 0 ||
    Number(fe.backExposedEdgeLengthIn) > 0 ||
    Number(fe.totalFinishedEdgeLengthIn) > 0;
  const front =
    p.frontExposed === true ||
    fe.frontExposed === true ||
    Number(fe.frontEdgeLengthIn) > 0;
  const left =
    p.leftExposed === true ||
    fe.leftExposed === true ||
    Number(fe.leftExposedEdgeLengthIn) > 0;
  const right =
    p.rightExposed === true ||
    fe.rightExposed === true ||
    Number(fe.rightExposedEdgeLengthIn) > 0;
  const back =
    p.backExposed === true ||
    fe.backExposed === true ||
    Number(fe.otherExposedEdgeLengthIn) > 0 ||
    Number(fe.backExposedEdgeLengthIn) > 0;
  if (!hasAnyLength && p.frontExposed == null && p.leftExposed == null && p.rightExposed == null) {
    // Legacy wall-run default when no side data exists yet.
    return { front: true, back: false, left: false, right: false };
  }
  return {
    front: Boolean(front),
    back: Boolean(back),
    left: Boolean(left),
    right: Boolean(right)
  };
}

/**
 * Suggest topology from piece name / area type (suggestion only — not approved).
 * @param {{ label?: string|null, name?: string|null, areaType?: string|null, pieceName?: string|null }} piece
 */
export function suggestPieceTopology(piece = {}) {
  const label = String(piece.label || piece.name || piece.pieceName || "").toLowerCase();
  const areaType = String(piece.areaType || "").toLowerCase();
  if (areaType === "island" || /\bisland\b/.test(label)) return PIECE_TOPOLOGIES.ISLAND;
  if (areaType === "peninsula" || /\bpeninsula\b/.test(label)) return PIECE_TOPOLOGIES.PENINSULA;
  if (areaType === "vanity" || /\bvanity\b/.test(label)) return PIECE_TOPOLOGIES.VANITY;
  if (
    areaType === "wall" ||
    /\bwall\b/.test(label) ||
    /\bcabinet\b/.test(label) ||
    /\bsink wall\b/.test(label) ||
    /\brange wall\b/.test(label)
  ) {
    return PIECE_TOPOLOGIES.WALL_RUN;
  }
  return PIECE_TOPOLOGIES.CUSTOM;
}

/**
 * Default exposed sides for a topology (estimator may override).
 * @param {string} topology
 * @param {{ attachedSide?: string|null }} [opts]
 * @returns {ExposedSides}
 */
export function defaultExposedSidesForTopology(topology, opts = {}) {
  const t = String(topology || PIECE_TOPOLOGIES.CUSTOM);
  if (t === PIECE_TOPOLOGIES.ISLAND) {
    return { front: true, back: true, left: true, right: true };
  }
  if (t === PIECE_TOPOLOGIES.WALL_RUN) {
    return { front: true, back: false, left: false, right: false };
  }
  if (t === PIECE_TOPOLOGIES.VANITY) {
    return { front: true, back: false, left: false, right: false };
  }
  if (t === PIECE_TOPOLOGIES.PENINSULA) {
    const attached = String(opts.attachedSide || "").toLowerCase();
    if (!EXPOSED_SIDES.includes(attached)) {
      return { front: false, back: false, left: false, right: false };
    }
    return {
      front: attached !== "front",
      back: attached !== "back",
      left: attached !== "left",
      right: attached !== "right"
    };
  }
  return { front: false, back: false, left: false, right: false };
}

/**
 * Per-unit side lengths in inches from dimensions + exposed flags.
 * front/back → lengthIn; left/right → depthIn.
 *
 * @param {{ lengthIn?: number, depthIn?: number }} dims
 * @param {ExposedSides} sides
 */
export function sideLengthsInches(dims, sides) {
  const lengthIn = Math.max(0, Number(dims?.lengthIn) || 0);
  const depthIn = Math.max(0, Number(dims?.depthIn) || 0);
  const s = normalizeExposedSides(sides);
  return {
    frontEdgeLengthIn: s.front ? lengthIn : 0,
    otherExposedEdgeLengthIn: s.back ? lengthIn : 0,
    backExposedEdgeLengthIn: s.back ? lengthIn : 0,
    leftExposedEdgeLengthIn: s.left ? depthIn : 0,
    rightExposedEdgeLengthIn: s.right ? depthIn : 0
  };
}

/**
 * Physical exposed-edge inches for one piece (sides × quantity).
 * @param {{ lengthIn?: number, depthIn?: number, quantity?: number }} dims
 * @param {ExposedSides} sides
 */
export function calculateExposedEdgeInches(dims, sides) {
  const lengths = sideLengthsInches(dims, sides);
  const perUnit = round2(
    lengths.frontEdgeLengthIn +
      lengths.otherExposedEdgeLengthIn +
      lengths.leftExposedEdgeLengthIn +
      lengths.rightExposedEdgeLengthIn
  );
  const qty = Math.max(1, Number(dims?.quantity) || 1);
  return {
    ...lengths,
    perUnitInches: perUnit,
    quantity: qty,
    totalInches: round2(perUnit * qty),
    totalLf: round2((perUnit * qty) / 12),
    exposedSides: normalizeExposedSides(sides)
  };
}

/**
 * @param {ExposedSides} sides
 * @param {number} totalLf
 */
export function formatExposedSidesSummary(sides, totalLf) {
  const s = normalizeExposedSides(sides);
  const labels = [];
  if (s.front) labels.push("front");
  if (s.back) labels.push("back");
  if (s.left) labels.push("left");
  if (s.right) labels.push("right");
  const lf = Number.isFinite(Number(totalLf)) ? Number(totalLf).toFixed(2) : "0.00";
  if (labels.length === 0) return `No sides selected · ${lf} LF`;
  if (labels.length === 4) return `All four sides · ${lf} LF`;
  const pretty = labels.map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  if (pretty.length === 1) return `${pretty[0]} · ${lf} LF`;
  if (pretty.length === 2) return `${pretty[0]} + ${pretty[1]} · ${lf} LF`;
  return `${pretty.slice(0, -1).join(" + ")} + ${pretty[pretty.length - 1]} · ${lf} LF`;
}

/**
 * Build finishedEdge patch payload for patchRunFinishedEdge / persistence.
 * @param {{
 *   lengthIn: number,
 *   depthIn: number,
 *   quantity?: number,
 *   exposedSides: ExposedSides,
 *   topology?: string,
 *   attachedSide?: string|null,
 *   confirm?: boolean
 * }} input
 */
export function buildFinishedEdgeFromExposedSides(input) {
  const calc = calculateExposedEdgeInches(
    {
      lengthIn: input.lengthIn,
      depthIn: input.depthIn,
      quantity: input.quantity
    },
    input.exposedSides
  );
  const confirm = input.confirm !== false;
  const topology = String(input.topology || PIECE_TOPOLOGIES.CUSTOM);
  const attachedSide =
    topology === PIECE_TOPOLOGIES.PENINSULA &&
    EXPOSED_SIDES.includes(String(input.attachedSide || "").toLowerCase())
      ? String(input.attachedSide).toLowerCase()
      : null;
  return {
    frontEdgeLengthIn: calc.frontEdgeLengthIn,
    leftExposedEdgeLengthIn: calc.leftExposedEdgeLengthIn,
    rightExposedEdgeLengthIn: calc.rightExposedEdgeLengthIn,
    otherExposedEdgeLengthIn: calc.otherExposedEdgeLengthIn,
    backExposedEdgeLengthIn: calc.otherExposedEdgeLengthIn,
    totalFinishedEdgeLengthIn: calc.totalInches,
    perUnitFinishedEdgeLengthIn: calc.perUnitInches,
    quantityApplied: calc.quantity,
    exposedSides: calc.exposedSides,
    pieceTopology: topology,
    attachedSide,
    finishedEdgeConfirmed: confirm,
    approved: confirm,
    source: confirm ? "estimator_confirmed" : "draft_suggestion",
    approvalSource: confirm ? "estimator_confirmed" : null,
    adjustmentIn: 0,
    adjustmentReason: null
  };
}

/**
 * True when island/peninsula likely needs review (missing back / incomplete ends).
 * @param {{ label?: string, name?: string, areaType?: string, finishedEdge?: object, leftExposed?: boolean, rightExposed?: boolean, backExposed?: boolean }} piece
 */
export function needsExposedEdgeReview(piece) {
  const topology = suggestPieceTopology(piece);
  const sides = mapLegacyExposedSides(piece);
  if (topology === PIECE_TOPOLOGIES.ISLAND) {
    return !(sides.front && sides.back && sides.left && sides.right);
  }
  if (topology === PIECE_TOPOLOGIES.PENINSULA) {
    const count = [sides.front, sides.back, sides.left, sides.right].filter(Boolean).length;
    return count < 3;
  }
  return false;
}

export const _exposedEdgeTestHelpers = {
  round2,
  EXPOSED_SIDES,
  PIECE_TOPOLOGIES
};
