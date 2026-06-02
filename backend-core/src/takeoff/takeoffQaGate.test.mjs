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

console.log("\ntakeoffQaGate: all 15 tests passed");
