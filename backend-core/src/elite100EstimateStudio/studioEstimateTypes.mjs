/**
 * Elite 100 Studio estimate — domain types (private estimator workflow).
 * Not Digital Estimate publication; not Quote Library.
 */

export const STUDIO_ESTIMATE_STATUSES = Object.freeze({
  DRAFT: "draft",
  NEEDS_TAKEOFF_APPROVAL: "needs_takeoff_approval",
  READY_TO_PRICE: "ready_to_price",
  PRICED: "priced",
  APPROVED: "approved",
  SUPERSEDED: "superseded"
});

export const STUDIO_ESTIMATE_STATUS_VALUES = Object.freeze(Object.values(STUDIO_ESTIMATE_STATUSES));

export const MATERIAL_GROUPS = Object.freeze([
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Remnant"
]);

export const PRICING_BASES = Object.freeze(["direct", "wholesale"]);

/** Known add-on keys that map to quoteCalculator PROTOTYPE_ADDON_UNIT_PRICES. */
export const STUDIO_SUPPORTED_ADDON_KEYS = Object.freeze([
  "qty-sink",
  "qty-bar",
  "qty-cook",
  "qty-outlet",
  "qty-ss",
  "qty-v-rect",
  "qty-v-oval",
  "tearout"
]);

/** Unresolved commercial items — may not be approved until removed/manual-reviewed. */
export const STUDIO_UNRESOLVED_ADDON_KEYS = Object.freeze([
  "qty-blanco",
  "waterfall_commercial",
  "qty-popup-outlet"
]);

export const ALLOWED_INTERNAL_MARKUP_PERCENTS = Object.freeze([0, 5, 8, 10, 12, 15, 20]);

/**
 * Generic sink product quantity keys retired from Pricing Setup entry
 * (products resolve via governed catalogs — sink/faucet/accessory/specialty).
 * Backend pricing still honors saved legacy quantities so older estimates
 * keep their totals; the UI only surfaces them as a legacy warning.
 */
export const RETIRED_GENERIC_PRODUCT_ADDON_KEYS = Object.freeze([
  "qty-ss",
  "qty-v-rect",
  "qty-v-oval"
]);

/** Edge scope provenance markers (see FEATURE_DECISIONS — finished edge geometry). */
export const EDGE_SCOPE_SOURCES = Object.freeze({
  /** @deprecated Retired: totalRun − backsplashEligible. Historical audit only. */
  DERIVED: "derived_open_edge_v1",
  /** Sum of estimator-approved per-piece finished-edge sections. */
  FINISHED_EDGE: "finished_edge_v2",
  /** Draft suggestions present; confirmation required before calculate (unless override). */
  CONFIRMATION_REQUIRED: "finished_edge_geometry_required",
  ADJUSTED: "estimator_adjusted_open_edge_v1",
  /** Absolute Pricing Setup finished-edge override (replaces Takeoff total). */
  OVERRIDE: "finished_edge_override_v1",
  MANUAL: "manual"
});

export function isStudioEstimateStatus(value) {
  return STUDIO_ESTIMATE_STATUS_VALUES.includes(String(value ?? ""));
}

export function emptyStudioEstimateScope() {
  return {
    customerName: "",
    projectName: "",
    projectAddress: "",
    partnerAccountId: null,
    // New Studio estimates default to Wholesale. Saved scopes keep their basis.
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    colorName: "",
    colorTbd: false,
    rooms: [],
    addOns: {},
    customLineItems: [],
    // Canonical edge profile token (studioEdgeAuthority). Legacy scopes may
    // still carry edgeMode included/w_edge/d_edge — normalized on read.
    edgeProfileToken: "edge_eased",
    edgeMode: "included",
    edgeLinearFeet: 0,
    // Governed estimator adjustments — reason required when non-zero, audited,
    // snapshotted, included in authoritative pricing (never customer-editable).
    countertopScopeAdjustments: [],
    edgeScopeAdjustment: null,
    // Absolute finished-edge LF override (Pricing Setup). Null/blank = use Takeoff.
    finishedEdgeOverride: null,
    // Which Digital Estimate catalogs the customer may use (estimator-set;
    // missing key = allowed). Enforcement lives in the publication/config flow.
    customerCatalogPermissions: {},
    miterHeightKey: null,
    miterLinearFeet: 0,
    buildupSqft: 0,
    estimatorNotes: "",
    internalMarkupPercent: 0,
    unresolvedManualReview: false
  };
}
