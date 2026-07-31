/**
 * Digital Estimate — Baseline Parity + Customer UI Guardrails (hotfix).
 *
 * Until Slice K ships authoritative backend repricing from the approved
 * publication snapshot, customer-visible totals must stay on the published
 * baseline. Selection/configuration changes may still be saved as
 * pending/review-required, but must not invent lower totals, $0 countertop
 * lines, or fake edge deltas.
 *
 * Does not change calculator math. Does not mutate approved Studio estimates
 * or quote_publication_snapshots.
 */

export const CUSTOMER_PRICING_AUTHORITY = Object.freeze({
  /** Hotfix: public totals frozen to published baseline. */
  PUBLISHED_BASELINE_FROZEN: "published_baseline_frozen",
  /** Future Slice K: trustworthy backend reprice. */
  AUTHORITATIVE_BACKEND_REPRICE: "authoritative_backend_reprice"
});

export const CUSTOMER_PRICING_STATUS = Object.freeze({
  BASELINE: "baseline",
  PENDING_ESTIMATOR_REVIEW: "pending_estimator_review"
});

export const BASELINE_PARITY_NOTICES = Object.freeze({
  PRICE_UPDATE_REVIEW:
    "Price updates for this change require estimator review.",
  ESTIMATOR_WILL_REVIEW:
    "Elite will review this before final approval.",
  EDGE_REVIEW:
    "Edge changes may affect your final estimate and will be reviewed by Elite.",
  CHANGES_NEED_REVIEW: "Changes need review",
  REQUESTED_CHANGE: "Requested change",
  FINAL_APPROVAL_UNAVAILABLE:
    "Final approval will be available after estimator review."
});

/**
 * Hotfix gate — customer-facing repricing is not authoritative yet.
 * Flip only when Slice K proves backend reprice matches Studio V2.
 * @returns {boolean}
 */
