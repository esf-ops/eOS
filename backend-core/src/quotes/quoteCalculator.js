/**
 * eliteOS Quote Calculator — testable core (no Express).
 *
 * Rules:
 * - Partner economics use DB `quote_pricing_rules` when provided; otherwise prototype mirror constants
 *   (`PROTOTYPE_TIER_PRICE_PER_SQFT` = legacy prototype $/sf, not used for public consumer material).
 * - Public consumer (`pricing_mode === public_retail`): material $/sf uses ESF **Direct** tiers
 *   (`ESF_DIRECT_PRICE_PER_SQFT`), add-ons/vanities use rule/prototype unit prices as Direct; homeowner total =
 *   Direct subtotal × `(1 + effectiveRetailMarkupPercent/100)` (minimum **25%**, from structure / `resolvePricingStructure`).
 * - Callers must not trust client-supplied totals; use returned numbers only.
 */

import { priceVanityProgram2026FromPayload, VANITY_PROGRAM_YEAR } from "./vanityProgram2026.js";
import { priceVanitySideSplashFromPayload } from "./vanitySideSplash.js";
import {
  computeInternalEstimateMaterialUseTaxAmounts,
  resolveInternalEstimateMaterialTaxPolicy
} from "./internalEstimateMaterialTaxPolicy.js";
import {
  computeOutOfCollectionPremiumAmounts,
  normalizeMaterialProgramDefault,
  resolveOutOfCollectionPremiumPercent
} from "./internalEstimateMaterialProgram.js";
import { resolveOutOfCollectionPricingPolicy } from "./internalEstimateOutOfCollectionPolicy.js";
import {
  applyChargeableCounterCeilToGuidedRows,
  applyChargeableSplashCeilToGuidedRows,
  chargeableCounterSqftFromExact,
  chargeableSplashSqftFromExact,
  enumerateGuidedRoomMaterialRows,
  isGuidedShapeRoom,
  shouldApplyChargeableCounterCeil,
  shouldApplyChargeableSplashCeil
} from "./roomGuidedMeasurement.js";

const MIN_PUBLIC_RETAIL_MARKUP = 25;

/** 25% public planning markup on top of Direct unit economics (material $/sf, add-ons, vanities). */
const PUBLIC_PLANNING_MARKUP_MULTIPLIER = 1.25;

/**
 * ESF Direct $/sqft by material tier (internal ESF economics).
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 * @see computePublicConsumerEstimatesByGroup, legacyDirectPublic, sumRoomsPublicPlanning
 */
export const ESF_DIRECT_PRICE_PER_SQFT = Object.freeze({
  "Group Promo": 70,
  "Group A": 77,
  "Group B": 85,
  "Group C": 95,
  "Group D": 105,
  "Group E": 120,
  "Group F": 135,
  // Remnant: Internal Estimate Direct/Retail remnant pricing. Not a public consumer tier.
  "Remnant": 50
});

/** Prototype v1.01 tier $/sf (Group Promo → Group F) — partner/seed mirror; not public consumer material rates. */
export const PROTOTYPE_TIER_PRICE_PER_SQFT = Object.freeze({
  "Group Promo": 45,
  "Group A": 57,
  "Group B": 65,
  "Group C": 75,
  "Group D": 85,
  "Group E": 100,
  "Group F": 115,
  // Remnant wholesale fallback = $50 (same as Direct; prevents silent Group Promo fallback in wholesale mode).
  "Remnant": 50
});

/** Prototype add-on unit prices (legacy global ids). */
export const PROTOTYPE_ADDON_UNIT_PRICES = Object.freeze({
  "qty-sink": { name: "Kitchen Sink Cutouts", price: 200 },
  "qty-bar": { name: "Vanity/Bar Sink Cutouts", price: 100 },
  "qty-cook": { name: "Cooktop Cutouts", price: 150 },
  "qty-outlet": { name: "Electrical Outlet Cutouts", price: 30 },
  "qty-ss": { name: "ESF Stainless Kitchen Sink", price: 160 },
  "qty-blanco": { name: "Stock Blanco Sink", price: 450 },
  "qty-v-rect": { name: "ESF Rectangular Vanity Sink", price: 55 },
  "qty-v-oval": { name: "ESF Oval Vanity Sink", price: 35 },
  tearout: { name: "Tear Out Needed", price: 750 }
});

export const PROTOTYPE_VANITY_TIER_THRESHOLD_SQFT = 35;

/**
 * Fallback specialty edge rate per linear foot ($/LF).
 * Mirrors `specialty_edge_per_lf` in `pricingConfigResolver.fallbackAddonCatalogByCode()`.
 * Will be overridden by `quote_addon_catalog` DB row when Pricing Admin is wired in.
 * Used for legacy rooms without structured `edgeMode`.
 */
export const SPECIALTY_EDGE_RATE_PER_LF = 15;

/**
 * Legacy upgraded edge profile names (old model) that incur a $/LF charge.
 * Must mirror `UPGRADED_EDGE_PROFILES` in `app-quote/src/lib/prototypeQuoteMath.ts`.
 * NOTE: "Dupont" is no longer a selectable option in the UI (removed 2026) but is retained
 * here so legacy quotes that already have it stored are still billed correctly.
 * Used only when `room.edgeMode` is absent.
 */
const UPGRADED_EDGE_PROFILE_NAMES = new Set([
  "Full Bullnose",
  "Ogee",
  "Waterfall",
  "Laminated (mitered)",
  "Dupont"
]);

/**
 * v2 upgraded edge profile names.
 * Must mirror `UPGRADED_EDGE_PROFILES_V2` in `app-quote/src/lib/prototypeQuoteMath.ts`.
 */
const UPGRADED_EDGE_PROFILE_NAMES_V2 = new Set(["Small Ogee", "Crescent", "Knife"]);

/** v2 mitered edge rates by height key. */
const MITER_RATES_V2 = { "2-3in": 65, "4in": 70, "5in": 75, "6in": 80 };

/** v2 build-up rate per SF. */
const BUILDUP_RATE_PER_SQFT_V2 = 20;

/** v2 upgraded edge $/LF - wholesale. */
const UPGRADED_EDGE_RATE_WHOLESALE_V2 = 15;

/** v2 upgraded edge $/LF - direct/retail. */
const UPGRADED_EDGE_RATE_DIRECT_V2 = 25;

/**
 * Resolve the specialty edge $/LF rate from pricing rules, falling back to the constant.
 * Used for legacy rooms (no edgeMode). v2 rooms use hardcoded rates above.
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 * @returns {{ rate: number, rateSource: "pricing_rules" | "fallback" }}
 */
function resolveEdgeRateFromRules(rules) {
  const rule = (rules || []).find(
    (r) => String(r.item_code) === "specialty_edge_per_lf" && String(r.category) !== "material_group"
  );
  if (rule != null && Number(rule.price) >= 0) {
    return { rate: Number(rule.price), rateSource: "pricing_rules" };
  }
  return { rate: SPECIALTY_EDGE_RATE_PER_LF, rateSource: "fallback" };
}

/**
 * Calculate edge charges per room, supporting both v2 structured model and legacy fallback.
 * @param {ReadonlyArray<Record<string, unknown>>} rooms
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 * @param {"wholesale"|"direct"} pricingMode
 */
