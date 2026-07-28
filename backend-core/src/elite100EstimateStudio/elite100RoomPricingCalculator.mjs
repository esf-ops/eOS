/**
 * Elite 100 authoritative room-pricing calculator (Brain-side, server-only).
 *
 * calculateElite100Estimate({ scope, configuration, pricingContext }) is the single
 * canonical Elite 100 Studio calculator. It is a NEW calculator identity
 * (pricingEngine "elite100-room-pricing-v1", pricingVersion 4) — it does not
 * replace, reinterpret, or recalculate anything saved under pricingVersion 1-3
 * (see studioEstimatePricing.mjs / quoteCalculator.js, both left unchanged).
 *
 * Contract (semantic split — the exact field names below are this module's
 * canonical shape; see elite100RoomPricingStudioAdapter.mjs for translation
 * from the existing Studio scope JSON):
 *
 * scope (estimator-owned, fixed physical facts):
 *   {
 *     estimateId, organizationId, accountId, partnerAccountId,
 *     pricingBasis: "direct_retail" | "wholesale" (also accepts legacy "direct"),
 *     rooms: [{
 *       id, name, roomType, included?,
 *       backsplashEligibleRunLengthIn?,  // optional room aggregate
 *       edgeFinishedLf?,                 // optional room aggregate (used when no per-piece LF given)
 *       pieces: [{
 *         id, name, pieceType, lengthIn, depthIn, quantity?, included?,
 *         directArea?,                   // approved override of measured sqft
 *         finishedEdgeLf?,               // approved finished-edge LF for this piece
 *         backsplashRunLengthIn?,        // approved backsplash-eligible run length (in)
 *         waterfallSegmentLengthsIn?: { left?, right?, front?, back? }
 *       }]
 *     }],
 *     customLines: [{
 *       id, description, roomId (null = estimate-level), quantity?, unitPrice?, fixedAmount?,
 *       kind: "charge"|"discount"|"credit",
 *       customerFacing: true|false,     // true (default) = own line item; false = folded into
 *                                        // Countertop Material, still charged, not named
 *       commercialRole?                 // optional explicit override using the existing
 *                                        // studioCommercialLines STUDIO_COMMERCIAL_ROLES vocabulary
 *                                        // (e.g. "internal_only" / "absorbed") — required to reach
 *                                        // those two legacy-only roles, which a bare customerFacing
 *                                        // boolean cannot express.
 *     }]
 *   }
 *
 * configuration (customer-owned, mutable choices), keyed by room id:
 *   {
 *     rooms: {
 *       [roomId]: {
 *         materialGroup,                 // selected color's resolved Elite 100 group
 *         edgeProfile?, pieceEdgeProfiles?: { [pieceId]: token },
 *         backsplash?: { selected, heightIn? },
 *         sideSplashes?: { [pieceId]: "none"|"left"|"right"|"both" },
 *         waterfalls?: [{ id, targetPieceId, side, legHeightIn, backsidePolish?, miterKey? }],
 *         miter?: { lf, key },           // standalone (non-waterfall) mitered edge
 *         sinks?: [{ id, sinkKind: "kitchen"|"vanity", productId?, quantity? }],
 *         cutouts?: { cooktopQuantity?, electricalOutletQuantity? },
 *         products?: [{ id, productId, quantity?, optionIds? }],
 *         vanityProgram?: { useStandardPricing?, remnantQualifies?, additionalTrips?, sinkType? }
 *       }
 *     }
 *   }
 *
 * The browser never supplies rates, tax percentages, account adjustments,
 * formulas, or line totals — pricingContext only carries server-resolved
 * config (env, db, optional pre-resolved Pricing Admin rate overrides).
 */

import { ceilBillableSquareFeet } from "../quotes/billableSquareFeet.mjs";
import {
  ESF_DIRECT_PRICE_PER_SQFT,
  PROTOTYPE_TIER_PRICE_PER_SQFT,
  roundPublicEstimateToNearestTen
} from "../quotes/quoteCalculator.js";
import {
  ALL_EDGE_PROFILES,
  edgeProfileDisplayLabel,
  isPremiumEdgeProfile,
  normalizeEdgeProfileToken
} from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";
import { getCatalogMeta, getProductById } from "../digitalEstimate/catalog/esfPlumbingCatalog.mjs";
import {
  readTrustedPartnerAccountConfig,
  isSpahnTrustedPartner,
  isWattsTrustedPartner,
  SPAHN_ESTIMATE_ADJUSTMENT_PERCENT,
  WATTS_PROMO_RATE_PER_SF
} from "./studioEstimateTrustedAccounts.mjs";
import { MATERIAL_GROUPS } from "./studioEstimateTypes.mjs";
import {
  STUDIO_COMMERCIAL_ROLES,
  commercialRoleAffectsCustomerTotal,
  commercialRoleIsPublicNamed,
  commercialRoleUsesStoneAbsorption
} from "./studioCommercialLines.mjs";
import { INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT } from "../quotes/internalEstimateMaterialTaxPolicy.js";
import { STANDARD_VANITY_DEPTH_IN } from "../quotes/vanitySideSplash.js";
import {
  defaultVanityKitchenTier,
  priceVanityProgram2026FromPayload,
  VANITY_PROGRAM_2026_BY_CODE,
  VANITY_PROGRAM_YEAR,
  VANITY_TIER_THRESHOLD_SQFT
} from "../quotes/vanityProgram2026.js";

/** New calculator identity — distinct from quoteCalculator/studioEstimatePricing pricingVersion 1-3. */
export const ELITE100_ROOM_PRICING_ENGINE = "elite100-room-pricing-v1";
export const ELITE100_ROOM_PRICING_VERSION = 4;

/**
 * Direct/Retail $/SF book — identical to the existing ESF Direct authority
 * (quoteCalculator.ESF_DIRECT_PRICE_PER_SQFT); reused rather than duplicated.
 */
export const ELITE100_DIRECT_RATE_PER_SF = ESF_DIRECT_PRICE_PER_SQFT;

/**
 * Wholesale $/SF book for the elite100-room-pricing-v1 engine.
 *
 * DECISION (intentional, isolated new-version divergence — not a bug):
 * Remnant Wholesale is $45/SF here, exactly as specified for this new
 * calculator/pricing version. Legacy pricingVersion 1-3
 * (quoteCalculator.PROTOTYPE_TIER_PRICE_PER_SQFT) keeps Remnant Wholesale at
 * the historically locked $50/SF (see pricingAuthority.contract.test.mjs +
 * studioEstimatePricing.test.mjs) — that legacy table is NOT modified by this
 * module, so old snapshots/tests are unaffected. Do not "fix" this back to $50.
 */
export const ELITE100_WHOLESALE_RATE_PER_SF = Object.freeze({
  ...PROTOTYPE_TIER_PRICE_PER_SQFT,
  Remnant: 45
});

/** All three upgraded profiles price at one flat rate regardless of pricing basis (new for v4). */
export const ELITE100_UPGRADED_EDGE_RATE_PER_LF = 15;

