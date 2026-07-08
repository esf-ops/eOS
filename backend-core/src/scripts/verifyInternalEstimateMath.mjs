/**
 * Verifies internal_quote totals: wholesale vs direct rate books, custom lines, no client markup leakage.
 * Run: node backend-core/src/scripts/verifyInternalEstimateMath.mjs
 */
import {
  calculateQuote,
  ESF_DIRECT_PRICE_PER_SQFT,
  PROTOTYPE_TIER_PRICE_PER_SQFT,
  SPECIALTY_EDGE_RATE_PER_LF
} from "../quotes/quoteCalculator.js";
import {
  INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT,
  resolveInternalEstimateMaterialTaxPolicy
} from "../quotes/internalEstimateMaterialTaxPolicy.js";

function assertNear(label, actual, expected, eps = 0.02) {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e) || Math.abs(a - e) > eps) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

function round2Tax(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Material $ with fixed 2% Internal Estimate use tax on countertop + backsplash bases. */
function internalTaxedMaterial(ctDollars, bsDollars = 0) {
  const ct = round2Tax(ctDollars);
  const bs = round2Tax(bsDollars);
  return round2Tax(ct + bs + round2Tax(ct * 0.02) + round2Tax(bs * 0.02));
}

function internalMaterialTotal(counterSf, splashSf, rate) {
  return internalTaxedMaterial(counterSf * rate, splashSf * rate);
}

const base = {
  quoteSource: "internal_quote",
  engine: "legacy",
  materialGroup: "Group Promo",
  areas: { countertopSqft: 10, backsplashSqft: 0 },
  rooms: [],
  addOns: {}
};

const wholesalePromo = await calculateQuote({ ...base, internalMaterialBasis: "wholesale" }, {});
const directPromo = await calculateQuote({ ...base, internalMaterialBasis: "direct" }, {});

const wRate = PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"];
const dRate = ESF_DIRECT_PRICE_PER_SQFT["Group Promo"];

assertNear("A wholesale 10 sf Promo", wholesalePromo.totals.retail, internalMaterialTotal(10, 0, wRate));
assertNear("A direct 10 sf Promo", directPromo.totals.retail, internalMaterialTotal(10, 0, dRate));
if (wholesalePromo.totals.retail !== wholesalePromo.totals.wholesale) {
  throw new Error("internal_quote wholesale mode: retail should equal wholesale total");
}

const groupAWholesale = PROTOTYPE_TIER_PRICE_PER_SQFT["Group A"];
const tear = {
  name: "Tear Out",
  category: "Labor",
  quantity: 1,
  unitPrice: 750
};
const bWholesale = await calculateQuote(
  {
    ...base,
    materialGroup: "Group A",
    internalMaterialBasis: "wholesale",
    customLineItems: [tear]
  },
  {}
);
const bDirect = await calculateQuote(
  {
    ...base,
    materialGroup: "Group A",
    internalMaterialBasis: "direct",
    customLineItems: [tear]
  },
  {}
);
assertNear("B wholesale 10 sf A + 750", bWholesale.totals.retail, internalMaterialTotal(10, 0, groupAWholesale) + 750);
assertNear("B direct 10 sf A + 750", bDirect.totals.retail, internalMaterialTotal(10, 0, ESF_DIRECT_PRICE_PER_SQFT["Group A"]) + 750);

const c = await calculateQuote(
  {
    ...base,
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 6, backsplashSqft: 4 }
  },
  {}
);
assertNear("C counter+backsplash same rate", c.totals.retail, internalMaterialTotal(6, 4, wRate));

const evil = await calculateQuote(
  {
    ...base,
    internalMaterialBasis: "wholesale",
    retailMarkupPercent: 99,
    retailMethod: "Markup Percent"
  },
  {}
);
assertNear("Markup fields ignored for internal", evil.totals.retail, internalMaterialTotal(10, 0, wRate));

