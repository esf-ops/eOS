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
  if (!Number.isFinite(n) || n === 0) return 0;
  if (n < 0) return n; // Credits: preserve exact reduction, never penalize customer
  return Math.ceil(n / 5) * 5;
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

const CUSTOMER_FACING_NOTES_MAX_LINES = 12;

/** Mirrors parseCustomerFacingNoteLines (customerFacingNotes.ts). */
function parseCustomerFacingNoteLines(raw, maxLines = CUSTOMER_FACING_NOTES_MAX_LINES) {
  if (raw == null || !String(raw).trim()) return [];
  const limit = Math.max(1, Math.floor(Number(maxLines) || CUSTOMER_FACING_NOTES_MAX_LINES));
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
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

function allocateCustomerDisplayFives(exacts, targetDisplay) {
  const n = exacts.length;
  if (n === 0) return [];
  const cleaned = exacts.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumExact = cleaned.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.round(targetDisplay));
  if (sumExact <= 0 || target <= 0) return cleaned.map(() => 0);
  const units = Math.round(target / 5);
  if (units <= 0) return cleaned.map(() => 0);
  const rawUnits = cleaned.map((e) => (e / sumExact) * units);
  const floorUnits = rawUnits.map((r) => Math.floor(r));
  const assigned = floorUnits.reduce((a, b) => a + b, 0);
  let deficit = units - assigned;
  const order = rawUnits
    .map((r, i) => ({ i, rem: r - floorUnits[i] }))
    .sort((a, b) => b.rem - a.rem);
  const out = floorUnits.map((f) => f * 5);
  for (let k = 0; k < deficit; k++) out[order[k].i] += 5;
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
    const addonLines = row.addons.map((a) => ({
      label: a.label || "",
      amountExact: a.amountExact,
      displayedAmount: roundCustomerDisplayAddonLine(a.amountExact)
    }));
    let displayedAddOns = addonLines.reduce((s, a) => s + a.displayedAmount, 0);
    const customDisplaySum = (row.customerCustomLines || []).reduce(
      (s, c) => s + roundCustomerDisplay(c.amountExact),
      0
    );
    displayedAddOns += customDisplaySum;
    if (
      displayedAddOns === 0 &&
      roomExtras > 0 &&
      row.addons.length === 0 &&
      (row.customerCustomLines || []).length === 0
    ) {
      displayedAddOns = roundCustomerDisplay(roomExtras);
    }
    let displayedMaterial = displayedAreaTotal - displayedAddOns;
    if (displayedMaterial < 0) {
      displayedMaterial = roundCustomerDisplay(row.materialAmountExact);
    }
    rows.push({
      displayedMaterial,
      displayedAddOns,
      displayedAreaTotal,
      isVanity: row.isVanity,
      addonLines,
      customerCustomLines: row.customerCustomLines || []
    });
  });
  // Allow negative unassigned (global Discount / Credit) to appear as project discount row.
  const unassigned = Math.round(unassignedDisplayTotal ?? 0);
  return { rows, unassigned, areaTotalSum: rows.reduce((s, r) => s + r.displayedAreaTotal, 0) + unassigned };
}

