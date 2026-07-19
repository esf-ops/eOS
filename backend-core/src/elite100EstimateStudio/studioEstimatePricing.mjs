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
      const countertopSqft = counterBilled.billableSf;
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
  const chargeableCounter = rooms.reduce((s, r) => s + (Number(r.countertopSqft) || 0), 0);
  const chargeableSplash = rooms.reduce((s, r) => s + (Number(r.backsplashSqft) || 0), 0);
  const materialSf = round2(chargeableCounter + chargeableSplash);
  const materialSubtotal = round2(materialSf * materialRate.rate);
  const materialUseTax = round2(materialSubtotal * 0.02);

  let fabricationSubtotal = 0;
  for (const [key, qty] of Object.entries(addOns)) {
    const unit = PROTOTYPE_ADDON_UNIT_PRICES[key];
    if (unit) fabricationSubtotal = round2(fabricationSubtotal + unit.price * Number(qty));
  }

  // Edge / miter / build-up from approved calculator rates only.
  // W edge: wholesale $15/LF, direct $25/LF (quoteCalculator v2 upgraded edge — not universal $15).
  // D edge: $25/LF (product brief; aligns with Direct upgraded-edge rate).
  const edgeMode = String(scope.edgeMode ?? "included");
  const edgeLf = Math.max(0, Number(scope.edgeLinearFeet) || 0);
  if (edgeMode === "w_edge" && edgeLf > 0) {
    fabricationSubtotal = round2(
      fabricationSubtotal + edgeLf * resolveStudioWEdgeRatePerLf(pricingBasis)
    );
  } else if (edgeMode === "d_edge" && edgeLf > 0) {
    fabricationSubtotal = round2(fabricationSubtotal + edgeLf * STUDIO_D_EDGE_RATE_PER_LF);
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
  // Markup + internal-only custom lines never customer-facing.
  const customerDisplayTotal = round2(afterAccount - customLineItemsInternalOnlyTotal);

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
          category: r.category
        })),
        edgeMode,
        edgeLf,
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
    pricingVersion: 1,
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
      useTaxPercent: 2,
      useTaxAmount: materialUseTax
    },
    fabrication: {
      subtotal: fabricationSubtotal,
      addOns,
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
