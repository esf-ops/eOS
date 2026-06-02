/**
 * takeoffBenchmarkEvaluator — AI Takeoff benchmark evaluator (v5.7).
 *
 * Purpose:
 *   Score an AI extraction run against a sanitized benchmark truth fixture.
 *   Classify WHY a run failed so improvements can be targeted.
 *
 * Architecture rules:
 *   - Pure function: no I/O, no DB calls, no AI calls, no pricing logic.
 *   - Always scores eliteOS computed totals — never raw AI totals.
 *   - Reference totals are reconciliation evidence, not calculation authority.
 *   - If fixture expectedStatus is "review_required", evaluator never returns auto_pass.
 *   - Cutout deductions and invented backsplash on no-BS plans → fail.
 *
 * Failure categories (in priority order):
 *   1. cutout_deduction_violation   — CUTOUT_IN_EXCLUSIONS_WARNING in diagnostics
 *   2. extraction_failure           — computed CT = 0 when fixture expects > 0
 *   3. backsplash_classification_failure — invented BS on no-BS plan, or expected BS missing
 *   4. geometry_failure             — CT pct error > FAIL_CT_PCT_THRESHOLD
 *   5. reference_reconciliation_failure — REFERENCE_TOTAL_* in diagnostics
 *   6. mixed_area_scope_failure     — FHBS or high BS expected but total BS mismatched
 *   7. evidence_coverage_failure    — EVIDENCE_DIMENSION_NOT_USED in diagnostics
 *   8. review_gate_failure          — fixture requires review, nothing else wrong
 *   9. none                         — all checks pass
 *
 * Final recommendation:
 *   auto_pass      — all metrics within tolerance AND fixture expectedStatus != review_required
 *   review_required — moderate failures or fixture requires human review
 *   fail           — critical failures (cutout deduction, invented BS, CT > 10% error, extraction fail)
 */

/** CT pct error threshold for "fail" recommendation. */
const FAIL_CT_PCT_THRESHOLD = 10;

/** CT pct error threshold for "review_required" (even if within sf tolerance). */
const REVIEW_CT_PCT_THRESHOLD = 5;

/** Diagnostic codes that indicate a cutout deduction violation. */
const CUTOUT_CODES = new Set(["CUTOUT_IN_EXCLUSIONS_WARNING"]);

/** Diagnostic codes that indicate reference total mismatch. */
const REF_TOTAL_CODES = new Set([
  "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
  "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
  "REFERENCE_TOTAL_COMBINED_MISMATCH",
  "REFERENCE_TOTAL_NO_BS_CONFLICT",
]);

