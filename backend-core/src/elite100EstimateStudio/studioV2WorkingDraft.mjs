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
  const calc =
    calcOverride ||
    estimate?.calculation ||
    estimate?.calculationSnapshot ||
    null;
  if (!calc || typeof calc !== "object") {
    return {
      available: false,
      total: null,
      customerSafeLinePreview: [],
      warnings: [],
      unresolvedItems: [],
      calculatedAt: null,
      pricingVersion: null
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
    pricingVersion: calc.pricingVersion ?? null
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