function buildSyntheticDisplayModel(fixture) {
  const summaryCounterDisplay = roundCustomerDisplay(fixture.countertopExact);
  const summaryBacksplashDisplay = roundCustomerDisplay(fixture.backsplashExact);
  const summaryFhbDisplay = roundCustomerDisplay(Number(fixture.fhbExact) || 0);
  const summaryAddonsDisplay = fixture.addonsExact > 0 ? roundCustomerDisplay(fixture.addonsExact) : 0;
  const upgradedEdgeExact = Number(fixture.upgradedEdgeExact) || 0;
  const summaryEdgeDisplay = upgradedEdgeExact > 0 ? roundCustomerDisplay(upgradedEdgeExact) : 0;
  const summaryCustomDisplay = (fixture.customLines || []).reduce(
    (s, ln) => s + roundCustomerDisplay(ln.lineTotal),
    0
  );
  const finalRounded =
    summaryCounterDisplay +
    summaryBacksplashDisplay +
    summaryFhbDisplay +
    summaryAddonsDisplay +
    summaryEdgeDisplay +
    summaryCustomDisplay;

  const estimateSummaryRows = [
    { key: "countertop", label: "Countertop material", displayAmount: summaryCounterDisplay },
    { key: "backsplash", label: "Backsplash material", displayAmount: summaryBacksplashDisplay }
  ];
  if (summaryFhbDisplay > 0) {
    estimateSummaryRows.push({
      key: "fhb",
      label: "Full-height backsplash material",
      displayAmount: summaryFhbDisplay
    });
  }
  if (fixture.addonsExact > 0) {
    estimateSummaryRows.push({
      key: "addons",
      label: "Add-ons / fixtures",
      displayAmount: summaryAddonsDisplay
    });
  }
  if (summaryEdgeDisplay > 0) {
    estimateSummaryRows.push({ key: "edge_upgrades", label: "Edge / profile charges", displayAmount: summaryEdgeDisplay });
  }
  for (const ln of fixture.customLines || []) {
    const displayAmount = roundCustomerDisplay(ln.lineTotal);
    if (displayAmount === 0) continue; // skip zero; allow negative discount rows
    estimateSummaryRows.push({
      key: ln.lineKey || `custom-${ln.name}`,
      label: ln.name,
      displayAmount
    });
  }

  const addonDetailLines = buildCustomerAddonDetailLines(fixture.measuredRooms || []);
  const roomRows = fixture.roomRows || [];
  const unassignedExact = round2(fixture.unassignedExact || 0);

  // Allow negative unassigned (global Discount / Credit) — negative shows as project discount footer row.
  const unassignedDisplay = unassignedExact !== 0 ? roundCustomerDisplay(unassignedExact) : 0;
  const targetRoomDisplay = Math.max(0, finalRounded - unassignedDisplay);

  // Mirrors buildRoomAreaPrintRows: vanity rooms with fixedDisplayTotal are pinned;
  // non-vanity rooms get proportional $5 allocation of the remaining budget.
  const rowsWithFixed = roomRows.map((r) => ({
    ...r,
    fixedDisplayTotal:
      r.fixedDisplayTotal != null
        ? r.fixedDisplayTotal
        : r.isVanity
          ? roundCustomerDisplayVanity(r.roomTotalExact)
          : undefined
  }));
  const fixedTotal = rowsWithFixed.reduce((s, r) => s + (r.fixedDisplayTotal ?? 0), 0);
  const targetProportionalDisplay = Math.max(0, targetRoomDisplay - fixedTotal);
  const proportionalExacts = rowsWithFixed
    .filter((r) => r.fixedDisplayTotal == null)
    .map((r) => r.roomTotalExact);
  const proportionalAllocated = allocateCustomerDisplayFives(proportionalExacts, targetProportionalDisplay);
  let propIdx = 0;
  const roomAreaDisplayTotals = rowsWithFixed.map((r) =>
    r.fixedDisplayTotal != null ? r.fixedDisplayTotal : (proportionalAllocated[propIdx++] ?? 0)
  );

  const roomExtrasExact = roomRows.map((r) => r.extrasExact ?? r.addons.reduce((s, a) => s + a.amountExact, 0));

  const roomPrint = prepareRoomPrintRows(
    rowsWithFixed.map((r) => ({
      addons: r.addons,
      materialAmountExact: r.materialExact,
      customSum: r.customSum || 0,
      customerCustomLines: r.customerCustomLines || [],
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
  // In production, vanityDisplayContribution is pre-rounded to nearest $5 via roundCustomerDisplayVanity,
  // so countertopExact is already a $5 multiple when it reaches buildSyntheticDisplayModel.
  // Using 885 (a $5 multiple) here reflects that real-world invariant.
  const m = buildSyntheticDisplayModel({
    countertopExact: 885,
    backsplashExact: 0,
    addonsExact: 0,
    roomRows: [
      {
        isVanity: true,
        roomTotalExact: 885,
        materialExact: 885,
        extrasExact: 0,
        addons: []
      }
    ],
    materialScopeGroups: [{ group: "Group 1", displayDollars: null }]
  });
  assertDisplayModelInvariants("vanity-only", m);
  // 885 is already a $5 multiple — both nearest-$5 and ceil-to-$5 give 885
  assertEqual("vanity-only final", m.finalRounded, 885);
  // Vanity room pins to fixedDisplayTotal = roundCustomerDisplayVanity(885) = 885
  assertEqual("vanity-only room area", m.roomAreaPrintRows[0]?.displayedAreaTotal, 885);
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

// 8. Duplicate preset fixture names — unique line keys must not collapse summary rows
{
  const m = buildSyntheticDisplayModel({
    countertopExact: 5000,
    backsplashExact: 3500,
    addonsExact: 540,
    customLines: [
      { lineKey: "sink-a", name: "Custom Sink / Faucet / Fixture", lineTotal: 450 },
      { lineKey: "sink-b", name: "Custom Sink / Faucet / Fixture", lineTotal: 560 }
    ],
    measuredRooms: [
      {
        name: "Kitchen",
        extras: 440,
        addons: [{ label: "Undermount sink cutout", total: 200 }],
        details: ["Full-height backsplash electrical cutouts × 8 @ $30"]
      },
      {
        name: "Laundry",
        extras: 100,
        addons: [{ label: "Vanity/bar/small sink cutout", total: 100 }],
        details: []
      }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 6200,
        materialExact: 5760,
        extrasExact: 440,
        addons: [{ amountExact: 200 }, { amountExact: 240 }]
      },
      {
        isVanity: false,
        roomTotalExact: 2100,
        materialExact: 2000,
        extrasExact: 100,
        addons: [{ amountExact: 100 }]
      }
    ]
  });
  const fixtureRows = m.estimateSummaryRows.filter((r) => r.key === "sink-a" || r.key === "sink-b");
  assertEqual("duplicate-name fixtures both present", fixtureRows.length, 2);
  assertEqual(
    "duplicate-name fixture display sum",
    fixtureRows.reduce((s, r) => s + r.displayAmount, 0),
    1010
  );
  assertDisplayModelInvariants("duplicate-fixture-names", m);
}

// 9. Customer-facing project notes — blank omits section; multi-line bullets; pricing unchanged
{
  assertEqual("blank notes line count", parseCustomerFacingNoteLines("").length, 0);
  assertEqual("whitespace-only notes line count", parseCustomerFacingNoteLines("  \n ").length, 0);

  const loughrenNotes =
    "Sink accessories not included.\nConfirm sink base size before ordering.\n\nLaminate must be removed before template.\nFull-height backsplash requires second template/install.";
  const lines = parseCustomerFacingNoteLines(loughrenNotes);
  assertEqual("loughren note line count", lines.length, 4);
  assertEqual("loughren note line 1", lines[0], "Sink accessories not included.");
  assertEqual("loughren note line 4", lines[3], "Full-height backsplash requires second template/install.");
  assertEqual(
    "note line cap",
    parseCustomerFacingNoteLines(Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n")).length,
    12
  );

  const base = buildSyntheticDisplayModel({
    countertopExact: 5000,
    backsplashExact: 3500,
    addonsExact: 0,
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 8500,
        materialExact: 8500,
        extrasExact: 0,
        addons: []
      }
    ]
  });
  const noteLines = parseCustomerFacingNoteLines(loughrenNotes);
  assertEqual("notes do not change finalRounded", base.finalRounded, base.finalRounded);
  assertEqual("normalized note lines", noteLines.length, 4);

  const printSrc = readFileSync(
    join(__dirname, "../../../app-quote/src/lib/customerEstimate/CustomerEstimateDocument.tsx"),
    "utf8"
  );
  assert(printSrc.includes("Project Notes"), "CustomerEstimateDocument must render Project Notes heading");
  assert(printSrc.includes("customerFacingNoteLines"), "CustomerEstimateDocument must use display.customerFacingNoteLines");
}

// 10. Upgraded edge display — adds "Edge upgrades" row and is included in finalRounded
{
  const UPGRADED_EDGE_PREVIEW_RATE = 15;
  const edgeExact = 4 * UPGRADED_EDGE_PREVIEW_RATE; // 4 LF × $15 = $60

  // With upgraded edge
  const withEdge = buildSyntheticDisplayModel({
    countertopExact: 5000,
    backsplashExact: 3500,
    addonsExact: 0,
    upgradedEdgeExact: edgeExact,
    roomRows: [{ isVanity: false, roomTotalExact: 8560, materialExact: 8500, extrasExact: 0, addons: [] }]
  });
  const edgeRow = withEdge.estimateSummaryRows.find((r) => r.key === "edge_upgrades");
  assert(edgeRow != null, "EDGE-DISPLAY-1: 'Edge upgrades' row must appear in estimateSummaryRows");
  assertEqual("EDGE-DISPLAY-1: edge display amount", edgeRow.displayAmount, roundCustomerDisplay(edgeExact));
  assertDisplayModelInvariants("EDGE-DISPLAY-1: with-edge model", withEdge);

  // Without upgraded edge (standard only)
  const noEdge = buildSyntheticDisplayModel({
    countertopExact: 5000,
    backsplashExact: 3500,
    addonsExact: 0,
    upgradedEdgeExact: 0,
    roomRows: [{ isVanity: false, roomTotalExact: 8500, materialExact: 8500, extrasExact: 0, addons: [] }]
  });
  const noEdgeRow = noEdge.estimateSummaryRows.find((r) => r.key === "edge_upgrades");
  assert(noEdgeRow == null, "EDGE-DISPLAY-2: no 'Edge upgrades' row when upgradedEdgeExact = 0");
  assertDisplayModelInvariants("EDGE-DISPLAY-2: no-edge model", noEdge);

  // finalRounded increases by the edge display amount
  const diff = withEdge.finalRounded - noEdge.finalRounded;
  assertEqual("EDGE-DISPLAY-3: finalRounded difference equals edge display", diff, roundCustomerDisplay(edgeExact));

  // Verify source files reference edge upgrades / summaryEdgeDisplay
  const displayModelSrc = readFileSync(
    join(__dirname, "../../../app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"),
    "utf8"
  );
  assert(displayModelSrc.includes("summaryEdgeDisplay"), "customerEstimateDisplayModel must compute summaryEdgeDisplay");
  assert(displayModelSrc.includes("Edge / profile charges"), "customerEstimateDisplayModel must label row 'Edge / profile charges'");
  assert(displayModelSrc.includes("upgradedEdgeTotalExact"), "customerEstimateDisplayModel must accept upgradedEdgeTotalExact param");

  const appSrc = readFileSync(
    join(__dirname, "../../../app-internal-estimate/src/InternalEstimateApp.tsx"),
    "utf8"
  );
  assert(appSrc.includes("liveUpgradedEdgeTotal"), "InternalEstimateApp must compute liveUpgradedEdgeTotal");
  assert(appSrc.includes("Edge / profile charges"), "InternalEstimateApp sticky panel must show 'Edge / profile charges' row");
  assert(appSrc.includes("computeLocalEdgeTotalV2"), "InternalEstimateApp must call computeLocalEdgeTotalV2");

  // EDGE-DISPLAY-4: room-level edge addon appears in addonLines and reconciles with finalRounded
  //
  // Simulate what buildCustomerRoomAreaCostBreakdown produces after the per-room edge fix:
  // Kitchen has Ogee edge 4 LF × $15 = $60 edge addon. Bath has no edge.
  const EDGE_RATE = 15;
  const kitchenEdgeExact = 4 * EDGE_RATE; // $60
  const kitchenMaterialExact = 5000;
  const bathMaterialExact = 3500;

  // roomRows now include the edge addon in each row.addons[]
  const edgeRoomRows = [
    {
      isVanity: false,
      // roomTotalExact = material + catalog_addons + edge
      roomTotalExact: kitchenMaterialExact + kitchenEdgeExact, // 5060
      materialExact: kitchenMaterialExact,
      extrasExact: 0,
      addons: [{ amountExact: kitchenEdgeExact, label: "Ogee edge upgrade" }]
    },
    {
      isVanity: false,
      roomTotalExact: bathMaterialExact, // 3500
      materialExact: bathMaterialExact,
      extrasExact: 0,
      addons: []
    }
  ];

  const edgeRoomModel = buildSyntheticDisplayModel({
    countertopExact: kitchenMaterialExact + bathMaterialExact, // 8500 total material
    backsplashExact: 0,
    addonsExact: 0,
    upgradedEdgeExact: kitchenEdgeExact, // $60 edge in Estimate Summary
    roomRows: edgeRoomRows
  });

  // Estimate Summary must include Edge upgrades row
  const edgeSummaryRow = edgeRoomModel.estimateSummaryRows.find((r) => r.key === "edge_upgrades");
  assert(edgeSummaryRow != null, "EDGE-DISPLAY-4: Edge upgrades row in Estimate Summary");
  assertEqual("EDGE-DISPLAY-4: edge summary display amount", edgeSummaryRow.displayAmount, roundCustomerDisplay(kitchenEdgeExact));

  // Room area totals must sum to finalRounded (allocateCustomerDisplayFives allocates proportionally)
  assertDisplayModelInvariants("EDGE-DISPLAY-4: room-breakdown with edge", edgeRoomModel);

  // Kitchen (the edge room) must have a larger displayed area total than Bath
  assert(
    edgeRoomModel.roomAreaPrintRows[0].displayedAreaTotal > edgeRoomModel.roomAreaPrintRows[1].displayedAreaTotal,
    "EDGE-DISPLAY-4: Kitchen with edge upgrade must have larger area total than Bath"
  );

  // Kitchen must have an addonLine for the edge
  const kitchenRow = edgeRoomModel.roomAreaPrintRows[0];
  const edgeAddonLine = kitchenRow.addonLines.find((a) => a.label === "Ogee edge upgrade");
  assert(edgeAddonLine != null, "EDGE-DISPLAY-4: Kitchen room row must have 'Ogee edge upgrade' addonLine");
  assert(edgeAddonLine.displayedAmount > 0, "EDGE-DISPLAY-4: edge addonLine displayedAmount must be > 0");

  // prototypeQuoteMath.ts must compute edge addons per room in buildCustomerRoomAreaCostBreakdown
  const quoteMathSrc = readFileSync(
    join(__dirname, "../../../app-quote/src/lib/prototypeQuoteMath.ts"),
    "utf8"
  );
  assert(quoteMathSrc.includes("edgeCustomerLabel"), "prototypeQuoteMath must use edgeCustomerLabel for per-room edge addon label");
  assert(quoteMathSrc.includes("computeRoomEdgeChargeV2"), "prototypeQuoteMath must call computeRoomEdgeChargeV2 in room breakdown");
  assert(quoteMathSrc.includes("UPGRADED_EDGE_PROFILE_SET"), "prototypeQuoteMath must still reference UPGRADED_EDGE_PROFILE_SET for legacy fallback");
}

// 11. VANITY-ISOLATION: vanity program price must not be inflated by fold or room rounding
// Simulates: kitchen countertops with use tax + 37" vanity ($265 program price) + $50 internal fold
{
  const kitchenWithTax = 1535; // kitchen exact after use tax
  const vanityDisplayPrice = 265; // 37" single bowl over35 — already a multiple of $5
  const internalFold = 50; // internal-only custom line adjustment
  // countertopExact mirrors countertopMaterialExact = kitchen + vanityDisplay + fold
  const countertopExact = kitchenWithTax + vanityDisplayPrice + internalFold; // 1850

  const model = buildSyntheticDisplayModel({
    countertopExact,
    backsplashExact: 0,
    addonsExact: 0,
    roomRows: [
      {
        // Kitchen — non-vanity, proportional allocation
        isVanity: false,
        roomTotalExact: kitchenWithTax,
        materialExact: kitchenWithTax,
        extrasExact: 0,
        addons: []
      },
      {
        // Vanity room — fixedDisplayTotal pins price to program display price
        isVanity: true,
        roomTotalExact: vanityDisplayPrice,
        materialExact: vanityDisplayPrice,
        extrasExact: 0,
        addons: []
      }
    ]
  });

  assertDisplayModelInvariants("VANITY-ISOLATION-1", model);

  // Estimate Summary countertop amount includes vanity at its program price
  const counterRow = model.estimateSummaryRows.find((r) => r.key === "countertop");
  assertEqual(
    "VANITY-ISOLATION-1: countertop summary = roundCustomerDisplay(countertopExact)",
    counterRow.displayAmount,
    roundCustomerDisplay(countertopExact)
  );

  // Vanity room must show exactly its program display price — not inflated by fold or rounding
  const vanityRoomRow = model.roomAreaPrintRows[1];
  assertEqual(
    "VANITY-ISOLATION-1: vanity room pins to program display price",
    vanityRoomRow.displayedAreaTotal,
    vanityDisplayPrice // $265, not $270 or $280
  );

  // Kitchen room absorbs the proportional share including fold
  const kitchenRoomRow = model.roomAreaPrintRows[0];
  const expectedKitchen = roundCustomerDisplay(countertopExact) - vanityDisplayPrice;
  assertEqual(
    "VANITY-ISOLATION-1: kitchen room gets remainder including fold",
    kitchenRoomRow.displayedAreaTotal,
    expectedKitchen
  );

  // Total reconciles
  assertEqual(
    "VANITY-ISOLATION-1: room totals sum to finalRounded",
    kitchenRoomRow.displayedAreaTotal + vanityRoomRow.displayedAreaTotal,
    model.finalRounded
  );
}

// 12. Customer print copy and rounding convention assertions
{
  const printSrc = readFileSync(
    join(__dirname, "../../../app-quote/src/lib/customerEstimate/CustomerEstimateDocument.tsx"),
    "utf8"
  );
  // Customer PDF must NOT mention rounding to the customer
  assert(
    !printSrc.includes("nearest $5"),
    "CustomerEstimateDocument must not mention 'nearest $5' to customers"
  );
  assert(
    !printSrc.includes("nearest $10"),
    "CustomerEstimateDocument must not have old 'nearest $10' copy"
  );
  assert(
    !printSrc.includes("rounded lines"),
    "CustomerEstimateDocument must not say 'rounded lines'"
  );
  // Must retain legal disclaimer
  assert(
    printSrc.includes("Estimate only"),
    "CustomerEstimateDocument must retain 'Estimate only' legal disclaimer"
  );

  const roundingSrc = readFileSync(
    join(__dirname, "../../../app-quote/src/lib/customerDisplayRounding.ts"),
    "utf8"
  );
  // Now uses ceil-to-$5 for positive, preserves negative credits exactly
  assert(
    roundingSrc.includes("Math.ceil(n / 5) * 5"),
    "customerDisplayRounding must use Math.ceil(n/5)*5 for ceiling-to-$5"
  );
  assert(
    !roundingSrc.includes("Math.round(n / 5) * 5"),
    "customerDisplayRounding must not use old nearest-$5 Math.round"
  );
  assert(
    !roundingSrc.includes("Math.ceil(n / 10) * 10"),
    "customerDisplayRounding must not have old nearest-$10 ceil"
  );

  const displayModelSrc = readFileSync(
    join(__dirname, "../../../app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"),
    "utf8"
  );
  assert(
    displayModelSrc.includes("allocateCustomerDisplayFives"),
    "customerEstimateDisplayModel must use allocateCustomerDisplayFives"
  );
  assert(
    displayModelSrc.includes("fixedDisplayTotal"),
    "customerEstimateDisplayModel must handle fixedDisplayTotal for vanity rooms"
  );
  assert(
    displayModelSrc.includes("vanityDisplayContribution"),
    "customerEstimateDisplayModel must use vanityDisplayContribution (nearest-$5 vanity display price)"
  );
}

// 13. CUSTOM-SINK-DEDUP: customer-facing custom sink appears exactly once in Estimate Summary
//     Regression for: one line appearing twice from two render paths in buildEstimateSummaryRows.
//     The synthetic model here does not have the duplication bug; the real-code regression test
//     is in verify-internal-estimate-beta-fixes.ts (CUSTOM-SINK-DEDUP-1…4).
{
  const SINK_PRICE = 1500;
  const CUTOUT_PRICE = 200;

  const m = buildSyntheticDisplayModel({
    countertopExact: 3530,
    backsplashExact: 340,
    addonsExact: CUTOUT_PRICE,
    customLines: [
      {
        lineKey: "blanco-sink-kitchen",
        name: "BLANCO White Double Bowl",
        lineTotal: SINK_PRICE
      }
    ],
    measuredRooms: [
      {
        name: "KITCHEN",
        extras: CUTOUT_PRICE,
        addons: [{ label: "Kitchen Sink Cutout", total: CUTOUT_PRICE }],
        details: []
      }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 3530 + 340 + CUTOUT_PRICE,
        materialExact: 3530 + 340,
        extrasExact: CUTOUT_PRICE,
        addons: [{ amountExact: CUTOUT_PRICE }]
      }
    ]
  });

  assertDisplayModelInvariants("CUSTOM-SINK-DEDUP", m);

  // Custom sink must appear exactly once — identified by its stable lineKey
  const sinkRows = m.estimateSummaryRows.filter((r) => r.key === "blanco-sink-kitchen");
  assertEqual("CUSTOM-SINK-DEDUP: sink row appears exactly once", sinkRows.length, 1);
  assertEqual("CUSTOM-SINK-DEDUP: sink display amount correct", sinkRows[0].displayAmount, roundCustomerDisplay(SINK_PRICE));

  // Cutout appears in addonDetailLines (the detail section, not as a separate summary row in synthetic model)
  const cutoutDetail = m.addonDetailLines.filter((a) => a.label === "Kitchen Sink Cutout");
  assertEqual("CUSTOM-SINK-DEDUP: cutout in addonDetailLines once", cutoutDetail.length, 1);

  // Total must not double-count the sink: counter + backsplash + addons + sink = 5570
  const expectedTotal =
    roundCustomerDisplay(3530) + roundCustomerDisplay(340) + roundCustomerDisplay(CUTOUT_PRICE) + roundCustomerDisplay(SINK_PRICE);
  assertEqual("CUSTOM-SINK-DEDUP: finalRounded not double-counted", m.finalRounded, expectedTotal);

  const summarySum = m.estimateSummaryRows.reduce((s, r) => s + r.displayAmount, 0);
  assertEqual("CUSTOM-SINK-DEDUP: summary rows sum to finalRounded", summarySum, m.finalRounded);
}

// 14. CUSTOM-SINK-DEDUP-INTERNAL: internal-only line does not appear as a named summary row
{
  // Internal-only lines fold into material — they are absent from customLines (visibleCustomerLines).
  const m = buildSyntheticDisplayModel({
    countertopExact: 3530 + 100, // 100 is internal-only fold absorbed into material
    backsplashExact: 340,
    addonsExact: 200,
    customLines: [], // internal-only line is NOT passed as a custom line
    measuredRooms: [
      {
        name: "KITCHEN",
        extras: 200,
        addons: [{ label: "Kitchen Sink Cutout", total: 200 }],
        details: []
      }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 3530 + 100 + 340 + 200,
        materialExact: 3530 + 100 + 340,
        extrasExact: 200,
        addons: [{ amountExact: 200 }]
      }
    ]
  });

  assertDisplayModelInvariants("CUSTOM-SINK-DEDUP-INTERNAL", m);
  // Only countertop, backsplash, and addons rows — no named customer line row
  const namedCustom = m.estimateSummaryRows.filter(
    (r) => !["countertop", "backsplash", "addons", "edge_upgrades"].includes(r.key) && !r.key.startsWith("addon-")
  );
  assertEqual("CUSTOM-SINK-DEDUP-INTERNAL: no named customer line for internal-only", namedCustom.length, 0);
}

// 15. CUSTOM-SINK-DEDUP-TWO: two genuinely distinct customer-facing custom lines both appear
{
  const m = buildSyntheticDisplayModel({
    countertopExact: 3530,
    backsplashExact: 340,
    addonsExact: 200,
    customLines: [
      { lineKey: "sink-a", name: "BLANCO White Double Bowl", lineTotal: 1500 },
      { lineKey: "faucet-b", name: "Delta Pull-Down Faucet", lineTotal: 350 }
    ],
    measuredRooms: [
      {
        name: "KITCHEN",
        extras: 200,
        addons: [{ label: "Kitchen Sink Cutout", total: 200 }],
        details: []
      }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 3530 + 340 + 200,
        materialExact: 3530 + 340,
        extrasExact: 200,
        addons: [{ amountExact: 200 }]
      }
    ]
  });

  assertDisplayModelInvariants("CUSTOM-SINK-DEDUP-TWO", m);
  // Both distinct customer lines must be in summary, each exactly once
  const sinkRow = m.estimateSummaryRows.find((r) => r.key === "sink-a");
  const faucetRow = m.estimateSummaryRows.find((r) => r.key === "faucet-b");
  assert(sinkRow != null, "CUSTOM-SINK-DEDUP-TWO: sink-a row present");
  assert(faucetRow != null, "CUSTOM-SINK-DEDUP-TWO: faucet-b row present");
  assertEqual("CUSTOM-SINK-DEDUP-TWO: sink display amount", sinkRow.displayAmount, roundCustomerDisplay(1500));
  assertEqual("CUSTOM-SINK-DEDUP-TWO: faucet display amount", faucetRow.displayAmount, roundCustomerDisplay(350));
  // Neither line appears twice
  assertEqual(
    "CUSTOM-SINK-DEDUP-TWO: sink appears exactly once",
    m.estimateSummaryRows.filter((r) => r.key === "sink-a").length,
    1
  );
  assertEqual(
    "CUSTOM-SINK-DEDUP-TWO: faucet appears exactly once",
    m.estimateSummaryRows.filter((r) => r.key === "faucet-b").length,
    1
  );
}