/** Miter $/LF by height key — same governed keys/rates used elsewhere (no new labels). */
export const ELITE100_MITER_RATE_PER_LF = Object.freeze({
  "2-3in": 65,
  "4in": 70,
  "5in": 75,
  "6in": 80
});

export const ELITE100_CUTOUT_RATES = Object.freeze({
  kitchenSink: 200,
  vanitySink: 100,
  cooktop: 150,
  electricalOutlet: 30
});

export const ELITE100_WATERFALL_LABOR_PER_LEG = 600;
export const ELITE100_BACKSIDE_POLISH = 225;
export const ELITE100_TEAROUT = 750;
export const ELITE100_BUILDUP_RATE_PER_SF = 20;
export const ELITE100_ADDITIONAL_VANITY_TRIP = 150;
export const ELITE100_MATERIAL_USE_TAX_PERCENT = INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT;
export const ELITE100_BACKSPLASH_HEIGHT_STANDARD_IN = 4;
export const ELITE100_SIDE_SPLASH_HEIGHT_IN = 4;
export const ELITE100_VANITY_STANDARD_DEPTH_IN = STANDARD_VANITY_DEPTH_IN;

/** Customer-safe eight-profile edge catalog for the new engine (no W/D edge). */
export const ELITE100_EDGE_PROFILES = ALL_EDGE_PROFILES;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * @param {unknown} raw
 * @returns {"direct_retail"|"wholesale"}
 */
export function normalizeElite100PricingBasis(raw) {
  const b = String(raw ?? "").trim().toLowerCase();
  if (b === "wholesale") return "wholesale";
  // "direct_retail" | "direct" | "retail" | "" all normalize to the same Direct/Retail book.
  return "direct_retail";
}

function normalizeElite100MaterialGroup(raw) {
  const g = String(raw ?? "").trim();
  return MATERIAL_GROUPS.includes(g) ? g : "Group Promo";
}

/**
 * Resolve $/SF for a material group. Never silently produces zero: an
 * unresolvable group falls back to Group Promo's rate with a rate-source flag
 * rather than 0. Accepts an optional pre-resolved Pricing Admin override map
 * (`pricingContext.materialRateOverrides.{direct_retail|wholesale}`) —
 * otherwise uses this module's exact fallback tables (Pricing Admin
 * parity for the v4 tables, in particular Remnant Wholesale, has not been
 * established yet).
 *
 * @param {{
 *   materialGroup: string,
 *   pricingBasis: string,
 *   partnerAccountId?: string|null,
 *   env?: NodeJS.ProcessEnv,
 *   pricingContext?: object
 * }} params
 */
export function resolveElite100MaterialRatePerSf(params) {
  const group = normalizeElite100MaterialGroup(params.materialGroup);
  const basis = normalizeElite100PricingBasis(params.pricingBasis);
  const table = basis === "wholesale" ? ELITE100_WHOLESALE_RATE_PER_SF : ELITE100_DIRECT_RATE_PER_SF;
  const overrides = params.pricingContext?.materialRateOverrides?.[basis];
  let rate;
  let rateSource;
  if (overrides && Number.isFinite(Number(overrides[group]))) {
    rate = Number(overrides[group]);
    rateSource = "pricing_admin_override";
  } else {
    rate = Number(table[group]);
    rateSource = "elite100_v4_fallback_table";
  }
  let wattsOverrideApplied = false;
  const cfg = readTrustedPartnerAccountConfig(params.env);
  if (group === "Group Promo" && isWattsTrustedPartner(params.partnerAccountId, cfg)) {
    rate = WATTS_PROMO_RATE_PER_SF;
    wattsOverrideApplied = true;
    rateSource = "watts_trusted_promo";
  }
  if (!Number.isFinite(rate)) {
    rate = Number(table["Group Promo"]);
    rateSource = "elite100_v4_fallback_default_promo";
  }
  return { rate, group, basis, rateSource, wattsOverrideApplied };
}

function measuredPieceSqft(piece) {
  if (piece?.directArea != null && Number.isFinite(Number(piece.directArea))) {
    return Math.max(0, Number(piece.directArea));
  }
  const l = Math.max(0, Number(piece?.lengthIn) || 0);
  const d = Math.max(0, Number(piece?.depthIn) || 0);
  const q = piece?.quantity == null ? 1 : Math.max(0, Number(piece.quantity) || 0);
  return (l * d * q) / 144;
}

function isBacksplashPiece(piece) {
  return String(piece?.pieceType ?? "").toLowerCase().includes("backsplash");
}

function waterfallWidthForSide(piece, side) {
  const segs =
    piece?.waterfallSegmentLengthsIn && typeof piece.waterfallSegmentLengthsIn === "object"
      ? piece.waterfallSegmentLengthsIn
      : null;
  if (segs && Number(segs[side]) > 0) return Number(segs[side]);
  if (side === "left" || side === "right") return Math.max(0, Number(piece?.depthIn) || 0);
  if (side === "front" || side === "back") return Math.max(0, Number(piece?.lengthIn) || 0);
  return 0;
}

/**
 * "Qualifying kitchen counter SF" for Vanity Program tier selection — sum of
 * MEASURED (exact, not billed/ceiled) countertop SF across all non-vanity
 * rooms. Matches the existing qualifyingKitchenCounterSfFromInput precedent
 * (quoteCalculator.js) and is intentionally unceiled so a boundary value like
 * 34.99 SF resolves to the under-35 tier (not rounded up to 35 first).
 *
 * @param {Array<object>} rooms
 */
export function computeElite100QualifyingKitchenCounterSf(rooms) {
  let sf = 0;
  for (const room of Array.isArray(rooms) ? rooms : []) {
    if (!room || room.included === false) continue;
    if (String(room.roomType ?? "").trim().toLowerCase() === "vanity") continue;
    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    for (const piece of pieces) {
      if (!piece || piece.included === false || isBacksplashPiece(piece)) continue;
      sf += measuredPieceSqft(piece);
    }
  }
  return round2(sf);
}

/**
 * Resolve one product selection from the existing active ESF plumbing/specialty
 * catalog. Never invents a price: unknown, inactive, or unpriced products
 * return a structured review-required result instead of a $0/guessed amount.
 *
 * @param {{
 *   productId?: string|null, quantity?: number, optionIds?: string[],
 *   catalogLookupImpl?: typeof getProductById
 * }} params
 */
