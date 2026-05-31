/**
 * Prototype v1.01 quote math — structured mirror of ESF Quoting Tool - v1.01.html
 * for app-quote demos. Authoritative server math remains backend-core/src/quotes/quoteCalculator.js.
 */

import type { DemoLineItem } from "./demoFallback";
import type {
  GuidedPiece,
  GuidedShapeGroup,
  GuidedShapeGroupType,
  MathCheckSnapshot,
  MeasuredRoom,
  PieceShape,
  RoomDraft,
  RoomEngineTotals,
  VanityKitchenTier,
  VanitySinkType
} from "./quoteTypes";
import type { QuoteWorkflowMethod } from "./quoteTypes";
import {
  defaultVanityKitchenTier,
  legacySinkTypeFromVanityFields,
  priceVanityProgram2026,
  vanityProgramRateRow,
  VANITY_PROGRAM_YEAR,
  type VanityProgram2026Result
} from "./vanityProgram2026";
import {
  chargeableCounterSqftFromExact,
  chargeableSplashSqftFromExact,
  guidedCornerOverlapDeductionSf,
  guidedCornerOverlapDeductionSfForGroup,
  guidedCornerOverlapDeductionSfForPieces,
  qualifyingSfFromRoomDrafts,
  rapidLinearAreas,
  round2,
  sfFromGuidedPiece,
  STANDARD_BACKSPLASH_HEIGHT_IN,
  STANDARD_COUNTER_DEPTH_IN,
  sumGuidedPiecesByType
} from "./measurementEngine";
import {
  normalizeGuidedShapeRoom,
  normalizeGuidedShapeRooms,
  sumAllGuidedShapeGroups,
  totalGuidedCornerOverlapDeductionSf
} from "./guidedShapeGroups";

/** Internal Estimate measurement options (not used by public quote wizard). */
export type InternalMeasureOptions = {
  /** Elite rule: ceil final room counter SF for material pricing after all groups/pieces. */
  chargeableCounterCeil?: boolean;
};

export const INTERNAL_ESTIMATE_MEASURE_OPTIONS: InternalMeasureOptions = {
  chargeableCounterCeil: true
};

/**
 * Standard edge profiles — included in fabrication, no extra charge.
 * Default is "Eased" (3mm eased edge, most common shop default).
 */
export const STANDARD_EDGE_PROFILES = ["Eased", "Beveled", "Pencil", "Bullnose"] as const;

/**
 * Upgraded edge profiles — charged by linear foot via backend calculator.
 * Must stay in sync with `UPGRADED_EDGE_PROFILE_NAMES` in `quoteCalculator.js`.
 */
export const UPGRADED_EDGE_PROFILES = [
  "Full Bullnose",
  "Ogee",
  "Waterfall",
  "Laminated (mitered)",
  "Dupont"
] as const;

export type StandardEdgeProfile = (typeof STANDARD_EDGE_PROFILES)[number];
export type UpgradedEdgeProfile = (typeof UPGRADED_EDGE_PROFILES)[number];

/** Default edge profile when none is specified. */
export const DEFAULT_EDGE_PROFILE: StandardEdgeProfile = "Eased";

/**
 * Fallback edge rate for live preview only — matches `SPECIALTY_EDGE_RATE_PER_LF`
 * in `quoteCalculator.js`. Backend is authoritative for the submitted total.
 */
export const UPGRADED_EDGE_PREVIEW_RATE_PER_LF = 15;

const UPGRADED_EDGE_PROFILE_SET = new Set<string>(UPGRADED_EDGE_PROFILES);

/**
 * Compute a local upgraded edge charge for live preview from room drafts.
 * Returns total, per-room breakdown, and warnings for missing LF.
 * The backend calculator is authoritative; this is for sticky panel / customer display preview only.
 */
export function computeLocalUpgradedEdgeTotal(rooms: RoomDraft[]): {
  total: number;
  roomCount: number;
  warnings: string[];
} {
  let total = 0;
  let roomCount = 0;
  const warnings: string[] = [];
  for (const r of rooms) {
    if (!r.edgeProfile || !UPGRADED_EDGE_PROFILE_SET.has(r.edgeProfile)) continue;
    const lf = Number(r.upgradedEdgeLf) || 0;
    if (lf <= 0) {
      warnings.push(`${r.name}: upgraded edge "${r.edgeProfile}" — enter linear feet.`);
      continue;
    }
    total = round2(total + lf * UPGRADED_EDGE_PREVIEW_RATE_PER_LF);
    roomCount++;
  }
  return { total, roomCount, warnings };
}

export {
  defaultVanityKitchenTier,
  roundCustomerDisplayAddonLine,
  roundCustomerDisplayVanity,
  VANITY_PROGRAM_2026_RATES,
  VANITY_PROGRAM_YEAR
} from "./vanityProgram2026";
export const VANITY_TIER_THRESHOLD_SQFT = 35;

/** ESF Direct $/sqft by tier — public consumer planning uses this × (1 + planning markup %). */
export const ESF_DIRECT_TIER_RATES: ReadonlyArray<{ n: string; directPerSqft: number }> = [
  { n: "Group Promo", directPerSqft: 70 },
  { n: "Group A", directPerSqft: 77 },
  { n: "Group B", directPerSqft: 85 },
  { n: "Group C", directPerSqft: 95 },
  { n: "Group D", directPerSqft: 105 },
  { n: "Group E", directPerSqft: 120 },
  { n: "Group F", directPerSqft: 135 }
];

/** Prototype v1.01 tier $/sf (partner / dealer economics mirror — not public consumer material rates). */
export const PROTOTYPE_TIERS: ReadonlyArray<{ n: string; p: number }> = [
  { n: "Group Promo", p: 45 },
  { n: "Group A", p: 57 },
  { n: "Group B", p: 65 },
  { n: "Group C", p: 75 },
  { n: "Group D", p: 85 },
  { n: "Group E", p: 100 },
  { n: "Group F", p: 115 }
];

export const VANITY_PRICING: Record<string, { name: string; t1: number; t2: number; b: number }> = {
  "25_S": { name: '25" Single Bowl Vanity', t1: 190, t2: 370, b: 1 },
  "31_S": { name: '31" Single Bowl Vanity', t1: 210, t2: 425, b: 1 },
  "37_S": { name: '37" Single Bowl Vanity', t1: 240, t2: 475, b: 1 },
  "43_S": { name: '43" Single Bowl Vanity', t1: 270, t2: 535, b: 1 },
  "49_S": { name: '49" Single Bowl Vanity', t1: 310, t2: 590, b: 1 },
  "55_S": { name: '55" Single Bowl Vanity', t1: 360, t2: 650, b: 1 },
  "61_S": { name: '61" Single Bowl Vanity', t1: 385, t2: 675, b: 1 },
  "61_D": { name: '61" Double Bowl Vanity', t1: 410, t2: 700, b: 2 },
  "73_D": { name: '73" Double Bowl Vanity', t1: 490, t2: 810, b: 2 },
  "84_D": { name: '84" Double Bowl Vanity', t1: 570, t2: 950, b: 2 },
  "93_D": { name: '93" Double Bowl Vanity', t1: 650, t2: 1000, b: 2 },
  "96_D": { name: '96" Double Bowl Vanity', t1: 685, t2: 1050, b: 2 },
  "105_D": { name: '105" Double Bowl Vanity', t1: 760, t2: 1100, b: 2 },
  "120_D": { name: '120" Double Bowl Vanity', t1: 800, t2: 1150, b: 2 }
};

export const ADDON_CATALOG: ReadonlyArray<{ id: string; label: string; price: number }> = [
  { id: "qty-sink", label: "Kitchen Sink Cutouts", price: 200 },
  { id: "qty-bar", label: "Vanity/Bar Sink Cutouts", price: 100 },
  { id: "qty-cook", label: "Cooktop Cutouts", price: 150 },
  { id: "qty-outlet", label: "Electrical Outlet Cutouts", price: 30 },
  { id: "qty-ss", label: "ESF Stainless Kitchen Sink", price: 160 },
  { id: "qty-blanco", label: "Stock Blanco Sink", price: 450 },
  { id: "qty-v-rect", label: "ESF Rectangular Vanity Sink", price: 55 },
  { id: "qty-v-oval", label: "ESF Oval Vanity Sink", price: 35 }
];

export const TEAROUT = { label: "Tear Out Needed", price: 750 };

export function tierRateForGroup(name: string): number {
  const g = String(name || "Group Promo").trim();
  return PROTOTYPE_TIERS.find((t) => t.n === g)?.p ?? PROTOTYPE_TIERS[0].p;
}

/** ESF Direct $/sf for internal estimate “Direct / Retail” mode (matches backend `ESF_DIRECT_PRICE_PER_SQFT`). */
export function directRateForGroup(name: string): number {
  const g = String(name || "Group Promo").trim();
  return ESF_DIRECT_TIER_RATES.find((t) => t.n === g)?.directPerSqft ?? ESF_DIRECT_TIER_RATES[0].directPerSqft;
}

export function materialRateForInternalBasis(group: string, basis: "wholesale" | "direct"): number {
  return basis === "direct" ? directRateForGroup(group) : tierRateForGroup(group);
}

export function calculateRetailFromWholesaleSettings(
  wholesale: number,
  method: string,
  percent: number,
  flatAdd: number
): { wholesale: number; retail: number; profit: number; method: string; percent: number; flatAdd: number } {
  const w = Number(wholesale) || 0;
  let retail = w;
  if (method === "Markup Percent") retail = w * (1 + percent / 100);
  else if (method === "Margin Percent") retail = percent >= 100 ? w : w / (1 - percent / 100);
  else if (method === "Flat Dollar Add") retail = w + flatAdd;
  return { wholesale: w, retail: round2(retail), profit: round2(retail - w), method, percent, flatAdd };
}

function sumRoomAddons(room: RoomDraft): { extras: number; addons: MeasuredRoom["addons"]; lines: string[] } {
  const addons: MeasuredRoom["addons"] = [];
  let extras = 0;
  const lines: string[] = [];
  for (const spec of ADDON_CATALOG) {
    const qty = Math.max(0, Math.floor(Number(room.addons[spec.id]) || 0));
    if (!qty) continue;
    const total = qty * spec.price;
    extras += total;
    addons.push({ label: spec.label, qty, price: spec.price, total });
    lines.push(`${spec.label} × ${qty} = $${round2(total).toFixed(2)}`);
  }
  if (room.tear) {
    extras += TEAROUT.price;
    addons.push({ label: TEAROUT.label, qty: 1, price: TEAROUT.price, total: TEAROUT.price });
    lines.push(`${TEAROUT.label} — $${TEAROUT.price.toFixed(2)}`);
  }
  return { extras, addons, lines };
}

/** Full-height backsplash sf used for FHB outlet charges — mirrors `measureRoomDraft` (non-vanity). */
function totalFhbScopeSfForOutletCharges(room: RoomDraft): number {
  if (room.roomType === "Vanity" && room.vanity.isVanityProgram !== false) return 0;
  let fhb = 0;
  if (room.calcMode === "Guided Shape") {
    const norm = normalizeGuidedShapeRoom(room);
    const g = sumAllGuidedShapeGroups(norm);
    fhb += g.fhb;
  }
  if (room.fhbMode === "Manual Sq Ft") fhb += Number(room.fhbDirectSf) || 0;
  if (room.fhbMode === "Guided Shape") {
    const fh = sumGuidedPiecesByType(room.fhbPieces);
    fhb += fh.fhb + fh.counter;
  }
  return fhb;
}

/**
 * Aggregate per-room catalog add-ons + tear + FHB electrical outlets into backend `addOns`
 * (`PROTOTYPE_ADDON_UNIT_PRICES` / `calculateAddOns`). Keeps internal calculate/save payloads aligned
 * with live `measureRoomDraft` room extras when `applyGlobalAddOns` is false in the preview runner.
 */