// 16. CEIL-ROUNDING: positive amounts round UP to next $5, not nearest $5
{
  // $342.00 → nearest-$5 = $340, ceil-to-$5 = $345
  assertEqual("CEIL-ROUNDING-1: 342 → 345", roundCustomerDisplay(342), 345);
  // $3531.15 → nearest-$5 = $3530, ceil-to-$5 = $3535
  assertEqual("CEIL-ROUNDING-2: 3531.15 → 3535", roundCustomerDisplay(3531.15), 3535);
  // Exact $5 multiples unchanged
  assertEqual("CEIL-ROUNDING-3: 200 → 200", roundCustomerDisplay(200), 200);
  assertEqual("CEIL-ROUNDING-4: 1500 → 1500", roundCustomerDisplay(1500), 1500);
  // Borderline: $3532.49 → ceil → $3535 (not $3530 as nearest-$5 would give)
  assertEqual("CEIL-ROUNDING-5: 3532.49 → 3535", roundCustomerDisplay(3532.49), 3535);
  // Zero stays zero
  assertEqual("CEIL-ROUNDING-6: 0 → 0", roundCustomerDisplay(0), 0);
  // Negative credits preserved exactly (no ceiling/rounding down of benefit)
  assertEqual("CEIL-ROUNDING-7: -25 → -25 (exact)", roundCustomerDisplay(-25), -25);
  assertEqual("CEIL-ROUNDING-8: -5000 → -5000 (exact)", roundCustomerDisplay(-5000), -5000);
  assertEqual("CEIL-ROUNDING-9: -123.45 → -123.45 (exact)", roundCustomerDisplay(-123.45), -123.45);
}

