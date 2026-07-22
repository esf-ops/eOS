/**
 * Measured vs billed countertop scope + governed estimator adjustments.
 * Run: node src/elite100EstimateStudio/studioScopeBilling.test.mjs
 */
import assert from "node:assert/strict";

import {
  billedAdjustmentSf,
  buildStudioScopeBilling,
  collectScopeAdjustmentIssues,
  normalizeCountertopScopeAdjustments,
  normalizeEdgeScopeAdjustment,
  resolveScopeEdgeLinearFeet,
  STUDIO_SCOPE_BILLING_VERSION
} from "./studioScopeBilling.mjs";
import { calculateStudioEstimate } from "./studioEstimatePricing.mjs";

const env = {};
const USER = "user-estimator-1";

function fourPieceScope(extra = {}) {
  return {
    customerName: "Acme",
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    colorName: "Alpine White",
    physicalScopeSource: "takeoff",
    takeoffScopeSummary: {
      pieceCount: 4,
      backsplashEligibleRunCount: 3,
      eligibleBacksplashLengthIn: 185.25,
      totalRunLengthIn: 370.29,
      derivedOpenEdgeLengthIn: 185.04,
      derivedOpenEdgeLf: 15.42,
      edgeScopeSource: "derived_open_edge_v1",
      countertopSqft: 51.06
    },
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        included: true,
        countertopSqft: 41.67,
        pieces: [
          { id: "p1", name: "Run A", pieceType: "counter", sqft: 18.25, included: true },
          { id: "p2", name: "Island", pieceType: "counter", sqft: 23.42, included: true }
        ]
      },
      {
        id: "room-2",
        name: "Bath",
        included: true,
        countertopSqft: 9.39,
        pieces: [
          { id: "p3", name: "Vanity L", pieceType: "counter", sqft: 4.52, included: true },
          { id: "p4", name: "Vanity R", pieceType: "counter", sqft: 4.87, included: true }
        ]
      }
    ],
    addOns: {},
    customLineItems: [],
    edgeProfileToken: "edge_eased",
    edgeLinearFeet: 0,
    countertopScopeAdjustments: [],
    edgeScopeAdjustment: null,
    internalMarkupPercent: 0,
    ...extra
  };
}

// 1. Exact measured countertop SF is preserved (never ceiled in aggregate).
{
  const billing = buildStudioScopeBilling(fourPieceScope());
  assert.equal(billing.measuredCountertopSf, 51.06);
  assert.equal(billing.version, STUDIO_SCOPE_BILLING_VERSION);
  assert.equal(billing.pricingScopeSource, "takeoff");
  console.log("ok: exact measured SF preserved (51.06)");
}

// 2-3. Each independent section ceils separately; billed SF = sum of ceiled sections.
{
  const billing = buildStudioScopeBilling(fourPieceScope());
  // 18.25→19, 23.42→24, 4.52→5, 4.87→5 = 53
  assert.equal(billing.billedCountertopSf, 53);
  const kitchen = billing.rooms.find((r) => r.roomId === "room-1");
  assert.deepEqual(
    kitchen.sections.map((s) => s.billableSf),
    [19, 24]
  );
  console.log("ok: per-section ceil (19+24+5+5 = 53 billed)");
}

// 4. Aggregate raw total is NOT ceiled once (ceil(51.06)=52 ≠ 53).
{
  const billing = buildStudioScopeBilling(fourPieceScope());
  assert.notEqual(billing.billedCountertopSf, Math.ceil(billing.measuredCountertopSf));
  console.log("ok: aggregate is never ceiled as one number (52 would be wrong)");
}

// Independent section count reflects each priced section.
{
  const billing = buildStudioScopeBilling(fourPieceScope());
  assert.equal(billing.independentSectionCount, 4);
  console.log("ok: independent pricing section count = 4");
}