/** Resolve use tax % for a room (countertop material only). */
export function resolveRoomUseTaxPercent(room: RoomDraft, projectDefaultPercent: number): number {
  const mode = room.useTaxMode ?? "inherit_project";
  if (mode === "none") return 0;
  if (mode === "percent") return Math.max(0, Number(room.useTaxPercent) || 0);
  return Math.max(0, Number(projectDefaultPercent) || 0);
}

function useVanityProgram2026(room: RoomDraft): boolean {
  if (room.roomType !== "Vanity") return false;
  if (room.vanity.source !== "Promo / Stock 100 Remnant") return false;
  if (room.vanity.outsideProgram) return false;
  const year = Number(room.vanity.vanityProgramYear) || VANITY_PROGRAM_YEAR;
  return year === VANITY_PROGRAM_YEAR && room.vanity.isVanityProgram !== false;
}

function resolveVanitySinkType(room: RoomDraft, bowlCount: 1 | 2): VanitySinkType {
  if (room.vanity.vanitySinkType) return room.vanity.vanitySinkType;
  return legacySinkTypeFromVanityFields(Number(room.vanity.programSink) || 0, Number(room.vanity.bowl) || 0, bowlCount);
}

export function priceVanityRoomDraft(room: RoomDraft, qualifyingKitchenCounterSf: number): VanityProgram2026Result | null {
  const sk = room.vanity.size;
  if (sk === "none" || !sk) return null;
  const row = vanityProgramRateRow(sk);
  if (!row) return null;
  const tier =
    room.vanity.vanityTier === "kitchen_over_35" || room.vanity.vanityTier === "kitchen_under_35"
      ? room.vanity.vanityTier
      : defaultVanityKitchenTier(qualifyingKitchenCounterSf);
  return priceVanityProgram2026({
    sizeCode: sk,
    qty: room.vanity.qty,
    depthIn: room.vanity.depth,
    tier,
    tierOverrideReason: room.vanity.vanityTierOverrideReason,
    sinkType: resolveVanitySinkType(room, row.bowlCount),
    extraTrips: room.vanity.vanityExtraTrips,
    outsideProgram: room.vanity.outsideProgram,
    qualifyingKitchenCounterSf
  });
}

/** Backend `vanities[]` payload for internal calculate/save. Only includes Vanity Program rooms. */
export function serializeVanitiesForApi(rooms: RoomDraft[], qualifyingKitchenCounterSf: number): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const r of rooms) {
    if (r.roomType !== "Vanity" || r.vanity.isVanityProgram === false) continue;
    const sk = r.vanity.size;
    if (!sk || sk === "none") continue;
    const priced = priceVanityRoomDraft(r, qualifyingKitchenCounterSf);
    const row = vanityProgramRateRow(sk);
    out.push({
      code: sk,
      sizeCode: sk,
      qty: Math.max(1, Math.floor(Number(r.vanity.qty) || 1)),
      programYear: VANITY_PROGRAM_YEAR,
      vanityProgramYear: VANITY_PROGRAM_YEAR,
      tier: priced?.tier ?? defaultVanityKitchenTier(qualifyingKitchenCounterSf),
      tier1Eligible: (priced?.tier ?? defaultVanityKitchenTier(qualifyingKitchenCounterSf)) === "kitchen_over_35",
      sinkType: priced ? resolveVanitySinkType(r, row?.bowlCount ?? 1) : "oval_white",
      extraTrips: Math.max(0, Math.floor(Number(r.vanity.vanityExtraTrips) || 0)),
      outsideProgram: Boolean(r.vanity.outsideProgram),
      roomName: r.name,
      exactTotal: priced?.exactTotal ?? 0,
      displayTotal: priced?.displayTotal ?? 0
    });
  }
  return out;
}

export function mergeRoomDraftsIntoGlobalAddOns(rooms: RoomDraft[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const room of rooms) {
    if (room.roomType === "Vanity" && room.vanity.isVanityProgram !== false) continue;
    for (const spec of ADDON_CATALOG) {
      const qty = Math.max(0, Math.floor(Number(room.addons[spec.id]) || 0));
      if (!qty) continue;
      acc[spec.id] = (acc[spec.id] || 0) + qty;
    }
    if (room.tear) {
      acc.tearout = (acc.tearout || 0) + 1;
    }
    if (totalFhbScopeSfForOutletCharges(room) > 0) {
      const out = Math.max(0, Math.floor(room.fhbOutlets) || 0);
      if (out > 0) {
        acc["qty-outlet"] = (acc["qty-outlet"] || 0) + out;
      }
    }
  }
  return acc;
}

export function measureRoomDraft(
  room: RoomDraft,
  qualifyingSf: number,
  materialBasis: "wholesale" | "direct" = "wholesale",
  projectUseTaxPercent = 0,
  measureOptions?: InternalMeasureOptions
): MeasuredRoom {
  const group = String(room.materialGroup || "Group Promo").trim();
  const rate = materialRateForInternalBasis(group, materialBasis);
  const details: string[] = [];
  const notes: string[] = [];
  const name = room.name.trim() || room.roomType || "Room";

  let counter = 0;
  let splash = 0;
  let fhb = 0;
  let extras = 0;
  let selected = 0;
  let vanityTotal = 0;
  let priceableCounter = 0;
  let priceableSplash = 0;
  let fixedTotal = 0;
  let vanityTier: "t1" | "t2" | undefined;

  if (room.notes.trim()) details.push(`Room note: ${room.notes.trim()}`);

  let roomUseTax: MeasuredRoom["useTax"];

  // Only enter vanity program path when isVanityProgram is not explicitly false.
  // Standard-mode vanity rooms (isVanityProgram === false) fall through to normal countertop math.
  if (room.roomType === "Vanity" && room.vanity.isVanityProgram !== false) {
    const sk = room.vanity.size;
    const q = Math.max(1, Math.floor(room.vanity.qty) || 1);
    let vanityProgram: VanityProgram2026Result | null = null;
    if (sk !== "none" && useVanityProgram2026(room)) {
      vanityProgram = priceVanityRoomDraft(room, qualifyingSf);
      if (vanityProgram) {
        vanityTier = vanityProgram.tier === "kitchen_over_35" ? "t1" : "t2";
        selected = vanityProgram.exactTotal;
        vanityTotal = selected;
        fixedTotal = selected;
        const tierNote = vanityProgram.tierOverrideReason
          ? `${vanityProgram.tierLabel} (override: ${vanityProgram.tierOverrideReason})`
          : vanityProgram.tierLabel;
        details.push(`${vanityProgram.label}: ${tierNote} × ${q} = $${selected.toFixed(2)}`);
        if (vanityProgram.sinkUpgradeTotal > 0) {
          details.push(`Sink upgrade: +$${vanityProgram.sinkUpgradeTotal.toFixed(2)}`);
        }
        if (vanityProgram.extraTripsTotal > 0) {
          details.push(`Extra template/install trips × ${vanityProgram.extraTrips}: +$${vanityProgram.extraTripsTotal.toFixed(2)}`);
        }
        if (vanityProgram.outsideProgram) {
          notes.push("Quoted outside vanity program — confirm material purchase with customer.");
        }
      }
    } else if (sk !== "none" && VANITY_PRICING[sk]) {
      const data = VANITY_PRICING[sk];
      if (room.vanity.source === "Promo / Stock 100 Remnant") {
        const lowerTier = qualifyingSf >= VANITY_TIER_THRESHOLD_SQFT;
        vanityTier = lowerTier ? "t1" : "t2";
        const sinkUp = Number(room.vanity.programSink) || 0;
        selected = round2(((lowerTier ? data.t1 : data.t2) + sinkUp * data.b) * q);
        vanityTotal = selected;
        fixedTotal = selected;
        details.push(
          `${data.name}: ${lowerTier ? "lower vanity tier (kitchen scope ≥ 35 sf)" : "standard vanity tier (< 35 sf)"} × ${q}`
        );
      } else {
        const width = Number((data.name.match(/^(\d+)/) || [])[1]) || 0;
        const depth = Number(room.vanity.depth) || 22.5;
        const sf = (width * depth) / 144;
        const bowl = Number(room.vanity.bowl) || 0;
        const rectUp = bowl === 55 ? 25 : 0;
        selected = round2((sf * 55 + 100 + bowl + rectUp) * q);
        vanityTotal = selected;
        fixedTotal = selected;
        counter = round2(sf * q);
        details.push(`${data.name}: ESF Non-Stock Remnant ${sf.toFixed(2)} sf × $55 + $100 cutout + bowl × ${q}`);
      }
    }
    priceableCounter = 0;
    priceableSplash = 0;
    const totalSfV = round2(counter + splash + fhb);
    return {
      id: room.id,
      name,
      type: room.roomType,
      group,
      rate,
      counter: round2(counter),
      splash: round2(splash),
      fhb: round2(fhb),
      totalSf: totalSfV,
      extras: round2(extras),
      selected: round2(selected),
      vanityTotal: round2(vanityTotal),
      details,
      notes,
      addons: [],
      priceableCounter: 0,
      priceableSplash: 0,
      fixedTotal: round2(fixedTotal),
      vanityTier,
      isVanityProgram: true,
      vanityProgram: vanityProgram
        ? {
            programYear: vanityProgram.programYear,
            tier: vanityProgram.tier,
            tierLabel: vanityProgram.tierLabel,
            tierOverrideReason: vanityProgram.tierOverrideReason,
            exactTotal: vanityProgram.exactTotal,
            displayTotal: vanityProgram.displayTotal,
            roundingMode: vanityProgram.roundingMode,
            outsideProgram: vanityProgram.outsideProgram,
            customerNote: vanityProgram.customerNote,
            label: vanityProgram.label
          }
        : undefined
    };
  }

  const mode = room.calcMode;
  if (mode === "Manual Sq Ft") {
    counter = Number(room.direct.counter) || 0;
    splash = Number(room.direct.splash) || 0;
    if (counter) details.push(`Manual countertop: ${counter.toFixed(2)} sf`);
    if (splash) details.push(`Manual backsplash: ${splash.toFixed(2)} sf`);
  } else if (mode === "Rapid Linear Foot") {
    const r = rapidLinearAreas(
      room.linear.wallFt,
      room.linear.splashIn,
      room.linear.islandL,
      room.linear.islandW,
      room.linear.counterDepthIn
    );
    counter = r.counter;
    splash = r.splash;
    details.push(...r.lines);
    const iw = Number(room.linear.islandW) || 0;
    if ((room.roomType === "Island" || room.roomType === "Bar") && iw * 12 > 30) {
      notes.push("Countertop support/bracing may be required based on island/bar depth — confirm after template.");
    }
  } else {
    const norm = normalizeGuidedShapeRoom(room);
    const grouped = sumAllGuidedShapeGroups(norm);
    counter = grouped.counter;
    splash = grouped.splash;
    fhb = grouped.fhb;
    details.push(...grouped.lines);
    for (const p of norm.guidedPieces) {
      const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      if (sf > 0 && (room.roomType === "Island" || room.roomType === "Bar") && p.pieceType === "counter" && p.depthIn > 30) {
        notes.push("Island/bar counter depth over 30″ — support/bracing may be required.");
      }
    }
  }

  if (room.fhbMode === "Manual Sq Ft") fhb += Number(room.fhbDirectSf) || 0;
  if (room.fhbMode === "Guided Shape") {
    const fh = sumGuidedPiecesByType(room.fhbPieces);
    fhb += fh.fhb + fh.counter;
    details.push(...fh.lines.map((l) => `Full height: ${l}`));
  }
  if (fhb > 0) {
    notes.push("Full-height backsplash selected — confirm outlet/switch count and placement before template.");
    const out = Math.max(0, Math.floor(room.fhbOutlets) || 0);
    if (out) {
      extras += out * 30;
      details.push(`Full-height backsplash electrical cutouts × ${out} @ $30`);
    }
  }

  if (room.raised === "Yes") {
    notes.push("Raised bar selected — final sf/pricing confirmed after field template.");
  }

  const add = sumRoomAddons(room);
  extras += add.extras;
  details.push(...add.lines);

  const roomTaxPct = resolveRoomUseTaxPercent(room, projectUseTaxPercent);
  const materialNoTax = buildSelectedMaterialBreakdownCore([room], materialBasis, {
    chargeableCounterCeil: measureOptions?.chargeableCounterCeil
  });
  let scopedMaterialDollars = materialNoTax.totals.materialSubtotal;
  if (roomTaxPct > 0) {
    const ctBase = materialNoTax.totals.countertopMaterial;
    const taxAmount = round2(ctBase * (roomTaxPct / 100));
    scopedMaterialDollars = round2(scopedMaterialDollars + taxAmount);
    roomUseTax = { percent: roomTaxPct, baseCountertopMaterial: ctBase, taxAmount, applied: true };
  }
  selected = round2(scopedMaterialDollars + extras);
  const chargeableCounter = measureOptions?.chargeableCounterCeil
    ? chargeableCounterSqftFromExact(counter)
    : counter;
  const counterRoundingAdjustment =
    measureOptions?.chargeableCounterCeil && chargeableCounter > counter
      ? round2(chargeableCounter - counter)
      : 0;
  if (counterRoundingAdjustment > 0) {
    details.push(
      `Chargeable countertop: ${chargeableCounter.toFixed(0)} sf (rounded up from ${counter.toFixed(2)} sf exact)`
    );
  }
  const chargeableSplash = measureOptions?.chargeableCounterCeil
    ? chargeableSplashSqftFromExact(splash + fhb)
    : splash + fhb;
  const splashRoundingAdjustment =
    measureOptions?.chargeableCounterCeil && chargeableSplash > splash + fhb
      ? round2(chargeableSplash - (splash + fhb))
      : 0;
  if (splashRoundingAdjustment > 0) {
    details.push(
      `Chargeable backsplash/FHB: ${chargeableSplash.toFixed(0)} sf (rounded up from ${(splash + fhb).toFixed(2)} sf exact)`
    );
  }
  priceableCounter = chargeableCounter;
  priceableSplash = chargeableSplash;
  fixedTotal = extras;

  const totalSf = round2(counter + splash + fhb);
  return {
    id: room.id,
    name,
    type: room.roomType,
    group,
    rate,
    counter: round2(counter),
    chargeableCounter: round2(chargeableCounter),
    counterRoundingAdjustment,
    splash: round2(splash),
    fhb: round2(fhb),
    chargeableSplash: round2(chargeableSplash),
    splashRoundingAdjustment,
    totalSf,
    extras: round2(extras),
    selected: round2(selected),
    vanityTotal: round2(vanityTotal),
    details,
    notes,
    addons: add.addons,
    priceableCounter: round2(priceableCounter),
    priceableSplash: round2(priceableSplash),
    fixedTotal: round2(fixedTotal),
    vanityTier,
    useTax: roomUseTax
  };
}

