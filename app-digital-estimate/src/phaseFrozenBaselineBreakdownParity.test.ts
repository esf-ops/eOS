/**
 * Digital Estimate fail-closed parity: when the backend freezes to the published
 * baseline, every customer-visible price must be baseline — the main total, the
 * sidebar room breakdown, the room card summaries and the print estimate. The
 * partial calc behind the freeze (Countertop $0 with backsplash-only room
 * totals) must never reach the customer.
 *
 * Run: node app-digital-estimate/src/phaseFrozenBaselineBreakdownParity.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildUpdatedBreakdown,
  failClosedRoomPricing,
  buildRoomHierarchyBreakdown,
  isUnsafeCustomerRoomPricing,
} from "./customerEstimateBreakdown.ts";
import { buildDigitalEstimatePrintModel } from "./customerPrintAdapter.ts";
import type { PublicRoomPricing } from "./publicConfigApi.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");

console.log("\nphaseFrozenBaselineBreakdownParity.test.ts\n");

/** Published baseline: $7,120 across two rooms, real countertop dollars. */
const publishedRoomPricing = {
  kind: "original",
  projectTotal: 7120,
  rooms: [
    {
      roomName: "Kitchen",
      roomLabel: "Kitchen",
      countertopAmount: 4197,
      backsplashAmount: 459,
      addOnsAmount: 0,
      roomTotal: 4656,
      addOnLines: [],
    },
    {
      roomName: "Master Bath",
      roomLabel: "Master Bath",
      countertopAmount: 1648,
      backsplashAmount: 816,
      addOnsAmount: 0,
      roomTotal: 2464,
      addOnLines: [],
    },
  ],
  projectAddOns: [],
} as unknown as PublicRoomPricing;

/** The unsafe calc from production: countertop gone, backsplash-only totals. */
const unsafeRoomPricing = {
  kind: "updated",
  projectTotal: 5264,
  rooms: [
    {
      roomName: "Kitchen",
      roomLabel: "Kitchen",
      countertopAmount: 0,
      backsplashAmount: 459,
      addOnsAmount: 0,
      roomTotal: 459,
      addOnLines: [],
    },
    {
      roomName: "Master Bath",
      roomLabel: "Master Bath",
      countertopAmount: 0,
      backsplashAmount: 816,
      addOnsAmount: 0,
      roomTotal: 816,
      addOnLines: [],
    },
  ],
  projectAddOns: [],
} as unknown as PublicRoomPricing;

// 1. A frozen result never exposes unsafe customer room pricing.
{
  // Backend substituted baseline rooms (kind "original") — keep them.
  const substituted = failClosedRoomPricing(
    { pricingAuthority: "published_baseline_frozen", roomPricing: publishedRoomPricing },
    null,
  );
  assert.equal(substituted?.projectTotal, 7120);

  // Backend could not substitute and left the unsafe calc rooms — drop them.
  const leaked = failClosedRoomPricing(
    { pricingAuthority: "published_baseline_frozen", roomPricing: unsafeRoomPricing },
    null,
  );
  assert.equal(leaked, null, "1. unsafe calc room pricing is never shown behind a frozen total");

  // Published baseline available on the client — always prefer it.
  const preferred = failClosedRoomPricing(
    { pricingAuthority: "published_baseline_frozen", roomPricing: unsafeRoomPricing },
    publishedRoomPricing,
  );
  assert.equal(preferred?.projectTotal, 7120);
  for (const room of preferred?.rooms || []) {
    assert.ok(Number(room.countertopAmount) > 0, `1. ${room.roomName} keeps countertop dollars`);
  }

  // Countertop $0 / backsplash-only collapse is never shown — even when the
  // persisted calc still claims authoritative_backend_reprice.
  const collapseCaught = failClosedRoomPricing(
    { pricingAuthority: "authoritative_backend_reprice", roomPricing: unsafeRoomPricing },
    publishedRoomPricing,
  );
  assert.equal(collapseCaught?.projectTotal, 7120, "1. unsafe collapse prefers published baseline");
  assert.ok(isUnsafeCustomerRoomPricing(unsafeRoomPricing), "1. collapse detector matches PDF shape");

  // A legitimate live-priced upgrade (real countertop dollars) is untouched.
  const liveSafe = {
    kind: "updated" as const,
    projectTotal: 7441,
    rooms: [
      {
        roomName: "Kitchen",
        countertopAmount: 5000,
        backsplashAmount: 459,
        addOnsAmount: 0,
        roomTotal: 5459,
        addOnLines: [],
      },
    ],
    projectAddOns: [],
  } as unknown as PublicRoomPricing;
  const authoritative = failClosedRoomPricing(
    { pricingAuthority: "authoritative_backend_reprice", roomPricing: liveSafe },
    publishedRoomPricing,
  );
  assert.equal(authoritative?.projectTotal, 7441, "1. safe live pricing is not overridden");
  console.log("ok: 1. frozen result exposes no unsafe customer roomPricing");
}

