/**
 * Studio estimate pricing — reuses quoteCalculator + trusted account overlays.
 */
import { createHash } from "node:crypto";
import {
  calculateQuote,
  normalizeCustomLineItems,
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
        materialGroup: scope.materialGroup || "Group Promo",
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
          notes: p.notes || ""
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
  const materialRate = resolveStudioMaterialRatePerSf({
    materialGroup: scope.materialGroup || "Group Promo",
    pricingBasis,
    partnerAccountId: scope.partnerAccountId,
    env
  });

  const customLineItems = normalizeCustomLineItems(scope).map((row) => ({
    ...row,
    unit: (() => {
      const raw = Array.isArray(scope.customLineItems) ? scope.customLineItems : [];
      const match = raw.find(
        (r) => r && String(r.name ?? r.item_name ?? "").trim() === row.name
      );
      return match?.unit != null ? String(match.unit) : "ea";
    })()
  }));

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
      customLineItems,
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

  // Recompute material on studio rate authority (covers Watts Promo override).
  // Room rows already carry section-ceiled billed SF including governed room
  // adjustments; the project-level adjustment is its own independent section.
  const scopeBilling = buildStudioScopeBilling(scope);
  const chargeableCounter =
    rooms.reduce((s, r) => s + (Number(r.countertopSqft) || 0), 0) +
    scopeBilling.projectAdjustmentBilledSf;
  const chargeableSplash = rooms.reduce((s, r) => s + (Number(r.backsplashSqft) || 0), 0);

  // Invariant: the billed countertop scope displayed to the estimator and the
  // billed countertop scope being priced must match exactly. Backsplash SF is
  // a separately attributed category and must never inflate countertop scope.
  assertBilledCountertopScopeReconciles(scopeBilling.billedCountertopSf, chargeableCounter);

  const materialSf = round2(chargeableCounter + chargeableSplash);
  const materialCountertopSubtotal = round2(chargeableCounter * materialRate.rate);
  const materialBacksplashSubtotal = round2(chargeableSplash * materialRate.rate);
  const materialSubtotal = round2(materialCountertopSubtotal + materialBacksplashSubtotal);
  const materialUseTax = round2(materialSubtotal * 0.02);

  // Internal calculation evidence: every SF section contributing to the
  // material subtotal, category-attributed. Never exposed publicly.
  /** @type {Array<object>} */
  const materialSections = [];
  const sectionSourceType =
    scopeBilling.pricingScopeSource === "takeoff" ? "takeoff_piece" : "manual_piece";
  for (const row of scopeBilling.rooms) {
    for (const s of row.sections) {
      materialSections.push({
        sourceType: sectionSourceType,
        roomId: row.roomId,
        roomName: row.roomName,
        sourceId: s.key,
        rawSf: s.rawSf,
        billedSf: s.billableSf,
        adjustmentSf: 0,
        ratePerSf: materialRate.rate,
        amountCents: Math.round(s.billableSf * materialRate.rate * 100),
        category: "countertop"
      });
    }
    for (const adj of row.adjustments) {
      if (adj.adjustmentSf === 0) continue;
      materialSections.push({
        sourceType: "scope_adjustment",
        roomId: row.roomId,
        roomName: row.roomName,
        sourceId: adj.id,
        rawSf: adj.adjustmentSf,
        billedSf: 0,
        adjustmentSf: row.adjustmentBilledSf,
        ratePerSf: materialRate.rate,
        amountCents: Math.round(row.adjustmentBilledSf * materialRate.rate * 100),
        category: "countertop"
      });
    }
  }
  if (scopeBilling.projectAdjustmentBilledSf !== 0) {
    materialSections.push({
      sourceType: "scope_adjustment",
      roomId: null,
      roomName: null,
      sourceId: "project_adjustment",
      rawSf: scopeBilling.adjustments
        .filter((a) => a.adjustmentScope === "project")
        .reduce((s, a) => s + a.adjustmentSf, 0),
      billedSf: 0,
      adjustmentSf: scopeBilling.projectAdjustmentBilledSf,
      ratePerSf: materialRate.rate,
      amountCents: Math.round(
        scopeBilling.projectAdjustmentBilledSf * materialRate.rate * 100
      ),
      category: "countertop"
    });
  }
  for (const r of rooms) {
    const splashSf = Number(r.backsplashSqft) || 0;
    if (splashSf <= 0) continue;
    materialSections.push({
      sourceType: "room_backsplash",
      roomId: String(r.id ?? ""),
      roomName: String(r.name ?? ""),
      sourceId: "backsplash",
      rawSf: Number(r.rawBacksplashSqft) || splashSf,
      billedSf: splashSf,
      adjustmentSf: 0,
      ratePerSf: materialRate.rate,
      amountCents: Math.round(splashSf * materialRate.rate * 100),
      category: "backsplash"
    });
  }

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

  let customLineItemsCustomerVisibleTotal = 0;
  let customLineItemsInternalOnlyTotal = 0;
  for (const row of customLineItems) {
    const lineTotal = round2((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0));
    if (row.customerFacing) customLineItemsCustomerVisibleTotal = round2(
      customLineItemsCustomerVisibleTotal + lineTotal
    );
    else customLineItemsInternalOnlyTotal = round2(customLineItemsInternalOnlyTotal + lineTotal);
  }
  const customLineItemsTotal = round2(
    customLineItemsCustomerVisibleTotal + customLineItemsInternalOnlyTotal
  );
  fabricationSubtotal = round2(fabricationSubtotal + customLineItemsTotal);

  // Internal-only custom-line dollars are absorbed into customer-facing stone
  // categories at publication — they are dollars, never SF. Record them in the
  // evidence table with zero SF so they cannot masquerade as billed scope.
  if (customLineItemsInternalOnlyTotal !== 0) {
    materialSections.push({
      sourceType: "internal_custom_line",
      roomId: null,
      roomName: null,
      sourceId: "internal_only_custom_lines",
      rawSf: 0,
      billedSf: 0,
      adjustmentSf: 0,
      ratePerSf: 0,
      amountCents: Math.round(customLineItemsInternalOnlyTotal * 100),
      category: "hidden_allocation"
    });
  }

  const cfg = readTrustedPartnerAccountConfig(env);
  const spahn = isSpahnTrustedPartner(scope.partnerAccountId, cfg);
  const preAdjustment = round2(materialSubtotal + materialUseTax + fabricationSubtotal);
  const accountAdjustment = spahn
    ? round2(preAdjustment * (SPAHN_ESTIMATE_ADJUSTMENT_PERCENT / 100))
    : 0;
  const afterAccount = round2(preAdjustment + accountAdjustment);

  const markupPercent = Number(scope.internalMarkupPercent ?? 0) || 0;
  const internalMarkupAmount = markupPercent > 0 ? round2(materialSubtotal * (markupPercent / 100)) : 0;
  const exactInternalTotal = round2(afterAccount + internalMarkupAmount);
  // Internal markup is never customer-facing. Internal-only custom lines ARE
  // charged to the customer — their names are hidden and their dollars are
  // absorbed into customer-facing stone categories at publication by the
  // deterministic allocation policy (internal_custom_line_allocation_v1),
  // so the customer total reconciles to the authoritative total exactly.
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
        materialGroup: scope.materialGroup,
        pricingBasis,
        partnerAccountId: scope.partnerAccountId || null,
        materialSf,
        materialRate: materialRate.rate,
        addOns,
        customLineItems: customLineItems.map((r) => ({
          name: r.name,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          customerFacing: r.customerFacing,
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
        rooms: rooms.map((r) => ({
          id: r.id,
          countertopSqft: r.countertopSqft,
          backsplashSqft: r.backsplashSqft,
          includeBacksplash: r.includeBacksplash,
          backsplashHeightIn: r.backsplashHeightIn
        }))
      })
    )
    .digest("hex");

  return {
    ok: true,
    fingerprint,
    calculatedAt: new Date().toISOString(),
    pricingEngine: "quoteCalculator+studioTrustedOverlays",
    pricingVersion: 2,
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
      customLineItemsInternalOnlyTotal
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
      internalMarkupAmount
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
