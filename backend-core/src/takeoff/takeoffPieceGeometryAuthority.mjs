/**
 * Takeoff / Studio piece geometry authority — backsplash vs finished edge.
 *
 * These are independent contracts. Finished-edge LF must NEVER be derived by
 * subtracting backsplash-eligible length from total run length
 * (`derived_open_edge_v1` — retired for new approvals).
 *
 * Storage: additive JSON on TakeoffRun / import payload pieces / Studio scope
 * pieces (no SQL migration).
 */

export const EDGE_GEOMETRY_SOURCES = Object.freeze({
  /** Retired production formula: totalRun − backsplashEligible. */
  DERIVED_OPEN_EDGE_V1: "derived_open_edge_v1",
  /** Sum of estimator-approved per-piece finished-edge sections. */
  FINISHED_EDGE_V2: "finished_edge_v2",
  /** Draft suggestions present; estimator confirmation required before publish. */
  FINISHED_EDGE_CONFIRMATION_REQUIRED: "finished_edge_geometry_required",
  MANUAL: "manual"
});

export const BACKSPLASH_EDGES = Object.freeze(["back", "left", "right", "custom"]);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function inchesToLf(inches) {
  return round2(Math.max(0, Number(inches) || 0) / 12);
}

/**
 * @param {unknown} piece
 * @returns {boolean}
 */
export function isCounterPiece(piece) {
  if (!piece || typeof piece !== "object") return false;
  if (piece.included === false || piece.includedInTakeoff === false) return false;
  const pt = String(piece.pieceType ?? piece.type ?? "counter").toLowerCase();
  return !pt.includes("backsplash") && pt !== "splash" && pt !== "fhb";
}

/**
 * Draft finished-edge suggestion from piece dimensions + exposure flags.
 * Names (Wall/Peninsula/Island) may inform draft only — never production pricing.
 *
 * @param {{
 *   lengthIn?: number,
 *   depthIn?: number,
 *   sideSplashLeftEligible?: boolean,
 *   sideSplashRightEligible?: boolean,
 *   leftExposed?: boolean,
 *   rightExposed?: boolean,
 *   backExposed?: boolean,
 *   frontExposed?: boolean,
 *   areaType?: string|null,
 *   label?: string|null
 * }} piece
 */
export function draftFinishedEdgeGeometry(piece) {
  const lengthIn = Math.max(0, Number(piece?.lengthIn) || 0);
  const depthIn = Math.max(0, Number(piece?.depthIn) || 0);
  const areaType = String(piece?.areaType || "").toLowerCase();
  const label = String(piece?.label || piece?.name || "").toLowerCase();
  const looksIsland = areaType === "island" || /\bisland\b/.test(label);
  const looksPeninsula = areaType === "peninsula" || /\bpeninsula\b/.test(label);

  const frontExposed = piece?.frontExposed !== false;
  const frontEdgeLengthIn = frontExposed ? lengthIn : 0;

  // Default: wall runs do not price the back as finished edge.
  let backExposed = piece?.backExposed === true;
  if (looksIsland) backExposed = piece?.backExposed !== false;
  if (looksPeninsula && piece?.backExposed == null) backExposed = false;
  const otherExposedEdgeLengthIn = backExposed ? lengthIn : 0;

  const leftExplicit =
    piece?.leftExposed != null
      ? Boolean(piece.leftExposed)
      : piece?.sideSplashLeftEligible === true
        ? false // side-splash-eligible end typically meets wall/cabinet
        : looksIsland || looksPeninsula
          ? true
          : false;
  const rightExplicit =
    piece?.rightExposed != null
      ? Boolean(piece.rightExposed)
      : piece?.sideSplashRightEligible === true
        ? false
        : looksIsland || looksPeninsula
          ? true
          : false;

  const leftExposedEdgeLengthIn = leftExplicit ? depthIn : 0;
  const rightExposedEdgeLengthIn = rightExplicit ? depthIn : 0;

  const totalFinishedEdgeLengthIn = round2(
    frontEdgeLengthIn +
      leftExposedEdgeLengthIn +
      rightExposedEdgeLengthIn +
      otherExposedEdgeLengthIn
  );

  return {
    frontEdgeLengthIn: round2(frontEdgeLengthIn),
    leftExposedEdgeLengthIn: round2(leftExposedEdgeLengthIn),
    rightExposedEdgeLengthIn: round2(rightExposedEdgeLengthIn),
    otherExposedEdgeLengthIn: round2(otherExposedEdgeLengthIn),
    totalFinishedEdgeLengthIn,
    frontExposed,
    leftExposed: leftExplicit,
    rightExposed: rightExplicit,
    backExposed,
    approved: false,
    source: "draft_suggestion",
    adjustmentIn: 0,
    adjustmentReason: null,
    approvalSource: null
  };
}