// 2. Sidebar room breakdown uses baseline room pricing when frozen.
{
  const breakdown = buildUpdatedBreakdown({
    calculation: {
      pricingAuthority: "published_baseline_frozen",
      configuredDisplayTotal: 7120,
      roomPricing: failClosedRoomPricing(
        { pricingAuthority: "published_baseline_frozen", roomPricing: unsafeRoomPricing },
        publishedRoomPricing,
      ),
    },
    rooms: [],
  });
  assert.equal(breakdown.total, 7120, "2. breakdown total matches the frozen total");
  const kitchenCountertop = breakdown.lines.find(
    (l) => l.roomName === "Kitchen" && l.label === "Countertop",
  );
  assert.equal(kitchenCountertop?.amount, 4197, "2. baseline countertop dollars are shown");
  const kitchenTotal = breakdown.lines.find((l) => l.label === "Kitchen total");
  assert.equal(kitchenTotal?.amount, 4656, "2. room total is not backsplash-only");
  assert.ok(
    !breakdown.lines.some((l) => l.label === "Countertop" && Number(l.amount) === 0),
    "2. no Countertop $0 line reaches the customer",
  );

  // No baseline detail available: show the frozen total only, never partial lines.
  const withoutBaseline = buildUpdatedBreakdown({
    calculation: {
      pricingAuthority: "published_baseline_frozen",
      configuredDisplayTotal: 7120,
      roomPricing: null,
      options: [
        { optionKey: "sink:kitchen:esf", displayLabel: "ESF sink", visiblePrice: 450, included: false },
      ],
    },
    rooms: [],
  });
  assert.equal(withoutBaseline.total, 7120);
  assert.deepEqual(withoutBaseline.lines, [], "2. no partial line detail behind a frozen total");
  console.log("ok: 2. sidebar room breakdown uses baseline room pricing when frozen");
}

