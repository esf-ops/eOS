/**
 * DE.2B — Confirmed Elite 100 business pricing fixtures.
 *
 * IMPORTANT:
 * - These are labeled fixtures / confirmed business rules for the future pricing-policy model.
 * - They are NOT seeded into production tables in DE.2B.
 * - They do NOT change calculateQuote() constants (Remnant Wholesale remains 50 there).
 * - Confirmed Remnant Wholesale for future policy: 45 (not calculator's 50).
 */

/** @typedef {{ groupCode: string, displayName: string, ratePerSqft: number }} MaterialGroupRateFixture */

/** Confirmed Direct/Retail $/SF (business-approved for future policy). */
export const FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT = Object.freeze({
  promo: 70,
  group_a: 77,
  group_b: 85,
  group_c: 95,
  group_d: 105,
  group_e: 120,
  group_f: 135,
  remnant: 50
});

/**
 * Confirmed Wholesale $/SF (business-approved for future policy).
 * Remnant Wholesale = 45 (corrected vs current calculator PROTOTYPE_TIER Remnant 50).
 */
export const FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT = Object.freeze({
  promo: 45,
  group_a: 57,
  group_b: 65,
  group_c: 75,
  group_d: 85,
  group_e: 100,
  group_f: 115,
  remnant: 45
});

/** Confirmed global material use tax — rate 0.02 on material sell amount. */
export const FIXTURE_GLOBAL_MATERIAL_USE_TAX = Object.freeze({
  taxCode: "material_use_tax",
  rate: 0.02,
  taxableBasis: "material_sell_amount",
  appliesAcrossSchedules: Object.freeze(["wholesale", "direct", "account"]),
  excludesCategories: Object.freeze([
    "products",
    "labor",
    "fabrication_addons",
    "entire_estimate"
  ]),
  customerPresentation: "unresolved",
  note:
    "Confirmed commercial rule. Presentation and order vs Spahn & Rose adjustment are DE.2C decisions."
});

/** Watt's account-group Promo override — $40/SF only for trusted members. */
export const FIXTURE_WATTS_PROMO_OVERRIDE = Object.freeze({
  accountGroupCode: "watts",
  scheduleCode: "direct",
  groupCode: "promo",
  ratePerSqft: 40,
  reasonInternal: "Confirmed Watt's Promo material rate override"
});

/** Spahn & Rose estimate-level +3% on entire estimate (order vs use tax = DE.2C). */
export const FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT = Object.freeze({
  accountGroupCode: "spahn_and_rose",
  adjustmentCode: "spahn_and_rose_entire_estimate_pct",
  rate: 0.03,
  adjustmentType: "percent",
  basisPolicy: "entire_estimate",
  reasonInternal: "Confirmed Spahn & Rose entire-estimate adjustment"
});

export const GROUP_CODE_DISPLAY_NAMES = Object.freeze({
  promo: "Group Promo",
  group_a: "Group A",
  group_b: "Group B",
  group_c: "Group C",
  group_d: "Group D",
  group_e: "Group E",
  group_f: "Group F",
  remnant: "Remnant"
});

/**
 * Build fixture schedule rate rows (not production seeds).
 * @param {'wholesale'|'direct'} scheduleCode
 * @returns {MaterialGroupRateFixture[]}
 */
export function buildFixtureMaterialGroupRates(scheduleCode) {
  const table =
    scheduleCode === "wholesale"
      ? FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
      : FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT;
  return Object.entries(table).map(([groupCode, ratePerSqft], idx) => ({
    groupCode,
    displayName: GROUP_CODE_DISPLAY_NAMES[groupCode] || groupCode,
    ratePerSqft,
    sortOrder: (idx + 1) * 10
  }));
}

/**
 * Documented conflict: calculateQuote Remnant Wholesale is 50; confirmed future policy is 45.
 */
export const CALCULATOR_VS_CONFIRMED_REMNANT_WHOLESALE = Object.freeze({
  calculatorWholesaleRemnant: 50,
  confirmedPolicyWholesaleRemnant: 45,
  calculatorDirectRemnant: 50,
  confirmedPolicyDirectRemnant: 50,
  status: "documented_conflict_for_de2c",
  actionInDe2b: "do_not_change_calculateQuote"
});
