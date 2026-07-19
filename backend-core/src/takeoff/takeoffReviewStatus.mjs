/**
 * takeoffReviewStatus — workflow status vocabulary for AI Takeoff review → import.
 *
 * DB column quote_takeoff_jobs.review_status still uses needs_review | approved.
 * Workflow statuses extend that layer for UI and import gating without a migration.
 *
 * @module takeoffReviewStatus
 */

export const TAKEOFF_WORKFLOW_STATUS = Object.freeze({
  AI_DRAFT: "ai_draft",
  NEEDS_REVIEW: "needs_review",
  REVIEW_COMPLETE: "review_complete",
  APPROVED_FOR_IMPORT: "approved_for_import",
  IMPORTED: "imported",
});

/** @typedef {typeof TAKEOFF_WORKFLOW_STATUS[keyof typeof TAKEOFF_WORKFLOW_STATUS]} TakeoffWorkflowStatus */

/**
 * Map DB review_status + job metadata to workflow status.
 *
 * @param {{
 *   reviewStatus?: string|null,
 *   hasSavedResult?: boolean,
 *   importStatus?: string|null,
 *   hasUnsavedEdits?: boolean,
 *   approvalGate?: { canApprove?: boolean, blockers?: unknown[] }|null,
 * }} params
 * @returns {TakeoffWorkflowStatus}
 */
export function deriveTakeoffWorkflowStatus({
  reviewStatus = "needs_review",
  hasSavedResult = false,
  importStatus = null,
  hasUnsavedEdits = false,
  approvalGate = null,
}) {
  if (importStatus === "imported") {
    return TAKEOFF_WORKFLOW_STATUS.IMPORTED;
  }
  if (reviewStatus === "approved" && !hasUnsavedEdits) {
    return TAKEOFF_WORKFLOW_STATUS.APPROVED_FOR_IMPORT;
  }
  if (
    hasSavedResult &&
    !hasUnsavedEdits &&
    approvalGate?.canApprove === true &&
    (approvalGate.blockers?.length ?? 0) === 0
  ) {
    return TAKEOFF_WORKFLOW_STATUS.REVIEW_COMPLETE;
  }
  if (hasSavedResult) {
    return TAKEOFF_WORKFLOW_STATUS.NEEDS_REVIEW;
  }
  return TAKEOFF_WORKFLOW_STATUS.AI_DRAFT;
}

/**
 * Human-readable label for workflow status chips.
 *
 * @param {TakeoffWorkflowStatus} status
 * @param {{ hasBlockers?: boolean }} [opts]
 */
export function workflowStatusLabel(status, opts = {}) {
  if (opts.hasBlockers && status !== TAKEOFF_WORKFLOW_STATUS.APPROVED_FOR_IMPORT) {
    return "Review Required";
  }
  switch (status) {
    case TAKEOFF_WORKFLOW_STATUS.AI_DRAFT:
      return "AI Draft";
    case TAKEOFF_WORKFLOW_STATUS.NEEDS_REVIEW:
      return "Needs Review";
    case TAKEOFF_WORKFLOW_STATUS.REVIEW_COMPLETE:
      return "Review Complete";
    case TAKEOFF_WORKFLOW_STATUS.APPROVED_FOR_IMPORT:
      return "Approved for Import";
    case TAKEOFF_WORKFLOW_STATUS.IMPORTED:
      return "Imported";
    default:
      return "Needs Review";
  }
}

/**
 * Extract persisted review state from raw_ai_result_json._meta.reviewState.
 *
 * @param {unknown} rawJson
 * @returns {TakeoffReviewState}
 */
export function loadReviewStateFromRaw(rawJson) {
  const raw = rawJson && typeof rawJson === "object" ? rawJson : {};
  const meta = /** @type {Record<string, unknown>} */ (raw)._meta;
  const rs = meta?.reviewState;
  if (!rs || typeof rs !== "object" || Array.isArray(rs)) {
    return emptyReviewState();
  }
  return normalizeReviewState(rs);
}

