/**
 * takeoffQaGate — automatic QA gate for AI takeoff results (v5.8 / v5.8.1).
 *
 * Pure function: no I/O, no DB calls, no AI calls, no pricing logic.
 * Safe to import in both Node.js (backend) and browser (frontend via @takeoff-core alias).
 *
 * Status levels (best → worst):
 *   ready_for_review — no critical issues; estimator can review and approve
 *   needs_review     — issues found; estimator review required before use
 *   do_not_import    — critical issues; result likely incomplete or has conflicting data
 *
 * v5.8.1: benchmarkContext param.
 *   When a benchmark preset or manual expected values are provided, the QA gate uses
 *   those expected values as authoritative ground truth. If the computed CT/BS diverges
 *   from the expected values beyond tolerance, the gate escalates accordingly —
 *   even if no diagnostic codes were fired (e.g. when referenceTotals[] are absent).
 *
 *   Tolerance check is authoritative: if absDelta <= toleranceCountertopSf, the CT
 *   benchmark check passes regardless of percent error.
 *
 *   Escalation for CT mismatch beyond tolerance:
 *     - pctError > 10% OR absDelta >= 10 sf → critical → do_not_import
 *     - any other delta > tolerance         → warning  → needs_review
 *
 * Import to Internal Estimate is always blocked in v5.8 regardless of QA status.
 * The best possible status is "ready_for_review" — not "approved" or "importable."
 * AI output is evidence, not authority.
 *
 * @module takeoffQaGate
 */

// ── Thresholds ────────────────────────────────────────────────────────────────

/** CT pct error vs reference total → critical issue (do_not_import). */
const CT_MISMATCH_CRITICAL_PCT = 10;

/** CT pct error vs reference total → warning issue (needs_review). */
const CT_MISMATCH_WARN_PCT = 5;

/** Number of unused high-confidence dimensions → critical. */
const UNUSED_DIMENSIONS_CRITICAL = 2;

// ── Diagnostic code sets ──────────────────────────────────────────────────────

