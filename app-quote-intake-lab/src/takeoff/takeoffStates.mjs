import { LAB_TAKEOFF_STATUS } from "./takeoffTypes.mjs";

const ALLOWED = new Set(Object.values(LAB_TAKEOFF_STATUS));

/** @param {string} status */
export function isLabTakeoffStatus(status) {
  return ALLOWED.has(status);
}

/**
 * Phase 4B.0 transitions only — no pricing / approved / imported / sent.
 * @param {string} from
 * @param {string} to
 */
export function canTransitionLabTakeoff(from, to) {
  if (!isLabTakeoffStatus(from) || !isLabTakeoffStatus(to)) return false;
  if (from === to) return true;
  const edges = {
    [LAB_TAKEOFF_STATUS.NOT_STARTED]: [LAB_TAKEOFF_STATUS.SIMULATING, LAB_TAKEOFF_STATUS.FAILED],
    [LAB_TAKEOFF_STATUS.SIMULATING]: [
      LAB_TAKEOFF_STATUS.REVIEW,
      LAB_TAKEOFF_STATUS.MANUAL_REVIEW,
      LAB_TAKEOFF_STATUS.FAILED
    ],
    [LAB_TAKEOFF_STATUS.REVIEW]: [LAB_TAKEOFF_STATUS.MANUAL_REVIEW, LAB_TAKEOFF_STATUS.SIMULATING],
    [LAB_TAKEOFF_STATUS.MANUAL_REVIEW]: [LAB_TAKEOFF_STATUS.SIMULATING, LAB_TAKEOFF_STATUS.REVIEW],
    [LAB_TAKEOFF_STATUS.FAILED]: [LAB_TAKEOFF_STATUS.SIMULATING, LAB_TAKEOFF_STATUS.NOT_STARTED]
  };
  return (edges[from] ?? []).includes(to);
}

/**
 * @param {string} from
 * @param {string} to
 */
export function assertLabTakeoffTransition(from, to) {
  if (!canTransitionLabTakeoff(from, to)) {
    const err = new Error(`Illegal lab takeoff transition ${from} → ${to}`);
    err.code = "INVALID_TAKEOFF_STATUS_TRANSITION";
    throw err;
  }
}

export function labTakeoffStatusLabel(status) {
  switch (status) {
    case LAB_TAKEOFF_STATUS.NOT_STARTED:
      return "Takeoff not started";
    case LAB_TAKEOFF_STATUS.SIMULATING:
      return "Simulating takeoff";
    case LAB_TAKEOFF_STATUS.REVIEW:
      return "Takeoff review";
    case LAB_TAKEOFF_STATUS.MANUAL_REVIEW:
      return "Manual takeoff review";
    case LAB_TAKEOFF_STATUS.FAILED:
      return "Takeoff failed";
    default:
      return String(status);
  }
}
