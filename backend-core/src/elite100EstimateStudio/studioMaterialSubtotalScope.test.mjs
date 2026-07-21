/**
 * Strict material-subtotal contract — billed countertop scope authority.
 *
 * Hosted defect: displayed billed countertop scope was 53 SF but the priced
 * material subtotal was $2,655 (= 59 SF × $45) because room backsplash billed
 * SF was silently folded into a single unattributed "Material subtotal".
 *
 * Contract under test:
 *  - Countertop material subtotal = billed countertop sections × room rate
 *    (+ governed adjustments only).
 *  - Backsplash is a separately attributed category, never countertop SF.
 *  - displayedBilledCountertopSf === pricedBilledCountertopSf (invariant).
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioMaterialSubtotalScope.test.mjs
 */
import assert from "node:assert/strict";
import {
  calculateStudioEstimate,
  assertBilledCountertopScopeReconciles
} from "./studioEstimatePricing.mjs";
import { buildStudioScopeBilling } from "./studioScopeBilling.mjs";

console.log("\nstudioMaterialSubtotalScope.test.mjs\n");

// Four approved Takeoff pieces that independently ceil to 53 billed SF:
// 17.2→18, 12.6→13, 11.3→12, 9.1→10  (measured 50.2 SF).
const PIECES = [
  { id: "p1", name: "Sink Run", pieceType: "counter", sqft: 17.2, included: true },
  { id: "p2", name: "Stove Run", pieceType: "counter", sqft: 12.6, included: true },
  { id: "p3", name: "Island", pieceType: "counter", sqft: 11.3, included: true },
  { id: "p4", name: "Peninsula", pieceType: "counter", sqft: 9.1, included: true }
];

function baseScope(overrides = {}) {
  return {
    physicalScopeSource: "takeoff",
    materialGroup: "Group Promo",
    pricingBasis: "wholesale", // Group Promo wholesale = $45/SF
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        included: true,
        includeBacksplash: false,
        backsplashSqft: 0,
        pieces: PIECES.map((p) => ({ ...p }))
      }
    ],
    addOns: {},
    customLineItems: [],
    ...overrides
  };
}

// 1. Four independently rounded pieces total 53 billed SF.
{
  const billing = buildStudioScopeBilling(baseScope());
  assert.equal(billing.billedCountertopSf, 53);
  assert.equal(billing.measuredCountertopSf, 50.2);
  assert.equal(billing.rooms[0].sections.length, 4);
  assert.deepEqual(
    billing.rooms[0].sections.map((s) => s.billableSf),
    [18, 13, 12, 10]
  );
  console.log("ok: 1. four independently rounded pieces total 53 billed SF");
}

// 2-4, 12-14. Material subtotal 53 × $45 = $2,385; engine never prices 59 SF;
// measured SF not double-added; displayed == priced; tax $47.70; total $2,432.70.
{
  const calc = await calculateStudioEstimate({ scope: baseScope() });
  assert.equal(calc.material.ratePerSf, 45);
  assert.equal(calc.material.countertopSqft, 53);
  assert.equal(calc.material.squareFeet, 53, "engine must not price 59 SF");
  assert.equal(calc.material.countertopSubtotal, 2385);
  assert.equal(calc.material.subtotal, 2385);
  assert.equal(calc.totals.materialCountertopSubtotal, 2385);
  // Measured SF (50.2) must not also contribute to billed scope.
  assert.equal(calc.scopeBilling.measuredCountertopSf, 50.2);
  assert.equal(calc.scopeBilling.billedCountertopSf, 53);
  // Displayed billed scope and priced billed scope must match.
  assert.equal(calc.scopeBilling.billedCountertopSf, calc.material.countertopSqft);
  // Tax and exact total for the simple fixture.
  assert.equal(calc.material.useTaxAmount, 47.7);
  assert.equal(calc.totals.exactInternalTotal, 2432.7);
  assert.equal(calc.totals.customerDisplayTotal, 2432.7);
  console.log("ok: 2-4,12-14. 53×$45=$2,385; tax $47.70; exact total $2,432.70; displayed==priced");
}

// 5. Legacy/manual room SF is ignored when approved Takeoff pieces exist.
{
  const scope = baseScope();
  scope.rooms[0].countertopSqft = 59; // stale manual SF — audit only, contributes $0
  const calc = await calculateStudioEstimate({ scope });
  assert.equal(calc.material.countertopSqft, 53);
  assert.equal(calc.material.subtotal, 2385);
  console.log("ok: 5. stale manual room SF ignored under Takeoff piece authority");
}

