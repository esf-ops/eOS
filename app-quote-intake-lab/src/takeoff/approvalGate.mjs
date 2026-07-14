/**
 * Lab takeoff acceptance gate (Phase 4B.3).
 * Blocking warnings cannot be blanket-dismissed.
 */

import { PIECE_REVIEW_STATUS, TAKEOFF_REVIEW_STATE } from "./correctionTypes.mjs";
import { buildReviewedProjection } from "./reviewedProjection.mjs";
import { TAKEOFF_WARNING_SEVERITY } from "./takeoffTypes.mjs";

/**
 * @param {{
 *   sourceRun: object,
 *   draft: object,
 *   acceptedIntakeSnapshot: object|null,
 *   caseItem?: object|null,
 *   statedSquareFootage?: number|null
 * }} input
 */
export function evaluateTakeoffAcceptanceGate(input) {
  const { sourceRun, draft, acceptedIntakeSnapshot } = input;
  /** @type {string[]} */
  const blockers = [];

  if (!sourceRun) blockers.push("Source takeoff run is missing.");
  if (!draft) blockers.push("Correction draft is required.");
  if (!acceptedIntakeSnapshot) {
    blockers.push("Accepted intake classification snapshot is required.");
  } else {
    const elite =
      acceptedIntakeSnapshot.workflowEligibility ??
      acceptedIntakeSnapshot.humanEligibilityDecision ??
      null;
    if (elite !== "elite_100_candidate") {
      blockers.push("Elite 100 candidate eligibility is required.");
    }
    if (acceptedIntakeSnapshot.intent === "not_quote_related") {
      blockers.push("Case is not quote-related.");
    }
  }

  if (sourceRun && draft) {
    if (draft.sourceAttachmentHash !== sourceRun.attachmentContentHash) {
      blockers.push("Source attachment hash no longer matches the draft.");
    }
    if (
      draft.acceptedIntakeSnapshotId &&
      acceptedIntakeSnapshot?.id &&
      draft.acceptedIntakeSnapshotId !== acceptedIntakeSnapshot.id
    ) {
      blockers.push("Accepted intake snapshot no longer matches the draft.");
    }
  }

  if (!sourceRun || !draft) {
    return {
      ok: false,
      ready: false,
      reviewState: TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT,
      blockers,
      projection: null
    };
  }

  const projection = buildReviewedProjection(sourceRun, draft, {
    statedSquareFootage: input.statedSquareFootage ?? null
  });

  // Piece review completeness
  for (const room of sourceRun.rooms ?? []) {
    for (const p of room.pieces ?? []) {
      const status = projection.pieceStatus[p.id] ?? PIECE_REVIEW_STATUS.UNREVIEWED;
      if (status === PIECE_REVIEW_STATUS.EXCLUDED) continue;
      if (status === PIECE_REVIEW_STATUS.UNREVIEWED) {
        blockers.push(`Piece "${p.label || p.id}" is unreviewed.`);
      }
    }
  }

  // Included pieces must have geometry or valid direct SF
  for (const room of projection.rooms) {
    for (const p of room.pieces ?? []) {
      const m = p.measurement ?? {};
      const hasDirect = m.directSf != null && Number(m.directSf) >= 0;
      if (hasDirect) {
        if (!m.directSfReason && !(p.notes ?? []).length) {
          blockers.push(`Direct-SF piece "${p.label || p.id}" requires a reason/note.`);
        }
        continue;
      }
      const L = m.lengthIn;
      const D = m.depthIn;
      if (L == null || D == null || !(Number(L) > 0) || !(Number(D) > 0)) {
        blockers.push(`Piece "${p.label || p.id}" is missing length/depth (or needs direct SF).`);
      }
    }
  }

  // Approval-blocking warnings must be fixed by correction — never blanket-dismissed.
  const sourceWarnings = sourceRun.warnings ?? [];
  for (const w of sourceWarnings) {
    if (w.severity !== TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING) continue;
    const key = warningKey(w);
    const res = projection.warningResolutions[key];
    if (res?.resolutionKind === "dismiss") {
      blockers.push(`Blocking warning ${w.code} cannot be dismissed.`);
      continue;
    }
    if (!isBlockingIssueResolved(w, projection, sourceRun)) {
      blockers.push(`Blocking warning ${w.code} is not resolved by a valid correction.`);
      continue;
    }
    if (!res || !String(res.note ?? "").trim()) {
      blockers.push(`Blocking warning ${w.code} requires a resolution note.`);
    }
  }

  // Estimator-review warnings need acknowledgment with note
  for (const w of sourceWarnings) {
    if (w.severity !== TAKEOFF_WARNING_SEVERITY.ESTIMATOR_REVIEW) continue;
    const key = warningKey(w);
    const res = projection.warningResolutions[key];
    if (!res || !String(res.note ?? "").trim()) {
      blockers.push(`Estimator-review warning ${w.code} requires an acknowledgment note.`);
    }
  }

  if (!projection.sinkConfirmed) {
    blockers.push("Sink cutout count must be confirmed.");
  }

  // Rooms with included pieces must be marked reviewed
  for (const room of projection.rooms) {
    if (!(room.pieces ?? []).length) continue;
    if (!projection.roomReviewed[room.id]) {
      blockers.push(`Room "${room.name || room.id}" must be marked reviewed.`);
    }
  }

  if (!(Number(projection.calculation?.measuredCombinedSf) >= 0)) {
    blockers.push("Deterministic recalculation did not produce a valid combined SF.");
  }

  const unique = [...new Set(blockers)];
  const ready = unique.length === 0;
  return {
    ok: ready,
    ready,
    reviewState: ready
      ? TAKEOFF_REVIEW_STATE.READY_FOR_ACCEPTANCE
      : TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT,
    blockers: unique,
    projection
  };
}

export function warningKey(w) {
  return `${w.code}|${w.pieceId ?? ""}|${w.roomId ?? ""}|${w.field ?? ""}`;
}

function isBlockingIssueResolved(warning, projection, sourceRun) {
  const pieceId = warning.pieceId;
  if (!pieceId) {
    // Room/global — treat as resolved if estimator marked fixed and no missing dims remain
    const unresolved = (projection.rooms ?? []).some((room) =>
      (room.pieces ?? []).some((p) => {
        const m = p.measurement ?? {};
        if (m.directSf != null) return false;
        return !(Number(m.lengthIn) > 0 && Number(m.depthIn) > 0);
      })
    );
    return !unresolved;
  }
  const status = projection.pieceStatus[pieceId];
  if (status === PIECE_REVIEW_STATUS.EXCLUDED) return true;
  // Find piece in projection
  for (const room of projection.rooms) {
    const p = (room.pieces ?? []).find((x) => x.id === pieceId);
    if (!p) continue;
    const m = p.measurement ?? {};
    if (m.directSf != null && Number(m.directSf) >= 0 && m.directSfReason) return true;
    if (Number(m.lengthIn) > 0 && Number(m.depthIn) > 0) return true;
  }
  // Check if piece was excluded
  if ((projection.excludedPieces ?? []).some((p) => p.id === pieceId)) return true;
  // Added replacement pieces for unsupported geometry count when resolution notes present
  void sourceRun;
  return false;
}
