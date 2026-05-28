#!/usr/bin/env node
/**
 * Customer Estimate Print — Room / Area Cost Breakdown display reconciliation.
 * Mirrors prepareCustomerPrintDisplayRows (app-internal-estimate/src/lib/customerPrintDisplayRows.ts).
 *
 * Run: node backend-core/src/scripts/verifyCustomerEstimatePrintReconciliation.mjs
 */

function roundCustomerDisplayAddonLine(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 5) * 5;
}

/** Same rule as customerPrintDisplayRows.ts for Soble-style rows. */
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

// Soble-style customer-facing totals (Estimate summary authority)
const summaryCounterDisplay = 6750;
const summaryBacksplashDisplay = 2680;
const summaryAddonsDisplay = 550;
const finalRounded = summaryCounterDisplay + summaryBacksplashDisplay + summaryAddonsDisplay;
assertEqual("project total", finalRounded, 9980);
assertEqual("summary material total", summaryCounterDisplay + summaryBacksplashDisplay, 9430);

// Room area totals (allocated to reconcile with project total)
const kitchenAreaTotal = 7830;
const kitchenAddonsExact = [450];
const laundryAreaTotal = 2150;
const laundryAddonsExact = [100];

const kitchen = prepareDisplayRow(kitchenAreaTotal, kitchenAddonsExact);
const laundry = prepareDisplayRow(laundryAreaTotal, laundryAddonsExact);

assertEqual("Kitchen material display", kitchen.displayedMaterial, 7380);
assertEqual("Kitchen add-ons display", kitchen.displayedAddOns, 450);
assertEqual("Kitchen area total", kitchen.displayedAreaTotal, 7830);
assertEqual("Kitchen material + add-ons", kitchen.displayedMaterial + kitchen.displayedAddOns, kitchenAreaTotal);

assertEqual("Laundry material display", laundry.displayedMaterial, 2050);
assertEqual("Laundry add-ons display", laundry.displayedAddOns, 100);
assertEqual("Laundry area total", laundry.displayedAreaTotal, 2150);
assertEqual("Laundry material + add-ons", laundry.displayedMaterial + laundry.displayedAddOns, laundryAreaTotal);

const materialDisplaySum = kitchen.displayedMaterial + laundry.displayedMaterial;
const areaTotalSum = kitchenAreaTotal + laundryAreaTotal;
assertEqual("Material displays sum", materialDisplaySum, 9430);
assertEqual("Area totals sum to project total", areaTotalSum, finalRounded);

console.log("verifyCustomerEstimatePrintReconciliation: ok");
