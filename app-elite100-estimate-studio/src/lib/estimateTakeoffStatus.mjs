/**
 * Derive estimator-facing takeoff progress.
 * Prefer Studio queue vocabulary when workflowStatus is provided.
 */

import { deriveQueueWorkflowStatus } from "../../../backend-core/src/elite100EstimateStudio/studioEstimateQueueWorkflow.mjs";

/**
 * @param {object} input
 * @returns {string}
 */
export function deriveEstimateTakeoffDisplayStatus(input = {}) {
  if (input.workflowStatus) {
    return String(input.workflowStatus);
  }

  // One authoritative mapper shared with queue list/detail.
  return deriveQueueWorkflowStatus({
    caseStatus: input.caseStatus,
    takeoffJobStatus: input.jobStatus ?? input.status ?? input.takeoffJobStatus,
    takeoffReviewStatus: input.reviewStatus ?? input.takeoffReviewStatus,
    linkStatus: input.linkStatus ?? input.relationshipStatus,
    takeoffJobId: input.takeoffJobId,
    firstOpenedAt: input.firstOpenedAt ?? "opened",
    estimateStatus: input.estimateStatus,
    publicationStatus: input.publicationStatus,
    usableGeometryPresent: input.usableGeometryPresent,
    estimatorDraftPresent: input.estimatorDraftPresent,
    pieceCount: input.pieceCount,
    roomCount: input.roomCount
  });
}