const roomsKitchenMixed = [
  {
    name: "Kitchen",
    materialGroup: "Group Promo",
    pieces: [
      { type: "counter", name: "PromoRun", lengthIn: 120, depthIn: 12, shape: "rect" },
      {
        type: "counter",
        name: "GroupFRun",
        lengthIn: 120,
        depthIn: 12,
        shape: "rect",
        materialOverride: true,
        materialGroup: "Group F"
      }
    ]
  }
];

const mixedPiecesWholesale = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: roomsKitchenMixed,
    addOns: {}
  },
  {}
);
const wF = PROTOTYPE_TIER_PRICE_PER_SQFT["Group F"];
assertNear("1 mixed pieces one room (Promo + Group F)", mixedPiecesWholesale.totals.retail, internalTaxedMaterial(10 * wRate + 10 * wF));

const mixedPiecesDirect = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "direct",
    materialGroup: "Group Promo",
    rooms: roomsKitchenMixed,
    addOns: {}
  },
  {}
);
const dF = ESF_DIRECT_PRICE_PER_SQFT["Group F"];
assertNear("1b mixed pieces direct book", mixedPiecesDirect.totals.retail, internalTaxedMaterial(10 * dRate + 10 * dF));

const wC = PROTOTYPE_TIER_PRICE_PER_SQFT["Group C"];
const wE = PROTOTYPE_TIER_PRICE_PER_SQFT["Group E"];
const splashOverrideRooms = [
  {
    name: "Kitchen",
    materialGroup: "Group C",
    pieces: [
      { type: "counter", name: "Perimeter", lengthIn: 240, depthIn: 12, shape: "rect" },
      {
        type: "splash",
        name: "Accent",
        lengthIn: 120,
        depthIn: 6,
        shape: "rect",
        materialOverride: true,
        materialGroup: "Group E"
      }
    ]
  }
];
const splashOv = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group C",
    rooms: splashOverrideRooms,
    addOns: {}
  },
  {}
);
const splashSf = Math.round((120 * 6 * 100) / 144) / 100;
assertNear("2 backsplash piece override Group E", splashOv.totals.retail, internalTaxedMaterial(20 * wC, splashSf * wE));

const splitSameGroup = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group C",
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group C",
        pieces: [
          { type: "counter", name: "ct", lengthIn: 240, depthIn: 12, shape: "rect" },
          { type: "splash", name: "bs", lengthIn: 120, depthIn: 8, shape: "rect" }
        ]
      }
    ],
    addOns: {}
  },
  {}
);
const bsSf8 = Math.round((120 * 8 * 100) / 144) / 100;
assertNear("3 counter + backsplash same Group C", splitSameGroup.totals.retail, internalMaterialTotal(20, bsSf8, wC));

const tripCharge = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        pieces: [{ type: "counter", name: "Run", lengthIn: 120, depthIn: 12, shape: "rect" }]
      }
    ],
    addOns: {},
    customLineItems: [
      { name: "Trip charge", category: "Fee", quantity: 1, unitPrice: 150, customerFacing: true }
    ]
  },
  {}
);
assertNear("4 trip charge custom line +150", tripCharge.totals.retail, internalMaterialTotal(10, 0, wRate) + 150);

const evilRooms = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group Promo",
    retailMarkupPercent: 99,
    retailMethod: "Markup Percent",
    rooms: roomsKitchenMixed,
    addOns: {}
  },
  {}
);
assertNear("5 evil markup ignored (rooms engine)", evilRooms.totals.retail, internalTaxedMaterial(10 * wRate + 10 * wF));

// ── Chargeable sqft ceil tests ──────────────────────────────────────────────
// Counter ceil: 8.3 sf → charges as 9 sf
const ceilCounter83 = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        pieces: [{ type: "counter", name: "Run", lengthIn: 119.52, depthIn: 12, shape: "rect" }]
      }
    ],
    addOns: {}
  },
  {}
);
// 119.52 * 12 / 144 = 9.96 → but we want to test near-9 using a custom sqft
// Use manual areas path instead for precise fractional control
const ceilCounterManual83 = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 8.3, backsplashSqft: 0 },
    rooms: [],
    addOns: {}
  },
  {}
);
assertNear("6 counter 8.3 sf ceils to 9 sf", ceilCounterManual83.totals.retail, internalMaterialTotal(9, 0, wRate));