function calculateRoomUpgradedEdges(rooms, rules, pricingMode) {
  const { rate: legacyRate, rateSource } = resolveEdgeRateFromRules(rules);
  /** @type {Array<Record<string, unknown>>} */
  const lines = [];
  /** @type {string[]} */
  const warnings = [];
  let total = 0;
  let hasManual = false;

  for (const room of rooms || []) {
    const roomName = String(room.name || room.room_name || "Room").trim();
    const edgeMode = room.edgeMode ? String(room.edgeMode).trim() : null;

    if (edgeMode) {
      if (edgeMode === "included") continue;

      if (edgeMode === "upgraded") {
        const profile = String(room.edgeProfileV2 ?? "").trim();
        const lf = Number(room.edgeLinearFeet ?? 0) || 0;
        if (!profile) {
          warnings.push(`Room "${roomName}": upgraded edge selected but no profile chosen.`);
          continue;
        }
        if (lf <= 0) {
          warnings.push(`Room "${roomName}": upgraded edge "${profile}" — linear feet not entered, charge omitted.`);
          continue;
        }
        const rate = pricingMode === "direct" ? UPGRADED_EDGE_RATE_DIRECT_V2 : UPGRADED_EDGE_RATE_WHOLESALE_V2;
        const lineSubtotal = round2(lf * rate);
        total += lineSubtotal;
        lines.push({
          item_code: "specialty_edge_per_lf",
          item_name: `${profile} edge — ${roomName}`,
          room_name: roomName,
          quantity: lf,
          unit_price: rate,
          unit_type: "per_lf",
          category: "edge",
          edge_mode: "upgraded",
          line_subtotal: lineSubtotal
        });
        continue;
      }

      if (edgeMode === "mitered") {
        const heightKey = String(room.miterHeight ?? "").trim();
        const lf = Number(room.edgeLinearFeet ?? 0) || 0;
        const miterRate = MITER_RATES_V2[heightKey];
        if (!heightKey || miterRate == null) {
          warnings.push(`Room "${roomName}": mitered edge — miter height not selected, charge omitted.`);
          continue;
        }
        if (lf <= 0) {
          warnings.push(`Room "${roomName}": mitered edge (${heightKey}) — linear feet not entered, charge omitted.`);
          continue;
        }
        const miterSubtotal = round2(lf * miterRate);
        total += miterSubtotal;
        const heightDisplay = heightKey === "2-3in" ? `2"-3"` : `${heightKey.replace("in", `"`)}`;
        lines.push({
          item_code: "mitered_edge_per_lf",
          item_name: `${heightDisplay} mitered edge — ${roomName}`,
          room_name: roomName,
          quantity: lf,
          unit_price: miterRate,
          unit_type: "per_lf",
          category: "edge",
          edge_mode: "mitered",
          miter_height: heightKey,
          line_subtotal: miterSubtotal
        });
        if (room.buildUpRequired) {
          const bSqft = Number(room.buildUpSqft ?? 0) || 0;
          if (bSqft > 0) {
            const buSubtotal = round2(bSqft * BUILDUP_RATE_PER_SQFT_V2);
            total += buSubtotal;
            lines.push({
              item_code: "edge_buildup_per_sqft",
              item_name: `Build-up labor — ${roomName}`,
              room_name: roomName,
              quantity: bSqft,
              unit_price: BUILDUP_RATE_PER_SQFT_V2,
              unit_type: "per_sqft",
              category: "edge",
              edge_mode: "buildup",
              line_subtotal: buSubtotal
            });
          }
        }
        continue;
      }

      if (edgeMode === "manual") {
        const manualAmt = Math.max(0, Number(room.manualEdgeAmount ?? 0) || 0);
        const reason = String(room.manualEdgeReason ?? "").trim();
        const customerLabel = String(room.manualEdgeCustomerLabel ?? "").trim() || "Custom edge profile";
        if (!reason) {
          warnings.push(`Room "${roomName}": manual edge price requires an internal reason.`);
        }
        if (manualAmt > 0) {
          hasManual = true;
          total += manualAmt;
          lines.push({
            item_code: "manual_edge_price",
            item_name: `${customerLabel} — ${roomName}`,
            room_name: roomName,
            quantity: 1,
            unit_price: manualAmt,
            unit_type: "each",
            category: "edge",
            edge_mode: "manual",
            internal_reason: reason || null,
            line_subtotal: manualAmt
          });
        }
        continue;
      }

      warnings.push(`Room "${roomName}": unknown edge mode "${edgeMode}" — edge charge omitted.`);
    } else {
      // Legacy fallback
      const profile = String(room.edgeProfile ?? room.edge_profile ?? "").trim();
      if (!profile || !UPGRADED_EDGE_PROFILE_NAMES.has(profile)) continue;
      const lf = Number(room.upgradedEdgeLf ?? room.upgraded_edge_lf ?? 0) || 0;
      if (lf <= 0) {
        warnings.push(
          `Room "${roomName}": upgraded edge "${profile}" selected but linear feet not entered — edge charge omitted.`
        );
        continue;
      }
      const lineSubtotal = round2(lf * legacyRate);
      total += lineSubtotal;
      lines.push({
        item_code: "specialty_edge_per_lf",
        item_name: `${profile} edge — ${roomName}`,
        room_name: roomName,
        quantity: lf,
        unit_price: legacyRate,
        unit_type: "per_lf",
        category: "edge",
        edge_mode: "legacy",
        line_subtotal: lineSubtotal
      });
    }
  }
  return { total: round2(total), lines, warnings, rate: legacyRate, rateSource, hasManual };
}

/** Future: how quote measurements were produced (AI, layout, manual, …). */
export const QUOTE_INPUT_MODES = Object.freeze([
  "simple_public_preset",
  "manual_dimensions",
  "room_builder",
  "visual_layout",
  "ai_takeoff_from_plans",
  "staff_adjusted",
  "final_template"
]);

/**
 * Normalize loose client / prototype JSON into a canonical calculation input.
 * @param {Record<string, unknown>} input
 */
export function normalizePrototypeQuoteInput(input) {
  const src = input && typeof input === "object" ? input : {};
  const rawMode = String(src.quoteInputMode || src.quote_input_mode || "").trim();
  const quoteSource = String(src.quoteSource || src.quote_source || "partner_portal");
  const defaultMode = quoteSource === "public_retail" ? "simple_public_preset" : "manual_dimensions";
  const quoteInputMode = QUOTE_INPUT_MODES.includes(rawMode) ? rawMode : defaultMode;
  const basisRaw = String(src.internalMaterialBasis ?? src.internal_material_basis ?? "wholesale").toLowerCase();
  const internalMaterialBasis = basisRaw === "direct" ? "direct" : "wholesale";
  const customPassthroughItems = Array.isArray(src.customPassthroughItems)
    ? src.customPassthroughItems
    : Array.isArray(src.custom_pass_through_items)
      ? src.custom_pass_through_items
      : [];
  const customLineItems = normalizeCustomLineItems(src);
  const quoteDefaultMaterial =
    src.quoteDefaultMaterial && typeof src.quoteDefaultMaterial === "object"
      ? { ...src.quoteDefaultMaterial }
      : src.quote_default_material && typeof src.quote_default_material === "object"
        ? { ...src.quote_default_material }
        : null;
  return {
    engine: String(src.engine || src.calculationEngine || "legacy"),
    quoteSource,
    quoteInputMode,
    estimateMode: String(src.estimateMode || src.estimate_mode || "Partner Wholesale Estimate"),
    materialGroup: String(src.materialGroup || src.selectedGroup || "Group Promo"),
    internalMaterialBasis,
    customPassthroughItems,
    customLineItems,
    quoteDefaultMaterial,
    areas: {
      countertopSqft: Number(src.areas?.countertopSqft ?? src.countertopSqft ?? 0) || 0,
      backsplashSqft: Number(src.areas?.backsplashSqft ?? src.backsplashSqft ?? 0) || 0
    },
    addOns: typeof src.addOns === "object" && src.addOns ? { ...src.addOns } : {},
    rooms: Array.isArray(src.rooms) ? src.rooms : [],
    vanities: Array.isArray(src.vanities) ? src.vanities : [],
    retailMarkupPercent:
      String(src.quoteSource || src.quote_source || "") === "internal_quote"
        ? 0
        : Number(src.retailMarkupPercent ?? src.markup?.percent ?? 20) || 0,
    retailMethod:
      String(src.quoteSource || src.quote_source || "") === "internal_quote"
        ? "Pass Through"
        : String(src.retailMethod || src.markup?.method || "Markup Percent"),
    retailFlatAdd: Number(src.retailFlatAdd ?? src.markup?.flatAdd ?? 0) || 0,
    metadata: typeof src.metadata === "object" && src.metadata ? { ...src.metadata } : {},
    useTaxPercent: Math.max(0, Number(src.useTaxPercent ?? src.use_tax_percent ?? 0) || 0),
    materialProgramDefault:
      String(src.quoteSource || src.quote_source || "") === "internal_quote"
        ? "elite_100"
        : normalizeMaterialProgramDefault(src.materialProgramDefault ?? src.material_program_default),
    estimateRoomDrafts: Array.isArray(src.estimateRoomDrafts)
      ? src.estimateRoomDrafts
      : Array.isArray(src.estimate_room_drafts)
        ? src.estimate_room_drafts
        : []
  };
}

const CUSTOM_LINE_ITEM_CATEGORIES = new Set([
  "Sink",
  "Faucet",
  "Plumbing fixture",
  "Accessory",
  "Labor",
  "Fee",
  "Discount/Credit",
  "Other"
]);

/**
 * Structured job-specific line items (internal estimates). Re-validated in `calculateQuote`.
 * @param {Record<string, unknown>} src
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeCustomLineItems(src) {
  const raw = Array.isArray(src.customLineItems)
    ? src.customLineItems
    : Array.isArray(src.custom_line_items)
      ? src.custom_line_items
      : [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.name ?? row.item_name ?? "").trim();
    if (!name) continue;
    let cat = String(row.category ?? "Other").trim() || "Other";
    if (!CUSTOM_LINE_ITEM_CATEGORIES.has(cat)) cat = "Other";
    const qty = Number(row.quantity ?? row.qty ?? 1) || 0;
    const unitPrice = Number(row.unitPrice ?? row.unit_price ?? 0) || 0;
    out.push({
      name,
      description: row.description != null ? String(row.description) : "",
      category: cat,
      quantity: qty,
      unitPrice,
      customerFacing: Boolean(row.customerFacing ?? row.customer_facing ?? true),
      internalNote: row.internalNote != null ? String(row.internalNote) : row.internal_note != null ? String(row.internal_note) : "",
      roomName: row.roomName != null ? String(row.roomName) : row.room_name != null ? String(row.room_name) : "",
      roomId: row.roomId != null ? String(row.roomId) : row.room_id != null ? String(row.room_id) : "",
      lineKey: row.lineKey != null ? String(row.lineKey) : row.line_key != null ? String(row.line_key) : ""
    });
  }
  return out;
}

/**
 * @param {Record<string, unknown>} room
 */
