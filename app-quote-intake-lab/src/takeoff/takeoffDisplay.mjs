/**
 * Display helpers for takeoff review UI — provenance labels and SF formatting.
 * Never labels measured SF as chargeable / priced / sell / quote SF.
 */

const FORBIDDEN_SF_LABEL_RE =
  /\b(chargeable|priced|sell|quote)\s*sf\b|quote\s*total|margin|quote\s*library|internal\s*estimate/i;

/**
 * @param {number|null|undefined} value
 * @param {number} [digits]
 */
export function formatTakeoffSf(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)} SF`;
}

/**
 * Provenance chip labels for displayed values.
 */
export const TAKEOFF_PROVENANCE = Object.freeze({
  EMAIL_STATED: "Email-stated",
  SIMULATED_PROVIDER: "Simulated provider proposal",
  DETERMINISTIC: "eliteOS deterministic calculation",
  UNREVIEWED: "Unreviewed",
  SIMULATED_TAKEOFF: "Simulated takeoff",
  AUDIT: "Persisted audit event",
  CLASSIFICATION: "Email classification"
});

/**
 * @param {object|null|undefined} run
 */
export function runProvenanceNote(run) {
  const mode = run?.provider?.mode;
  if (mode === "simulated") {
    return "Simulated takeoff — attachment contents were not read; geometry is a lab fixture scenario.";
  }
  return "Takeoff provider result (lab).";
}

/**
 * @param {string} text
 */
export function containsForbiddenPricingLabels(text) {
  return FORBIDDEN_SF_LABEL_RE.test(String(text ?? ""));
}

/**
 * Diff helpers for summary comparison.
 * @param {number|null|undefined} a
 * @param {number|null|undefined} b
 */
export function sfDifference(a, b) {
  if (a == null || b == null || Number.isNaN(Number(a)) || Number.isNaN(Number(b))) return null;
  return Number(b) - Number(a);
}

/**
 * @param {string|null|undefined} status
 */
export function labelTakeoffStatus(status) {
  switch (status) {
    case "qil_takeoff_not_started":
      return "Not started";
    case "qil_takeoff_simulating":
      return "Simulating";
    case "qil_takeoff_review":
      return "Ready for review";
    case "qil_takeoff_manual_review":
      return "Manual review";
    case "qil_takeoff_failed":
      return "Failed";
    default:
      return status ? String(status) : "—";
  }
}