// Counter ceil: 8.9 sf → charges as 9 sf
const ceilCounterManual89 = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 8.9, backsplashSqft: 0 },
    rooms: [],
    addOns: {}
  },
  {}
);
assertNear("7 counter 8.9 sf ceils to 9 sf", ceilCounterManual89.totals.retail, internalMaterialTotal(9, 0, wRate));

// Backsplash ceil: 2.11 sf → charges as 3 sf
const ceilSplashManual211 = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 0, backsplashSqft: 2.11 },
    rooms: [],
    addOns: {}
  },
  {}
);
assertNear("8 backsplash 2.11 sf ceils to 3 sf", ceilSplashManual211.totals.retail, internalMaterialTotal(0, 3, wRate));

// Backsplash ceil: 2.56 sf → charges as 3 sf
const ceilSplashManual256 = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 0, backsplashSqft: 2.56 },
    rooms: [],
    addOns: {}
  },
  {}
);
assertNear("9 backsplash 2.56 sf ceils to 3 sf", ceilSplashManual256.totals.retail, internalMaterialTotal(0, 3, wRate));

// Zero sf remains zero
const ceilZero = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 0, backsplashSqft: 0 },
    rooms: [],
    addOns: {}
  },
  {}
);
assertNear("10 zero sf remains zero", ceilZero.totals.retail, 0);

// Rooms-engine, non-guided path: backsplash 3.33 sf → ceils to 4 sf
const ceilRoomsSplash = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 3.33
      }
    ],
    addOns: {}
  },
  {}
);
// counter: 10 sf (whole); splash: 3.33 → ceils to 4
assertNear("11 rooms-engine backsplash 3.33 sf ceils to 4 sf", ceilRoomsSplash.totals.retail, internalMaterialTotal(10, 4, wRate));

// Rooms-engine, non-guided: counter 8.3 sf + backsplash 2.11 sf — both ceil independently
const ceilRoomsBoth = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 8.3,
        backsplashSqft: 2.11
      }
    ],
    addOns: {}
  },
  {}
);
// counter 8.3 → 9, backsplash 2.11 → 3
assertNear("12 rooms-engine counter 8.3→9 + backsplash 2.11→3", ceilRoomsBoth.totals.retail, internalMaterialTotal(9, 3, wRate));

