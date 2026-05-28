#!/usr/bin/env node
/**
 * Customer Estimate Print — generic display-model reconciliation.
 * Mirrors:
 *   - buildCustomerEstimateDisplayModel (customerEstimateDisplayModel.ts)
 *   - prepareCustomerPrintDisplayRows (customerPrintDisplayRows.ts)
 *
 * Run: node backend-core/src/scripts/verifyCustomerEstimatePrintReconciliation.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "verifyCustomerEstimatePrintReconciliation.mjs");
const FORBIDDEN_IN_VERIFY = [
  /\bsoble\b/i,
  /\besf-dyer\b/i,
  /\bcustomer_display_total\s*=\s*9980\b/,
  /\b6744\.24\b/
];

function roundCustomerDisplay(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

function roundCustomerDisplayVanity(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / 5) * 5;
}

function roundCustomerDisplayAddonLine(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 5) * 5;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertNoCustomerSpecificHardcoding() {
  const src = readFileSync(SCRIPT_PATH, "utf8");
  for (const pattern of FORBIDDEN_IN_VERIFY) {
    assert(!pattern.test(src), `Verification script must not contain customer-specific fixture: ${pattern}`);
  }
}

function allocateCustomerDisplayTens(exacts, targetDisplay) {
  const n = exacts.length;
  if (n === 0) return [];
  const cleaned = exacts.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumExact = cleaned.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.round(targetDisplay));
  if (sumExact <= 0 || target <= 0) return cleaned.map(() => 0);
  const units = Math.round(target / 10);
  if (units <= 0) return cleaned.map(() => 0);
  const rawUnits = cleaned.map((e) => (e / sumExact) * units);
  const floorUnits = rawUnits.map((r) => Math.floor(r));
  const assigned = floorUnits.reduce((a, b) => a + b, 0);
  let deficit = units - assigned;
  const order = rawUnits
    .map((r, i) => ({ i, rem: r - floorUnits[i] }))
    .sort((a, b) => b.rem - a.rem);
  const out = floorUnits.map((f) => f * 10);
  for (let k = 0; k < deficit; k++) out[order[k].i] += 10;
  return out;
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

function buildCustomerAddonDetailLines(measuredRooms) {
  const lines = [];
  for (const room of measuredRooms) {
    const roomName = (room.name || "").trim();
    for (const a of room.addons || []) {
      const amountExact = round2(Number(a.total) || 0);
      if (amountExact > 0) lines.push({ label: a.label, roomName, amountExact, displayAmount: amountExact });
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
      lines.push({
        label: labelFromMeasuredRoomDetail(detail),
        roomName,
        amountExact,
        displayAmount: amountExact
      });
      otherExtras = round2(otherExtras - amountExact);
    }
    if (otherExtras > 0) {
      lines.push({
        label: "Additional room extras",
        roomName,
        amountExact: otherExtras,
        displayAmount: otherExtras
      });
    }
  }
  return lines;
}

function prepareDisplayRow(displayedAreaTotal, addonAmountsExact) {
  const displayedAddOns = addonAmountsExact.reduce((s, a) => s + roundCustomerDisplayAddonLine(a), 0);
  const displayedMaterial = displayedAreaTotal - displayedAddOns;
  return { displayedMaterial, displayedAddOns, displayedAreaTotal };
}

/** Mirrors prepareCustomerPrintDisplayRows core reconciliation per room. */
function prepareRoomPrintRows(roomRows, roomAreaDisplayTotals, roomExtrasExact, unassignedDisplayTotal) {
  const rows = [];
  roomRows.forEach((row, idx) => {
    const displayedAreaTotal = Math.max(0, Math.round(roomAreaDisplayTotals[idx] ?? 0));
    const catalogAddonSum = row.addons.reduce((s, a) => s + a.amountExact, 0);
    const roomExtras = round2(roomExtrasExact[idx] != null ? Number(roomExtrasExact[idx]) : catalogAddonSum);
    const otherExtras = round2(Math.max(0, roomExtras - catalogAddonSum));
    const addonLines = row.addons.map((a) => ({
      amountExact: a.amountExact,
      displayedAmount: roundCustomerDisplayAddonLine(a.amountExact)
    }));
    if (otherExtras > 0) {
      addonLines.push({
        amountExact: otherExtras,
        displayedAmount: roundCustomerDisplayAddonLine(otherExtras)
      });
    }
    let displayedAddOns = addonLines.reduce((s, a) => s + a.displayedAmount, 0);
    if (displayedAddOns === 0 && roomExtras > 0) {
      displayedAddOns = roundCustomerDisplay(roomExtras);
    }
    let displayedMaterial = displayedAreaTotal - displayedAddOns;
    if (displayedMaterial < 0) {
      displayedMaterial = roundCustomerDisplay(row.materialAmountExact + row.customSum);
    }
    rows.push({ displayedMaterial, displayedAddOns, displayedAreaTotal, isVanity: row.isVanity });
  });
  const unassigned = Math.max(0, Math.round(unassignedDisplayTotal ?? 0));
  return { rows, unassigned, areaTotalSum: rows.reduce((s, r) => s + r.displayedAreaTotal, 0) + unassigned };
}

