/**
 * Studio V2 Slice A — pure read-model helpers for working-draft shell.
 * No I/O. Reuses verified scope builders; never invents prices.
 */

import {
  buildCustomerSafePriceGroups,
  buildVerifiedRoomsFromEstimate
} from "./studioAiEstimatorSummary.mjs";
import { partitionEstimatorWarnings } from "./estimatorWarningSafety.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * @param {object|null|undefined} estimate
 * @returns {'ai_takeoff'|'manual'|'unknown'}
 */
export function resolveStudioV2OriginType(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const origin = str(scope.estimateOrigin || scope.physicalScopeSource).toLowerCase();
  if (
    origin === MANUAL_ESTIMATE_ORIGIN ||
    origin === "manual_staff" ||
    origin === "manual"
  ) {
    return "manual";
  }
  if (
    origin === "takeoff" ||
    origin === "email_ai_takeoff" ||
    origin === "ai_takeoff" ||
    Boolean(estimate?.takeoffJobId)
  ) {
    return "ai_takeoff";
  }
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  if (rooms.length > 0) return "unknown";
  return "unknown";
}

/**
 * True when V2 cannot operate on this origin without unavailable orchestration.
 * Empty AI takeoff scopes are no longer unsupported — Slice C provides explicit import.
 *
 * @param {object|null|undefined} estimate
 */
export function isStudioV2OriginUnsupported(estimate) {
  if (!estimate) return false;
  // Reserved for future truly unsupported shapes. Empty AI takeoff is importable via Slice C.
  void estimate;
  return false;
}

/**
 * Working Draft has a takeoff job but no rooms yet — import panel should lead.
 * @param {object|null|undefined} estimate
 */
export function needsStudioV2TakeoffImport(estimate) {
  if (!estimate?.takeoffJobId) return false;
  const scope = estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  return !rooms.some((r) => r && r.included !== false);
}

/**
 * Waterfall / vanity indicators from scope roomConfigurations + piece panels.
 * @param {object|null|undefined} estimate
 */
export function buildStudioV2ScopeIndicators(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const configs =
    scope.roomConfigurations && typeof scope.roomConfigurations === "object"
      ? scope.roomConfigurations
      : {};
  let vanityProgramRooms = 0;
  let waterfallPieces = 0;
  for (const cfg of Object.values(configs)) {
    if (cfg && typeof cfg === "object" && cfg.vanityProgram?.applyProgram === true) {
      vanityProgramRooms += 1;
    }
    if (Array.isArray(cfg?.waterfalls) && cfg.waterfalls.length) {
      waterfallPieces += cfg.waterfalls.length;
    }
  }
  for (const room of Array.isArray(scope.rooms) ? scope.rooms : []) {
    if (!room || room.included === false) continue;
    for (const piece of Array.isArray(room.pieces) ? room.pieces : []) {
      if (!piece || piece.included === false) continue;
      if (Array.isArray(piece.waterfallPanels) && piece.waterfallPanels.length) {
        waterfallPieces += piece.waterfallPanels.length;
      }
    }
  }
  return {
    vanityProgramRooms,
    waterfallIndicators: waterfallPieces,
    hasVanityProgram: vanityProgramRooms > 0,
    hasWaterfall: waterfallPieces > 0
  };
}

/**
 * @param {object|null|undefined} estimate
 */