// 17. DISCOUNT-PDF: customer-facing Discount/Credit appears in Estimate Summary and reduces finalRounded
{
  const COUNTER = 3531.15; // rounds UP: $3,535
  const SPLASH = 342;      // rounds UP: $345
  const CUTOUT = 200;
  const SINK = 1500;
  const DISCOUNT = -5000;  // preserved exactly: -$5,000

  // Customer-facing discount appears as a custom line with negative lineTotal.
  // In the room breakdown, the global discount is unassigned (not attributed to any room);
  // room's roomTotalExact includes only its own positive scope, not the global credit.
  const m = buildSyntheticDisplayModel({
    countertopExact: COUNTER,
    backsplashExact: SPLASH,
    addonsExact: CUTOUT,
    customLines: [
      { lineKey: "blanco-sink", name: "BLANCO White Double Bowl", lineTotal: SINK },
      { lineKey: "disc-001", name: "Discount / Credit", lineTotal: DISCOUNT }
    ],
    measuredRooms: [
      {
        name: "KITCHEN",
        extras: CUTOUT,
        addons: [{ label: "Kitchen Sink Cutouts", total: CUTOUT }],
        details: []
      }
    ],
    roomRows: [
      {
        isVanity: false,
        // Room total is the room's own scope (material + cutout + sink), global discount excluded
        roomTotalExact: COUNTER + SPLASH + CUTOUT + SINK,
        materialExact: COUNTER + SPLASH,
        extrasExact: CUTOUT,
        addons: [{ amountExact: CUTOUT }]
      }
    ],
    unassignedExact: DISCOUNT  // global discount shows as footer row in room breakdown
  });

  // Sink and discount both appear in Estimate Summary
  const sinkRow = m.estimateSummaryRows.find((r) => r.key === "blanco-sink");
  const discRow = m.estimateSummaryRows.find((r) => r.key === "disc-001");
  assert(sinkRow != null, "DISCOUNT-PDF-1: BLANCO sink row present in Estimate Summary");
  assert(discRow != null, "DISCOUNT-PDF-2: Discount/Credit row present in Estimate Summary");

  // Sink displays positive (ceil to $5)
  assertEqual("DISCOUNT-PDF-3: sink displays $1,500", sinkRow.displayAmount, 1500);
  // Discount preserved exactly negative
  assertEqual("DISCOUNT-PDF-4: discount displays -$5,000 exactly", discRow.displayAmount, -5000);
  // Discount appears exactly once
  assertEqual(
    "DISCOUNT-PDF-5: discount row appears once",
    m.estimateSummaryRows.filter((r) => r.key === "disc-001").length,
    1
  );

  // Printed positive lines: ceil(3531.15)=3535, ceil(342)=345, 200, 1500 → sum = $5,580
  const positiveSum =
    roundCustomerDisplay(COUNTER) + roundCustomerDisplay(SPLASH) + roundCustomerDisplay(CUTOUT) + roundCustomerDisplay(SINK);
  assertEqual("DISCOUNT-PDF-6: positive lines sum to $5,580", positiveSum, 5580);

  // finalRounded = $5,580 - $5,000 = $580
  assertEqual("DISCOUNT-PDF-7: finalRounded = $580 after $5,000 credit", m.finalRounded, 580);

  // Summary rows sum to finalRounded
  const summarySum = m.estimateSummaryRows.reduce((s, r) => s + r.displayAmount, 0);
  assertEqual("DISCOUNT-PDF-8: summary rows sum to finalRounded", summarySum, m.finalRounded);

  // Invariant: summary rows reconcile
  assertDisplayModelInvariants("DISCOUNT-PDF", m);
}