export function calculateAllRoomDrafts(
  rooms: RoomDraft[],
  projectType: string,
  materialBasis: "wholesale" | "direct" = "wholesale",
  projectUseTaxPercent = 0,
  measureOptions?: InternalMeasureOptions
): { rooms: MeasuredRoom[]; totals: RoomEngineTotals } {
  const qualifyingSf = qualifyingSfFromRoomDrafts(rooms);
  const measured = rooms.map((r) => measureRoomDraft(r, qualifyingSf, materialBasis, projectUseTaxPercent, measureOptions));
  if (projectType.trim().toLowerCase() === "remodel") {
    for (const m of measured) {
      m.notes.push(
        "Remodel project — existing conditions, cabinet readiness, and site variables may affect final scope."
      );
    }
  }
  const totals = measured.reduce(
    (a, r) => {
      a.counter += r.counter;
      a.splash += r.splash;
      a.fhb += r.fhb;
      a.extras += r.extras;
      a.selected += r.selected;
      a.vanity += r.vanityTotal;
      a.priceableCounter += r.priceableCounter;
      a.priceableSplash += r.priceableSplash;
      a.fixed += r.fixedTotal;
      return a;
    },
    {
      counter: 0,
      splash: 0,
      fhb: 0,
      extras: 0,
      selected: 0,
      vanity: 0,
      priceableCounter: 0,
      priceableSplash: 0,
      fixed: 0,
      qualifyingSf
    }
  );
  for (const k of Object.keys(totals) as (keyof Omit<RoomEngineTotals, "qualifyingSf">)[]) {
    if (k === "qualifyingSf") continue;
    (totals as Record<string, number>)[k] = round2((totals as Record<string, number>)[k] as number);
  }
  return { rooms: measured, totals };
}

export function buildAllGroupMatrix(totals: RoomEngineTotals) {
  return PROTOTYPE_TIERS.map((t) => {
    const c = totals.priceableCounter * t.p;
    const b = totals.priceableSplash * t.p;
    const wholesale = round2(c + b + totals.fixed);
    const retail = calculateRetailFromWholesaleSettings(wholesale, "Markup Percent", 20, 0);
    return {
      group: t.n,
      counter: round2(c),
      backsplash: round2(b),
      fixed: totals.fixed,
      wholesale,
      retail: retail.retail,
      profit: retail.profit
    };
  });
}

/** Internal estimate: each tier at wholesale or direct $/sf — no partner markup row. */
export function buildInternalGroupMatrix(
  totals: RoomEngineTotals,
  materialBasis: "wholesale" | "direct",
  useTaxPercent = 0
) {
  const taxPct = Math.max(0, Number(useTaxPercent) || 0);
  return PROTOTYPE_TIERS.map((t) => {
    const rate = materialRateForInternalBasis(t.n, materialBasis);
    const c = totals.priceableCounter * rate;
    const b = totals.priceableSplash * rate;
    const useTax = taxPct > 0 ? round2(c * (taxPct / 100)) : 0;
    const wholesale = round2(c + b + useTax + totals.fixed);
    return {
      group: t.n,
      counter: round2(c + useTax),
      backsplash: round2(b),
      fixed: totals.fixed,
      wholesale,
      retail: wholesale,
      profit: 0
    };
  });
}

export type SelectedMaterialScopeLine = {
  roomName: string;
  label: string;
  colorLabel?: string;
  countertopSf: number;
  backsplashSf: number;
  fhbSf: number;
};

export type SelectedMaterialGroupBlock = {
  group: string;
  colorLabel?: string;
  lines: SelectedMaterialScopeLine[];
  countertopSf: number;
  backsplashSf: number;
  fhbSf: number;
  /** Scoped stone $ from countertop sf × tier rate (exact; same basis as `totals.countertopMaterial`). */
  countertopMaterial: number;
  /** Scoped stone $ from backsplash + FHB sf × tier rate (exact; same basis as `totals.backsplashMaterial`). */
  backsplashMaterial: number;
  materialSubtotal: number;
  /** Omitted on customer-facing output when `includeRates` is false. */
  ratePerSqft?: number;
};

export type UseTaxSnapshot = {
  percent: number;
  baseCountertopMaterial: number;
  taxAmount: number;
  applied: boolean;
};

export type SelectedMaterialBreakdown = {
  groups: SelectedMaterialGroupBlock[];
  totals: {
    countertopSf: number;
    backsplashSf: number;
    fhbSf: number;
    materialSubtotal: number;
    /** Countertop sf × group rate (display rollup; no math engine change). */
    countertopMaterial: number;
    /** Backsplash + full-height sf × group rate (display rollup). */
    backsplashMaterial: number;
    /** Use tax on countertop material only (folded into customer-facing countertop $). */
    useTax?: UseTaxSnapshot;
  };
};

function resolveMaterialGroupForPiece(room: RoomDraft, piece?: GuidedPiece): string {
  if (piece?.materialOverride && piece.materialGroup?.trim()) return piece.materialGroup.trim();
  return String(room.materialGroup || "Group Promo").trim();
}

function colorLabelForPiece(room: RoomDraft, piece?: GuidedPiece): string | undefined {
  const c = piece?.materialOverride ? piece.materialColor : room.materialColor;
  return c?.trim() || undefined;
}

/**
 * Internal estimate: scoped stone material $ only (same basis as customer Quoted Material Breakdown).
 * Excludes room fixed add-ons, vanities, and structured custom lines.
 */
export function internalEstimateScopedMaterialSubtotal(rooms: RoomDraft[], basis: "wholesale" | "direct"): number {
  return buildSelectedMaterialBreakdown(rooms, basis).totals.materialSubtotal;
}

/**
 * Piece/room-level sf rows for selected-material display — mirrors backend `enumerateRoomMaterialSfRows` grouping.
 * Uses the same $/sf tables as internal estimate math (`materialRateForInternalBasis`); does not apply room fixed add-ons.
 */
/** Apply use tax to countertop material only (e.g. Lisbon office); does not tax backsplash/add-ons. */
export function applyUseTaxToMaterialBreakdown(
  breakdown: SelectedMaterialBreakdown,
  useTaxPercent: number
): SelectedMaterialBreakdown {
  const pct = Math.max(0, Number(useTaxPercent) || 0);
  if (pct <= 0) {
    return {
      ...breakdown,
      totals: { ...breakdown.totals, useTax: { percent: 0, baseCountertopMaterial: breakdown.totals.countertopMaterial, taxAmount: 0, applied: false } }
    };
  }
  const base = breakdown.totals.countertopMaterial;
  const taxAmount = round2(base * (pct / 100));
  const countertopMaterial = round2(base + taxAmount);
  const materialSubtotal = round2(countertopMaterial + breakdown.totals.backsplashMaterial);
  return {
    groups: breakdown.groups.map((g) => {
      const gBase = g.countertopMaterial;
      const gTax = round2(gBase * (pct / 100));
      return {
        ...g,
        countertopMaterial: round2(gBase + gTax),
        materialSubtotal: round2(gBase + gTax + g.backsplashMaterial)
      };
    }),
    totals: {
      ...breakdown.totals,
      countertopMaterial,
      materialSubtotal,
      useTax: { percent: pct, baseCountertopMaterial: base, taxAmount, applied: true }
    }
  };
}

/** Material breakdown without use tax (used internally to avoid recursion). */
function applyChargeableCounterCeilToRoomRows(
  raw: Array<SelectedMaterialScopeLine & { group: string }>,
  roomName: string
): void {
  const roomRows = raw.filter((r) => r.roomName === roomName && r.countertopSf > 0);
  const exact = round2(roomRows.reduce((s, r) => s + r.countertopSf, 0));
  const priced = chargeableCounterSqftFromExact(exact);
  const delta = round2(priced - exact);
  if (delta <= 0) return;
  const g = roomRows[0]?.group || "Group Promo";
  raw.push({
    roomName,
    label: "Countertop chargeable SF (round up)",
    group: g,
    colorLabel: roomRows[0]?.colorLabel,
    countertopSf: delta,
    backsplashSf: 0,
    fhbSf: 0
  });
}

/**
 * Ceil backsplash+FHB SF per room per material-group bucket.
 * Mixed-material rooms (piece-level group overrides) get independent rounding per group.
 */
function applyChargeableSplashCeilToRoomRows(
  raw: Array<SelectedMaterialScopeLine & { group: string }>,
  roomName: string
): void {
  const groups = new Set<string>();
  for (const r of raw) {
    if (r.roomName === roomName && (r.backsplashSf > 0 || r.fhbSf > 0)) groups.add(r.group);
  }
  for (const grp of groups) {
    const grpRows = raw.filter((r) => r.roomName === roomName && r.group === grp && (r.backsplashSf > 0 || r.fhbSf > 0));
    const exact = round2(grpRows.reduce((s, r) => s + r.backsplashSf + r.fhbSf, 0));
    const priced = chargeableSplashSqftFromExact(exact);
    const delta = round2(priced - exact);
    if (delta <= 0) continue;
    raw.push({
      roomName,
      label: "Backsplash/FHB chargeable SF (round up)",
      group: grp,
      colorLabel: grpRows[0]?.colorLabel,
      countertopSf: 0,
      backsplashSf: delta,
      fhbSf: 0
    });
  }
}