const REF_TOTAL_CODES = new Set([
  "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
  "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
  "REFERENCE_TOTAL_COMBINED_MISMATCH",
  "REFERENCE_TOTAL_NO_BS_CONFLICT",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Count total runs across all rooms/areas.
 */
function countTotalRuns(takeoffResult) {
  let total = 0;
  for (const room of takeoffResult?.rooms ?? []) {
    for (const area of room?.areas ?? []) {
      total += area?.runs?.length ?? 0;
    }
  }
  return total;
}

/**
 * Compute the maximum pct error between computed CT and any reference total.
 * Returns null if no applicable reference totals exist.
 */
function computeMaxCtMismatchPct(computed, dimensionEvidence) {
  const refs = dimensionEvidence?.referenceTotals?.filter(
    (r) => r.countertopSf != null && r.countertopSf > 0
  ) ?? [];
  if (refs.length === 0) return null;
  let max = 0;
  for (const ref of refs) {
    const pct = Math.abs(computed.countertopExactSf - ref.countertopSf) / ref.countertopSf * 100;
    if (pct > max) max = pct;
  }
  return round2(max);
}

/**
 * Count occurrences of a specific diagnostic code.
 */
function countCode(diagnostics, code) {
  return diagnostics.filter((d) => d.code === code).length;
}

/**
 * Check if diagnostics include a specific code.
 */
function hasCode(diagnostics, code) {
  return diagnostics.some((d) => d.code === code);
}

// ── Issue builders ────────────────────────────────────────────────────────────

function issue(code, label, severity, message, recommendedAction, source) {
  return { code, label, severity, message, recommendedAction, source };
}

// ── Main evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate an AI takeoff result through the automatic QA gate.
 *
 * @param {{
 *   takeoffResult:         object,   — TakeoffResult (required)
 *   computedMeasurements:  object,   — TakeoffComputedMeasurements (required)
 *   validationDiagnostics: object,   — TakeoffValidationResult (required)
 *   dimensionEvidence?:    object,   — DimensionEvidence (optional)
 *   pageInventory?:        object,   — PageInventory (optional)
 *   benchmarkEvaluation?:  object,   — BenchmarkEvaluation from evaluateTakeoffBenchmark (optional)
 *   benchmarkContext?: {{             — Manual/preset expected values (optional, v5.8.1)
 *     expectedCountertopSf?: number,
 *     expectedBacksplashSf?: number,
 *     toleranceCountertopSf?: number,
 *     toleranceBacksplashSf?: number,
 *     source?: "benchmark_preset" | "manual_qa" | "visible_reference",
 *     label?: string,
 *   }}
 * }} params
 *
 * @returns {{
 *   status:                "ready_for_review" | "needs_review" | "do_not_import",
 *   severity:              "green" | "yellow" | "red",
 *   headline:              string,
 *   summary:               string,
 *   topIssues:             Array<{ code, label, severity, message, recommendedAction, source }>,
 *   positiveSignals:       string[],
 *   reviewChecklist:       string[],
 *   importBlockedReason:   string | null,
 *   benchmarkContextActive: boolean,
 * }}
 */
export function evaluateTakeoffQaGate({
  takeoffResult,
  computedMeasurements,
  validationDiagnostics,
  dimensionEvidence   = null,
  pageInventory       = null,
  benchmarkEvaluation = null,
  benchmarkContext    = null,
}) {
  const computed    = computedMeasurements;
  const diagnostics = validationDiagnostics?.diagnostics ?? [];
  const allIssues   = [];

  // ── 1. Validation errors ──────────────────────────────────────────────────

  if (validationDiagnostics?.hasErrors) {
    const errorCount = validationDiagnostics.errorCount ?? 1;
    allIssues.push(issue(
      "VALIDATION_ERRORS",
      "Validation errors present",
      "critical",
      `${errorCount} validation error${errorCount !== 1 ? "s" : ""} found — the takeoff structure has issues that must be resolved.`,
      "Review the Validation diagnostics section and correct structural issues before using this takeoff.",
      "validator"
    ));
  }

  // ── 2. Extraction failure (no CT computed) ────────────────────────────────

  const totalRuns = countTotalRuns(takeoffResult);
  if (computed.countertopExactSf === 0 && (totalRuns > 0 || (takeoffResult?.rooms?.length ?? 0) === 0)) {
    allIssues.push(issue(
      "EXTRACTION_FAILURE",
      "No countertop area computed",
      "critical",
      "eliteOS computed 0.00 sf countertop. The AI may have failed to extract any countertop pieces.",
      "Regenerate the AI draft. If the issue persists, check that the uploaded file contains a readable measurement plan.",
      "validator"
    ));
  }

  // ── 3. No rooms/runs at all ───────────────────────────────────────────────

  if ((takeoffResult?.rooms?.length ?? 0) === 0) {
    allIssues.push(issue(
      "NO_ROOMS_EXTRACTED",
      "No countertop pieces extracted",
      "critical",
      "The AI did not extract any rooms or countertop pieces from this plan.",
      "Regenerate the AI draft. If the issue persists, verify the plan file is readable and contains measurement data.",
      "validator"
    ));
  }

  // ── 4. Cutout in exclusions ───────────────────────────────────────────────

  if (hasCode(diagnostics, "CUTOUT_IN_EXCLUSIONS_WARNING")) {
    allIssues.push(issue(
      "CUTOUT_IN_EXCLUSIONS_WARNING",
      "Cutout appears in exclusions (reduces material sf)",
      "critical",
      "A sink, cooktop, or faucet cutout was placed in the material exclusions list, which would reduce countertop sf. Cutouts are notes/add-ons — they do not reduce material.",
      "Remove the cutout from exclusions and add it as a fabrication note or add-on instead.",
      "validator"
    ));
  }

  // ── 5. Multiple unused high-confidence evidence dimensions ────────────────

  const unusedDimCount = countCode(diagnostics, "EVIDENCE_DIMENSION_NOT_USED");
  if (unusedDimCount >= UNUSED_DIMENSIONS_CRITICAL) {
    allIssues.push(issue(
      "MULTIPLE_EVIDENCE_DIMS_UNUSED",
      `${unusedDimCount} high-confidence dimensions not used`,
      "critical",
      `${unusedDimCount} high-confidence dimensions from the evidence pass were not captured in the final takeoff. This suggests the AI missed pieces.`,
      "Review the Dimension evidence section. Identify which dimensions are missing and regenerate the draft.",
      "evidence"
    ));
  } else if (unusedDimCount === 1) {
    allIssues.push(issue(
      "EVIDENCE_DIM_UNUSED",
      "One high-confidence dimension not used",
      "warning",
      "A high-confidence dimension from the evidence pass was not captured in the final takeoff. A piece may be missing.",
      "Review the Dimension evidence section and confirm all countertop pieces are captured.",
      "evidence"
    ));
  }

  // ── 6. Reference total countertop mismatch ────────────────────────────────

  if (hasCode(diagnostics, "REFERENCE_TOTAL_COUNTERTOP_MISMATCH")) {
    const maxPct = computeMaxCtMismatchPct(computed, dimensionEvidence);
    const deltaSf = dimensionEvidence?.referenceTotals?.reduce((max, ref) => {
      if (!ref.countertopSf) return max;
      const d = Math.abs(computed.countertopExactSf - ref.countertopSf);
      return d > max ? d : max;
    }, 0) ?? 0;

    if (maxPct != null && maxPct > CT_MISMATCH_CRITICAL_PCT) {
      allIssues.push(issue(
        "REFERENCE_TOTAL_COUNTERTOP_MISMATCH_LARGE",
        "Large countertop reference total mismatch",
        "critical",
        `eliteOS computed ${computed.countertopExactSf.toFixed(2)} sf but reference total shows ~${round2(deltaSf + computed.countertopExactSf)} sf — a ${maxPct.toFixed(1)}% discrepancy. The AI likely missed pieces.`,
        "Regenerate the AI draft or manually add missing countertop pieces. Verify all labeled dimensions are captured.",
        "reference_total"
      ));
    } else {
      allIssues.push(issue(
        "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
        "Countertop reference total mismatch",
        "warning",
        `eliteOS computed countertop sf does not match the visible reference total on the plan${maxPct != null ? ` (${maxPct.toFixed(1)}% difference)` : ""}.`,
        "Verify the computed countertop total reconciles with the written reference on the plan. Estimator must approve.",
        "reference_total"
      ));
    }
  }

  // ── 7. No-backsplash conflict ─────────────────────────────────────────────

  if (hasCode(diagnostics, "REFERENCE_TOTAL_NO_BS_CONFLICT")) {
    allIssues.push(issue(
      "REFERENCE_TOTAL_NO_BS_CONFLICT",
      "No-backsplash conflict",
      "critical",
      `The plan indicates no backsplash but eliteOS computed ${computed.backsplashExactSf.toFixed(2)} sf backsplash. The AI invented backsplash that does not exist on the plan.`,
      "Remove the backsplash entries from the takeoff. The plan explicitly states no stone backsplash.",
      "reference_total"
    ));
  }

  // ── 8. Backsplash reference total mismatch ────────────────────────────────

  if (hasCode(diagnostics, "REFERENCE_TOTAL_BACKSPLASH_MISMATCH")) {
    allIssues.push(issue(
      "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
      "Backsplash reference total mismatch",
      "warning",
      "eliteOS computed backsplash sf does not match the visible backsplash reference on the plan.",
      "Verify backsplash linear inches and height match the plan. Estimator must confirm the backsplash scope.",
      "reference_total"
    ));
  }

  // ── 9. Page inventory — no measurement pages ──────────────────────────────

  if (
    pageInventory != null &&
    Array.isArray(pageInventory.pages) &&
    pageInventory.pages.length > 0 &&
    (pageInventory.recommendedMeasurementPages?.length ?? 0) === 0
  ) {
    allIssues.push(issue(
      "NO_MEASUREMENT_PAGES",
      "No measurement pages found",
      "critical",
      `The page inventory found ${pageInventory.pages.length} page${pageInventory.pages.length !== 1 ? "s" : ""} but identified no measurement pages. The AI may have extracted from non-measurement content.`,
      "Verify the uploaded file contains readable measurement plans. Check the Page inventory section for page classifications.",
      "page_inventory"
    ));
  }

  // ── 10. Backsplash not structured ─────────────────────────────────────────

  if (hasCode(diagnostics, "AI_BACKSPLASH_TOTAL_NOT_STRUCTURED")) {
    allIssues.push(issue(
      "AI_BACKSPLASH_TOTAL_NOT_STRUCTURED",
      "Backsplash not fully structured",
      "warning",
      "The AI provided a backsplash total but did not supply structured linear inches and height. eliteOS computed backsplash as 0 sf.",
      "Add backsplash linear inches and height manually in the review section, or regenerate the draft.",
      "validator"
    ));
  }

  // ── 10b. Nonstandard depth assumed (v5.9.2) ───────────────────────────────
  // Fires whenever the validator detected an island/peninsula/bar/desk/waterfall
  // run with a depth over 26" — meaning the depth wasn't clearly standard (25.5")
  // and must be verified against visible plan dimensions.

  const nonstandardDepthCount = countCode(diagnostics, "NONSTANDARD_DEPTH_ASSUMED");
  if (nonstandardDepthCount > 0) {
    allIssues.push(issue(
      "NONSTANDARD_DEPTH_ASSUMED",
      `Nonstandard depth${nonstandardDepthCount > 1 ? "s" : ""} — plan verification required`,
      "warning",
      `${nonstandardDepthCount} run${nonstandardDepthCount !== 1 ? "s" : ""} (island, peninsula, raised bar, desk, or waterfall) ` +
      `${nonstandardDepthCount === 1 ? "has" : "have"} a depth over 26". ` +
      `Nonstandard depths must come from visible plan dimensions, not assumptions.`,
      "Verify each flagged depth is clearly shown on the uploaded plan. " +
      "If the depth is unclear, the piece must be re-measured before this takeoff can be used.",
      "validator"
    ));
  }

  // ── 11. Benchmark evaluator result ───────────────────────────────────────

  if (benchmarkEvaluation?.finalRecommendation === "fail") {
    allIssues.push(issue(
      "BENCHMARK_FAIL",
      `Benchmark evaluation failed (${benchmarkEvaluation.failureCategory ?? "unknown"})`,
      "critical",
      `This run was evaluated against a known benchmark fixture and returned a "fail" recommendation. Failure category: ${benchmarkEvaluation.failureCategory ?? "unknown"}.`,
      "Review the Benchmark / QA evaluation section for details on the failure.",
      "benchmark"
    ));
  } else if (benchmarkEvaluation?.finalRecommendation === "review_required") {
    allIssues.push(issue(
      "BENCHMARK_REVIEW_REQUIRED",
      `Benchmark review required (${benchmarkEvaluation.failureCategory ?? "fixture policy"})`,
      "warning",
      `This benchmark fixture requires estimator review — it cannot auto-pass. Failure category: ${benchmarkEvaluation.failureCategory ?? "review_gate_failure"}.`,
      "Review the Benchmark / QA evaluation section. Verify the takeoff manually against the plan.",
      "benchmark"
    ));
  }

  // ── 12. Benchmark / manual expected value context (v5.8.1) ───────────────
  // When a benchmark preset or manual target is active, compare computed
  // CT and BS against the expected values. This catches cases where
  // referenceTotals[] were not extracted and no diagnostic codes fired.

  const hasBenchmarkContext = benchmarkContext != null;

  if (hasBenchmarkContext) {
    const expCt  = benchmarkContext.expectedCountertopSf;
    const expBs  = benchmarkContext.expectedBacksplashSf;
    const ctTol  = benchmarkContext.toleranceCountertopSf  ?? 2;
    const bsTol  = benchmarkContext.toleranceBacksplashSf  ?? 1;

    // ── CT check ─────────────────────────────────────────────────────────
    if (expCt != null && expCt > 0) {
      const ctDelta    = computed.countertopExactSf - expCt;
      const ctAbsDelta = Math.abs(ctDelta);
      if (ctAbsDelta > ctTol) {
        const ctPct    = round2(ctAbsDelta / expCt * 100);
        const sign     = ctDelta > 0 ? "+" : "";
        const isCrit   = ctPct > CT_MISMATCH_CRITICAL_PCT || ctAbsDelta >= 10;
        allIssues.push(issue(
          "QA_EXPECTED_COUNTERTOP_MISMATCH",
          "Computed countertop does not match benchmark target",
          isCrit ? "critical" : "warning",
          `Expected ${expCt.toFixed(2)} sf countertop, computed ${computed.countertopExactSf.toFixed(2)} sf (${sign}${ctDelta.toFixed(2)} sf / ${sign}${ctPct.toFixed(1)}%).`,
          "Review missing or extra countertop pieces before saving. Check each run for incorrect dimensions.",
          "benchmark"
        ));
      }
    }

    // ── BS check ─────────────────────────────────────────────────────────
    if (expBs != null) {
      const computedBs = computed.backsplashExactSf;
      if (expBs === 0 && computedBs > 0) {
        // Plan says no backsplash but AI computed one.
        allIssues.push(issue(
          "QA_EXPECTED_BACKSPLASH_MISMATCH",
          "Backsplash computed but benchmark expects none",
          "critical",
          `Benchmark target expects 0.00 sf backsplash but eliteOS computed ${computedBs.toFixed(2)} sf. The AI may have invented backsplash that does not exist.`,
          "Remove all backsplash entries. The plan or benchmark indicates no stone backsplash.",
          "benchmark"
        ));
      } else if (expBs > 0) {
        const bsDelta    = computedBs - expBs;
        const bsAbsDelta = Math.abs(bsDelta);
        if (bsAbsDelta > bsTol) {
          const bsPct  = round2(bsAbsDelta / expBs * 100);
          const sign   = bsDelta > 0 ? "+" : "";
          const isCrit = computedBs === 0 || bsPct > 20 || bsAbsDelta >= 5;
          allIssues.push(issue(
            "QA_EXPECTED_BACKSPLASH_MISMATCH",
            "Computed backsplash does not match benchmark target",
            isCrit ? "critical" : "warning",
            computedBs === 0
              ? `Expected ${expBs.toFixed(2)} sf backsplash but eliteOS computed 0.00 sf. Backsplash may be missing or unstructured.`
              : `Expected ${expBs.toFixed(2)} sf backsplash, computed ${computedBs.toFixed(2)} sf (${sign}${bsDelta.toFixed(2)} sf / ${sign}${bsPct.toFixed(1)}%).`,
            "Verify backsplash linear inches and height are correctly structured in all areas.",
            "benchmark"
          ));
        }
      }
    }
  }

  // ── Determine status ──────────────────────────────────────────────────────

  const criticalIssues = allIssues.filter((i) => i.severity === "critical");
  const warningIssues  = allIssues.filter((i) => i.severity === "warning");

  let status;
  if (criticalIssues.length > 0) {
    status = "do_not_import";
  } else if (warningIssues.length > 0) {
    status = "needs_review";
  } else {
    status = "ready_for_review";
  }

  const severity = status === "do_not_import" ? "red"
    : status === "needs_review" ? "yellow"
    : "green";

  // ── Top issues (show critical first, then warnings, max 5) ────────────────

  const topIssues = [
    ...criticalIssues.slice(0, 3),
    ...warningIssues.slice(0, 3 - Math.min(criticalIssues.length, 3)),
  ].slice(0, 5);

  // ── Positive signals ──────────────────────────────────────────────────────

  const positiveSignals = [];

  if (!validationDiagnostics?.hasErrors) {
    positiveSignals.push("No validation errors");
  }

  if (totalRuns > 0 && computed.countertopExactSf > 0) {
    positiveSignals.push(
      `${totalRuns} countertop piece${totalRuns !== 1 ? "s" : ""} captured · ${computed.countertopExactSf.toFixed(2)} sf computed`
    );
  }

  const hasRefTotals = (dimensionEvidence?.referenceTotals?.length ?? 0) > 0;
  const hasRefMismatch = [
    "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
    "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
    "REFERENCE_TOTAL_COMBINED_MISMATCH",
    "REFERENCE_TOTAL_NO_BS_CONFLICT",
  ].some((c) => hasCode(diagnostics, c));

  if (hasRefTotals && !hasRefMismatch) {
    positiveSignals.push("Written reference totals match computed values");
  }

  if (unusedDimCount === 0 && dimensionEvidence?.dimensions?.length > 0) {
    positiveSignals.push("All high-confidence dimensions used in final runs");
  }

  const noBsInRef = dimensionEvidence?.referenceTotals?.some((r) => r.noBacksplash === true) ?? false;
  if (noBsInRef && computed.backsplashExactSf === 0 && !hasCode(diagnostics, "REFERENCE_TOTAL_NO_BS_CONFLICT")) {
    positiveSignals.push("No-backsplash correctly recognized — computed 0.00 sf backsplash");
  }

  if (computed.backsplashExactSf === 0 && !hasCode(diagnostics, "AI_BACKSPLASH_TOTAL_NOT_STRUCTURED")) {
    if (!noBsInRef) {
      // Only add this signal when there's no no-BS context (would be redundant)
      // Skip — it could be a false positive if backsplash was expected
    }
  }

  if (
    pageInventory != null &&
    (pageInventory.recommendedMeasurementPages?.length ?? 0) > 0
  ) {
    positiveSignals.push(
      `${pageInventory.recommendedMeasurementPages.length} measurement page${pageInventory.recommendedMeasurementPages.length !== 1 ? "s" : ""} identified`
    );
  }

  // ── Headline and summary ──────────────────────────────────────────────────

  const benchmarkContextActive =
    hasBenchmarkContext ||
    (benchmarkEvaluation?.finalRecommendation != null &&
     benchmarkEvaluation.finalRecommendation !== "auto_pass");

  const hasBenchmarkMismatch = allIssues.some(
    (i) => i.code === "QA_EXPECTED_COUNTERTOP_MISMATCH" || i.code === "QA_EXPECTED_BACKSPLASH_MISMATCH"
  );

  const headline =
    status === "ready_for_review"
      ? "Takeoff looks complete — ready for estimator review"
    : hasBenchmarkMismatch && status === "do_not_import"
      ? "Computed takeoff does not match selected benchmark target"
    : hasBenchmarkMismatch && status === "needs_review"
      ? "Computed takeoff differs from benchmark target — review required"
    : status === "needs_review"
      ? "Takeoff needs estimator review before use"
    : "Do not use this takeoff — likely missing or conflicting data";

  const ct = computed.countertopExactSf.toFixed(2);
  const bs = computed.backsplashExactSf.toFixed(2);

  const summary =
    status === "ready_for_review"
      ? `eliteOS computed ${ct} sf countertop and ${bs} sf backsplash. No critical issues detected.`
    : status === "needs_review"
      ? `${warningIssues.length} issue${warningIssues.length !== 1 ? "s" : ""} need${warningIssues.length === 1 ? "s" : ""} estimator attention. Review the issues below and verify the plan manually.`
    : `${criticalIssues.length} critical issue${criticalIssues.length !== 1 ? "s" : ""} detected. This takeoff likely has missing pieces or conflicting data. Regenerate or correct the extraction.`;

  // ── Review checklist ──────────────────────────────────────────────────────

  const reviewChecklist = [
    "Verify all countertop pieces are present and correctly dimensioned",
    "Verify backsplash / no-backsplash notes match the plan",
    "Verify islands and peninsulas are captured correctly",
    "Verify cutouts (sink/cooktop/faucet) are notes/add-ons — not deductions from material sf",
    "If visible reference total exists, verify computed total reconciles within ±2 sf",
  ];

  if (noBsInRef) {
    reviewChecklist.push("Confirm no backsplash was generated — plan indicates no stone backsplash");
  }

  // ── importBlockedReason ───────────────────────────────────────────────────

  let importBlockedReason = null;
  if (status === "do_not_import") {
    const topCritical = criticalIssues[0];
    importBlockedReason = topCritical
      ? topCritical.message
      : "Critical issues prevent this takeoff from being used.";
  } else if (status === "needs_review") {
    importBlockedReason = "Estimator review required before this takeoff can be used for quoting.";
  }

  return {
    status,
    severity,
    headline,
    summary,
    topIssues,
    positiveSignals,
    reviewChecklist,
    importBlockedReason,
    benchmarkContextActive,
  };
}
