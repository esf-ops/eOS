/**
 * takeoffQaGate — unit tests.
 *
 * Run: npm run eos:test:takeoff-qa-gate
 *
 * All tests are pure (no I/O, no DB, no AI, no pricing).
 *
 * Tests:
 *   1.  Clean result with reconciled reference totals → ready_for_review, green
 *   2.  Validation error → do_not_import, red
 *   3.  One unused high-confidence evidence dimension → needs_review
 *   4.  Two+ unused dimensions → do_not_import
 *   5.  Large reference CT mismatch (>10%) → do_not_import
 *   6.  Moderate CT mismatch (5-10%) → needs_review
 *   7.  No-BS conflict diagnostic → do_not_import, critical issue
 *   8.  Cutout in exclusions diagnostic → do_not_import, critical issue
 *   9.  No measurement pages in page inventory → do_not_import
 *  10.  No reference totals but clean structured runs → ready_for_review
 *  11.  Backsplash not structured → needs_review
 *  12.  Benchmark fail → do_not_import
 *  13.  Helper is pure (no Supabase/quote data in output)
 *  14.  ready_for_review summary includes computed CT/BS values
 *  15.  reviewChecklist always present
 *  16.  [v5.8.1] benchmarkContext CT 49 vs computed 80.93 → do_not_import
 *  17.  [v5.8.1] benchmarkContext CT 50 vs computed 73 → do_not_import
 *  18.  [v5.8.1] benchmarkContext CT 31 vs computed 32.98 tolerance 2 → ready_for_review
 *  19.  [v5.8.1] benchmarkEvaluation review_required → needs_review
 *  20.  [v5.8.1] no benchmarkContext preserves automatic-only behavior
 *  21.  [v5.8.1] benchmarkContext expected BS 6 vs computed 0 → do_not_import
 *  22.  [v5.8.1] benchmarkContext expected no-BS vs computed BS > 0 → do_not_import
 *  23.  [v5.8.1] benchmarkContext result contains no Supabase/quote/pricing data
 *  24.  [v5.9.2] NONSTANDARD_DEPTH_ASSUMED diagnostic → needs_review, warning severity
 *  25.  [v5.9.2] no NONSTANDARD_DEPTH_ASSUMED for standard-depth run → ready_for_review
 */
import assert from "node:assert/strict";
import { evaluateTakeoffQaGate } from "./takeoffQaGate.mjs";

console.log("\ntakeoffQaGate — tests\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeComputed(ct = 31, bs = 0) {
  return {
    countertopExactSf:      ct,
    backsplashExactSf:      bs,
    combinedExactSf:        ct + bs,
    chargeableCountertopSf: Math.ceil(ct),
    chargeableBacksplashSf: Math.ceil(bs),
  };
}

function makeValidation(codes = []) {
  const errors = codes.filter((c) => c.startsWith("VALIDATION_ERROR"));
  const warnings = codes.filter((c) => !c.startsWith("VALIDATION_ERROR"));
  const hasErrors = errors.length > 0;
  return {
    valid: !hasErrors,
    hasErrors,
    hasWarnings: warnings.length > 0,
    diagnostics: [
      ...errors.map((c) => ({ level: "error",   code: c, message: `Error: ${c}` })),
      ...warnings.map((c) => ({ level: "warning", code: c, message: `Warning: ${c}` })),
    ],
    errorCount:   errors.length,
    warningCount: warnings.length,
    infoCount:    0,
  };
}

function makeResult(numRooms = 1, numRunsPerArea = 1) {
  const rooms = Array.from({ length: numRooms }, (_, ri) => ({
    id: `r${ri}`,
    name: `Room ${ri + 1}`,
    areas: [{
      id: `a${ri}`,
      label: "Countertop",
      runs: Array.from({ length: numRunsPerArea }, (_, ki) => ({
        id: `run${ri}-${ki}`,
        label: `Run ${ki + 1}`,
        lengthIn: 72,
        depthIn: 25.5,
      })),
      backsplashLinearIn: 0,
      backsplashHeightIn: 0,
    }],
  }));
  return { schemaVersion: "1.0", status: "draft", rooms };
}

function makeEvidence(referenceTotals = [], dimensions = []) {
  return { referenceTotals, dimensions };
}

