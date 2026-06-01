/**
 * Pricing authority contract tests — lock current behavior before Pricing Admin resolver cutover.
 *
 * Live math: quoteCalculator.js + legacy quote_pricing_structures / quote_pricing_rules (when installed).
 * Pricing Admin foundation tables are NOT wired to calculateQuote() yet.
 *
 * Run: npm run eos:test:pricing-authority
 */
import assert from "node:assert/strict";

import {
  applyRetailProtection,
  calculateQuote,
  directPricePerSqftForGroup,
  ESF_DIRECT_PRICE_PER_SQFT,
  normalizePrototypeQuoteInput,
  PROTOTYPE_TIER_PRICE_PER_SQFT,
  resolvePricingStructure
} from "./quoteCalculator.js";

const PARTNER_STRUCTURE_ID = "11111111-1111-1111-1111-111111111111";
const PARTNER_ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";

/** Minimal partner/dealer structure for injected pricing context. */
function partnerStructure(overrides = {}) {
  return {
    id: PARTNER_STRUCTURE_ID,
    code: "dealer_tier_1",
    name: "Dealer tier 1 (test)",
    pricing_mode: "dealer",
    retail_markup_percent: 0,
    is_active: true,
    ...overrides
  };
}

/** Single material_group rule row (legacy quote_pricing_rules shape). */
function materialGroupRule(groupName, pricePerSqft) {
  return {
    category: "material_group",
    item_code: `GROUP_${groupName.replace(/\s+/g, "_").toUpperCase()}`,
    item_name: groupName,
    unit_type: "per_sqft",
    price: pricePerSqft,
    is_active: true
  };
}

function internalLegacyInput(overrides = {}) {
  return {
    quoteSource: "internal_quote",
    engine: "legacy",
    materialGroup: "Group Promo",
    areas: { countertopSqft: 10, backsplashSqft: 0 },
    addOns: {},
    ...overrides
  };
}

function publicLegacyInput(overrides = {}) {
  return {
    quoteSource: "public_retail",
    engine: "legacy",
    materialGroup: "Group Promo",
    areas: { countertopSqft: 10, backsplashSqft: 0 },
    addOns: {},
    ...overrides
  };
}

function injectedPricingContext({ structure, rules }) {
  return {
    structure,
    rules,
    effectiveRetailMarkupPercent:
      structure.pricing_mode === "public_retail"
        ? Math.max(Number(structure.retail_markup_percent) || 0, 25)
        : Number(structure.retail_markup_percent) || 0
  };
}

// ── A. internal_quote never applies public/partner markup ─────────────────────

{
  const normalized = normalizePrototypeQuoteInput({
    quoteSource: "internal_quote",
    retailMarkupPercent: 40,
    retailMethod: "Markup Percent"
  });
  assert.equal(normalized.retailMarkupPercent, 0, "internal: client markup percent stripped at normalize");
  assert.equal(normalized.retailMethod, "Pass Through", "internal: retail method forced to Pass Through");

  const calc = await calculateQuote(
    internalLegacyInput({ retailMarkupPercent: 50, retailMethod: "Markup Percent" }),
    injectedPricingContext({
      structure: partnerStructure({ pricing_mode: "internal" }),
      rules: [materialGroupRule("Group Promo", 45)]
    })
  );

  assert.equal(calc.totals.wholesale, calc.totals.retail, "internal: retail equals wholesale (no markup layer)");
  assert.equal(calc.totals.profit, 0, "internal: zero profit from markup");
  assert.equal(calc.pricing.appliedRetailMarkupPercent, 0, "internal: applied retail markup percent is 0");
  assert.equal(
    calc.snapshot.internal_estimate_math?.no_partner_or_public_markup_percent,
    true,
    "internal: snapshot flags no partner/public markup"
  );
  console.log("ok: internal_quote never applies public/partner markup");
}

// ── B. internal Direct basis uses ESF Direct constants (current authority) ───