// ── Customer-facing print total = sum of rounded visible rows ───────────────
// These are pure-math tests mirroring the logic in CustomerEstimatePrint.tsx.
// roundCustomerDisplay: ceil to nearest $10 for amounts > 0; 0 otherwise.
function roundCustomerDisplay(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

function assertEq(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

// Individual rows round up to nearest $10.
assertEq("cep-row counter $963 → $970", roundCustomerDisplay(963), 970);
assertEq("cep-row backsplash $136 → $140", roundCustomerDisplay(136), 140);
assertEq("cep-row addons $100 → $100", roundCustomerDisplay(100), 100);
assertEq("cep-row fixture $88 → $90", roundCustomerDisplay(88), 90);

// Total = sum of rounded rows, NOT roundCustomerDisplay(exactSum).
// Exact sum = 963+136+100+88 = 1287 → roundCustomerDisplay(1287) = $1,290 (WRONG).
// Correct = $970 + $140 + $100 + $90 = $1,300.
const qaCounterExact = 963;
const qaBacksplashExact = 136;
const qaAddonsExact = 100;
const qaFixtureExact = 88;
const qaExactSum = qaCounterExact + qaBacksplashExact + qaAddonsExact + qaFixtureExact;
const qaOldWay = roundCustomerDisplay(qaExactSum); // $1,290 — the pre-fix total
const qaNewWay =
  roundCustomerDisplay(qaCounterExact) +
  roundCustomerDisplay(qaBacksplashExact) +
  roundCustomerDisplay(qaAddonsExact) +
  roundCustomerDisplay(qaFixtureExact);
assertEq("cep-total QA old way (exact rounded) was $1,290", qaOldWay, 1290);
assertEq("cep-total QA new way (sum of rounded rows) is $1,300", qaNewWay, 1300);
assertEq("cep-total new > old when individual ceilings compound", qaNewWay > qaOldWay, true);

// Simpler: two rows that each round up; total must equal sum of rounded rows.
assertEq("cep-total two-row: $966+$133 → $970+$140 = $1,110", roundCustomerDisplay(966) + roundCustomerDisplay(133), 1110);
assertEq("cep-total two-row exact sum $1,099 rounds to $1,100 (≠ row sum)", roundCustomerDisplay(966 + 133), 1100);
// The above confirms the mismatch; the correct customer total is $1,110.

// Zero amounts stay zero.
assertEq("cep-row zero amount → $0", roundCustomerDisplay(0), 0);
// Negative (discount) amounts stay zero in customer display.
assertEq("cep-row negative stays 0", roundCustomerDisplay(-50), 0);

// ── QA example: customer PDF total vs Quote Library grand_total ──────────────
// This mirrors the observed discrepancy: Quote Library showed $2,151.18 (exact backend
// material total) while the customer PDF showed $2,360 (sum of rounded visible rows).
// customer_display_total = roundCustomerDisplay(countertop) + roundCustomerDisplay(addons)
//                        = $2,160 + $0 (no backsplash) + $200 + $0 (no visible cust lines)
//                        = $2,360 — matches the customer PDF.
const qaCountertopExact2 = 2151.18; // exact backend material
const qaAddonsExact2 = 200;         // room add-ons (sink cutout etc.)
const qaCounterDisplay2 = roundCustomerDisplay(qaCountertopExact2); // $2,160
const qaAddonsDisplay2 = roundCustomerDisplay(qaAddonsExact2);       // $200
assertEq("ql-qa counter 2151.18 rounds to 2160", qaCounterDisplay2, 2160);
assertEq("ql-qa addons 200 rounds to 200", qaAddonsDisplay2, 200);
const qaCustomerDisplayTotal2 = qaCounterDisplay2 + qaAddonsDisplay2;
assertEq("ql-qa customer_display_total = 2360", qaCustomerDisplayTotal2, 2360);
// grand_total (exact) is NOT 2360 — confirm the old wrong value would not match PDF.
const qaGrandTotal2 = Math.round(qaCountertopExact2 * 100) / 100; // = 2151.18
assertEq("ql-qa grand_total != customer_display_total", qaGrandTotal2 !== qaCustomerDisplayTotal2, true);

// pickDisplayTotal logic: prefer customer_display_total when present; fall back to grand_total.
function pickDisplayTotal(row) {
  const cdt = Number(row.customer_display_total);
  if (Number.isFinite(cdt) && cdt > 0) return cdt;
  return Number(row.grand_total) || 0;
}
assertEq("ql-pick new quote uses customer_display_total", pickDisplayTotal({ customer_display_total: 2360, grand_total: 2151.18 }), 2360);
assertEq("ql-pick old quote falls back to grand_total", pickDisplayTotal({ customer_display_total: null, grand_total: 2151.18 }), 2151.18);
assertEq("ql-pick missing customer_display_total falls back", pickDisplayTotal({ grand_total: 1500 }), 1500);
assertEq("ql-pick zero customer_display_total falls back", pickDisplayTotal({ customer_display_total: 0, grand_total: 1500 }), 1500);

// ── Upgraded edge pricing ──────────────────────────────────────────────────────

const edgeBase = {
  quoteSource: "internal_quote",
  engine: "rooms",
  internalMaterialBasis: "wholesale",
  materialGroup: "Group Promo",
  rooms: [],
  addOns: {}
};

// Standard edge: no extra charge regardless of LF field
const stdEdge = await calculateQuote(
  {
    ...edgeBase,
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 0,
        edgeProfile: "Eased",
        upgradedEdgeLf: 20
      }
    ]
  },
  {}
);
assertNear("EDGE-1 standard Eased edge: no extra charge", stdEdge.totals.retail, internalMaterialTotal(10, 0, wRate));
if ((stdEdge.warnings || []).some((w) => w.includes("edge"))) {
  throw new Error("EDGE-1: standard edge must not emit edge warnings");
}