function makePageInventory(pages = [], recommendedMeasurementPages = []) {
  return { pages, recommendedMeasurementPages, pagesToIgnore: [] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. Clean result with reconciled reference totals → ready_for_review, green
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(31, 0),
    validationDiagnostics: makeValidation([]),
    dimensionEvidence:     makeEvidence(
      [{ rawText: "31 sq'", countertopSf: 31, noBacksplash: true, confidence: "high" }],
      [{ lengthIn: 72, depthIn: 50, confidence: "high" }]
    ),
  });

  assert.equal(result.status,   "ready_for_review", "T1: clean result should be ready_for_review");
  assert.equal(result.severity, "green",            "T1: severity should be green");
  assert.equal(result.topIssues.length, 0,          "T1: no issues");
  assert.ok(result.positiveSignals.length > 0,      "T1: should have positive signals");
  console.log("ok: T1 — clean result with reconciled ref totals → ready_for_review");
}

// 2. Validation error → do_not_import, red
{
  const validation = makeValidation(["VALIDATION_ERROR_SCHEMA"]);
  validation.hasErrors = true;
  validation.errorCount = 1;
  validation.diagnostics[0].level = "error";

  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(31, 0),
    validationDiagnostics: validation,
  });

  assert.equal(result.status,   "do_not_import", "T2: validation error → do_not_import");
  assert.equal(result.severity, "red",           "T2: severity should be red");
  assert.ok(
    result.topIssues.some((i) => i.code === "VALIDATION_ERRORS"),
    "T2: VALIDATION_ERRORS issue present"
  );
  console.log("ok: T2 — validation error returns do_not_import");
}

// 3. One unused high-confidence evidence dimension → needs_review
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(31, 0),
    validationDiagnostics: makeValidation(["EVIDENCE_DIMENSION_NOT_USED"]),
  });

  assert.equal(result.status,   "needs_review", "T3: one unused dim → needs_review");
  assert.ok(
    result.topIssues.some((i) => i.code === "EVIDENCE_DIM_UNUSED"),
    "T3: EVIDENCE_DIM_UNUSED issue present"
  );
  console.log("ok: T3 — one unused dimension → needs_review");
}

// 4. Two+ unused dimensions → do_not_import
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(31, 0),
    validationDiagnostics: makeValidation([
      "EVIDENCE_DIMENSION_NOT_USED",
      "EVIDENCE_DIMENSION_NOT_USED",
    ]),
  });

  assert.equal(result.status,   "do_not_import", "T4: two unused dims → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "MULTIPLE_EVIDENCE_DIMS_UNUSED"),
    "T4: MULTIPLE_EVIDENCE_DIMS_UNUSED issue present"
  );
  console.log("ok: T4 — two+ unused dimensions → do_not_import");
}

// 5. Large reference CT mismatch (>10%) → do_not_import
{
  // computed = 36, reference says 50 → 28% error
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(36, 0),
    validationDiagnostics: makeValidation(["REFERENCE_TOTAL_COUNTERTOP_MISMATCH"]),
    dimensionEvidence:     makeEvidence([
      { rawText: "50 sq'", countertopSf: 50, noBacksplash: true, confidence: "high" },
    ]),
  });

  assert.equal(result.status, "do_not_import", "T5: large CT mismatch → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "REFERENCE_TOTAL_COUNTERTOP_MISMATCH_LARGE"),
    "T5: REFERENCE_TOTAL_COUNTERTOP_MISMATCH_LARGE issue present"
  );
  console.log("ok: T5 — large CT reference mismatch (28%) → do_not_import");
}

// 6. Moderate CT mismatch (5-10%) → needs_review
{
  // computed = 47, reference says 50 → 6% error
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(47, 0),
    validationDiagnostics: makeValidation(["REFERENCE_TOTAL_COUNTERTOP_MISMATCH"]),
    dimensionEvidence:     makeEvidence([
      { rawText: "50 sq'", countertopSf: 50, noBacksplash: true, confidence: "high" },
    ]),
  });

  assert.equal(result.status, "needs_review", "T6: moderate CT mismatch → needs_review");
  assert.ok(
    result.topIssues.some((i) => i.code === "REFERENCE_TOTAL_COUNTERTOP_MISMATCH"),
    "T6: REFERENCE_TOTAL_COUNTERTOP_MISMATCH issue present"
  );
  console.log("ok: T6 — moderate CT reference mismatch (6%) → needs_review");
}

