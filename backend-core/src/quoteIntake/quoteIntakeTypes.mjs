/**
 * Quote Intake — Phase 6P.1 domain types / status vocabulary (backend-local).
 * Namespaced qil_* — do not reuse production quote statuses without mapping.
 */

export const QUOTE_INTAKE_API_PREFIX = "/api/quote-intake";

/** Case-level statuses used in 6P.1 (subset; expandable later). */
export const QUOTE_INTAKE_CASE_STATUS = Object.freeze({
  RECEIVED: "qil_received",
  VALIDATING: "qil_validating",
  CLASSIFYING: "qil_classifying",
  MANUAL_REVIEW: "qil_manual_review",
  NOT_QUOTE: "qil_not_quote",
  NOT_ELITE_100: "qil_not_elite_100",
  READY_FOR_TAKEOFF: "qil_ready_for_takeoff",
  TAKEOFF_QUEUED: "qil_takeoff_queued",
  TAKEOFF_PROCESSING: "qil_takeoff_processing",
  TAKEOFF_READY_FOR_REVIEW: "qil_takeoff_ready_for_review",
  TAKEOFF_MANUAL_REVIEW: "qil_takeoff_manual_review",
  TAKEOFF_FAILED: "qil_takeoff_failed",
  ESTIMATOR_REVIEW: "qil_estimator_review",
  ACCEPTED_TAKEOFF: "qil_accepted_takeoff",
  FAILED: "qil_failed"
});

export const QUOTE_INTAKE_CASE_STATUSES = Object.freeze(Object.values(QUOTE_INTAKE_CASE_STATUS));

/** Automation path outcomes (Path A / Path B). */
export const AUTOMATION_PATH = Object.freeze({
  TRUSTED_AUTOMATIC_TAKEOFF: "path_a_trusted_automatic_takeoff",
  MANUAL_REVIEW: "path_b_manual_review"
});

/** Gate / reason codes (stubs for 6P.1 — expanded in 6P.5). */
export const AUTOMATION_REASON_CODE = Object.freeze({
  ALL_GATES_PASSED: "all_gates_passed",
  SENDER_NOT_ALLOWLISTED: "sender_not_allowlisted",
  SUBJECT_MARKER_MISSING: "subject_marker_missing",
  PROGRAM_UNCLEAR: "program_unclear",
  NO_SUPPORTED_PDF: "no_supported_pdf",
  ATTACHMENT_INVALID: "attachment_invalid",
  MULTI_PDF_AMBIGUOUS: "multi_pdf_ambiguous",
  DUPLICATE_MESSAGE: "duplicate_message",
  DUPLICATE_ATTACHMENT_JOB: "duplicate_attachment_job",
  FEATURE_DISABLED: "feature_disabled",
  BUDGET_EXCEEDED: "budget_exceeded",
  CLASSIFICATION_BLOCKED: "classification_blocked",
  CONTRACT_INVARIANT_FAILED: "contract_invariant_failed",
  STUB_RECORDED: "stub_recorded"
});

export const TAKEOFF_LINK_RELATIONSHIP_STATUS = Object.freeze({
  REQUESTED: "requested",
  QUEUED: "queued",
  PROCESSING: "processing",
  READY: "ready",
  MANUAL_REVIEW: "manual_review",
  FAILED: "failed",
  SUPERSEDED: "superseded"
});

export const TAKEOFF_INITIATION_MODE = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL: "manual"
});

export const AUDIT_ACTOR_TYPE = Object.freeze({
  USER: "user",
  SYSTEM: "system"
});

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isQuoteIntakeCaseStatus(value) {
  return QUOTE_INTAKE_CASE_STATUSES.includes(String(value ?? ""));
}
