/**
 * Estimate Builder — contracts, pricing adapter parity with production engines, Quote Library serializer, save.
 * Run: node --test backend-core/src/estimateBuilder/estimateBuilder.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateQuote } from "../quotes/quoteCalculator.js";
import { calculateCustomQuote } from "../quotes/customQuoteCalculator.js";
import { computeInternalEstimateMaterialUseTaxAmounts } from "../quotes/internalEstimateMaterialTaxPolicy.js";
import { printSnapshotSummaryRowsReconcile } from "../quoteDelivery/customerEstimatePrintSnapshot.js";
import { buildEstimateBuilderCatalog } from "./estimateBuilderCatalog.mjs";
import { cloneEstimateDocument, normalizeEstimateDocument } from "./estimateBuilderContracts.mjs";
import { ceilToFive, priceEstimateDocument } from "./estimateBuilderPricing.mjs";
import { buildEstimateProposalPdfFilename, buildEstimateProposalSnapshot, renderEstimateProposalHtml } from "./estimateBuilderProposal.mjs";
import { ESTIMATE_BUILDER_QUOTE_SOURCE, buildQuoteLibraryArtifacts } from "./estimateBuilderQuoteLibrary.mjs";
import { buildEstimatePriceResponse } from "./estimateBuilderRoutes.js";
import { estimateDocumentFromQuoteRow, processEstimateBuilderSave } from "./estimateBuilderSave.mjs";

const COLORS = [
  { id: "c-promo", colorName: "Carrara Royale", priceGroupLabel: "Group Promo" },
  { id: "c-b", colorName: "Calacatta Laza", priceGroupLabel: "Group B" },
  { id: "c-f", colorName: "Statuario Maximus", priceGroupLabel: "Group F" }
];

const round2 = (n) => Math.round(n * 100) / 100;

/** Per-line use tax rounds to the cent per line; production rounds per category — allow cent drift. */
function near(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= 0.05, `${msg ?? "amount"}: ${actual} vs ${expected}`);
}

/** Owner rule: every positive line is a $5 multiple and the estimate total is the sum of line amounts. */
function assertLineRule(r) {
  for (const it of r.items.filter((i) => i.status === "priced")) {
    if (it.amount > 0) assert.equal(it.amount % 5, 0, `${it.itemId} rounds to $5`);
  }
  assert.ok(r.totals.total >= r.totals.exactTotal, "rounding only ever goes up");
  assert.ok(r.totals.roundingAdjustment < 5 * r.totals.pricedCount, "at most one $5 step per line");
  assert.equal(r.totals.total, round2(r.items.reduce((s, i) => s + (i.status === "priced" ? i.amount : 0), 0)));
}

function doc(items, extra = {}) {
  return normalizeEstimateDocument({
    pricingChannel: "direct",
    header: { customerName: "Northbridge Homes", projectName: "Maple Court Kitchen", preparedBy: "Chris Henely" },
    rooms: [
      { id: "kitchen", name: "Kitchen" },
      { id: "bath", name: "Primary Bath" },
      { id: "laundry", name: "Laundry" }
    ],
    items,
    ...extra
  });
}

async function price(d) {
  return priceEstimateDocument(d, { materialColors: COLORS });
}

const OOC_INPUTS = {
  sqft: 20,
  materialName: "Taj Mahal",
  supplier: "Cosmos",
  materialType: "quartzite",
  slabWidthIn: 126,
  slabHeightIn: 63,
  slabQuantity: 1,
  materialCostInputType: "per_slab",
  costPerSlab: 1850,
  freight: 475
};

/** Phase 1 acceptance estimate. */
const ACCEPTANCE_ITEMS = [
  { id: "ct", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 48, materialColorId: "c-b" } },
  { id: "bs", roomId: "kitchen", itemType: "backsplash", inputs: { sqft: 12 } },
  { id: "sink", roomId: "kitchen", itemType: "cutout", inputs: { cutoutCode: "qty-sink", qty: 1 } },
  { id: "van", roomId: "bath", itemType: "vanity", inputs: { sizeCode: "61_D", qty: 1, sideSplashQty: 1, materialColorId: "c-b" } },
  { id: "oval", roomId: "bath", itemType: "cutout", inputs: { cutoutCode: "qty-v-oval", qty: 2 } },
  { id: "trip", roomId: null, itemType: "service", inputs: { serviceCode: "additional_trip", qty: 1 } }
];

// ─── Contracts ────────────────────────────────────────────────────────────────