export function resolveElite100ProductSelection(params) {
  const qty = Math.max(0, Math.floor(Number(params?.quantity ?? 1) || 0));
  const id = params?.productId != null ? String(params.productId).trim() : "";
  if (!id || qty <= 0) return null;
  const lookup = params?.catalogLookupImpl || getProductById;
  const product = lookup(id);
  if (!product) {
    return {
      productId: id,
      quantity: qty,
      name: null,
      category: null,
      unitPrice: null,
      lineTotal: null,
      active: false,
      reviewRequired: true,
      reason: "product not found in the active catalog"
    };
  }
  if (product.active !== true) {
    return {
      productId: id,
      quantity: qty,
      name: product.displayName || id,
      category: product.category || null,
      unitPrice: null,
      lineTotal: null,
      active: false,
      reviewRequired: true,
      reason: "product is inactive"
    };
  }
  const priced = product.pricingTreatment !== "review_only" && Number(product.sellPrice) > 0;
  if (!priced) {
    return {
      productId: id,
      quantity: qty,
      name: product.displayName || id,
      category: product.category || null,
      unitPrice: null,
      lineTotal: null,
      active: true,
      reviewRequired: true,
      reason: "product has no resolved catalog price"
    };
  }
  const unitPrice = Number(product.sellPrice);
  return {
    productId: id,
    quantity: qty,
    name: product.displayName || id,
    category: product.category || null,
    optionIds: Array.isArray(params?.optionIds) ? params.optionIds.slice() : [],
    unitPrice,
    lineTotal: round2(unitPrice * qty),
    active: true,
    reviewRequired: false,
    reason: null
  };
}

/**
 * Vanity Program qualification + fixed bundle pricing. Bowl configuration
 * (single/double) is derived from the room's selected sink count (1 => "_S",
 * 2 => "_D") rather than a separate customer field, since the program table's
 * bowl count IS the sink count. Width comes from the vanity piece's approved
 * lengthIn (estimator-owned physical geometry); depth must be exactly 22.5in.
 *
 * @param {{
 *   piece: object|null,
 *   sinkCount: number,
 *   materialGroup: string,
 *   vanityConfig: object,
 *   qualifyingKitchenCounterSf: number
 * }} args
 */
export function evaluateElite100VanityProgram(args) {
  const { piece, sinkCount, materialGroup, vanityConfig, qualifyingKitchenCounterSf } = args;
  const disqualifyReasons = [];
  if (vanityConfig?.useStandardPricing === true) disqualifyReasons.push("standard_pricing_requested");

  const depthIn = Number(piece?.depthIn);
  const depthOk = Number.isFinite(depthIn) && Math.abs(depthIn - ELITE100_VANITY_STANDARD_DEPTH_IN) < 0.01;
  if (!depthOk) disqualifyReasons.push("depth_not_22_5");

  const widthIn = Number(piece?.lengthIn);
  const bowlLetter = sinkCount === 2 ? "D" : sinkCount === 1 ? "S" : null;
  if (bowlLetter == null) disqualifyReasons.push("sink_count_not_1_or_2");
  const code = bowlLetter && Number.isFinite(widthIn) ? `${widthIn}_${bowlLetter}` : null;
  const tableRow = code ? VANITY_PROGRAM_2026_BY_CODE[code] : null;
  if (bowlLetter != null && !tableRow) disqualifyReasons.push("table_row_not_found");

  const materialOk =
    materialGroup === "Group Promo" || (materialGroup === "Remnant" && vanityConfig?.remnantQualifies === true);
  if (!materialOk) disqualifyReasons.push("material_not_qualifying");

  if (disqualifyReasons.length) {
    return {
      qualifies: false,
      disqualifyReasons,
      code: code || null,
      tier: defaultVanityKitchenTier(qualifyingKitchenCounterSf)
    };
  }

  const priced = priceVanityProgram2026FromPayload(
    {
      code,
      qty: 1,
      sinkType: vanityConfig?.sinkType || "oval_white",
      extraTrips: Math.max(0, Math.floor(Number(vanityConfig?.additionalTrips) || 0))
    },
    qualifyingKitchenCounterSf
  );

  return {
    qualifies: true,
    disqualifyReasons: [],
    code,
    programYear: priced.programYear,
    label: priced.label,
    tier: priced.tier,
    baseUnit: priced.baseUnit,
    sinkUpgradeTotal: priced.sinkUpgradeTotal,
    extraTripsTotal: priced.extraTripsTotal,
    bundleExactTotal: priced.exactTotal
  };
}

const CUSTOM_LINE_KINDS = new Set(["charge", "discount", "credit"]);
const VALID_COMMERCIAL_ROLES = new Set(Object.values(STUDIO_COMMERCIAL_ROLES));

/**
 * Normalize one estimator-created job-specific line to the existing Studio
 * commercial-line role vocabulary (studioCommercialLines.mjs) rather than a
 * parallel enum, so INTERNAL_ONLY/ABSORBED historical behavior is reused
 * as-is. `commercialRole` (when a valid existing role) wins outright — this
 * is the only way to reach INTERNAL_ONLY/ABSORBED, since a bare
 * `customerFacing` boolean cannot express them. Otherwise the role is
 * inferred from `kind` + `customerFacing`:
 *   kind "discount"           -> DISCOUNT
 *   kind "credit"             -> CREDIT
 *   kind "charge", facing     -> CUSTOMER_CHARGE (own line item)
 *   kind "charge", not facing -> LEGACY_HIDDEN_CUSTOMER_CHARGE (folded into
 *                                 Countertop Material, still charged, unnamed)
 *
 * @param {object} raw
 * @param {number} index
 */
export function normalizeElite100CustomLine(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? `custom-${index + 1}`);
  const description = String(raw.description ?? raw.name ?? "").trim() || `Custom line ${index + 1}`;
  const roomId = raw.roomId != null && String(raw.roomId).trim() ? String(raw.roomId).trim() : null;
  const kind = CUSTOM_LINE_KINDS.has(raw.kind) ? raw.kind : "charge";

  const explicitRole = VALID_COMMERCIAL_ROLES.has(raw.commercialRole) ? raw.commercialRole : null;
  let role = explicitRole;
  if (!role) {
    if (kind === "discount") role = STUDIO_COMMERCIAL_ROLES.DISCOUNT;
    else if (kind === "credit") role = STUDIO_COMMERCIAL_ROLES.CREDIT;
    else
      role =
        raw.customerFacing === false
          ? STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE
          : STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE;
  }

  const hasFixedAmount = raw.fixedAmount != null && Number.isFinite(Number(raw.fixedAmount));
  const quantity = hasFixedAmount ? 1 : Math.max(0, Number(raw.quantity ?? 1) || 0);
  const unitPrice = raw.unitPrice != null && Number.isFinite(Number(raw.unitPrice)) ? Number(raw.unitPrice) : 0;
  const magnitude = hasFixedAmount ? Number(raw.fixedAmount) : round2(quantity * unitPrice);
  const isNegativeRole = role === STUDIO_COMMERCIAL_ROLES.DISCOUNT || role === STUDIO_COMMERCIAL_ROLES.CREDIT;
  const amount = isNegativeRole ? -Math.abs(magnitude) : magnitude;

  return {
    id,
    description,
    roomId,
    quantity,
    unitPrice: hasFixedAmount ? null : unitPrice,
    fixedAmount: hasFixedAmount ? Number(raw.fixedAmount) : null,
    kind,
    commercialRole: role,
    affectsCustomerTotal: commercialRoleAffectsCustomerTotal(role),
    publicNamed: commercialRoleIsPublicNamed(role),
    foldedIntoCountertopMaterial: commercialRoleUsesStoneAbsorption(role),
    amount: round2(amount)
  };
}