export function calculateRoomAreas(room) {
  const lengthIn = Number(room.lengthIn ?? room.l ?? 0) || 0;
  const depthIn = Number(room.depthIn ?? room.d ?? 0) || 0;
  const shape = String(room.shape || "rect").toLowerCase() === "tri" ? "tri" : "rect";
  let sf = (lengthIn * depthIn) / 144;
  if (shape === "tri") sf /= 2;
  return { sf, lengthIn, depthIn, shape };
}

function rulePriceForMaterialGroup(groupName, rules) {
  const g = String(groupName || "Group Promo").trim();
  const fromRules = (rules || []).find(
    (r) => String(r.category) === "material_group" && String(r.item_name || "").trim() === g
  );
  if (fromRules != null && Number(fromRules.price) >= 0) return Number(fromRules.price);
  return PROTOTYPE_TIER_PRICE_PER_SQFT[g] ?? PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"];
}

/**
 * Internal quotes: material $/sf follows Direct vs Wholesale basis (no public 25% here).
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 * @param {string} groupName
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
function materialRateForQuote(input, groupName, rules) {
  if (String(input.quoteSource) === "internal_quote" && input.internalMaterialBasis === "direct") {
    return directPricePerSqftForGroup(groupName);
  }
  return rulePriceForMaterialGroup(groupName, rules);
}

/**
 * ESF Direct $/sqft for a material group (public consumer material base before × 1.25).
 * @param {string} groupName
 * @returns {number}
 */
export function directPricePerSqftForGroup(groupName) {
  const g = String(groupName || "Group Promo").trim();
  return ESF_DIRECT_PRICE_PER_SQFT[g] ?? ESF_DIRECT_PRICE_PER_SQFT["Group Promo"];
}

/**
 * Legacy-area public planning: Direct material $/sf + Direct add-ons/vanities (from rules), then × 1.25 at total via applyRetailProtection.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 * @param {Record<string, unknown>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
function legacyDirectPublic(input, rules, markupMult = PUBLIC_PLANNING_MARKUP_MULTIPLIER) {
  const g = String(input.materialGroup || "Group Promo");
  const directRate = directPricePerSqftForGroup(g);
  const mult = Number(markupMult) > 0 ? Number(markupMult) : PUBLIC_PLANNING_MARKUP_MULTIPLIER;
  const ct = Number(input.areas?.countertopSqft) || 0;
  const bs = Number(input.areas?.backsplashSqft) || 0;
  const baseMat = ct * directRate + bs * directRate;
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  const vanityPart = calculateVanities(input, rules);
  const directTotal = baseMat + addOnPart.total + vanityPart.total;
  return {
    directTotal,
    /** ESF Direct subtotal before public planning % (stored as `totals.wholesale` for snapshots). */
    wholesale: directTotal,
    materialGroup: g,
    directRatePerSqft: directRate,
    /** Public planning $/sf for homeowner-facing line items (Direct × markup multiplier). */
    rate: round2(directRate * mult),
    areas: { countertopSqft: ct, backsplashSqft: bs },
    addOnPart,
    vanityPart
  };
}

/**
 * Resolve material group / color labels for a piece (room + optional piece override + quote default).
 * @param {Record<string, unknown>|null|undefined} room
 * @param {Record<string, unknown>|null|undefined} piece
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 */
function resolveMaterialForPiece(room, piece, input) {
  const qd = input.quoteDefaultMaterial && typeof input.quoteDefaultMaterial === "object" ? input.quoteDefaultMaterial : null;
  const baseGroup = String(
    room?.materialGroup || room?.group || qd?.materialGroup || qd?.material_group || input.materialGroup || "Group Promo"
  ).trim();
  const baseColor =
    room?.materialColor ?? room?.material_color ?? qd?.materialColor ?? qd?.material_color ?? qd?.materialName ?? null;
  const baseSupplier = room?.materialSupplier ?? room?.material_supplier ?? qd?.materialSupplier ?? qd?.material_supplier ?? null;
  const baseType = room?.materialType ?? room?.material_type ?? qd?.materialType ?? qd?.material_type ?? null;
  const ov = Boolean(piece?.materialOverride ?? piece?.material_override);
  if (ov && piece && typeof piece === "object") {
    return {
      group: String(piece.materialGroup || piece.group || baseGroup).trim(),
      color: piece.materialColor ?? piece.material_color ?? baseColor,
      supplier: piece.materialSupplier ?? piece.material_supplier ?? baseSupplier,
      materialType: piece.materialType ?? piece.material_type ?? baseType
    };
  }
  return {
    group: baseGroup,
    color: baseColor,
    supplier: baseSupplier,
    materialType: baseType
  };
}

/**
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 */
function qualifyingKitchenCounterSfFromInput(input) {
  let sf = 0;
  for (const room of input.rooms || []) {
    if (String(room.roomType || room.room_type || "").toLowerCase() === "vanity") continue;
    sf += Number(room.countertopSqft ?? room.countertop_sqft) || 0;
  }
  return round2(sf);
}

function enumerateRoomMaterialSfRows(input) {
  /** @type {Array<{ roomName: string, pieceLabel: string, group: string, color: unknown, supplier: unknown, materialType: unknown, sf: number, isSplash: boolean }>} */
  const rows = [];
  let counter = 0;
  let splash = 0;
  /** @type {Array<Record<string, unknown>>} */
  const roomMeasurementSummaries = [];
  const useChargeableCeil = shouldApplyChargeableCounterCeil(input.quoteSource);
  const useChargeableSplashCeil = shouldApplyChargeableSplashCeil(input.quoteSource);

  for (const room of input.rooms || []) {
    const roomName = String(room.name || room.room_name || "Room").trim() || "Room";
    if (Array.isArray(room.pieces) && room.pieces.length && isGuidedShapeRoom(room)) {
      let guided = enumerateGuidedRoomMaterialRows(room);
      let exactCounter = guided.exactCounter;
      let chargeableCounter = exactCounter;
      let counterRoundingAdjustment = 0;
      if (useChargeableCeil) {
        const ceiled = applyChargeableCounterCeilToGuidedRows(guided.rows, exactCounter);
        guided = { ...guided, rows: ceiled.rows };
        chargeableCounter = ceiled.chargeableCounter;
        counterRoundingAdjustment = ceiled.counterRoundingAdjustment;
      }
      const exactSplashTotal = round2(guided.splash + guided.fhb);
      let chargeableSplashTotal = exactSplashTotal;
      let splashRoundingAdjustment = 0;
      if (useChargeableSplashCeil) {
        const splashCeiled = applyChargeableSplashCeilToGuidedRows(guided.rows, exactSplashTotal);
        guided = { ...guided, rows: splashCeiled.rows };
        chargeableSplashTotal = splashCeiled.chargeableSplash;
        splashRoundingAdjustment = splashCeiled.splashRoundingAdjustment;
      }
      for (const row of guided.rows) {
        const isSplash = Boolean(row.isSplash || row.isFhb);
        const mat = resolveMaterialForPiece(room, null, input);
        rows.push({
          roomName,
          pieceLabel: row.pieceLabel,
          ...mat,
          sf: round2(row.sf),
          isSplash
        });
      }
      counter += chargeableCounter;
      splash += chargeableSplashTotal;
      roomMeasurementSummaries.push({
        roomName,
        measurementEngine: "guided_shape_groups_v1",
        exactCountertopSqft: exactCounter,
        chargeableCountertopSqft: chargeableCounter,
        countertopRoundingAdjustmentSqft: counterRoundingAdjustment,
        exactBacksplashFhbSqft: exactSplashTotal,
        chargeableBacksplashFhbSqft: chargeableSplashTotal,
        backsplashRoundingAdjustmentSqft: splashRoundingAdjustment,
        backsplashSqft: guided.splash,
        fhbSqft: guided.fhb,
        backsplashFhbSqft: chargeableSplashTotal,
        cornerOverlapDeductionSqft: guided.cornerOverlapDeductionSf,
        chargeableCounterCeilApplied: useChargeableCeil,
        chargeableSplashCeilApplied: useChargeableSplashCeil,
        guidedShapeGroups: guided.groups
      });
    } else if (Array.isArray(room.pieces) && room.pieces.length) {
      const roomRowStart = rows.length;
      for (const piece of room.pieces) {
        const { sf } = calculateRoomAreas(piece);
        const t = String(piece.type || "counter");
        const isSplash = t === "splash";
        if (isSplash) splash += sf;
        else counter += sf;
        const mat = resolveMaterialForPiece(room, piece, input);
        rows.push({
          roomName,
          pieceLabel: String(piece.name || piece.label || (isSplash ? "Backsplash" : "Counter")).trim() || "Piece",
          ...mat,
          sf: round2(sf),
          isSplash
        });
      }
      const overlap = Number(room.cornerOverlapDeductionSf ?? room.corner_overlap_deduction_sf ?? 0) || 0;
      if (overlap > 0) {
        counter = Math.max(0, round2(counter - overlap));
        let remaining = overlap;
        for (let i = rows.length - 1; i >= roomRowStart && remaining > 0; i--) {
          if (!rows[i].isSplash && rows[i].sf > 0) {
            const take = Math.min(rows[i].sf, remaining);
            rows[i].sf = round2(rows[i].sf - take);
            remaining = round2(remaining - take);
          }
        }
      }
    } else {
      const mat = resolveMaterialForPiece(room, null, input);
      let ct = Number(room.countertopSqft) || 0;
      let bs = Number(room.backsplashSqft) || 0;
      if (useChargeableCeil && ct > 0) ct = chargeableCounterSqftFromExact(ct);
      if (useChargeableSplashCeil && bs > 0) bs = chargeableSplashSqftFromExact(bs);
      counter += ct;
      splash += bs;
      if (ct > 0) rows.push({ roomName, pieceLabel: "Countertop", ...mat, sf: round2(ct), isSplash: false });
      if (bs > 0) rows.push({ roomName, pieceLabel: "Backsplash", ...mat, sf: round2(bs), isSplash: true });
    }
  }
  return { rows, counter, splash, roomMeasurementSummaries };
}