test("normalize drops unknown item types, orphan room ids, and client prices", () => {
  const d = doc([
    { id: "a", roomId: "kitchen", itemType: "countertop", inputs: { sqft: "48", materialColorId: "c-b" }, amount: 1, rate: 1 },
    { id: "b", roomId: "ghost-room", itemType: "outlet", inputs: { qty: 2 } },
    { id: "c", itemType: "laser_beam" },
    { itemType: "custom", inputs: {} }
  ]);
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].inputs.sqft, 48);
  assert.equal("amount" in d.items[0], false);
  assert.equal(d.items[1].roomId, null);
  assert.equal(d.items[0].pricingStrategy, "elite_100");
});

test("clone produces new ids, remaps rooms, and strips provenance references", () => {
  const d = doc([
    { id: "a", roomId: "kitchen", itemType: "outlet", inputs: { qty: 1 }, source: { kind: "ai_takeoff", provenance: "imported_unmodified", reference: "takeoff-123" } }
  ]);
  let n = 0;
  const copy = cloneEstimateDocument(d, () => `new-${++n}`);
  assert.notEqual(copy.items[0].id, "a");
  assert.ok(copy.rooms.some((r) => r.id === copy.items[0].roomId));
  assert.equal(copy.items[0].source.provenance, "duplicated");
  assert.equal(copy.items[0].source.reference, null);
  assert.equal(d.items[0].source.reference, "takeoff-123", "original untouched");
});

// ─── Pricing parity with production engines ──────────────────────────────────

for (const channel of ["direct", "wholesale"]) {
  test(`Elite 100 countertop + backsplash match calculateQuote internal_quote (${channel})`, async () => {
    const d = doc(
      [
        { id: "ct", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 47.3, materialColorId: "c-b" } },
        { id: "bs", roomId: "kitchen", itemType: "backsplash", inputs: { sqft: 11.6 } }
      ],
      { pricingChannel: channel }
    );
    const r = await price(d);
    const engine = await calculateQuote({
      quoteSource: "internal_quote",
      internalMaterialBasis: channel,
      engine: "rooms",
      rooms: [{ name: "Kitchen", materialGroup: "Group B", countertopSqft: 47.3, backsplashSqft: 11.6 }]
    });
    assert.equal(r.items[0].quantity, 48, "countertop rounds up to whole sf");
    assert.equal(r.items[1].quantity, 12);
    assert.equal(r.totals.exactTotal, engine.totals.wholesale);
    assert.equal(r.totals.useTax.amount, engine.detail.useTaxAmount);
    assertLineRule(r);
  });
}

test("Elite 100 price group is resolved server-side from the catalog, not the client", async () => {
  const r = await price(
    doc([{ id: "x", itemType: "countertop", inputs: { sqft: 30, materialColorName: "Made Up Color", priceGroup: "Group Promo" } }])
  );
  assert.equal(r.items[0].status, "incomplete");
  assert.equal(r.items[0].warnings[0].code, "missing_material");
  assert.equal(r.totals.total, 0);
});

test("full-height backsplash prices as backsplash material (taxed), distinct item type", async () => {
  const r = await price(
    doc([
      { id: "ct", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 40, materialColorId: "c-f" } },
      { id: "fhb", roomId: "kitchen", itemType: "backsplash", pricingStrategy: "full_height", inputs: { sqft: 24 } }
    ])
  );
  const fhb = r.items[1];
  assert.equal(fhb.customerCategory, "Full height backsplash");
  assert.equal(fhb.taxBase.backsplash, fhb.exactAmount);
  assert.match(fhb.description, /^Full height backsplash — Statuario Maximus/);
});

test("Vanity Program matches production engine (tier auto-derived, side splash, sink upgrade, trips)", async () => {
  const items = [
    { id: "ct", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 40, materialColorId: "c-b" } },
    {
      id: "van",
      roomId: "bath",
      itemType: "vanity",
      inputs: { sizeCode: "73_D", qty: 1, sinkType: "rectangular_white", sideSplashQty: 2, extraTrips: 1, materialColorId: "c-b" }
    }
  ];
  const r = await price(doc(items));
  const van = r.items[1];
  assert.ok(van.details.some((d) => d.value.startsWith("Kitchen ≥ 35 sf")), "40 sf kitchen → over-35 tier");
  const engine = await calculateQuote({
    quoteSource: "internal_quote",
    internalMaterialBasis: "direct",
    engine: "legacy",
    vanities: [
      {
        code: "73_D",
        qty: 1,
        programYear: 2026,
        tier: "kitchen_over_35",
        sinkType: "rectangular_white",
        extraTrips: 1,
        materialGroup: "Group B",
        vanity: { sideSplashQty: 2, depth: 22.5 }
      }
    ]
  });
  assert.equal(van.exactAmount, engine.totals.wholesale, "side splash use tax is inside the vanity line, as in production");
  assert.equal(van.useTaxAmount, 0);
  assert.equal(van.amount, Math.ceil(van.exactAmount / 5) * 5);
  assert.equal(van.taxBase.backsplash, 0, "side splash is not taxed a second time at estimate level");

  const small = await price(doc([{ ...items[0], inputs: { sqft: 20, materialColorId: "c-b" } }, items[1]]));
  assert.ok(small.items[1].details.some((d) => d.value.startsWith("Kitchen < 35 sf")));
  assert.ok(small.items[1].amount > van.amount, "under-35 tier is priced higher");
});

