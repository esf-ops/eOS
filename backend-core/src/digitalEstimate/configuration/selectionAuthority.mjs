/**
 * Classify Digital Estimate public selections for save validation.
 *
 * A. unchangedFrozenBaseline — frozen into publication; customer did not change category
 * B. existingSavedConfiguredSelection — previously saved on this session
 * C. newlyRequestedSelection — customer is requesting a different selection now
 *
 * Only C must pass live frozen-envelope availability checks.
 */

/**
 * @param {object|null|undefined} opt
 * @returns {boolean}
 */
export function isIncludedInBaseline(opt) {
  if (!opt || typeof opt !== "object") return false;
  const compat =
    (opt.compatibility_json && typeof opt.compatibility_json === "object"
      ? opt.compatibility_json
      : null) ||
    (opt.compatibilityJson && typeof opt.compatibilityJson === "object"
      ? opt.compatibilityJson
      : null) ||
    {};
  return Boolean(
    opt.included_in_baseline ?? opt.includedInBaseline ?? compat.original ?? compat.originalSelection
  );
}

/**
 * @param {object|null|undefined} opt
 * @returns {number}
 */
export function optionDefaultQty(opt) {
  if (!opt || typeof opt !== "object") return 0;
  return Number(opt.default_qty ?? opt.defaultQty ?? 0) || 0;
}

/**
 * @param {Record<string, number>|null|undefined} priorSelections
 * @param {string} optionKey
 * @returns {number}
 */
export function priorSelectionQty(priorSelections, optionKey) {
  if (!priorSelections || typeof priorSelections !== "object") return 0;
  return Number(priorSelections[optionKey] || 0) || 0;
}

/**
 * @param {{
 *   optionKey: string,
 *   quantity: number,
 *   option?: object|null,
 *   priorSelections?: Record<string, number>|null
 * }} args
 * @returns {"unchanged_frozen_baseline"|"existing_saved_configured"|"newly_requested"}
 */
export function classifyPublicSelection(args) {
  const key = String(args?.optionKey || "");
  const qty = Number(args?.quantity) || 0;
  const opt = args?.option || null;
  const priorQty = priorSelectionQty(args?.priorSelections, key);
  const defaultQty = optionDefaultQty(opt);
  const included = isIncludedInBaseline(opt);

  if (qty <= 0) {
    // Zeroing a prior selection is a newly requested change (removal).
    if (priorQty > 0) return "newly_requested";
    return "unchanged_frozen_baseline";
  }

  // Unchanged vs last successful save for this session.
  if (priorQty > 0 && qty === priorQty) {
    return "existing_saved_configured";
  }

  // Unchanged frozen publication baseline (default / included).
  if (included && defaultQty > 0 && qty === defaultQty && !(priorQty > 0 && priorQty !== qty)) {
    return "unchanged_frozen_baseline";
  }

  // First save after exchange: prior empty, but qty matches baseline default.
  if (included && defaultQty > 0 && qty === defaultQty && !(priorQty > 0)) {
    return "unchanged_frozen_baseline";
  }

  return "newly_requested";
}

/**
 * Whether a selection with qty > 0 may remain despite unavailable/review_required.
 * @param {ReturnType<typeof classifyPublicSelection>} classification
 */
export function selectionMayBypassAvailability(classification) {
  return (
    classification === "unchanged_frozen_baseline" ||
    classification === "existing_saved_configured"
  );
}

/**
 * Known backsplash mode tokens that are always semantically valid when drafts
 * assert them, even if the envelope option row is temporarily missing.
 */
export const CANONICAL_BACKSPLASH_MODES = Object.freeze([
  "none",
  "standard_4in",
  "custom_height",
  "full_height"
]);

/**
 * @param {string} mode
 * @returns {boolean}
 */
export function isCanonicalBacksplashMode(mode) {
  return CANONICAL_BACKSPLASH_MODES.includes(String(mode || "").trim());
}

/**
 * Detect display/review copy that must never be treated as a selection value.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isForbiddenSelectionLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (/^Elite will confirm this option and price\.?$/i.test(s)) return true;
  if (/^Requires estimator review$/i.test(s)) return true;
  if (/^Unavailable$/i.test(s)) return true;
  if (/missing_edge_lf|review_required|option_not_in_frozen/i.test(s)) return true;
  return false;
}

/**
 * Sanitize a Changes selection label; replace forbidden copy with a safe fallback.
 * @param {unknown} raw
 * @param {string} [fallback]
 */
export function sanitizeChangesSelectionLabel(raw, fallback = "Not selected") {
  if (isForbiddenSelectionLabel(raw)) return fallback;
  const s = String(raw || "").trim();
  return s || fallback;
}
