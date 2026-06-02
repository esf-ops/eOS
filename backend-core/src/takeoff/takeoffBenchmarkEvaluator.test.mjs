/**
 * takeoffBenchmarkEvaluator — unit tests.
 *
 * Run: npm run eos:test:takeoff-benchmark-evaluator
 *
 * All tests use static fixtures and mocked computed measurements.
 * No real AI calls, no DB calls, no pricing.
 *
 * Tests:
 *   1.  Simple 31/0 reference benchmark auto-passes when computed ≈32.98
 *   2.  49/no-BS fixture is NOT auto-passed when computed CT is 54 (geometry_failure / fail)
 *   3.  50/no-BS fixture returns fail when computed CT is 36 (geometry_failure, ~28% error)
 *   4.  53/6 fixture review_required with correct CT+BS (review_gate_failure)
 *   5.  53/6 fixture — backsplash_classification_failure when BS computed = 0
 *   6.  noBacksplash=true + computed BS > 0 → backsplash_classification_failure, fail
 *   7.  CT 62 + FHBS 40 fixture is review_required if fixture says review_required
 *   8.  High backsplash mixed-area fixture is review_required
 *   9.  Clean rectangle ~78 auto-passes when CT within tolerance
 *  10.  Waterfall fixture is always review_required
 *  11.  review_required fixtures never auto_pass (review_gate_failure instead)
 *  12.  CUTOUT_IN_EXCLUSIONS_WARNING causes cutout_deduction_violation, fail
 *  13.  EVIDENCE_DIMENSION_NOT_USED causes evidence_coverage_failure
 *  14.  Evaluator never touches quote data (no Supabase, no pricing keys)
 *  15.  REFERENCE_TOTAL_COUNTERTOP_MISMATCH causes reference_reconciliation_failure
 *  16.  Messy email sketch always review_required regardless of computed values
 *  17.  Multi-page cabinet packet always review_required
 */
import assert from "node:assert/strict";

import { evaluateTakeoffBenchmark } from "./takeoffBenchmarkEvaluator.mjs";
import {
  REFERENCE_BENCHMARK_001,
  REFERENCE_BENCHMARK_002,
  REFERENCE_BENCHMARK_003,
  REFERENCE_BENCHMARK_004,
  CLEAN_RECTANGLE_GEOMETRY_001,
  WATERFALL_STEPPED_SHAPE_001,
  MIXED_CT_STANDARD_BS_FHBS_001,
  HIGH_BACKSPLASH_MIXED_AREA_001,
  MESSY_EMAIL_SKETCH_001,
  MULTI_PAGE_CABINET_PACKET_001,
} from "./takeoffBenchmark.mjs";

console.log("\ntakeoffBenchmarkEvaluator — tests\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeComputed(ct, bs = 0) {
  return {
    countertopExactSf:      ct,
    backsplashExactSf:      bs,
    combinedExactSf:        ct + bs,
    chargeableCountertopSf: Math.ceil(ct),
    chargeableBacksplashSf: Math.ceil(bs),
  };
}

function makeDiagnostics(codes = []) {
  return {
    valid:         codes.length === 0,
    hasErrors:     false,
    hasWarnings:   codes.length > 0,
    diagnostics:   codes.map((code) => ({
      level:   "warning",
      code,
      message: `Mock diagnostic: ${code}`,
      field:   "mock",
    })),
    errorCount:    0,
    warningCount:  codes.length,
    infoCount:     0,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. Simple 31/0 reference benchmark auto-passes when computed ≈32.98
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_001,
    computedMeasurements: makeComputed(32.98, 0),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "auto_pass",
    "T1: 31/0 fixture with CT=32.98 should auto_pass (delta 1.98 < tolerance 2)");
  assert.equal(result.failureCategory, "none",     "T1: failureCategory should be none");
  assert.equal(result.countertop.pass, true,        "T1: countertop metric should pass");
  assert.equal(result.standardBacksplash.pass, true,"T1: BS metric should pass");
  console.log("ok: T1 — simple 31/0 fixture auto-passes with CT 32.98");
}

// 2. 49/no-BS fixture is NOT auto-passed when computed CT is 54
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_003,  // 49/no-BS, expectedStatus: auto_pass
    computedMeasurements: makeComputed(54, 0),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.notEqual(result.finalRecommendation, "auto_pass",
    "T2: 49/no-BS with CT=54 must NOT auto_pass (5 sf over tolerance)");
  assert.ok(
    result.finalRecommendation === "fail" || result.finalRecommendation === "review_required",
    "T2: recommendation must be fail or review_required"
  );
  assert.ok(result.countertop.pass === false, "T2: countertop should not pass");
  console.log("ok: T2 — 49/no-BS fixture not auto-passed when CT=54");
}