test("Out-of-Collection countertop uses the Custom Quote calculator with channel → pricing mode", async () => {
  for (const [channel, mode] of [["direct", "retail"], ["wholesale", "wholesale"]]) {
    const r = await price(
      doc([{ id: "o", roomId: "laundry", itemType: "countertop", pricingStrategy: "out_of_collection", inputs: OOC_INPUTS }], { pricingChannel: channel })
    );
    const engine = await calculateCustomQuote({
      materialType: "quartzite",
      colorName: "Taj Mahal",
      slabWidth: 126,
      slabHeight: 63,
      slabQuantity: 1,
      materialCostInputType: "per_slab",
      costPerSlab: 1850,
      freightCostToEsf: 475,
      projectSqft: 20,
      pricingMode: mode
    });
    assert.equal(r.items[0].exactAmount, engine.sellPrice);
    assert.equal(r.items[0].taxBase.countertop, 0, "Custom Quote policy: no material use tax");
  }
});

test("Out-of-Collection validation surfaces as an item warning, not a thrown error", async () => {
  const r = await price(
    doc([{ id: "o", itemType: "countertop", pricingStrategy: "out_of_collection", inputs: { ...OOC_INPUTS, costPerSlab: null } }])
  );
  assert.equal(r.items[0].status, "incomplete");
  assert.equal(r.items[0].warnings[0].code, "custom_quote_validation");
});

test("add-ons, outlet, tear-out, trip, edge, and custom lines price through production paths with no use tax", async () => {
  const r = await price(
    doc([
      { id: "o", roomId: "kitchen", itemType: "outlet", inputs: { qty: 3 } },
      { id: "c", roomId: "kitchen", itemType: "cutout", inputs: { cutoutCode: "qty-cook", qty: 1 } },
      { id: "t", itemType: "service", inputs: { serviceCode: "tear_out", qty: 1 } },
      { id: "e", roomId: "kitchen", itemType: "edge", inputs: { edgeMode: "upgraded", profile: "Knife", linearFeet: 12 } },
      { id: "x", itemType: "custom", inputs: { description: "Haul away", qty: 1, unitPrice: 125 } },
      { id: "cr", itemType: "custom", inputs: { description: "Goodwill credit", qty: 1, unitPrice: 50, category: "credit" } }
    ])
  );
  const engine = await calculateQuote({
    quoteSource: "internal_quote",
    internalMaterialBasis: "direct",
    engine: "rooms",
    rooms: [{ name: "Kitchen", countertopSqft: 0, edgeMode: "upgraded", edgeProfileV2: "Knife", edgeLinearFeet: 12 }],
    addOns: { "qty-outlet": 3, "qty-cook": 1, tearout: 1 },
    customLineItems: [
      { name: "Haul away", category: "Other", quantity: 1, unitPrice: 125 },
      { name: "Goodwill credit", category: "Discount/Credit", quantity: 1, unitPrice: -50 }
    ]
  });
  assert.ok(r.items.every((i) => i.status === "priced"));
  assert.equal(r.items.find((i) => i.itemId === "cr").amount, -50);
  assert.equal(r.totals.useTax.amount, 0);
  assert.equal(r.totals.exactTotal, engine.totals.wholesale);
  assert.equal(r.items.find((i) => i.itemId === "x").amount, 125);
  assertLineRule(r);
});

test("vanity bowl cutout in a Vanity Program room carries a contextual warning", async () => {
  const r = await price(doc(ACCEPTANCE_ITEMS));
  const oval = r.items.find((i) => i.itemId === "oval");
  assert.ok(oval.warnings.some((w) => w.code === "vanity_program_includes_bowls"));
  assert.equal(oval.status, "priced");
});