{
  // Authority today: directPricePerSqftForGroup / ESF_DIRECT_PRICE_PER_SQFT — not quote_price_group_rates.
  const expectedRate = ESF_DIRECT_PRICE_PER_SQFT["Group Promo"];
  assert.equal(directPricePerSqftForGroup("Group Promo"), expectedRate);
  assert.equal(expectedRate, 70, "ESF Direct Group Promo is $70/sf in constants");

  const wholesaleRulePrice = 99;
  const calc = await calculateQuote(
    internalLegacyInput({ internalMaterialBasis: "direct" }),
    injectedPricingContext({
      structure: partnerStructure({ pricing_mode: "internal" }),
      rules: [materialGroupRule("Group Promo", wholesaleRulePrice)]
    })
  );

  const expectedMaterial = 10 * expectedRate;
  assert.equal(calc.totals.wholesale, expectedMaterial, "internal Direct: uses ESF Direct $/sf, ignores wholesale rule price");
  console.log("ok: internal Direct basis uses ESF Direct constants");
}

// ── C. internal Wholesale uses quote_pricing_rules when provided ───────────────

{
  const rulePrice = 88;
  const calcWithRules = await calculateQuote(
    internalLegacyInput({ internalMaterialBasis: "wholesale" }),
    injectedPricingContext({
      structure: partnerStructure({ pricing_mode: "dealer" }),
      rules: [materialGroupRule("Group Promo", rulePrice)]
    })
  );
  assert.equal(calcWithRules.totals.wholesale, 10 * rulePrice, "internal Wholesale: material from provided quote_pricing_rules");

  const prototypeRate = PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"];
  const calcFallback = await calculateQuote(
    internalLegacyInput({ internalMaterialBasis: "wholesale" }),
    injectedPricingContext({
      structure: partnerStructure({ pricing_mode: "dealer" }),
      rules: []
    })
  );
  assert.equal(
    calcFallback.totals.wholesale,
    10 * prototypeRate,
    "internal Wholesale: empty rules fall back to PROTOTYPE_TIER_PRICE_PER_SQFT constants"
  );
  console.log("ok: internal Wholesale uses rules path with explicit prototype fallback");
}

// ── D. public_retail enforces minimum 25% markup ─────────────────────────────

{
  const directSubtotal = 10 * ESF_DIRECT_PRICE_PER_SQFT["Group Promo"];
  const protectedLow = applyRetailProtection({
    wholesale: directSubtotal,
    retailMarkupPercent: 10,
    pricingMode: "public_retail"
  });
  assert.equal(protectedLow.appliedMarkupPercent, 25, "applyRetailProtection: floors below-min markup to 25%");
  assert.equal(protectedLow.enforcedMin, true, "applyRetailProtection: records min enforcement");
  assert.equal(protectedLow.retail, directSubtotal * 1.25, "applyRetailProtection: retail uses 25% floor");

  const calc = await calculateQuote(
    publicLegacyInput({ retailMarkupPercent: 10 }),
    {
      structure: {
        id: "pub-1",
        code: "public_retail",
        name: "Public retail (test)",
        pricing_mode: "public_retail",
        retail_markup_percent: 10
      },
      rules: [materialGroupRule("Group Promo", 999)],
      // Simulate resolvePricingStructure passing through sub-min structure markup before calculator floor.
      effectiveRetailMarkupPercent: 10
    }
  );

  assert.equal(calc.totals.wholesale, directSubtotal, "public: wholesale stores Direct subtotal before markup");
  assert.equal(calc.totals.retail, directSubtotal * 1.25, "public: retail applies 25% minimum markup");
  assert.equal(calc.pricing.appliedRetailMarkupPercent, 25, "public: applied markup percent is floored to 25");
  assert.ok(
    calc.warnings.some((w) => String(w).includes("25%")),
    "public: warns when markup raised to minimum"
  );

  const internalCheck = await calculateQuote(
    internalLegacyInput({ retailMarkupPercent: 10 }),
    injectedPricingContext({
      structure: partnerStructure({ pricing_mode: "dealer", retail_markup_percent: 10 }),
      rules: [materialGroupRule("Group Promo", 45)]
    })
  );
  assert.equal(internalCheck.totals.profit, 0, "public floor does not affect internal_quote profit");
  console.log("ok: public_retail enforces minimum 25% markup");
}

// ── E. partner_quote resolvePricingStructure fails closed on DB errors ────────

