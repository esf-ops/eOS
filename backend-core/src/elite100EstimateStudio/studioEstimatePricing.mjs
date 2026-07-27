/**
 * Studio estimate pricing — reuses quoteCalculator + trusted account overlays.
 */
import { createHash } from "node:crypto";
import {
  calculateQuote,
  PROTOTYPE_ADDON_UNIT_PRICES,
  UPGRADED_EDGE_RATE_DIRECT_V2,
  UPGRADED_EDGE_RATE_WHOLESALE_V2
} from "../quotes/quoteCalculator.js";
import {
  ALLOWED_INTERNAL_MARKUP_PERCENTS,
  MATERIAL_GROUPS,
  STUDIO_SUPPORTED_ADDON_KEYS,
  STUDIO_UNRESOLVED_ADDON_KEYS
} from "./studioEstimateTypes.mjs";
import {
  canApplyInternalMarkup,
  isSpahnTrustedPartner,
  isWattsTrustedPartner,
  readTrustedPartnerAccountConfig,
  resolveStudioMaterialRatePerSf,
  SPAHN_ESTIMATE_ADJUSTMENT_PERCENT,
  WATTS_PROMO_RATE_PER_SF
} from "./studioEstimateTrustedAccounts.mjs";
import { chargeableBacksplashForPricing } from "./studioRoomBacksplash.mjs";
import {
  billableBacksplashFromRoom,
  billableCountertopFromRoom
} from "../quotes/billableSquareFeet.mjs";
import {
  buildStudioScopeBilling,
  collectScopeAdjustmentIssues,
  normalizeEdgeScopeAdjustment,
  resolveScopeEdgeLinearFeet
} from "./studioScopeBilling.mjs";
import {
  isPremiumEdgeProfile,
  normalizeEdgeProfileToken,
  edgeProfileDisplayLabel,
  resolveEdgeProfileDefinition,
  resolvePremiumEdgeRatePerLf
} from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";
import {
  STUDIO_COMMERCIAL_LINE_MODEL_VERSION,
  calculateCommercialLineTotals,
  normalizeStudioCommercialLines
} from "./studioCommercialLines.mjs";
import {
  computeInheritedMaterialPricing,
  resolveRoomMaterialGroup
} from "./studioMaterialInheritance.mjs";

/** D-edge / Dupont-style specialty — product brief $25/LF (matches Direct upgraded edge). */
export const STUDIO_D_EDGE_RATE_PER_LF = UPGRADED_EDGE_RATE_DIRECT_V2;

/**
 * Resolve W-edge $/LF from calculator authority (not a flat $15 across bases).
 * Wholesale $15 / Direct $25 — mirrors quoteCalculator UPGRADED_EDGE_RATE_*_V2.
 */