// 3. 50/no-BS fixture returns fail when computed CT is 36 (~28% error > 10% threshold)
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_004,
    computedMeasurements: makeComputed(36, 0),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "fail",
    "T3: 28% CT error should result in fail");
  assert.equal(result.failureCategory, "geometry_failure",
    "T3: failureCategory should be geometry_failure");
  assert.ok(result.countertop.errorPercent > 10,
    "T3: CT pct error should be > 10%");
  console.log("ok: T3 — 50/no-BS with CT=36 returns fail (geometry_failure)");
}

// 4. 53/6 fixture is review_required even when CT+BS are correct (review_gate_failure)
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_002,  // expectedStatus: review_required
    computedMeasurements: makeComputed(53, 6),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "review_required",
    "T4: review_required fixture never returns auto_pass");
  assert.equal(result.failureCategory, "review_gate_failure",
    "T4: failureCategory should be review_gate_failure when metrics pass but gate is set");
  assert.equal(result.reviewGate.expectedReviewRequired, true, "T4: review gate expected");
  assert.equal(result.reviewGate.pass, false, "T4: review gate fails (auto_pass blocked)");
  console.log("ok: T4 — 53/6 fixture returns review_required even when totals match");
}

// 5. 53/6 fixture — backsplash_classification_failure when BS computed = 0
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_002,
    computedMeasurements: makeComputed(54, 0),  // CT close but BS=0 (expected 6)
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.failureCategory, "backsplash_classification_failure",
    "T5: expected BS>0 but computed 0 → backsplash_classification_failure");
  assert.equal(result.standardBacksplash.computedSf, 0, "T5: computed BS is 0");
  assert.equal(result.standardBacksplash.expectedSf, 6,  "T5: expected BS is 6");
  console.log("ok: T5 — backsplash_classification_failure when expected BS>0 but computed=0");
}

// 6. noBacksplash=true + computed BS > 0 → backsplash_classification_failure, fail
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_003,  // expectedNoBacksplash: true
    computedMeasurements: makeComputed(49, 3.5),    // BS invented
    validationDiagnostics: makeDiagnostics(["REFERENCE_TOTAL_NO_BS_CONFLICT"]),
  });

  assert.equal(result.failureCategory, "backsplash_classification_failure",
    "T6: noBacksplash=true + computed BS>0 → backsplash_classification_failure");
  assert.equal(result.finalRecommendation, "fail",
    "T6: invented BS on no-BS plan → fail");
  console.log("ok: T6 — invented backsplash on no-BS plan returns fail");
}

// 7. Mixed CT + FHBS fixture is review_required when fixture expectedStatus = review_required
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            MIXED_CT_STANDARD_BS_FHBS_001,
    computedMeasurements: makeComputed(62, 51),   // CT=62, combined BS=11+40=51
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "review_required",
    "T7: FHBS fixture always review_required");
  assert.ok(result.fullHeightBacksplash != null, "T7: fullHeightBacksplash field present");
  assert.equal(result.fullHeightBacksplash.computedSf, null,
    "T7: FHBS computedSf is null (cannot decompose)");
  console.log("ok: T7 — mixed CT+FHBS fixture always returns review_required");
}

// 8. High backsplash mixed-area fixture is review_required
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            HIGH_BACKSPLASH_MIXED_AREA_001,
    computedMeasurements: makeComputed(132, 23.2),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "review_required",
    "T8: high BS mixed-area fixture always review_required");
  assert.ok(result.highBacksplash != null, "T8: highBacksplash field present");
  console.log("ok: T8 — high backsplash mixed-area fixture always review_required");
}

// 9. Clean rectangle ~78 auto-passes when CT within tolerance
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            CLEAN_RECTANGLE_GEOMETRY_001,
    computedMeasurements: makeComputed(78.03, 0),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "auto_pass",
    "T9: clean geometry ~78 within tolerance should auto_pass");
  assert.equal(result.failureCategory, "none", "T9: no failure category");
  console.log("ok: T9 — clean rectangle ~78 auto-passes within tolerance");
}

// 10. Waterfall fixture is always review_required
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            WATERFALL_STEPPED_SHAPE_001,
    computedMeasurements: makeComputed(76.3, 0),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "review_required",
    "T10: waterfall fixture always review_required");
  assert.equal(result.reviewGate.expectedReviewRequired, true,
    "T10: review gate expected for waterfall");
  console.log("ok: T10 — waterfall fixture always returns review_required");
}

