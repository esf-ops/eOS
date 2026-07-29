/**
 * Pure stage derivation for the active AI estimator workspace.
 * Server fields remain authoritative; this only chooses which primary surface
 * to mount. Stage ids are internal — never show them to estimators.
 *
 * @param {{
 *   takeoffDisplayStatus?: string | null,
 *   handoffBusy?: boolean,
 *   publishBusy?: boolean,
 *   measurementsApproved?: boolean,
 *   customerUrl?: string | null,
 *   estimateRevision?: number | null,
 *   publishedRevision?: number | null,
 *   editingRevision?: boolean,
 *   fatalError?: boolean
 * }} serverState
 * @returns {"processing"|"draft"|"approving"|"approved"|"publishing"|"published"|"revision_draft"|"error"}
 */
export function deriveAiEstimatorStage(serverState = {}) {
  if (serverState.fatalError) return "error";
  if (serverState.publishBusy) return "publishing";
  if (serverState.handoffBusy) return "approving";

  const display = String(serverState.takeoffDisplayStatus || "");
  const processing =
    /queued|processing/i.test(display) && !serverState.measurementsApproved;
  if (processing && !serverState.editingRevision) return "processing";

  if (serverState.editingRevision && !serverState.measurementsApproved) {
    return "revision_draft";
  }

  if (!serverState.measurementsApproved) return "draft";

  const publishedRevision =
    serverState.publishedRevision != null ? Number(serverState.publishedRevision) : null;
  const estimateRevision =
    serverState.estimateRevision != null ? Number(serverState.estimateRevision) : null;
  const hasCustomerUrl = Boolean(String(serverState.customerUrl || "").trim());

  if (
    hasCustomerUrl &&
    publishedRevision != null &&
    estimateRevision != null &&
    estimateRevision === publishedRevision
  ) {
    return "published";
  }

  return "approved";
}

/**
 * True when Publish Revised Estimate should be the primary publish label.
 */
export function shouldOfferPublishRevised(serverState = {}) {
  const publishedRevision =
    serverState.publishedRevision != null ? Number(serverState.publishedRevision) : null;
  const estimateRevision =
    serverState.estimateRevision != null ? Number(serverState.estimateRevision) : null;
  if (publishedRevision == null || estimateRevision == null) return false;
  return estimateRevision > publishedRevision && Boolean(serverState.measurementsApproved);
}