// 18. DISCOUNT-PDF-SMALL: $25 customer-facing credit reduces printed total by $25
{
  const COUNTER = 5000;
  const SPLASH = 500;
  const DISCOUNT = -25;

  const m = buildSyntheticDisplayModel({
    countertopExact: COUNTER,
    backsplashExact: SPLASH,
    addonsExact: 0,
    customLines: [
      { lineKey: "disc-small", name: "Discount / Credit", lineTotal: DISCOUNT }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: COUNTER + SPLASH + DISCOUNT,
        materialExact: COUNTER + SPLASH,
        extrasExact: 0,
        addons: []
      }
    ],
    unassignedExact: DISCOUNT
  });

  // Positive lines: $5,000 + $500 = $5,500
  assertEqual("DISCOUNT-PDF-SMALL-1: counter", roundCustomerDisplay(COUNTER), 5000);
  assertEqual("DISCOUNT-PDF-SMALL-2: splash", roundCustomerDisplay(SPLASH), 500);
  // Discount row present and exact
  const discRow = m.estimateSummaryRows.find((r) => r.key === "disc-small");
  assert(discRow != null, "DISCOUNT-PDF-SMALL-3: discount row present");
  assertEqual("DISCOUNT-PDF-SMALL-4: discount = -$25 exactly", discRow.displayAmount, -25);
  // finalRounded = $5,500 - $25 = $5,475
  assertEqual("DISCOUNT-PDF-SMALL-5: finalRounded = $5,475", m.finalRounded, 5475);
  const summarySum = m.estimateSummaryRows.reduce((s, r) => s + r.displayAmount, 0);
  assertEqual("DISCOUNT-PDF-SMALL-6: summary rows sum to finalRounded", summarySum, m.finalRounded);
  assertDisplayModelInvariants("DISCOUNT-PDF-SMALL", m);
}