// 11. review_required fixtures never auto_pass (review_gate_failure)
{
  const reviewRequiredFixtures = [
    REFERENCE_BENCHMARK_002,
    WATERFALL_STEPPED_SHAPE_001,
    MIXED_CT_STANDARD_BS_FHBS_001,
    HIGH_BACKSPLASH_MIXED_AREA_001,
    MESSY_EMAIL_SKETCH_001,
    MULTI_PAGE_CABINET_PACKET_001,
  ];

  for (const fixture of reviewRequiredFixtures) {
    // Use "perfect" computed values to see if gate is respected
    const ct = fixture.expectedCountertopSf ?? 50;
    const bs = (fixture.expectedStandardBacksplashSf ?? 0) + (fixture.expectedHighBacksplashSf ?? 0) + (fixture.expectedFullHeightBacksplashSf ?? 0);
    const result = evaluateTakeoffBenchmark({
      benchmark:            fixture,
      computedMeasurements: makeComputed(ct, bs),
      validationDiagnostics: makeDiagnostics(),
    });
    assert.notEqual(result.finalRecommendation, "auto_pass",
      `T11: review_required fixture "${fixture.benchmarkId}" must not auto_pass`);
  }
  console.log("ok: T11 — all review_required fixtures refuse auto_pass");
}

// 12. CUTOUT_IN_EXCLUSIONS_WARNING causes cutout_deduction_violation and fail
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_001,
    computedMeasurements: makeComputed(31, 0),
    validationDiagnostics: makeDiagnostics(["CUTOUT_IN_EXCLUSIONS_WARNING"]),
  });

  assert.equal(result.failureCategory, "cutout_deduction_violation",
    "T12: CUTOUT_IN_EXCLUSIONS_WARNING → cutout_deduction_violation");
  assert.equal(result.finalRecommendation, "fail",
    "T12: cutout deduction always → fail");
  assert.ok(result.validatorFailures.some((msg) => msg.includes("CUTOUT_IN_EXCLUSIONS_WARNING")),
    "T12: validatorFailures must include the cutout warning message");
  console.log("ok: T12 — cutout deduction violation returns fail");
}

// 13. EVIDENCE_DIMENSION_NOT_USED causes evidence_coverage_failure
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            CLEAN_RECTANGLE_GEOMETRY_001,
    computedMeasurements: makeComputed(78, 0),
    validationDiagnostics: makeDiagnostics(["EVIDENCE_DIMENSION_NOT_USED"]),
  });

  assert.equal(result.failureCategory, "evidence_coverage_failure",
    "T13: EVIDENCE_DIMENSION_NOT_USED → evidence_coverage_failure");
  assert.equal(result.evidenceCoverage.pass, false,
    "T13: evidenceCoverage.pass must be false");
  assert.equal(result.evidenceCoverage.unusedHighConfidenceDimensions, 1,
    "T13: one unused high-confidence dimension");
  console.log("ok: T13 — EVIDENCE_DIMENSION_NOT_USED causes evidence_coverage_failure");
}

// 14. Evaluator does not touch quote data or pricing
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_001,
    computedMeasurements: makeComputed(31, 0),
  });

  const resultStr = JSON.stringify(result);
  const forbiddenKeys = [
    "quoteId", "quote_id", "pricingRate", "countertopRate", "pricePerSf",
    "organizationId", "quote_headers", "lineItems", "markup",
  ];
  for (const key of forbiddenKeys) {
    assert.ok(!resultStr.includes(key),
      `T14: evaluator result must not contain "${key}"`);
  }
  console.log("ok: T14 — evaluator result contains no quote/pricing data");
}

// 15. REFERENCE_TOTAL_COUNTERTOP_MISMATCH causes reference_reconciliation_failure
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            REFERENCE_BENCHMARK_001,
    computedMeasurements: makeComputed(31, 0),  // metrics pass
    validationDiagnostics: makeDiagnostics(["REFERENCE_TOTAL_COUNTERTOP_MISMATCH"]),
  });

  assert.equal(result.failureCategory, "reference_reconciliation_failure",
    "T15: REFERENCE_TOTAL_COUNTERTOP_MISMATCH → reference_reconciliation_failure");
  console.log("ok: T15 — REFERENCE_TOTAL_COUNTERTOP_MISMATCH causes reference_reconciliation_failure");
}

// 16. Messy email sketch always review_required regardless of computed values
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            MESSY_EMAIL_SKETCH_001,
    computedMeasurements: makeComputed(50, 0),  // some plausible value
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "review_required",
    "T16: messy email sketch must always be review_required");
  assert.equal(result.reviewGate.expectedReviewRequired, true, "T16: review gate expected");
  console.log("ok: T16 — messy email sketch always review_required");
}

// 17. Multi-page cabinet packet always review_required
{
  const result = evaluateTakeoffBenchmark({
    benchmark:            MULTI_PAGE_CABINET_PACKET_001,
    computedMeasurements: makeComputed(80, 5),
    validationDiagnostics: makeDiagnostics(),
  });

  assert.equal(result.finalRecommendation, "review_required",
    "T17: multi-page cabinet packet must always be review_required");
  console.log("ok: T17 — multi-page cabinet packet always review_required");
}

console.log("\ntakeoffBenchmarkEvaluator: all 17 tests passed");
