/**
 * Digital Estimate Changes tab — additive row reconciliation.
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseChangesBreakdownReconciliation.test.ts
 */
import assert from "node:assert/strict";
import { buildChangesBreakdown } from "./customerEstimateBreakdown.ts";
import type { PublicRoomPricingChanges } from "./publicConfigApi.ts";

console.log("\nphaseChangesBreakdownReconciliation.test.ts\n");

{
  // Production shape after Material/Countertop de-dupe.
  const roomPricingChanges: PublicRoomPricingChanges = {
    kind: "changes",
    rows: [
      {
        roomName: "Kitchen",
        category: "sink",
        categoryLabel: "Sink",
        originalLabel: "Not selected",
        updatedLabel: "Precis 50/50",
        amountDelta: 575,
        status: "new_selection"
      },
      {
        roomName: "Kitchen",
        category: "specialty",
        categoryLabel: "Specialty",
        originalLabel: "Not selected",
        updatedLabel: "Hubbell specialty",
        amountDelta: 550,
        status: "new_selection"
      },
      {
        roomName: "Kitchen",
        category: "sink_cutout",
        categoryLabel: "Sink cutout",
        originalLabel: "Not selected",
        updatedLabel: "Sink cutout",
        amountDelta: 200,
        status: "new_selection"
      },
      {
        roomName: "Master Bath",
        category: "material",
        categoryLabel: "Material",
        originalLabel: "Group Promo",
        updatedLabel: "Group A",
        amountDelta: 122,
        status: "changed"
      },
      {
        roomName: "Master Bath",
        category: "backsplash",
        categoryLabel: "Backsplash",
        originalLabel: "4-inch backsplash",
        updatedLabel: "4-inch backsplash",
        amountDelta: 27,
        status: "changed"
      },
      {
        roomName: "LL Bath",
        category: "material",
        categoryLabel: "Material",
        originalLabel: "Group Promo",
        updatedLabel: "Group A",
        amountDelta: 110,
        status: "changed"
      },
      {
        roomName: "LL Bath",
        category: "backsplash",
        categoryLabel: "Backsplash",
        originalLabel: "4-inch backsplash",
        updatedLabel: "4-inch backsplash",
        amountDelta: 35,
        status: "changed"
      }
    ],
    totalDelta: 1619
  };

  const view = buildChangesBreakdown({
    changeLines: [],
    roomPricingChanges,
    displayTotalDelta: 1619
  });

  assert.equal(view.total, 1619);
  assert.equal(
    view.lines.some((l) => /Countertop → Countertop/.test(l.label)),
    false,
    "no duplicate Countertop → Countertop row"
  );

  const kitchenTotal = view.lines.find((l) => l.label === "Kitchen total change");
  assert.equal(kitchenTotal?.amount, 1325);

  const masterTotal = view.lines.find((l) => l.label === "Master Bath total change");
  assert.equal(masterTotal?.amount, 149);

  const llTotal = view.lines.find((l) => l.label === "LL Bath total change");
  assert.equal(llTotal?.amount, 145);

  const roomTotals = [kitchenTotal, masterTotal, llTotal].map((l) => Number(l?.amount || 0));
  const sumRooms = roomTotals.reduce((s, n) => s + n, 0);
  assert.equal(sumRooms, 1619);
  assert.equal(sumRooms, view.total);
  assert.equal(
    view.lines.some((l) => l.key === "chg-project-level"),
    false,
    "no residual project-level line when rooms already reconcile"
  );

  const projectDiff = view.lines.find((l) => l.label === "Difference from published estimate");
  assert.equal(projectDiff?.amount, 1619);
  console.log("ok: Changes room totals sum to project difference; no Material/Countertop double-count");
}

{
  // Residual project-level adjustments when rooms do not cover full delta.
  const view = buildChangesBreakdown({
    changeLines: [],
    roomPricingChanges: {
      kind: "changes",
      rows: [
        {
          roomName: "Kitchen",
          category: "sink",
          categoryLabel: "Sink",
          originalLabel: "Not selected",
          updatedLabel: "Sink",
          amountDelta: 200,
          status: "new_selection"
        }
      ],
      totalDelta: 250
    }
  });
  const residual = view.lines.find((l) => l.key === "chg-project-level");
  assert.ok(residual);
  assert.equal(residual?.amount, 50);
  assert.equal(view.total, 250);
  console.log("ok: project-level residual explains gap between room sum and project delta");
}

{
  // Studio V2 selection review and Digital Estimate Changes both consume the
  // same calculation totals (configured − published). Neither invents a second price.
  const { buildStudioCustomerSelectionReview } = await import(
    "../../backend-core/src/elite100EstimateStudio/studioCustomerSelectionReview.mjs"
  );
  const review = buildStudioCustomerSelectionReview({
    selection: {
      id: "sel-1",
      selection_hash: "h",
      selection_payload_json: { "sink:kitchen:esf:x": 1 },
      created_at: "2026-07-31T16:00:00.000Z"
    },
    calculation: {
      id: "calc-1",
      baseline_total: 7120,
      configured_total: 8739,
      customer_result_json: {
        baselineDisplayTotal: 7120,
        configuredDisplayTotal: 8739,
        pricedSelectionTotal: 8739,
        publishedBaselineTotal: 7120,
        displayTotalDelta: 1619,
        pricingAuthority: "authoritative_backend_reprice"
      }
    },
    rooms: [{ id: "kitchen", name: "Kitchen" }],
    publicationId: "pub-1",
    envelopeId: "env-1"
  });
  assert.equal(review.totals.publishedBaselineTotal, 7120);
  assert.equal(review.totals.customerEstimateTotal, 8739);
  assert.equal(review.totals.difference, 1619);

  const changesView = buildChangesBreakdown({
    changeLines: [],
    roomPricingChanges: {
      kind: "changes",
      rows: [
        {
          roomName: "Kitchen",
          category: "sink",
          categoryLabel: "Sink",
          originalLabel: "Not selected",
          updatedLabel: "Sink",
          amountDelta: 1619,
          status: "new_selection"
        }
      ],
      totalDelta: 1619
    },
    displayTotalDelta: 1619
  });
  assert.equal(changesView.total, review.totals.difference);
  console.log("ok: Studio V2 selection review and DE Changes share the same total/difference");
}

{
  // No browser pricing math — display only formats backend amounts.
  const src = await import("node:fs").then((m) =>
    m.readFileSync(new URL("./customerEstimateBreakdown.ts", import.meta.url), "utf8")
  );
  assert.ok(!/ratePerSqft|LF\s*\*|linearFeet\s*\*/i.test(src));
  console.log("ok: Changes breakdown has no browser pricing math");
}

console.log("\nAll phaseChangesBreakdownReconciliation tests passed.\n");