/**
 * Room-engine public planning: per-piece Direct $/sf, global add-ons at Direct units; total × 1.25 applied in calculateQuote.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
function sumRoomsPublicPlanning(input, rules, markupMult = PUBLIC_PLANNING_MARKUP_MULTIPLIER) {
  const mult = Number(markupMult) > 0 ? Number(markupMult) : PUBLIC_PLANNING_MARKUP_MULTIPLIER;
  const { rows, counter, splash } = enumerateRoomMaterialSfRows({
    ...input,
    quoteSource: "public_retail"
  });
  let directMaterial = 0;
  const roomLines = [];
  /** @type {Array<Record<string, unknown>>} */
  const materialBreakdown = [];
  let order = 0;
  for (const row of rows) {
    const g = row.group;
    const directR = directPricePerSqftForGroup(g);
    const publicR = round2(directR * mult);
    const dSub = row.sf * directR;
    const pSub = row.sf * publicR;
    directMaterial += dSub;
    roomLines.push({
      room: row.roomName,
      pieceLabel: row.pieceLabel,
      group: g,
      materialColor: row.color,
      materialSupplier: row.supplier,
      materialType: row.materialType,
      rate: publicR,
      directRate: directR,
      roomCounter: row.isSplash ? 0 : row.sf,
      roomSplash: row.isSplash ? row.sf : 0,
      subtotal: round2(pSub),
      directSubtotal: round2(dSub),
      sort_order: order++
    });
    materialBreakdown.push({
      room: row.roomName,
      piece: row.pieceLabel,
      materialGroup: g,
      materialColor: row.color,
      supplier: row.supplier,
      materialType: row.materialType,
      sqft: row.sf,
      ratePerSqftPublic: publicR,
      ratePerSqftDirect: directR,
      wholesaleSubtotal: round2(dSub),
      retailSubtotal: round2(pSub)
    });
  }
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  const directTotal = directMaterial + addOnPart.total;
  return {
    counter,
    splash,
    roomLines,
    materialBreakdown,
    addOnPart,
    directTotal,
    /** ESF Direct subtotal before public planning % (stored as `totals.wholesale` for snapshots). */
    wholesale: directTotal
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
export function calculateAddOns(input, rules) {
  const add = input?.addOns && typeof input.addOns === "object" ? input.addOns : {};
  const lines = [];
  let total = 0;
  for (const [code, qtyRaw] of Object.entries(add)) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    const rule = (rules || []).find((r) => String(r.item_code) === code && String(r.category) !== "material_group");
    const unit =
      rule != null && Number(rule.price) >= 0
        ? Number(rule.price)
        : code === "tearout"
          ? PROTOTYPE_ADDON_UNIT_PRICES.tearout.price
          : PROTOTYPE_ADDON_UNIT_PRICES[code]?.price ?? 0;
    const name =
      rule?.item_name ||
      (code === "tearout" ? PROTOTYPE_ADDON_UNIT_PRICES.tearout.name : PROTOTYPE_ADDON_UNIT_PRICES[code]?.name) ||
      code;
    const lineSubtotal = qty * unit;
    total += lineSubtotal;
    lines.push({ item_code: code, item_name: String(name), quantity: qty, unit_price: unit, line_subtotal: lineSubtotal });
  }
  return { total, lines };
}

/**
 * @param {Record<string, unknown>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
function resolveRoomUseTaxPercentFromRow(room, projectDefaultPercent) {
  const mode = String(room.useTaxMode ?? room.use_tax_mode ?? "inherit_project");
  if (mode === "none") return 0;
  if (mode === "percent") return Math.max(0, Number(room.useTaxPercent ?? room.use_tax_percent) || 0);
  return Math.max(0, Number(projectDefaultPercent) || 0);
}

/** True when room uses 2026 vanity program fixed pricing (excluded from material use tax). */
function isInternalVanityProgramRoom(room) {
  if (!room || typeof room !== "object") return false;
  const rt = String(room.roomType ?? room.room_type ?? "").trim().toLowerCase();
  if (rt !== "vanity") return false;
  if (room.isVanityProgram === false || room.is_vanity_program === false) return false;
  const vanity = room.vanity && typeof room.vanity === "object" ? room.vanity : null;
  if (vanity?.isVanityProgram === false) return false;
  return true;
}

/**
 * Out-of-Collection premium per room on post-tax eligible material (internal_quote only).
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 * @param {ReadonlyArray<{ roomName: string, group: string, sf: number, isSplash: boolean }>} rows
 * @param {ReturnType<typeof resolveInternalEstimateMaterialTaxPolicy>} materialUseTaxPolicy
 */
function computeInternalOutOfCollectionPremium(input, rules, rows, materialUseTaxPolicy) {
  if (String(input.quoteSource) !== "internal_quote") {
    return { premiumAmount: 0, rooms: [], eligibleTotal: 0, premiumPercent: 0 };
  }
  // Internal Estimate uses Elite 100 only — stale room/quote OOC fields do not charge premium.
  return { premiumAmount: 0, rooms: [], eligibleTotal: 0, premiumPercent: 0 };
}

export function calculateVanities(input, rules) {
  const vanities = Array.isArray(input.vanities) ? input.vanities : [];
  const lines = [];
  let total = 0;
  const qualifyingSf = Number(input.qualifyingKitchenCounterSf ?? input.qualifying_kitchen_counter_sf ?? 0) || 0;
  const internalQuote = String(input.quoteSource) === "internal_quote";
  for (const v of vanities) {
    const code = String(v.code || v.sizeCode || "").trim();
    const qty = Number(v.qty) || 0;
    if (!code || qty <= 0) continue;
    const materialGroup = String(v.materialGroup || v.material_group || "Group Promo").trim();
    const rate = materialRateForQuote(
      input,
      materialGroup,
      rules
    );
    const programYear = Number(v.programYear ?? v.vanityProgramYear) || 0;
    if (programYear === VANITY_PROGRAM_YEAR || v.vanityProgramYear === VANITY_PROGRAM_YEAR) {
      const priced = priceVanityProgram2026FromPayload(v, qualifyingSf);
      if (priced) {
        const lineSubtotal = Number(priced.exactTotal) || 0;
        total += lineSubtotal;
        lines.push({
          item_code: code,
          item_name: String(priced.label || code),
          quantity: qty,
          unit_price: round2(lineSubtotal / qty),
          line_subtotal: lineSubtotal,
          vanity_program: priced
        });
        const sideSplash = priceVanitySideSplashFromPayload({
          vanity: v.vanity && typeof v.vanity === "object" ? v.vanity : { sideSplashQty: v.sideSplashQty },
          materialGroup,
          ratePerSqft: rate,
          chargeableCeil: internalQuote,
          internalMaterialUseTax: internalQuote
        });
        if (sideSplash) {
          total += sideSplash.materialExact;
          lines.push({
            item_code: "SIDE_SPLASH",
            item_name: sideSplash.label,
            quantity: sideSplash.qty,
            unit_price: round2(sideSplash.materialExact / sideSplash.qty),
            line_subtotal: sideSplash.materialExact
          });
        }
        continue;
      }
    }
    const rule = (rules || []).find((r) => String(r.category) === "vanity" && String(r.item_code) === code);
    const tier1 = Boolean(v.tier1Eligible ?? v.lowerTier);
    const unit = rule != null ? Number(tier1 ? rule.base_cost ?? rule.price : rule.price) || 0 : 0;
    const lineSubtotal = unit * qty;
    total += lineSubtotal;
    lines.push({ item_code: code, item_name: String(rule?.item_name || code), quantity: qty, unit_price: unit, line_subtotal: lineSubtotal });
  }
  return { total: round2(total), lines };
}

/**
 * For `public_retail`, `wholesale` is the ESF Direct subtotal; retail = that × (1 + effectiveMarkup/100), min 25%.
 * For other modes, `wholesale` is partner wholesale economics.
 * @param {{ wholesale: number, retailMarkupPercent?: number, pricingMode?: string }} params
 */
export function applyRetailProtection({ wholesale, retailMarkupPercent = 0, pricingMode = "" }) {
  const w = Number(wholesale) || 0;
  const m = Number(retailMarkupPercent) || 0;
  if (String(pricingMode).trim() === "public_retail") {
    const eff = Math.max(m, MIN_PUBLIC_RETAIL_MARKUP);
    const retail = w * (1 + eff / 100);
    return { wholesale: w, retail, appliedMarkupPercent: eff, enforcedMin: m < MIN_PUBLIC_RETAIL_MARKUP };
  }
  const retail = w * (1 + m / 100);
  return { wholesale: w, retail, appliedMarkupPercent: m, enforcedMin: false };
}