// 7. No-BS conflict diagnostic → do_not_import, critical issue
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(49, 3.5),  // BS invented
    validationDiagnostics: makeValidation(["REFERENCE_TOTAL_NO_BS_CONFLICT"]),
  });

  assert.equal(result.status, "do_not_import", "T7: no-BS conflict → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "REFERENCE_TOTAL_NO_BS_CONFLICT" && i.severity === "critical"),
    "T7: no-BS conflict is critical issue"
  );
  console.log("ok: T7 — no-BS conflict → do_not_import, critical");
}

// 8. Cutout in exclusions diagnostic → do_not_import, critical issue
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(78, 0),
    validationDiagnostics: makeValidation(["CUTOUT_IN_EXCLUSIONS_WARNING"]),
  });

  assert.equal(result.status, "do_not_import", "T8: cutout in exclusions → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "CUTOUT_IN_EXCLUSIONS_WARNING" && i.severity === "critical"),
    "T8: cutout in exclusions is critical issue"
  );
  console.log("ok: T8 — cutout in exclusions → do_not_import, critical");
}

// 9. No measurement pages in page inventory → do_not_import
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(50, 0),
    validationDiagnostics: makeValidation([]),
    pageInventory:         makePageInventory(
      [{ pageNumber: 1, classification: "cover_page" }],
      []  // no recommended measurement pages
    ),
  });

  assert.equal(result.status, "do_not_import", "T9: no measurement pages → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "NO_MEASUREMENT_PAGES"),
    "T9: NO_MEASUREMENT_PAGES issue present"
  );
  console.log("ok: T9 — no measurement pages in inventory → do_not_import");
}

// 10. No reference totals but clean structured runs → ready_for_review
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(1, 2),
    computedMeasurements:  makeComputed(50, 0),
    validationDiagnostics: makeValidation([]),
    dimensionEvidence:     null,
    pageInventory:         null,
  });

  assert.equal(result.status, "ready_for_review", "T10: no ref totals + clean runs → ready_for_review");
  console.log("ok: T10 — no reference totals but clean runs → ready_for_review");
}

// 11. Backsplash not structured → needs_review
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(53, 0),
    validationDiagnostics: makeValidation(["AI_BACKSPLASH_TOTAL_NOT_STRUCTURED"]),
  });

  assert.equal(result.status, "needs_review", "T11: BS not structured → needs_review");
  assert.ok(
    result.topIssues.some((i) => i.code === "AI_BACKSPLASH_TOTAL_NOT_STRUCTURED"),
    "T11: AI_BACKSPLASH_TOTAL_NOT_STRUCTURED issue present"
  );
  console.log("ok: T11 — backsplash not structured → needs_review");
}

// 12. Benchmark fail → do_not_import
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(36, 0),
    validationDiagnostics: makeValidation([]),
    benchmarkEvaluation:   { finalRecommendation: "fail", failureCategory: "geometry_failure" },
  });

  assert.equal(result.status, "do_not_import", "T12: benchmark fail → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "BENCHMARK_FAIL"),
    "T12: BENCHMARK_FAIL issue present"
  );
  console.log("ok: T12 — benchmark fail → do_not_import");
}

// 13. Helper is pure (no Supabase/quote data in output)
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(31, 0),
    validationDiagnostics: makeValidation([]),
  });

  const resultStr = JSON.stringify(result);
  const forbidden = ["supabase", "quoteId", "quote_id", "pricingRate", "organizationId",
                     "quote_headers", "lineItems", "markup", "pricePerSf"];
  for (const key of forbidden) {
    assert.ok(!resultStr.toLowerCase().includes(key.toLowerCase()),
      `T13: result must not contain "${key}"`);
  }
  console.log("ok: T13 — QA gate result contains no Supabase/quote/pricing data");
}

// 14. ready_for_review summary includes computed CT/BS values
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(59.96, 6.61),
    validationDiagnostics: makeValidation([]),
  });

  assert.equal(result.status, "ready_for_review", "T14: should be ready_for_review");
  assert.ok(
    result.summary.includes("59.96") && result.summary.includes("6.61"),
    "T14: summary includes computed CT and BS values"
  );
  console.log("ok: T14 — ready_for_review summary includes computed values");
}