test("acceptance estimate total equals one production calculateQuote over the equivalent room payload", async () => {
  const r = await price(doc(ACCEPTANCE_ITEMS));
  assert.ok(r.items.every((i) => i.status === "priced"));
  const engine = await calculateQuote({
    quoteSource: "internal_quote",
    internalMaterialBasis: "direct",
    engine: "rooms",
    rooms: [{ name: "Kitchen", roomType: "Kitchen", materialGroup: "Group B", countertopSqft: 48, backsplashSqft: 12 }],
    addOns: { "qty-sink": 1, "qty-v-oval": 2 },
    vanities: [
      { code: "61_D", qty: 1, programYear: 2026, extraTrips: 1, materialGroup: "Group B", vanity: { sideSplashQty: 1, depth: 22.5 } }
    ]
  });
  near(r.totals.exactTotal, engine.totals.wholesale, "acceptance exact total");
  assertLineRule(r);
  const expectTax = computeInternalEstimateMaterialUseTaxAmounts(r.totals.useTax.countertopBase, r.totals.useTax.backsplashBase);
  near(r.totals.useTax.amount, expectTax.totalMaterialUseTaxAmount, "use tax");
});

test("mixed estimate: Elite 100 + Out-of-Collection + Vanity Program in one document", async () => {
  const r = await price(
    doc([
      { id: "k", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 48, materialColorId: "c-promo" } },
      { id: "l", roomId: "laundry", itemType: "countertop", pricingStrategy: "out_of_collection", inputs: OOC_INPUTS },
      { id: "v", roomId: "bath", itemType: "vanity", inputs: { sizeCode: "49_S", qty: 1 } }
    ])
  );
  assert.deepEqual(
    r.items.map((i) => [i.pricingStrategy, i.status]),
    [["elite_100", "priced"], ["out_of_collection", "priced"], ["vanity_program_2026", "priced"]]
  );
  assert.equal(r.totals.qualifyingKitchenCounterSf, 68);
  assert.equal(r.readiness.ready, true);
});

test("several countertop/backsplash items in one room round up once per room, like production", async () => {
  const r = await price(
    doc([
      { id: "p", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 20.4, materialColorId: "c-b" } },
      { id: "i", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 20.3, materialColorId: "c-b" } },
      { id: "s", roomId: "kitchen", itemType: "backsplash", inputs: { sqft: 6.2 } },
      { id: "f", roomId: "kitchen", itemType: "backsplash", pricingStrategy: "full_height", inputs: { sqft: 10.3 } },
      { id: "l", roomId: "laundry", itemType: "countertop", inputs: { sqft: 12.5, materialColorId: "c-f" } },
      { id: "pl", itemType: "countertop", inputs: { sqft: 7.2, materialColorId: "c-promo" } }
    ])
  );
  assert.ok(r.items.every((i) => i.status === "priced"));
  const engine = await calculateQuote({
    quoteSource: "internal_quote",
    internalMaterialBasis: "direct",
    engine: "rooms",
    rooms: [
      { name: "Kitchen", roomType: "Kitchen", materialGroup: "Group B", countertopSqft: 40.7, backsplashSqft: 16.5 },
      { name: "Laundry", roomType: "Laundry", materialGroup: "Group F", countertopSqft: 12.5 },
      { name: "Project", roomType: "Kitchen", materialGroup: "Group Promo", countertopSqft: 7.2 }
    ]
  });
  near(r.totals.exactTotal, engine.totals.wholesale, "grouped exact total");
  assertLineRule(r);
  const kitchenTops = r.items.filter((i) => ["p", "i"].includes(i.itemId));
  assert.equal(round2(kitchenTops.reduce((s, i) => s + i.quantity, 0)), 41, "40.7 sf → 41 chargeable, not 21 + 21");
  const splash = r.items.filter((i) => ["s", "f"].includes(i.itemId));
  assert.equal(round2(splash.reduce((s, i) => s + i.quantity, 0)), 17, "standard + FHB 16.5 sf → 17 chargeable per room");
  for (const it of r.items) assert.equal(round2(it.quantity * it.rate), it.exactAmount);
  const kitchenSplash = round2(splash.reduce((s, i) => s + i.amount, 0));
  const kitchenSplashExact = round2(splash.reduce((s, i) => s + i.exactAmount + i.useTaxAmount, 0));
  assert.equal(kitchenSplash, Math.ceil(kitchenSplashExact / 5) * 5, "a room group rounds up once, then splits in $5 units");
});