function buildSelectedMaterialBreakdownCore(
  rooms: RoomDraft[],
  materialBasis: "wholesale" | "direct",
  options?: { includeRates?: boolean; chargeableCounterCeil?: boolean }
): SelectedMaterialBreakdown {
  const includeRates = options?.includeRates === true;
  type RawRow = SelectedMaterialScopeLine & { group: string };
  const raw: RawRow[] = [];

  for (const room of rooms) {
    const roomName = room.name.trim() || room.roomType || "Room";

    // Vanity Program rooms are priced separately; standard-mode vanity rooms price as countertop.
    if (room.roomType === "Vanity" && room.vanity.isVanityProgram !== false) {
      continue;
    }

    if (room.calcMode === "Guided Shape") {
      const norm = normalizeGuidedShapeRoom(room);
      const shapeGroups = norm.guidedShapeGroups?.length ? norm.guidedShapeGroups : [];
      const hasGuidedDims = shapeGroups.some((grp) => grp.pieces.some((p) => p.lengthIn > 0 && p.depthIn > 0));
      if (hasGuidedDims) {
        for (const grp of shapeGroups) {
          const groupRows: RawRow[] = [];
          const excludeBs = grp.backsplashMode === "exclude";
          for (const p of grp.pieces) {
            const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
            if (sf <= 0) continue;
            if (excludeBs && p.pieceType !== "counter") continue;
            const g = resolveMaterialGroupForPiece(room, p);
            const colorLabel = colorLabelForPiece(room, p);
            const baseLabel = p.name?.trim() || (p.pieceType === "splash" ? "Backsplash" : p.pieceType === "fhb" ? "Full height" : "Countertop");
            const label = `${grp.name}: ${baseLabel}`;
            if (p.pieceType === "splash") {
              groupRows.push({ roomName, label, group: g, colorLabel, countertopSf: 0, backsplashSf: sf, fhbSf: 0 });
            } else if (p.pieceType === "fhb") {
              groupRows.push({ roomName, label, group: g, colorLabel, countertopSf: 0, backsplashSf: 0, fhbSf: sf });
            } else {
              groupRows.push({ roomName, label, group: g, colorLabel, countertopSf: sf, backsplashSf: 0, fhbSf: 0 });
              if (p.pieceType === "counter" && p.addSplash && p.lengthIn > 0 && !excludeBs) {
                const spSf = round2((p.lengthIn * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
                if (spSf > 0) {
                  groupRows.push({
                    roomName,
                    label: `${label} — 4″ backsplash (on run)`,
                    group: g,
                    colorLabel,
                    countertopSf: 0,
                    backsplashSf: spSf,
                    fhbSf: 0
                  });
                }
              }
            }
          }
          const overlap = guidedCornerOverlapDeductionSfForGroup(grp);
          if (overlap > 0) {
            let remaining = overlap;
            for (const row of groupRows) {
              if (row.countertopSf <= 0 || remaining <= 0) continue;
              const take = Math.min(row.countertopSf, remaining);
              row.countertopSf = round2(row.countertopSf - take);
              remaining = round2(remaining - take);
            }
          }
          raw.push(...groupRows);
        }
        if (room.fhbMode === "Guided Shape") {
          for (const p of room.fhbPieces) {
            const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
            if (sf <= 0) continue;
            const g = resolveMaterialGroupForPiece(room, p);
            raw.push({
              roomName,
              label: p.name?.trim() || "Full height backsplash",
              group: g,
              colorLabel: colorLabelForPiece(room, p),
              countertopSf: 0,
              backsplashSf: 0,
              fhbSf: sf
            });
          }
        } else if (room.fhbMode === "Manual Sq Ft" && (Number(room.fhbDirectSf) || 0) > 0) {
          const g = String(room.materialGroup || "Group Promo").trim();
          raw.push({
            roomName,
            label: "Full height backsplash",
            group: g,
            colorLabel: room.materialColor?.trim() || undefined,
            countertopSf: 0,
            backsplashSf: 0,
            fhbSf: round2(Number(room.fhbDirectSf) || 0)
          });
        }
        if (options?.chargeableCounterCeil) {
          applyChargeableCounterCeilToRoomRows(raw, roomName);
          applyChargeableSplashCeilToRoomRows(raw, roomName);
        }
        continue;
      }
    }

    let ct = 0;
    let bs = 0;
    let fhb = 0;
    if (room.calcMode === "Manual Sq Ft") {
      ct = Number(room.direct.counter) || 0;
      bs = Number(room.direct.splash) || 0;
      if (options?.chargeableCounterCeil && ct > 0) {
        ct = chargeableCounterSqftFromExact(ct);
      }
    } else if (room.calcMode === "Rapid Linear Foot") {
      const a = rapidLinearAreas(
        room.linear.wallFt,
        room.linear.splashIn,
        room.linear.islandL,
        room.linear.islandW,
        room.linear.counterDepthIn
      );
      ct = a.counter;
      bs = a.splash;
      if (options?.chargeableCounterCeil && ct > 0) {
        ct = chargeableCounterSqftFromExact(ct);
      }
    }
    if (room.fhbMode === "Manual Sq Ft") fhb += Number(room.fhbDirectSf) || 0;
    if (room.fhbMode === "Guided Shape") {
      const fh = sumGuidedPiecesByType(room.fhbPieces);
      fhb += fh.fhb + fh.counter;
    }

    const g = String(room.materialGroup || "Group Promo").trim();
    const colorLabel = room.materialColor?.trim() || undefined;
    if (ct > 0) raw.push({ roomName, label: "Countertop", group: g, colorLabel, countertopSf: round2(ct), backsplashSf: 0, fhbSf: 0 });
    if (bs > 0) raw.push({ roomName, label: "Backsplash", group: g, colorLabel, countertopSf: 0, backsplashSf: round2(bs), fhbSf: 0 });
    if (fhb > 0) raw.push({ roomName, label: "Full height backsplash", group: g, colorLabel, countertopSf: 0, backsplashSf: 0, fhbSf: round2(fhb) });
    if (options?.chargeableCounterCeil) {
      applyChargeableSplashCeilToRoomRows(raw, roomName);
    }
  }

  const groupMap = new Map<string, SelectedMaterialGroupBlock>();
  for (const row of raw) {
    const g = row.group;
    let block = groupMap.get(g);
    if (!block) {
      block = {
        group: g,
        lines: [],
        countertopSf: 0,
        backsplashSf: 0,
        fhbSf: 0,
        countertopMaterial: 0,
        backsplashMaterial: 0,
        materialSubtotal: 0
      };
      groupMap.set(g, block);
    }
    block.lines.push({
      roomName: row.roomName,
      label: row.label,
      colorLabel: row.colorLabel,
      countertopSf: row.countertopSf,
      backsplashSf: row.backsplashSf,
      fhbSf: row.fhbSf
    });
    block.countertopSf = round2(block.countertopSf + row.countertopSf);
    block.backsplashSf = round2(block.backsplashSf + row.backsplashSf);
    block.fhbSf = round2(block.fhbSf + row.fhbSf);
    if (row.colorLabel && !block.colorLabel) block.colorLabel = row.colorLabel;
  }

  let materialSubtotal = 0;
  let countertopMaterial = 0;
  let backsplashMaterial = 0;
  const groups: SelectedMaterialGroupBlock[] = [];
  for (const block of groupMap.values()) {
    const rate = materialRateForInternalBasis(block.group, materialBasis);
    const ctDollars = round2(block.countertopSf * rate);
    const bsDollars = round2((block.backsplashSf + block.fhbSf) * rate);
    block.countertopMaterial = ctDollars;
    block.backsplashMaterial = bsDollars;
    block.materialSubtotal = round2(ctDollars + bsDollars);
    countertopMaterial += ctDollars;
    backsplashMaterial += bsDollars;
    if (includeRates) block.ratePerSqft = rate;
    materialSubtotal += block.materialSubtotal;
    groups.push(block);
  }
  groups.sort((a, b) => a.group.localeCompare(b.group));

  const totals = groups.reduce(
    (t, g) => {
      t.countertopSf = round2(t.countertopSf + g.countertopSf);
      t.backsplashSf = round2(t.backsplashSf + g.backsplashSf);
      t.fhbSf = round2(t.fhbSf + g.fhbSf);
      return t;
    },
    {
      countertopSf: 0,
      backsplashSf: 0,
      fhbSf: 0,
      materialSubtotal: round2(materialSubtotal),
      countertopMaterial: round2(countertopMaterial),
      backsplashMaterial: round2(backsplashMaterial)
    }
  );

  return { groups, totals };
}

export function buildSelectedMaterialBreakdown(
  rooms: RoomDraft[],
  materialBasis: "wholesale" | "direct",
  options?: {
    includeRates?: boolean;
    useTaxPercent?: number;
    projectUseTaxPercent?: number;
    chargeableCounterCeil?: boolean;
  }
): SelectedMaterialBreakdown {
  const built = buildSelectedMaterialBreakdownCore(rooms, materialBasis, {
    includeRates: options?.includeRates === true,
    chargeableCounterCeil: options?.chargeableCounterCeil
  });
  const projectDefault = Math.max(0, Number(options?.projectUseTaxPercent ?? options?.useTaxPercent) || 0);
  let taxBase = 0;
  let taxAmount = 0;
  let maxPct = 0;
  for (const room of rooms) {
    // Vanity Program rooms have fixed pricing with no use-tax; standard-mode vanity rooms price as countertop.
    if (room.roomType === "Vanity" && room.vanity.isVanityProgram !== false) continue;
    const pct = resolveRoomUseTaxPercent(room, projectDefault);
    if (pct <= 0) continue;
    const roomCt = buildSelectedMaterialBreakdownCore([room], materialBasis, {
      chargeableCounterCeil: options?.chargeableCounterCeil
    }).totals.countertopMaterial;
    taxBase = round2(taxBase + roomCt);
    taxAmount = round2(taxAmount + roomCt * (pct / 100));
    if (pct > maxPct) maxPct = pct;
  }
  if (taxAmount > 0) {
    built.totals.countertopMaterial = round2(built.totals.countertopMaterial + taxAmount);
    built.totals.materialSubtotal = round2(built.totals.materialSubtotal + taxAmount);
    built.totals.useTax = {
      percent: maxPct,
      baseCountertopMaterial: taxBase,
      taxAmount,
      applied: true
    };
  } else {
    built.totals.useTax = {
      percent: 0,
      baseCountertopMaterial: built.totals.countertopMaterial,
      taxAmount: 0,
      applied: false
    };
  }
  return built;
}

export type InternalEstimateGroupComparisonRow = {
  group: string;
  /** Optional alternate color/material label for customer PDF (e.g. "Aura Taj"). */
  comparisonColorLabel?: string;
  ratePerSqft: number;
  materialCounter: number;
  materialSplashFhb: number;
  materialTotal: number;
  fullTotal: number;
};

/** Stable DOM id for scrolling to a room editor card in Internal Estimate. */
export function roomEditorDomId(roomId: string): string {
  return `room-card-${String(roomId || "").trim() || "unknown"}`;
}

export type CustomerRoomAreaCostAddon = {
  label: string;
  amountExact: number;
};

export type CustomerRoomAreaCostCustomLine = {
  /** Stable key for print lists — avoids collapsing duplicate fixture names. */
  lineKey?: string;
  name: string;
  amountExact: number;
};

export type CustomerRoomAreaCostRow = {
  roomId: string;
  roomName: string;
  displayName: string;
  materialGroup: string;
  colorLabel?: string;
  isVanity: boolean;
  totalSqft: number;
  countertopSf: number;
  backsplashFhbSf: number;
  /** Stone + backsplash + use tax on countertop for this area (excludes room add-ons). */
  materialAmountExact: number;
  addons: CustomerRoomAreaCostAddon[];
  customerCustomLines: CustomerRoomAreaCostCustomLine[];
  roomTotalExact: number;
};

export type CustomerRoomAreaCostBreakdown = {
  version: 1;
  rooms: CustomerRoomAreaCostRow[];
  /** Customer-facing custom lines with no room attribution (shown in Estimate summary only). */
  unassignedCustomerCustomExact: number;
  /** Sum of roomTotalExact + unassigned customer custom — should match project estimate total. */
  projectTotalExact: number;
};

export type CustomerRoomAreaCustomLineInput = {
  name: string;
  quantity: number;
  unitPrice: number;
  customerFacing: boolean;
  roomName: string;
  /** Prefer room draft id over free-text room name when assigning fixtures. */
  roomId?: string;
  category: string;
  lineKey?: string;
};

function normalizeRoomMatchKey(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

function customLineAmountFromInput(row: CustomerRoomAreaCustomLineInput): number {
  const q = Number(row.quantity) || 0;
  const p = Number(row.unitPrice) || 0;
  if (!String(row.name ?? "").trim() || q <= 0) return 0;
  if (row.category === "Discount/Credit") {
    if (p < 0) return round2(q * p);
    return 0;
  }
  if (p === 0) return 0;
  return round2(q * p);
}

function findRoomIndexForCustomLine(
  roomKeys: Array<{ id: string; key: string }>,
  roomName: string,
  roomId?: string
): number {
  const id = String(roomId ?? "").trim();
  if (id) {
    const byId = roomKeys.findIndex((r) => r.id === id);
    if (byId >= 0) return byId;
  }
  const target = normalizeRoomMatchKey(roomName);
  if (!target) return -1;
  const exact = roomKeys.findIndex((r) => r.key === target);
  if (exact >= 0) return exact;
  return roomKeys.findIndex((r) => r.key.includes(target) || target.includes(r.key));
}

function distributeAmountByWeights(pool: number, weights: number[]): number[] {
  const p = Number(pool) || 0;
  if (p === 0) return weights.map(() => 0);
  const cleaned = weights.map((w) => (Number(w) > 0 ? Number(w) : 0));
  const total = cleaned.reduce((a, b) => a + b, 0);
  if (total <= 0) return cleaned.map(() => round2(p / Math.max(1, cleaned.length)));
  return cleaned.map((w) => round2(p * (w / total)));
}

/**
 * Customer-facing per-room/area cost breakdown for Internal Estimate print.
 * Reconciles to project estimate total; internal-only custom $ is absorbed into room material (by room or proportional).
 */
export function buildCustomerRoomAreaCostBreakdown(params: {
  roomDrafts: RoomDraft[];
  measuredRooms: MeasuredRoom[];
  materialBasis: "wholesale" | "direct";
  /** Project default when room uses `inherit_project`. */
  projectUseTaxPercent?: number;
  customLines?: CustomerRoomAreaCustomLineInput[];
  projectColorTbd?: boolean;
  measureOptions?: InternalMeasureOptions;
}): CustomerRoomAreaCostBreakdown {
  const basis = params.materialBasis;
  const projectUseTaxPercent = Math.max(0, Number(params.projectUseTaxPercent) || 0);
  const customLines = params.customLines ?? [];
  const draftById = new Map(params.roomDrafts.map((d) => [d.id, d]));

  const rows: CustomerRoomAreaCostRow[] = [];
  const roomKeys: Array<{ id: string; key: string }> = [];

  for (let i = 0; i < params.measuredRooms.length; i++) {
    const m = params.measuredRooms[i];
    const draft = draftById.get(m.id) ?? params.roomDrafts[i];
    const displayName = String(m.name || draft?.name || "").trim() || `Room ${i + 1}`;
    const key = normalizeRoomMatchKey(displayName);
    roomKeys.push({ id: m.id, key });

    const isVanity = Boolean(m.isVanityProgram);
    const countertopSf = round2(
      Number(m.chargeableCounter ?? m.priceableCounter ?? m.counter) || 0
    );
    const backsplashFhbSf = isVanity
      ? round2((Number(m.splash) || 0) + (Number(m.fhb) || 0))
      : round2(Number(m.chargeableSplash ?? m.priceableSplash ?? (Number(m.splash) || 0) + (Number(m.fhb) || 0)));
    const totalSqft = round2(Number(m.totalSf) || countertopSf + backsplashFhbSf);

    let materialAmountExact = 0;
    if (isVanity) {
      materialAmountExact = round2(Number(m.selected) || 0);
    } else if (draft) {
      const pct = resolveRoomUseTaxPercent(draft, projectUseTaxPercent);
      const sub = buildSelectedMaterialBreakdownCore([draft], basis, {
        chargeableCounterCeil: params.measureOptions?.chargeableCounterCeil
      });
      materialAmountExact = sub.totals.materialSubtotal;
      if (pct > 0) {
        const tax = round2(sub.totals.countertopMaterial * (pct / 100));
        materialAmountExact = round2(materialAmountExact + tax);
      }
    }

    const addons: CustomerRoomAreaCostAddon[] = (m.addons ?? []).map((a) => ({
      label: String(a.label || "Add-on"),
      amountExact: round2(Number(a.total) || 0)
    }));

    rows.push({
      roomId: m.id,
      roomName: displayName,
      displayName,
      materialGroup: String(m.group || draft?.materialGroup || "Group Promo"),
      colorLabel:
        params.projectColorTbd || !draft?.materialColor?.trim() ? undefined : String(draft.materialColor).trim(),
      isVanity,
      totalSqft,
      countertopSf,
      backsplashFhbSf,
      materialAmountExact,
      addons,
      customerCustomLines: [],
      roomTotalExact: 0
    });
  }

  let unassignedCustomerCustomExact = 0;
  const internalUnassignedPool = { amount: 0 };

  for (let lineIdx = 0; lineIdx < customLines.length; lineIdx++) {
    const line = customLines[lineIdx];
    const amt = customLineAmountFromInput(line);
    if (amt === 0) continue;
    const idx = findRoomIndexForCustomLine(roomKeys, line.roomName, line.roomId);
    const lineKey =
      String(line.lineKey ?? "").trim() ||
      `custom-${lineIdx}-${String(line.name ?? "").trim()}-${amt}`;
    if (!line.customerFacing) {
      if (idx >= 0) {
        rows[idx].materialAmountExact = round2(rows[idx].materialAmountExact + amt);
      } else {
        internalUnassignedPool.amount = round2(internalUnassignedPool.amount + amt);
      }
      continue;
    }
    if (idx >= 0) {
      rows[idx].customerCustomLines.push({
        lineKey,
        name: String(line.name).trim(),
        amountExact: amt
      });
    } else {
      unassignedCustomerCustomExact = round2(unassignedCustomerCustomExact + amt);
    }
  }

  if (internalUnassignedPool.amount !== 0) {
    const weights = rows.map((r) => Math.max(0, r.materialAmountExact));
    const parts = distributeAmountByWeights(internalUnassignedPool.amount, weights);
    for (let i = 0; i < rows.length; i++) {
      rows[i].materialAmountExact = round2(rows[i].materialAmountExact + (parts[i] ?? 0));
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const m = params.measuredRooms[i];
    const addonSum = row.addons.reduce((s, a) => s + a.amountExact, 0);
    const extrasAll = round2(Number(m?.extras) || 0);
    const otherExtras = round2(Math.max(0, extrasAll - addonSum));
    row.materialAmountExact = round2(row.materialAmountExact + otherExtras);
    const customSum = row.customerCustomLines.reduce((s, c) => s + c.amountExact, 0);
    row.roomTotalExact = round2(row.materialAmountExact + addonSum + customSum);
  }

  const projectTotalExact = round2(
    rows.reduce((s, r) => s + r.roomTotalExact, 0) + unassignedCustomerCustomExact
  );

  return {
    version: 1,
    rooms: rows,
    unassignedCustomerCustomExact,
    projectTotalExact
  };
}

/**
 * Per-group comparison for internal estimates: material (counter + splash/FHB at tier rate) and full (material + fixed add-ons + custom lines).
 * Uses wholesale prototype $/sf or ESF Direct $/sf depending on `basis` — no markup percent.
 */
export function buildInternalEstimateGroupComparison(params: {
  countertopSqft: number;
  backsplashSqft: number;
  roomFixedDollars: number;
  customLineDollars: number;
  /** Project/room use tax % on countertop material at each tier rate (0 = none). */
  useTaxPercent?: number;
  basis: "wholesale" | "direct";
}): InternalEstimateGroupComparisonRow[] {
  const ct = Number(params.countertopSqft) || 0;
  const bs = Number(params.backsplashSqft) || 0;
  const roomFix = round2(Number(params.roomFixedDollars) || 0);
  const custom = round2(Number(params.customLineDollars) || 0);
  const taxPct = Math.max(0, Number(params.useTaxPercent) || 0);
  const fullExtra = round2(roomFix + custom);
  return PROTOTYPE_TIERS.map((t) => {
    const rate = materialRateForInternalBasis(t.n, params.basis);
    const materialCounter = round2(ct * rate);
    const useTax = taxPct > 0 ? round2(materialCounter * (taxPct / 100)) : 0;
    const materialCounterPriced = round2(materialCounter + useTax);
    const materialSplashFhb = round2(bs * rate);
    const materialTotal = round2(materialCounterPriced + materialSplashFhb);
    const fullTotal = round2(materialTotal + fullExtra);
    return {
      group: t.n,
      ratePerSqft: rate,
      materialCounter: materialCounterPriced,
      materialSplashFhb,
      materialTotal,
      fullTotal
    };
  });
}

const MIN_PUBLIC_PROTECTION = 1.25;

export type MaterialGroupComparisonRow = {
  group: string;
  rate: number;
  countertopSqft: number;
  backsplashSqft: number;
  countertopWholesale: number;
  backsplashWholesale: number;
  addonCost: number;
  wholesaleTotal: number;
  partnerRetailTotal: number;
  publicSafeTotal: number;
};

/**
 * Per-group breakdown: stone $/sf × sqft per tier + same add-on $ once per group.
 * Public-safe total applies 25%+ protection on the combined wholesale for display.
 */
export function buildMaterialGroupComparison(params: {
  countertopSqft: number;
  backsplashSqft: number;
  addonDollars: number;
  partnerRetailPercent: number;
  partnerRetailMethod: string;
}): MaterialGroupComparisonRow[] {
  const ct = Number(params.countertopSqft) || 0;
  const bs = Number(params.backsplashSqft) || 0;
  const add = round2(Number(params.addonDollars) || 0);
  return PROTOTYPE_TIERS.map((t) => {
    const cc = round2(ct * t.p);
    const bc = round2(bs * t.p);
    const wholesale = round2(cc + bc + add);
    const pr = calculateRetailFromWholesaleSettings(
      wholesale,
      params.partnerRetailMethod || "Markup Percent",
      params.partnerRetailPercent,
      0
    );
    return {
      group: t.n,
      rate: t.p,
      countertopSqft: ct,
      backsplashSqft: bs,
      countertopWholesale: cc,
      backsplashWholesale: bc,
      addonCost: add,
      wholesaleTotal: wholesale,
      partnerRetailTotal: pr.retail,
      publicSafeTotal: round2(wholesale * MIN_PUBLIC_PROTECTION)
    };
  });
}

/** Single pricing scope for Internal Estimate comparisons, live preview, and tier matrices. */
export type InternalEstimateScopeTotals = {
  /** Measured counter SF before Elite whole-foot ceil (audit only). */
  exactCounterSqft: number;
  /** Priced countertop SF (chargeable ceil when enabled). */
  chargeableCounterSqft: number;
  /** Backsplash + FHB SF at exact dimensions (no ceil). */
  backsplashFhbSqft: number;
  roomFixedDollars: number;
  /** Use tax on countertop material (same basis as live estimate). */
  useTaxAmount: number;
};

/**
 * Internal Estimate pricing authority — chargeable counter, exact splash/FHB, room fixed add-ons, use tax.
 */
export function getInternalEstimateScopeTotals(
  drafts: RoomDraft[],
  projectType: string,
  materialBasis: "wholesale" | "direct" = "wholesale",
  projectUseTaxPercent = 0,
  measureOptions: InternalMeasureOptions = INTERNAL_ESTIMATE_MEASURE_OPTIONS
): InternalEstimateScopeTotals & { measuredRooms: MeasuredRoom[] } {
  const { rooms: measuredRooms, totals } = calculateAllRoomDrafts(
    drafts,
    projectType,
    materialBasis,
    projectUseTaxPercent,
    measureOptions
  );
  const breakdown = buildSelectedMaterialBreakdown(drafts, materialBasis, {
    projectUseTaxPercent,
    chargeableCounterCeil: measureOptions.chargeableCounterCeil
  });
  return {
    exactCounterSqft: round2(totals.counter),
    chargeableCounterSqft: round2(totals.priceableCounter),
    backsplashFhbSqft: round2(totals.priceableSplash),
    roomFixedDollars: round2(totals.fixed),
    useTaxAmount: round2(breakdown.totals.useTax?.taxAmount ?? 0),
    measuredRooms
  };
}

export function aggregateComparisonScope(
  drafts: RoomDraft[],
  projectType: string,
  options?: {
    materialBasis?: "wholesale" | "direct";
    projectUseTaxPercent?: number;
    measureOptions?: InternalMeasureOptions;
  }
): {
  countertopSqft: number;
  backsplashSqft: number;
  addonDollars: number;
  useTaxAmount: number;
  exactCounterSqft: number;
  mixedGroupNote: string | null;
} {
  if (!drafts.length) {
    return {
      countertopSqft: 0,
      backsplashSqft: 0,
      addonDollars: 0,
      useTaxAmount: 0,
      exactCounterSqft: 0,
      mixedGroupNote: null
    };
  }
  const scope = getInternalEstimateScopeTotals(
    drafts,
    projectType,
    options?.materialBasis ?? "wholesale",
    options?.projectUseTaxPercent ?? 0,
    options?.measureOptions ?? INTERNAL_ESTIMATE_MEASURE_OPTIONS
  );
  const groups = new Set<string>();
  let pieceOverride = false;
  for (const r of drafts) {
    if (r.roomType === "Vanity" && r.vanity.isVanityProgram !== false) continue;
    if (r.calcMode === "Guided Shape") {
      for (const p of r.guidedPieces) {
        if (p.materialOverride && String(p.materialGroup || "").trim()) pieceOverride = true;
      }
      for (const p of r.fhbPieces) {
        if (p.materialOverride && String(p.materialGroup || "").trim()) pieceOverride = true;
      }
    }
  }
  for (const r of scope.measuredRooms) {
    if (r.isVanityProgram) continue;
    if (r.counter + r.splash + r.fhb <= 0) continue;
    groups.add(r.group);
  }
  const mixed = groups.size > 1 || pieceOverride;
  return {
    countertopSqft: scope.chargeableCounterSqft,
    backsplashSqft: scope.backsplashFhbSqft,
    addonDollars: scope.roomFixedDollars,
    useTaxAmount: scope.useTaxAmount,
    exactCounterSqft: scope.exactCounterSqft,
    mixedGroupNote: mixed
      ? "Estimator comparison only — comparison rows price all countertop sf and backsplash + FHB sf at one tier each; your selected estimate uses mixed piece/room groups (aligned with live summary and backend calculate)."
      : null
  };
}

export function sumGlobalAddOns(add: Record<string, number>): { total: number; lines: DemoLineItem[]; summary: string[] } {
  const lines: DemoLineItem[] = [];
  const summary: string[] = [];
  let total = 0;
  for (const [code, qtyRaw] of Object.entries(add)) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    if (code === "tearout") {
      const sub = TEAROUT.price;
      total += sub;
      lines.push({
        line_type: "addon",
        category: "tearout",
        item_code: "tearout",
        item_name: TEAROUT.label,
        room_name: null,
        quantity: 1,
        unit_type: "flat",
        unit_price: TEAROUT.price,
        line_subtotal: sub
      });
      summary.push(`${TEAROUT.label} — $${sub.toFixed(2)}`);
      continue;
    }
    const spec = ADDON_CATALOG.find((a) => a.id === code);
    if (!spec) continue;
    const sub = qty * spec.price;
    total += sub;
    lines.push({
      line_type: "addon",
      category: "cutout",
      item_code: code,
      item_name: spec.label,
      room_name: null,
      quantity: qty,
      unit_type: "each",
      unit_price: spec.price,
      line_subtotal: round2(sub)
    });
    summary.push(`${spec.label} × ${qty} = $${round2(sub).toFixed(2)}`);
  }
  return { total: round2(total), lines, summary };
}

export type LocalQuoteRun = {
  usedFallback: true;
  fallbackLabel: string;
  materialGroup: string;
  estimated_sqft: number;
  retail: number;
  wholesale?: number;
  profit?: number;
  lineItems: DemoLineItem[];
  addOnsSummary: string[];
  warnings: string[];
  confidence: string;
  reviewNeeded: boolean;
  mathCheck: MathCheckSnapshot;
  allGroupMatrix: ReturnType<typeof buildAllGroupMatrix>;
  totals: RoomEngineTotals;
  measuredRooms: MeasuredRoom[];
};

export function runLocalPrototypeQuote(params: {
  quoteMode: "public" | "partner" | "internal";
  partnerRetailPercent?: number;
  partnerRetailMethod?: string;
  internalMaterialBasis?: "wholesale" | "direct";
  materialGroupTop: string;
  roomDrafts: RoomDraft[];
  globalAddOns: Record<string, number>;
  /** When false, skip global add-ons (room-by-room uses per-room only). */
  applyGlobalAddOns: boolean;
  workflowLabel: string;
  projectType: string;
  /** Internal estimate: sum of structured custom line $ (after validation rules). */
  customLineItemsTotal?: number;
  /** Use tax % on countertop material only (internal estimate). */
  useTaxPercent?: number;
}): LocalQuoteRun {
  const basis = params.internalMaterialBasis ?? "wholesale";
  const roomBasis: "wholesale" | "direct" = params.quoteMode === "internal" ? basis : "wholesale";
  const useTaxPercent = params.quoteMode === "internal" ? Number(params.useTaxPercent) || 0 : 0;
  const measureOptions: InternalMeasureOptions | undefined =
    params.quoteMode === "internal" ? { chargeableCounterCeil: true } : undefined;
  const { rooms: measured, totals } = calculateAllRoomDrafts(
    params.roomDrafts,
    params.projectType,
    roomBasis,
    useTaxPercent,
    measureOptions
  );
  const warnings: string[] = [];
  for (const m of measured) warnings.push(...m.notes);

  const materialLines: DemoLineItem[] = [];
  for (const r of measured) {
    if (r.selected <= 0) continue;
    if (r.isVanityProgram) {
      materialLines.push({
        line_type: "vanity",
        category: "vanity_program",
        item_code: "VANITY",
        item_name: r.name,
        room_name: r.name,
        quantity: 1,
        unit_type: "flat",
        unit_price: r.selected,
        line_subtotal: r.selected
      });
    } else {
      materialLines.push({
        line_type: "material",
        category: "room_total",
        item_code: r.group.replace(/\s+/g, "_").toUpperCase(),
        item_name: `${r.name} — ${r.group} (material + room extras)`,
        room_name: r.name,
        quantity: 1,
        unit_type: "flat",
        unit_price: r.selected,
        line_subtotal: r.selected
      });
    }
  }

  const globalPart = params.applyGlobalAddOns ? sumGlobalAddOns(params.globalAddOns) : { total: 0, lines: [], summary: [] };
  let wholesale = measured.reduce((s, r) => s + r.selected, 0) + globalPart.total;
  wholesale = round2(wholesale);
  const customExtra = params.quoteMode === "internal" ? round2(Number(params.customLineItemsTotal) || 0) : 0;
  if (customExtra !== 0) wholesale = round2(wholesale + customExtra);

  const lineItems = [...materialLines, ...globalPart.lines];
  const estimated_sqft = round2(
    measured.reduce((s, r) => {
      if (r.isVanityProgram) return s;
      return s + r.totalSf;
    }, 0)
  );

  if (estimated_sqft <= 0 && measured.every((m) => m.selected <= 0)) {
    warnings.push("Enter measurements or add a vanity to generate a scope.");
  }

  const primaryGroup = params.materialGroupTop || measured[0]?.group || "Group Promo";
  const groupRate =
    params.quoteMode === "internal" ? materialRateForInternalBasis(primaryGroup, basis) : tierRateForGroup(primaryGroup);

  const tier1 = totals.qualifyingSf >= VANITY_TIER_THRESHOLD_SQFT;
  const vanityTierLabel =
    totals.qualifyingSf === 0 ? "Awaiting kitchen scope" : tier1 ? "Vanity tier 1 (lower) active" : "Vanity tier 2 (standard) active";

  const measurementLines = measured.flatMap((m) => m.details);

  let retail: number;
  let profit: number | undefined;
  const pubMin = 25;
  if (params.quoteMode === "internal") {
    retail = wholesale;
    profit = undefined;
  } else if (params.quoteMode === "public") {
    retail = round2(wholesale * (1 + pubMin / 100));
  } else {
    const p = Number(params.partnerRetailPercent) || 20;
    const r = calculateRetailFromWholesaleSettings(wholesale, params.partnerRetailMethod || "Markup Percent", p, 0);
    retail = r.retail;
    profit = r.profit;
  }

  const mathCheck: MathCheckSnapshot = {
    workflowLabel: params.workflowLabel,
    qualifyingSf: totals.qualifyingSf,
    vanityTierThreshold: VANITY_TIER_THRESHOLD_SQFT,
    vanityTierLabel,
    measurementLines,
    countertopSf:
      params.quoteMode === "internal" ? round2(totals.priceableCounter) : round2(totals.counter),
    exactCountertopSf: params.quoteMode === "internal" ? round2(totals.counter) : undefined,
    backsplashSf: round2(totals.splash),
    fullHeightSf: round2(totals.fhb),
    totalScopeSf: round2(totals.counter + totals.splash + totals.fhb),
    primaryGroup,
    groupRatePerSf: groupRate,
    roomBreakdown: measured.map((m) => ({
      name: m.name,
      wholesale: `$${m.selected.toFixed(2)}`,
      detailCount: m.details.length
    })),
    addOnLines: globalPart.summary,
    wholesale,
    retailOrPublic: retail,
    partnerProfit: params.quoteMode === "partner" ? profit : undefined,
    warnings: [...warnings]
  };

  const addOnsSummary = [
    ...measured.flatMap((m) => m.addons.map((a) => `${a.label} × ${a.qty}`)),
    ...globalPart.summary
  ];
  const summaryFinal = addOnsSummary.length ? addOnsSummary : ["No separate global add-ons (use per-room add-ons in room builder)."];

  const reviewNeeded = warnings.length > 0 || estimated_sqft <= 0;
  const confidence = reviewNeeded ? "Review needed — confirm measurements" : "High for demo purposes";

  const allGroupMatrix =
    params.quoteMode === "internal"
      ? buildInternalGroupMatrix(totals, basis, useTaxPercent)
      : buildAllGroupMatrix(totals);

  return {
    usedFallback: true,
    fallbackLabel: "Demo calculation fallback — backend not connected.",
    materialGroup: primaryGroup,
    estimated_sqft,
    retail,
    wholesale: params.quoteMode === "partner" || params.quoteMode === "internal" ? wholesale : undefined,
    profit: params.quoteMode === "internal" ? undefined : profit,
    lineItems,
    addOnsSummary: summaryFinal,
    warnings,
    confidence,
    reviewNeeded,
    mathCheck,
    allGroupMatrix,
    totals,
    measuredRooms: measured
  };
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 11)}`;
}

export function emptyGuidedPiece(pieceType: GuidedPiece["pieceType"], name: string, depthIn: number): GuidedPiece {
  return { id: newId(), pieceType, name, lengthIn: 0, depthIn, shape: "rect" };
}

/** Single guided “main run” starter for Internal Estimate Head — one straight shape group. */
export function createEstimatorRoom(materialGroup: string): RoomDraft {
  const r = createDefaultRoom(materialGroup);
  r.name = "Room / Area";
  r.guidedLayoutPreset = null;
  const starter: GuidedPiece = {
    id: newId(),
    pieceType: "counter",
    name: "Main run",
    lengthIn: 0,
    depthIn: STANDARD_COUNTER_DEPTH_IN,
    shape: "rect",
    addSplash: true
  };
  return normalizeGuidedShapeRoom({
    ...r,
    calcMode: "Guided Shape",
    guidedPieces: [{ ...starter, addSplash: false }],
    guidedShapeGroups: [
      {
        id: newId(),
        name: "Straight run",
        shapeType: "straight",
        overlapMode: "auto",
        backsplashMode: "include",
        pieces: [{ ...starter, addSplash: false }]
      }
    ]
  });
}

export function createDefaultRoom(materialGroup: string): RoomDraft {
  return {
    id: newId(),
    name: "Kitchen",
    roomType: "Kitchen",
    materialGroup,
    calcMode: "Guided Shape",
    guidedLayoutPreset: null,
    linear: { wallFt: 0, splashIn: STANDARD_BACKSPLASH_HEIGHT_IN, islandL: 0, islandW: 0 },
    direct: { counter: 0, splash: 0 },
    guidedPieces: [
      {
        id: newId(),
        pieceType: "counter",
        name: "Main Wall Run",
        lengthIn: 0,
        depthIn: STANDARD_COUNTER_DEPTH_IN,
        shape: "rect",
        addSplash: true
      },
      {
        id: newId(),
        pieceType: "counter",
        name: "Short Return",
        lengthIn: 0,
        depthIn: STANDARD_COUNTER_DEPTH_IN,
        shape: "rect",
        addSplash: false
      }
    ],
    fhbMode: "Off",
    fhbDirectSf: 0,
    fhbOutlets: 0,
    fhbPieces: [],
    addons: {},
    tear: false,
    raised: "No",
    notes: "",
    useTaxMode: "inherit_project",
    useTaxPercent: 0,
    useTaxBase: "countertop_material",
    vanity: {
      size: "none",
      source: "Promo / Stock 100 Remnant",
      depth: 22.5,
      qty: 1,
      programSink: 0,
      bowl: 0,
      isVanityProgram: true,
      vanityProgramYear: VANITY_PROGRAM_YEAR,
      vanitySinkType: "oval_white",
      vanityExtraTrips: 0,
      outsideProgram: false
    }
  };
}

export function createManualScopeRoom(
  materialGroup: string,
  counter: number,
  splash: number,
  fhbSf?: number
): RoomDraft {
  const r = createDefaultRoom(materialGroup);
  r.name = "Project";
  r.roomType = "Kitchen";
  r.calcMode = "Manual Sq Ft";
  r.direct = { counter: round2(counter), splash: round2(splash) };
  r.guidedPieces = [];
  const fh = Number(fhbSf) || 0;
  if (fh > 0) {
    r.fhbMode = "Manual Sq Ft";
    r.fhbDirectSf = round2(fh);
  } else {
    r.fhbMode = "Off";
    r.fhbDirectSf = 0;
  }
  r.fhbPieces = [];
  return r;
}

export function createVanityRoom(materialGroup: string): RoomDraft {
  const r = createDefaultRoom(materialGroup);
  r.name = "Vanity";
  r.roomType = "Vanity";
  r.calcMode = "Manual Sq Ft";
  r.vanity = {
    ...r.vanity,
    size: "31_S",
    source: "Promo / Stock 100 Remnant",
    isVanityProgram: true,
    vanityProgramYear: VANITY_PROGRAM_YEAR,
    vanitySinkType: "oval_white",
    depth: 22.5
  };
  return r;
}

/** Single synthetic “project” room for non — room-by-room workflows. */
export function syntheticRoomForWorkflow(
  wf: QuoteWorkflowMethod,
  materialGroup: string,
  manual: { counter: number; splash: number },
  linear: { wallFt: number; splashIn: number; islandL: number; islandW: number; counterDepthIn?: number },
  guidedPieces: GuidedPiece[]
): RoomDraft {
  const base = createDefaultRoom(materialGroup);
  base.name = "Project";
  base.roomType = "Kitchen";
  if (wf === "manual_sqft") {
    base.calcMode = "Manual Sq Ft";
    base.direct = { counter: manual.counter, splash: manual.splash };
    base.guidedPieces = [];
  } else if (wf === "rapid_linear") {
    base.calcMode = "Rapid Linear Foot";
    base.linear = { ...linear };
    base.guidedPieces = [];
  } else {
    base.calcMode = "Guided Shape";
    base.guidedPieces = guidedPieces.length ? guidedPieces.map((p) => ({ ...p, id: p.id || newId() })) : base.guidedPieces;
  }
  return base;
}

export function roomsNeedLocalVanityMath(rooms: RoomDraft[]): boolean {
  return rooms.some((r) => r.roomType === "Vanity" && r.vanity.isVanityProgram !== false);
}

/** Serialize non-vanity (and standard-mode vanity) rooms for backend `engine: "rooms"` (pieces optional). */
export function serializeRoomsForApi(rooms: RoomDraft[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const r of rooms) {
    // Vanity Program rooms are serialized separately via serializeVanitiesForApi.
    // Standard-mode vanity rooms price as countertop and are included here.
    if (r.roomType === "Vanity" && r.vanity.isVanityProgram !== false) continue;
    const g = r.materialGroup || "Group Promo";
    const guidedRoom = r.calcMode === "Guided Shape" ? normalizeGuidedShapeRoom(r) : r;
    if (guidedRoom.calcMode === "Guided Shape" && guidedRoom.guidedPieces.length) {
      const pieces: Array<Record<string, unknown>> = [];
      for (const p of guidedRoom.guidedPieces.filter((x) => x.lengthIn > 0 && x.depthIn > 0)) {
        const row: Record<string, unknown> = {
          type: p.pieceType === "fhb" ? "splash" : p.pieceType,
          lengthIn: p.lengthIn,
          depthIn: p.depthIn,
          shape: p.shape,
          name: p.name
        };
        if (p.materialOverride) {
          row.materialOverride = true;
          if (p.materialGroup) row.materialGroup = p.materialGroup;
          if (p.materialColor) row.materialColor = p.materialColor;
          if (p.materialSupplier) row.materialSupplier = p.materialSupplier;
          if (p.materialType) row.materialType = p.materialType;
        }
        pieces.push(row);
        if (p.pieceType === "counter" && p.addSplash && p.lengthIn > 0) {
          const splashRow: Record<string, unknown> = {
            type: "splash",
            lengthIn: p.lengthIn,
            depthIn: STANDARD_BACKSPLASH_HEIGHT_IN,
            shape: "rect" as const,
            name: `${p.name} — 4″ splash`
          };
          if (p.materialOverride) {
            splashRow.materialOverride = true;
            if (p.materialGroup) splashRow.materialGroup = p.materialGroup;
            if (p.materialColor) splashRow.materialColor = p.materialColor;
            if (p.materialSupplier) splashRow.materialSupplier = p.materialSupplier;
            if (p.materialType) splashRow.materialType = p.materialType;
          }
          pieces.push(splashRow);
        }
      }
      if (pieces.length) {
        const grouped = sumAllGuidedShapeGroups(guidedRoom);
        const exactCounter = grouped.counter;
        const chargeableCounter = chargeableCounterSqftFromExact(exactCounter);
        const row: Record<string, unknown> = {
          name: r.name,
          materialGroup: g,
          materialColor: r.materialColor,
          materialSupplier: r.materialSupplier,
          materialType: r.materialType,
          materialCatalogId: r.materialCatalogId ?? null,
          calcMode: r.calcMode,
          addons: { ...r.addons },
          tear: Boolean(r.tear),
          fhbMode: r.fhbMode,
          fhbDirectSf: r.fhbDirectSf,
          fhbOutlets: r.fhbOutlets,
          guidedLayoutPreset: guidedRoom.guidedLayoutPreset ?? null,
          guidedShapeGroups: (guidedRoom.guidedShapeGroups || []).map((grp) => ({
            id: grp.id,
            name: grp.name,
            shapeType: grp.shapeType,
            overlapMode: grp.overlapMode ?? "auto",
            backsplashMode: grp.backsplashMode ?? "include",
            pieces: grp.pieces
              .filter((x) => x.lengthIn > 0 && x.depthIn > 0)
              .map((p) => ({
                type: p.pieceType === "fhb" ? "splash" : p.pieceType,
                name: p.name,
                lengthIn: p.lengthIn,
                depthIn: p.depthIn,
                shape: p.shape,
                addSplash: Boolean(p.addSplash),
                materialOverride: p.materialOverride,
                materialGroup: p.materialGroup,
                materialColor: p.materialColor,
                materialSupplier: p.materialSupplier,
                materialType: p.materialType
              }))
          })),
          cornerOverlapDeductionSf: totalGuidedCornerOverlapDeductionSf(guidedRoom),
          exactCountertopSqft: exactCounter,
          chargeableCountertopSqft: chargeableCounter,
          countertopSqft: chargeableCounter,
          backsplashSqft: round2(grouped.splash + grouped.fhb),
          edgeProfile: r.edgeProfile ?? DEFAULT_EDGE_PROFILE,
          upgradedEdgeLf: r.upgradedEdgeLf ?? 0,
          pieces
        };
        if (r.notes?.trim()) row.notes = r.notes.trim();
        out.push(row);
        continue;
      }
    }
    let ct = 0;
    let bs = 0;
    if (r.calcMode === "Manual Sq Ft") {
      ct = r.direct.counter;
      bs = r.direct.splash;
    } else if (r.calcMode === "Rapid Linear Foot") {
      const a = rapidLinearAreas(
        r.linear.wallFt,
        r.linear.splashIn,
        r.linear.islandL,
        r.linear.islandW,
        r.linear.counterDepthIn
      );
      ct = a.counter;
      bs = a.splash;
    }
    let fhb = 0;
    if (r.fhbMode === "Manual Sq Ft") fhb += r.fhbDirectSf;
    if (r.fhbMode === "Guided Shape") {
      const fh = sumGuidedPiecesByType(r.fhbPieces);
      fhb += fh.counter + fh.splash + fh.fhb;
    }
    const row: Record<string, unknown> = {
      name: r.name,
      materialGroup: g,
      materialColor: r.materialColor,
      materialSupplier: r.materialSupplier,
      materialType: r.materialType,
      materialCatalogId: r.materialCatalogId ?? null,
      calcMode: r.calcMode,
      addons: { ...r.addons },
      tear: Boolean(r.tear),
      fhbMode: r.fhbMode,
      fhbDirectSf: r.fhbDirectSf,
      fhbOutlets: r.fhbOutlets,
      guidedLayoutPreset: r.guidedLayoutPreset ?? null,
      useTaxMode: r.useTaxMode ?? "inherit_project",
      useTaxPercent: Math.max(0, Number(r.useTaxPercent) || 0),
      useTaxBase: r.useTaxBase ?? "countertop_material",
      edgeProfile: r.edgeProfile ?? DEFAULT_EDGE_PROFILE,
      upgradedEdgeLf: r.upgradedEdgeLf ?? 0,
      countertopSqft: ct,
      backsplashSqft: round2(bs + fhb)
    };
    if (r.calcMode === "Rapid Linear Foot") {
      row.linear = { ...r.linear };
    }
    if (r.calcMode === "Manual Sq Ft") {
      row.directCounterSqft = ct;
      row.directSplashSqft = bs;
    }
    if (r.fhbMode === "Guided Shape" && r.fhbPieces.length) {
      row.fhbPieces = r.fhbPieces
        .filter((p) => p.lengthIn > 0 && p.depthIn > 0)
        .map((p) => ({
          type: p.pieceType === "fhb" ? "splash" : p.pieceType,
          lengthIn: p.lengthIn,
          depthIn: p.depthIn,
          shape: p.shape,
          name: p.name
        }));
    }
    if (r.notes?.trim()) row.notes = r.notes.trim();
    out.push(row);
  }
  return out;
}

/** Full room drafts for `internal_ui.estimate_room_drafts` — preserves add-ons, FHB, colors, layout preset. */
export function serializeRoomDraftsForInternalUi(rooms: RoomDraft[]): RoomDraft[] {
  return normalizeGuidedShapeRooms(rooms).map((r) => ({
    ...r,
    addons: { ...r.addons },
    guidedPieces: r.guidedPieces.map((p) => ({ ...p })),
    guidedShapeGroups: r.guidedShapeGroups?.map((g) => ({
      ...g,
      pieces: g.pieces.map((p) => ({ ...p }))
    })),
    fhbPieces: r.fhbPieces.map((p) => ({ ...p })),
    linear: { ...r.linear },
    direct: { ...r.direct },
    vanity: { ...r.vanity }
  }));
}

function hydrateGuidedPieceFromRow(x: Record<string, unknown>): GuidedPiece {
  const tRaw = String(x.type || "counter").toLowerCase();
  const pieceType: GuidedPiece["pieceType"] = tRaw === "splash" ? "splash" : tRaw === "fhb" ? "fhb" : "counter";
  const sh = String(x.shape || "rect").toLowerCase() === "tri" ? "tri" : "rect";
  return {
    id: newId(),
    pieceType,
    name: String(x.name || "Piece"),
    lengthIn: Number(x.lengthIn ?? x.l ?? 0) || 0,
    depthIn: Number(x.depthIn ?? x.d ?? 0) || 0,
    shape: sh as PieceShape,
    addSplash: Boolean(x.addSplash ?? x.add_splash),
    materialOverride: Boolean(x.materialOverride ?? x.material_override),
    materialGroup: x.materialGroup != null ? String(x.materialGroup) : undefined,
    materialColor: x.materialColor != null ? String(x.materialColor) : undefined,
    materialSupplier: x.materialSupplier != null ? String(x.materialSupplier) : undefined,
    materialType: x.materialType != null ? String(x.materialType) : undefined
  };
}

function applyRoomPersistenceFields(base: RoomDraft, r: Record<string, unknown>) {
  if (r.materialCatalogId != null) base.materialCatalogId = String(r.materialCatalogId) || null;
  if (r.calcMode != null) base.calcMode = String(r.calcMode) as RoomDraft["calcMode"];
  if (r.guidedLayoutPreset != null) base.guidedLayoutPreset = String(r.guidedLayoutPreset) as RoomDraft["guidedLayoutPreset"];
  const shapeGroups = r.guidedShapeGroups;
  if (Array.isArray(shapeGroups) && shapeGroups.length) {
    base.guidedShapeGroups = shapeGroups
      .filter((g) => g && typeof g === "object")
      .map((g) => {
        const gr = g as Record<string, unknown>;
        const pieces = Array.isArray(gr.pieces) ? gr.pieces : [];
        const om = gr.overlapMode != null ? String(gr.overlapMode) : undefined;
        const bm = gr.backsplashMode != null ? String(gr.backsplashMode) : undefined;
        return {
          id: String(gr.id || newId()),
          name: String(gr.name || "Shape group"),
          shapeType: String(gr.shapeType || "manual") as GuidedShapeGroupType,
          overlapMode:
            om === "none" || om === "L-Shape" || om === "U-Shape" || om === "auto"
              ? (om as GuidedShapeGroup["overlapMode"])
              : undefined,
          backsplashMode: bm === "exclude" || bm === "include" ? (bm as GuidedShapeGroup["backsplashMode"]) : undefined,
          pieces: pieces.filter((p) => p && typeof p === "object").map((p) => hydrateGuidedPieceFromRow(p as Record<string, unknown>))
        } satisfies GuidedShapeGroup;
      });
  }
  if (r.addons && typeof r.addons === "object") {
    base.addons = { ...(r.addons as Record<string, number>) };
  }
  if (r.tear != null) base.tear = Boolean(r.tear);
  if (r.fhbMode != null) base.fhbMode = String(r.fhbMode) as RoomDraft["fhbMode"];
  if (r.fhbDirectSf != null) base.fhbDirectSf = Number(r.fhbDirectSf) || 0;
  if (r.fhbOutlets != null) base.fhbOutlets = Math.max(0, Math.floor(Number(r.fhbOutlets)) || 0);
  if (r.notes != null) base.notes = String(r.notes);
  if (r.useTaxMode != null) base.useTaxMode = String(r.useTaxMode) as RoomDraft["useTaxMode"];
  if (r.useTaxPercent != null) base.useTaxPercent = Math.max(0, Number(r.useTaxPercent) || 0);
  if (r.useTaxBase != null) base.useTaxBase = "countertop_material";
  if (r.edgeProfile != null) base.edgeProfile = String(r.edgeProfile);
  if (r.upgradedEdgeLf != null) base.upgradedEdgeLf = Math.max(0, Number(r.upgradedEdgeLf) || 0);
  const v = r.vanity;
  if (v && typeof v === "object") {
    const vv = v as Record<string, unknown>;
    if (vv.isVanityProgram != null) base.vanity.isVanityProgram = Boolean(vv.isVanityProgram);
    if (vv.vanityProgramYear != null) base.vanity.vanityProgramYear = Number(vv.vanityProgramYear) || VANITY_PROGRAM_YEAR;
    if (vv.vanityTier != null) base.vanity.vanityTier = String(vv.vanityTier) as VanityKitchenTier;
    if (vv.vanityTierOverrideReason != null) base.vanity.vanityTierOverrideReason = String(vv.vanityTierOverrideReason);
    if (vv.vanitySinkType != null) base.vanity.vanitySinkType = String(vv.vanitySinkType) as VanitySinkType;
    if (vv.vanityExtraTrips != null) base.vanity.vanityExtraTrips = Math.max(0, Math.floor(Number(vv.vanityExtraTrips)) || 0);
    if (vv.outsideProgram != null) base.vanity.outsideProgram = Boolean(vv.outsideProgram);
    if (vv.vanityEligibilityNote != null) base.vanity.vanityEligibilityNote = String(vv.vanityEligibilityNote);
  }
  if (r.linear && typeof r.linear === "object") {
    const ln = r.linear as Record<string, unknown>;
    base.linear = {
      wallFt: Number(ln.wallFt) || 0,
      splashIn: Number(ln.splashIn) || STANDARD_BACKSPLASH_HEIGHT_IN,
      islandL: Number(ln.islandL) || 0,
      islandW: Number(ln.islandW) || 0,
      counterDepthIn: ln.counterDepthIn != null ? Number(ln.counterDepthIn) : undefined
    };
  }
  const directCt = r.directCounterSqft ?? r.direct_counter_sqft;
  const directSp = r.directSplashSqft ?? r.direct_splash_sqft;
  if (directCt != null || directSp != null) {
    base.direct = {
      counter: Number(directCt ?? r.countertopSqft ?? 0) || 0,
      splash: Number(directSp ?? 0) || 0
    };
  }
  const fhbPieces = r.fhbPieces;
  if (Array.isArray(fhbPieces) && fhbPieces.length) {
    base.fhbPieces = fhbPieces.filter((p) => p && typeof p === "object").map((p) => hydrateGuidedPieceFromRow(p as Record<string, unknown>));
  }
}

/** Prefer `estimate_room_drafts` when present; otherwise rebuild from API `estimate_rooms`. */
export function hydrateRoomDraftsFromInternalUi(
  roomDrafts: unknown,
  estimateRooms: unknown
): RoomDraft[] {
  if (Array.isArray(roomDrafts) && roomDrafts.length) {
    const out: RoomDraft[] = [];
    for (const row of roomDrafts) {
      if (!row || typeof row !== "object") continue;
      const d = row as RoomDraft;
      const base = createDefaultRoom(String(d.materialGroup || "Group Promo"));
      Object.assign(base, {
        ...d,
        id: String(d.id || newId()),
        addons: { ...(d.addons || {}) },
        guidedPieces: (d.guidedPieces || []).map((p) => ({ ...p, id: String(p.id || newId()) })),
        fhbPieces: (d.fhbPieces || []).map((p) => ({ ...p, id: String(p.id || newId()) })),
        linear: { ...base.linear, ...(d.linear || {}) },
        direct: { ...base.direct, ...(d.direct || {}) },
        vanity: { ...base.vanity, ...(d.vanity || {}) }
      });
      out.push(base.calcMode === "Guided Shape" ? normalizeGuidedShapeRoom(base) : base);
    }
    return out.length ? out : [createDefaultRoom("Group Promo")];
  }
  return normalizeGuidedShapeRooms(hydrateRoomDraftsFromEstimateRooms(Array.isArray(estimateRooms) ? estimateRooms : []));
}

/** Rebuild room drafts from an eliteOS `estimate_rooms` / API rooms array (hydration). */
export function hydrateRoomDraftsFromEstimateRooms(rows: unknown[]): RoomDraft[] {
  if (!Array.isArray(rows) || rows.length === 0) return [createDefaultRoom("Group Promo")];
  const out: RoomDraft[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const mg = String(r.materialGroup || r.group || "Group Promo");
    if (String(r.roomType || r.room_type || "") === "Vanity") {
      const vr = createVanityRoom(mg);
      vr.name = String(r.name || r.room_name || "Vanity");
      vr.notes = r.notes != null ? String(r.notes) : "";
      // Restore persisted fields including isVanityProgram (false = standard countertop mode).
      applyRoomPersistenceFields(vr, r);
      out.push(vr);
      continue;
    }
    const base = createDefaultRoom(mg);
    base.name = String(r.name || r.room_name || "Room");
    base.roomType = String(r.roomType || r.room_type || "Kitchen");
    base.materialGroup = mg;
    if (r.materialColor != null) base.materialColor = String(r.materialColor);
    if (r.materialSupplier != null) base.materialSupplier = String(r.materialSupplier);
    if (r.materialType != null) base.materialType = String(r.materialType);
    applyRoomPersistenceFields(base, r);
    const pieces = r.pieces;
    if (Array.isArray(pieces) && pieces.length) {
      base.calcMode = "Guided Shape";
      base.guidedPieces = pieces
        .filter((p) => p && typeof p === "object")
        .map((p) => hydrateGuidedPieceFromRow(p as Record<string, unknown>));
      base.direct = { counter: 0, splash: 0 };
    } else if (base.calcMode !== "Rapid Linear Foot") {
      base.calcMode = (r.calcMode as RoomDraft["calcMode"]) || "Manual Sq Ft";
      base.guidedPieces = [];
      const totalBs = Number(r.backsplashSqft ?? r.roomSplash ?? 0) || 0;
      const fhbSf =
        base.fhbMode === "Manual Sq Ft"
          ? Number(base.fhbDirectSf) || 0
          : base.fhbMode === "Guided Shape"
            ? sumGuidedPiecesByType(base.fhbPieces).fhb + sumGuidedPiecesByType(base.fhbPieces).counter
            : 0;
      base.direct = {
        counter: Number(r.countertopSqft ?? r.roomCounter ?? base.direct.counter ?? 0) || 0,
        splash: Math.max(0, round2(totalBs - fhbSf))
      };
    }
    out.push(base.calcMode === "Guided Shape" ? normalizeGuidedShapeRoom(base) : base);
  }
  return out.length ? out : [createDefaultRoom("Group Promo")];
}

/** Persist customer room/area breakdown on save for stable reprints. */
export function serializeCustomerRoomAreaBreakdown(
  breakdown: CustomerRoomAreaCostBreakdown
): CustomerRoomAreaCostBreakdown {
  return JSON.parse(JSON.stringify(breakdown)) as CustomerRoomAreaCostBreakdown;
}

/** Use saved breakdown when present; otherwise rebuild from current room math. */
export function hydrateCustomerRoomAreaBreakdown(
  saved: unknown,
  rebuild: () => CustomerRoomAreaCostBreakdown
): CustomerRoomAreaCostBreakdown {
  if (saved && typeof saved === "object") {
    const o = saved as CustomerRoomAreaCostBreakdown;
    if (o.version === 1 && Array.isArray(o.rooms) && o.rooms.length) {
      return serializeCustomerRoomAreaBreakdown(o);
    }
  }
  return rebuild();
}