// 3. Room card price summary uses baseline room pricing when frozen.
{
  // Room cards read roomPricing off the calc the view passes to the view model,
  // so the view must hand them the fail-closed pricing.
  assert.ok(
    /forSafeDisplay|failClosedRoomPricing/.test(view),
    "3. room cards are built from fail-closed room pricing",
  );
  assert.ok(
    /mapEliteOsToLovableViewModel\(\s*state,\s*qty,\s*latestCalcForDisplay,/.test(view),
    "3. view model receives the fail-closed calc",
  );
  assert.ok(
    /const savedCalcForDisplay = forSafeDisplay\(savedCalc\)/.test(view) ||
      /failClosedRoomPricing\(savedCalc/.test(view),
    "3. saved-calc surfaces are fail-closed too",
  );
  assert.ok(
    /calculation: savedCalcForDisplay/.test(view),
    "3. sidebar breakdown is built from the fail-closed calc",
  );
  assert.ok(
    /de-room-price-summary[\s\S]{0,800}countertopAmount[\s\S]{0,200}> 0\.005/.test(view) ||
      /countertopAmount == null \|\| Number\(pricing\.countertopAmount\) <= 0\.005/.test(view),
    "3. room card hides Countertop $0 / backsplash-only summary",
  );

  const baselineCard = buildRoomHierarchyBreakdown("updated", publishedRoomPricing);
  assert.equal(baselineCard.total, 7120, "3. room summaries sum to the baseline total");
  console.log("ok: 3. room card price summary uses baseline room pricing when frozen");
}

// 4. Print estimate uses baseline room pricing when frozen.
{
  const printModel = buildDigitalEstimatePrintModel({
    rooms: [
      { name: "Kitchen", colors: [], choiceOptions: [], sideSplashPieces: [] },
      { name: "Master Bath", colors: [], choiceOptions: [], sideSplashPieces: [] },
    ] as never,
    roomPricing: failClosedRoomPricing(
      { pricingAuthority: "published_baseline_frozen", roomPricing: unsafeRoomPricing },
      publishedRoomPricing,
    ),
    estimateTotal: 7120,
    customerName: "Customer",
    projectName: null,
    projectAddress: null,
    quoteNumber: "Q-1",
    pricingValidThrough: null,
  });
  assert.equal(printModel.estimateTotal, 7120);
  const kitchen = printModel.rooms.find((r) => r.roomName === "Kitchen");
  assert.equal(kitchen?.countertopAmount, 4197, "4. print shows baseline countertop dollars");
  assert.equal(kitchen?.roomTotal, 4656, "4. print room total is not backsplash-only");
  assert.ok(
    !printModel.rooms.some((r) => r.countertopAmount === 0),
    "4. print never shows a $0 countertop for priced countertop scope",
  );
  assert.ok(
    /failClosedRoomPricing\(savedCalc, publishedRoomPricing\)/.test(view),
    "4. the view builds the print model from fail-closed room pricing",
  );
  console.log("ok: 4. print estimate uses baseline room pricing when frozen");
}

// 4b. Uploaded-PDF failure shape — total $7,120 with every room Countertop $0 /
// backsplash-only. Print must not contain those amounts.
{
  const pdfUnsafe = {
    kind: "updated",
    projectTotal: 7120,
    rooms: [
      { roomName: "Kitchen", countertopAmount: 0, backsplashAmount: 2315, addOnsAmount: 0, roomTotal: 2315, addOnLines: [] },
      { roomName: "Master Bath", countertopAmount: 0, backsplashAmount: 816, addOnsAmount: 0, roomTotal: 816, addOnLines: [] },
      { roomName: "Guest Bath", countertopAmount: 0, backsplashAmount: 446, addOnsAmount: 0, roomTotal: 446, addOnLines: [] },
      { roomName: "LL Bath", countertopAmount: 0, backsplashAmount: 745, addOnsAmount: 0, roomTotal: 745, addOnLines: [] },
      { roomName: "Laundry", countertopAmount: 0, backsplashAmount: 1312, addOnsAmount: 0, roomTotal: 1312, addOnLines: [] },
      { roomName: "Wet Bar", countertopAmount: 0, backsplashAmount: 1486, addOnsAmount: 0, roomTotal: 1486, addOnLines: [] },
    ],
    projectAddOns: [],
  } as unknown as PublicRoomPricing;

  // Authority may still say authoritative when published rooms were unavailable.
  const safe = failClosedRoomPricing(
    { pricingAuthority: "authoritative_backend_reprice", roomPricing: pdfUnsafe },
    null,
  );
  assert.equal(safe, null, "4b. unsafe PDF rooms are dropped when no baseline detail exists");

  const printModel = buildDigitalEstimatePrintModel({
    rooms: pdfUnsafe.rooms.map((r) => ({
      name: r.roomName,
      colors: [],
      choiceOptions: [],
      sideSplashPieces: [],
    })) as never,
    roomPricing: pdfUnsafe, // adapter must refuse this even if the caller forgot fail-close
    estimateTotal: 7120,
    customerName: "Customer",
    projectName: null,
    projectAddress: null,
    quoteNumber: "Q-1",
    pricingValidThrough: null,
    pricingFrozen: true,
    scopeReviewRequired: false,
  });
  assert.equal(printModel.estimateTotal, 7120, "4b. header/project total remains published baseline");
  assert.ok(
    !printModel.rooms.some((r) => r.countertopAmount === 0),
    "4b. print model does not contain Countertop $0",
  );
  assert.ok(
    !printModel.rooms.some((r) => r.backsplashAmount === 2315 || r.roomTotal === 2315),
    "4b. print model does not contain backsplash-only unsafe room totals",
  );
  assert.ok(
    printModel.rooms.every((r) => r.countertopAmount == null && r.roomTotal == null),
    "4b. print hides room-level pricing when baseline detail is unavailable",
  );
  assert.match(
    printModel.reviewNotice,
    /could not be priced automatically/i,
    "4b. fail-closed print copy is not estimator-review language",
  );
  assert.ok(
    !/needs elite review|estimator review/i.test(printModel.reviewNotice),
    "4b. no estimator-review copy on fail-closed print",
  );

  // With baseline available, print uses baseline room dollars.
  const printBaseline = buildDigitalEstimatePrintModel({
    rooms: [
      { name: "Kitchen", colors: [], choiceOptions: [], sideSplashPieces: [] },
    ] as never,
    roomPricing: failClosedRoomPricing(
      { pricingAuthority: "authoritative_backend_reprice", roomPricing: pdfUnsafe },
      publishedRoomPricing,
    ),
    estimateTotal: 7120,
    customerName: "Customer",
    projectName: null,
    projectAddress: null,
    quoteNumber: "Q-1",
    pricingValidThrough: null,
    pricingFrozen: true,
  });
  assert.equal(printBaseline.rooms[0]?.countertopAmount, 4197);
  assert.ok(printBaseline.rooms[0]?.roomTotal !== 2315);
  console.log("ok: 4b. uploaded-PDF failure shape never prints Countertop $0");
}

// 5. Fail-closed copy is a temporary pricing fallback, not estimator review.
{
  assert.ok(
    /showPricingNotice = Boolean\(pricingNotice\) && \(changesNeedReview \|\| pricingFrozen\)/.test(view),
    "5. frozen state always shows its customer notice",
  );
  assert.ok(
    /could not be priced automatically yet/.test(view),
    "5. fail-closed notice is customer-safe temporary fallback copy",
  );
  assert.ok(
    !/Price updates for this change require estimator review/.test(view),
    "5. no estimator-review copy for normal selection pricing",
  );
  assert.ok(
    /changesNeedReview = scopeReviewRequired/.test(view),
    "5. estimator-review UI is gated on true scope-change requests only",
  );
  console.log("ok: 5. frozen state stays visible with customer-safe copy");
}

// 6. No browser pricing math — the client only selects between backend DTOs.
{
  const breakdownSrc = readFileSync(join(__dirname, "customerEstimateBreakdown.ts"), "utf8");
  assert.ok(
    !/ratePerLf|pricePerSqft|\bsqft\s*\*|linearFeet\s*\*|materialRate/i.test(breakdownSrc),
    "6. breakdown never derives prices from rates or quantities",
  );
  assert.ok(
    !/ratePerLf|pricePerSqft|materialRate/i.test(view),
    "6. the view never derives prices from rates",
  );
  console.log("ok: 6. browser does not calculate pricing");
}

console.log("\nAll phaseFrozenBaselineBreakdownParity tests passed.\n");
