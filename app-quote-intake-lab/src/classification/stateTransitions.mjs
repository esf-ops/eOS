import { isQuoteIntakeStatus } from "../domain/statuses.mjs";

/**
 * Allowed Phase 3 classification-related transitions.
 * Does not permit takeoff / ready / approved / sent jumps from classification accept.
 */
const ALLOWED = Object.freeze({
  qil_received: Object.freeze(["qil_classifying"]),
  qil_classifying: Object.freeze([
    "qil_intake_review",
    "qil_manual_review",
    "qil_not_quote",
    "qil_not_elite_100",
    "qil_failed"
  ]),
  qil_intake_review: Object.freeze([
    "qil_classifying",
    "qil_manual_review",
    "qil_not_quote",
    "qil_not_elite_100",
    "qil_failed"
  ]),
  qil_manual_review: Object.freeze([
    "qil_classifying",
    "qil_intake_review",
    "qil_not_quote",
    "qil_not_elite_100",
    "qil_failed"
  ]),
  qil_not_quote: Object.freeze(["qil_classifying", "qil_intake_review", "qil_manual_review"]),
  qil_not_elite_100: Object.freeze(["qil_classifying", "qil_intake_review", "qil_manual_review"]),
  qil_failed: Object.freeze(["qil_classifying", "qil_received", "qil_intake_review", "qil_manual_review"]),
  qil_needs_information: Object.freeze(["qil_classifying"])
});

/** Statuses from which classification may be started. */
export const CLASSIFIABLE_FROM = Object.freeze([
  "qil_received",
  "qil_intake_review",
  "qil_manual_review",
  "qil_not_quote",
  "qil_not_elite_100",
  "qil_failed",
  "qil_needs_information"
]);

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransitionStatus(from, to) {
  if (!isQuoteIntakeStatus(from) || !isQuoteIntakeStatus(to)) return false;
  if (from === to) return true;
  const allowed = ALLOWED[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * @param {string} from
 * @param {string} to
 */
export function assertCanTransition(from, to) {
  if (!canTransitionStatus(from, to)) {
    const err = new Error(`Illegal lab status transition: ${from} → ${to}`);
    err.code = "ILLEGAL_STATUS_TRANSITION";
    throw err;
  }
}

export function canStartClassification(status) {
  return CLASSIFIABLE_FROM.includes(String(status ?? ""));
}
