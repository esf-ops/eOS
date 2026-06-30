/**
 * takeoffWorkflowState — canonical AI Takeoff workflow state engine (v1.0).
 *
 * Single source of truth for:
 *   • Which step the takeoff is in (review / final_review / approved / imported)
 *   • Which gate blockers are hard blockers vs estimator decisions vs diagnostics
 *   • Whether canApprove / canImport are true
 *   • What the primary action is for the sticky bar + status card
 *
 * Pure function — no I/O. Consumes an already-evaluated approvalGate and
 * reviewedMath so callers never double-compute.
 *
 * Separation from takeoffApprovalGate:
 *   - The approval gate is the authoritative resolver of "is this blocker still
 *     unresolved?" It reads referenceTotalAcks, flagResolutions, evidenceAcks.
 *   - This module classifies the gate's *remaining* (unresolved) blockers into
 *     categories, re-derives canApprove to exclude diagnostic codes, and
 *     builds UI-ready decision cards.
 *
 * @module takeoffWorkflowState
 */

// ── Blocker classification sets ─────────────────────────────────────────────

/**
 * Hard blockers must be fixed before approval.
 * They cannot be acknowledged or bypassed — dimensions must be corrected,
 * rooms must be verified, save must succeed.
 */
export const HARD_BLOCKER_CODES = new Set([
  "NO_SAVED_RESULT",
  "UNSAVED_EDITS",
  "NO_ROOMS",
  "ROOM_INCOMPLETE",
  "MISSING_RUN_DIMENSIONS",
  "BACKSPLASH_NEEDS_REVIEW",
  "BACKSPLASH_SCOPE_UNRESOLVED",
  "WATERFALL_MISSING_DIMENSIONS",
  "MATH_CONSISTENCY_COUNTERTOP",
  "MATH_CONSISTENCY_BACKSPLASH",
  "MATH_CONSISTENCY_COMBINED",
  "VALIDATION_ERRORS",
  "UNKNOWN_ROOM",
  "EMPTY_AREA",
]);

/**
 * Estimator decision codes — block approval until explicitly accepted.
 * After acceptance (via referenceTotalAcks, flagResolutions, or evidenceAcks),
 * the approval gate no longer produces these blockers on re-evaluation.
 */
export const ESTIMATOR_DECISION_CODES = new Set([
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
  "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED",
]);

/**
 * Diagnostic-only codes — informational. Never block approval or import.
 * These appear only in the Advanced / Diagnostics section.
 */
export const DIAGNOSTIC_CODES = new Set([
  "QA_GATE_BLOCKED",
  "BACKSPLASH_SCOPE_CONFLICT",
  "NONSTANDARD_DEPTH_UNSUPPORTED",
  "CUTOUT_DEDUCTED_FROM_MATERIAL",
  "CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG",
  "REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET",
]);

/** Reference total codes use the referenceTotalAck mechanism to clear. */
const REFERENCE_TOTAL_CODES = new Set([
  "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
  "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
  "REFERENCE_TOTAL_COMBINED_MISMATCH",
  "REFERENCE_TOTAL_NO_BS_CONFLICT",
]);

// ── Decision card builders ───────────────────────────────────────────────────

function decisionCardTitle(code) {
  switch (code) {
    case "REFERENCE_TOTAL_COUNTERTOP_MISMATCH": return "Reference total mismatch — countertop";
    case "REFERENCE_TOTAL_BACKSPLASH_MISMATCH": return "Reference total mismatch — backsplash";
    case "REFERENCE_TOTAL_COMBINED_MISMATCH":   return "Reference total mismatch — combined";
    case "REFERENCE_TOTAL_NO_BS_CONFLICT":      return "Plan note conflicts — no backsplash vs computed";
    case "EVIDENCE_RECONCILIATION":             return "Evidence reconciliation review";
    case "EVIDENCE_DIMENSION_NOT_USED":         return "Unused dimension evidence";
    case "EVIDENCE_DIMENSION_CHANGED_IN_RUN":   return "Dimension changed from evidence";
    case "DRAFT_ASSEMBLY_REVIEW_REQUIRED":      return "Piece requires estimator review";
    case "CONFLICTING_DIMENSIONS_USED_SILENTLY":return "Conflicting dimensions used";
    case "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE":return "Length not supported by evidence";
    case "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED": return "Possible duplicate piece";
    default: return "Final review required";
  }
}

