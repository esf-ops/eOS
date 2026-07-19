/**
 * Shared billable SF ceiling tests.
 * Run: node backend-core/src/quotes/billableSquareFeet.test.mjs
 */
import assert from "node:assert/strict";
import {
  ceilBillableSquareFeet,
  sumBillableSquareFeetSections,
  billableCountertopFromRoom,
  billableBacksplashFromRoom
} from "./billableSquareFeet.mjs";

console.log("\nbillableSquareFeet.test.mjs\n");

{
  assert.equal(ceilBillableSquareFeet(10.0), 10);
  assert.equal(ceilBillableSquareFeet(10.1), 11);
  assert.equal(ceilBillableSquareFeet(10.9), 11);
  assert.equal(ceilBillableSquareFeet(67.0), 67);
  assert.equal(ceilBillableSquareFeet(67.5), 68);
  assert.equal(ceilBillableSquareFeet(67.88), 68);
  assert.equal(ceilBillableSquareFeet(0), 0);
  assert.equal(ceilBillableSquareFeet(-1), 0);
  assert.equal(ceilBillableSquareFeet(null), 0);
  console.log("ok: 1–5 ceil cases + non-positive");
}

{
  const island = 10.1;
  const perimeter = 23.2;
  const splash = 6.1;
  assert.equal(sumBillableSquareFeetSections([island, perimeter, splash]), 11 + 24 + 7);
  assert.notEqual(
    sumBillableSquareFeetSections([island, perimeter, splash]),
    Math.ceil(island + perimeter + splash)
  );
  console.log("ok: 7–10 section-level rounding, not combined-room ceil");
}

{
  const room = {
    countertopSqft: 99.9,
    pieces: [
      { id: "island", included: true, sqft: 10.1 },
      { id: "perimeter", included: true, sqft: 23.2 },
      { id: "excluded", included: false, sqft: 50 }
    ]
  };
  const billed = billableCountertopFromRoom(room);
  assert.equal(billed.sections.length, 2);
  assert.equal(billed.sections[0].billableSf, 11);
  assert.equal(billed.sections[1].billableSf, 24);
  assert.equal(billed.billableSf, 35);
  assert.equal(billed.rawSf, 10.1 + 23.2);
  assert.equal(room.pieces[0].sqft, 10.1, "raw geometry unchanged");
  console.log("ok: 6–7 raw preserved; island/perimeter round separately");
}

{
  const room = {
    includeBacksplash: true,
    backsplashSqft: 12.2,
    backsplashSections: [
      { id: "run-a", included: true, sqft: 6.1 },
      { id: "run-b", included: true, sqft: 6.1 }
    ]
  };
  const billed = billableBacksplashFromRoom(room);
  assert.equal(billed.billableSf, 14);
  assert.equal(billed.sections.length, 2);
  const none = billableBacksplashFromRoom({ includeBacksplash: false, backsplashSqft: 20 });
  assert.equal(none.billableSf, 0);
  console.log("ok: 8 backsplash sections round separately; no-splash zeros");
}

{
  const wf = sumBillableSquareFeetSections([8.2, 8.2]);
  assert.equal(wf, 18);
  assert.notEqual(wf, Math.ceil(8.2 + 8.2));
  console.log("ok: 9 waterfall panels round separately");
}

console.log("\nAll billableSquareFeet tests passed.\n");