function buildSyntheticDisplayModel(fixture) {
  const summaryCounterDisplay = roundCustomerDisplay(fixture.countertopExact);
  const summaryBacksplashDisplay = roundCustomerDisplay(fixture.backsplashExact);
  const summaryAddonsDisplay = fixture.addonsExact > 0 ? roundCustomerDisplay(fixture.addonsExact) : 0;
  const summaryCustomDisplay = (fixture.customLines || []).reduce(
    (s, ln) => s + roundCustomerDisplay(ln.lineTotal),
    0
  );
  const finalRounded =
    summaryCounterDisplay + summaryBacksplashDisplay + summaryAddonsDisplay + summaryCustomDisplay;

  const estimateSummaryRows = [
    { key: "countertop", label: "Countertop material", displayAmount: summaryCounterDisplay },
    { key: "backsplash", label: "Backsplash material", displayAmount: summaryBacksplashDisplay }
  ];
  if (fixture.addonsExact > 0) {
    estimateSummaryRows.push({
      key: "addons",
      label: "Add-ons / fixtures",
      displayAmount: summaryAddonsDisplay
    });
  }
  for (const ln of fixture.customLines || []) {
    estimateSummaryRows.push({
      key: `custom-${ln.name}`,
      label: ln.name,
      displayAmount: roundCustomerDisplay(ln.lineTotal)
    });
  }

  const addonDetailLines = buildCustomerAddonDetailLines(fixture.measuredRooms || []);
  const roomRows = fixture.roomRows || [];
  const unassignedExact = round2(fixture.unassignedExact || 0);

  const unassignedDisplay = unassignedExact > 0 ? roundCustomerDisplay(unassignedExact) : 0;
  const targetRoomDisplay = Math.max(0, finalRounded - unassignedDisplay);
  const roomAreaDisplayTotals = allocateCustomerDisplayTens(
    roomRows.map((r) => r.roomTotalExact),
    targetRoomDisplay
  );
  const roomExtrasExact = roomRows.map((r) => r.extrasExact ?? r.addons.reduce((s, a) => s + a.amountExact, 0));

  const roomPrint = prepareRoomPrintRows(
    roomRows.map((r) => ({
      addons: r.addons,
      materialAmountExact: r.materialExact,
      customSum: r.customSum || 0,
      isVanity: r.isVanity
    })),
    roomAreaDisplayTotals,
    roomExtrasExact,
    unassignedDisplay
  );

  return {
    finalRounded,
    estimateSummaryRows,
    summaryAddonsDisplay,
    addonDetailLines,
    roomAreaPrintRows: roomPrint.rows,
    unassignedDisplayTotal: roomPrint.unassigned,
    materialScopeGroups: fixture.materialScopeGroups || [],
    hasAddons: fixture.addonsExact > 0
  };
}

function assertDisplayModelInvariants(caseName, model) {
  const summarySum = model.estimateSummaryRows.reduce((s, r) => s + r.displayAmount, 0);
  assertEqual(`${caseName}: summary rows sum`, summarySum, model.finalRounded);

  const roomAreaSum =
    model.roomAreaPrintRows.reduce((s, r) => s + r.displayedAreaTotal, 0) + model.unassignedDisplayTotal;
  if (model.roomAreaPrintRows.length > 0) {
    assertEqual(`${caseName}: room area totals sum`, roomAreaSum, model.finalRounded);
  }

  for (let i = 0; i < model.roomAreaPrintRows.length; i++) {
    const row = model.roomAreaPrintRows[i];
    assertEqual(
      `${caseName}: room ${i} material + add-ons`,
      row.displayedMaterial + row.displayedAddOns,
      row.displayedAreaTotal
    );
    assert(
      row.displayedMaterial <= row.displayedAreaTotal,
      `${caseName}: room ${i} material must not exceed area total without credit line`
    );
  }

  if (model.hasAddons) {
    const detailExactSum = round2(model.addonDetailLines.reduce((s, l) => s + l.amountExact, 0));
    if (model.addonDetailLines.length > 0) {
      assertEqual(`${caseName}: addon subtotal display`, model.summaryAddonsDisplay, roundCustomerDisplay(detailExactSum));
    }
  }

  for (const g of model.materialScopeGroups) {
    assert(g.displayDollars == null, `${caseName}: material scope must not expose display dollars`);
  }
}

function pickDisplayTotal(row) {
  const cdt = Number(row.customer_display_total);
  if (Number.isFinite(cdt) && cdt > 0) return cdt;
  return Number(row.grand_total) || 0;
}

assertNoCustomerSpecificHardcoding();