/**
 * @returns {TakeoffReviewState}
 */
export function emptyReviewState() {
  return {
    excludedRunIds: [],
    excludedRoomIds: [],
    deletedRunIds: [],
    deletedRoomIds: [],
    manualRunIds: [],
    manualRoomIds: [],
    flagResolutions: {},
    roomCompleteness: {},
    referenceTotalAcks: {},
    evidenceAcks: {},
    reviewNotes: {},
    evidenceReviewState: {},
  };
}

/**
 * @param {unknown} rs
 * @returns {TakeoffReviewState}
 */
export function normalizeReviewState(rs) {
  const r = /** @type {Record<string, unknown>} */ (rs);
  return {
    excludedRunIds: Array.isArray(r.excludedRunIds)
      ? r.excludedRunIds.map(String)
      : [],
    excludedRoomIds: Array.isArray(r.excludedRoomIds)
      ? r.excludedRoomIds.map(String)
      : [],
    deletedRunIds: Array.isArray(r.deletedRunIds)
      ? [...new Set(r.deletedRunIds.map(String).filter(Boolean))]
      : [],
    deletedRoomIds: Array.isArray(r.deletedRoomIds)
      ? [...new Set(r.deletedRoomIds.map(String).filter(Boolean))]
      : [],
    manualRunIds: Array.isArray(r.manualRunIds)
      ? r.manualRunIds.map(String)
      : [],
    manualRoomIds: Array.isArray(r.manualRoomIds)
      ? r.manualRoomIds.map(String)
      : [],
    flagResolutions:
      r.flagResolutions && typeof r.flagResolutions === "object" && !Array.isArray(r.flagResolutions)
        ? /** @type {Record<string, FlagResolution>} */ (r.flagResolutions)
        : {},
    roomCompleteness:
      r.roomCompleteness && typeof r.roomCompleteness === "object" && !Array.isArray(r.roomCompleteness)
        ? /** @type {Record<string, boolean>} */ (
            Object.fromEntries(
              Object.entries(r.roomCompleteness).map(([k, v]) => [k, Boolean(v)])
            )
          )
        : {},
    referenceTotalAcks:
      r.referenceTotalAcks && typeof r.referenceTotalAcks === "object"
        ? /** @type {Record<string, boolean>} */ (r.referenceTotalAcks)
        : {},
    evidenceAcks:
      r.evidenceAcks && typeof r.evidenceAcks === "object"
        ? /** @type {Record<string, boolean>} */ (r.evidenceAcks)
        : {},
    reviewNotes:
      r.reviewNotes && typeof r.reviewNotes === "object"
        ? /** @type {Record<string, string>} */ (r.reviewNotes)
        : {},
    evidenceReviewState:
      r.evidenceReviewState && typeof r.evidenceReviewState === "object"
        ? /** @type {Record<string, string>} */ (r.evidenceReviewState)
        : {},
  };
}

/**
 * @typedef {Object} FlagResolution
 * @property {"resolved"|"ignored"} action
 * @property {string} note
 * @property {string} [userId]
 * @property {string} [at]
 */

/**
 * @typedef {Object} TakeoffReviewState
 * @property {string[]} excludedRunIds — piece remains in worksheet, excluded from approval SF
 * @property {string[]} excludedRoomIds — room excluded from approval (include/exclude, not remove)
 * @property {string[]} deletedRunIds — hard-removed pieces; must not reappear from AI merge
 * @property {string[]} deletedRoomIds — hard-removed rooms; must not reappear from AI merge
 * @property {string[]} manualRunIds — estimator-added pieces
 * @property {string[]} manualRoomIds — estimator-added rooms
 * @property {Record<string, FlagResolution>} flagResolutions
 * @property {Record<string, boolean>} roomCompleteness
 * @property {Record<string, boolean>} referenceTotalAcks
 * @property {Record<string, boolean>} evidenceAcks
 * @property {Record<string, string>} [reviewNotes]
 * @property {Record<string, string>} [evidenceReviewState]
 */