export function buildStudioV2ScopeSummary(estimate) {
  if (!estimate) {
    return {
      empty: true,
      roomCount: 0,
      pieceCount: 0,
      measuredSf: null,
      billedSf: null,
      openings: {
        kitchenSink: 0,
        vanityBarSink: 0,
        cooktop: 0,
        outlet: 0,
        total: 0
      },
      rooms: [],
      indicators: {
        vanityProgramRooms: 0,
        waterfallIndicators: 0,
        hasVanityProgram: false,
        hasWaterfall: false
      }
    };
  }
  const rooms = buildVerifiedRoomsFromEstimate(estimate);
  const pieceCount = rooms.reduce((s, r) => s + (Array.isArray(r.pieces) ? r.pieces.length : 0), 0);
  const measuredSf = round2(rooms.reduce((s, r) => s + num(r.countertopSf) + num(r.backsplashSf), 0));
  const calc = estimate.calculation || estimate.calculationSnapshot || {};
  const billedSfRaw =
    calc.scopeBilling?.billableStoneSf ??
    calc.scopeBilling?.totalBillableStoneSf ??
    calc.reviewSummary?.totalBillableStoneSf ??
    null;
  const billedSf = billedSfRaw != null && Number.isFinite(Number(billedSfRaw)) ? round2(billedSfRaw) : null;
  const openings = rooms.reduce(
    (acc, r) => {
      const o = r.openingsByType || {};
      return {
        kitchenSink: acc.kitchenSink + num(o.kitchenSink),
        vanityBarSink: acc.vanityBarSink + num(o.vanityBarSink),
        cooktop: acc.cooktop + num(o.cooktop),
        outlet: acc.outlet + num(o.outlet)
      };
    },
    { kitchenSink: 0, vanityBarSink: 0, cooktop: 0, outlet: 0 }
  );
  openings.total =
    openings.kitchenSink + openings.vanityBarSink + openings.cooktop + openings.outlet;
  const empty = rooms.length === 0;
  return {
    empty,
    roomCount: rooms.length,
    pieceCount,
    measuredSf: empty ? null : measuredSf,
    billedSf,
    openings,
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      countertopSf: r.countertopSf,
      backsplashSf: r.backsplashSf,
      totalBillableStoneSf: r.totalBillableStoneSf,
      pieceCount: Array.isArray(r.pieces) ? r.pieces.length : 0,
      openingsByType: r.openingsByType || null
    })),
    indicators: buildStudioV2ScopeIndicators(estimate)
  };
}

/**
 * @param {object|null|undefined} estimate
 */
export function buildStudioV2ProjectHeader(estimate) {
  if (!estimate) {
    return {
      accountName: null,
      customerName: null,
      projectName: null,
      projectAddress: null,
      pricingBasis: null,
      materialGroup: null,
      estimateId: null,
      revision: null,
      status: null,
      originType: "unknown",
      currentTotal: null
    };
  }
  const scope = estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const snap =
    estimate.customerIdentitySnapshot && typeof estimate.customerIdentitySnapshot === "object"
      ? estimate.customerIdentitySnapshot
      : scope.customerIdentitySnapshot && typeof scope.customerIdentitySnapshot === "object"
        ? scope.customerIdentitySnapshot
        : {};
  const calc = estimate.calculation || estimate.calculationSnapshot || {};
  const totals = calc.totals && typeof calc.totals === "object" ? calc.totals : {};
  const currentTotal =
    totals.customerDisplayTotal != null
      ? num(totals.customerDisplayTotal)
      : estimate.approval?.customerDisplayTotal != null
        ? num(estimate.approval.customerDisplayTotal)
        : null;
  return {
    accountName: str(snap.accountName || snap.displayName) || null,
    customerName:
      str(scope.customerName || snap.customerName || snap.contactName) || null,
    projectName: str(scope.projectName) || null,
    projectAddress: str(scope.projectAddress) || null,
    pricingBasis: str(scope.pricingBasis) || null,
    materialGroup: str(scope.materialGroup) || null,
    estimateId: estimate.id ? String(estimate.id) : null,
    revision: Number(estimate.revision) || 1,
    status: str(estimate.status) || null,
    originType: resolveStudioV2OriginType(estimate),
    currentTotal: currentTotal != null && Number.isFinite(currentTotal) ? currentTotal : null
  };
}

/**
 * @param {object|null|undefined} estimate
 * @param {object|null|undefined} [calcOverride]
 */
export function buildStudioV2CalculationResult(estimate, calcOverride = null) {
  // Prefer full calculationSnapshot over staff-safe `calculation` views that omit
  // elite100 room fields (measured/billed SF, material rates). Safe views still
  // expose totals/reviewSummary but lack pricingBreakdown SF/rate inputs.
  const calc =
    calcOverride ||
    estimate?.calculationSnapshot ||
    estimate?.calculation ||
    null;
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  if (!calc || typeof calc !== "object") {
    return {
      available: false,
      total: null,
      customerSafeLinePreview: [],
      warnings: [],
      unresolvedItems: [],
      calculatedAt: null,
      pricingVersion: null,
      pricingBreakdown: buildStudioV2PricingBreakdown(estimate, null, scope)
    };
  }
  const totals = calc.totals && typeof calc.totals === "object" ? calc.totals : {};
  const warningsRaw = Array.isArray(calc.warnings) ? calc.warnings : [];
  const { estimatorWarnings } = partitionEstimatorWarnings(warningsRaw);
  const unresolved = Array.isArray(calc.unresolvedItems) ? calc.unresolvedItems : [];
  const estimateForGroups = calcOverride
    ? { ...estimate, calculation: calcOverride, calculationSnapshot: calcOverride }
    : estimate;
  return {
    available: true,
    total:
      totals.customerDisplayTotal != null
        ? num(totals.customerDisplayTotal)
        : totals.exactTotal != null
          ? num(totals.exactTotal)
          : null,
    customerSafeLinePreview: buildCustomerSafePriceGroups(estimateForGroups),
    warnings: estimatorWarnings.map((w) => ({
      code: str(w?.code) || null,
      message: str(w?.message || w) || "Warning"
    })),
    unresolvedItems: unresolved.map((u) => ({
      code: str(u?.code) || null,
      message: str(u?.message) || "Unresolved item"
    })),
    calculatedAt: calc.calculatedAt || null,
    pricingVersion: calc.pricingVersion ?? null,
    pricingBreakdown: buildStudioV2PricingBreakdown(estimate, calc, scope)
  };
}