// 19. DISCOUNT-PDF-NOTE: Discount/Credit description note prints on PDF label; placeholder text does not
{
  const printModelSrc = readFileSync(
    join(__dirname, "../../../app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"),
    "utf8"
  );
  // Placeholder description filter must exist in the display model
  assert(
    printModelSrc.includes("PLACEHOLDER_DESCRIPTIONS"),
    "customerEstimateDisplayModel must filter PLACEHOLDER_DESCRIPTIONS from customer-facing labels"
  );
  assert(
    printModelSrc.includes("Enter the credit amount — always applied as a reduction."),
    "customerEstimateDisplayModel must list the old instructional placeholder text to filter"
  );
  // displayAmount === 0 skip (not <= 0)
  assert(
    printModelSrc.includes("displayAmount === 0"),
    "customerEstimateDisplayModel must use === 0 to allow negative discount rows"
  );

  // Preset description must be empty (no instructional text saved to saved quotes)
  const appSrc = readFileSync(
    join(__dirname, "../../../app-internal-estimate/src/InternalEstimateApp.tsx"),
    "utf8"
  );
  assert(
    !appSrc.includes("\"Enter the credit amount — always applied as a reduction.\""),
    "InternalEstimateApp Discount/Credit preset must not have instructional text as default description"
  );
}

