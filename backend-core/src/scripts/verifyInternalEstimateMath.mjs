/**
 * Verifies internal_quote totals: wholesale vs direct rate books, custom lines, no client markup leakage.
 * Run: node backend-core/src/scripts/verifyInternalEstimateMath.mjs
 */
import {
  calculateQuote,
  ESF_DIRECT_PRICE_PER_SQFT,
  PROTOTYPE_TIER_PRICE_PER_SQFT
} from "../quotes/quoteCalculator.js";

function assertNear(label, actual, expected, eps = 0.02) {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e) || Math.abs(a - e) > eps) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
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

assertNear("A wholesale 10 sf Promo", wholesalePromo.totals.retail, 10 * wRate);
assertNear("A direct 10 sf Promo", directPromo.totals.retail, 10 * dRate);
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
assertNear("B wholesale 10 sf A + 750", bWholesale.totals.retail, 10 * groupAWholesale + 750);
assertNear("B direct 10 sf A + 750", bDirect.totals.retail, 10 * ESF_DIRECT_PRICE_PER_SQFT["Group A"] + 750);

const c = await calculateQuote(
  {
    ...base,
    materialGroup: "Group Promo",
    internalMaterialBasis: "wholesale",
    areas: { countertopSqft: 6, backsplashSqft: 4 }
  },
  {}
);
assertNear("C counter+backsplash same rate", c.totals.retail, (6 + 4) * wRate);

const evil = await calculateQuote(
  {
    ...base,
    internalMaterialBasis: "wholesale",
    retailMarkupPercent: 99,
    retailMethod: "Markup Percent"
  },
  {}
);
assertNear("Markup fields ignored for internal", evil.totals.retail, 10 * wRate);

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
assertNear("1 mixed pieces one room (Promo + Group F)", mixedPiecesWholesale.totals.retail, 10 * wRate + 10 * wF);

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
assertNear("1b mixed pieces direct book", mixedPiecesDirect.totals.retail, 10 * dRate + 10 * dF);

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
assertNear("2 backsplash piece override Group E", splashOv.totals.retail, 20 * wC + splashSf * wE);

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
assertNear("3 counter + backsplash same Group C", splitSameGroup.totals.retail, (20 + bsSf8) * wC);

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
assertNear("4 trip charge custom line +150", tripCharge.totals.retail, 10 * wRate + 150);

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
assertNear("5 evil markup ignored (rooms engine)", evilRooms.totals.retail, 10 * wRate + 10 * wF);

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
assertNear("6 counter 8.3 sf ceils to 9 sf", ceilCounterManual83.totals.retail, 9 * wRate);

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
assertNear("7 counter 8.9 sf ceils to 9 sf", ceilCounterManual89.totals.retail, 9 * wRate);

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
assertNear("8 backsplash 2.11 sf ceils to 3 sf", ceilSplashManual211.totals.retail, 3 * wRate);

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
assertNear("9 backsplash 2.56 sf ceils to 3 sf", ceilSplashManual256.totals.retail, 3 * wRate);

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
assertNear("11 rooms-engine backsplash 3.33 sf ceils to 4 sf", ceilRoomsSplash.totals.retail, (10 + 4) * wRate);

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
assertNear("12 rooms-engine counter 8.3→9 + backsplash 2.11→3", ceilRoomsBoth.totals.retail, (9 + 3) * wRate);

console.log("verifyInternalEstimateMath: ok");