/**
 * Normalize estimator-approved or draft finished-edge geometry on a piece.
 * @param {object|null|undefined} piece
 * @param {{ preferDraft?: boolean }} [opts]
 */
export function resolvePieceFinishedEdgeGeometry(piece, opts = {}) {
  const raw = piece?.finishedEdge || piece?.finished_edge || null;
  if (raw && typeof raw === "object") {
    const front = Math.max(0, Number(raw.frontEdgeLengthIn ?? raw.front_edge_length_in) || 0);
    const left = Math.max(0, Number(raw.leftExposedEdgeLengthIn ?? raw.left_exposed_edge_length_in) || 0);
    const right = Math.max(
      0,
      Number(raw.rightExposedEdgeLengthIn ?? raw.right_exposed_edge_length_in) || 0
    );
    const other = Math.max(
      0,
      Number(raw.otherExposedEdgeLengthIn ?? raw.other_exposed_edge_length_in) || 0
    );
    let total = round2(front + left + right + other);
    const adj = Number(raw.adjustmentIn ?? raw.adjustment_in) || 0;
    if (adj !== 0) {
      if (!String(raw.adjustmentReason || raw.adjustment_reason || "").trim()) {
        const err = new Error("Finished-edge adjustment requires a reason");
        err.code = "finished_edge_adjustment_reason_required";
        throw err;
      }
      total = Math.max(0, round2(total + adj));
    }
    const source = String(raw.source || "estimator_confirmed");
    const approved =
      raw.finishedEdgeConfirmed === true ||
      raw.approved === true ||
      source === "estimator_confirmed" ||
      source === "manual" ||
      source === "previously_saved_manual";
    return {
      frontEdgeLengthIn: round2(front),
      leftExposedEdgeLengthIn: round2(left),
      rightExposedEdgeLengthIn: round2(right),
      otherExposedEdgeLengthIn: round2(other),
      totalFinishedEdgeLengthIn: total,
      frontExposed: front > 0,
      leftExposed: left > 0,
      rightExposed: right > 0,
      backExposed: other > 0,
      finishedEdgeConfirmed: approved,
      approved,
      source,
      adjustmentIn: adj,
      adjustmentReason: raw.adjustmentReason || raw.adjustment_reason || null,
      approvalSource: raw.approvalSource || raw.approval_source || source,
      approvedAt: raw.approvedAt || raw.approved_at || null
    };
  }
  if (opts.preferDraft !== false && isCounterPiece(piece)) {
    return draftFinishedEdgeGeometry(piece);
  }
  return null;
}

/**
 * Normalize backsplash geometry for one piece/run.
 * @param {object|null|undefined} piece
 * @param {{ eligible?: boolean }} [hints]
 */
export function resolvePieceBacksplashGeometry(piece, hints = {}) {
  const lengthIn = Math.max(0, Number(piece?.lengthIn) || 0);
  const eligible =
    typeof hints.eligible === "boolean"
      ? hints.eligible
      : typeof piece?.backsplashEligible === "boolean"
        ? piece.backsplashEligible
        : false;
  const raw = piece?.backsplashGeometry || piece?.backsplash_geometry || null;
  let eligibleLengthIn = 0;
  let edge = "back";
  let source = String(piece?.backsplashEligibilitySource || "default");
  let approved = false;

  if (raw && typeof raw === "object") {
    eligibleLengthIn = Math.max(
      0,
      Number(raw.backsplashEligibleLengthIn ?? raw.eligibleLengthIn) || 0
    );
    edge = BACKSPLASH_EDGES.includes(String(raw.backsplashEdge || raw.edge))
      ? String(raw.backsplashEdge || raw.edge)
      : "back";
    source = String(raw.source || source);
    approved =
      raw.approved === true ||
      source === "estimator_confirmed" ||
      source === "manual" ||
      source === "previously_saved_manual";
    if (!eligible) eligibleLengthIn = 0;
  } else if (eligible) {
    // Default: full piece run length when eligible and no override stored.
    eligibleLengthIn = Math.max(
      0,
      Number(piece?.backsplashEligibleLengthIn) || lengthIn
    );
    approved =
      source === "estimator_confirmed" ||
      source === "manual" ||
      source === "previously_saved_manual";
  }

  if (!eligible) {
    eligibleLengthIn = 0;
  }

  return {
    backsplashEligible: eligible,
    backsplashEligibleLengthIn: round2(eligibleLengthIn),
    backsplashEdge: edge,
    estimatorLabel: String(piece?.name || piece?.label || "").trim() || null,
    approved,
    source,
    approvalSource: source
  };
}

