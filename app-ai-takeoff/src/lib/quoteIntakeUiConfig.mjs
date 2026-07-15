/**
 * Quote Intake Estimator Queue — UI visibility flag only (Phase 6P.3).
 * Never authorization. Backend remains authoritative.
 */

/**
 * @param {Record<string, string|undefined>|null} [envBag]
 * @returns {boolean}
 */
export function isQuoteIntakeUiEnabled(envBag = null) {
  const raw = envBag
    ? String(envBag.VITE_QUOTE_INTAKE_UI_ENABLED ?? "").trim()
    : String(
        (typeof import.meta !== "undefined" &&
          import.meta.env &&
          import.meta.env.VITE_QUOTE_INTAKE_UI_ENABLED) ||
          ""
      ).trim();
  const v = raw.toLowerCase();
  return v === "1" || v === "true";
}