function sumAmount(lines) {
  return round2((lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0));
}

/** Edge charge for one room. A qualifying Vanity Program bundle always includes its edge (no separate charge). */
function calculateElite100RoomEdge({ room, roomConfig, counterPieces, bundled }) {
  const defaultToken = normalizeEdgeProfileToken(roomConfig?.edgeProfile || "edge_eased");
  if (bundled) {
    return {
      profile: defaultToken,
      profileLabel: edgeProfileDisplayLabel(defaultToken),
      tier: isPremiumEdgeProfile(defaultToken) ? "premium" : "free",
      lf: 0,
      ratePerLf: 0,
      amount: 0,
      byPiece: null,
      bundledIncluded: true
    };
  }

  const pieceOverrides =
    roomConfig?.pieceEdgeProfiles && typeof roomConfig.pieceEdgeProfiles === "object"
      ? roomConfig.pieceEdgeProfiles
      : {};
  const hasPieceLf = counterPieces.some((p) => Number(p.finishedEdgeLf) > 0);

  if (!hasPieceLf) {
    const roomLf = Math.max(0, Number(room?.edgeFinishedLf) || 0);
    const premium = isPremiumEdgeProfile(defaultToken);
    const rate = premium ? ELITE100_UPGRADED_EDGE_RATE_PER_LF : 0;
    return {
      profile: defaultToken,
      profileLabel: edgeProfileDisplayLabel(defaultToken),
      tier: premium ? "premium" : "free",
      lf: roomLf,
      ratePerLf: rate,
      amount: round2(roomLf * rate),
      byPiece: null,
      bundledIncluded: false
    };
  }

  const byPiece = [];
  let amount = 0;
  let totalLf = 0;
  for (const piece of counterPieces) {
    const lf = Math.max(0, Number(piece.finishedEdgeLf) || 0);
    if (lf <= 0) continue;
    const token = normalizeEdgeProfileToken(pieceOverrides[piece.id] ?? defaultToken);
    const premium = isPremiumEdgeProfile(token);
    const rate = premium ? ELITE100_UPGRADED_EDGE_RATE_PER_LF : 0;
    const pieceAmount = round2(lf * rate);
    amount = round2(amount + pieceAmount);
    totalLf = round2(totalLf + lf);
    byPiece.push({ pieceId: piece.id ?? null, profile: token, tier: premium ? "premium" : "free", lf, ratePerLf: rate, amount: pieceAmount });
  }
  // The room's `defaultToken` is only a fallback seed for per-piece resolution — it is
  // NOT the label authority once per-piece results exist. The customer-facing identity
  // must instead describe what was actually charged: the distinct set of premium
  // profiles among `byPiece`. A per-piece Knife override must never surface as the
  // room's unset/mismatched default (e.g. "Eased") just because no room-wide
  // `edgeProfile` was set.
  const chargedProfiles = Array.from(new Set(byPiece.filter((p) => p.tier === "premium").map((p) => p.profile)));
  let resolvedProfile = defaultToken;
  let resolvedLabel = edgeProfileDisplayLabel(defaultToken);
  let resolvedTier = "free";
  if (chargedProfiles.length === 1) {
    resolvedProfile = chargedProfiles[0];
    resolvedLabel = edgeProfileDisplayLabel(chargedProfiles[0]);
    resolvedTier = "premium";
  } else if (chargedProfiles.length > 1) {
    // Multiple distinct upgraded profiles were actually charged — name that
    // truthfully rather than arbitrarily picking one of them.
    resolvedProfile = null;
    resolvedLabel = "Mixed profiles";
    resolvedTier = "mixed";
  }
  return {
    profile: resolvedProfile,
    profileLabel: resolvedLabel,
    tier: resolvedTier,
    lf: totalLf,
    ratePerLf: ELITE100_UPGRADED_EDGE_RATE_PER_LF,
    amount,
    byPiece,
    bundledIncluded: false
  };
}

/**
 * @param {{
 *   room: object, roomConfig: object, scope: object, pricingBasis: string,
 *   pricingContext: object, qualifyingKitchenCounterSf: number, roomCustomLines: Array<object>
 * }} args
 */