test("qualifying kitchen sf excludes countertops in Vanity Program rooms (production rule)", async () => {
  const r = await price(
    doc([
      { id: "k", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 30, materialColorId: "c-b" } },
      { id: "bt", roomId: "bath", itemType: "countertop", inputs: { sqft: 10, materialColorId: "c-b" } },
      { id: "v", roomId: "bath", itemType: "vanity", inputs: { sizeCode: "49_S", qty: 1 } }
    ])
  );
  assert.equal(r.totals.qualifyingKitchenCounterSf, 30);
  assert.ok(r.items[2].details.some((d) => d.value.startsWith("Kitchen < 35 sf")), "30 sf kitchen stays in the under-35 tier");
});

test("mixed estimate total equals production calculateQuote (Elite + vanity) plus calculateCustomQuote (OOC)", async () => {
  const r = await price(
    doc([
      { id: "k", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 48, materialColorId: "c-promo" } },
      { id: "bs", roomId: "kitchen", itemType: "backsplash", inputs: { sqft: 9.5 } },
      { id: "o", roomId: "laundry", itemType: "countertop", pricingStrategy: "out_of_collection", inputs: OOC_INPUTS },
      { id: "v", roomId: "bath", itemType: "vanity", inputs: { sizeCode: "61_D", qty: 1, sideSplashQty: 2, materialColorId: "c-b" } },
      { id: "t", itemType: "service", inputs: { serviceCode: "tear_out", qty: 1 } },
      { id: "x", itemType: "custom", inputs: { description: "Haul away", qty: 1, unitPrice: 125 } }
    ])
  );
  assert.ok(r.items.every((i) => i.status === "priced"));
  const elite = await calculateQuote({
    quoteSource: "internal_quote",
    internalMaterialBasis: "direct",
    engine: "rooms",
    rooms: [{ name: "Kitchen", roomType: "Kitchen", materialGroup: "Group Promo", countertopSqft: 48, backsplashSqft: 9.5 }],
    addOns: { tearout: 1 },
    customLineItems: [{ name: "Haul away", category: "Other", quantity: 1, unitPrice: 125 }],
    qualifyingKitchenCounterSf: 68,
    vanities: [{ code: "61_D", qty: 1, programYear: 2026, materialGroup: "Group B", vanity: { sideSplashQty: 2, depth: 22.5 } }]
  });
  const ooc = await calculateCustomQuote({
    materialType: "quartzite",
    colorName: "Taj Mahal",
    slabWidth: 126,
    slabHeight: 63,
    slabQuantity: 1,
    materialCostInputType: "per_slab",
    costPerSlab: 1850,
    freightCostToEsf: 475,
    projectSqft: 20,
    pricingMode: "retail"
  });
  near(r.totals.exactTotal, round2(elite.totals.wholesale + ooc.sellPrice), "mixed exact total");
  assertLineRule(r);
});

test("incomplete items are excluded from totals and block finalize readiness", async () => {
  const r = await price(doc([{ id: "a", itemType: "countertop", inputs: { materialColorId: "c-b" } }]));
  assert.equal(r.items[0].status, "incomplete");
  assert.equal(r.items[0].warnings[0].code, "missing_sqft");
  assert.equal(r.totals.total, 0);
  assert.equal(r.readiness.ready, false);
});

// ─── Quote Library compatibility ─────────────────────────────────────────────

test("owner example: wholesale Promo 60 sf = (60 × $45) × 1.02 rounded up to $5", async () => {
  const r = await price(
    doc([{ id: "p", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 60, materialColorId: "c-promo" } }], { pricingChannel: "wholesale" })
  );
  const line = r.items[0];
  assert.equal(line.rate, 45);
  assert.equal(line.exactAmount, 2700);
  assert.equal(line.useTaxAmount, 54);
  assert.equal(line.amount, 2755, "2,754.00 → 2,755");
  assert.equal(line.roundingAdjustment, 1);
  assert.equal(r.totals.total, 2755);
  assert.equal(r.totals.exactTotal, 2754);
  assert.equal(r.totals.roundingAdjustment, 1);
});

test("ceilToFive is cent-safe and leaves credits exact", () => {
  assert.equal(ceilToFive(2754), 2755);
  assert.equal(ceilToFive(2755), 2755);
  assert.equal(ceilToFive(2755.01), 2760);
  assert.equal(ceilToFive(0.1 + 0.2), 5);
  assert.equal(ceilToFive(-50), -50);
  assert.equal(ceilToFive(0), 0);
});

