/**
 * Prototype v1.01 quote math — structured mirror of ESF Quoting Tool - v1.01.html
 * for app-quote demos. Authoritative server math remains backend-core/src/quotes/quoteCalculator.js.
 */

import type { DemoLineItem } from "./demoFallback";
import type { GuidedPiece, MathCheckSnapshot, MeasuredRoom, RoomDraft, RoomEngineTotals } from "./quoteTypes";
import type { QuoteWorkflowMethod } from "./quoteTypes";
import {
  qualifyingSfFromRoomDrafts,
  rapidLinearAreas,
  round2,
  sfFromGuidedPiece,
  STANDARD_BACKSPLASH_HEIGHT_IN,
  STANDARD_COUNTER_DEPTH_IN,
  sumGuidedPiecesByType
} from "./measurementEngine";

export const VANITY_TIER_THRESHOLD_SQFT = 35;

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

export function measureRoomDraft(room: RoomDraft, qualifyingSf: number): MeasuredRoom {
  const group = String(room.materialGroup || "Group Promo").trim();
  const rate = tierRateForGroup(group);
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

  if (room.roomType === "Vanity") {
    const sk = room.vanity.size;
    const q = Math.max(1, Math.floor(room.vanity.qty) || 1);
    if (sk !== "none" && VANITY_PRICING[sk]) {
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
      vanityTier
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
    const g = sumGuidedPiecesByType(room.guidedPieces);
    counter = g.counter;
    splash = g.splash;
    fhb = g.fhb;
    details.push(...g.lines);
    for (const p of room.guidedPieces) {
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

  selected = round2((counter + splash + fhb) * rate + extras);
  priceableCounter = counter;
  priceableSplash = splash + fhb;
  fixedTotal = extras;

  const totalSf = round2(counter + splash + fhb);
  return {
    id: room.id,
    name,
    type: room.roomType,
    group,
    rate,
    counter: round2(counter),
    splash: round2(splash),
    fhb: round2(fhb),
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
    vanityTier
  };
}

export function calculateAllRoomDrafts(rooms: RoomDraft[], projectType: string): { rooms: MeasuredRoom[]; totals: RoomEngineTotals } {
  const qualifyingSf = qualifyingSfFromRoomDrafts(rooms);
  const measured = rooms.map((r) => measureRoomDraft(r, qualifyingSf));
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

export function aggregateComparisonScope(
  drafts: RoomDraft[],
  projectType: string
): {
  countertopSqft: number;
  backsplashSqft: number;
  addonDollars: number;
  mixedGroupNote: string | null;
} {
  if (!drafts.length) {
    return { countertopSqft: 0, backsplashSqft: 0, addonDollars: 0, mixedGroupNote: null };
  }
  const { rooms, totals } = calculateAllRoomDrafts(drafts, projectType);
  const groups = new Set<string>();
  for (const r of rooms) {
    if (r.type === "Vanity") continue;
    if (r.counter + r.splash + r.fhb <= 0) continue;
    groups.add(r.group);
  }
  const mixed = groups.size > 1;
  return {
    countertopSqft: totals.priceableCounter,
    backsplashSqft: totals.priceableSplash,
    addonDollars: round2(totals.fixed),
    mixedGroupNote: mixed
      ? "Group comparison uses total measured scope. Per-room mixed group comparison is a future enhancement."
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
  quoteMode: "public" | "partner";
  partnerRetailPercent: number;
  partnerRetailMethod: string;
  materialGroupTop: string;
  roomDrafts: RoomDraft[];
  globalAddOns: Record<string, number>;
  /** When false, skip global add-ons (room-by-room uses per-room only). */
  applyGlobalAddOns: boolean;
  workflowLabel: string;
  projectType: string;
}): LocalQuoteRun {
  const { rooms: measured, totals } = calculateAllRoomDrafts(params.roomDrafts, params.projectType);
  const warnings: string[] = [];
  for (const m of measured) warnings.push(...m.notes);

  const materialLines: DemoLineItem[] = [];
  for (const r of measured) {
    if (r.selected <= 0) continue;
    if (r.type === "Vanity") {
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

  const lineItems = [...materialLines, ...globalPart.lines];
  const estimated_sqft = round2(
    measured.reduce((s, r) => {
      if (r.type === "Vanity") return s;
      return s + r.totalSf;
    }, 0)
  );

  if (estimated_sqft <= 0 && measured.every((m) => m.selected <= 0)) {
    warnings.push("Enter measurements or add a vanity to generate a scope.");
  }

  const primaryGroup = params.materialGroupTop || measured[0]?.group || "Group Promo";
  const groupRate = tierRateForGroup(primaryGroup);

  const tier1 = totals.qualifyingSf >= VANITY_TIER_THRESHOLD_SQFT;
  const vanityTierLabel =
    totals.qualifyingSf === 0 ? "Awaiting kitchen scope" : tier1 ? "Vanity tier 1 (lower) active" : "Vanity tier 2 (standard) active";

  const measurementLines = measured.flatMap((m) => m.details);

  let retail: number;
  let profit: number | undefined;
  const pubMin = 25;
  if (params.quoteMode === "public") {
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
    countertopSf: round2(totals.counter),
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

  return {
    usedFallback: true,
    fallbackLabel: "Demo calculation fallback — backend not connected.",
    materialGroup: primaryGroup,
    estimated_sqft,
    retail,
    wholesale: params.quoteMode === "partner" ? wholesale : undefined,
    profit,
    lineItems,
    addOnsSummary: summaryFinal,
    warnings,
    confidence,
    reviewNeeded,
    mathCheck,
    allGroupMatrix: buildAllGroupMatrix(totals),
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

export function createDefaultRoom(materialGroup: string): RoomDraft {
  return {
    id: newId(),
    name: "Kitchen",
    roomType: "Kitchen",
    materialGroup,
    calcMode: "Guided Shape",
    linear: { wallFt: 0, splashIn: STANDARD_BACKSPLASH_HEIGHT_IN, islandL: 0, islandW: 0 },
    direct: { counter: 0, splash: 0 },
    guidedPieces: [
      { id: newId(), pieceType: "counter", name: "Main Wall Run", lengthIn: 0, depthIn: STANDARD_COUNTER_DEPTH_IN, shape: "rect" },
      { id: newId(), pieceType: "counter", name: "Short Return", lengthIn: 0, depthIn: STANDARD_COUNTER_DEPTH_IN, shape: "rect" }
    ],
    fhbMode: "Off",
    fhbDirectSf: 0,
    fhbOutlets: 0,
    fhbPieces: [],
    addons: {},
    tear: false,
    raised: "No",
    notes: "",
    vanity: {
      size: "none",
      source: "Promo / Stock 100 Remnant",
      depth: 22.5,
      qty: 1,
      programSink: 0,
      bowl: 0
    }
  };
}

export function createManualScopeRoom(materialGroup: string, counter: number, splash: number): RoomDraft {
  const r = createDefaultRoom(materialGroup);
  r.name = "Project";
  r.roomType = "Kitchen";
  r.calcMode = "Manual Sq Ft";
  r.direct = { counter: round2(counter), splash: round2(splash) };
  r.guidedPieces = [];
  r.fhbMode = "Off";
  r.fhbPieces = [];
  return r;
}

export function createVanityRoom(materialGroup: string): RoomDraft {
  const r = createDefaultRoom(materialGroup);
  r.name = "Vanity";
  r.roomType = "Vanity";
  r.calcMode = "Manual Sq Ft";
  r.vanity = { ...r.vanity, size: "31_S", source: "Promo / Stock 100 Remnant" };
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
  return rooms.some((r) => r.roomType === "Vanity");
}

/** Serialize non-vanity rooms for backend `engine: "rooms"` (pieces optional). */
export function serializeRoomsForApi(rooms: RoomDraft[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const r of rooms) {
    if (r.roomType === "Vanity") continue;
    const g = r.materialGroup || "Group Promo";
    if (r.calcMode === "Guided Shape" && r.guidedPieces.length) {
      const pieces = r.guidedPieces
        .filter((p) => p.lengthIn > 0 && p.depthIn > 0)
        .map((p) => ({
          type: p.pieceType === "fhb" ? "splash" : p.pieceType,
          lengthIn: p.lengthIn,
          depthIn: p.depthIn,
          shape: p.shape,
          name: p.name
        }));
      if (pieces.length) {
        out.push({ name: r.name, materialGroup: g, pieces });
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
    out.push({
      name: r.name,
      materialGroup: g,
      countertopSqft: ct,
      backsplashSqft: round2(bs + fhb)
    });
  }
  return out;
}