/**
 * Sum approved (or draft) finished-edge inches across pieces.
 * @param {Array<object>} pieces
 * @param {{ requireApproved?: boolean }} [opts]
 */
export function sumFinishedEdgeLengthIn(pieces, opts = {}) {
  const requireApproved = opts.requireApproved === true;
  let totalIn = 0;
  let approvedCount = 0;
  let draftCount = 0;
  /** @type {Array<object>} */
  const byPiece = [];

  for (const piece of Array.isArray(pieces) ? pieces : []) {
    if (!isCounterPiece(piece)) continue;
    const geo = resolvePieceFinishedEdgeGeometry(piece, { preferDraft: true });
    if (!geo) continue;
    if (requireApproved && !geo.approved) {
      draftCount += 1;
      byPiece.push({
        pieceId: piece.id || piece.runId || null,
        pieceName: piece.name || piece.label || null,
        ...geo,
        includedInSum: false
      });
      continue;
    }
    if (geo.approved) approvedCount += 1;
    else draftCount += 1;
    totalIn = round2(totalIn + geo.totalFinishedEdgeLengthIn);
    byPiece.push({
      pieceId: piece.id || piece.runId || null,
      pieceName: piece.name || piece.label || null,
      ...geo,
      includedInSum: true
    });
  }

  return {
    totalFinishedEdgeLengthIn: totalIn,
    totalFinishedEdgeLf: inchesToLf(totalIn),
    approvedCount,
    draftCount,
    byPiece
  };
}

/**
 * Sum backsplash eligible length and count eligible runs — must agree.
 * @param {Array<object>} pieces
 */
export function sumBacksplashEligibleGeometry(pieces) {
  let eligibleLengthIn = 0;
  let eligibleRunCount = 0;
  /** @type {Array<object>} */
  const byPiece = [];

  for (const piece of Array.isArray(pieces) ? pieces : []) {
    if (!isCounterPiece(piece) && !piece?.backsplashEligible) {
      // splash/fhb pieces may still be eligible markers; skip non-counter unless flagged
      if (!piece || piece.included === false || piece.includedInTakeoff === false) continue;
    }
    if (!isCounterPiece(piece)) continue;
    const geo = resolvePieceBacksplashGeometry(piece);
    if (geo.backsplashEligible) {
      if (!(geo.backsplashEligibleLengthIn > 0) && Number(piece.lengthIn) > 0) {
        // Eligible with missing length → treat as full run (draft).
        geo.backsplashEligibleLengthIn = round2(Number(piece.lengthIn) || 0);
      }
      if (geo.backsplashEligibleLengthIn > 0) {
        eligibleRunCount += 1;
        eligibleLengthIn = round2(eligibleLengthIn + geo.backsplashEligibleLengthIn);
      }
    } else if (geo.backsplashEligibleLengthIn > 0) {
      // Invariant violation candidate — force length to 0.
      geo.backsplashEligibleLengthIn = 0;
    }
    byPiece.push({
      pieceId: piece.id || piece.runId || null,
      pieceName: piece.name || piece.label || null,
      ...geo
    });
  }

  return {
    eligibleBacksplashLengthIn: eligibleLengthIn,
    backsplashEligibleRunCount: eligibleRunCount,
    byPiece
  };
}

/**
 * Invariant: non-zero eligible length requires ≥1 eligible run, and vice versa.
 * @param {{ eligibleBacksplashLengthIn: number, backsplashEligibleRunCount: number }} summary
 */
export function assertBacksplashEligibilityConsistency(summary) {
  const len = Number(summary?.eligibleBacksplashLengthIn) || 0;
  const count = Number(summary?.backsplashEligibleRunCount) || 0;
  if (len > 0 && count <= 0) {
    const err = new Error(
      "Backsplash eligible length is non-zero but eligible run count is zero"
    );
    err.code = "backsplash_eligibility_inconsistent";
    throw err;
  }
  if (count > 0 && len <= 0) {
    const err = new Error(
      "Backsplash eligible run count is non-zero but eligible length is zero"
    );
    err.code = "backsplash_eligibility_inconsistent";
    throw err;
  }
}

/**
 * Build edge + backsplash geometry section for approved scope summary.
 * Prefers finished_edge_v2 when every included counter piece has approved geometry.
 * Otherwise emits draft suggestions and marks confirmation required (does NOT use
 * totalRun − backsplash subtraction for pricing authority).
 *
 * @param {Array<object>} pieces flat list of pieces across rooms
 * @param {{
 *   totalRunLengthIn?: number,
 *   legacyDerivedOpenEdgeLengthIn?: number|null
 * }} [meta]
 */