test("note items are description-only: no amount, no readiness blocker, not counted as items", async () => {
  const r = await price(
    doc([
      { id: "p", roomId: "kitchen", itemType: "countertop", inputs: { sqft: 30, materialColorId: "c-promo" } },
      { id: "n", roomId: "kitchen", itemType: "note", inputs: { text: "Eased Edges / NO Backsplash" } }
    ])
  );
  const note = r.items.find((i) => i.itemId === "n");
  assert.equal(note.status, "note");
  assert.equal(note.amount, 0);
  assert.equal(note.description, "Eased Edges / NO Backsplash");
  assert.equal(r.totals.itemCount, 1);
  assert.equal(r.totals.noteCount, 1);
  assert.equal(r.readiness.ready, true);
  const notesOnly = await price(doc([{ id: "n", itemType: "note", inputs: { text: "Just a note" } }]));
  assert.equal(notesOnly.readiness.ready, false, "a quote needs at least one priced item");
});

test("proposal: QuickBooks layout lines, notes in order, internal-only folded, lines sum to total", async () => {
  const d = doc(
    [
      { id: "p", roomId: "kitchen", itemType: "countertop", label: "3 cm PROMO Granite/Quartz for KITCHEN", inputs: { sqft: 60, materialColorId: "c-promo" } },
      { id: "n1", roomId: "kitchen", itemType: "note", inputs: { text: "Eased Edges / NO Backsplash" } },
      { id: "s", roomId: "kitchen", itemType: "cutout", label: "Undermount Sink Cut Out (Std)", inputs: { cutoutCode: "qty-sink", qty: 1 } },
      { id: "int", roomId: "kitchen", itemType: "custom", inputs: { description: "Internal adj", qty: 1, unitPrice: 40, customerFacing: false } },
      { id: "n2", roomId: "kitchen", itemType: "note", inputs: { text: "COLOR OPTIONS : Prices Include Everything Listed Above\n3 cm MQ Lux Aurum : $4,610 TOTAL" } }
    ],
    {
      pricingChannel: "wholesale",
      header: { customerName: "Jon <Sample>", billToAddress: "1 Main St\nLisbon, IA 52253", county: "Linn", salesRep: "CH", customerMessage: "Thank you for your business!" }
    }
  );
  const r = await price(d);
  const p = buildEstimateProposalSnapshot(d, r, { quoteNumber: "ESF-LIS-000042-R2", estimateDate: "2026-10-06" });
  assert.deepEqual(
    p.lines.map((l) => [l.kind, l.item ?? "", l.description, l.amount ?? null]),
    [
      ["item", "Promo", "3 cm PROMO Granite/Quartz for KITCHEN", 2795],
      ["note", "", "Eased Edges / NO Backsplash", null],
      ["item", "Cutout", "Undermount Sink Cut Out (Std)", 200],
      ["note", "", "COLOR OPTIONS : Prices Include Everything Listed Above", null],
      ["note", "", "3 cm MQ Lux Aurum : $4,610 TOTAL", null]
    ],
    "single room → no room heading; internal-only $40 folds into the first item"
  );
  assert.equal(p.total, r.totals.total);
  assert.deepEqual(p.header.billToLines, ["Jon <Sample>", "1 Main St", "Lisbon, IA 52253"]);
  const html = renderEstimateProposalHtml(p);
  assert.ok(html.includes("Jon &lt;Sample&gt;"), "customer text is escaped");
  assert.ok(!html.includes("Internal adj"));
  assert.ok(html.includes("ESF-LIS-000042-R2"));
  assert.ok(html.includes("$2,995.00"));
  assert.ok(html.includes("Eased Edges / NO Backsplash"));
  assert.equal(buildEstimateProposalPdfFilename(p.header), "Elite Stone Fabrication Proposal - ESF-LIS-000042-R2.pdf");

  const multi = buildEstimateProposalSnapshot(doc(ACCEPTANCE_ITEMS), await price(doc(ACCEPTANCE_ITEMS)), {});
  assert.deepEqual(multi.lines.filter((l) => l.kind === "room").map((l) => l.description), ["Kitchen", "Primary Bath", "Additional items"]);
  assert.equal(multi.header.quoteNumber, "");
  assert.ok(renderEstimateProposalHtml(multi).includes("DRAFT"));
});