/**
 * Partner retail display (non–public-retail): prototype-style markup methods.
 * @param {number} wholesale
 * @param {{ method?: string, percent?: number, flatAdd?: number }} settings
 */
export function applyPartnerRetailDisplay(wholesale, settings = {}) {
  const w = Number(wholesale) || 0;
  const method = String(settings.method || "Pass Through");
  const percent = Number(settings.percent) || 0;
  const flatAdd = Number(settings.flatAdd) || 0;
  let retail = w;
  if (method === "Markup Percent") retail = w * (1 + percent / 100);
  else if (method === "Margin Percent") retail = percent >= 100 ? w : w / (1 - percent / 100);
  else if (method === "Flat Dollar Add") retail = w + flatAdd;
  return { wholesale: w, retail, profit: retail - w, method, percent, flatAdd };
}

/**
 * Build measurement provenance for snapshots and audit (AI takeoff / visual layout ready).
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 */
export function buildMeasurementSourceSummary(input) {
  const rooms = Array.isArray(input.rooms) ? input.rooms : [];
  return {
    quote_input_mode: input.quoteInputMode,
    engine: input.engine,
    legacy_areas:
      input.engine !== "rooms"
        ? {
            countertopSqft: input.areas.countertopSqft,
            backsplashSqft: input.areas.backsplashSqft
          }
        : null,
    rooms: rooms.map((r, idx) => ({
      index: idx,
      room_name: String(r.name || r.room_name || r.room || `Room ${idx + 1}`),
      measurement_source: r.measurementSource ?? r.measurement_source ?? null,
      takeoff_result_id: r.takeoffResultId ?? r.takeoff_result_id ?? null,
      visual_layout_id: r.visualLayoutId ?? r.visual_layout_id ?? null,
      takeoff_job_id: r.takeoffJobId ?? r.takeoff_job_id ?? null
    }))
  };
}

/**
 * Build immutable snapshot blob for `quote_headers.calculation_snapshot` / audit.
 * Consumers merge workspace-only fields (e.g. `internal_ui`) at save boundaries in `internalQuotesApi`;
 * existing rows must not accept arbitrary snapshot replacements via PATCH — only via save pipeline recalculation.
 */
export function buildCalculationSnapshot(input, resolved, totals, extras = {}) {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    quoteSource: input.quoteSource,
    quoteInputMode: input.quoteInputMode,
    estimateMode: input.estimateMode,
    pricingStructure: resolved?.structure
      ? { id: resolved.structure.id, code: resolved.structure.code, name: resolved.structure.name, pricing_mode: resolved.structure.pricing_mode }
      : { code: resolved?.fallbackCode || "PROTOTYPE", name: "Prototype mirror", pricing_mode: resolved?.fallbackMode || "partner" },
    retailMarkupPercent: resolved?.effectiveRetailMarkupPercent ?? null,
    measurement_source: extras.measurement_source ?? buildMeasurementSourceSummary(input),
    inputSummary: {
      engine: input.engine,
      materialGroup: input.materialGroup,
      internalMaterialBasis: input.internalMaterialBasis ?? null,
      customPassthroughCount: Array.isArray(input.customPassthroughItems) ? input.customPassthroughItems.length : 0,
      customLineItemCount: Array.isArray(input.customLineItems) ? input.customLineItems.length : 0,
      areas: input.areas,
      roomCount: Array.isArray(input.rooms) ? input.rooms.length : 0
    },
    totals,
    warnings: extras.warnings || [],
    material_breakdown: extras.material_breakdown || [],
    custom_line_items: extras.custom_line_items || [],
    estimate_rooms: extras.estimate_rooms || [],
    ruleCount: Array.isArray(resolved?.rules) ? resolved.rules.length : 0
  };
}

function sumRoomsWholesale(input, rules) {
  const { rows, counter, splash, roomMeasurementSummaries } = enumerateRoomMaterialSfRows(input);
  const roomLines = [];
  /** @type {Array<Record<string, unknown>>} */
  const materialBreakdown = [];
  let materialDollars = 0;
  let countertopMaterialDollars = 0;
  let order = 0;
  for (const row of rows) {
    const rate = materialRateForQuote(input, row.group, rules);
    const sub = round2(row.sf * rate);
    materialDollars += sub;
    if (!row.isSplash) countertopMaterialDollars += sub;
    roomLines.push({
      room: row.roomName,
      pieceLabel: row.pieceLabel,
      group: row.group,
      materialColor: row.color,
      materialSupplier: row.supplier,
      materialType: row.materialType,
      rate,
      roomCounter: row.isSplash ? 0 : row.sf,
      roomSplash: row.isSplash ? row.sf : 0,
      subtotal: sub,
      sort_order: order++
    });
    materialBreakdown.push({
      room: row.roomName,
      piece: row.pieceLabel,
      materialGroup: row.group,
      materialColor: row.color,
      supplier: row.supplier,
      materialType: row.materialType,
      sqft: row.sf,
      ratePerSqft: rate,
      wholesaleSubtotal: sub
    });
  }
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  const upgradedEdgePart = calculateRoomUpgradedEdges(input.rooms, rules, input.internalMaterialBasis ?? "wholesale");
  let useTaxAmount = 0;
  let countertopMaterialUseTaxAmount = 0;
  let backsplashMaterialUseTaxAmount = 0;
  let materialUseTaxPolicy = null;
  const roomTaxByRoom = [];
  let ooc = { premiumAmount: 0, rooms: [], eligibleTotal: 0, premiumPercent: 0 };
  if (String(input.quoteSource) === "internal_quote") {
    materialUseTaxPolicy = resolveInternalEstimateMaterialTaxPolicy();
    let ctPreTax = 0;
    let bsPreTax = 0;
    for (const row of rows) {
      const roomInput = (input.rooms || []).find(
        (r) => String(r.name || r.room_name || "").trim() === row.roomName
      );
      if (isInternalVanityProgramRoom(roomInput)) continue;
      const rate = materialRateForQuote(input, row.group, rules);
      const sub = round2(row.sf * rate);
      if (row.isSplash) bsPreTax = round2(bsPreTax + sub);
      else ctPreTax = round2(ctPreTax + sub);
    }
    const amounts = computeInternalEstimateMaterialUseTaxAmounts(ctPreTax, bsPreTax, materialUseTaxPolicy);
    useTaxAmount = amounts.totalMaterialUseTaxAmount;
    countertopMaterialUseTaxAmount = amounts.countertopMaterialUseTaxAmount;
    backsplashMaterialUseTaxAmount = amounts.backsplashMaterialUseTaxAmount;
    if (useTaxAmount > 0) {
      materialDollars = round2(materialDollars + useTaxAmount);
    }
    ooc = computeInternalOutOfCollectionPremium(input, rules, rows, materialUseTaxPolicy);
    if (ooc.premiumAmount > 0) {
      materialDollars = round2(materialDollars + ooc.premiumAmount);
    }
  }
  return {
    counter,
    splash,
    roomLines,
    materialBreakdown,
    addOnPart,
    upgradedEdgePart,
    useTaxAmount,
    useTaxPercent: useTaxAmount > 0 ? materialUseTaxPolicy?.materialUseTaxPercent ?? null : null,
    countertopMaterialUseTaxAmount,
    backsplashMaterialUseTaxAmount,
    materialUseTaxPolicy,
    roomUseTax: roomTaxByRoom,
    roomMeasurementSummaries,
    outOfCollectionPremium: String(input.quoteSource) === "internal_quote" ? ooc : undefined,
    wholesale: round2(materialDollars + addOnPart.total + upgradedEdgePart.total)
  };
}