export function buildGeometryAuthoritySummary(pieces, meta = {}) {
  const counterPieces = (Array.isArray(pieces) ? pieces : []).filter(isCounterPiece);
  const backsplash = sumBacksplashEligibleGeometry(counterPieces);
  assertBacksplashEligibilityConsistency(backsplash);

  const finishedApproved = sumFinishedEdgeLengthIn(counterPieces, { requireApproved: true });
  const finishedDraft = sumFinishedEdgeLengthIn(counterPieces, { requireApproved: false });

  const allApproved =
    counterPieces.length > 0 &&
    finishedApproved.draftCount === 0 &&
    finishedApproved.approvedCount === counterPieces.length;

  const confirmationRequired = !allApproved;

  let edgeEligibleLengthIn = 0;
  let edgeScopeSource = EDGE_GEOMETRY_SOURCES.FINISHED_EDGE_CONFIRMATION_REQUIRED;
  if (allApproved) {
    edgeEligibleLengthIn = finishedApproved.totalFinishedEdgeLengthIn;
    edgeScopeSource = EDGE_GEOMETRY_SOURCES.FINISHED_EDGE_V2;
  }

  // Preserve legacy derived value only as audit/display of the retired formula —
  // never as pricing authority for new approvals.
  const legacyDerivedOpenEdgeLengthIn =
    meta.legacyDerivedOpenEdgeLengthIn != null
      ? Math.max(0, round2(Number(meta.legacyDerivedOpenEdgeLengthIn) || 0))
      : meta.totalRunLengthIn != null
        ? Math.max(
            0,
            round2(
              (Number(meta.totalRunLengthIn) || 0) - backsplash.eligibleBacksplashLengthIn
            )
          )
        : null;

  return {
    backsplashEligibleRunCount: backsplash.backsplashEligibleRunCount,
    eligibleBacksplashLengthIn: backsplash.eligibleBacksplashLengthIn,
    backsplashByPiece: backsplash.byPiece,
    finishedEdgeByPiece: finishedDraft.byPiece,
    approvedFinishedEdgeLengthIn: finishedApproved.totalFinishedEdgeLengthIn,
    approvedFinishedEdgeLf: finishedApproved.totalFinishedEdgeLf,
    suggestedFinishedEdgeLengthIn: finishedDraft.totalFinishedEdgeLengthIn,
    suggestedFinishedEdgeLf: finishedDraft.totalFinishedEdgeLf,
    edgeGeometryConfirmationRequired: confirmationRequired,
    edgeEligibleLengthIn,
    edgeEligibleLinearFeet: inchesToLf(edgeEligibleLengthIn),
    // Keep derivedOpenEdge* aliases for readers that expect those field names,
    // but populate them from finished-edge authority (not subtraction).
    derivedOpenEdgeLengthIn: edgeEligibleLengthIn,
    derivedOpenEdgeLf: inchesToLf(edgeEligibleLengthIn),
    edgeScopeSource,
    legacyDerivedOpenEdgeLengthIn,
    legacyDerivedOpenEdgeLf:
      legacyDerivedOpenEdgeLengthIn != null ? inchesToLf(legacyDerivedOpenEdgeLengthIn) : null,
    retiredFormula: EDGE_GEOMETRY_SOURCES.DERIVED_OPEN_EDGE_V1
  };
}

/**
 * Apply draft finished-edge + backsplash length onto a piece for estimator review.
 * Does not mark approved.
 * @param {object} piece
 * @param {{ eligible?: boolean, areaType?: string|null }} [hints]
 */
export function attachDraftPieceGeometry(piece, hints = {}) {
  const eligible =
    typeof hints.eligible === "boolean" ? hints.eligible : Boolean(piece?.backsplashEligible);
  const finishedEdge = draftFinishedEdgeGeometry({
    ...piece,
    areaType: hints.areaType ?? piece.areaType
  });
  const backsplashGeometry = resolvePieceBacksplashGeometry(
    { ...piece, backsplashEligible: eligible },
    { eligible }
  );
  return {
    ...piece,
    backsplashEligible: eligible,
    backsplashEligibleLengthIn: backsplashGeometry.backsplashEligibleLengthIn,
    backsplashGeometry: {
      ...backsplashGeometry,
      approved: false,
      source: backsplashGeometry.source || "draft_suggestion"
    },
    finishedEdge: {
      ...finishedEdge,
      approved: false,
      source: "draft_suggestion"
    }
  };
}

export { inchesToLf, round2 as roundGeometry2 };
