/**
 * Consolidated estimator Takeoff review — blocking vs advisory classification.
 *
 * Used by the single-worksheet "Approve Takeoff & Build Estimate" path.
 * Does not replace Gemini extraction or the Takeoff job model.
 *
 * @module takeoffConsolidatedApproval
 */

import { evaluateTakeoffApprovalGate } from "./takeoffApprovalGate.mjs";
import { emptyReviewState, normalizeReviewState } from "./takeoffReviewStatus.mjs";

/**
 * True blocking issues for the consolidated estimator path.
 * Everything else from the legacy gate is advisory (or ignored).
 */
export const CONSOLIDATED_BLOCKING_CODES = new Set([
  "NO_SAVED_RESULT",
  "UNSAVED_EDITS",
  "NO_ROOMS",
  "NO_INCLUDED_PIECES",
  "MISSING_RUN_DIMENSIONS",
  "WATERFALL_MISSING_DIMENSIONS",
  "VALIDATION_ERRORS",
  "MATH_CONSISTENCY_COUNTERTOP",
  "MATH_CONSISTENCY_BACKSPLASH",
  "MATH_CONSISTENCY_COMBINED",
  "EMPTY_AREA",
  "TAKEOFF_PROCESSING",
  "TAKEOFF_FAILED",
  "CALCULATION_FAILED",
  "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED"
]);

/**
 * Codes that are never blocking in consolidated review (legacy room-verify /
 * evidence ack / QA "do not import" / backsplash confirmation).
 */
export const CONSOLIDATED_ADVISORY_CODES = new Set([
  "ROOM_INCOMPLETE",
  "UNKNOWN_ROOM",
  "BACKSPLASH_NEEDS_REVIEW",
  "BACKSPLASH_SCOPE_UNRESOLVED",
  "BACKSPLASH_SCOPE_CONFLICT",
  "QA_GATE_BLOCKED",
  "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
  "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
  "REFERENCE_TOTAL_COMBINED_MISMATCH",
  "REFERENCE_TOTAL_NO_BS_CONFLICT",
  "EVIDENCE_DIMENSION_NOT_USED",
  "EVIDENCE_DIMENSION_CHANGED_IN_RUN",
  "DRAFT_ASSEMBLY_REVIEW_REQUIRED",
  "CONFLICTING_DIMENSIONS_USED_SILENTLY",
  "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE",
  "EVIDENCE_RECONCILIATION",
  "NONSTANDARD_DEPTH_UNSUPPORTED",
  "CUTOUT_DEDUCTED_FROM_MATERIAL",
  "CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG",
  "REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET"
]);

/**
 * Mark every included room complete so ROOM_INCOMPLETE never fires.
 * @param {object} takeoffResult
 * @param {object|null} reviewState
 */
export function autoCompleteRoomReviewState(takeoffResult, reviewState = null) {
  const rs = reviewState ? normalizeReviewState(reviewState) : emptyReviewState();
  const roomCompleteness = { ...(rs.roomCompleteness || {}) };
  for (const room of takeoffResult?.rooms ?? []) {
    const id = String(room?.id ?? "").trim();
    if (id) roomCompleteness[id] = true;
  }
  return { ...rs, roomCompleteness };
}

/**
 * Count included countertop-capable runs after exclusions.
 * @param {object} takeoffResult
 * @param {object} reviewState
 */
export function countIncludedMeasurablePieces(takeoffResult, reviewState) {
  const excludedRuns = new Set(reviewState?.excludedRunIds ?? []);
  const excludedRooms = new Set(reviewState?.excludedRoomIds ?? []);
  let count = 0;
  for (const room of takeoffResult?.rooms ?? []) {
    if (excludedRooms.has(room.id)) continue;
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        if (excludedRuns.has(run.id)) continue;
        const len = Number(run.lengthIn) || 0;
        const dep = Number(run.depthIn) || 0;
        if (len > 0 && dep > 0) count += 1;
      }
    }
  }
  return count;
}

/**
 * @param {{ code?: string, message?: string, path?: string|null, category?: string }} issue
 * @returns {"blocking"|"advisory"}
 */
export function classifyConsolidatedSeverity(issue) {
  const code = String(issue?.code ?? "").trim();
  if (CONSOLIDATED_BLOCKING_CODES.has(code)) return "blocking";
  if (CONSOLIDATED_ADVISORY_CODES.has(code)) return "advisory";
  // Unknown codes: treat dimension/math/validation as blocking, else advisory.
  const cat = String(issue?.category ?? "").toLowerCase();
  if (cat === "dimensions" || cat === "validation" || cat === "math") return "blocking";
  return "advisory";
}

/**
 * Split legacy gate blockers into consolidated blocking vs advisory.
 * @param {Array<{ code?: string, message?: string, path?: string|null, category?: string }>} blockers
 */
export function splitConsolidatedIssues(blockers) {
  const blocking = [];
  const advisory = [];
  for (const b of blockers ?? []) {
    if (classifyConsolidatedSeverity(b) === "blocking") blocking.push(b);
    else advisory.push(b);
  }
  return { blocking, advisory };
}

/**
 * Evaluate approval for the consolidated worksheet path.
 *
 * @param {Parameters<typeof evaluateTakeoffApprovalGate>[0] & {
 *   jobStatus?: string|null
 * }} params
 */