// Upgraded edge with LF: charges lf * SPECIALTY_EDGE_RATE_PER_LF
const upgEdge = await calculateQuote(
  {
    ...edgeBase,
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 0,
        edgeProfile: "Ogee",
        upgradedEdgeLf: 12
      }
    ]
  },
  {}
);
const expectedEdgeCharge = Math.round(12 * SPECIALTY_EDGE_RATE_PER_LF * 100) / 100;
assertNear("EDGE-2 Ogee 12 LF: material + edge charge", upgEdge.totals.retail, internalMaterialTotal(10, 0, wRate) + expectedEdgeCharge);
const edgeLine = (upgEdge.lineItems || []).find((l) => l.category === "edge");
if (!edgeLine) throw new Error("EDGE-2: edge line item missing from lineItems");
assertNear("EDGE-2 edge line subtotal", edgeLine.line_subtotal, expectedEdgeCharge);
if (edgeLine.unit_type !== "per_lf") throw new Error("EDGE-2: edge line unit_type must be per_lf");
if ((upgEdge.warnings || []).some((w) => w.includes("edge"))) {
  throw new Error("EDGE-2: upgraded edge with LF must not emit a warning");
}

// Upgraded edge with LF = 0: emits warning, does NOT add cost
const upgEdgeNoLf = await calculateQuote(
  {
    ...edgeBase,
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 0,
        edgeProfile: "Waterfall",
        upgradedEdgeLf: 0
      }
    ]
  },
  {}
);
assertNear("EDGE-3 upgraded edge LF=0: no cost added", upgEdgeNoLf.totals.retail, internalMaterialTotal(10, 0, wRate));
if (!(upgEdgeNoLf.warnings || []).some((w) => w.includes("edge"))) {
  throw new Error("EDGE-3: upgraded edge with LF=0 must emit a warning");
}
const noEdgeLine = (upgEdgeNoLf.lineItems || []).find((l) => l.category === "edge");
if (noEdgeLine) throw new Error("EDGE-3: no edge line item should appear when LF=0");

// Direct mode with upgraded edge: no markup, edge still calculated
const upgEdgeDirect = await calculateQuote(
  {
    ...edgeBase,
    internalMaterialBasis: "direct",
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 0,
        edgeProfile: "Dupont",
        upgradedEdgeLf: 8
      }
    ]
  },
  {}
);
const dRatePromo = ESF_DIRECT_PRICE_PER_SQFT["Group Promo"];
const edgeChargeDirect = Math.round(8 * SPECIALTY_EDGE_RATE_PER_LF * 100) / 100;
assertNear("EDGE-4 direct mode: no markup, edge charge added", upgEdgeDirect.totals.retail, internalMaterialTotal(10, 0, dRatePromo) + edgeChargeDirect);
if (upgEdgeDirect.totals.retail !== upgEdgeDirect.totals.wholesale) {
  throw new Error("EDGE-4: internal_quote direct: retail must equal wholesale");
}

// Snapshot records edge rate and source for historical stability
if (!upgEdge.snapshot?.internal_estimate_math?.upgraded_edge_pricing) {
  throw new Error("EDGE-5: snapshot must include upgraded_edge_pricing in internal_estimate_math");
}
const snap = upgEdge.snapshot.internal_estimate_math.upgraded_edge_pricing;
assertNear("EDGE-5 snapshot rate_per_lf", snap.rate_per_lf, SPECIALTY_EDGE_RATE_PER_LF);
assertNear("EDGE-5 snapshot total", snap.total, expectedEdgeCharge);
if (snap.rate_source !== "fallback") {
  throw new Error(`EDGE-5: rate_source must be "fallback" when no DB rules provided, got "${snap.rate_source}"`);
}