// 1. Standard countertop-only
{
  const m = buildSyntheticDisplayModel({
    countertopExact: 4200,
    backsplashExact: 0,
    addonsExact: 0,
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 4200,
        materialExact: 4200,
        extrasExact: 0,
        addons: []
      }
    ]
  });
  assertDisplayModelInvariants("countertop-only", m);
  assertEqual("countertop-only final", m.finalRounded, 4200);
}

// 2. Countertop + backsplash
{
  const m = buildSyntheticDisplayModel({
    countertopExact: 5000,
    backsplashExact: 800,
    addonsExact: 0,
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 5800,
        materialExact: 5800,
        extrasExact: 0,
        addons: []
      }
    ]
  });
  assertDisplayModelInvariants("countertop-backsplash", m);
  assertEqual("countertop-backsplash final", m.finalRounded, 5800);
}

// 3. Full-height backsplash with customer-facing extras
{
  const measuredRooms = [
    {
      name: "Primary area",
      extras: 570,
      addons: [
        { label: "Sink cutout", total: 200 },
        { label: "Cooktop cutout", total: 150 }
      ],
      details: ["Full-height backsplash electrical cutouts × 4 @ $30"]
    }
  ];
  const m = buildSyntheticDisplayModel({
    countertopExact: 6000,
    backsplashExact: 2500,
    addonsExact: 570,
    measuredRooms,
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 9100,
        materialExact: 8530,
        extrasExact: 570,
        addons: [{ amountExact: 350 }, { amountExact: 120 }]
      }
    ]
  });
  assertDisplayModelInvariants("fhb-extras", m);
  assert(m.addonDetailLines.some((l) => FHB_ELECTRICAL_DETAIL_RE.test(l.label)), "fhb-extras: FHB line present");
}

// 4. Add-ons / extras-heavy
{
  const m = buildSyntheticDisplayModel({
    countertopExact: 3000,
    backsplashExact: 500,
    addonsExact: 880,
    measuredRooms: [
      {
        name: "Area A",
        extras: 480,
        addons: [
          { label: "Cutout A", total: 200 },
          { label: "Cutout B", total: 160 }
        ],
        details: []
      },
      {
        name: "Area B",
        extras: 400,
        addons: [{ label: "Cutout C", total: 400 }],
        details: []
      }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 2500,
        materialExact: 2020,
        extrasExact: 480,
        addons: [{ amountExact: 360 }, { amountExact: 120 }]
      },
      {
        isVanity: false,
        roomTotalExact: 1880,
        materialExact: 1480,
        extrasExact: 400,
        addons: [{ amountExact: 400 }]
      }
    ]
  });
  assertDisplayModelInvariants("addons-heavy", m);
}

// 5. Vanity / program-only
{
  const m = buildSyntheticDisplayModel({
    countertopExact: 887,
    backsplashExact: 0,
    addonsExact: 0,
    roomRows: [
      {
        isVanity: true,
        roomTotalExact: 887,
        materialExact: 887,
        extrasExact: 0,
        addons: []
      }
    ],
    materialScopeGroups: [{ group: "Group 1", displayDollars: null }]
  });
  assertDisplayModelInvariants("vanity-only", m);
  assertEqual("vanity-only final", m.finalRounded, 890);
  assertEqual("vanity-only room area", m.roomAreaPrintRows[0]?.displayedAreaTotal, 890);
}

// 6. Mixed countertop + vanity / program
{
  const m = buildSyntheticDisplayModel({
    countertopExact: 5200,
    backsplashExact: 900,
    addonsExact: 250,
    measuredRooms: [
      {
        name: "Main area",
        extras: 250,
        addons: [{ label: "Fixture cutout", total: 250 }],
        details: []
      }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 5500,
        materialExact: 5250,
        extrasExact: 250,
        addons: [{ amountExact: 250 }]
      },
      {
        isVanity: true,
        roomTotalExact: 895,
        materialExact: 895,
        extrasExact: 0,
        addons: []
      }
    ]
  });
  assertDisplayModelInvariants("mixed-vanity", m);
}

// 7. Legacy display total fallback (no customer_display_total)
assertEqual(
  "legacy pickDisplayTotal uses grand_total",
  pickDisplayTotal({ customer_display_total: null, grand_total: 2151.18 }),
  2151.18
);
assertEqual(
  "modern pickDisplayTotal prefers CDT",
  pickDisplayTotal({ customer_display_total: 2360, grand_total: 2151.18 }),
  2360
);

// Generic extras-heavy reconciliation (two areas, non-catalog extra)
{
  const kitchenAddons = [450, 120];
  const kitchen = prepareDisplayRow(7910, kitchenAddons);
  assertEqual("generic two-area kitchen material", kitchen.displayedMaterial, 7340);
  assertEqual("generic two-area kitchen add-ons", kitchen.displayedAddOns, 570);
  const laundry = prepareDisplayRow(2190, [100]);
  assertEqual("generic two-area area sum", kitchen.displayedAreaTotal + laundry.displayedAreaTotal, 10100);
}

console.log("verifyCustomerEstimatePrintReconciliation: ok");