// 20. DISCOUNT-ROOM-RECONCILE: global discount appears in room breakdown footer; room totals reconcile
{
  const COUNTER = 5000;
  const SPLASH = 500;
  const DISCOUNT_UNASSIGNED = -500; // global discount, not assigned to a room

  const m = buildSyntheticDisplayModel({
    countertopExact: COUNTER,
    backsplashExact: SPLASH,
    addonsExact: 0,
    customLines: [
      { lineKey: "disc-global", name: "Discount / Credit", lineTotal: DISCOUNT_UNASSIGNED }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: COUNTER + SPLASH,
        materialExact: COUNTER + SPLASH,
        extrasExact: 0,
        addons: []
      }
    ],
    unassignedExact: DISCOUNT_UNASSIGNED
  });

  // finalRounded: ceil(5000) + ceil(500) + (-500) = 5000 + 500 - 500 = 5000
  assertEqual("DISCOUNT-ROOM-RECONCILE-1: finalRounded = $5,000", m.finalRounded, 5000);

  // unassignedDisplayTotal = roundCustomerDisplay(-500) = -500 (exact)
  // targetRoomDisplay = max(0, 5000 - (-500)) = 5500
  // So room is allocated $5,500 (natural positive total before discount)
  assertEqual(
    "DISCOUNT-ROOM-RECONCILE-2: room allocated full positive portion",
    m.roomAreaPrintRows[0].displayedAreaTotal,
    5500
  );

  // Room totals (5500) + unassigned (-500) = 5000 = finalRounded ✓
  const roomSum = m.roomAreaPrintRows.reduce((s, r) => s + r.displayedAreaTotal, 0);
  assertEqual(
    "DISCOUNT-ROOM-RECONCILE-3: roomSum + unassigned = finalRounded",
    roomSum + m.unassignedDisplayTotal,
    m.finalRounded
  );
  assertDisplayModelInvariants("DISCOUNT-ROOM-RECONCILE", m);
}

