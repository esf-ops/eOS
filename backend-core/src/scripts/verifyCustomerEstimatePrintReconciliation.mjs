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

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

const FHB_ELECTRICAL_DETAIL_RE = /full-height backsplash electrical cutouts/i;

function labelFromMeasuredRoomDetail(detail) {
  const trimmed = String(detail).trim();
  const timesIdx = trimmed.indexOf(" × ");
  if (timesIdx > 0) return trimmed.slice(0, timesIdx).trim();
  const atIdx = trimmed.indexOf(" @ ");
  if (atIdx > 0) return trimmed.slice(0, atIdx).trim();
  return trimmed;
}

function amountFromMeasuredRoomDetail(detail) {
  const match = String(detail).match(/×\s*(\d+(?:\.\d+)?)\s*@\s*\$?([\d.]+)/i);
  if (!match) return null;
  return round2(Number(match[1]) * Number(match[2]));
}

/** Mirrors buildCustomerAddonDetailLines (customerEstimateDisplayModel.ts). */
function buildCustomerAddonDetailLines(measuredRooms) {
  const lines = [];
  for (const room of measuredRooms) {
    const roomName = (room.name || "").trim();
    for (const a of room.addons || []) {
      const amountExact = round2(Number(a.total) || 0);
      if (amountExact > 0) lines.push({ label: a.label, roomName, amountExact });
    }
    const catalogSum = round2((room.addons || []).reduce((s, a) => s + (Number(a.total) || 0), 0));
    let otherExtras = round2(Math.max(0, (Number(room.extras) || 0) - catalogSum));
    if (otherExtras <= 0) continue;
    for (const detail of room.details || []) {
      if (otherExtras <= 0) break;
      if (!FHB_ELECTRICAL_DETAIL_RE.test(detail) && !/×\s*\d+.*@\s*\$/.test(detail)) continue;
      const parsed = amountFromMeasuredRoomDetail(detail);
      const amountExact = round2(Math.min(otherExtras, parsed != null && parsed > 0 ? parsed : otherExtras));
      if (amountExact <= 0) continue;
      lines.push({ label: labelFromMeasuredRoomDetail(detail), roomName, amountExact });
      otherExtras = round2(otherExtras - amountExact);
    }
    if (otherExtras > 0) {
      lines.push({ label: "Additional room extras", roomName, amountExact: otherExtras });
    }
  }
  return lines;
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

// Room rows allocated to $10,100 (kitchen includes $120 FHB electrical extras in add-ons column)
const kitchenAreaTotalLive = 7910;
const kitchenAddonsExactLive = [450, 120];
const laundryAreaTotalLive = 2190;
const laundryAddonsExactLive = [100];

const kitchenLive = prepareDisplayRow(kitchenAreaTotalLive, kitchenAddonsExactLive);
const laundryLive = prepareDisplayRow(laundryAreaTotalLive, laundryAddonsExactLive);

assertEqual("Kitchen material display (live)", kitchenLive.displayedMaterial, 7340);
assertEqual("Kitchen add-ons display (live)", kitchenLive.displayedAddOns, 570);
assertEqual(
  "Kitchen material + add-ons (live)",
  kitchenLive.displayedMaterial + kitchenLive.displayedAddOns,
  kitchenAreaTotalLive
);

assertEqual("Laundry material display (live)", laundryLive.displayedMaterial, 2090);
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

// Add-ons / Fixtures detail — catalog lines + FHB electrical ($120) must sum to project add-ons subtotal
const sobleAddonRooms = [
  {
    name: "Kitchen",
    extras: 570,
    addons: [
      { label: "Kitchen Sink Cutouts", total: 200 },
      { label: "Vanity/Bar Sink Cutouts", total: 100 },
      { label: "Cooktop Cutouts", total: 150 }
    ],
    details: ["Full-height backsplash electrical cutouts × 4 @ $30"]
  },
  {
    name: "Laundry",
    extras: 100,
    addons: [{ label: "Vanity/Bar Sink Cutouts", total: 100 }],
    details: []
  }
];
const addonDetailLines = buildCustomerAddonDetailLines(sobleAddonRooms);
const addonDetailSum = round2(addonDetailLines.reduce((s, l) => s + l.amountExact, 0));
const kitchenAddonDetailSum = round2(
  addonDetailLines.filter((l) => l.roomName === "Kitchen").reduce((s, l) => s + l.amountExact, 0)
);
const laundryAddonDetailSum = round2(
  addonDetailLines.filter((l) => l.roomName === "Laundry").reduce((s, l) => s + l.amountExact, 0)
);
assertEqual("addon detail lines sum", addonDetailSum, 670);
assertEqual("kitchen addon detail sum", kitchenAddonDetailSum, 570);
assertEqual("laundry addon detail sum", laundryAddonDetailSum, 100);
assertEqual("project add-ons subtotal display", roundCustomerDisplay(addonsExactLive), 670);
const fhbLine = addonDetailLines.find((l) => FHB_ELECTRICAL_DETAIL_RE.test(l.label));
assertEqual("FHB electrical line amount", fhbLine?.amountExact, 120);
assertEqual("addon detail line count", addonDetailLines.length, 5);

// --- Legacy saved snapshot ($9,980) — room row reconciliation still holds ---
const finalRoundedSaved = 6750 + 2680 + 550;
assertEqual("saved snapshot project total", finalRoundedSaved, 9980);

const kitchenSaved = prepareDisplayRow(7830, [450]);
const laundrySaved = prepareDisplayRow(2150, [100]);
assertEqual("Kitchen material + add-ons (saved)", kitchenSaved.displayedMaterial + kitchenSaved.displayedAddOns, 7830);
assertEqual("Laundry material + add-ons (saved)", laundrySaved.displayedMaterial + laundrySaved.displayedAddOns, 2150);
assertEqual("Saved area totals sum", 7830 + 2150, finalRoundedSaved);

console.log("verifyCustomerEstimatePrintReconciliation: ok");