test("serializer emits tax-inclusive $5 line items, room rollups, proposal, and a reconciled v1 print snapshot", async () => {
  const d = doc([
    ...ACCEPTANCE_ITEMS,
    { id: "int", roomId: "kitchen", itemType: "custom", inputs: { description: "Internal adj", qty: 1, unitPrice: 40, customerFacing: false } },
    { id: "note", roomId: "kitchen", itemType: "note", inputs: { text: "Eased edges" } }
  ]);
  const r = await price(d);
  const a = buildQuoteLibraryArtifacts(d, r, { quoteNumber: "ESF-DYER-000123" });
  assert.equal(a.calc.lineItems.length, 7, "notes are not Quote Library line items; no separate use tax line");
  assert.ok(a.calc.lineItems.every((l) => l.line_type === "estimate_item"));
  assert.equal(round2(a.calc.lineItems.reduce((s, l) => s + l.line_subtotal, 0)), r.totals.total);
  assert.equal(a.snapshotToStore.internal_ui.estimate_builder_proposal.total, r.totals.total);
  assert.equal(a.proposal.header.quoteNumber, "ESF-DYER-000123");
  assert.equal(a.calc.totals.retail, r.totals.total);
  assert.deepEqual(
    a.saveBody.rooms.map((x) => [x.name, x.countertopSqft, x.backsplashSqft]),
    [["Kitchen", 48, 12], ["Primary Bath", 0, 0]]
  );
  assert.equal(a.snapshotToStore.quote_source, ESTIMATE_BUILDER_QUOTE_SOURCE);
  assert.equal(a.snapshotToStore.estimate_builder.document.items.length, 8);
  const ps = a.printSnapshot;
  assert.equal(ps.header.quoteNumber, "ESF-DYER-000123");
  assert.ok(printSnapshotSummaryRowsReconcile(ps));
  assert.equal(a.snapshotToStore.internal_ui.customer_display_total, ps.finalRounded);
  assert.equal(ps.finalRounded, r.totals.total, "lines are already $5 amounts, so the customer total equals the estimate total");
  assert.ok(!JSON.stringify(ps.display).includes("Internal adj"), "internal-only line hidden from customer");
  assert.equal(ps.display.preparedByDisplayName, "Chris Henely");
  assert.ok(ps.display.roomAreaPrintRows.find((x) => x.displayName === "Primary Bath").isVanity);
  const areaSum = ps.display.roomAreaPrintRows.reduce((s, x) => s + x.displayedAreaTotal, 0) + ps.display.unassignedDisplayTotal;
  assert.equal(areaSum, ps.finalRounded, "room area totals reconcile with the estimated project total");
  for (const row of ps.display.roomAreaPrintRows) {
    assert.equal(row.displayedMaterial + row.displayedAddOns, row.displayedAreaTotal);
    assert.equal(row.displayedAreaTotal % 5, 0);
  }
});

test("catalog payload exposes option labels only — no rates or amounts reach the browser", () => {
  const cat = buildEstimateBuilderCatalog(
    COLORS.map((c) => ({ ...c, ratePerSqft: 99, priceGroupCode: "x" })),
    []
  );
  const json = JSON.stringify(cat);
  assert.doesNotMatch(json, /"(rate|ratePerSqft|price|unitPrice|amount|total|exactTotal|priceCents)"\s*:/i);
  assert.ok(cat.vanity.sizes.length >= 10);
  assert.ok(cat.cutouts.every((c) => c.label && c.code));
  assert.deepEqual(Object.keys(cat.materialColors[0]).sort(), ["colorName", "id", "materialType", "priceGroupLabel", "supplier"]);
});

test("/price response adds the customer preview snapshot and production PDF filename convention", async () => {
  const d = doc(ACCEPTANCE_ITEMS);
  const draft = await buildEstimatePriceResponse({ document: d }, COLORS);
  assert.equal(draft.customerPreview.header.quoteNumber, "DRAFT");
  assert.equal(draft.pdfFilename, "Elite Stone Fabrication Estimate.pdf");
  assert.equal(draft.customerPreview.finalRounded, draft.totals.total);
  const saved = await buildEstimatePriceResponse({ document: d, quoteNumber: "ESF-DYER-000042" }, COLORS);
  assert.equal(saved.pdfFilename, "Elite Stone Fabrication Estimate - ESF-DYER-000042.pdf");
  assert.equal(saved.totals.total, draft.totals.total);
});

test("estimateDocumentFromQuoteRow round-trips the stored document", async () => {
  const d = doc(ACCEPTANCE_ITEMS);
  const a = buildQuoteLibraryArtifacts(d, await price(d));
  const back = estimateDocumentFromQuoteRow({ calculation_snapshot: a.snapshotToStore });
  assert.deepEqual(back.items.map((i) => i.id), d.items.map((i) => i.id));
});

// ─── Save service (fake Supabase) ────────────────────────────────────────────

