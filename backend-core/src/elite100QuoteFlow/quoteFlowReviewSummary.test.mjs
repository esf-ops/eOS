import assert from "node:assert/strict";
import { assessQuoteFlowReviewReadiness, findRoomColorGroupMismatches } from "./quoteFlowReview.mjs";
import { resolveRoomBaselineMaterialId } from "../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";
import {
  getElite100CustomerMaterial,
  slugifyElite100ColorName
} from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";

console.log("\nquoteFlowReviewSummary.test.mjs\n");

function row(totals, customLineItems = []) {
  return {
    id: "est-1",
    organizationId: "org-1",
    lifecycleStatus: "priced",
    scope: {
      rooms: [{ id: "k", name: "Kitchen", pieces: [{ id: "p1", name: "Run", lengthIn: 120, depthIn: 25.5, quantity: 1 }] }],
      customLineItems
    },
    calculationSnapshot: { totals }
  };
}

{
  const r = assessQuoteFlowReviewReadiness(
    row({
      exactTotal: 2619.75,
      displayTotal: 2619.75,
      estimateWideAdjustment: { percentage: 5, reason: "Site access surcharge", source: "manual", exactAdjustment: 124.75 }
    })
  );
  assert.equal(r.reviewSummary.customerFacingAdjustments, 124.75);
  assert.equal(r.reviewSummary.estimateWideAdjustment.amount, 124.75);
  assert.equal(r.reviewSummary.estimateWideAdjustment.percentage, 5);
  assert.equal(r.reviewSummary.customLineAdjustments, 0);
  console.log("ok: estimate-wide adjustment counts as a customer-facing adjustment");
}

{
  const r = assessQuoteFlowReviewReadiness(row({ exactTotal: 2495, displayTotal: 2495, estimateWideAdjustment: null }));
  assert.equal(r.reviewSummary.customerFacingAdjustments, 0);
  assert.equal(r.reviewSummary.estimateWideAdjustment, null);
  console.log("ok: no adjustment → $0 and no adjustment detail");
}

{
  const base = { findMaterial: getElite100CustomerMaterial, slugify: slugifyElite100ColorName, fallbackMaterialId: "e100-carrara-classic" };
  assert.deepEqual(resolveRoomBaselineMaterialId({ ...base, colorName: "Calacatta Fioressa", roomGroupCode: "group_c" }), {
    materialId: "e100-calacatta-fioressa",
    reason: "published_color"
  });
  assert.deepEqual(resolveRoomBaselineMaterialId({ ...base, colorName: "Calacatta Fioressa", roomGroupCode: "promo" }), {
    materialId: null,
    reason: "color_group_mismatch"
  });
  assert.deepEqual(resolveRoomBaselineMaterialId({ ...base, colorName: "Not A Real Color", roomGroupCode: "promo" }), {
    materialId: null,
    reason: "color_not_in_catalog"
  });
  assert.deepEqual(resolveRoomBaselineMaterialId({ ...base, colorName: null, roomGroupCode: "promo" }), {
    materialId: "e100-carrara-classic",
    reason: "no_published_color"
  });
  console.log("ok: customer baseline color follows the published room color, never a substitute");
}

{
  const scope = {
    materialGroup: "Group Promo",
    colorName: "Calacatta Fioressa",
    rooms: [
      { id: "k", name: "Kitchen", pieces: [] },
      { id: "b", name: "Bath", materialGroupOverride: "Group C", pieces: [] }
    ]
  };
  const m = findRoomColorGroupMismatches(scope);
  assert.equal(m.length, 1);
  assert.equal(m[0].roomName, "Kitchen");
  assert.equal(m[0].colorGroupLabel, "Group C");
  const r = assessQuoteFlowReviewReadiness({ ...row({ exactTotal: 1, displayTotal: 1 }), scope: { ...scope, customLineItems: [] } });
  assert.ok(r.warnings.some((w) => w.id === "color_price_group"));
  assert.ok(!r.blockers.some((w) => w.id === "color_price_group"), "warning, not a blocker");
  assert.equal(findRoomColorGroupMismatches({ ...scope, materialGroup: "Group C" }).length, 0);
  console.log("ok: review warns when a room's color belongs to another price group");
}

console.log("\nquoteFlowReviewSummary.test.mjs — passed\n");
