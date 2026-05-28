#!/usr/bin/env node
/**
 * Customer Estimate Print — display reconciliation.
 * Mirrors:
 *   - buildCustomerEstimateDisplayModel (customerEstimateDisplayModel.ts)
 *   - prepareCustomerPrintDisplayRows (customerPrintDisplayRows.ts)
 *
 * Run: node backend-core/src/scripts/verifyCustomerEstimatePrintReconciliation.mjs
 */

function roundCustomerDisplay(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

function roundCustomerDisplayAddonLine(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 5) * 5;
}

/** Same rule as customerPrintDisplayRows.ts for room rows. */
function prepareDisplayRow(displayedAreaTotal, addonAmountsExact) {
  const displayedAddOns = addonAmountsExact.reduce((s, a) => s + roundCustomerDisplayAddonLine(a), 0);
  const displayedMaterial = displayedAreaTotal - displayedAddOns;
  return { displayedMaterial, displayedAddOns, displayedAreaTotal };
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// --- Soble current live exact summary (ESF-DYER-000015 after recalculate) ---
const countertopExact = 6744.24;
const backsplashExact = 2679;
const addonsExactLive = 670;

assertEqual("countertop display", roundCustomerDisplay(countertopExact), 6750);
assertEqual("backsplash display", roundCustomerDisplay(backsplashExact), 2680);
assertEqual("add-ons display", roundCustomerDisplay(addonsExactLive), 670);

const finalRoundedLive = 6750 + 2680 + 670;
assertEqual("estimated project total", finalRoundedLive, 10100);
assertEqual("summary material display total", 6750 + 2680, 9430);

// Room rows allocated to $10,100 (kitchen gained $120 vs saved $9,980 snapshot — FHB/other extras)
const kitchenAreaTotalLive = 7950;
const kitchenAddonsExactLive = [450, 120];
const laundryAreaTotalLive = 2150;
const laundryAddonsExactLive = [100];

const kitchenLive = prepareDisplayRow(kitchenAreaTotalLive, kitchenAddonsExactLive);
const laundryLive = prepareDisplayRow(laundryAreaTotalLive, laundryAddonsExactLive);

assertEqual("Kitchen material display (live)", kitchenLive.displayedMaterial, 7380);
assertEqual("Kitchen add-ons display (live)", kitchenLive.displayedAddOns, 570);
assertEqual(
  "Kitchen material + add-ons (live)",
  kitchenLive.displayedMaterial + kitchenLive.displayedAddOns,
  kitchenAreaTotalLive
);

assertEqual("Laundry material display (live)", laundryLive.displayedMaterial, 2050);
assertEqual("Laundry add-ons display (live)", laundryLive.displayedAddOns, 100);
assertEqual(
  "Laundry material + add-ons (live)",
  laundryLive.displayedMaterial + laundryLive.displayedAddOns,
  laundryAreaTotalLive
);

assertEqual(
  "Area totals sum to live project total",
  kitchenAreaTotalLive + laundryAreaTotalLive,
  finalRoundedLive
);
assertEqual(
  "Material displays sum to summary material total",
  kitchenLive.displayedMaterial + laundryLive.displayedMaterial,
  9430
);

// --- Legacy saved snapshot ($9,980) — room row reconciliation still holds ---
const finalRoundedSaved = 6750 + 2680 + 550;
assertEqual("saved snapshot project total", finalRoundedSaved, 9980);

const kitchenSaved = prepareDisplayRow(7830, [450]);
const laundrySaved = prepareDisplayRow(2150, [100]);
assertEqual("Kitchen material + add-ons (saved)", kitchenSaved.displayedMaterial + kitchenSaved.displayedAddOns, 7830);
assertEqual("Laundry material + add-ons (saved)", laundrySaved.displayedMaterial + laundrySaved.displayedAddOns, 2150);
assertEqual("Saved area totals sum", 7830 + 2150, finalRoundedSaved);

console.log("verifyCustomerEstimatePrintReconciliation: ok");