// 7. Positive room adjustment participates as its own governed rounding section.
{
  const billing = buildStudioScopeBilling(
    fourPieceScope({
      countertopScopeAdjustments: [
        {
          id: "a1",
          adjustmentScope: "room",
          roomId: "room-1",
          adjustmentSf: 2,
          adjustmentReason: "Field-verified overhang",
          adjustedBy: USER,
          adjustedAt: "2026-07-20T00:00:00Z"
        }
      ]
    })
  );
  assert.equal(billing.adjustedMeasuredCountertopSf, 53.06);
  assert.equal(billing.billedCountertopSf, 55); // 53 + ceil(2)=2
  assert.equal(billing.independentSectionCount, 5);
  console.log("ok: +2.00 SF room adjustment → adjusted measured 53.06, billed 55");
}

// Fractional positive adjustment ceils independently (+1.2 → +2).
{
  assert.equal(billedAdjustmentSf(1.2), 2);
  assert.equal(billedAdjustmentSf(0), 0);
  console.log("ok: +1.2 SF adjustment bills as +2 (independent section rounding)");
}

// 8. Negative adjustment persists and reduces billed scope; -1.2 bills as -1.
{
  assert.equal(billedAdjustmentSf(-1.2), -1);
  const billing = buildStudioScopeBilling(
    fourPieceScope({
      countertopScopeAdjustments: [
        {
          id: "a2",
          adjustmentScope: "room",
          roomId: "room-2",
          adjustmentSf: -1.2,
          adjustmentReason: "Cabinet end unfinished",
          adjustedBy: USER
        }
      ]
    })
  );
  assert.equal(billing.billedCountertopSf, 52); // 53 - 1
  console.log("ok: -1.2 SF adjustment bills as -1 (never over-credits)");
}

// 9. Adjustment requires reason when non-zero (validation + pricing rejection).
{
  const scope = fourPieceScope({
    countertopScopeAdjustments: [
      { id: "a3", adjustmentScope: "room", roomId: "room-1", adjustmentSf: 2, adjustmentReason: "" }
    ]
  });
  const issues = collectScopeAdjustmentIssues(scope);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "adjustment_reason_required");
  let rejected = false;
  try {
    await calculateStudioEstimate({ scope, actorUserId: USER, env });
  } catch (e) {
    rejected = true;
    assert.equal(e.code, "adjustment_reason_required");
    assert.equal(e.statusCode, 400);
  }
  assert.equal(rejected, true);
  console.log("ok: non-zero adjustment without reason is rejected (400 adjustment_reason_required)");
}

// 10. Negative adjustment can never produce negative billed scope.
{
  const billing = buildStudioScopeBilling(
    fourPieceScope({
      countertopScopeAdjustments: [
        {
          id: "a4",
          adjustmentScope: "room",
          roomId: "room-2",
          adjustmentSf: -500,
          adjustmentReason: "Extreme credit"
        }
      ]
    })
  );
  const bath = billing.rooms.find((r) => r.roomId === "room-2");
  assert.equal(bath.billedWithAdjustmentsSf, 0);
  assert.ok(billing.billedCountertopSf >= 0);
  console.log("ok: negative adjustment clamps at zero billed scope (room and project)");
}

// Project-level adjustment is its own governed independent section.
{
  const billing = buildStudioScopeBilling(
    fourPieceScope({
      countertopScopeAdjustments: [
        {
          id: "a5",
          adjustmentScope: "project",
          roomId: null,
          adjustmentSf: 1.5,
          adjustmentReason: "Template contingency"
        }
      ]
    })
  );
  assert.equal(billing.projectAdjustmentBilledSf, 2);
  assert.equal(billing.billedCountertopSf, 55);
  console.log("ok: project-level adjustment allocates as a governed project section (+1.5 → +2)");
}

// Normalization: reason aliases, scope inference, ids.
{
  const rows = normalizeCountertopScopeAdjustments({
    countertopScopeAdjustments: [
      { adjustmentSf: "2.5", roomId: "room-1", reason: "alias reason" },
      { adjustmentSf: 1, adjustmentScope: "project" }
    ]
  });
  assert.equal(rows[0].adjustmentScope, "room");
  assert.equal(rows[0].adjustmentSf, 2.5);
  assert.equal(rows[0].adjustmentReason, "alias reason");
  assert.equal(rows[1].adjustmentScope, "project");
  assert.equal(rows[1].roomId, null);
  console.log("ok: adjustment normalization (aliases, scope inference)");
}