// Multi-room: two rooms with upgraded edge, one standard
const multiEdge = await calculateQuote(
  {
    ...edgeBase,
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 0,
        edgeProfile: "Ogee",
        upgradedEdgeLf: 10
      },
      {
        name: "Bath",
        materialGroup: "Group Promo",
        countertopSqft: 5,
        backsplashSqft: 0,
        edgeProfile: "Eased",
        upgradedEdgeLf: 0
      }
    ]
  },
  {}
);
const multiEdgeCharge = Math.round(10 * SPECIALTY_EDGE_RATE_PER_LF * 100) / 100;
assertNear("EDGE-6 multi-room: only upgraded room adds charge", multiEdge.totals.retail, internalMaterialTotal(15, 0, wRate) + multiEdgeCharge);

// Pricing Admin / quote_pricing_rules overrides the fallback rate
// When a rule with item_code "specialty_edge_per_lf" is present, that rate is used.
const customEdgeRate = 20;
const upgEdgeCustomRate = await calculateQuote(
  {
    ...edgeBase,
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 0,
        edgeProfile: "Ogee",
        upgradedEdgeLf: 5
      }
    ]
  },
  { rules: [{ item_code: "specialty_edge_per_lf", category: "edge", price: customEdgeRate }] }
);
const expectedCustomEdgeCharge = Math.round(5 * customEdgeRate * 100) / 100;
assertNear("EDGE-7 custom rate from rules: 5 LF × $20 = $100", upgEdgeCustomRate.totals.retail, internalMaterialTotal(10, 0, wRate) + expectedCustomEdgeCharge);
const snap7 = upgEdgeCustomRate.snapshot?.internal_estimate_math?.upgraded_edge_pricing;
if (!snap7) throw new Error("EDGE-7: snapshot must include upgraded_edge_pricing");
assertNear("EDGE-7 snapshot rate_per_lf", snap7.rate_per_lf, customEdgeRate);
if (snap7.rate_source !== "pricing_rules") {
  throw new Error(`EDGE-7: rate_source must be "pricing_rules" when rule provided, got "${snap7.rate_source}"`);
}

// ── v2 edge pricing tests ────────────────────────────────────────────────────

// EDGE-V2-1: included v2 profile → $0
const edgeV2Included = await calculateQuote(
  {
    ...edgeBase,
    rooms: [{
      name: "Kitchen",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "included",
      edgeProfileV2: "Large Ogee",
      edgeLinearFeet: 10
    }]
  },
  {}
);
assertNear("EDGE-V2-1 included Large Ogee: no edge charge", edgeV2Included.totals.retail, internalMaterialTotal(10, 0, wRate));

// EDGE-V2-2: upgraded Small Ogee wholesale → LF × $15
const edgeV2SmallOgeeWS = await calculateQuote(
  {
    ...edgeBase,
    rooms: [{
      name: "Kitchen",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "upgraded",
      edgeProfileV2: "Small Ogee",
      edgeLinearFeet: 12
    }]
  },
  {}
);
const expectedV2UpgWS = 12 * 15;
assertNear("EDGE-V2-2 Small Ogee wholesale: 12 LF × $15", edgeV2SmallOgeeWS.totals.retail, internalMaterialTotal(10, 0, wRate) + expectedV2UpgWS);
const edgeLineV2 = (edgeV2SmallOgeeWS.lineItems || []).find((l) => l.category === "edge");
if (!edgeLineV2) throw new Error("EDGE-V2-2: edge line item missing");
assertNear("EDGE-V2-2 edge line subtotal", edgeLineV2.line_subtotal, expectedV2UpgWS);

// EDGE-V2-3: upgraded Crescent direct → LF × $25
const edgeV2CrescentDirect = await calculateQuote(
  {
    ...edgeBase,
    internalMaterialBasis: "direct",
    rooms: [{
      name: "Kitchen",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "upgraded",
      edgeProfileV2: "Crescent",
      edgeLinearFeet: 8
    }]
  },
  {}
);
const expectedV2UpgDirect = 8 * 25;
assertNear("EDGE-V2-3 Crescent direct: 8 LF × $25", edgeV2CrescentDirect.totals.retail, internalMaterialTotal(10, 0, dRatePromo) + expectedV2UpgDirect);

