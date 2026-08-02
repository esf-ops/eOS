/**
 * Plain-English display labels for AI Takeoff Lab job-list rows.
 *
 * Frontend-only presentation. This maps the existing backend job/review/approval
 * statuses to team-facing words. It creates no new persisted state and never
 * changes measurement, pricing, or import behavior.
 *
 * Source statuses (from GET /api/takeoff-jobs list DTO):
 *   job.status         — pending | processing | completed | failed
 *   job.reviewStatus   — needs_review | approved | rejected | ...
 *   job.approvalStatus — (optional) approved | ...
 *
 * Team-facing labels: Not started | Running | Failed | Needs review | Approved.
 * "Imported / linked" is only emitted when the row already carries an explicit
 * import/link signal — the current list DTO does not, so it is not invented.
 */

/**
 * @param {{
 *   status?: string,
 *   reviewStatus?: string,
 *   review_status?: string,
 *   approvalStatus?: string,
 *   resultCount?: number,
 *   hasNormalizedTakeoffJson?: boolean,
 *   importedAt?: string | null,
 *   linkedEstimateId?: string | null,
 * } | null | undefined} job
 * @returns {{ label: string, tone: "neutral"|"info"|"warn"|"danger"|"success" }}
 */
export function deriveTakeoffJobDisplayStatus(job) {
  const status = String(job?.status ?? "").toLowerCase();
  const reviewStatus = String(job?.reviewStatus ?? job?.review_status ?? "").toLowerCase();
  const approvalStatus = String(job?.approvalStatus ?? "").toLowerCase();
  const resultCount = Number(job?.resultCount ?? 0);
  const hasResults = (Number.isFinite(resultCount) && resultCount > 0) || Boolean(job?.hasNormalizedTakeoffJson);

  // Explicit downstream link/import signal (only if the row ever carries one).
  const importedSignal =
    reviewStatus === "imported" ||
    approvalStatus === "imported" ||
    Boolean(job?.importedAt) ||
    Boolean(job?.linkedEstimateId);
  if (importedSignal) return { label: "Imported / linked", tone: "success" };

  if (status === "failed") return { label: "Failed", tone: "danger" };
  if (status === "processing") return { label: "Running", tone: "info" };

  if (approvalStatus === "approved" || reviewStatus === "approved") {
    return { label: "Approved", tone: "success" };
  }

  // Completed extraction or any saved result still needs human review before use.
  if (reviewStatus === "rejected" || status === "completed" || hasResults) {
    return { label: "Needs review", tone: "warn" };
  }

  // pending / created / unknown with no results yet.
  return { label: "Not started", tone: "neutral" };
}

/**
 * @param {"neutral"|"info"|"warn"|"danger"|"success"} tone
 * @returns {string}
 */
export function takeoffJobStatusChipClass(tone) {
  switch (tone) {
    case "success":
      return "takeoff-inbox-chip takeoff-inbox-chip--completed";
    case "danger":
      return "takeoff-inbox-chip takeoff-inbox-chip--failed";
    case "info":
      return "takeoff-inbox-chip takeoff-inbox-chip--processing";
    case "warn":
      return "takeoff-inbox-chip takeoff-inbox-chip--pending";
    default:
      return "takeoff-inbox-chip takeoff-inbox-chip--neutral";
  }
}