export function evaluateConsolidatedApprovalGate(params) {
  const jobStatus = String(params.jobStatus ?? "").toLowerCase();
  const takeoffResult = params.takeoffResult;
  const reviewState = autoCompleteRoomReviewState(takeoffResult, params.reviewState);

  if (jobStatus === "processing") {
    return {
      canApprove: false,
      canApproveWithAdvisory: false,
      blocking: [
        {
          code: "TAKEOFF_PROCESSING",
          message: "Takeoff is still processing.",
          path: null,
          category: "processing"
        }
      ],
      advisory: [],
      blockers: [
        {
          code: "TAKEOFF_PROCESSING",
          message: "Takeoff is still processing.",
          path: null,
          category: "processing"
        }
      ],
      reviewState,
      workflowStatus: "needs_review",
      blockerCount: 1
    };
  }
  if (jobStatus === "failed" || jobStatus === "error") {
    return {
      canApprove: false,
      canApproveWithAdvisory: false,
      blocking: [
        {
          code: "TAKEOFF_FAILED",
          message: "Takeoff processing failed.",
          path: null,
          category: "processing"
        }
      ],
      advisory: [],
      blockers: [
        {
          code: "TAKEOFF_FAILED",
          message: "Takeoff processing failed.",
          path: null,
          category: "processing"
        }
      ],
      reviewState,
      workflowStatus: "needs_review",
      blockerCount: 1
    };
  }

  const gate = evaluateTakeoffApprovalGate({
    ...params,
    reviewState,
    // Consolidated path saves atomically in approve-and-build; treat as saved.
    hasUnsavedEdits: false,
    hasSavedResult: params.hasSavedResult !== false
  });

  const { blocking, advisory } = splitConsolidatedIssues(gate.blockers);

  if (countIncludedMeasurablePieces(takeoffResult, reviewState) === 0) {
    const exists = blocking.some((b) => b.code === "NO_INCLUDED_PIECES" || b.code === "NO_ROOMS");
    if (!exists) {
      blocking.push({
        code: "NO_INCLUDED_PIECES",
        message: "At least one included piece with length and depth is required.",
        path: null,
        category: "rooms"
      });
    }
  }

  const reviewStatus = String(params.reviewStatus ?? "needs_review").toLowerCase();
  const alreadyApproved = reviewStatus === "approved";
  const canApprove = blocking.length === 0 && !alreadyApproved;
  const canApproveWithAdvisory = blocking.length === 0;

  return {
    canApprove,
    canApproveWithAdvisory,
    blocking,
    advisory,
    blockers: blocking,
    reviewState,
    workflowStatus: gate.workflowStatus,
    blockerCount: blocking.length,
    alreadyApproved
  };
}

/**
 * Compact estimator-facing summary from takeoff + review state.
 * @param {object} takeoffResult
 * @param {object} reviewState
 * @param {object|null} computed
 * @param {{ blocking?: object[], advisory?: object[] }} issues
 */
export function buildConsolidatedTakeoffSummary(takeoffResult, reviewState, computed, issues = {}) {
  const excludedRuns = new Set(reviewState?.excludedRunIds ?? []);
  const excludedRooms = new Set(reviewState?.excludedRoomIds ?? []);
  let rooms = 0;
  let includedPieces = 0;
  let kitchenSink = 0;
  let vanitySink = 0;
  let cooktop = 0;
  let outlet = 0;

  for (const room of takeoffResult?.rooms ?? []) {
    if (excludedRooms.has(room.id)) continue;
    rooms += 1;
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        if (excludedRuns.has(run.id)) continue;
        includedPieces += 1;
        const cutouts = run.cutouts || area.cutouts || {};
        kitchenSink += Number(cutouts.kitchenSink ?? cutouts.kitchen_sink ?? 0) || 0;
        vanitySink += Number(cutouts.vanitySink ?? cutouts.vanity_sink ?? cutouts.barSink ?? 0) || 0;
        cooktop += Number(cutouts.cooktop ?? 0) || 0;
        outlet += Number(cutouts.outlet ?? cutouts.outlets ?? 0) || 0;
      }
    }
  }

  const countertopSf =
    Number(computed?.countertopExactSf ?? computed?.totals?.countertopExactSf ?? 0) || 0;
  const backsplashSf =
    Number(computed?.backsplashExactSf ?? computed?.totals?.backsplashExactSf ?? 0) || 0;

  return {
    rooms,
    includedPieces,
    countertopSf,
    backsplashSf,
    kitchenSinkCutouts: kitchenSink,
    vanityBarSinkCutouts: vanitySink,
    cooktopCutouts: cooktop,
    outletCutouts: outlet,
    blockingCount: (issues.blocking ?? []).length,
    advisoryCount: (issues.advisory ?? []).length,
    blocking: issues.blocking ?? [],
    advisory: issues.advisory ?? []
  };
}

/**
 * Estimator-facing Takeoff status (4 values).
 * @param {{ jobStatus?: string, reviewStatus?: string, hasResult?: boolean }} input
 */
export function deriveConsolidatedDisplayStatus(input) {
  const job = String(input.jobStatus ?? "").toLowerCase();
  const review = String(input.reviewStatus ?? "").toLowerCase();
  if (job === "failed" || job === "error") return "Failed";
  if (job === "processing" || job === "pending" || job === "queued") return "Processing";
  if (review === "approved") return "Approved";
  if (input.hasResult || review === "needs_review" || job === "completed") return "Needs review";
  return "Processing";
}