// EDGE-V2-4: mitered 4" → LF × $70
const edgeV2Miter4 = await calculateQuote(
  {
    ...edgeBase,
    rooms: [{
      name: "Island",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "mitered",
      miterHeight: "4in",
      edgeLinearFeet: 10
    }]
  },
  {}
);
assertNear("EDGE-V2-4 mitered 4in 10 LF × $70", edgeV2Miter4.totals.retail, internalMaterialTotal(10, 0, wRate) + 10 * 70);

// EDGE-V2-5: mitered 2-3" → LF × $65
const edgeV2Miter23 = await calculateQuote(
  {
    ...edgeBase,
    rooms: [{
      name: "Island",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "mitered",
      miterHeight: "2-3in",
      edgeLinearFeet: 6
    }]
  },
  {}
);
assertNear("EDGE-V2-5 mitered 2-3in 6 LF × $65", edgeV2Miter23.totals.retail, internalMaterialTotal(10, 0, wRate) + 6 * 65);

// EDGE-V2-6: build-up adds SF × $20
const edgeV2BuildUp = await calculateQuote(
  {
    ...edgeBase,
    rooms: [{
      name: "Island",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "mitered",
      miterHeight: "5in",
      edgeLinearFeet: 5,
      buildUpRequired: true,
      buildUpSqft: 8
    }]
  },
  {}
);
const expectedMiter5 = 5 * 75;
const expectedBuildUp = 8 * 20;
assertNear("EDGE-V2-6 mitered 5in + build-up", edgeV2BuildUp.totals.retail, internalMaterialTotal(10, 0, wRate) + expectedMiter5 + expectedBuildUp);
const buLine = (edgeV2BuildUp.lineItems || []).find((l) => l.item_code === "edge_buildup_per_sqft");
if (!buLine) throw new Error("EDGE-V2-6: build-up line item missing");
assertNear("EDGE-V2-6 build-up subtotal", buLine.line_subtotal, expectedBuildUp);

// EDGE-V2-7: build-up disabled → no build-up charge
const edgeV2NoBuildUp = await calculateQuote(
  {
    ...edgeBase,
    rooms: [{
      name: "Island",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "mitered",
      miterHeight: "5in",
      edgeLinearFeet: 5,
      buildUpRequired: false,
      buildUpSqft: 8
    }]
  },
  {}
);
assertNear("EDGE-V2-7 build-up disabled → no extra charge", edgeV2NoBuildUp.totals.retail, internalMaterialTotal(10, 0, wRate) + expectedMiter5);

// EDGE-V2-8: manual edge price
const edgeV2Manual = await calculateQuote(
  {
    ...edgeBase,
    rooms: [{
      name: "Kitchen",
      materialGroup: "Group Promo",
      countertopSqft: 10,
      backsplashSqft: 0,
      edgeMode: "manual",
      manualEdgeAmount: 250,
      manualEdgeReason: "Special profile from local supplier",
      manualEdgeCustomerLabel: "Custom edge profile"
    }]
  },
  {}
);
assertNear("EDGE-V2-8 manual edge amount included", edgeV2Manual.totals.retail, internalMaterialTotal(10, 0, wRate) + 250);
const manualLine = (edgeV2Manual.lineItems || []).find((l) => l.item_code === "manual_edge_price");
if (!manualLine) throw new Error("EDGE-V2-8: manual edge line item missing");
if (manualLine.internal_reason !== "Special profile from local supplier") {
  throw new Error(`EDGE-V2-8: internal_reason must be stored in line item, got "${manualLine.internal_reason}"`);
}
if (manualLine.item_name.includes("Special profile")) {
  throw new Error("EDGE-V2-8: item_name must use customer-safe label, not internal_reason");
}
const snapV2Manual = edgeV2Manual.snapshot?.internal_estimate_math?.upgraded_edge_pricing;
if (!snapV2Manual) throw new Error("EDGE-V2-8: snapshot must include upgraded_edge_pricing");
if (!snapV2Manual.has_manual) throw new Error("EDGE-V2-8: snapshot must record has_manual=true");