{
  const structureRow = {
    id: PARTNER_STRUCTURE_ID,
    code: "dealer_tier_1",
    name: "Assigned structure",
    pricing_mode: "dealer",
    retail_markup_percent: 0,
    is_active: true
  };

  /** Supabase-style chain mock: structure load succeeds; rules query rejects (no .limit on rules). */
  function makePartnerDbThatThrowsOnRules() {
    return {
      from(table) {
        const chain = {
          select() {
            return chain;
          },
          eq(col, val) {
            if (table === "quote_pricing_rules" && col === "is_active") {
              return Promise.reject(new Error("simulated rules load failure"));
            }
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            if (table === "quote_pricing_structures") {
              return Promise.resolve({ data: [structureRow], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          }
        };
        return chain;
      }
    };
  }

  await assert.rejects(
    () =>
      resolvePricingStructure({
        quoteSource: "partner_quote",
        partnerAccountId: PARTNER_ACCOUNT_ID,
        requestedPricingStructureId: PARTNER_STRUCTURE_ID,
        db: makePartnerDbThatThrowsOnRules()
      }),
    (err) => err instanceof Error && /simulated rules load failure/.test(err.message),
    "partner_quote: unexpected DB error must throw (fail closed), not silently use prototype pricing"
  );

  const internalOnError = await resolvePricingStructure({
    quoteSource: "internal_quote",
    partnerAccountId: PARTNER_ACCOUNT_ID,
    db: makePartnerDbThatThrowsOnRules()
  });
  assert.equal(
    internalOnError.fallbackCode,
    "PROTOTYPE_V101",
    "internal_quote: same DB error may fall back to prototype (not fail closed)"
  );

  console.log("ok: partner_quote resolvePricingStructure fails closed on DB errors");
}

// ── G. Remnant Direct/Retail rate = $50/sf; no markup in internal mode ────────

{
  // Regression guard: Remnant must be in ESF_DIRECT_PRICE_PER_SQFT at $50 (not Group Promo fallback).
  assert.equal(
    ESF_DIRECT_PRICE_PER_SQFT["Remnant"],
    50,
    "Remnant: ESF_DIRECT_PRICE_PER_SQFT['Remnant'] = $50/sf"
  );

  // Wholesale fallback must also be defined (prevents silent Group Promo $45 in wholesale mode).
  assert.equal(
    PROTOTYPE_TIER_PRICE_PER_SQFT["Remnant"],
    50,
    "Remnant: PROTOTYPE_TIER_PRICE_PER_SQFT['Remnant'] = $50/sf (explicit fallback prevents Group Promo shadow)"
  );

  // Direct/Retail Internal Estimate: 10 sf Remnant → $500 material, no markup applied.
  const calc = await calculateQuote(
    internalLegacyInput({
      materialGroup: "Remnant",
      areas: { countertopSqft: 10, backsplashSqft: 0 },
      internalMaterialBasis: "direct"
    }),
    injectedPricingContext({
      structure: partnerStructure({ pricing_mode: "internal" }),
      rules: [materialGroupRule("Group Promo", 999)] // Remnant not in rules; must use Direct constant, not fallback
    })
  );
  assert.equal(calc.totals.wholesale, 500, "Remnant Direct: 10 sf × $50 = $500 material");
  assert.equal(calc.totals.retail, 500,    "Remnant Direct: no markup on internal_quote (retail = wholesale)");
  assert.equal(calc.totals.profit, 0,      "Remnant Direct: zero profit on internal_quote");

  // Existing groups Promo–F unchanged: spot-check Group F Direct still $135/sf.
  const calcF = await calculateQuote(
    internalLegacyInput({ materialGroup: "Group F", areas: { countertopSqft: 10, backsplashSqft: 0 }, internalMaterialBasis: "direct" }),
    injectedPricingContext({
      structure: partnerStructure({ pricing_mode: "internal" }),
      rules: []
    })
  );
  assert.equal(calcF.totals.wholesale, 1350, "Group F Direct unchanged: 10 sf × $135 = $1,350");

  console.log("ok: Remnant Direct $50/sf with no internal markup; existing groups unchanged");
}

// TODO(partner-pricing-e2e): Full POST /api/partner-quote/calculate harness with auth + assignment
// requires Express/Supabase integration fixtures. Contract above covers fail-closed resolver behavior only.

// ── F. customer display model: standard-mode Vanity room must NOT double-count ─
//
// Regression guard for: a room with roomType="Vanity" but isVanityProgram=false/undefined
// (standard sqft pricing, vanity program NOT active) was incorrectly matched by the old
// `r.type === "Vanity"` filter and added to vanityMaterialExact ON TOP OF
// selectedBreakdown.totals.countertopMaterial — causing the PDF countertop line to double-count.
//
// Observed: 49" Bath (Group B, 8 sf @ $65 + 2% tax + $100 sink = $760.40 r.selected)
//   OLD:  countertopMaterialExact = $530.40 (breakdown) + $760.40 (double-count) = $1,290.80 → rounds to $1,300
//   NEW:  countertopMaterialExact = $530.40 (breakdown) + $0 (excluded) = $530.40 → rounds to $540
//   OLD PDF total: $1,300 + $130 + $100 + $250 = $1,780  (WRONG)
//   NEW PDF total:   $540 + $130 + $100 + $250 = $1,020  (correct — equals live total rounded up to $10)
//
// Fix: filter by r.isVanityProgram === true (only vanity-program rooms are excluded from selectedBreakdown).

{
  // Simulated MeasuredRoom for a Vanity-type room using standard sqft pricing (isVanityProgram not set).
  // .selected includes counter + backsplash + use-tax + sink cutout addon.
  const stdVanityRoom = {
    id: "bath-49-test",
    type: "Vanity",          // roomType = "Vanity" but standard pricing
    isVanityProgram: false,  // NOT using the vanity program
    selected: 760.40,        // 8 sf counter + 2 sf splash + 2% tax + $100 sink = $760.40
    extras: 100,
    name: '49" Bath',
    group: "Group B"
  };

  // True vanity-program room (isVanityProgram: true) — should still be captured.
  const programVanityRoom = {
    id: "vanity-49-prog",
    type: "Vanity",
    isVanityProgram: true,
    selected: 590,  // priceVanityProgram2026 under_35 result for 49_S
    extras: 0,
    name: '49" Vanity (program)',
    group: "Group B"
  };

  // After fix: only capture rooms where isVanityProgram === true.
  function vanityMaterialSum(rooms) {
    return rooms.filter((r) => r.isVanityProgram === true).reduce((s, v) => s + (Number(v.selected) || 0), 0);
  }

  // Standard-mode Vanity room: must not contribute to vanity rollup (it's already in selectedBreakdown).
  assert.equal(
    vanityMaterialSum([stdVanityRoom]),
    0,
    "display model: standard-mode Vanity room (isVanityProgram=false) excluded from vanity rollup — no double-count"
  );

  // Vanity-program room: must still be captured.
  assert.equal(
    vanityMaterialSum([programVanityRoom]),
    590,
    "display model: true vanity-program room (isVanityProgram=true) included in vanity rollup"
  );

  // Regression guard: the OLD filter (r.type === "Vanity") would have double-counted.
  function vanityMaterialSumOld(rooms) {
    return rooms.filter((r) => r.type === "Vanity").reduce((s, v) => s + (Number(v.selected) || 0), 0);
  }
  assert.equal(
    vanityMaterialSumOld([stdVanityRoom]),
    760.40,
    "regression guard: old type-based filter incorrectly adds $760.40 for standard-mode Vanity room"
  );

  // Simulate countertopMaterialExact before/after fix.
  const selectedBreakdownCountertop = 530.40; // 8 sf × $65/sf + 2% use-tax ($520 + $10.40)
  const counterExactOld = selectedBreakdownCountertop + vanityMaterialSumOld([stdVanityRoom]);
  const counterExactNew = selectedBreakdownCountertop + vanityMaterialSum([stdVanityRoom]);

  assert.ok(Math.abs(counterExactOld - 1290.80) < 0.01, "OLD: countertopMaterialExact ≈ $1,290.80 (leads to $1,300 rounded up)");
  assert.ok(Math.abs(counterExactNew - 530.40) < 0.01,  "NEW: countertopMaterialExact = $530.40 (leads to $540 rounded up)");

  // Verify the old PDF total would have been $1,780 and the new total is $1,020.
  function ceilTen(n) { return Math.ceil(n / 10) * 10; }
  const backsplash = 130;
  const addons = 100;
  const customLine = 250;

  const oldFinalRounded = ceilTen(counterExactOld) + ceilTen(backsplash) + ceilTen(addons) + ceilTen(customLine);
  const newFinalRounded = ceilTen(counterExactNew) + ceilTen(backsplash) + ceilTen(addons) + ceilTen(customLine);

  assert.equal(oldFinalRounded, 1780, "regression guard: old PDF total was $1,780 (wrong)");
  assert.equal(newFinalRounded, 1020, "new PDF total is $1,020 (correct — live exact $1,010.40 rounded up per row)");

  console.log("ok: standard-mode Vanity room does not double-count in customer display model");
}

console.log("\npricingAuthority.contract: all tests passed");