function calculateElite100Room(args) {
  const { room, roomConfig, scope, pricingBasis, pricingContext, qualifyingKitchenCounterSf, roomCustomLines } = args;
  const warnings = [];
  const unresolved = [];

  const roomId = String(room?.id ?? "");
  const roomName = String(room?.name ?? roomId ?? "Room");
  const roomType = String(room?.roomType ?? "").trim();
  const isVanityRoomType = roomType.toLowerCase() === "vanity";

  const pieces = (Array.isArray(room?.pieces) ? room.pieces : []).filter((p) => p && p.included !== false);
  const counterPieces = pieces.filter((p) => !isBacksplashPiece(p));

  const materialGroup = normalizeElite100MaterialGroup(roomConfig?.materialGroup);
  if (!roomConfig?.materialGroup) {
    warnings.push({
      code: "material_group_missing",
      message: `Room "${roomName}": no material/color selected — defaulted to ${materialGroup}.`
    });
  }
  const rateInfo = resolveElite100MaterialRatePerSf({
    materialGroup,
    pricingBasis,
    partnerAccountId: scope?.partnerAccountId,
    env: pricingContext?.env,
    pricingContext
  });

  // Geometry — always computed for audit, even when a Vanity Program bundle replaces the $ charge.
  let measuredCountertopSf = 0;
  let billedCountertopSf = 0;
  const pieceSections = [];
  for (const piece of counterPieces) {
    const measured = round2(measuredPieceSqft(piece));
    const billed = ceilBillableSquareFeet(measured);
    measuredCountertopSf = round2(measuredCountertopSf + measured);
    billedCountertopSf += billed;
    pieceSections.push({ pieceId: piece.id ?? null, pieceName: piece.name ?? null, measuredSf: measured, billedSf: billed });
  }

  // Vanity Program qualification.
  let vanityProgram = null;
  const vanityConfig = roomConfig?.vanityProgram || {};
  const primaryPiece = isVanityRoomType ? counterPieces[0] || null : null;
  const sinkSelections = Array.isArray(roomConfig?.sinks) ? roomConfig.sinks : [];
  const vanitySinkCount = sinkSelections.reduce(
    (s, sink) => s + Math.max(0, Math.floor(Number(sink?.quantity ?? 1) || 0)),
    0
  );
  if (isVanityRoomType && primaryPiece) {
    vanityProgram = evaluateElite100VanityProgram({
      piece: primaryPiece,
      sinkCount: vanitySinkCount,
      materialGroup,
      vanityConfig,
      qualifyingKitchenCounterSf
    });
  }
  const bundled = Boolean(vanityProgram?.qualifies);

  // Countertop material.
  const countertopMaterialSubtotal = bundled ? 0 : round2(billedCountertopSf * rateInfo.rate);

  // Backsplash (skipped when bundled — the program includes a standard backsplash).
  let backsplashSelected = false;
  let backsplashMeasuredSf = 0;
  let backsplashBilledSf = 0;
  let backsplashHeightIn = null;
  let backsplashMaterialSubtotal = 0;
  if (!bundled) {
    const bsConfig = roomConfig?.backsplash;
    backsplashSelected = Boolean(bsConfig?.selected);
    if (backsplashSelected) {
      let runLengthIn = Number(room?.backsplashEligibleRunLengthIn);
      if (!Number.isFinite(runLengthIn) || runLengthIn < 0) {
        runLengthIn = counterPieces.reduce((s, p) => {
          let rl = Number(p.backsplashRunLengthIn);
          if ((!Number.isFinite(rl) || rl < 0) && isVanityRoomType) rl = Number(p.lengthIn) || 0;
          return s + (Number.isFinite(rl) && rl > 0 ? rl : 0);
        }, 0);
      }
      backsplashHeightIn = Number(bsConfig.heightIn) > 0 ? Number(bsConfig.heightIn) : ELITE100_BACKSPLASH_HEIGHT_STANDARD_IN;
      if (!(runLengthIn > 0)) {
        unresolved.push({
          code: "backsplash_run_length_unresolved",
          message: `Room "${roomName}": backsplash selected but no approved run length is available.`
        });
      }
      backsplashMeasuredSf = round2((Math.max(0, runLengthIn) * backsplashHeightIn) / 144);
      backsplashBilledSf = ceilBillableSquareFeet(backsplashMeasuredSf);
      backsplashMaterialSubtotal = round2(backsplashBilledSf * rateInfo.rate);
    }
  } else if (roomConfig?.backsplash?.selected) {
    warnings.push({
      code: "vanity_program_backsplash_included",
      message: `Room "${roomName}": backsplash is included in the Vanity Program bundle — no separate charge.`
    });
  }

  // Side splashes — always priced when selected, even inside a qualifying bundle ("outside the fixed package").
  const sideSplashSelections =
    roomConfig?.sideSplashes && typeof roomConfig.sideSplashes === "object" ? roomConfig.sideSplashes : {};
  let sideSplashMeasuredSf = 0;
  let sideSplashBilledSf = 0;
  const sideSplashDetails = [];
  for (const piece of counterPieces) {
    const sel = String(sideSplashSelections[piece.id] ?? "none").toLowerCase();
    const sides = sel === "both" ? 2 : sel === "left" || sel === "right" ? 1 : 0;
    if (sides <= 0) continue;
    const depth = Math.max(0, Number(piece.depthIn) || 0);
    const measured = round2((depth * ELITE100_SIDE_SPLASH_HEIGHT_IN * sides) / 144);
    const billed = ceilBillableSquareFeet(measured);
    sideSplashMeasuredSf = round2(sideSplashMeasuredSf + measured);
    sideSplashBilledSf += billed;
    sideSplashDetails.push({ pieceId: piece.id ?? null, selection: sel, measuredSf: measured, billedSf: billed });
  }
  const sideSplashMaterialSubtotal = round2(sideSplashBilledSf * rateInfo.rate);

  // Waterfalls — always available regardless of bundling.
  const waterfallSelections = Array.isArray(roomConfig?.waterfalls) ? roomConfig.waterfalls : [];
  const waterfallResults = [];
  let waterfallMeasuredSf = 0;
  let waterfallBilledSf = 0;
  let waterfallMaterialSubtotal = 0;
  let waterfallTaxTotal = 0;
  let waterfallLaborTotal = 0;
  let waterfallPolishTotal = 0;
  let waterfallMiterTotal = 0;
  for (const wf of waterfallSelections) {
    const targetPiece = counterPieces.find((p) => String(p.id) === String(wf?.targetPieceId));
    if (!targetPiece) {
      unresolved.push({
        code: "waterfall_target_piece_missing",
        message: `Room "${roomName}": waterfall references unknown piece "${wf?.targetPieceId}".`
      });
      continue;
    }
    const side = String(wf?.side ?? "").toLowerCase();
    const width = waterfallWidthForSide(targetPiece, side);
    if (!(width > 0)) {
      unresolved.push({
        code: "waterfall_width_unresolved",
        message: `Room "${roomName}": waterfall on piece "${targetPiece.id}" (${side || "unspecified side"}) has no resolvable width.`
      });
      continue;
    }
    const legHeightIn = Math.max(0, Number(wf?.legHeightIn) || 0);
    const measuredSf = round2((width * legHeightIn) / 144);
    const billedSf = ceilBillableSquareFeet(measuredSf);
    const materialAmount = round2(billedSf * rateInfo.rate);
    const taxAmount = round2(materialAmount * (ELITE100_MATERIAL_USE_TAX_PERCENT / 100));
    const laborAmount = ELITE100_WATERFALL_LABOR_PER_LEG;
    const polishAmount = wf?.backsidePolish === true ? ELITE100_BACKSIDE_POLISH : 0;
    const miterLf = round2(width / 12);
    const miterKey = wf?.miterKey ? String(wf.miterKey) : null;
    const miterRate = miterKey ? ELITE100_MITER_RATE_PER_LF[miterKey] ?? null : null;
    if (miterKey && miterRate == null) {
      warnings.push({
        code: "waterfall_unknown_miter_key",
        message: `Room "${roomName}": waterfall miter key "${miterKey}" is not recognized — miter charge omitted.`
      });
    }
    const miterAmount = round2(miterLf * (miterRate || 0));
    const total = round2(materialAmount + taxAmount + laborAmount + polishAmount + miterAmount);

    waterfallMeasuredSf = round2(waterfallMeasuredSf + measuredSf);
    waterfallBilledSf += billedSf;
    waterfallMaterialSubtotal = round2(waterfallMaterialSubtotal + materialAmount);
    waterfallTaxTotal = round2(waterfallTaxTotal + taxAmount);
    waterfallLaborTotal = round2(waterfallLaborTotal + laborAmount);
    waterfallPolishTotal = round2(waterfallPolishTotal + polishAmount);
    waterfallMiterTotal = round2(waterfallMiterTotal + miterAmount);

    waterfallResults.push({
      id: wf?.id ?? null,
      targetPieceId: targetPiece.id ?? null,
      side,
      legHeightIn,
      measuredSf,
      billedSf,
      materialRatePerSf: rateInfo.rate,
      materialAmount,
      taxAmount,
      laborAmount,
      backsidePolish: wf?.backsidePolish === true,
      polishAmount,
      miterKey,
      miterLf,
      miterRatePerLf: miterRate || 0,
      miterAmount,
      total
    });
  }

  const edge = calculateElite100RoomEdge({ room, roomConfig, counterPieces, bundled });

  // Standalone (non-waterfall) mitered edge.
  let standaloneMiter = null;
  const roomMiter = roomConfig?.miter;
  if (roomMiter && Number(roomMiter.lf) > 0) {
    const key = String(roomMiter.key ?? "");
    const rate = ELITE100_MITER_RATE_PER_LF[key] ?? null;
    if (rate == null) {
      warnings.push({
        code: "room_miter_unknown_key",
        message: `Room "${roomName}": miter key "${key}" is not recognized — miter charge omitted.`
      });
    } else {
      standaloneMiter = { lf: Number(roomMiter.lf), key, ratePerLf: rate, amount: round2(Number(roomMiter.lf) * rate) };
    }
  }

  // Cutouts + sinks (skipped separately when bundled — included in the program price).
  const cutouts = {
    kitchenSinkQty: 0,
    kitchenSinkCharge: 0,
    vanitySinkQty: 0,
    vanitySinkCharge: 0,
    cooktopQty: 0,
    cooktopCharge: 0,
    electricalOutletQty: 0,
    electricalOutletCharge: 0
  };
  const sinkLines = [];
  if (!bundled) {
    for (const sink of sinkSelections) {
      const qty = Math.max(0, Math.floor(Number(sink?.quantity ?? 1) || 0));
      if (qty <= 0) continue;
      const kind = String(sink?.sinkKind ?? "kitchen").toLowerCase() === "kitchen" ? "kitchen" : "vanity";
      const cutoutRate = kind === "kitchen" ? ELITE100_CUTOUT_RATES.kitchenSink : ELITE100_CUTOUT_RATES.vanitySink;
      const cutoutCharge = round2(cutoutRate * qty);
      if (kind === "kitchen") {
        cutouts.kitchenSinkQty += qty;
        cutouts.kitchenSinkCharge = round2(cutouts.kitchenSinkCharge + cutoutCharge);
      } else {
        cutouts.vanitySinkQty += qty;
        cutouts.vanitySinkCharge = round2(cutouts.vanitySinkCharge + cutoutCharge);
      }
      let product = null;
      if (sink?.productId) {
        product = resolveElite100ProductSelection({
          productId: sink.productId,
          quantity: qty,
          catalogLookupImpl: pricingContext?.catalogLookupImpl
        });
        if (product?.reviewRequired) {
          unresolved.push({
            code: "sink_product_review_required",
            message: `Room "${roomName}": sink product "${sink.productId}" — ${product.reason}.`
          });
        }
      }
      sinkLines.push({
        id: sink?.id ?? null,
        sinkKind: kind,
        quantity: qty,
        cutoutRatePerEach: cutoutRate,
        cutoutCharge,
        product,
        customerSupplied: !sink?.productId
      });
    }
  } else if (sinkSelections.length) {
    warnings.push({
      code: "vanity_program_sink_included",
      message: `Room "${roomName}": sink + sink cutout are included in the Vanity Program bundle.`
    });
  }
  const cutoutConfig = roomConfig?.cutouts || {};
  const cooktopQty = Math.max(0, Math.floor(Number(cutoutConfig.cooktopQuantity) || 0));
  if (cooktopQty > 0) {
    cutouts.cooktopQty = cooktopQty;
    cutouts.cooktopCharge = round2(cooktopQty * ELITE100_CUTOUT_RATES.cooktop);
  }
  const outletQty = Math.max(0, Math.floor(Number(cutoutConfig.electricalOutletQuantity) || 0));
  if (outletQty > 0) {
    cutouts.electricalOutletQty = outletQty;
    cutouts.electricalOutletCharge = round2(outletQty * ELITE100_CUTOUT_RATES.electricalOutlet);
  }
  const sinkProductsTotal = round2(
    sinkLines.reduce((s, l) => s + (l.product && !l.product.reviewRequired ? l.product.lineTotal : 0), 0)
  );
  const cutoutsTotal = round2(
    cutouts.kitchenSinkCharge + cutouts.vanitySinkCharge + cutouts.cooktopCharge + cutouts.electricalOutletCharge
  );

  // Products (faucets / accessories) — always priced, bundled or not.
  const productSelections = Array.isArray(roomConfig?.products) ? roomConfig.products : [];
  const productLines = [];
  for (const sel of productSelections) {
    const qty = Math.max(0, Math.floor(Number(sel?.quantity ?? 1) || 0));
    if (qty <= 0) continue;
    const resolved = resolveElite100ProductSelection({
      productId: sel?.productId,
      quantity: qty,
      optionIds: sel?.optionIds,
      catalogLookupImpl: pricingContext?.catalogLookupImpl
    });
    if (!resolved) continue;
    if (resolved.reviewRequired) {
      unresolved.push({
        code: "product_review_required",
        message: `Room "${roomName}": product "${sel?.productId}" — ${resolved.reason}.`
      });
    }
    productLines.push({ id: sel?.id ?? null, ...resolved });
  }
  const productsTotal = round2(productLines.reduce((s, l) => s + (l.reviewRequired ? 0 : l.lineTotal || 0), 0));

  // Additional trip (non-program vanities only — program trips are already inside bundleExactTotal).
  let nonProgramTripAmount = 0;
  if (!bundled && isVanityRoomType && Number(vanityConfig?.additionalTrips) > 0) {
    nonProgramTripAmount = round2(Number(vanityConfig.additionalTrips) * ELITE100_ADDITIONAL_VANITY_TRIP);
  }

  // Material use tax — 2% of actual stone-material sections only (never bundle price, labor, cutouts, products, polish, miter).
  const countertopTaxAmount = round2(countertopMaterialSubtotal * (ELITE100_MATERIAL_USE_TAX_PERCENT / 100));
  const backsplashTaxAmount = round2(backsplashMaterialSubtotal * (ELITE100_MATERIAL_USE_TAX_PERCENT / 100));
  const sideSplashTaxAmount = round2(sideSplashMaterialSubtotal * (ELITE100_MATERIAL_USE_TAX_PERCENT / 100));
  const materialUseTaxAmount = round2(countertopTaxAmount + backsplashTaxAmount + sideSplashTaxAmount + waterfallTaxTotal);

  // Custom lines scoped to this room (role-driven — see normalizeElite100CustomLine).
  const customerFacingLines = roomCustomLines.filter((l) => l.publicNamed);
  const hiddenCustomerChargeLines = roomCustomLines.filter((l) => l.foldedIntoCountertopMaterial);
  const internalOnlyLines = roomCustomLines.filter((l) => l.commercialRole === STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY);
  const absorbedLines = roomCustomLines.filter((l) => l.commercialRole === STUDIO_COMMERCIAL_ROLES.ABSORBED);
  const customerFacingLinesTotal = sumAmount(customerFacingLines);
  const hiddenCustomerChargeTotal = sumAmount(hiddenCustomerChargeLines);
  const internalOnlyTotal = sumAmount(internalOnlyLines);
  const absorbedTotal = sumAmount(absorbedLines);

  const countertopBaseAmount = bundled ? vanityProgram.bundleExactTotal : countertopMaterialSubtotal;
  const countertopMaterialDisplayAmount = round2(countertopBaseAmount + hiddenCustomerChargeTotal);

  const exactTotal = round2(
    countertopBaseAmount +
      backsplashMaterialSubtotal +
      sideSplashMaterialSubtotal +
      waterfallMaterialSubtotal +
      materialUseTaxAmount +
      edge.amount +
      (standaloneMiter?.amount || 0) +
      waterfallLaborTotal +
      waterfallPolishTotal +
      waterfallMiterTotal +
      cutoutsTotal +
      sinkProductsTotal +
      productsTotal +
      nonProgramTripAmount +
      customerFacingLinesTotal +
      hiddenCustomerChargeTotal
  );
  // internalOnlyTotal / absorbedTotal intentionally excluded — never affect the customer total.

  return {
    roomId,
    roomName,
    roomType,
    materialGroup,
    pricingBasis: rateInfo.basis,
    materialRatePerSf: rateInfo.rate,
    materialRateSource: rateInfo.rateSource,
    wattsOverrideApplied: rateInfo.wattsOverrideApplied,
    measuredCountertopSf,
    billedCountertopSf,
    pieceSections,
    bundled,
    countertopMaterialSubtotal,
    backsplash: {
      selected: backsplashSelected,
      heightIn: backsplashHeightIn,
      measuredSf: backsplashMeasuredSf,
      billedSf: backsplashBilledSf,
      materialSubtotal: backsplashMaterialSubtotal,
      taxAmount: backsplashTaxAmount
    },
    backsplashMaterialSubtotal,
    sideSplash: {
      measuredSf: sideSplashMeasuredSf,
      billedSf: sideSplashBilledSf,
      materialSubtotal: sideSplashMaterialSubtotal,
      taxAmount: sideSplashTaxAmount,
      details: sideSplashDetails
    },
    sideSplashMaterialSubtotal,
    waterfalls: waterfallResults,
    waterfallMeasuredSf,
    waterfallBilledSf,
    waterfallMaterialSubtotal,
    waterfallTaxTotal,
    waterfallLaborTotal,
    waterfallPolishTotal,
    waterfallMiterTotal,
    edge,
    standaloneMiter,
    cutouts,
    cutoutsTotal,
    sinks: sinkLines,
    sinkProductsTotal,
    products: productLines,
    productsTotal,
    vanityProgram,
    nonProgramTripAmount,
    countertopTaxAmount,
    materialUseTaxAmount,
    materialUseTaxPercent: ELITE100_MATERIAL_USE_TAX_PERCENT,
    customerFacingLines,
    hiddenCustomerChargeLines,
    internalOnlyLines,
    absorbedLines,
    customerFacingLinesTotal,
    hiddenCustomerChargeTotal,
    internalOnlyTotal,
    absorbedTotal,
    countertopMaterialDisplayAmount,
    exactTotal,
    warnings,
    unresolved
  };
}