// ── Internal Estimate material use tax (2% counter + backsplash) ─────────────

const taxPolicy = resolveInternalEstimateMaterialTaxPolicy();
assertNear("TAX-POLICY percent", taxPolicy.materialUseTaxPercent, INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT);
if (taxPolicy.materialUseTaxScope !== "countertop_and_backsplash_material") {
  throw new Error("TAX-POLICY scope must be countertop_and_backsplash_material");
}

const taxLegacy = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 10, backsplashSqft: 4 },
    rooms: [],
    addOns: {}
  },
  {}
);
const taxBase = (10 + 4) * wRate;
const expectedTax = round2Tax(round2Tax(10 * wRate * 0.02) + round2Tax(4 * wRate * 0.02));
assertNear("TAX-1 legacy counter+backsplash 2%", taxLegacy.totals.retail, internalMaterialTotal(10, 4, wRate));
const taxSnap = taxLegacy.snapshot?.internal_estimate_math?.material_use_tax;
if (!taxSnap) throw new Error("TAX-1: snapshot must include material_use_tax");
assertNear("TAX-1 snapshot counter tax", taxSnap.countertopMaterialUseTaxAmount, 10 * wRate * 0.02);
assertNear("TAX-1 snapshot backsplash tax", taxSnap.backsplashMaterialUseTaxAmount, 4 * wRate * 0.02);
assertNear("TAX-1 snapshot total tax", taxSnap.totalMaterialUseTaxAmount, expectedTax);

const taxRooms = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: [
      {
        name: "Kitchen",
        materialGroup: "Group Promo",
        countertopSqft: 10,
        backsplashSqft: 4,
        addOns: { "qty-sink": 1 }
      }
    ],
    addOns: { "qty-sink": 1 }
  },
  {}
);
const sinkPrice = 200;
assertNear("TAX-2 rooms engine tax excludes add-ons", taxRooms.totals.retail, internalMaterialTotal(10, 4, wRate) + sinkPrice);

const taxTrip = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 10, backsplashSqft: 0 },
    rooms: [],
    addOns: {},
    customLineItems: [{ name: "Trip charge", category: "Fee", quantity: 1, unitPrice: 150, customerFacing: true }]
  },
  {}
);
assertNear("TAX-3 custom fee not taxed", taxTrip.totals.retail, internalMaterialTotal(10, 0, wRate) + 150);

// Stale out_of_collection payloads normalize to elite_100 — no OOC premium on internal quotes.
const oocRoom = {
  name: "Kitchen",
  materialGroup: "Group Promo",
  materialProgramOverride: "inherit",
  countertopSqft: 10,
  backsplashSqft: 0
};
const oocWholesale = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "rooms",
    internalMaterialBasis: "wholesale",
    materialProgramDefault: "out_of_collection",
    rooms: [oocRoom],
    estimateRoomDrafts: [{ ...oocRoom, id: "k1", materialProgramOverride: "inherit" }],
    addOns: {}
  },
  {}
);
assertNear("stale OOC normalizes to elite 100", oocWholesale.totals.retail, internalMaterialTotal(10, 0, wRate));
const oocSnap = oocWholesale.snapshot?.internal_estimate_math?.out_of_collection;
if (oocSnap?.outOfCollectionPremiumAmount) {
  throw new Error("OOC premium must not apply after internal quote normalization");
}

const eliteUnchanged = await calculateQuote(
  {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    materialProgramDefault: "elite_100",
    areas: { countertopSqft: 10, backsplashSqft: 0 },
    rooms: [],
    addOns: {}
  },
  {}
);
assertNear("Elite 100 unchanged", eliteUnchanged.totals.retail, internalMaterialTotal(10, 0, wRate));

console.log("verifyInternalEstimateMath: ok");
