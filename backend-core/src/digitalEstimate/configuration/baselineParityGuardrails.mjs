/**
 * Digital Estimate — customer pricing authority + safety guardrails.
 *
 * Contract:
 * - Permitted customer selections (material, edge, eligible backsplash, products)
 *   are live-priced by backend Pricing Engine V4 (config-delta).
 * - True physical scope-change requests require Elite review and do not silently
 *   mutate approved geometry.
 * - If a calculated public result is incomplete/unsafe (e.g. $0 countertop when
 *   the published estimate had material), freeze to published baseline rather
 *   than showing a wrong total.
 *
 * Does not change calculator formulas/rates. Does not mutate approved Studio
 * estimates or quote_publication_snapshots from customer saves.
 */

export const CUSTOMER_PRICING_AUTHORITY = Object.freeze({
  /** Incomplete/unsafe calc — public totals frozen to published baseline. */
  PUBLISHED_BASELINE_FROZEN: "published_baseline_frozen",
  /** Backend config-delta / V4 selection reprice is authoritative. */
  AUTHORITATIVE_BACKEND_REPRICE: "authoritative_backend_reprice"
});

export const CUSTOMER_PRICING_STATUS = Object.freeze({
  /** No priced selection drift from published baseline. */
  BASELINE: "baseline",
  /** Permitted selections live-priced; not a scope review. */
  PRICED_SELECTION: "priced_selection",
  /** Physical scope change requested — Elite review required. */
  SCOPE_REVIEW_REQUIRED: "scope_review_required",
  /** @deprecated Prefer SCOPE_REVIEW_REQUIRED; kept for older clients. */
  PENDING_ESTIMATOR_REVIEW: "pending_estimator_review"
});

export const BASELINE_PARITY_NOTICES = Object.freeze({
  // Fail-closed (unsafe calc / missing rate) — customer-friendly, non-technical copy.
  PRICE_UPDATE_REVIEW:
    "This selection needs Elite review before the estimate can update.",
  ESTIMATOR_WILL_REVIEW: "Elite will review this before final approval.",
  NEEDS_ELITE_REVIEW: "Needs Elite review",
  EDGE_REVIEW:
    "Edge profile is included in your priced estimate.",
  CHANGES_NEED_REVIEW: "Needs Elite review",
  REQUESTED_CHANGE: "Requested change",
  FINAL_APPROVAL_UNAVAILABLE:
    "Final approval will be available after Elite review.",
  CHANGES_SAVED: "Changes saved"
});

/**
 * Permitted customer selections are live-priced by the backend config-delta engine.
 * Flip off only if production must emergency-freeze to published baseline again.
 * @returns {boolean}
 */
export function isCustomerRepricingAuthoritative() {
  return true;
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
    num(calc?.publishedBaselineTotal) ??
    null
  );
}

/**
 * Resolve the customer-facing priced selection total (backend-owned).
 * @param {object|null|undefined} calc
 */
