/**
 * Takeoff → Pricing Setup authority handoff regression.
 *
 * Approved Takeoff = physical-scope authority (pieces, cutouts, backsplash
 * eligibility, derived fabrication quantities). Pricing Setup = commercial
 * choices only (customer, basis, material, products, adjustments) plus a
 * read-only approved-scope summary. Manual quantity entry survives only as a
 * clearly-labeled fallback when no approved Takeoff exists — never both.
 *
 * Run: node backend-core/src/elite100EstimateStudio/takeoffToPricingSetup.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  seedScopeFromTakeoffPayload,
  TAKEOFF_DERIVED_ADDON_KEYS
} from "./studioEstimateService.mjs";
import { emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import {
  calculateStudioEstimate,
  scopeFingerprint,
  scopeToAddOns
} from "./studioEstimatePricing.mjs";
import { buildTakeoffImportPayload } from "../takeoff/takeoffImportPayload.mjs";
import { computeTakeoffMeasurements } from "../takeoff/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "../takeoff/takeoffValidator.mjs";
import { normalizeTakeoffBacksplashEligibility } from "../takeoff/takeoffBacksplashEligibility.mjs";
import { normalizeTakeoffCutoutScope } from "../takeoff/takeoffCutoutScope.mjs";
import { PROTOTYPE_ADDON_UNIT_PRICES } from "../quotes/quoteCalculator.js";

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(
  join(here, "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"),
  "utf8"
);

console.log("\ntakeoffToPricingSetup.test.mjs\n");

function approvedPayload() {
  const draft = normalizeTakeoffCutoutScope(
    normalizeTakeoffBacksplashEligibility({
      schemaVersion: "1.0",
      status: "approved",
      rooms: [
        {
          id: "room-kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          areas: [
            {
              id: "area-main",
              label: "Main",
              backsplashScope: "stone",
              runs: [
                {
                  id: "run-1",
                  label: "Sink wall",
                  lengthIn: 100,
                  depthIn: 25.5,
                  pieceType: "counter",
                  backsplashEligible: true,
                  cutouts: [{ type: "kitchen_sink", quantity: 1, source: "estimator_confirmed" }]
                },
                {
                  id: "run-2",
                  label: "Stove wall",
                  lengthIn: 80,
                  depthIn: 25.5,
                  pieceType: "counter",
                  backsplashEligible: true,
                  cutouts: [
                    { type: "cooktop", quantity: 1, source: "estimator_confirmed" },
                    { type: "electrical_outlet", quantity: 2, source: "estimator_confirmed" }
                  ]
                },
                {
                  id: "run-3",
                  label: "Island",
                  lengthIn: 72,
                  depthIn: 40,
                  pieceType: "counter",
                  backsplashEligible: false,
                  cutouts: []
                }
              ]
            }
          ]
        }
      ]
    }).takeoff
  ).takeoff;
  const computed = computeTakeoffMeasurements(draft);
  return buildTakeoffImportPayload({
    takeoffJobId: "job-pricing-setup",
    takeoffResultId: "result-pricing-setup",
    takeoffResult: draft,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { "room-kitchen": true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed,
    validation: validateTakeoffResult(draft, computed),
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
}

// ── 24. approved Takeoff produces scope summary ───────────────────────────────
{
  const payload = approvedPayload();
  const scope = seedScopeFromTakeoffPayload(payload, null);
  assert.equal(scope.physicalScopeSource, "takeoff", "24: takeoff authority marker");
  assert.ok(scope.takeoffScopeSummary, "24: summary attached");
  assert.equal(scope.takeoffScopeSummary.pieceCount, 3);
  assert.equal(scope.takeoffScopeSummary.kitchenSinkCutouts, 1);
  assert.equal(scope.takeoffScopeSummary.cooktopCutouts, 1);
  assert.equal(scope.takeoffScopeSummary.electricalOutletCutouts, 2);
  assert.equal(scope.takeoffScopeSummary.backsplashEligibleRunCount, 2);
  assert.equal(scope.takeoffScopeSummary.eligibleBacksplashLengthIn, 180);
  console.log("  ✓ 24. approved Takeoff produces scope summary");
}

// ── 25. approved cutouts map to governed quantities ───────────────────────────
{
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), null);
  assert.equal(scope.addOns["qty-sink"], 1, "25: kitchen sink cutout");
  assert.equal(scope.addOns["qty-cook"], 1, "25: cooktop cutout");
  assert.equal(scope.addOns["qty-outlet"], 2, "25: electrical outlets");
  assert.equal(scope.addOns["qty-bar"], 0, "25: no vanity/bar cutout");
  assert.deepEqual(
    [...TAKEOFF_DERIVED_ADDON_KEYS],
    ["qty-sink", "qty-bar", "qty-cook", "qty-outlet"],
    "25: derived keys are the governed cutout add-ons"
  );
  console.log("  ✓ 25. approved cutouts map to governed quantities");
}

// ── 26. approved backsplash runs map downstream ───────────────────────────────
{
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), null);
  const kitchen = scope.rooms[0];
  assert.equal(kitchen.includeBacksplash, true, "26: eligible runs → include");
  assert.equal(kitchen.backsplashMeasuredLengthIn, 180, "26: eligible length only (100+80)");
  assert.equal(kitchen.eligibleRunCount, 2, "26: eligible run count");
  console.log("  ✓ 26. approved backsplash runs map downstream");
}

// ── 27. manual quantity fields are hidden when Takeoff exists ─────────────────
{
  assert.ok(panel.includes("B. Pricing Setup"), "27: panel renamed to Pricing Setup");
  assert.ok(
    panel.includes('scope.physicalScopeSource === "takeoff"'),
    "27: authority derived from seeded scope"
  );
  // Manual cutout grid renders only in the fallback branch.
  const authIdx = panel.indexOf("takeoffAuthority ? (");
  assert.ok(authIdx > 0, "27: conditional rendering by authority");
  assert.ok(panel.includes('data-testid="eq-derived-cutouts-note"'), "27: derived note shown");
  assert.ok(panel.includes('data-testid="eq-manual-cutout-grid"'), "27: manual grid exists");
  const noteIdx = panel.indexOf('data-testid="eq-derived-cutouts-note"');
  const gridIdx = panel.indexOf('data-testid="eq-manual-cutout-grid"');
  const between = panel.slice(noteIdx, gridIdx);
  assert.ok(between.includes(") : ("), "27: note and manual grid are exclusive branches");
  assert.ok(panel.includes('data-testid="eq-approved-scope-summary"'), "27: read-only summary");
  console.log("  ✓ 27. manual quantity fields are hidden when Takeoff exists");
}

// ── 28. manual fallback works without Takeoff ─────────────────────────────────
{
  const manual = emptyStudioEstimateScope();
  assert.notEqual(manual.physicalScopeSource, "takeoff", "28: no authority marker");
  manual.addOns = { "qty-sink": 2, tearout: 1 };
  assert.deepEqual(scopeToAddOns(manual), { "qty-sink": 2, tearout: 1 });
  assert.ok(panel.includes("Manual physical scope"), "28: labeled manual fallback");
  assert.ok(
    panel.includes('data-testid="eq-manual-scope-label"'),
    "28: manual label testid present"
  );
  console.log("  ✓ 28. manual fallback works without Takeoff");
}

// ── 29. Takeoff and manual paths never both charge ────────────────────────────
{
  // A stale manual quantity in baseScope is overwritten by Takeoff authority,
  // including back to zero, so an opening can never charge twice.
  const base = { ...emptyStudioEstimateScope(), addOns: { "qty-sink": 5, "qty-bar": 3, tearout: 1 } };
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), base);
  assert.equal(scope.addOns["qty-sink"], 1, "29: takeoff wins over stale manual sink qty");
  assert.equal(scope.addOns["qty-bar"], 0, "29: stale manual vanity qty zeroed");
  assert.equal(scope.addOns.tearout, 1, "29: non-cutout services preserved");
  // Charged exactly once through the single scope.addOns path.
  assert.deepEqual(scopeToAddOns(scope), { "qty-sink": 1, "qty-cook": 1, "qty-outlet": 2, tearout: 1 });
  console.log("  ✓ 29. Takeoff and manual paths never both charge");
}

// ── 30. geometry-derived Edge LF is read-only ─────────────────────────────────
{
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), null);
  assert.ok(scope.edgeEligibleLinearFeet > 0, "30: derived edge LF seeded");
  assert.equal(
    scope.edgeEligibleLinearFeet,
    scope.takeoffScopeSummary.edgeEligibleLinearFeet,
    "30: matches summary"
  );
  // Canonical edge model: the derived open-edge LF and the final priced LF are
  // read-only displays; the estimator only enters a governed ± adjustment.
  assert.ok(panel.includes('data-testid="eq-edge-derived-lf"'), "30: derived edge LF display");
  assert.ok(panel.includes('data-testid="eq-edge-final-lf"'), "30: final priced edge display");
  const idx = panel.indexOf('data-testid="eq-edge-derived-lf"');
  const block = panel.slice(idx - 600, idx + 100);
  assert.ok(block.includes("readOnly"), "30: readOnly attr");
  assert.ok(!panel.includes("W edge"), "30: legacy W edge option removed");
  console.log("  ✓ 30. geometry-derived Edge LF is read-only");
}

// ── 31. pricing basis remains editable ────────────────────────────────────────
{
  const base = { ...emptyStudioEstimateScope(), pricingBasis: "direct" };
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), base);
  assert.equal(scope.pricingBasis, "direct", "31: preserved basis");
  const idx = panel.indexOf('data-testid="eq-pricing-basis"');
  const block = panel.slice(idx - 900, idx + 100);
  assert.ok(block.includes("disabled={blocked}"), "31: only blocked gate, not takeoffAuthority");
  assert.ok(!block.includes("takeoffAuthority"), "31: basis not locked by takeoff");
  console.log("  ✓ 31. pricing basis remains editable");
}

// ── 32. material selection remains editable ───────────────────────────────────
{
  const base = { ...emptyStudioEstimateScope(), materialGroup: "Group C", colorName: "Calacatta" };
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), base);
  assert.equal(scope.materialGroup, "Group C", "32: preserved material group");
  assert.equal(scope.colorName, "Calacatta", "32: preserved color");
  const idx = panel.indexOf("Material group");
  const block = panel.slice(idx, idx + 700);
  assert.ok(block.includes("disabled={blocked}"), "32: material editable outside blocked");
  assert.ok(!block.includes("takeoffAuthority"), "32: material not locked by takeoff");
  console.log("  ✓ 32. material selection remains editable");
}

// ── 33. products remain configurable (via governed catalogs + services) ───────
{
  // Generic sink quantity fields are retired — customers resolve exact products
  // through the catalog permissions section; tear-out stays a service preset.
  assert.ok(panel.includes('data-testid="eq-catalog-permissions"'), "33: catalog permissions present");
  assert.ok(panel.includes('data-testid="eq-service-grid"'), "33: services grid present");
  assert.ok(panel.includes('"tearout"'), "33: tearout configurable");
  assert.ok(!panel.includes("ESF stainless kitchen sink"), "33: generic sink qty field removed");
  // Backend still honors legacy saved quantities so older estimates keep totals.
  assert.ok(panel.includes("eq-legacy-product-qty-warning"), "33: legacy qty surfaced as warning");
  console.log("  ✓ 33. products remain configurable");
}

// ── 34. custom lines remain supported ─────────────────────────────────────────
{
  const base = {
    ...emptyStudioEstimateScope(),
    customLineItems: [{ id: "cli-1", name: "Job-site trip", quantity: 1, unitPrice: 150, customerFacing: true }]
  };
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), base);
  assert.equal(scope.customLineItems.length, 1, "34: custom lines preserved through seed");
  assert.ok(panel.includes('data-testid="eq-custom-line-add"'), "34: add custom line control");
  console.log("  ✓ 34. custom lines remain supported");
}

// ── 35. estimate total remains backend-authoritative ──────────────────────────
{
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), null);
  scope.customerName = "Test";
  const calc = await calculateStudioEstimate({ scope });
  const expectedFabrication =
    PROTOTYPE_ADDON_UNIT_PRICES["qty-sink"].price * 1 +
    PROTOTYPE_ADDON_UNIT_PRICES["qty-cook"].price * 1 +
    PROTOTYPE_ADDON_UNIT_PRICES["qty-outlet"].price * 2;
  assert.equal(
    calc.totals.fabricationSubtotal,
    expectedFabrication,
    "35: derived quantities priced once by backend rates"
  );
  assert.ok(calc.totals.exactInternalTotal > 0, "35: backend total computed");
  // Frontend never computes cutout dollars.
  assert.ok(!panel.includes("PROTOTYPE_ADDON_UNIT_PRICES"), "35: no rate table in panel");
  assert.ok(!panel.includes("* 200"), "35: no hardcoded cutout math in panel");
  console.log("  ✓ 35. estimate total remains backend-authoritative");
}

// ── 36. existing quote snapshots remain unchanged ─────────────────────────────
{
  // New scope fields are additive — every legacy scope key survives, and
  // fingerprinting still works for scopes with and without the new fields.
  const legacyKeys = Object.keys(emptyStudioEstimateScope());
  const seeded = seedScopeFromTakeoffPayload(approvedPayload(), null);
  for (const key of legacyKeys) {
    assert.ok(key in seeded, `36: legacy scope key ${key} preserved`);
  }
  const fpLegacy = scopeFingerprint(emptyStudioEstimateScope());
  const fpSeeded = scopeFingerprint(seeded);
  assert.ok(fpLegacy && fpSeeded, "36: fingerprints computable for both shapes");
  console.log("  ✓ 36. existing quote snapshots remain unchanged (additive fields)");
}

// ── 37. Digital Estimate publication still works (calc contract intact) ───────
{
  const scope = seedScopeFromTakeoffPayload(approvedPayload(), null);
  scope.customerName = "Publish Test";
  const calc = await calculateStudioEstimate({ scope });
  // Publication adapter consumes these calc fields — assert the contract holds
  // for a scope carrying the new physical-scope fields.
  assert.ok(calc.totals.exactInternalTotal > 0, "37: totals present");
  assert.ok(calc.material, "37: material block present");
  assert.ok(calc.fabrication, "37: fabrication block present");
  assert.ok(Array.isArray(calc.warnings), "37: warnings array present");
  console.log("  ✓ 37. Digital Estimate publication calc contract intact");
}

console.log("\ntakeoffToPricingSetup.test.mjs — passed\n");