function buildElite100PricingSnapshot(args) {
  const { scope, pricingBasis, pricingContext, roomResults, qualifyingKitchenCounterSf, calculatedAt, warnings, unresolved, totals } =
    args;
  const cfg = readTrustedPartnerAccountConfig(pricingContext?.env);
  return {
    pricingEngine: ELITE100_ROOM_PRICING_ENGINE,
    pricingVersion: ELITE100_ROOM_PRICING_VERSION,
    calculatedAt,
    priceBookBasis: pricingBasis,
    materialRateSourcesByRoom: roomResults.map((r) => ({ roomId: r.roomId, group: r.materialGroup, rateSource: r.materialRateSource })),
    materialRateTable: pricingBasis === "wholesale" ? ELITE100_WHOLESALE_RATE_PER_SF : ELITE100_DIRECT_RATE_PER_SF,
    edgeCatalog: ELITE100_EDGE_PROFILES.map((p) => ({ token: p.optionToken, label: p.label, tier: p.tier })),
    edgeUpgradedRatePerLf: ELITE100_UPGRADED_EDGE_RATE_PER_LF,
    miterRatesPerLf: ELITE100_MITER_RATE_PER_LF,
    waterfallRules: {
      laborPerLeg: ELITE100_WATERFALL_LABOR_PER_LEG,
      backsidePolish: ELITE100_BACKSIDE_POLISH,
      materialUseTaxPercent: ELITE100_MATERIAL_USE_TAX_PERCENT
    },
    cutoutRates: ELITE100_CUTOUT_RATES,
    vanityProgramTable: VANITY_PROGRAM_2026_BY_CODE,
    vanityProgramYear: VANITY_PROGRAM_YEAR,
    vanityProgramTierThresholdSqft: VANITY_TIER_THRESHOLD_SQFT,
    additionalVanityTrip: ELITE100_ADDITIONAL_VANITY_TRIP,
    qualifyingKitchenCounterSf,
    materialUseTaxPercent: ELITE100_MATERIAL_USE_TAX_PERCENT,
    accountRuleResult: {
      wattsTrusted: isWattsTrustedPartner(scope.partnerAccountId, cfg),
      spahnTrusted: isSpahnTrustedPartner(scope.partnerAccountId, cfg),
      spahnAdjustmentPercent: SPAHN_ESTIMATE_ADJUSTMENT_PERCENT
    },
    productCatalogMeta: getCatalogMeta(),
    totals,
    warnings,
    unresolved
  };
}