export function resolvePricedSelectionTotal(calc) {
  return (
    num(calc?.pricedSelectionTotal) ??
    num(calc?.configuredDisplayTotal) ??
    (calc?.configuredDisplayTotalCents != null
      ? num(calc.configuredDisplayTotalCents) / 100
      : null) ??
    num(calc?.totals?.configuredDisplayTotal) ??
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
  const configured = resolvePricedSelectionTotal(calc);
  if (configured == null) return false;
  return Math.abs(configured - baseline) >= 0.005;
}

function normalizeRoomToken(v) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Find the customer-priced room that corresponds to a published room.
 *
 * IMPORTANT: the real public room pricing DTO (see toPublicRoom in
 * customerRoomPricingProjection.mjs) never includes a roomKey/roomId field —
 * only roomName. A naive `roomKey === roomKey` fallback where both sides are
 * missing the field (`"" === ""`) is trivially true and would silently pin
 * *every* published room onto whichever calc room happens to be first in the
 * array, so a room that isn't first can lose countertop/material scope with
 * no guardrail ever inspecting it. Only trust a roomKey match when at least
 * one side actually carries a non-empty key; otherwise match by room name.
 * @param {object} pub
 * @param {object[]} calcRooms
 */
function findMatchingCalcRoom(pub, calcRooms) {
  const pubKey = normalizeRoomToken(pub?.roomKey ?? pub?.roomId);
  if (pubKey) {
    const byKey = calcRooms.find((r) => normalizeRoomToken(r?.roomKey ?? r?.roomId) === pubKey);
    if (byKey) return byKey;
  }
  const pubName = normalizeRoomToken(pub?.roomName ?? pub?.roomLabel);
  if (pubName) {
    const byName = calcRooms.find((r) => normalizeRoomToken(r?.roomName ?? r?.roomLabel) === pubName);
    if (byName) return byName;
  }
  return null;
}

/**
 * Detect incomplete/unsafe public room pricing (e.g. $0 countertop after material change).
 * @param {object|null|undefined} calc
 * @param {object|null|undefined} publishedRoomPricingPublic
 */
export function isUnsafeCustomerFacingCalc(calc, publishedRoomPricingPublic = null) {
  if (!calc || typeof calc !== "object") return true;
  const priced = resolvePricedSelectionTotal(calc);
  const baseline = resolvePublishedBaselineTotal(calc);
  if (baseline != null && baseline > 0 && (priced == null || !(priced > 0))) {
    return true;
  }

  const publishedRooms = Array.isArray(publishedRoomPricingPublic?.rooms)
    ? publishedRoomPricingPublic.rooms
    : [];
  const calcRooms = Array.isArray(calc?.roomPricing?.rooms) ? calc.roomPricing.rooms : [];
  if (!publishedRooms.length || !calcRooms.length) return false;

  let publishedCountertopTotal = 0;
  for (const pub of publishedRooms) {
    const pubCt = num(pub?.countertopAmount);
    const pubMaterial = String(pub?.selectedMaterial || "").trim();
    if (pubCt != null && pubCt > 0) publishedCountertopTotal += pubCt;
    // A room only needs protecting when the *published* side shows it actually
    // had countertop scope — either a positive dollar figure, or (legacy
    // publications with no per-room dollar snapshot — see
    // buildLegacyOriginalRoomPricingProjection, which reports
    // countertopAmount: null and can never invent one) a recorded material
    // selection, which only exists on a room that has a countertop.
    const publishedHadCountertopOrMaterial = (pubCt != null && pubCt > 0) || pubMaterial.length > 0;
    if (!publishedHadCountertopOrMaterial) continue;

    const match = findMatchingCalcRoom(pub, calcRooms);
    // Published room had countertop/material scope but no corresponding room
    // survived into the customer-priced result at all — never silently drop it.
    if (!match) return true;

    const ct = num(match.countertopAmount);
    // Published had countertop/material scope; updated shows $0/missing —
    // classic incomplete reprice failure. A material/color change can never
    // make countertop disappear.
    if (ct == null || ct <= 0.005) return true;

    const matchMaterial = String(match?.selectedMaterial || "").trim();
    // Published room had a recorded material and the updated room dropped it
    // entirely (not changed to a different material — just gone).
    if (pubMaterial && !matchMaterial) return true;
  }

  // Fallback: even if every individual room matched safely above, a
  // project-wide countertop total that collapsed to ~$0 while the published
  // baseline had real countertop dollars is never safe to show — catches any
  // residual room-matching/naming drift that slips past the per-room check.
  if (publishedCountertopTotal > 0.005) {
    const calcCountertopTotal = calcRooms.reduce((s, r) => s + (num(r?.countertopAmount) || 0), 0);
    if (calcCountertopTotal <= 0.005) return true;
  }

  return false;
}

/**
 * Customer-safe edge option display for public Digital Estimate.
 * Preserves backend-calculated display amounts. Does not own estimate totals.
 *
 * @param {object} publicOpt
 * @returns {object}
 */
export function applyEdgeOptionPriceGuardrail(publicOpt) {
  if (!publicOpt || typeof publicOpt !== "object") return publicOpt;
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

  if (hasAuthoritativeCents) {
    next.priceEffectCents = Math.trunc(centsRaw);
    if (next.visibleDelta == null && treatment === "delta") {
      next.visibleDelta = next.priceEffectCents / 100;
    }
  }

  // Published baseline edge — keep premium context when applicable.
  if (
    Boolean(publicOpt.includedInBaseline) ||
    treatment === "original_selection" ||
    publicOpt.priceEffectLabel === "Original selection"
  ) {
    next.customerPriceTreatment = "original_selection";
    next.priceEffectLabel =
      publicOpt.premium === true
        ? "Included in published estimate"
        : "Included in published estimate";
    // Keep display cents for premium baseline rows so they don't look "free".
    if (publicOpt.premium === true && hasAuthoritativeCents && centsRaw > 0) {
      next.priceEffectCents = Math.trunc(centsRaw);
      next.visibleDelta = next.priceEffectCents / 100;
    } else {
      next.priceEffectCents = 0;
      next.visibleDelta = 0;
    }
    next.selectable = true;
    return next;
  }

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
 * Apply edge display guardrail across an options array (public state).
 * @param {object[]|null|undefined} options
 */
export function applyEdgeOptionPriceGuardrails(options) {
  if (!Array.isArray(options)) return options;
  return options.map((o) => {
    const key = String(o?.optionKey || "");
    if (!key.startsWith("edge:")) return o;
    return applyEdgeOptionPriceGuardrail(o);
  });
}

/**
 * Annotate / guard customer-facing calculation for public Digital Estimate.
 *
 * When selection reprice is authoritative and the calc is safe: keep V4 totals.
 * When unsafe: freeze to published baseline (parity fail-closed).
 * Scope-review requests set scopeReviewRequired without freezing selection totals
 * unless the calc itself is unsafe.
 *
 * @param {object|null|undefined} calc
 * @param {{
 *   baselineDisplayTotal?: number|null,
 *   publishedRoomPricingPublic?: object|null,
 *   scopeReviewRequired?: boolean,
 *   hasPendingPriceAffectingChanges?: boolean,
 *   forceFreeze?: boolean
 * }} [opts]
 */
export function applyBaselineParityToCustomerCalculation(calc, opts = {}) {
  if (!calc || typeof calc !== "object") return calc;

  const baseline = resolvePublishedBaselineTotal(calc, opts);
  // Only true physical scope requests — never normal material/edge selection drift.
  const scopeReviewRequired = Boolean(
    opts.scopeReviewRequired ||
      calc?.scopeReviewRequired ||
      calc?.customerConfiguration?.requiresEstimatorReview
  );

  // Sticky fail-closed: once a calc has been frozen, re-guarding it (e.g. on a
  // page reload reading a persisted result) must not reclassify it as safe —
  // freezing already resets totals/rooms to match the baseline, so the unsafe
  // check alone can no longer see the original problem on a second pass.
  const previouslyFrozen =
    calc?.pricingAuthority === CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN;

  const unsafe =
    previouslyFrozen ||
    Boolean(opts.forceFreeze) ||
    isUnsafeCustomerFacingCalc(calc, opts.publishedRoomPricingPublic);

  if (isCustomerRepricingAuthoritative() && !unsafe) {
    const priced = resolvePricedSelectionTotal(calc);
    const diverged = publicCalcDivergesFromBaseline(
      { ...calc, pricedSelectionTotal: priced, configuredDisplayTotal: priced },
      baseline
    );
    /** @type {Record<string, unknown>} */
    const next = {
      ...calc,
      pricingAuthority: CUSTOMER_PRICING_AUTHORITY.AUTHORITATIVE_BACKEND_REPRICE,
      publishedBaselineTotal: baseline,
      pricedSelectionTotal: priced,
      scopeReviewRequired,
      canSubmitForFinalReview: false,
      customerPricingStatus: scopeReviewRequired
        ? CUSTOMER_PRICING_STATUS.SCOPE_REVIEW_REQUIRED
        : diverged
          ? CUSTOMER_PRICING_STATUS.PRICED_SELECTION
          : CUSTOMER_PRICING_STATUS.BASELINE,
      customerPricingNotice: scopeReviewRequired
        ? BASELINE_PARITY_NOTICES.NEEDS_ELITE_REVIEW
        : null
    };
    if (baseline != null) {
      next.baselineDisplayTotal = baseline;
    }
    if (priced != null) {
      next.configuredDisplayTotal = priced;
      next.displayTotalDelta =
        baseline != null ? Math.round((priced - baseline) * 100) / 100 : num(calc.displayTotalDelta);
      next.displayDelta = next.displayTotalDelta;
    }
    if (next.customerConfiguration && typeof next.customerConfiguration === "object") {
      next.customerConfiguration = {
        ...next.customerConfiguration,
        canSubmitForFinalReview: false,
        approvedBaselinePreserved: true,
        requiresEstimatorReview: scopeReviewRequired
      };
    }
    return next;
  }

  // Fail-closed freeze path (unsafe calc or emergency authoritative=false).
  const pending = scopeReviewRequired;
  /** @type {Record<string, unknown>} */
  const next = { ...calc };
  if (baseline != null) {
    next.baselineDisplayTotal = baseline;
    next.configuredDisplayTotal = baseline;
    next.pricedSelectionTotal = baseline;
    next.publishedBaselineTotal = baseline;
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
  next.scopeReviewRequired = pending;
  next.customerPricingStatus = pending
    ? CUSTOMER_PRICING_STATUS.SCOPE_REVIEW_REQUIRED
    : CUSTOMER_PRICING_STATUS.BASELINE;
  next.customerPricingNotice = pending
    ? BASELINE_PARITY_NOTICES.NEEDS_ELITE_REVIEW
    : unsafe
      ? BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW
      : null;
  next.canSubmitForFinalReview = false;

  if (opts.publishedRoomPricingPublic && typeof opts.publishedRoomPricingPublic === "object") {
    next.roomPricing = opts.publishedRoomPricingPublic;
    next.roomPricingChanges = {
      kind: "changes",
      rows: [],
      totalDelta: 0,
      pendingReview: pending,
      notice: pending ? BASELINE_PARITY_NOTICES.NEEDS_ELITE_REVIEW : null
    };
  }

  const messages = Array.isArray(next.reviewRequiredMessages)
    ? [...next.reviewRequiredMessages]
    : [];
  if (pending || unsafe) {
    const notice = pending
      ? BASELINE_PARITY_NOTICES.NEEDS_ELITE_REVIEW
      : BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW;
    if (!messages.includes(notice)) messages.push(notice);
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

/**
 * True when quantities imply a physical scope-style request (not a priced selection).
 * Waterfall requests are treated as scope until a safe priced model exists.
 * @param {Record<string, number>|null|undefined} quantities
 */
export function hasScopeChangeCustomerSelections(quantities) {
  for (const [key, qty] of Object.entries(quantities || {})) {
    if (!(Number(qty) > 0)) continue;
    const k = String(key);
    if (k.startsWith("waterfall:") || k.startsWith("qty-") || k.includes(":opening:")) {
      return true;
    }
  }
  return false;
}