// 15. reviewChecklist always present
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(31, 0),
    validationDiagnostics: makeValidation([]),
  });

  assert.ok(Array.isArray(result.reviewChecklist),   "T15: reviewChecklist is an array");
  assert.ok(result.reviewChecklist.length >= 4,       "T15: at least 4 checklist items");
  assert.ok(
    result.reviewChecklist.some((item) => item.toLowerCase().includes("countertop")),
    "T15: checklist includes countertop check"
  );
  console.log("ok: T15 — reviewChecklist always present with ≥4 items");
}

// 16. benchmarkContext: expected CT 49, computed 80.93 → do_not_import (v5.8.1)
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(80.93, 0),
    validationDiagnostics: makeValidation([]),
    benchmarkContext: {
      expectedCountertopSf: 49,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 1,
      source: "benchmark_preset",
    },
  });

  assert.equal(result.status, "do_not_import", "T16: expected 49, computed 80.93 → do_not_import");
  assert.equal(result.severity, "red", "T16: severity red");
  assert.ok(
    result.topIssues.some((i) => i.code === "QA_EXPECTED_COUNTERTOP_MISMATCH" && i.severity === "critical"),
    "T16: QA_EXPECTED_COUNTERTOP_MISMATCH critical issue present"
  );
  assert.ok(result.benchmarkContextActive, "T16: benchmarkContextActive = true");
  assert.ok(
    result.topIssues.find((i) => i.code === "QA_EXPECTED_COUNTERTOP_MISMATCH")?.message.includes("49.00"),
    "T16: issue message references expected value"
  );
  console.log("ok: T16 — benchmarkContext 49 expected vs 80.93 computed → do_not_import");
}

// 17. benchmarkContext: expected CT 50, computed 73 → do_not_import (v5.8.1)
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(73, 0),
    validationDiagnostics: makeValidation([]),
    benchmarkContext: {
      expectedCountertopSf: 50,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 1,
      source: "manual_qa",
    },
  });

  assert.equal(result.status, "do_not_import", "T17: expected 50, computed 73 → do_not_import");
  const issue17 = result.topIssues.find((i) => i.code === "QA_EXPECTED_COUNTERTOP_MISMATCH");
  assert.ok(issue17, "T17: QA_EXPECTED_COUNTERTOP_MISMATCH issue present");
  assert.ok(issue17.message.includes("+23.00") || issue17.message.includes("23.00"), "T17: delta in message");
  console.log("ok: T17 — benchmarkContext 50 expected vs 73 computed → do_not_import (+23 sf / 46%)");
}

// 18. benchmarkContext: expected CT 31, computed 32.98, tolerance 2 → ready_for_review (within tol)
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(32.98, 0),
    validationDiagnostics: makeValidation([]),
    benchmarkContext: {
      expectedCountertopSf: 31,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 1,
      source: "benchmark_preset",
    },
  });

  assert.equal(result.status, "ready_for_review", "T18: delta 1.98 within tol 2 → ready_for_review");
  assert.ok(
    !result.topIssues.some((i) => i.code === "QA_EXPECTED_COUNTERTOP_MISMATCH"),
    "T18: no QA_EXPECTED_COUNTERTOP_MISMATCH issue when within tolerance"
  );
  assert.ok(result.benchmarkContextActive, "T18: benchmarkContextActive = true");
  console.log("ok: T18 — benchmarkContext 31 expected vs 32.98 computed (tol 2) → ready_for_review");
}

// 19. benchmarkEvaluation review_required → needs_review (v5.8.1)
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(53, 6),
    validationDiagnostics: makeValidation([]),
    benchmarkEvaluation: { finalRecommendation: "review_required", failureCategory: "review_gate_failure" },
  });

  assert.equal(result.status, "needs_review", "T19: benchmark review_required → needs_review");
  assert.ok(
    result.topIssues.some((i) => i.code === "BENCHMARK_REVIEW_REQUIRED"),
    "T19: BENCHMARK_REVIEW_REQUIRED issue present"
  );
  console.log("ok: T19 — benchmarkEvaluation review_required → needs_review");
}

// 20. No benchmarkContext preserves existing v5.8 behavior
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(80.93, 0),  // same as T16 but no context
    validationDiagnostics: makeValidation([]),
    // no benchmarkContext
  });

  assert.equal(result.status, "ready_for_review", "T20: no benchmarkContext, clean diags → ready_for_review");
  assert.equal(result.benchmarkContextActive, false, "T20: benchmarkContextActive = false");
  console.log("ok: T20 — no benchmarkContext preserves automatic-only behavior");
}