/**
 * Customer-safe projection of one room result. Never exposes wholesale rates,
 * raw $/SF economics, internal markup, internal-only/absorbed costs, or
 * account-rule identifiers.
 * @param {object} room calculateElite100Room() output
 */
export function toCustomerSafeElite100RoomResult(room) {
  const lineItems = [];
  if (room.countertopMaterialDisplayAmount > 0 || room.bundled) {
    lineItems.push({ label: "Countertop Material", amount: room.countertopMaterialDisplayAmount });
  }
  if (room.materialUseTaxAmount > 0) lineItems.push({ label: "Material Use Tax", amount: room.materialUseTaxAmount });
  if (room.backsplashMaterialSubtotal > 0) lineItems.push({ label: "Backsplash", amount: room.backsplashMaterialSubtotal });
  if (room.sideSplashMaterialSubtotal > 0) lineItems.push({ label: "Side Splash", amount: room.sideSplashMaterialSubtotal });
  const waterfallTotal = round2(
    room.waterfallMaterialSubtotal + room.waterfallLaborTotal + room.waterfallPolishTotal + room.waterfallMiterTotal
  );
  if (waterfallTotal > 0) lineItems.push({ label: "Waterfall", amount: waterfallTotal });
  if (room.edge?.amount > 0) lineItems.push({ label: `Edge — ${room.edge.profileLabel}`, amount: room.edge.amount });
  if (room.standaloneMiter?.amount > 0) lineItems.push({ label: "Miter", amount: room.standaloneMiter.amount });
  if (room.cutoutsTotal > 0) lineItems.push({ label: "Cutouts", amount: room.cutoutsTotal });
  if (room.sinkProductsTotal > 0) lineItems.push({ label: "Sinks", amount: room.sinkProductsTotal });
  if (room.productsTotal > 0) lineItems.push({ label: "Products", amount: room.productsTotal });
  if (room.nonProgramTripAmount > 0) lineItems.push({ label: "Additional Trip", amount: room.nonProgramTripAmount });
  for (const line of room.customerFacingLines || []) {
    lineItems.push({ label: line.description, amount: line.amount });
  }
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    materialGroup: room.materialGroup,
    vanityProgram: room.vanityProgram?.qualifies
      ? { qualifies: true, label: room.vanityProgram.label, tier: room.vanityProgram.tier }
      : null,
    lineItems,
    total: room.exactTotal,
    warnings: (room.warnings || []).map((w) => w.message),
    unresolved: (room.unresolved || []).map((w) => w.message)
  };
}