function fakeDb(rows = {}) {
  const calls = [];
  const db = {
    calls,
    rpc: async () => ({ data: 42, error: null }),
    from(table) {
      const state = { table, op: "select", filters: [], payload: null };
      const builder = {
        select(cols) {
          if (state.op === "select") state.cols = cols;
          return builder;
        },
        insert(payload) {
          state.op = "insert";
          state.payload = payload;
          return builder;
        },
        update(payload) {
          state.op = "update";
          state.payload = payload;
          return builder;
        },
        delete() {
          state.op = "delete";
          return builder;
        },
        eq(k, v) {
          state.filters.push(["eq", k, v]);
          return builder;
        },
        neq: () => builder,
        is: () => builder,
        or(f) {
          state.filters.push(["or", f]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        then(resolve) {
          calls.push(state);
          if (state.op === "insert" && table === "quote_headers") return resolve({ data: [{ id: "new-quote" }], error: null });
          if (state.op === "select" && table === "quote_headers" && state.cols === "*") {
            return resolve({ data: rows.quoteHeaders ?? [], error: null });
          }
          return resolve({ data: [], error: null });
        }
      };
      return builder;
    }
  };
  return db;
}

test("save create persists quote_source estimate_builder with ESF number and no Monday sync", async () => {
  const db = fakeDb();
  const res = await processEstimateBuilderSave(db, {
    body: { document: doc(ACCEPTANCE_ITEMS), quote_status: "draft" },
    userEmail: "estimator@example.com",
    organizationContext: { organizationId: "org-1" },
    materialColors: COLORS
  });
  assert.equal(res.ok, true);
  assert.equal(res.quoteNumber, "ESF-DYER-000042");
  const header = db.calls.find((c) => c.table === "quote_headers" && c.op === "insert").payload;
  assert.equal(header.quote_source, "estimate_builder");
  assert.equal(header.quote_status, "draft");
  assert.equal(header.organization_id, "org-1");
  assert.equal(header.calculation_snapshot.internal_ui.customer_estimate_print_snapshot.header.quoteNumber, "ESF-DYER-000042");
  assert.ok(!db.calls.some((c) => String(c.table).includes("monday") && c.op !== "select"), "no Monday writes");
});

test("finalize is rejected server-side while items are incomplete", async () => {
  const res = await processEstimateBuilderSave(fakeDb(), {
    body: { document: doc([{ id: "a", itemType: "countertop", inputs: {} }]), quote_status: "testing_review" },
    userEmail: "e@example.com",
    organizationContext: null,
    materialColors: COLORS
  });
  assert.equal(res.ok, false);
  assert.equal(res.httpStatus, 422);
});

test("update_existing refuses historical revisions and other sources (scoped lookup)", async () => {
  const historical = fakeDb({ quoteHeaders: [{ id: "q1", quote_number: "ESF-DYER-000001", is_current_revision: false }] });
  const res = await processEstimateBuilderSave(historical, {
    body: { document: doc(ACCEPTANCE_ITEMS), quote_id: "q1", save_mode: "update_existing" },
    userEmail: "e@example.com",
    organizationContext: null,
    materialColors: COLORS
  });
  assert.equal(res.httpStatus, 409);
  const lookup = historical.calls.find((c) => c.table === "quote_headers" && c.cols === "*");
  assert.ok(lookup.filters.some(([op, k, v]) => op === "eq" && k === "quote_source" && v === "estimate_builder"));

  const missing = await processEstimateBuilderSave(fakeDb(), {
    body: { document: doc(ACCEPTANCE_ITEMS), quote_id: "internal-quote-id", save_mode: "update_existing" },
    userEmail: "e@example.com",
    organizationContext: null,
    materialColors: COLORS
  });
  assert.equal(missing.httpStatus, 404);
});

test("save_revision freezes the family and inserts R2 linked to the root", async () => {
  const db = fakeDb({
    quoteHeaders: [{ id: "q1", quote_number: "ESF-DYER-000007", quote_number_base: "ESF-DYER-000007", revision_number: 1, quote_family_root_id: "q1" }]
  });
  const res = await processEstimateBuilderSave(db, {
    body: { document: doc(ACCEPTANCE_ITEMS), quote_id: "q1", save_mode: "save_revision", revision_note: "Customer added trip" },
    userEmail: "e@example.com",
    organizationContext: null,
    materialColors: COLORS
  });
  assert.equal(res.ok, true);
  assert.equal(res.quoteNumber, "ESF-DYER-000007-R2");
  const freeze = db.calls.find((c) => c.op === "update" && c.payload?.is_current_revision === false);
  assert.ok(freeze, "prior revisions marked not current");
  const ins = db.calls.find((c) => c.table === "quote_headers" && c.op === "insert").payload;
  assert.equal(ins.quote_family_root_id, "q1");
  assert.equal(ins.revised_from_quote_id, "q1");
  assert.equal(ins.revision_label, "R2");
});
