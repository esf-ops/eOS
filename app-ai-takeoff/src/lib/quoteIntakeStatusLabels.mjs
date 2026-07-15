const STATUS_LABELS = {
  qil_received: "Received",
  qil_validating: "Validating",
  qil_classifying: "Classifying",
  qil_manual_review: "Manual review",
  qil_not_quote: "Not a quote",
  qil_not_elite_100: "Not Elite 100",
  qil_ready_for_takeoff: "Ready for Takeoff",
  qil_takeoff_queued: "Takeoff queued",
  qil_takeoff_processing: "Takeoff processing",
  qil_takeoff_ready_for_review: "Takeoff ready for review",
  qil_takeoff_manual_review: "Takeoff manual review",
  qil_takeoff_failed: "Takeoff failed",
  qil_estimator_review: "Estimator review",
  qil_accepted_takeoff: "Accepted Takeoff",
  qil_failed: "Failed"
};

const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent"
};

const PATH_LABELS = {
  path_a_trusted_automatic_takeoff: "Path A — trusted automatic Takeoff",
  path_b_manual_review: "Path B — manual review"
};

const REASON_LABELS = {
  all_gates_passed: "All gates passed",
  sender_not_allowlisted: "Sender not allowlisted",
  subject_marker_missing: "Subject marker missing",
  program_unclear: "Program unclear",
  no_supported_pdf: "No supported PDF",
  attachment_invalid: "Attachment invalid",
  multi_pdf_ambiguous: "Multiple PDFs ambiguous",
  duplicate_message: "Duplicate message",
  duplicate_attachment_job: "Duplicate attachment job",
  feature_disabled: "Feature disabled",
  budget_exceeded: "Budget exceeded",
  classification_blocked: "Classification blocked",
  contract_invariant_failed: "Contract invariant failed",
  stub_recorded: "Stub recorded"
};

export const QUOTE_INTAKE_STATUS_OPTIONS = Object.keys(STATUS_LABELS);

export function labelQuoteIntakeStatus(status) {
  const key = String(status ?? "").trim();
  if (!key) return "Unknown";
  return STATUS_LABELS[key] ?? key.replace(/^qil_/, "").replace(/_/g, " ");
}

export function labelQuoteIntakePriority(priority) {
  const key = String(priority ?? "")
    .trim()
    .toLowerCase();
  if (!key) return "Unknown";
  return PRIORITY_LABELS[key] ?? key;
}

export function labelAutomationPath(path) {
  const key = String(path ?? "").trim();
  if (!key) return "Unknown";
  return PATH_LABELS[key] ?? key.replace(/_/g, " ");
}

export function labelReasonCode(code) {
  const key = String(code ?? "").trim();
  if (!key) return "Unknown";
  return REASON_LABELS[key] ?? key.replace(/_/g, " ");
}

export function statusMatchesSummaryBucket(status, bucket) {
  if (!bucket) return true;
  const s = String(status ?? "");
  switch (bucket) {
    case "new":
      return s === "qil_received" || s === "qil_validating" || s === "qil_classifying";
    case "processing":
      return (
        s === "qil_takeoff_queued" ||
        s === "qil_takeoff_processing" ||
        s === "qil_ready_for_takeoff"
      );
    case "manual_review":
      return (
        s === "qil_manual_review" ||
        s === "qil_takeoff_manual_review" ||
        s === "qil_not_quote" ||
        s === "qil_not_elite_100"
      );
    case "ready_for_takeoff":
      return s === "qil_ready_for_takeoff" || s === "qil_takeoff_ready_for_review";
    case "takeoff":
      return (
        s === "qil_takeoff_queued" ||
        s === "qil_takeoff_processing" ||
        s === "qil_takeoff_ready_for_review" ||
        s === "qil_estimator_review" ||
        s === "qil_accepted_takeoff"
      );
    case "failed":
      return s === "qil_failed" || s === "qil_takeoff_failed";
    default:
      return true;
  }
}
