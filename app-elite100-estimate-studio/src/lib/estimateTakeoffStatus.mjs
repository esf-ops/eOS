/**
 * Derive estimator-facing takeoff progress from intake link + optional job snapshot.
 * Takeoff job fields are the authority when present.
 */
export function deriveEstimateTakeoffDisplayStatus(input = {}) {
  const linkStatus = String(input.linkStatus ?? input.relationshipStatus ?? "")
    .trim()
    .toLowerCase();
  const jobStatus = String(input.jobStatus ?? input.status ?? "")
    .trim()
    .toLowerCase();
  const reviewStatus = String(input.reviewStatus ?? "")
    .trim()
    .toLowerCase();

  if (reviewStatus === "approved") return "Approved";
  if (jobStatus === "failed" || linkStatus === "failed") return "Failed";
  if (jobStatus === "processing" || linkStatus === "processing") return "AI processing";
  if (
    reviewStatus === "needs_review" ||
    reviewStatus === "in_review" ||
    linkStatus === "ready" ||
    linkStatus === "manual_review" ||
    jobStatus === "completed"
  ) {
    return "Needs review";
  }
  if (input.takeoffJobId || linkStatus === "queued" || linkStatus === "requested") {
    return "Takeoff created";
  }
  const caseStatus = String(input.caseStatus ?? "").trim().toLowerCase();
  if (caseStatus.includes("takeoff_failed") || caseStatus === "qil_failed") return "Failed";
  if (caseStatus.includes("accepted_takeoff")) return "Approved";
  if (
    caseStatus.includes("takeoff_ready") ||
    caseStatus.includes("estimator_review") ||
    caseStatus.includes("manual_review")
  ) {
    return "Needs review";
  }
  if (caseStatus.includes("takeoff_processing") || caseStatus.includes("takeoff_queued")) {
    return "AI processing";
  }
  return "Not started";
}