export function resolveStudioWEdgeRatePerLf(pricingBasis) {
  return pricingBasis === "wholesale"
    ? UPGRADED_EDGE_RATE_WHOLESALE_V2
    : UPGRADED_EDGE_RATE_DIRECT_V2;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Billed-scope reconciliation invariant: the billed countertop SF shown to the
 * estimator (Pricing Setup summary, buildStudioScopeBilling) and the billed
 * countertop SF actually priced must be identical. A mismatch means duplicate
 * or stale scope authority entered the calculation — fail loudly rather than
 * return a misleading customer total.
 *
 * @param {number} displayedBilledCountertopSf
 * @param {number} pricedBilledCountertopSf
 */
export function assertBilledCountertopScopeReconciles(
  displayedBilledCountertopSf,
  pricedBilledCountertopSf
) {
  const displayed = round2(displayedBilledCountertopSf);
  const priced = round2(pricedBilledCountertopSf);
  if (displayed !== priced) {
    const err = new Error(
      `Billed countertop scope mismatch: displayed ${displayed} SF vs priced ${priced} SF`
    );
    err.statusCode = 422;
    err.code = "billed_scope_mismatch";
    err.details = {
      diagnosticCode: "STUDIO-BILLED-SCOPE-MISMATCH",
      displayedBilledCountertopSf: displayed,
      pricedBilledCountertopSf: priced
    };
    throw err;
  }
}

/**
 * @param {object} scope
 * @param {{ actorUserId?: string|null, env?: NodeJS.ProcessEnv }} [opts]
 */
export function assertScopeAuthority(scope, opts = {}) {
  const cfg = readTrustedPartnerAccountConfig(opts.env);
  const markup = Number(scope?.internalMarkupPercent ?? 0);
  if (markup && !ALLOWED_INTERNAL_MARKUP_PERCENTS.includes(markup)) {
    const err = new Error("Internal markup percent is not allowed");
    err.statusCode = 400;
    err.code = "markup_not_allowed";
    throw err;
  }
  if (markup > 0 && !canApplyInternalMarkup(opts.actorUserId, cfg)) {
    const err = new Error("Not authorized to apply internal material markup");
    err.statusCode = 403;
    err.code = "markup_forbidden";
    throw err;
  }
  const group = String(scope?.materialGroup ?? "").trim();
  if (group && !MATERIAL_GROUPS.includes(group)) {
    const err = new Error("Unknown material group");
    err.statusCode = 400;
    err.code = "invalid_material_group";
    throw err;
  }
  for (const room of Array.isArray(scope?.rooms) ? scope.rooms : []) {
    const ov = room?.materialGroupOverride;
    if (ov != null && String(ov).trim() && !MATERIAL_GROUPS.includes(String(ov).trim())) {
      const err = new Error("Unknown room material group override");
      err.statusCode = 400;
      err.code = "invalid_material_group";
      throw err;
    }
    for (const piece of Array.isArray(room?.pieces) ? room.pieces : []) {
      if (!piece?.materialOverride) continue;
      const pg = String(piece?.materialGroup ?? "").trim();
      if (pg && !MATERIAL_GROUPS.includes(pg)) {
        const err = new Error("Unknown piece material group override");
        err.statusCode = 400;
        err.code = "invalid_material_group";
        throw err;
      }
    }
  }
  // Governed estimator scope adjustments are audited pricing inputs — a
  // non-zero adjustment without a reason is not a valid pricing request.
  const adjustmentIssues = collectScopeAdjustmentIssues(scope);
  if (adjustmentIssues.length) {
    const err = new Error(adjustmentIssues[0].message);
    err.statusCode = 400;
    err.code = "adjustment_reason_required";
    err.details = adjustmentIssues;
    throw err;
  }
}

/**
 * Collect unresolved commercial selections that block approval.
 * @param {object} scope
 */
export function collectUnresolvedItems(scope) {
  /** @type {Array<{ code: string, message: string }>} */
  const items = [];
  const addOns = scope?.addOns && typeof scope.addOns === "object" ? scope.addOns : {};
  for (const key of STUDIO_UNRESOLVED_ADDON_KEYS) {
    if (Number(addOns[key] ?? 0) > 0) {
      items.push({
        code: key,
        message:
          key === "qty-blanco"
            ? "Blanco sink pricing is unresolved (450 vs 495). Remove or mark manual review."
            : key === "waterfall_commercial"
              ? "Waterfall commercial pricing is unresolved. Remove or mark manual review."
              : "Pop-up outlet cutout is not established calculator authority."
      });
    }
  }
  if (String(scope?.edgeMode ?? "") === "waterfall") {
    items.push({
      code: "waterfall_commercial",
      message: "Waterfall commercial pricing is unresolved. Remove or mark manual review."
    });
  }
  return items;
}

/**
 * Build calculateQuote rooms input from studio scope (sqft-first commercial corrections).
 * @param {object} scope
 */
export function scopeToCalculatorRooms(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  // Section-billing authority (measured/billed + governed estimator
  // adjustments as independent sections) — single source with the UI summary.
  const scopeBilling = buildStudioScopeBilling(scope);
  const billingByRoomId = new Map(scopeBilling.rooms.map((row) => [row.roomId, row]));
  return rooms
    .filter((r) => r && r.included !== false)
    .map((r, idx) => {
      const pieces = Array.isArray(r.pieces)
        ? r.pieces.filter((p) => p && p.included !== false)
        : [];
      // Preserve raw measured geometry on pieces; billable SF uses section ceiling.
      const counterBilled = billableCountertopFromRoom({
        countertopSqft: r.countertopSqft,
        pieces: pieces.filter(
          (p) => String(p.pieceType ?? "").toLowerCase() !== "backsplash"
        )
      });
      const billingRow = billingByRoomId.get(String(r.id ?? ""));
      let backsplashRaw = Number(r.backsplashSqft);
      if (!Number.isFinite(backsplashRaw) || backsplashRaw < 0) {
        backsplashRaw = pieces
          .filter((p) => String(p.pieceType ?? "").toLowerCase().includes("backsplash"))
          .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
      }
      const splashPolicy = chargeableBacksplashForPricing({
        ...r,
        backsplashSqft: backsplashRaw
      });
      const splashBilled = billableBacksplashFromRoom({
        includeBacksplash: splashPolicy.backsplashSqft > 0,
        backsplashSqft: splashPolicy.backsplashSqft,
        backsplashSections: r.backsplashSections
      });
      const countertopSqft = billingRow
        ? billingRow.billedWithAdjustmentsSf
        : counterBilled.billableSf;
      const backsplashSqft = splashBilled.billableSf;
      return {
        id: r.id || `room-${idx}`,
        name: r.name || `Room ${idx + 1}`,
        roomType: r.roomType || "Kitchen",
        calcMode: "Direct SF",
        countertopSqft,
        backsplashSqft,
        rawCountertopSqft: counterBilled.rawSf,
        rawBacksplashSqft: splashBilled.rawSf,
        backsplashHeightIn: splashPolicy.backsplashHeightIn,
        materialGroup: resolveRoomMaterialGroup(scope, r).group,
        notes: r.notes || "",
        addons: {},
        pieces: pieces.map((p) => ({
          id: p.id,
          name: p.name,
          pieceType: p.pieceType,
          lengthIn: p.lengthIn,
          depthIn: p.depthIn,
          sqft: p.sqft,
          billableSqft: ceilPiece(p),
          included: p.included !== false,
          notes: p.notes || "",
          materialOverride: Boolean(p.materialOverride),
          materialGroup: p.materialGroup || undefined
        }))
      };
    });
}

function ceilPiece(p) {
  return billableCountertopFromRoom({
    pieces: [{ ...p, included: true }]
  }).billableSf;
}

/**
 * @param {object} scope
 */
export function scopeToAddOns(scope) {
  const out = {};
  const addOns = scope?.addOns && typeof scope.addOns === "object" ? scope.addOns : {};
  for (const key of STUDIO_SUPPORTED_ADDON_KEYS) {
    const qty = Math.max(0, Math.floor(Number(addOns[key] ?? 0) || 0));
    if (qty > 0) out[key] = qty;
  }
  return out;
}

/**
 * Deterministic calculation for a studio estimate scope.
 * Uses calculateQuote for rooms + add-ons, then applies trusted account overlays.
 *
 * @param {{
 *   scope: object,
 *   actorUserId?: string|null,
 *   env?: NodeJS.ProcessEnv,
 *   calculateQuoteImpl?: typeof calculateQuote
 * }} params
 */
export async function calculateStudioEstimate(params) {
  const scope = params.scope || {};
  const env = params.env ?? process.env;
  assertScopeAuthority(scope, { actorUserId: params.actorUserId, env });

  const unresolved = collectUnresolvedItems(scope);
  const warnings = [];
  if (scope.colorTbd) {
    warnings.push({ code: "color_tbd", message: "Color TBD — material group pricing applies without exact color." });
  }
  for (const u of unresolved) warnings.push(u);

  const rooms = scopeToCalculatorRooms(scope);
  const addOns = scopeToAddOns(scope);
  const pricingBasis = scope.pricingBasis === "wholesale" ? "wholesale" : "direct";
  const commercialLinesNormalized = normalizeStudioCommercialLines(scope);

  const calcImpl = params.calculateQuoteImpl || calculateQuote;
  const quoteResult = await calcImpl(
    {
      quoteSource: "internal_quote",
      engine: "rooms",
      materialProgramDefault: "elite_100",
      materialGroup: scope.materialGroup || "Group Promo",
      internalMaterialBasis: pricingBasis === "wholesale" ? "wholesale" : "direct",
      rooms,
      addOns,
      // Parity path: pass signed unit prices; authoritative totals computed below.
      customLineItems: commercialLinesNormalized.map((r) => ({
        name: r.name,
        description: r.description,
        category: r.category,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        customerFacing: r.customerFacing,
        roomId: r.roomId,
        roomName: r.roomName,
        lineKey: r.lineKey
      })),
      partnerAccountId: null,
      useTaxPercent: 0
    },
    { db: null }
  );

  if (!quoteResult?.ok) {
    const err = new Error(quoteResult?.error || "Calculation failed");
    err.statusCode = 422;
    err.code = "calculation_failed";
    throw err;
  }

  // Recompute material with inheritance (estimate → room → piece).
  const scopeBilling = buildStudioScopeBilling(scope);
  const inherited = computeInheritedMaterialPricing({
    scope,
    pricingBasis,
    partnerAccountId: scope.partnerAccountId,
    env,
    projectAdjustmentBilledSf: scopeBilling.projectAdjustmentBilledSf,
    scopeBillingRooms: scopeBilling.rooms
  });

  const chargeableCounter = inherited.chargeableCounter;
  const chargeableSplash = inherited.chargeableSplash;

  const hasPieceMaterialOverride = (Array.isArray(scope.rooms) ? scope.rooms : []).some(
    (r) =>
      r &&
      r.included !== false &&
      Array.isArray(r.pieces) &&
      r.pieces.some(
        (p) => p && p.included !== false && Boolean(p.materialOverride ?? p.material_override)
      )
  );
  // Section-billing reconciliation holds for room-level material pricing.
  // Piece-level overrides price piece SF directly (may differ from room section ceil).
  if (!hasPieceMaterialOverride) {
    assertBilledCountertopScopeReconciles(scopeBilling.billedCountertopSf, chargeableCounter);
  }

  const materialRate = inherited.primaryRate;
  const materialSf = inherited.materialSf;
  const materialCountertopSubtotal = inherited.materialCountertopSubtotal;
  const materialBacksplashSubtotal = inherited.materialBacksplashSubtotal;
  const materialSubtotal = inherited.materialSubtotal;
  const materialUseTax = inherited.materialUseTax;
  const materialSections = [...inherited.sections];

  let fabricationSubtotal = 0;
  for (const [key, qty] of Object.entries(addOns)) {
    const unit = PROTOTYPE_ADDON_UNIT_PRICES[key];
    if (unit) fabricationSubtotal = round2(fabricationSubtotal + unit.price * Number(qty));
  }

  // Edge from approved calculator rates only.
  //  - Canonical profiles (studioEdgeAuthority): free tier $0; premium tier
  //    priced per LF by pricing basis (wholesale $15 / direct $25 — the same
  //    rates the Digital Estimate premium-edge path uses).
  //  - Legacy scopes without an explicit edgeProfileToken keep the historical
  //    W/D branch exactly so previously priced estimates do not shift.
  const edgeMode = String(scope.edgeMode ?? "included");
  const edgeLf = Math.max(0, Number(scope.edgeLinearFeet) || 0);
  const explicitEdgeProfile = scope.edgeProfileToken
    ? resolveEdgeProfileDefinition(scope.edgeProfileToken)
    : null;
  const edgeScope = resolveScopeEdgeLinearFeet(scope);
  let edgeSummary;
  if (explicitEdgeProfile) {
    const premium = isPremiumEdgeProfile(explicitEdgeProfile.optionToken);
    const ratePerLf = premium ? resolvePremiumEdgeRatePerLf(pricingBasis) : 0;
    const pricedLf = premium ? edgeScope.finalLf : 0;
    const amount = premium ? round2(pricedLf * ratePerLf) : 0;
    if (amount > 0) fabricationSubtotal = round2(fabricationSubtotal + amount);
    edgeSummary = {
      profileToken: explicitEdgeProfile.optionToken,
      profileLabel: edgeProfileDisplayLabel(explicitEdgeProfile.optionToken),
      tier: explicitEdgeProfile.tier,
      derivedLf: edgeScope.derivedLf,
      adjustmentLf: edgeScope.adjustmentLf,
      finalLf: edgeScope.finalLf,
      pricedLf,
      ratePerLf,
      amount,
      source: edgeScope.source
    };
  } else {
    // Legacy pricing branch — unchanged W/D behavior for saved scopes.
    let amount = 0;
    if (edgeMode === "w_edge" && edgeLf > 0) {
      amount = round2(edgeLf * resolveStudioWEdgeRatePerLf(pricingBasis));
    } else if (edgeMode === "d_edge" && edgeLf > 0) {
      amount = round2(edgeLf * STUDIO_D_EDGE_RATE_PER_LF);
    }
    if (amount > 0) fabricationSubtotal = round2(fabricationSubtotal + amount);
    edgeSummary = {
      profileToken: normalizeEdgeProfileToken(edgeMode),
      profileLabel: edgeProfileDisplayLabel(edgeMode),
      tier: edgeMode === "w_edge" || edgeMode === "d_edge" ? "premium" : "free",
      derivedLf: edgeLf,
      adjustmentLf: 0,
      finalLf: edgeLf,
      pricedLf: amount > 0 ? edgeLf : 0,
      ratePerLf:
        edgeMode === "w_edge"
          ? resolveStudioWEdgeRatePerLf(pricingBasis)
          : edgeMode === "d_edge"
            ? STUDIO_D_EDGE_RATE_PER_LF
            : 0,
      amount,
      source: "legacy_edge_mode"
    };
  }
  const miterLf = Math.max(0, Number(scope.miterLinearFeet) || 0);
  const miterKey = String(scope.miterHeightKey ?? "");
  const miterRates = { "2-3in": 65, "4in": 70, "5in": 75, "6in": 80 };
  if (miterLf > 0 && miterRates[miterKey] != null) {
    fabricationSubtotal = round2(fabricationSubtotal + miterLf * miterRates[miterKey]);
  }
  const buildup = Math.max(0, Number(scope.buildupSqft) || 0);
  if (buildup > 0) {
    fabricationSubtotal = round2(fabricationSubtotal + buildup * 20);
  }

  // Percent discounts apply against material + fabrication (addons/edge/miter/buildup)
  // before commercial lines — not against tax or account overlays.
  const percentBase = round2(materialSubtotal + materialUseTax + fabricationSubtotal);
  const commercial = calculateCommercialLineTotals(commercialLinesNormalized, percentBase);
  const customLineItems = commercial.lines;

  const customLineItemsCustomerVisibleTotal = commercial.customerVisibleTotal;
  const customLineItemsInternalOnlyTotal = round2(
    commercial.internalOnlyTotal + commercial.legacyHiddenCustomerTotal
  );
  const customLineItemsAbsorbedTotal = commercial.absorbedTotal;
  const customLineItemsTotal = commercial.fabricationCustomTotal;
  fabricationSubtotal = round2(fabricationSubtotal + customLineItemsTotal);

  // Legacy hidden customer charges (+ any residual) recorded for absorption evidence.
  if (commercial.legacyHiddenCustomerTotal !== 0) {
    materialSections.push({
      sourceType: "internal_custom_line",
      roomId: null,
      roomName: null,
      sourceId: "legacy_hidden_customer_charges",
      rawSf: 0,
      billedSf: 0,
      adjustmentSf: 0,
      ratePerSf: 0,
      amountCents: Math.round(commercial.legacyHiddenCustomerTotal * 100),
      category: "hidden_allocation"
    });
  }
  if (commercial.internalOnlyTotal !== 0) {
    materialSections.push({
      sourceType: "internal_only_commercial_line",
      roomId: null,
      roomName: null,
      sourceId: "internal_only_costs",
      rawSf: 0,
      billedSf: 0,
      adjustmentSf: 0,
      ratePerSf: 0,
      amountCents: Math.round(commercial.internalOnlyTotal * 100),
      category: "internal_only"
    });
  }
  if (commercial.absorbedTotal !== 0) {
    materialSections.push({
      sourceType: "absorbed_commercial_line",
      roomId: null,
      roomName: null,
      sourceId: "absorbed_costs",
      rawSf: 0,
      billedSf: 0,
      adjustmentSf: 0,
      ratePerSf: 0,
      amountCents: Math.round(commercial.absorbedTotal * 100),
      category: "absorbed"
    });
  }

  const cfg = readTrustedPartnerAccountConfig(env);
  const spahn = isSpahnTrustedPartner(scope.partnerAccountId, cfg);
  // Customer path: material + tax + fabrication (incl. customer commercial lines /
  // discounts / credits / legacy hidden charges). Excludes new internal_only + absorbed.
  const preAdjustment = round2(materialSubtotal + materialUseTax + fabricationSubtotal);
  const accountAdjustment = spahn
    ? round2(preAdjustment * (SPAHN_ESTIMATE_ADJUSTMENT_PERCENT / 100))
    : 0;
  const afterAccount = round2(preAdjustment + accountAdjustment);

  const markupPercent = Number(scope.internalMarkupPercent ?? 0) || 0;
  const internalMarkupAmount = markupPercent > 0 ? round2(materialSubtotal * (markupPercent / 100)) : 0;
  // Internal economics include internal_only + absorbed (never customer-facing).
  const exactInternalTotal = round2(
    afterAccount +
      internalMarkupAmount +
      commercial.internalOnlyTotal +
      commercial.absorbedTotal
  );
  // Customer total never includes new internal_only or absorbed roles.
  // Legacy customerFacing:false lines remain in afterAccount (historical absorption).
  const customerDisplayTotal = round2(afterAccount);

  // Governed adjustment audit (snapshotted with the calculation): billed SF
  // effect and cent effect per adjustment, at this calculation's material rate.
  const adjustmentAudit = scopeBilling.adjustments.map((adj) => {
    const billedSf =
      adj.adjustmentScope === "project"
        ? scopeBilling.projectAdjustmentBilledSf
        : scopeBilling.rooms.find((r) => r.roomId === adj.roomId)?.adjustmentBilledSf ?? 0;
    return {
      ...adj,
      billedSf,
      pricingEffectCents: Math.round(billedSf * materialRate.rate * 102) // incl. 2% use tax
    };
  });
  const edgeAdjustment = normalizeEdgeScopeAdjustment(scope);
  const edgeAdjustmentAudit =
    edgeAdjustment.adjustmentLf !== 0
      ? {
          ...edgeAdjustment,
          pricingEffectCents: Math.round(
            edgeAdjustment.adjustmentLf * (edgeSummary.ratePerLf || 0) * 100
          )
        }
      : null;

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        commercialLineModelVersion: STUDIO_COMMERCIAL_LINE_MODEL_VERSION,
        materialGroup: scope.materialGroup,
        pricingBasis,
        partnerAccountId: scope.partnerAccountId || null,
        materialSf,
        materialByGroup: inherited.materialByGroup,
        materialRate: materialRate.rate,
        addOns,
        customLineItems: customLineItems.map((r) => ({
          id: r.id,
          name: r.name,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          percentOfBase: r.percentOfBase,
          customerFacing: r.customerFacing,
          commercialRole: r.commercialRole,
          category: r.category,
          roomId: r.roomId || null
        })),
        edgeMode,
        edgeLf,
        edgeProfileToken: explicitEdgeProfile?.optionToken || null,
        edgeScopeAdjustment: edgeAdjustment.adjustmentLf,
        countertopScopeAdjustments: scopeBilling.adjustments.map((a) => ({
          scope: a.adjustmentScope,
          roomId: a.roomId,
          sf: a.adjustmentSf
        })),
        miterKey,
        miterLf,
        buildup,
        markupPercent,
        rooms: (Array.isArray(scope.rooms) ? scope.rooms : []).map((r) => ({
          id: r.id,
          materialGroupOverride: r.materialGroupOverride ?? null,
          countertopSqft: r.countertopSqft,
          backsplashSqft: r.backsplashSqft,
          includeBacksplash: r.includeBacksplash,
          backsplashHeightIn: r.backsplashHeightIn,
          pieces: (Array.isArray(r.pieces) ? r.pieces : []).map((p) => ({
            id: p.id,
            materialOverride: Boolean(p.materialOverride),
            materialGroup: p.materialGroup || null,
            sqft: p.sqft,
            included: p.included !== false
          }))
        }))
      })
    )
    .digest("hex");

  return {
    ok: true,
    fingerprint,
    calculatedAt: new Date().toISOString(),
    pricingEngine: "quoteCalculator+studioTrustedOverlays",
    pricingVersion: 3,
    commercialLineModelVersion: STUDIO_COMMERCIAL_LINE_MODEL_VERSION,
    // Internal measured-vs-billed scope evidence (never public): exact measured
    // SF, independently section-ceiled billed SF, and governed adjustments with
    // their billed + cent effects at this calculation's rate.
    scopeBilling: {
      version: scopeBilling.version,
      pricingScopeSource: scopeBilling.pricingScopeSource,
      measuredCountertopSf: scopeBilling.measuredCountertopSf,
      adjustedMeasuredCountertopSf: scopeBilling.adjustedMeasuredCountertopSf,
      billedBeforeAdjustmentsSf: scopeBilling.billedBeforeAdjustmentsSf,
      billedCountertopSf: scopeBilling.billedCountertopSf,
      independentSectionCount: scopeBilling.independentSectionCount,
      rooms: scopeBilling.rooms,
      adjustments: adjustmentAudit,
      edgeAdjustment: edgeAdjustmentAudit
    },
    material: {
      group: materialRate.group,
      basis: materialRate.basis,
      ratePerSf: materialRate.rate,
      rateSource: materialRate.rateSource,
      wattsOverrideApplied: materialRate.wattsOverrideApplied,
      wattsPromoRate: WATTS_PROMO_RATE_PER_SF,
      squareFeet: materialSf,
      countertopSqft: round2(chargeableCounter),
      backsplashSqft: round2(chargeableSplash),
      subtotal: materialSubtotal,
      countertopSubtotal: materialCountertopSubtotal,
      backsplashSubtotal: materialBacksplashSubtotal,
      byGroup: inherited.materialByGroup,
      roomSummaries: inherited.roomSummaries,
      // Internal-only section evidence (source/room/raw/billed/rate/category).
      sections: materialSections,
      useTaxPercent: 2,
      useTaxAmount: materialUseTax
    },
    fabrication: {
      subtotal: fabricationSubtotal,
      addOns,
      edge: edgeSummary,
      customLineItems,
      customLineItemsTotal,
      customLineItemsCustomerVisibleTotal,
      customLineItemsInternalOnlyTotal,
      customLineItemsAbsorbedTotal,
      customLineItemsLegacyHiddenTotal: commercial.legacyHiddenCustomerTotal,
      commercialLines: {
        modelVersion: STUDIO_COMMERCIAL_LINE_MODEL_VERSION,
        customerVisibleTotal: commercial.customerVisibleTotal,
        customerTotalContribution: commercial.customerTotalContribution,
        internalOnlyTotal: commercial.internalOnlyTotal,
        absorbedTotal: commercial.absorbedTotal,
        legacyHiddenCustomerTotal: commercial.legacyHiddenCustomerTotal
      }
    },
    account: {
      partnerAccountId: scope.partnerAccountId || null,
      wattsTrusted: isWattsTrustedPartner(scope.partnerAccountId, cfg),
      spahnTrusted: spahn,
      spahnAdjustmentPercent: spahn ? SPAHN_ESTIMATE_ADJUSTMENT_PERCENT : 0,
      accountAdjustment
    },
    internalMarkup: {
      percent: markupPercent,
      amount: internalMarkupAmount,
      customerVisible: false,
      appliedByUserId: markupPercent > 0 ? params.actorUserId || null : null,
      appliedAt: markupPercent > 0 ? new Date().toISOString() : null
    },
    totals: {
      exactInternalTotal,
      customerDisplayTotal,
      materialSubtotal,
      materialCountertopSubtotal,
      materialBacksplashSubtotal,
      materialUseTax,
      fabricationSubtotal,
      accountAdjustment,
      internalMarkupAmount,
      internalOnlyCosts: commercial.internalOnlyTotal,
      absorbedCosts: commercial.absorbedTotal,
      commercialCustomerContribution: commercial.customerTotalContribution
    },
    warnings,
    unresolvedItems: unresolved,
    calculatorParity: {
      quoteCalculatorRetail: quoteResult.totals?.retail ?? null,
      quoteCalculatorWholesale: quoteResult.totals?.wholesale ?? null
    }
  };
}

export function scopeFingerprint(scope) {
  return createHash("sha256")
    .update(JSON.stringify(scope || {}))
    .digest("hex")
    .slice(0, 32);
}