// 21. benchmarkContext: expected BS 6, computed BS 0 → do_not_import
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(53, 0),   // BS missed
    validationDiagnostics: makeValidation([]),
    benchmarkContext: {
      expectedCountertopSf: 53,
      expectedBacksplashSf: 6,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 1,
      source: "benchmark_preset",
    },
  });

  assert.equal(result.status, "do_not_import", "T21: expected BS 6, computed 0 → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "QA_EXPECTED_BACKSPLASH_MISMATCH" && i.severity === "critical"),
    "T21: QA_EXPECTED_BACKSPLASH_MISMATCH critical present"
  );
  console.log("ok: T21 — benchmarkContext: expected BS 6 but computed 0 → do_not_import");
}

// 22. benchmarkContext: expected no-BS (0), computed BS > 0 → do_not_import
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(49, 3.5),  // BS invented
    validationDiagnostics: makeValidation([]),
    benchmarkContext: {
      expectedCountertopSf: 49,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 1,
      source: "benchmark_preset",
    },
  });

  assert.equal(result.status, "do_not_import", "T22: expected no-BS, computed BS 3.5 → do_not_import");
  assert.ok(
    result.topIssues.some((i) => i.code === "QA_EXPECTED_BACKSPLASH_MISMATCH" && i.severity === "critical"),
    "T22: QA_EXPECTED_BACKSPLASH_MISMATCH critical present"
  );
  console.log("ok: T22 — benchmarkContext: expected no-BS but computed 3.5 sf → do_not_import");
}

// 23. No quote mutation, no pricing data in benchmarkContext result
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(73, 0),
    validationDiagnostics: makeValidation([]),
    benchmarkContext: {
      expectedCountertopSf: 50,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      source: "manual_qa",
    },
  });

  const resultStr = JSON.stringify(result);
  const forbidden = ["supabase", "quoteId", "quote_id", "pricingRate", "organizationId",
                     "quote_headers", "lineItems", "markup", "pricePerSf"];
  for (const key of forbidden) {
    assert.ok(!resultStr.toLowerCase().includes(key.toLowerCase()),
      `T23: result must not contain "${key}"`);
  }
  console.log("ok: T23 — benchmarkContext result contains no Supabase/quote/pricing data");
}

// 24. NONSTANDARD_DEPTH_ASSUMED in diagnostics → needs_review (v5.9.2)
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(45, 0),
    validationDiagnostics: makeValidation(["NONSTANDARD_DEPTH_ASSUMED"]),
  });

  assert.equal(result.status, "needs_review", "T24: NONSTANDARD_DEPTH_ASSUMED → needs_review");
  assert.equal(result.severity, "yellow", "T24: severity yellow");
  const issue = result.topIssues.find((i) => i.code === "NONSTANDARD_DEPTH_ASSUMED");
  assert.ok(issue, "T24: NONSTANDARD_DEPTH_ASSUMED issue present in topIssues");
  assert.equal(issue.severity, "warning", "T24: NONSTANDARD_DEPTH_ASSUMED is a warning (not critical)");
  assert.ok(issue.message.includes("plan"), "T24: message references plan verification");
  console.log("ok: T24 — NONSTANDARD_DEPTH_ASSUMED → needs_review, warning severity");
}

// 25. No NONSTANDARD_DEPTH_ASSUMED and no other issues → ready_for_review (standard depth wall run)
{
  const result = evaluateTakeoffQaGate({
    takeoffResult:         makeResult(),
    computedMeasurements:  makeComputed(31, 0),
    validationDiagnostics: makeValidation([]),
  });

  assert.equal(result.status, "ready_for_review", "T25: no issues → ready_for_review");
  const issue = result.topIssues.find((i) => i.code === "NONSTANDARD_DEPTH_ASSUMED");
  assert.ok(!issue, "T25: no NONSTANDARD_DEPTH_ASSUMED issue for standard-depth runs");
  console.log("ok: T25 — no NONSTANDARD_DEPTH_ASSUMED for standard depth run");
}

console.log("\ntakeoffQaGate: all 25 tests passed");