function decisionCardAcceptLabel(code) {
  if (REFERENCE_TOTAL_CODES.has(code)) return "Accept reviewed total";
  if (code === "EVIDENCE_RECONCILIATION")   return "Mark evidence reviewed";
  if (code === "EVIDENCE_DIMENSION_NOT_USED") return "Dismiss — not needed";
  if (code === "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED") return "Confirm — not a duplicate";
  return "Accept and continue";
}

/**
 * Produce the resolution descriptor that a UI handler uses to clear this decision.
 *
 * Resolution types:
 *   "referenceTotalAck"  →  set reviewState.referenceTotalAcks[key] = true
 *   "flagResolution"     →  set reviewState.flagResolutions[flagKey(code, path)] with action "resolved"
 */
function decisionResolution(code, path) {
  if (REFERENCE_TOTAL_CODES.has(code)) {
    return { type: "referenceTotalAck", key: code };
  }
  return {
    type: "flagResolution",
    code,
    path: path ?? null,
    defaultNote: "Reviewed and accepted by estimator.",
  };
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Build the canonical workflow state from pre-computed gate + math outputs.
 *
 * @param {{
 *   approvalGate: {
 *     blockers: Array<{ code: string, message: string, path?: string|null, category?: string }>,
 *     canApprove: boolean,
 *     canImport: boolean,
 *   } | null,
 *   reviewedMath: {
 *     activeRooms: Array<{ roomId: string, roomName: string, roomIdx?: number }>,
 *   } | null,
 *   reviewState: {
 *     excludedRoomIds?: string[],
 *     roomCompleteness?: Record<string, boolean>,
 *   } | null,
 *   selectedRoomId: string | null,
 *   hasSaveableChanges: boolean,
 *   saveStatus: "idle" | "saving" | "saved" | "error",
 *   hasSavedResult: boolean,
 *   reviewStatus: string | null,
 *   importStatus: string | null,
 * }} input
 *
 * @returns {{
 *   step: "review" | "final_review" | "approved" | "imported",
 *   hardBlockers: Array<object>,
 *   estimatorDecisionsRequired: Array<{
 *     code: string,
 *     title: string,
 *     body: string,
 *     acceptLabel: string,
 *     path: string|null,
 *     resolution: object,
 *   }>,
 *   diagnostics: Array<object>,
 *   roomProgress: { verified: number, total: number, nextRoomId: string|null, label: string },
 *   selectedRoom: { id: string, name: string, verified: boolean } | null,
 *   canApprove: boolean,
 *   canImport: boolean,
 *   primaryAction: { type: string, label: string, disabled?: boolean, loading?: boolean } | null,
 *   userMessage: string | null,
 *   hardBlockerCount: number,
 *   pendingDecisionCount: number,
 *   diagnosticCount: number,
 * }}
 */
export function buildTakeoffWorkflowState(input) {
  const {
    approvalGate,
    reviewedMath,
    reviewState,
    selectedRoomId,
    hasSaveableChanges,
    saveStatus,
    hasSavedResult,
    reviewStatus,
    importStatus,
  } = input;

  const gateBlockers = approvalGate?.blockers ?? [];
  const excludedRoomIds = new Set(reviewState?.excludedRoomIds ?? []);
  const roomCompleteness = reviewState?.roomCompleteness ?? {};

  // ── Classify gate blockers ───────────────────────────────────────────────
  const hardBlockers = [];
  const estimatorDecisions = [];
  const diagnostics = [];

  for (const b of gateBlockers) {
    const code = String(b.code ?? "");
    if (DIAGNOSTIC_CODES.has(code)) {
      diagnostics.push(b);
    } else if (ESTIMATOR_DECISION_CODES.has(code)) {
      estimatorDecisions.push(b);
    } else {
      // Unknown codes are hard blockers by default (fail-safe).
      hardBlockers.push(b);
    }
  }

  // ── Build decision cards ─────────────────────────────────────────────────
  const estimatorDecisionsRequired = estimatorDecisions.map((b) => ({
    code: b.code,
    title: decisionCardTitle(b.code),
    body: b.message ?? b.code,
    acceptLabel: decisionCardAcceptLabel(b.code),
    path: b.path ?? null,
    resolution: decisionResolution(b.code, b.path),
  }));

  // ── Room progress ────────────────────────────────────────────────────────
  const activeRooms = (reviewedMath?.activeRooms ?? []).filter(
    (r) => !excludedRoomIds.has(r.roomId)
  );
  const verifiedCount = activeRooms.filter((r) => roomCompleteness[r.roomId]).length;
  const totalRooms = activeRooms.length;
  const allRoomsVerified = totalRooms > 0 && verifiedCount === totalRooms;
  const nextRoomId =
    activeRooms.find((r) => !roomCompleteness[r.roomId])?.roomId ?? null;

  const roomProgress = {
    verified: verifiedCount,
    total: totalRooms,
    nextRoomId,
    label:
      totalRooms > 0
        ? `${verifiedCount} of ${totalRooms} rooms verified`
        : "No rooms in scope",
  };

  // ── Step ─────────────────────────────────────────────────────────────────
  let step;
  if (importStatus === "imported") {
    step = "imported";
  } else if (reviewStatus === "approved" && !hasSaveableChanges) {
    step = "approved";
  } else if (
    hardBlockers.length === 0 &&
    estimatorDecisionsRequired.length > 0 &&
    allRoomsVerified &&
    hasSavedResult &&
    !hasSaveableChanges
  ) {
    step = "final_review";
  } else {
    step = "review";
  }

  // ── canApprove (canonical — diagnostics do NOT block) ────────────────────
  // The gate's own canApprove blocks on ALL gate blockers including diagnostics.
  // Here we only block on hard blockers and pending decisions.
  const canApprove =
    hardBlockers.length === 0 &&
    estimatorDecisionsRequired.length === 0 &&
    reviewStatus !== "approved" &&
    hasSavedResult &&
    !hasSaveableChanges;

  const canImport =
    reviewStatus === "approved" &&
    !hasSaveableChanges &&
    importStatus !== "imported";

  // ── Selected room (summary only — detail via roomVerificationView) ────────
  const selectedRoomData = selectedRoomId
    ? activeRooms.find((r) => r.roomId === selectedRoomId) ?? null
    : null;
  const selectedRoom = selectedRoomData
    ? {
        id: selectedRoomData.roomId,
        name: selectedRoomData.roomName,
        verified: Boolean(roomCompleteness[selectedRoomData.roomId]),
      }
    : null;

  // ── Primary action ────────────────────────────────────────────────────────
  // Covers the global workflow phases. Room-level navigation (verify_room,
  // next_room, room_blockers) is still handled by deriveReviewActionPath.
  let primaryAction = null;

  if (step === "imported") {
    primaryAction = { type: "none", label: "Imported", disabled: true };
  } else if (step === "approved" && canImport) {
    primaryAction = { type: "import", label: "Import to Internal Estimate" };
  } else if (saveStatus === "saving") {
    primaryAction = { type: "none", label: "Saving…", disabled: true, loading: true };
  } else if (saveStatus === "error") {
    primaryAction = {
      type: "save",
      label: "Retry save",
      title: "Previous save failed — try again.",
    };
  } else if (hasSaveableChanges && allRoomsVerified) {
    primaryAction = { type: "save", label: "Save reviewed dimensions" };
  } else if (step === "final_review") {
    primaryAction = {
      type: "review_decisions",
      label:
        estimatorDecisionsRequired.length === 1
          ? estimatorDecisionsRequired[0].acceptLabel
          : `Review ${estimatorDecisionsRequired.length} decisions`,
    };
  } else if (canApprove) {
    primaryAction = { type: "approve", label: "Approve takeoff" };
  }
  // null → room-level action handled by deriveReviewActionPath

  // ── User message ──────────────────────────────────────────────────────────
  let userMessage = null;
  if (step === "imported") {
    userMessage = "Draft Internal Estimate created from this takeoff.";
  } else if (step === "approved") {
    userMessage = "Approved and ready to import to Internal Estimate.";
  } else if (step === "final_review") {
    const n = estimatorDecisionsRequired.length;
    userMessage = `${n} decision${n !== 1 ? "s" : ""} required before approval.`;
  } else if (hardBlockers.length > 0) {
    const n = hardBlockers.length;
    userMessage = `${n} item${n !== 1 ? "s" : ""} must be resolved.`;
  }

  return {
    step,
    selectedRoom,
    roomProgress,
    hardBlockers,
    estimatorDecisionsRequired,
    diagnostics,
    canApprove,
    canImport,
    primaryAction,
    userMessage,
    hardBlockerCount: hardBlockers.length,
    pendingDecisionCount: estimatorDecisionsRequired.length,
    diagnosticCount: diagnostics.length,
  };
}
