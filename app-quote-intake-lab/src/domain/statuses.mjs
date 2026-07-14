/**
 * Quote Intake Lab status vocabulary (qil_* namespaced).
 * See docs/quote-intake-lab/ARCHITECTURE.md §8.
 */

export const QUOTE_INTAKE_STATUSES = Object.freeze([
  "qil_received",
  "qil_classifying",
  "qil_intake_review",
  "qil_manual_review",
  "qil_not_quote",
  "qil_not_elite_100",
  "qil_processing_attachments",
  "qil_takeoff_processing",
  "qil_needs_information",
  "qil_needs_manual_takeoff",
  "qil_ready_for_review",
  "qil_in_review",
  "qil_approved_lab_quote",
  "qil_ready_to_send_lab",
  "qil_sent_simulated",
  "qil_failed"
]);

export const STATUS_LABELS = Object.freeze({
  qil_received: "Received",
  qil_classifying: "Classifying",
  qil_intake_review: "Intake review",
  qil_manual_review: "Manual review",
  qil_not_quote: "Not a quote",
  qil_not_elite_100: "Not Elite 100",
  qil_processing_attachments: "Processing attachments",
  qil_takeoff_processing: "Takeoff processing (simulated)",
  qil_needs_information: "Needs information",
  qil_needs_manual_takeoff: "Needs manual takeoff",
  qil_ready_for_review: "Ready for review",
  qil_in_review: "In review",
  qil_approved_lab_quote: "Approved lab quote",
  qil_ready_to_send_lab: "Ready to send (lab)",
  qil_sent_simulated: "Sent (simulated)",
  qil_failed: "Failed"
});

/** Summary bucket ids used by the queue header. */
export const SUMMARY_BUCKETS = Object.freeze([
  "new",
  "processing",
  "ready_for_review",
  "missing_information",
  "manual_review",
  "approved_ready",
  "sent_simulated"
]);

const BUCKET_STATUSES = Object.freeze({
  new: ["qil_received"],
  processing: ["qil_classifying", "qil_processing_attachments", "qil_takeoff_processing"],
  ready_for_review: ["qil_ready_for_review", "qil_intake_review"],
  missing_information: ["qil_needs_information"],
  manual_review: [
    "qil_needs_manual_takeoff",
    "qil_manual_review",
    "qil_failed",
    "qil_not_elite_100",
    "qil_not_quote"
  ],
  approved_ready: ["qil_approved_lab_quote", "qil_ready_to_send_lab", "qil_in_review"],
  sent_simulated: ["qil_sent_simulated"]
});

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? String(status ?? "");
}

export function statusesForSummaryBucket(bucket) {
  return BUCKET_STATUSES[bucket] ?? [];
}

export function summaryBucketForStatus(status) {
  for (const bucket of SUMMARY_BUCKETS) {
    if (BUCKET_STATUSES[bucket].includes(status)) return bucket;
  }
  return null;
}

export function isQuoteIntakeStatus(value) {
  return QUOTE_INTAKE_STATUSES.includes(String(value ?? ""));
}