export function isCustomerRepricingAuthoritative() {
  return false;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve published baseline dollars from calc + context.
 * @param {object|null|undefined} calc
 * @param {{ baselineDisplayTotal?: number|null }} [opts]
 */
export function resolvePublishedBaselineTotal(calc, opts = {}) {
  return (
    num(opts.baselineDisplayTotal) ??
    num(calc?.baselineDisplayTotal) ??
    (calc?.baselineDisplayTotalCents != null
      ? num(calc.baselineDisplayTotalCents) / 100
      : null) ??
    num(calc?.totals?.baselineDisplayTotal) ??
    num(calc?.totals?.estimatedProjectTotal) ??
    null
  );
}

/**
 * True when public calc already carries a non-baseline configured total.
 * @param {object|null|undefined} calc
 * @param {number|null} baseline
 */
export function publicCalcDivergesFromBaseline(calc, baseline) {
  if (baseline == null || !calc) return false;
  const configured =
    num(calc.configuredDisplayTotal) ??
    (calc.configuredDisplayTotalCents != null
      ? num(calc.configuredDisplayTotalCents) / 100
      : null) ??
    num(calc.totals?.configuredDisplayTotal) ??
    null;
  if (configured == null) return false;
  return Math.abs(configured - baseline) >= 0.005;
}

/**
 * Customer-safe edge option display for public Digital Estimate.
 *
 * Keeps backend-calculated display amounts (frozen publication effects or
 * trusted LF×rate resolution) so included profiles show +$0 and upgraded
 * profiles show +$N. Does NOT make those amounts authoritative for the
 * published estimate total — totals stay frozen via
 * applyBaselineParityToCustomerCalculation until Slice K.
 *
 * @param {object} publicOpt
 * @returns {object}
 */
export function applyEdgeOptionPriceGuardrail(publicOpt) {
  if (!publicOpt || typeof publicOpt !== "object") return publicOpt;
  if (isCustomerRepricingAuthoritative()) return publicOpt;
  const key = String(publicOpt.optionKey || "");
  const isEdge =
    key.startsWith("edge:") ||
    publicOpt.profileKey != null ||
    publicOpt.premium === true ||
    publicOpt.premium === false;
  if (!isEdge && !key.startsWith("edge:")) return publicOpt;

  const next = { ...publicOpt };
  const centsRaw =
    publicOpt.priceEffectCents != null ? Number(publicOpt.priceEffectCents) : null;
  const hasAuthoritativeCents = centsRaw != null && Number.isFinite(centsRaw);
  const treatment = String(publicOpt.customerPriceTreatment || "");

  // Preserve backend-owned display cents when present (frozen publish or trusted resolve).
  if (hasAuthoritativeCents) {
    next.priceEffectCents = Math.trunc(centsRaw);
    if (next.visibleDelta == null && treatment === "delta") {
      next.visibleDelta = next.priceEffectCents / 100;
    }
  }

  // Published / baseline edge for this room — never show as an upgrade delta.
  if (
    Boolean(publicOpt.includedInBaseline) ||
    treatment === "original_selection" ||
    publicOpt.priceEffectLabel === "Original selection"
  ) {
    next.customerPriceTreatment = "original_selection";
    next.priceEffectLabel = "Included in your estimate";
    next.priceEffectCents = 0;
    next.visibleDelta = 0;
    next.selectable = true;
    return next;
  }

  // Included-tier alternate profiles (Eased, Large Eased, …).
  if (
    treatment === "included_alternate" ||
    publicOpt.premium === false ||
    publicOpt.priceEffectLabel === "Included" ||
    (hasAuthoritativeCents && centsRaw === 0 && publicOpt.premium !== true)
  ) {
    next.customerPriceTreatment = "included_alternate";
    next.priceEffectLabel = "+$0";
    next.priceEffectCents = 0;
    next.visibleDelta = 0;
    next.selectable = true;
    return next;
  }

  // Upgraded profiles with backend-calculated display cents.
  if (hasAuthoritativeCents && centsRaw >= 0 && (treatment === "delta" || publicOpt.premium === true)) {
    const dollars = next.priceEffectCents / 100;
    next.customerPriceTreatment = "delta";
    next.priceEffectLabel =
      publicOpt.priceEffectLabel && /^\+\$/.test(String(publicOpt.priceEffectLabel))
        ? String(publicOpt.priceEffectLabel)
        : `+$${Math.round(dollars).toLocaleString("en-US")}`;
    next.visibleDelta = dollars;
    next.selectable = true;
    return next;
  }

  // No authoritative cents — still selectable as a pending request; section-level
  // note covers review copy (avoid repeating long text on every upgraded row).
  next.customerPriceTreatment =
    treatment === "review_required" ? "review_required" : treatment || "review_required";
  next.priceEffectLabel = null;
  next.visibleDelta = null;
  next.visibleSellPrice = null;
  next.selectable = publicOpt.availabilityState === "unavailable" ? false : true;
  if (publicOpt.availabilityState !== "unavailable") {
    next.availabilityState = "review_required";
  }
  return next;
}

/**
 * Apply edge guardrail across an options array (public state).
 * @param {object[]|null|undefined} options
 */
export function applyEdgeOptionPriceGuardrails(options) {
  if (!Array.isArray(options)) return options;
  if (isCustomerRepricingAuthoritative()) return options;
  return options.map((o) => {
    const key = String(o?.optionKey || "");
    if (!key.startsWith("edge:")) return o;
    return applyEdgeOptionPriceGuardrail(o);
  });
}

/**
 * Freeze customer-visible calculation to published baseline.
 * @param {object|null|undefined} calc
 * @param {{
 *   baselineDisplayTotal?: number|null,
 *   publishedRoomPricingPublic?: object|null,
 *   hasPendingPriceAffectingChanges?: boolean
 * }} [opts]
 */
export function applyBaselineParityToCustomerCalculation(calc, opts = {}) {
  if (!calc || typeof calc !== "object") return calc;
  if (isCustomerRepricingAuthoritative()) {
    return {
      ...calc,
      pricingAuthority: CUSTOMER_PRICING_AUTHORITY.AUTHORITATIVE_BACKEND_REPRICE,
      customerPricingStatus: CUSTOMER_PRICING_STATUS.BASELINE,
      canSubmitForFinalReview: false
    };
  }

  const baseline = resolvePublishedBaselineTotal(calc, opts);
  const pending = Boolean(
    opts.hasPendingPriceAffectingChanges ||
      publicCalcDivergesFromBaseline(calc, baseline) ||
      calc.customerPricingStatus === CUSTOMER_PRICING_STATUS.PENDING_ESTIMATOR_REVIEW
  );

  /** @type {Record<string, unknown>} */
  const next = { ...calc };
  if (baseline != null) {
    next.baselineDisplayTotal = baseline;
    next.configuredDisplayTotal = baseline;
    next.displayTotalDelta = 0;
    next.displayDelta = 0;
    if (next.totals && typeof next.totals === "object") {
      next.totals = {
        ...next.totals,
        baselineDisplayTotal: baseline,
        configuredDisplayTotal: baseline,
        displayDelta: 0,
        displayTotalDelta: 0
      };
    }
    if (next.baselineDisplayTotalCents != null) {
      next.baselineDisplayTotalCents = Math.round(baseline * 100);
    }
    if (next.configuredDisplayTotalCents != null) {
      next.configuredDisplayTotalCents = Math.round(baseline * 100);
    }
  }

  next.pricingAuthority = CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN;
  next.customerPricingStatus = pending
    ? CUSTOMER_PRICING_STATUS.PENDING_ESTIMATOR_REVIEW
    : CUSTOMER_PRICING_STATUS.BASELINE;
  next.customerPricingNotice = pending
    ? BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW
    : null;
  next.canSubmitForFinalReview = false;

  if (opts.publishedRoomPricingPublic && typeof opts.publishedRoomPricingPublic === "object") {
    next.roomPricing = opts.publishedRoomPricingPublic;
    // Suppress misleading change rows while repricing is frozen.
    next.roomPricingChanges = {
      kind: "changes",
      rows: [],
      totalDelta: 0,
      pendingReview: pending,
      notice: pending ? BASELINE_PARITY_NOTICES.ESTIMATOR_WILL_REVIEW : null
    };
  }

  const messages = Array.isArray(next.reviewRequiredMessages)
    ? [...next.reviewRequiredMessages]
    : [];
  if (pending) {
    if (!messages.includes(BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW)) {
      messages.push(BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW);
    }
    if (!messages.includes(BASELINE_PARITY_NOTICES.ESTIMATOR_WILL_REVIEW)) {
      messages.push(BASELINE_PARITY_NOTICES.ESTIMATOR_WILL_REVIEW);
    }
  }
  next.reviewRequiredMessages = messages;

  if (next.customerConfiguration && typeof next.customerConfiguration === "object") {
    next.customerConfiguration = {
      ...next.customerConfiguration,
      canSubmitForFinalReview: false,
      approvedBaselinePreserved: true,
      requiresEstimatorReview:
        Boolean(next.customerConfiguration.requiresEstimatorReview) || pending
    };
  }

  return next;
}

/**
 * Detect material/edge/backsplash selection keys that can affect price.
 * @param {Record<string, number>|null|undefined} quantities
 */
export function hasPriceAffectingCustomerSelections(quantities) {
  for (const [key, qty] of Object.entries(quantities || {})) {
    if (!(Number(qty) > 0)) continue;
    const k = String(key);
    if (
      k.startsWith("material:") ||
      k.startsWith("edge:") ||
      k.startsWith("backsplash:") ||
      k.startsWith("sidesplash:") ||
      k.startsWith("waterfall:")
    ) {
      return true;
    }
  }
  return false;
}