/** Diagnostic codes that indicate evidence coverage failure. */
const COVERAGE_CODES = new Set(["EVIDENCE_DIMENSION_NOT_USED"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pctError(computedSf, expectedSf) {
  if (expectedSf == null || expectedSf === 0) return null;
  return round2(Math.abs(computedSf - expectedSf) / expectedSf * 100);
}

/**
 * Build a single metric comparison result.
 */
function buildMetric(expectedSf, computedSf, toleranceSf) {
  if (expectedSf == null) {
    return { expectedSf: null, computedSf: round2(computedSf), deltaSf: null, errorPercent: null, pass: null };
  }
  const deltaSf     = round2(computedSf - expectedSf);
  const errorPercent = pctError(computedSf, expectedSf);
  const pass         = Math.abs(deltaSf) <= toleranceSf;
  return { expectedSf: round2(expectedSf), computedSf: round2(computedSf), deltaSf, errorPercent, pass };
}

/**
 * Extract all diagnostic codes from a validation result.
 * Accepts either the full TakeoffValidationResult or just an array of diagnostics.
 */
function extractDiagnosticCodes(validationDiagnostics) {
  if (!validationDiagnostics) return new Set();
  const arr = Array.isArray(validationDiagnostics)
    ? validationDiagnostics
    : (validationDiagnostics.diagnostics ?? []);
  return new Set(arr.map((d) => d.code).filter(Boolean));
}

/**
 * Extract all diagnostic messages matching a set of codes.
 */
function extractMessages(validationDiagnostics, codeSet) {
  if (!validationDiagnostics) return [];
  const arr = Array.isArray(validationDiagnostics)
    ? validationDiagnostics
    : (validationDiagnostics.diagnostics ?? []);
  return arr.filter((d) => codeSet.has(d.code)).map((d) => d.message);
}

/**
 * Get the expected total backsplash (standard + high + FHBS).
 */
function getTotalExpectedBsSf(benchmark) {
  return round2(
    (benchmark.expectedStandardBacksplashSf ?? benchmark.expectedBacksplashSf ?? 0) +
    (benchmark.expectedHighBacksplashSf ?? 0) +
    (benchmark.expectedFullHeightBacksplashSf ?? 0)
  );
}

/**
 * Get the expected standard backsplash (backward-compat alias).
 */
function getExpectedStdBsSf(benchmark) {
  return benchmark.expectedStandardBacksplashSf ?? benchmark.expectedBacksplashSf ?? 0;
}

/**
 * Get the CT tolerance from the fixture.
 */
function getCtTolerance(benchmark) {
  return benchmark.toleranceCountertopSf ?? benchmark.toleranceSf ?? 2;
}

/**
 * Get the BS tolerance from the fixture.
 */
function getBsTolerance(benchmark) {
  return benchmark.toleranceBacksplashSf ?? benchmark.toleranceSf ?? 1;
}

// ── Failure classification ────────────────────────────────────────────────────

/**
 * Classify the primary failure category.
 * Returns the highest-priority failure category string.
 */
function classifyFailureCategory({
  benchmark,
  computed,
  diagnosticCodes,
  ctPctError,
  ctPass,
  bsPass,
  hasMixedScope,
}) {
  // 1. Cutout deduction violation (any CUTOUT_IN_EXCLUSIONS_WARNING)
  if (diagnosticCodes.has("CUTOUT_IN_EXCLUSIONS_WARNING")) {
    return "cutout_deduction_violation";
  }

  // 2. Extraction failure (CT computed = 0 when fixture expects > 0)
  const expectedCt = benchmark.expectedCountertopSf;
  if (expectedCt != null && expectedCt > 0 && computed.countertopExactSf === 0) {
    return "extraction_failure";
  }

  // 3. Backsplash classification failure
  //    a. Invented backsplash on a no-BS plan
  if (benchmark.expectedNoBacksplash === true && computed.backsplashExactSf > 0) {
    return "backsplash_classification_failure";
  }
  //    b. Expected standard BS > 0 but computed = 0
  const expStdBs = getExpectedStdBsSf(benchmark);
  if (expStdBs > 0 && computed.backsplashExactSf === 0) {
    return "backsplash_classification_failure";
  }
  //    c. No-BS conflict in diagnostics
  if (diagnosticCodes.has("REFERENCE_TOTAL_NO_BS_CONFLICT")) {
    return "backsplash_classification_failure";
  }

  // 4. Geometry failure (CT pct error > fail threshold)
  if (ctPctError != null && ctPctError > FAIL_CT_PCT_THRESHOLD) {
    return "geometry_failure";
  }

  // 5. Reference reconciliation failure
  for (const code of REF_TOTAL_CODES) {
    if (diagnosticCodes.has(code)) return "reference_reconciliation_failure";
  }

  // 6. Mixed area scope failure (FHBS or high BS expected, but total BS mismatched)
  if (hasMixedScope && !bsPass) {
    return "mixed_area_scope_failure";
  }

  // 7. Evidence coverage failure
  if (diagnosticCodes.has("EVIDENCE_DIMENSION_NOT_USED")) {
    return "evidence_coverage_failure";
  }

  // 8. Review gate failure (fixture requires review, nothing else wrong)
  if (benchmark.expectedStatus === "review_required") {
    return "review_gate_failure";
  }

  // 9. No failure
  return "none";
}

/**
 * Determine the final recommendation.
 */
function determineFinalRecommendation({
  benchmark,
  failureCategory,
  ctPass,
  bsPass,
  ctPctError,
  hasCriticalDiagnostics,
}) {
  // Critical failures → fail
  if (
    failureCategory === "cutout_deduction_violation" ||
    failureCategory === "extraction_failure" ||
    (failureCategory === "backsplash_classification_failure" && benchmark.expectedNoBacksplash === true)
  ) {
    return "fail";
  }

  // CT pct error > fail threshold → fail
  if (ctPctError != null && ctPctError > FAIL_CT_PCT_THRESHOLD) {
    return "fail";
  }

  // Fixture requires review → at best review_required
  if (benchmark.expectedStatus === "review_required") {
    return "review_required";
  }

  // All metrics within sf tolerance AND no critical issues → auto_pass
  // Note: pct error check does not override sf tolerance — fixture tolerance takes precedence.
  if (ctPass && bsPass && !hasCriticalDiagnostics) {
    return "auto_pass";
  }

  // Everything else → review_required
  return "review_required";
}

// ── Main evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate an AI takeoff run against a sanitized benchmark truth fixture.
 *
 * IMPORTANT: always pass eliteOS computedMeasurements, NOT raw AI totals.
 * AI-provided totals are for audit only — never used for scoring.
 *
 * @param {{
 *   benchmark:             object,  — BenchmarkFixture from takeoffBenchmark.mjs
 *   computedMeasurements:  object,  — TakeoffComputedMeasurements (required)
 *   dimensionEvidence?:    object,  — DimensionEvidence (optional)
 *   validationDiagnostics?:object,  — TakeoffValidationResult or diagnostics[] (optional)
 * }} params
 * @returns {BenchmarkEvaluation}
 */
export function evaluateTakeoffBenchmark({
  benchmark,
  computedMeasurements,
  dimensionEvidence   = null,
  validationDiagnostics = null,
}) {
  const computed = computedMeasurements;

  const ctTol    = getCtTolerance(benchmark);
  const bsTol    = getBsTolerance(benchmark);
  const expCt    = benchmark.expectedCountertopSf;
  const expStdBs = getExpectedStdBsSf(benchmark);
  const expTotalBs = getTotalExpectedBsSf(benchmark);
  const expCombined = benchmark.expectedCombinedSf ??
    (expCt != null ? round2((expCt ?? 0) + expTotalBs) : null);

  const diagnosticCodes = extractDiagnosticCodes(validationDiagnostics);
  const allDiagnostics  = Array.isArray(validationDiagnostics)
    ? validationDiagnostics
    : (validationDiagnostics?.diagnostics ?? []);

  // ── Metric comparisons ─────────────────────────────────────────────────────

  const countertop = buildMetric(expCt, computed.countertopExactSf, ctTol);
  const ctPctError = countertop.errorPercent;
  const ctPass     = countertop.pass !== false; // treat null as pass (no expected value)

  // For BS: compare computed against total expected (std + high + fhbs)
  const standardBacksplash = buildMetric(expStdBs, computed.backsplashExactSf, bsTol);
  const bsPass = standardBacksplash.pass !== false;

  // Total BS metric (for mixed fixtures)
  const hasMixedScope = (benchmark.expectedHighBacksplashSf ?? 0) > 0 ||
    (benchmark.expectedFullHeightBacksplashSf ?? 0) > 0;
  const totalBacksplash = hasMixedScope
    ? buildMetric(expTotalBs, computed.backsplashExactSf, bsTol)
    : null;

  // High BS and FHBS: we can't decompose from computedMeasurements.backsplashExactSf
  // so these are informational only (null computedSf)
  const highBacksplash = benchmark.expectedHighBacksplashSf != null
    ? {
        expectedSf:   round2(benchmark.expectedHighBacksplashSf),
        computedSf:   null,  // cannot decompose from combined backsplashExactSf
        deltaSf:      null,
        errorPercent: null,
        pass:         null,
        note:         "Cannot decompose from combined backsplashExactSf — review required",
      }
    : null;

  const fullHeightBacksplash = benchmark.expectedFullHeightBacksplashSf != null
    ? {
        expectedSf:   round2(benchmark.expectedFullHeightBacksplashSf),
        computedSf:   null,  // cannot decompose from combined backsplashExactSf
        deltaSf:      null,
        errorPercent: null,
        pass:         null,
        note:         "Cannot decompose from combined backsplashExactSf — review required",
      }
    : null;

  const combined = buildMetric(expCombined, computed.combinedExactSf, ctTol);

  // ── Critical diagnostics flag ──────────────────────────────────────────────
  const hasCriticalDiagnostics =
    diagnosticCodes.has("CUTOUT_IN_EXCLUSIONS_WARNING") ||
    diagnosticCodes.has("REFERENCE_TOTAL_NO_BS_CONFLICT");

  // ── Failure classification ─────────────────────────────────────────────────

  const failureCategory = classifyFailureCategory({
    benchmark,
    computed,
    diagnosticCodes,
    ctPctError,
    ctPass,
    bsPass: hasMixedScope ? (totalBacksplash?.pass !== false) : bsPass,
    hasMixedScope,
  });

  const finalRecommendation = determineFinalRecommendation({
    benchmark,
    failureCategory,
    ctPass,
    bsPass: hasMixedScope ? (totalBacksplash?.pass !== false) : bsPass,
    ctPctError,
    hasCriticalDiagnostics,
  });

  // ── Reference totals reconciliation status ────────────────────────────────

  const expectedRefCount = (benchmark.visibleReferenceTotals ?? []).length;
  const capturedRefCount = (dimensionEvidence?.referenceTotals ?? []).length;
  const noBacksplashNotes = (dimensionEvidence?.referenceTotals ?? []).filter(
    (r) => r.noBacksplash === true
  );
  const noBacksplashCorrect =
    benchmark.expectedNoBacksplash != null
      ? benchmark.expectedNoBacksplash === (noBacksplashNotes.length > 0)
      : null;
  const refMismatchMessages = extractMessages(validationDiagnostics, REF_TOTAL_CODES);

  const referenceTotals = {
    expectedCaptured:   expectedRefCount,
    captured:           capturedRefCount,
    noBacksplashCorrect,
    mismatchWarnings:   refMismatchMessages,
  };

  // ── Evidence coverage status ───────────────────────────────────────────────

  const unusedDimCount = allDiagnostics.filter(
    (d) => COVERAGE_CODES.has(d.code)
  ).length;

  const evidenceCoverage = {
    unusedHighConfidenceDimensions: unusedDimCount,
    pass: unusedDimCount === 0,
  };

  // ── Review gate ────────────────────────────────────────────────────────────
  // Would the run have been auto_pass if the gate weren't applied?
  const wouldBeAutoPass =
    ctPass && bsPass && !hasCriticalDiagnostics &&
    (ctPctError == null || ctPctError <= REVIEW_CT_PCT_THRESHOLD);

  const reviewGate = {
    expectedReviewRequired: benchmark.expectedStatus === "review_required",
    modelAttemptedAutoPass: wouldBeAutoPass,
    pass: !(benchmark.expectedStatus === "review_required" && wouldBeAutoPass),
  };

  // ── Validator failures list ────────────────────────────────────────────────

  const validatorFailureCodes = [...CUTOUT_CODES, ...REF_TOTAL_CODES, ...COVERAGE_CODES];
  const validatorFailures = allDiagnostics
    .filter((d) => validatorFailureCodes.includes(d.code))
    .map((d) => `[${d.code}] ${d.message}`);

  // ── Evaluator notes ────────────────────────────────────────────────────────

  const notes = [];
  if (finalRecommendation === "auto_pass") {
    notes.push("All metrics within tolerance. Passes automated check.");
  }
  if (benchmark.expectedStatus === "review_required" && finalRecommendation !== "fail") {
    notes.push("Fixture requires human review regardless of computed totals.");
    for (const r of benchmark.reviewGateReasons ?? []) {
      notes.push(`  Review gate: ${r}`);
    }
  }
  if (failureCategory !== "none") {
    notes.push(`Failure category: ${failureCategory}`);
  }
  if (benchmark.knownFailureModes?.length > 0 && finalRecommendation !== "auto_pass") {
    for (const fm of benchmark.knownFailureModes) {
      notes.push(`  Known failure mode: ${fm}`);
    }
  }

  return {
    benchmarkId:         benchmark.benchmarkId,
    label:               benchmark.label,
    category:            benchmark.category ?? null,
    expectedStatus:      benchmark.expectedStatus ?? "auto_pass",
    finalRecommendation,
    failureCategory,
    countertop,
    standardBacksplash,
    ...(totalBacksplash   != null && { totalBacksplash }),
    ...(highBacksplash    != null && { highBacksplash }),
    ...(fullHeightBacksplash != null && { fullHeightBacksplash }),
    combined,
    referenceTotals,
    evidenceCoverage,
    reviewGate,
    validatorFailures,
    notes,
  };
}