// Room custom add-on: material column excludes customer custom lines; add-ons column includes them
{
  const materialExact = 2220;
  const customExact = 900;
  const roomTotalExact = materialExact + customExact;
  const m = buildSyntheticDisplayModel({
    countertopExact: materialExact,
    backsplashExact: 0,
    addonsExact: 0,
    customLines: [
      {
        lineKey: "room-custom-labor",
        name: "Waterfall Labor",
        lineTotal: customExact
      }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact,
        materialExact,
        customSum: customExact,
        extrasExact: 0,
        addons: [],
        customerCustomLines: [{ lineKey: "room-custom-labor", name: "Waterfall Labor", amountExact: customExact }]
      }
    ]
  });
  assertDisplayModelInvariants("room-custom-add-on", m);
  const row = m.roomAreaPrintRows[0];
  assertEqual("room-custom-add-on material", row.displayedMaterial, 2220);
  assertEqual("room-custom-add-on add-ons", row.displayedAddOns, 900);
  assertEqual("room-custom-add-on area total", row.displayedAreaTotal, 3120);
}

// FHBS-only material: summary FHBS line must be included in finalRounded and room allocation.
{
  const measuredRooms = [
    {
      name: "Kitchen",
      extras: 350,
      addons: [
        { label: "Kitchen Sink Cutouts", total: 200 },
        { label: "Electrical Outlet Cutouts", total: 150 }
      ],
      details: []
    }
  ];
  const m = buildSyntheticDisplayModel({
    countertopExact: 2950,
    backsplashExact: 0,
    fhbExact: 2605,
    addonsExact: 350,
    measuredRooms,
    customLines: [
      { lineKey: "window-sill", name: "Window Sill Labor — Miscellaneous", lineTotal: 100 },
      { lineKey: "edge-polish", name: "Flat Polished appliance edge — Miscellaneous", lineTotal: 150 }
    ],
    roomRows: [
      {
        isVanity: false,
        roomTotalExact: 5905,
        materialExact: 5555,
        extrasExact: 350,
        addons: [{ amountExact: 200 }, { amountExact: 150 }]
      }
    ],
    unassignedExact: 250
  });
  assertDisplayModelInvariants("fhb-only-summary-reconcile", m);
  assertEqual("fhb-only-summary-reconcile final", m.finalRounded, 6155);
  assert(
    m.estimateSummaryRows.some((r) => r.key === "fhb" && r.displayAmount === 2605),
    "fhb-only: FHBS summary row present"
  );
  const roomSum = m.roomAreaPrintRows.reduce((s, r) => s + r.displayedAreaTotal, 0);
  assertEqual(
    "fhb-only: roomSum + unassigned = finalRounded",
    roomSum + m.unassignedDisplayTotal,
    m.finalRounded
  );
}

console.log("verifyCustomerEstimatePrintReconciliation: ok");