// 6. Backsplash SF is separately attributed — never inside Countertop subtotal.
{
  const scope = baseScope();
  scope.rooms[0].includeBacksplash = true;
  scope.rooms[0].backsplashSqft = 5.3; // bills as 6 SF (one section)
  scope.rooms[0].backsplashHeightIn = 4;
  const calc = await calculateStudioEstimate({ scope });
  assert.equal(calc.material.countertopSqft, 53, "countertop scope unchanged");
  assert.equal(calc.material.countertopSubtotal, 2385, "countertop $ unchanged");
  assert.equal(calc.material.backsplashSqft, 6);
  assert.equal(calc.material.backsplashSubtotal, 270);
  assert.equal(calc.material.subtotal, 2655);
  // The old defect: 59 SF × $45 presented as one unattributed subtotal.
  const backsplashSections = calc.material.sections.filter((s) => s.category === "backsplash");
  assert.equal(backsplashSections.length, 1);
  assert.equal(backsplashSections[0].billedSf, 6);
  const countertopSf = calc.material.sections
    .filter((s) => s.category === "countertop")
    .reduce((s, x) => s + x.billedSf + x.adjustmentSf, 0);
  assert.equal(countertopSf, 53);
  console.log("ok: 6. backsplash SF is its own category; countertop stays 53 SF / $2,385");
}

// 7. Side-splash SF is never part of the Studio countertop subtotal (side
// splash is a Digital Estimate add-on category, not Studio countertop scope).
{
  const calc = await calculateStudioEstimate({ scope: baseScope() });
  assert.equal(
    calc.material.sections.some((s) => s.category === "side_splash"),
    false
  );
  assert.equal(calc.material.countertopSubtotal, 2385);
  console.log("ok: 7. no side-splash SF inside countertop material subtotal");
}

// 8. Edge LF does not alter included-edge material subtotal.
{
  const scope = baseScope({ edgeProfileToken: "edge_eased", edgeLinearFeet: 40 });
  const calc = await calculateStudioEstimate({ scope });
  assert.equal(calc.material.subtotal, 2385);
  assert.equal(calc.fabrication.edge.amount, 0);
  assert.equal(calc.totals.exactInternalTotal, 2432.7);
  console.log("ok: 8. included-edge LF never changes the material subtotal");
}

// 9. Zero SF adjustment contributes zero.
{
  const scope = baseScope({
    countertopScopeAdjustments: [
      { id: "a0", adjustmentScope: "project", adjustmentSf: 0, adjustmentReason: "" }
    ]
  });
  const calc = await calculateStudioEstimate({ scope });
  assert.equal(calc.material.countertopSqft, 53);
  assert.equal(calc.material.subtotal, 2385);
  console.log("ok: 9. zero SF adjustment contributes zero");
}

// 10. Non-zero governed adjustment is visible and reconciles with priced scope.
{
  const scope = baseScope({
    countertopScopeAdjustments: [
      {
        id: "a6",
        adjustmentScope: "project",
        adjustmentSf: 6,
        adjustmentReason: "Waterfall panel scope added after Takeoff"
      }
    ]
  });
  const billing = buildStudioScopeBilling(scope);
  assert.equal(billing.billedCountertopSf, 59, "adjustment visible in billed summary");
  const calc = await calculateStudioEstimate({ scope });
  assert.equal(calc.material.countertopSqft, 59);
  assert.equal(calc.material.subtotal, 2655);
  assert.equal(calc.scopeBilling.billedCountertopSf, calc.material.countertopSqft);
  const adjSection = calc.material.sections.find((s) => s.sourceType === "scope_adjustment");
  assert.ok(adjSection, "adjustment appears in internal evidence");
  assert.equal(adjSection.adjustmentSf, 6);
  console.log("ok: 10. +6 SF governed adjustment visible, priced, and reconciled");
}

// 11. Hidden internal-only custom line is dollars, never SF.
{
  const scope = baseScope({
    customLineItems: [
      {
        name: "Internal disposal fee",
        quantity: 1,
        unitPrice: 270,
        customerFacing: false,
        category: "Service"
      }
    ]
  });
  const calc = await calculateStudioEstimate({ scope });
  assert.equal(calc.material.squareFeet, 53, "hidden dollars must not add SF");
  assert.equal(calc.material.subtotal, 2385);
  const hidden = calc.material.sections.find((s) => s.category === "hidden_allocation");
  assert.ok(hidden);
  assert.equal(hidden.rawSf, 0);
  assert.equal(hidden.billedSf, 0);
  assert.equal(hidden.amountCents, 27000);
  console.log("ok: 11. hidden allocation recorded as dollars with zero SF");
}

// 15. Approval is blocked when displayed and priced billed scope differ:
// duplicate room-id authority makes the calculation itself fail loudly.
{
  assert.throws(
    () => assertBilledCountertopScopeReconciles(53, 59),
    (e) => e.code === "billed_scope_mismatch" && e.statusCode === 422
  );
  const scope = baseScope();
  // Two rooms sharing one id = ambiguous duplicate scope authority.
  scope.rooms.push({
    id: "kitchen",
    name: "Kitchen copy",
    included: true,
    includeBacksplash: false,
    backsplashSqft: 0,
    pieces: [{ id: "px", name: "Dup", pieceType: "counter", sqft: 20, included: true }]
  });
  await assert.rejects(
    () => calculateStudioEstimate({ scope }),
    (e) => e.code === "billed_scope_mismatch",
    "duplicate scope authority must fail calculation (blocks approval)"
  );
  console.log("ok: 15. billed-scope mismatch fails calculation and blocks approval");
}

console.log("\nAll studioMaterialSubtotalScope tests passed.\n");
