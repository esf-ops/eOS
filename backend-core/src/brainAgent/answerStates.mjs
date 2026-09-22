/**
 * Answer support states — deterministic, not model-defined.
 */

export const ANSWER_STATES = Object.freeze({
  SUPPORTED: "SUPPORTED",
  PARTIALLY_SUPPORTED: "PARTIALLY_SUPPORTED",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  AMBIGUOUS_ENTITY: "AMBIGUOUS_ENTITY",
  STALE_DATA: "STALE_DATA",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
});

export function userMessageForState(state, detail = "") {
  switch (state) {
    case ANSWER_STATES.INSUFFICIENT_EVIDENCE:
      return detail || "I don't have enough authoritative eliteOS data to answer that.";
    case ANSWER_STATES.AMBIGUOUS_ENTITY:
      return detail || "I found multiple matches. Which one did you mean?";
    case ANSWER_STATES.STALE_DATA:
      return detail || "The latest data I can see may be stale; treat numbers as of the sync time shown.";
    case ANSWER_STATES.PERMISSION_DENIED:
      return detail || "That data is outside your authorized eliteOS access.";
    case ANSWER_STATES.CAPABILITY_UNAVAILABLE:
      return detail || "That Brain capability is not available yet.";
    case ANSWER_STATES.PARTIALLY_SUPPORTED:
      return detail || "I can only partially answer from the evidence available.";
    case ANSWER_STATES.SUPPORTED:
    default:
      return detail || "";
  }
}