function legacyWholesale(input, rules) {
  const g = String(input.materialGroup || "Group Promo");
  const rate = materialRateForQuote(input, g, rules);
  const isInternal = String(input.quoteSource) === "internal_quote";
  let ct = Number(input.areas?.countertopSqft) || 0;
  let bs = Number(input.areas?.backsplashSqft) || 0;
  if (isInternal && ct > 0) ct = chargeableCounterSqftFromExact(ct);
  if (isInternal && bs > 0) bs = chargeableSplashSqftFromExact(bs);
  const ctMaterial = ct * rate;
  const bsMaterial = bs * rate;
  let countertopMaterial = ctMaterial;
  let useTaxAmount = 0;
  let countertopMaterialUseTaxAmount = 0;
  let backsplashMaterialUseTaxAmount = 0;
  let materialUseTaxPolicy = null;
  if (String(input.quoteSource) === "internal_quote") {
    materialUseTaxPolicy = resolveInternalEstimateMaterialTaxPolicy();
    const amounts = computeInternalEstimateMaterialUseTaxAmounts(ctMaterial, bsMaterial, materialUseTaxPolicy);
    useTaxAmount = amounts.totalMaterialUseTaxAmount;
    countertopMaterialUseTaxAmount = amounts.countertopMaterialUseTaxAmount;
    backsplashMaterialUseTaxAmount = amounts.backsplashMaterialUseTaxAmount;
    countertopMaterial = round2(ctMaterial + countertopMaterialUseTaxAmount);
  }
  let base = round2(countertopMaterial + bsMaterial + backsplashMaterialUseTaxAmount);
  let outOfCollectionPremium = { premiumAmount: 0, rooms: [], eligibleTotal: 0, premiumPercent: 0 };
  if (
    String(input.quoteSource) === "internal_quote" &&
    normalizeMaterialProgramDefault(input.materialProgramDefault) === "out_of_collection"
  ) {
    const oocPct = resolveOutOfCollectionPremiumPercent(input.internalMaterialBasis);
    const prem = computeOutOfCollectionPremiumAmounts(base, oocPct);
    if (prem.premiumAmount > 0) {
      base = round2(base + prem.premiumAmount);
      outOfCollectionPremium = {
        premiumAmount: prem.premiumAmount,
        eligibleTotal: prem.eligibleMaterialWithTax,
        premiumPercent: oocPct,
        rooms: [
          {
            roomName: "Project",
            resolvedMaterialProgram: "out_of_collection",
            eligibleMaterialAmount: prem.eligibleMaterialWithTax,
            premiumAmount: prem.premiumAmount,
            assignedPriceGroup: g
          }
        ]
      };
    }
  }
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  const vanityPart = calculateVanities(input, rules);
  return {
    wholesale: base + addOnPart.total + vanityPart.total,
    useTaxAmount,
    useTaxPercent: useTaxAmount > 0 ? materialUseTaxPolicy?.materialUseTaxPercent ?? null : null,
    countertopMaterialUseTaxAmount,
    backsplashMaterialUseTaxAmount,
    materialUseTaxPolicy,
    materialGroup: g,
    rate,
    areas: { countertopSqft: ct, backsplashSqft: bs },
    addOnPart,
    vanityPart,
    outOfCollectionPremium
  };
}

/**
 * Returns true if the error is a known "table doesn't exist yet" PostgREST error.
 * Duplicated from quotePersist.js to avoid a circular import (quotePersist imports from here).
 * @param {unknown} error
 */