/**
 * Customer-safe projection of the full estimate result.
 * @param {object} estimate calculateElite100Estimate() output
 */
export function toCustomerSafeElite100EstimateResult(estimate) {
  const estimateLineItems = [];
  if (estimate.estimateLevelCountertopMaterialAllocation > 0) {
    estimateLineItems.push({ label: "Countertop Material", amount: estimate.estimateLevelCountertopMaterialAllocation });
  }
  for (const l of estimate.estimateCustomLines?.customerFacing || []) {
    estimateLineItems.push({ label: l.description, amount: l.amount });
  }
  return {
    pricingEngine: estimate.pricingEngine,
    pricingVersion: estimate.pricingVersion,
    calculatedAt: estimate.calculatedAt,
    rooms: (estimate.rooms || []).map(toCustomerSafeElite100RoomResult),
    estimateLineItems,
    total: estimate.totals?.displayTotal,
    exactTotal: estimate.totals?.exactTotal,
    warnings: (estimate.warnings || []).map((w) => (typeof w === "string" ? w : w.message)),
    unresolved: (estimate.unresolved || []).map((w) => (typeof w === "string" ? w : w.message))
  };
}

/**
 * The one canonical Elite 100 room-pricing calculator.
 *
 * @param {{ scope: object, configuration?: object, pricingContext?: object }} args
 */
export async function calculateElite100Estimate(args = {}) {
  const scope = args.scope && typeof args.scope === "object" ? args.scope : {};
  const configuration = args.configuration && typeof args.configuration === "object" ? args.configuration : {};
  const pricingContext = args.pricingContext && typeof args.pricingContext === "object" ? args.pricingContext : {};

  const rooms = (Array.isArray(scope.rooms) ? scope.rooms : []).filter((r) => r && r.included !== false);
  const pricingBasis = normalizeElite100PricingBasis(scope.pricingBasis);
  const configRooms = configuration.rooms && typeof configuration.rooms === "object" ? configuration.rooms : {};

  const warnings = [];
  const unresolved = [];

  const customLinesRaw = Array.isArray(scope.customLines) ? scope.customLines : [];
  const customLines = customLinesRaw.map((l, i) => normalizeElite100CustomLine(l, i)).filter(Boolean);

  const qualifyingKitchenCounterSf = computeElite100QualifyingKitchenCounterSf(rooms);

  const roomResults = [];
  for (const room of rooms) {
    const roomId = String(room.id ?? "");
    const roomConfig = configRooms[roomId] || {};
    const roomCustomLines = customLines.filter((l) => l.roomId === roomId);
    const result = calculateElite100Room({
      room,
      roomConfig,
      scope,
      pricingBasis,
      pricingContext,
      qualifyingKitchenCounterSf,
      roomCustomLines
    });
    roomResults.push(result);
    warnings.push(...result.warnings);
    unresolved.push(...result.unresolved);
  }

  const estimateCustomLines = customLines.filter((l) => l.roomId == null);
  const estimateCustomerFacing = estimateCustomLines.filter((l) => l.publicNamed);
  const estimateHidden = estimateCustomLines.filter((l) => l.foldedIntoCountertopMaterial);
  const estimateInternalOnly = estimateCustomLines.filter(
    (l) => l.commercialRole === STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY
  );
  const estimateAbsorbed = estimateCustomLines.filter((l) => l.commercialRole === STUDIO_COMMERCIAL_ROLES.ABSORBED);
  const estimateCustomerFacingTotal = sumAmount(estimateCustomerFacing);
  const estimateHiddenTotal = sumAmount(estimateHidden);
  const estimateInternalOnlyTotal = sumAmount(estimateInternalOnly);
  const estimateAbsorbedTotal = sumAmount(estimateAbsorbed);

  const roomTotalsSum = round2(roomResults.reduce((s, r) => s + r.exactTotal, 0));
  const preAccountTotal = round2(roomTotalsSum + estimateCustomerFacingTotal + estimateHiddenTotal);

  const cfg = readTrustedPartnerAccountConfig(pricingContext.env);
  const wattsTrusted = isWattsTrustedPartner(scope.partnerAccountId, cfg);
  const spahnTrusted = isSpahnTrustedPartner(scope.partnerAccountId, cfg);
  const accountAdjustment = spahnTrusted ? round2(preAccountTotal * (SPAHN_ESTIMATE_ADJUSTMENT_PERCENT / 100)) : 0;

  const exactTotal = round2(preAccountTotal + accountAdjustment);
  const displayTotal = roundPublicEstimateToNearestTen(exactTotal);
  const exactInternalTotal = round2(exactTotal + estimateInternalOnlyTotal + estimateAbsorbedTotal);

  const calculatedAt = (pricingContext.now instanceof Date ? pricingContext.now : new Date()).toISOString();

  const totals = {
    roomTotalsSum,
    estimateCustomerFacingTotal,
    estimateHiddenCustomerChargeTotal: estimateHiddenTotal,
    accountAdjustment,
    exactTotal,
    displayTotal,
    exactInternalTotal,
    internalOnlyTotal: estimateInternalOnlyTotal,
    absorbedTotal: estimateAbsorbedTotal
  };

  const snapshot = buildElite100PricingSnapshot({
    scope,
    configuration,
    pricingBasis,
    pricingContext,
    roomResults,
    qualifyingKitchenCounterSf,
    calculatedAt,
    warnings,
    unresolved,
    totals
  });

  const result = {
    ok: true,
    pricingEngine: ELITE100_ROOM_PRICING_ENGINE,
    pricingVersion: ELITE100_ROOM_PRICING_VERSION,
    calculatedAt,
    estimateId: scope.estimateId ?? null,
    organizationId: scope.organizationId ?? null,
    pricingBasis,
    qualifyingKitchenCounterSf,
    rooms: roomResults,
    estimateCustomLines: {
      customerFacing: estimateCustomerFacing,
      hiddenCustomerCharge: estimateHidden,
      internalOnly: estimateInternalOnly,
      absorbed: estimateAbsorbed,
      hiddenCustomerChargeTotal: estimateHiddenTotal,
      internalOnlyTotal: estimateInternalOnlyTotal,
      absorbedTotal: estimateAbsorbedTotal
    },
    estimateLevelCountertopMaterialAllocation: estimateHiddenTotal,
    account: {
      partnerAccountId: scope.partnerAccountId ?? null,
      wattsTrusted,
      spahnTrusted,
      spahnAdjustmentPercent: spahnTrusted ? SPAHN_ESTIMATE_ADJUSTMENT_PERCENT : 0,
      accountAdjustment
    },
    totals,
    warnings,
    unresolved,
    snapshot
  };
  result.customerFacing = toCustomerSafeElite100EstimateResult(result);
  return result;
}
