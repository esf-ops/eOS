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

console.log("verifyInternalEstimateMath: ok");