function isMissingPricingTable(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

/**
 * Resolve pricing structure + rules from Supabase-like client or use prototype mirror.
 * @param {{ quoteSource?: string, partnerAccountId?: string|null, requestedPricingStructureId?: string|null, db?: { from: Function } }} params
 */
export async function resolvePricingStructure(params) {
  const db = params?.db;
  const quoteSource = String(params?.quoteSource || "partner_portal");
  if (!db || typeof db.from !== "function") {
    const rules = prototypeMirrorRules();
    return {
      structure: {
        id: null,
        code: "PROTOTYPE_V101",
        name: "Prototype v1.01 mirror",
        pricing_mode: quoteSource === "public_retail" ? "public_retail" : "partner",
        retail_markup_percent: quoteSource === "public_retail" ? MIN_PUBLIC_RETAIL_MARKUP : 20
      },
      rules,
      effectiveRetailMarkupPercent: quoteSource === "public_retail" ? MIN_PUBLIC_RETAIL_MARKUP : 20,
      fallbackCode: "PROTOTYPE_V101",
      fallbackMode: quoteSource === "public_retail" ? "public_retail" : "partner"
    };
  }
  try {
    let structure = null;
    if (params.requestedPricingStructureId) {
      const { data, error } = await db
        .from("quote_pricing_structures")
        .select("*")
        .eq("id", params.requestedPricingStructureId)
        .limit(1);
      if (!error && data?.[0]) structure = data[0];
    }
    if (!structure && params.partnerAccountId) {
      const { data: asn } = await db
        .from("quote_partner_pricing_assignments")
        .select("pricing_structure_id")
        .eq("partner_account_id", params.partnerAccountId)
        .eq("is_active", true)
        .order("starts_at", { ascending: false })
        .limit(1);
      const sid = asn?.[0]?.pricing_structure_id;
      if (sid) {
        const { data } = await db.from("quote_pricing_structures").select("*").eq("id", sid).limit(1);
        structure = data?.[0] || null;
      }
    }
    if (!structure && quoteSource === "public_retail") {
      const { data } = await db
        .from("quote_pricing_structures")
        .select("*")
        .eq("pricing_mode", "public_retail")
        .eq("is_active", true)
        .limit(1);
      structure = data?.[0] || null;
    }
    if (!structure) {
      const rules = prototypeMirrorRules();
      return {
        structure: {
          id: null,
          code: "PROTOTYPE_V101",
          name: "Prototype v1.01 mirror (DB miss)",
          pricing_mode: quoteSource === "public_retail" ? "public_retail" : "partner",
          retail_markup_percent: MIN_PUBLIC_RETAIL_MARKUP
        },
        rules,
        effectiveRetailMarkupPercent: MIN_PUBLIC_RETAIL_MARKUP,
        fallbackCode: "PROTOTYPE_V101"
      };
    }
    const { data: rulesRows, error: rErr } = await db
      .from("quote_pricing_rules")
      .select("*")
      .eq("pricing_structure_id", structure.id)
      .eq("is_active", true);
    const rules = !rErr && Array.isArray(rulesRows) && rulesRows.length ? rulesRows : prototypeMirrorRules();
    const m = Number(structure.retail_markup_percent) || 0;
    const eff = structure.pricing_mode === "public_retail" ? Math.max(m, MIN_PUBLIC_RETAIL_MARKUP) : m;
    return { structure, rules, effectiveRetailMarkupPercent: eff };
  } catch (caughtErr) {
    // Foundation tables not installed yet — safe fallback for all sources.
    if (isMissingPricingTable(caughtErr)) {
      const rules = prototypeMirrorRules();
      return {
        structure: {
          id: null,
          code: "PROTOTYPE_V101",
          name: "Prototype mirror (foundation not installed)",
          pricing_mode: quoteSource === "public_retail" ? "public_retail" : "partner",
          retail_markup_percent: quoteSource === "public_retail" ? MIN_PUBLIC_RETAIL_MARKUP : 20
        },
        rules,
        effectiveRetailMarkupPercent: quoteSource === "public_retail" ? MIN_PUBLIC_RETAIL_MARKUP : 20,
        fallbackCode: "PROTOTYPE_V101"
      };
    }
    // partner_quote must fail closed on any unexpected DB/runtime error — never silently use
    // prototype pricing when the partner has a real pricing structure that errored during lookup.
    if (quoteSource === "partner_quote") {
      throw caughtErr;
    }
    // internal_quote / public_retail / partner_portal: preserve existing fallback behavior.
    const rules = prototypeMirrorRules();
    return {
      structure: {
        id: null,
        code: "PROTOTYPE_V101",
        name: "Prototype mirror (error)",
        pricing_mode: "partner",
        retail_markup_percent: 20
      },
      rules,
      effectiveRetailMarkupPercent: 20,
      fallbackCode: "PROTOTYPE_V101"
    };
  }
}

function prototypeMirrorRules() {
  const rows = [];
  for (const [name, price] of Object.entries(PROTOTYPE_TIER_PRICE_PER_SQFT)) {
    rows.push({
      category: "material_group",
      item_code: `GROUP_${name.replace(/\s+/g, "_").toUpperCase()}`,
      item_name: name,
      unit_type: "per_sqft",
      price
    });
  }
  for (const [code, spec] of Object.entries(PROTOTYPE_ADDON_UNIT_PRICES)) {
    if (code === "tearout") {
      rows.push({ category: "tearout", item_code: "tearout", item_name: spec.name, unit_type: "flat", price: spec.price });
    } else {
      rows.push({ category: "cutout", item_code: code, item_name: spec.name, unit_type: "each", price: spec.price });
    }
  }
  return rows;
}

/**
 * Main entry: returns totals + snapshot; ignores any `input.clientTotals` if present.
 * @param {Record<string, unknown>} rawInput
 * @param {{ rules?: unknown[], structure?: Record<string,unknown>, pricing_mode?: string, db?: unknown }} pricingContext
 */
export async function calculateQuote(rawInput, pricingContext = {}) {
  const input = normalizePrototypeQuoteInput(rawInput);
  const warnings = [];
  let resolved = pricingContext;
  if (!resolved?.rules) {
    resolved = await resolvePricingStructure({
      quoteSource: input.quoteSource,
      partnerAccountId: rawInput?.partnerAccountId ?? null,
      requestedPricingStructureId: rawInput?.pricingStructureId ?? null,
      db: pricingContext?.db
    });
  }
  const rules = Array.isArray(resolved.rules) ? resolved.rules : prototypeMirrorRules();
  const mode = String(resolved.structure?.pricing_mode || "partner");
  /** For public_retail line items: `1 + effectiveRetailMarkupPercent/100` (matches `applyRetailProtection`). */
  const publicMarkupMult =
    mode === "public_retail"
      ? 1 +
        Number(resolved.effectiveRetailMarkupPercent ?? resolved.structure?.retail_markup_percent ?? MIN_PUBLIC_RETAIL_MARKUP) /
          100
      : 1;

  let wholesale = 0;
  let detail = {};
  if (mode === "public_retail") {
    if (input.engine === "rooms" && input.rooms.length) {
      const agg = sumRoomsPublicPlanning(input, rules, publicMarkupMult);
      wholesale = round2(agg.directTotal);
      detail = { kind: "rooms", ...agg, isPublicPlanning: true };
    } else {
      const leg = legacyDirectPublic(input, rules, publicMarkupMult);
      wholesale = round2(leg.directTotal);
      detail = { kind: "legacy", ...leg, isPublicPlanning: true };
    }
  } else if (input.engine === "rooms" && input.rooms.length) {
    input.qualifyingKitchenCounterSf = qualifyingKitchenCounterSfFromInput(input);
    const agg = sumRoomsWholesale(input, rules);
    const vanityPart = calculateVanities(input, rules);
    wholesale = round2(agg.wholesale + vanityPart.total);
    detail = { kind: "rooms", ...agg, vanityPart };
    for (const w of agg.upgradedEdgePart?.warnings ?? []) warnings.push(w);
  } else {
    const leg = legacyWholesale(input, rules);
    wholesale = leg.wholesale;
    detail = { kind: "legacy", ...leg };
  }

  let retail = wholesale;
  let retailMeta = {};
  if (mode === "public_retail") {
    const m = Number(resolved.effectiveRetailMarkupPercent ?? resolved.structure?.retail_markup_percent ?? 25);
    retailMeta = applyRetailProtection({ wholesale, retailMarkupPercent: m, pricingMode: "public_retail" });
    retail = retailMeta.retail;
    if (retailMeta.enforcedMin) warnings.push(`Retail markup raised to minimum ${MIN_PUBLIC_RETAIL_MARKUP}% for public_retail.`);
  } else if (String(input.quoteSource) === "internal_quote") {
    retailMeta = {
      wholesale,
      retail: wholesale,
      profit: 0,
      appliedMarkupPercent: 0,
      method: "Internal rate book",
      percent: 0,
      flatAdd: 0
    };
    retail = wholesale;
  } else {
    retailMeta = applyPartnerRetailDisplay(wholesale, {
      method: input.retailMethod,
      percent: input.retailMarkupPercent,
      flatAdd: input.retailFlatAdd
    });
    retail = retailMeta.retail;
  }

  /** Internal/partner custom lines: entered $ is final for this mode (no public 25%). */
  let customPassTotal = 0;
  /** @type {Array<Record<string, unknown>>} */
  const customPassLines = [];
  /** @type {Array<Record<string, unknown>>} */
  const validatedCustomLineItems = [];
  if (mode !== "public_retail") {
    for (const row of input.customPassthroughItems || []) {
      const desc = String(row.description ?? row.name ?? "").trim();
      const q = Number(row.qty ?? row.quantity ?? 1) || 0;
      const p = Number(row.price ?? row.unit_price ?? 0) || 0;
      if (!desc || q <= 0 || p <= 0) continue;
      const sub = round2(q * p);
      customPassTotal += sub;
      customPassLines.push({
        line_type: "custom_pass",
        category: "custom_addon",
        item_code: "CUSTOM",
        item_name: desc,
        room_name: null,
        quantity: q,
        unit_type: "each",
        unit_price: p,
        line_subtotal: sub
      });
    }
    for (const row of input.customLineItems || []) {
      const name = String(row.name || "").trim();
      const cat = String(row.category || "Other").trim() || "Other";
      const q = Number(row.quantity || 0) || 0;
      const p = Number(row.unitPrice || 0) || 0;
      const isDisc = cat === "Discount/Credit";
      if (!name || q <= 0) continue;
      if (!isDisc && p === 0) continue;
      if (isDisc && p >= 0) {
        warnings.push(`Custom line "${name}": Discount/Credit requires a negative unit price. Skipped.`);
        continue;
      }
      if (!isDisc && p < 0) {
        warnings.push(`Custom line "${name}": negative unit price is only allowed for Discount/Credit. Skipped.`);
        continue;
      }
      const sub = round2(q * p);
      customPassTotal += sub;
      validatedCustomLineItems.push({
        name,
        description: row.description,
        category: cat,
        quantity: q,
        unitPrice: p,
        line_total: sub,
        customerFacing: row.customerFacing,
        internalNote: row.internalNote,
        roomName: row.roomName,
        roomId: row.roomId,
        lineKey: row.lineKey
      });
      customPassLines.push({
        line_type: "custom_line_item",
        category: `custom_${String(cat).replace(/[^\w]+/g, "_").toLowerCase()}`,
        item_code: "CUSTOM_LINE",
        item_name: name,
        room_name: row.roomName || null,
        quantity: q,
        unit_type: "each",
        unit_price: p,
        line_subtotal: sub
      });
    }
    customPassTotal = round2(customPassTotal);
  }

  if (customPassTotal !== 0) {
    wholesale = round2(wholesale + customPassTotal);
    retail = round2(retail + customPassTotal);
  }

  const totals = {
    wholesale: round2(wholesale),
    retail: round2(retail),
    profit: round2(retail - wholesale),
    estimated_sqft: round2((detail.counter || input.areas.countertopSqft) + (detail.splash || input.areas.backsplashSqft))
  };

  const lineItems = [...buildLineItems(detail, input, totals, mode, publicMarkupMult), ...customPassLines];

  const materialBreakdown = detail.kind === "rooms" && Array.isArray(detail.materialBreakdown) ? detail.materialBreakdown : [];
  const snapshot = buildCalculationSnapshot(input, resolved, totals, {
    warnings,
    material_breakdown: materialBreakdown,
    custom_line_items: validatedCustomLineItems,
    estimate_rooms: input.rooms || []
  });
  snapshot.lineItems = lineItems;
  if (String(input.quoteSource) === "internal_quote") {
    const policy = detail.materialUseTaxPolicy ?? resolveInternalEstimateMaterialTaxPolicy();
    const useTaxAmount =
      detail.kind === "rooms"
        ? Number(detail.useTaxAmount) || 0
        : detail.kind === "legacy"
          ? Number(detail.useTaxAmount) || 0
          : 0;
    const countertopMaterialUseTaxAmount =
      detail.kind === "rooms"
        ? Number(detail.countertopMaterialUseTaxAmount) || 0
        : detail.kind === "legacy"
          ? Number(detail.countertopMaterialUseTaxAmount) || 0
          : 0;
    const backsplashMaterialUseTaxAmount =
      detail.kind === "rooms"
        ? Number(detail.backsplashMaterialUseTaxAmount) || 0
        : detail.kind === "legacy"
          ? Number(detail.backsplashMaterialUseTaxAmount) || 0
          : 0;
    snapshot.internal_estimate_math = {
      version: 1,
      internal_material_basis: input.internalMaterialBasis,
      no_partner_or_public_markup_percent: true,
      use_tax:
        useTaxAmount > 0
          ? { percent: policy.materialUseTaxPercent, amount: useTaxAmount, applied: true }
          : { percent: 0, amount: 0, applied: false },
      material_use_tax: {
        materialUseTaxPercent: policy.materialUseTaxPercent,
        materialUseTaxScope: policy.materialUseTaxScope,
        countertopMaterialUseTaxAmount,
        backsplashMaterialUseTaxAmount,
        totalMaterialUseTaxAmount: useTaxAmount,
        taxPolicySnapshot: policy
      }
    };
    const oocDetail = detail.outOfCollectionPremium;
    if (oocDetail && Number(oocDetail.premiumAmount) > 0) {
      const oocPolicy = resolveOutOfCollectionPricingPolicy();
      snapshot.internal_estimate_math.out_of_collection = {
        materialProgramDefault: input.materialProgramDefault,
        outOfCollectionPremiumPercent: Number(oocDetail.premiumPercent) || 0,
        outOfCollectionPremiumAmount: Number(oocDetail.premiumAmount) || 0,
        outOfCollectionEligibleMaterialAmount: Number(oocDetail.eligibleTotal) || 0,
        outOfCollectionPremiumScope: oocPolicy.premiumScope,
        outOfCollectionPolicySnapshot: oocPolicy,
        rooms: Array.isArray(oocDetail.rooms) ? oocDetail.rooms : []
      };
    }
    if (detail.kind === "rooms" && detail.upgradedEdgePart) {
      snapshot.internal_estimate_math.upgraded_edge_pricing = {
        rate_per_lf: detail.upgradedEdgePart.rate,
        rate_source: detail.upgradedEdgePart.rateSource,
        total: detail.upgradedEdgePart.total,
        room_count: detail.upgradedEdgePart.lines.length,
        has_manual: detail.upgradedEdgePart.hasManual ?? false,
        pricing_basis: input.internalMaterialBasis ?? "wholesale"
      };
    }
    if (detail.kind === "rooms" && Array.isArray(detail.roomMeasurementSummaries)) {
      snapshot.room_measurement_summaries = detail.roomMeasurementSummaries;
    }
  }
  if (rawInput.readiness && typeof rawInput.readiness === "object") snapshot.readiness = rawInput.readiness;
  if (rawInput.fileChecklist && typeof rawInput.fileChecklist === "object") snapshot.file_checklist = rawInput.fileChecklist;
  if (rawInput.file_checklist && typeof rawInput.file_checklist === "object") snapshot.file_checklist = rawInput.file_checklist;

  return {
    ok: true,
    totals,
    snapshot,
    lineItems,
    detail,
    warnings,
    pricing: {
      structureCode: resolved.structure?.code,
      pricingMode: mode,
      appliedRetailMarkupPercent: retailMeta.appliedMarkupPercent ?? null
    }
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Public-facing estimate dollars: round UP to the nearest $10 (whole dollars, no cents in homeowner UI).
 * @param {number|unknown} value
 * @returns {number}
 */
export function roundPublicEstimateToNearestTen(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

/**
 * Adds `*_display` fields for homeowner presentation. Exact `countertop` / `total` etc. unchanged.
 * @param {ReadonlyArray<Record<string, unknown>>|null|undefined} estimatesByGroup
 * @returns {Record<string, unknown>[]}
 */
export function enrichPublicConsumerEstimatesForDisplay(estimatesByGroup) {
  if (!Array.isArray(estimatesByGroup)) return [];
  return estimatesByGroup.map((r) => {
    const countertop = Number(r.countertop) || 0;
    const backsplash = Number(r.backsplash) || 0;
    const addons = Number(r.addons) || 0;
    const total = Number(r.total) || 0;
    return {
      ...r,
      countertop_display: roundPublicEstimateToNearestTen(countertop),
      backsplash_display: roundPublicEstimateToNearestTen(backsplash),
      addons_display: roundPublicEstimateToNearestTen(addons),
      total_display: roundPublicEstimateToNearestTen(total)
    };
  });
}

function buildLineItems(detail, input, totals, pricingMode = "", publicMult = 1) {
  const pubMult = pricingMode === "public_retail" ? publicMult : 1;
  const lines = [];
  if (detail.kind === "legacy") {
    const ct = detail.areas.countertopSqft;
    const bs = detail.areas.backsplashSqft;
    const qty = ct + bs;
    if (qty > 0 && detail.rate != null) {
      lines.push({
        line_type: "material",
        category: "material_group",
        item_code: String(detail.materialGroup || "").replace(/\s+/g, "_").toUpperCase(),
        item_name: String(detail.materialGroup || "Material"),
        room_name: null,
        quantity: round2(qty),
        unit_type: "per_sqft",
        unit_price: detail.rate,
        line_subtotal: round2(ct * detail.rate + bs * detail.rate)
      });
    }
    for (const ln of detail.addOnPart?.lines || []) {
      lines.push({
        line_type: "addon",
        category: "cutout",
        item_code: ln.item_code,
        item_name: ln.item_name,
        quantity: ln.quantity,
        unit_type: "each",
        unit_price: round2(ln.unit_price * pubMult),
        line_subtotal: round2(ln.line_subtotal * pubMult)
      });
    }
    for (const ln of detail.vanityPart?.lines || []) {
      lines.push({
        line_type: "vanity",
        category: "vanity",
        item_code: ln.item_code,
        item_name: ln.item_name,
        quantity: ln.quantity,
        unit_type: "each",
        unit_price: round2(ln.unit_price * pubMult),
        line_subtotal: round2(ln.line_subtotal * pubMult)
      });
    }
  } else if (detail.kind === "rooms") {
    let order = 0;
    for (const r of detail.roomLines || []) {
      const piece = r.pieceLabel ? ` — ${r.pieceLabel}` : "";
      const color = r.materialColor ? ` — ${r.materialColor}` : "";
      lines.push({
        line_type: "material",
        category: "material_group",
        item_code: String(r.group || "").replace(/\s+/g, "_").toUpperCase(),
        item_name: `${String(r.room || "Room")}${piece}${color} (${String(r.group || "")})`,
        room_name: String(r.room || ""),
        quantity: round2((r.roomCounter || 0) + (r.roomSplash || 0)),
        unit_type: "per_sqft",
        unit_price: r.rate,
        line_subtotal: round2(r.subtotal),
        sort_order: r.sort_order != null ? r.sort_order : order++
      });
    }
    for (const ln of detail.addOnPart?.lines || []) {
      lines.push({
        line_type: "addon",
        category: "cutout",
        item_code: ln.item_code,
        item_name: ln.item_name,
        quantity: ln.quantity,
        unit_type: "each",
        unit_price: round2(ln.unit_price * pubMult),
        line_subtotal: round2(ln.line_subtotal * pubMult)
      });
    }
    for (const ln of detail.upgradedEdgePart?.lines || []) {
      lines.push({
        line_type: "addon",
        category: "edge",
        item_code: ln.item_code,
        item_name: ln.item_name,
        room_name: ln.room_name,
        quantity: ln.quantity,
        unit_type: ln.unit_type ?? "per_lf",
        unit_price: ln.unit_price,
        edge_mode: ln.edge_mode ?? null,
        // internal_reason is stored only on manual edge lines — must not appear in customer-facing output
        internal_reason: ln.internal_reason ?? null,
        miter_height: ln.miter_height ?? null,
        line_subtotal: round2(ln.line_subtotal)
      });
    }
  }
  return lines;
}

/** Display order for multi-tier public consumer estimates (ESF Direct tier names). */
export const PUBLIC_CONSUMER_MATERIAL_GROUPS = Object.freeze(Object.keys(ESF_DIRECT_PRICE_PER_SQFT));

/**
 * Public-safe per-group estimates: countertop / backsplash / add-ons / total per tier.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup (or structure's `retail_markup_percent` when higher).
 * Does not return internal ESF Direct-only totals to the client.
 * @param {Record<string, unknown>} rawInput
 * @param {{ db?: unknown, rules?: unknown[], structure?: Record<string,unknown> } | Record<string, unknown>} pricingContext
 */
export async function computePublicConsumerEstimatesByGroup(rawInput, pricingContext = {}) {
  const warnings = [];
  const input = normalizePrototypeQuoteInput({ ...rawInput, quoteSource: "public_retail" });
  if (input.engine === "rooms" && input.rooms?.length) {
    warnings.push(
      "Per-group public comparison for room-by-room engine is not supported yet — use legacy areas for public consumer."
    );
    return { ok: true, quote_source: "public_consumer", estimates_by_group: [], warnings, appliedRetailMarkupPercent: null };
  }

  let resolved = pricingContext;
  if (!resolved?.rules) {
    resolved = await resolvePricingStructure({
      quoteSource: "public_retail",
      partnerAccountId: null,
      requestedPricingStructureId: null,
      db: pricingContext?.db
    });
  }
  const rules = Array.isArray(resolved.rules) ? resolved.rules : prototypeMirrorRules();
  const m = Number(resolved.effectiveRetailMarkupPercent ?? resolved.structure?.retail_markup_percent ?? MIN_PUBLIC_RETAIL_MARKUP);

  const fromRules = [
    ...new Set(
      rules.filter((r) => String(r.category) === "material_group").map((r) => String(r.item_name || "").trim())
    )
  ].filter(Boolean);
  const ordered = fromRules.length
    ? PUBLIC_CONSUMER_MATERIAL_GROUPS.filter((g) => fromRules.includes(g)).concat(
        fromRules.filter((g) => !PUBLIC_CONSUMER_MATERIAL_GROUPS.includes(g))
      )
    : [...PUBLIC_CONSUMER_MATERIAL_GROUPS];

  const estimates = [];
  let appliedRetailMarkupPercent = m;
  const rateMult = 1 + m / 100;
  for (const group of ordered) {
    const directR = directPricePerSqftForGroup(group);
    const publicR = round2(directR * rateMult);
    const ct = Number(input.areas?.countertopSqft) || 0;
    const bs = Number(input.areas?.backsplashSqft) || 0;
    const countertop = round2(ct * publicR);
    const backsplash = round2(bs * publicR);
    const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
    const vanityPart = calculateVanities(input, rules);
    const addDirect = (addOnPart.total || 0) + (vanityPart.total || 0);
    const addons = round2(addDirect * rateMult);
    const total = round2(countertop + backsplash + addons);
    estimates.push({ group, countertop, backsplash, addons, total });
  }

  return {
    ok: true,
    quote_source: "public_consumer",
    estimates_by_group: enrichPublicConsumerEstimatesForDisplay(estimates),
    warnings,
    appliedRetailMarkupPercent
  };
}

/**
 * Dev/sanity checks for public planning math (Direct × markup). Throws if expectations drift.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 */
export function verifyPublicPlanningPricingSanity() {
  const rateMult = 1.25;
  const aCt = round2(10 * 77 * rateMult);
  if (aCt !== 962.5) throw new Error(`sanity A: expected countertop 962.5, got ${aCt}`);
  const sinkOnly = round2(200 * rateMult);
  if (sinkOnly !== 250) throw new Error(`sanity B: expected addons 250, got ${sinkOnly}`);
  const promoR = 70 * rateMult;
  const cTotal = round2(45 * promoR + 12 * promoR + (200 + 150) * rateMult);
  if (cTotal !== 5425) throw new Error(`sanity C: expected 5425, got ${cTotal}`);
  const enriched = enrichPublicConsumerEstimatesForDisplay([
    { group: "Group Promo", countertop: 3937.5, backsplash: 1050, addons: 437.5, total: 5425 }
  ]);
  if (enriched[0]?.total_display !== 5430) {
    throw new Error(`sanity display: expected Promo total_display 5430, got ${enriched[0]?.total_display}`);
  }
  return { ok: true };
}