/**
 * Read-only pricing display fields from existing calc/scope — no new math.
 * @param {object|null|undefined} estimate
 * @param {object} calc
 * @param {object} scope
 */
function buildStudioV2PricingBreakdown(estimate, calc, scope) {
  const safeCalc = calc && typeof calc === "object" ? calc : {};
  const review =
    safeCalc.reviewSummary && typeof safeCalc.reviewSummary === "object"
      ? safeCalc.reviewSummary
      : {};
  const billing =
    safeCalc.scopeBilling && typeof safeCalc.scopeBilling === "object"
      ? safeCalc.scopeBilling
      : {};
  const rooms = Array.isArray(safeCalc.elite100?.rooms) ? safeCalc.elite100.rooms : [];
  const scopeSummaryRooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];
  const firstRoom = rooms[0] || null;
  const rates = rooms
    .map((r) => Number(r?.materialRatePerSf))
    .filter((n) => Number.isFinite(n) && n > 0);
  const uniqueRates = [...new Set(rates.map((n) => Math.round(n * 100) / 100))];
  const measuredFromRooms = rooms.reduce(
    (s, r) => s + (Number(r?.measuredCountertopSf) || 0) + (Number(r?.backsplash?.measuredSf) || 0),
    0
  );
  const billedFromRooms = rooms.reduce(
    (s, r) => s + (Number(r?.billedCountertopSf) || 0),
    0
  );
  // Scope-derived measured SF is geometry, not invented pricing math.
  const measuredFromScope = scopeSummaryRooms.reduce((s, r) => {
    if (!r || r.included === false) return s;
    return s + (Number(r.countertopSf) || 0) + (Number(r.backsplashSf) || 0);
  }, 0);
  const billedFromBilling =
    billing.billableStoneSf ??
    billing.totalBillableStoneSf ??
    review.totalBillableStoneSf ??
    null;
  const hasPersistedCalc = Boolean(
    safeCalc.calculatedAt ||
      safeCalc.fingerprint ||
      safeCalc.elite100 ||
      safeCalc.reviewSummary ||
      (safeCalc.totals && typeof safeCalc.totals === "object" && Object.keys(safeCalc.totals).length)
  );
  const custom = Array.isArray(safeCalc.fabrication?.customLineItems)
    ? safeCalc.fabrication.customLineItems
    : Array.isArray(scope.customLineItems)
      ? scope.customLineItems
      : [];
  let customerFacingAdj = 0;
  let hiddenAdj = 0;
  for (const line of custom) {
    const role = String(line?.commercialRole || "").toLowerCase();
    const amount =
      line?.lineTotal != null
        ? Number(line.lineTotal)
        : (Number(line?.quantity) || 1) * (Number(line?.unitPrice) || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (role === "internal_only" || role === "absorbed") continue;
    if (
      role === "legacy_hidden_customer_charge" ||
      role === "customer_charge_hidden_detail" ||
      (line?.customerFacing === false && role !== "discount" && role !== "credit")
    ) {
      hiddenAdj += amount;
      continue;
    }
    if (
      line?.customerFacing === true ||
      role === "customer_charge" ||
      role === "discount" ||
      role === "credit"
    ) {
      customerFacingAdj += amount;
    }
  }
  // Selected pricing context always comes from Working Draft scope so stale
  // snapshots still show the estimator's current basis/group choice.
  const selectedPricingBasis = str(scope.pricingBasis) || null;
  const selectedPriceGroup = str(scope.materialGroup) || null;
  const calculatedPriceGroup =
    str(firstRoom?.materialGroup) ||
    (Array.isArray(review.countertopMaterialGroups) && review.countertopMaterialGroups[0]
      ? str(review.countertopMaterialGroups[0])
      : "") ||
    null;
  const measuredSf =
    measuredFromRooms > 0
      ? Math.round(measuredFromRooms * 100) / 100
      : hasPersistedCalc && measuredFromScope > 0
        ? Math.round(measuredFromScope * 100) / 100
        : null;
  const billedSf =
    billedFromRooms > 0
      ? Math.round(billedFromRooms * 100) / 100
      : hasPersistedCalc &&
          billedFromBilling != null &&
          Number.isFinite(Number(billedFromBilling))
        ? Math.round(Number(billedFromBilling) * 100) / 100
        : null;
  const hasCalculatedFields = hasPersistedCalc && Boolean(
    rooms.length > 0 ||
      review.countertopMaterialTotal != null ||
      uniqueRates.length > 0 ||
      Object.keys(safeCalc.totals || {}).length > 0
  );
  const totals =
    safeCalc.totals && typeof safeCalc.totals === "object" ? safeCalc.totals : {};
  const ewaDetail =
    totals.estimateWideAdjustment && typeof totals.estimateWideAdjustment === "object"
      ? totals.estimateWideAdjustment
      : null;
  const accountAdjRaw = totals.accountAdjustment;
  const estimateWideAdjustmentAmount =
    ewaDetail?.exactAdjustment != null && Number.isFinite(Number(ewaDetail.exactAdjustment))
      ? Number(ewaDetail.exactAdjustment)
      : accountAdjRaw != null && Number.isFinite(Number(accountAdjRaw))
        ? Number(accountAdjRaw)
        : null;
  const scopeAdj = scope.estimateWideAdjustment && typeof scope.estimateWideAdjustment === "object"
    ? scope.estimateWideAdjustment
    : null;
  return {
    pricingBasis: selectedPricingBasis || str(safeCalc.pricingBasis) || null,
    priceGroup: selectedPriceGroup || calculatedPriceGroup || null,
    selectedPricingBasis,
    selectedPriceGroup,
    materialRatePerSf: uniqueRates.length === 1 ? uniqueRates[0] : null,
    materialRatePerSfNote:
      uniqueRates.length > 1
        ? "Multiple rates across rooms"
        : uniqueRates.length === 0 && hasCalculatedFields
          ? null
          : null,
    measuredSf,
    billedSf,
    materialSubtotal:
      review.countertopMaterialTotal != null && Number.isFinite(Number(review.countertopMaterialTotal))
        ? Number(review.countertopMaterialTotal)
        : null,
    materialUseTax:
      review.materialTaxTotal != null && Number.isFinite(Number(review.materialTaxTotal))
        ? Number(review.materialTaxTotal)
        : null,
    customerFacingAdjustments: hasPersistedCalc
      ? Math.round(customerFacingAdj * 100) / 100
      : null,
    hiddenCustomerImpactingAdjustments: hasPersistedCalc
      ? Math.round(hiddenAdj * 100) / 100
      : null,
    estimateWideAdjustmentAmount:
      estimateWideAdjustmentAmount != null
        ? Math.round(estimateWideAdjustmentAmount * 100) / 100
        : null,
    estimateWideAdjustmentPercentage:
      ewaDetail?.percentage != null && Number.isFinite(Number(ewaDetail.percentage))
        ? Number(ewaDetail.percentage)
        : scopeAdj?.active
          ? Number(scopeAdj.percentage) || null
          : null,
    estimateWideAdjustmentReason:
      str(ewaDetail?.reason) || (scopeAdj?.active ? str(scopeAdj.reason) : null) || null,
    estimateWideAdjustmentSource:
      str(ewaDetail?.source) || (scopeAdj?.active ? str(scopeAdj.source) : null) || null,
    roomCount: rooms.length || scopeSummaryRooms.length || 0,
    calculatedFieldsAvailable: hasCalculatedFields
  };
}

/**
 * Editable statuses where persisting a calculation matches V1 calculate writes
 * without forking or scope mutation.
 */
export function isStudioV2CalculationPersistable(status) {
  const s = String(status || "").toLowerCase();
  return (
    s === "draft" ||
    s === "ready_to_price" ||
    s === "priced" ||
    s === "needs_takeoff_approval"
  );
}