// 11. Adjustment is snapshotted: calc snapshot carries scopeBilling + audit fields.
{
  const scope = fourPieceScope({
    countertopScopeAdjustments: [
      {
        id: "a6",
        adjustmentScope: "room",
        roomId: "room-1",
        adjustmentSf: 2,
        adjustmentReason: "Field-verified overhang",
        adjustedBy: USER,
        adjustedAt: "2026-07-20T00:00:00Z"
      }
    ]
  });
  const calc = await calculateStudioEstimate({ scope, actorUserId: USER, env });
  assert.ok(calc.scopeBilling);
  assert.equal(calc.scopeBilling.measuredCountertopSf, 51.06);
  assert.equal(calc.scopeBilling.billedCountertopSf, 55);
  assert.equal(calc.scopeBilling.pricingScopeSource, "takeoff");
  const adj = calc.scopeBilling.adjustments.find((a) => a.id === "a6");
  assert.equal(adj.adjustedBy, USER);
  assert.equal(adj.adjustedAt, "2026-07-20T00:00:00Z");
  assert.equal(adj.adjustmentReason, "Field-verified overhang");
  console.log("ok: adjustment audit (who/when/why) is snapshotted in the calculation");
}

// 12. Adjustment changes authoritative pricing (billed SF drives material $).
{
  const base = await calculateStudioEstimate({ scope: fourPieceScope(), actorUserId: USER, env });
  const adjusted = await calculateStudioEstimate({
    scope: fourPieceScope({
      countertopScopeAdjustments: [
        {
          id: "a7",
          adjustmentScope: "room",
          roomId: "room-1",
          adjustmentSf: 2,
          adjustmentReason: "Field-verified overhang"
        }
      ]
    }),
    actorUserId: USER,
    env
  });
  assert.ok(
    adjusted.totals.materialSubtotal > base.totals.materialSubtotal,
    "material subtotal must increase with positive scope adjustment"
  );
  assert.notEqual(adjusted.fingerprint, base.fingerprint);
  console.log("ok: adjustment participates in authoritative backend pricing + fingerprint");
}

// Edge adjustment normalization + derived edge resolution.
{
  const adj = normalizeEdgeScopeAdjustment({
    edgeScopeAdjustment: { adjustmentLf: "2.5", reason: "waterfall sides" }
  });
  assert.equal(adj.adjustmentLf, 2.5);
  assert.equal(adj.adjustmentReason, "waterfall sides");

  const resolved = resolveScopeEdgeLinearFeet(
    fourPieceScope({ edgeScopeAdjustment: { adjustmentLf: 2.5, adjustmentReason: "waterfall sides" } })
  );
  assert.equal(resolved.derivedLf, 15.42);
  assert.equal(resolved.finalLf, 17.92);
  assert.equal(resolved.source, "estimator_adjusted_open_edge_v1");
  console.log("ok: edge scope = derived 15.42 LF + 2.5 adjustment = 17.92 LF (adjusted source)");
}

// Manual / legacy scopes still honor edgeEligibleLinearFeet when edgeLinearFeet is 0.
{
  const resolved = resolveScopeEdgeLinearFeet({
    physicalScopeSource: "manual",
    edgeLinearFeet: 0,
    edgeEligibleLinearFeet: 10.13,
    edgeScopeAdjustment: { adjustmentLf: 0 }
  });
  assert.equal(resolved.derivedLf, 10.13);
  assert.equal(resolved.finalLf, 10.13);
  assert.equal(resolved.source, "manual");
  console.log("ok: manual path falls back to edgeEligibleLinearFeet when edgeLinearFeet is 0");
}

// Excluded room / excluded pieces never bill.
{
  const scope = fourPieceScope();
  scope.rooms[1].included = false;
  const billing = buildStudioScopeBilling(scope);
  assert.equal(billing.billedCountertopSf, 43); // 19 + 24 only
  assert.equal(billing.independentSectionCount, 2);
  console.log("ok: excluded rooms/pieces drop out of measured and billed scope");
}

console.log("\nAll studioScopeBilling tests passed.\n");
