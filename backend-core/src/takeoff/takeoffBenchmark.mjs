/**
 * takeoffBenchmark — lightweight AI Takeoff evaluation harness and regression guard.
 *
 * Purpose:
 *   Compare eliteOS-computed measurements against estimator-approved benchmark targets.
 *   Use this before/after every prompt or model change to catch regressions.
 *
 * Architecture rules:
 *   - Pure functions only: no I/O, no DB calls, no AI calls, no pricing logic.
 *   - Always compares against eliteOS computed totals — never raw AI totals.
 *   - HAND_SKETCH_BENCHMARK_001 is a dev/QA-only fixture. Source PDF is private and NOT committed.
 *
 * Usage (manual QA script or test):
 *   import { evaluateTakeoffAgainstBenchmark, HAND_SKETCH_BENCHMARK_001, compareAiTakeoffRuns } from "./takeoffBenchmark.mjs";
 *   const result = evaluateTakeoffAgainstBenchmark(computedMeasurements, HAND_SKETCH_BENCHMARK_001);
 *   const diff   = compareAiTakeoffRuns(prevEval, currEval);
 */

// ── Summary labels ─────────────────────────────────────────────────────────────

/** Outcome summary labels for a single benchmark evaluation or run comparison. */
export const BENCHMARK_RESULT = Object.freeze({
  /** All categories within tolerance. */
  PASS: "pass",
  /** One or more categories outside tolerance; human review needed. */
  NEEDS_REVIEW: "needs_review",
  /** Current run is farther from target than previous run. */
  REGRESSION: "regression",
});

// ── Benchmark fixtures ─────────────────────────────────────────────────────────

/**
 * Hand sketch benchmark 001 — private dev-only benchmark target.
 *
 * Source PDF: private, not committed to repo (PII + customer IP).
 * Estimator-approved targets supplied manually from the a private hand sketch job.
 * Use this fixture in manual QA and benchmark tests to guard against regression.
 *
 * Observed AI extraction history:
 *   v5 prompt v1 → countertop 76.97 sf / backsplash 0.00 sf  (CT close, BS missed)
 *   v5 prompt v2 → countertop 68.41 sf / backsplash 1.04 sf  (CT regressed, BS partial)
 */
export const HAND_SKETCH_BENCHMARK_001 = Object.freeze({
  benchmarkId:           "hand-sketch-benchmark-001",
  label:                 "Hand sketch benchmark 001",
  sourceFilename:        "hand_sketch_benchmark_001.pdf",   // private — not in repo
  expectedCountertopSf:  78,
  expectedBacksplashSf:  4,
  expectedCombinedSf:    82,
  toleranceSf:           2,
  notes: Object.freeze([
    "Messy hand sketch / email packet. Estimator-approved target supplied manually.",
    "Observed v5 prompt v1: 76.97 ct / 0.00 bs — countertop close, backsplash missed.",
    "Observed v5 prompt v2: 68.41 ct / 1.04 bs — countertop regressed (island shrank), backsplash partial.",
  ]),
  importantExpectedDimensions: Object.freeze([
    "Island should NOT shrink — estimator expects roughly 100\" × 42\" or similar; prompt v2 model shrank to 86\" × 56\".",
    "Computer/desk run should be captured as a separate area or run.",
    "Backsplash / tile / 'no B/S' ambiguity requires human review — some surfaces have no stone backsplash.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may record aiProvidedTotals.backsplashExactSf > 0 without populating backsplashLinearIn (structured field missing).",
    "Model may produce contradictory output: 'No Back Splash' note alongside 1.04 sf backsplash.",
    "Prompt v2 regressed countertop from 76.97 sf to 68.41 sf due to island dimension shrinkage.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── Evaluation ────────────────────────────────────────────────────────────────

/**
 * Evaluate eliteOS-computed measurements against a benchmark target.
 *
 * IMPORTANT: always pass eliteOS computed totals, NOT raw AI totals.
 * AI-provided totals are for audit only and must never be used for pricing or evaluation.
 *
 * @param {{ countertopExactSf: number, backsplashExactSf: number, combinedExactSf: number }} computed
 *   eliteOS-computed TakeoffComputedMeasurements (from computeTakeoffMeasurements).
 * @param {{ benchmarkId: string, label: string, expectedCountertopSf: number,
 *           expectedBacksplashSf: number, expectedCombinedSf?: number, toleranceSf?: number }} benchmark
 * @returns {TakeoffEvaluation}
 *
 * @typedef {Object} TakeoffEvaluation
 * @property {string}   benchmarkId
 * @property {string}   benchmarkLabel
 * @property {number}   toleranceSf
 * @property {number}   expectedCountertopSf
 * @property {number}   expectedBacksplashSf
 * @property {number}   expectedCombinedSf
 * @property {number}   computedCountertopSf
 * @property {number}   computedBacksplashSf
 * @property {number}   computedCombinedSf
 * @property {number}   countertopDeltaSf      computed − expected (negative = under)
 * @property {number}   backsplashDeltaSf
 * @property {number}   combinedDeltaSf
 * @property {number|null} countertopPctError  abs % error vs expected (null if expected = 0)
 * @property {number|null} backsplashPctError
 * @property {boolean}  countertopPass         |delta| ≤ tolerance
 * @property {boolean}  backsplashPass
 * @property {boolean}  backsplashHighSeverity  expected > 0 but computed = 0
 * @property {"pass"|"needs_review"|"regression"} summary
 */
export function evaluateTakeoffAgainstBenchmark(computed, benchmark) {
  const tolerance       = Number(benchmark.toleranceSf ?? 2);
  const expectedCombined = benchmark.expectedCombinedSf ??
    (benchmark.expectedCountertopSf + benchmark.expectedBacksplashSf);

  const countertopDeltaSf = round2(computed.countertopExactSf - benchmark.expectedCountertopSf);
  const backsplashDeltaSf = round2(computed.backsplashExactSf - benchmark.expectedBacksplashSf);
  const combinedDeltaSf   = round2(computed.combinedExactSf   - expectedCombined);

  const countertopPctError = benchmark.expectedCountertopSf > 0
    ? round2(Math.abs(countertopDeltaSf) / benchmark.expectedCountertopSf * 100)
    : null;
  const backsplashPctError = benchmark.expectedBacksplashSf > 0
    ? round2(Math.abs(backsplashDeltaSf) / benchmark.expectedBacksplashSf * 100)
    : null;

  const countertopPass       = Math.abs(countertopDeltaSf) <= tolerance;
  const backsplashPass       = Math.abs(backsplashDeltaSf) <= tolerance;
  // High severity: estimator expects backsplash but model produced none at all.
  const backsplashHighSeverity = benchmark.expectedBacksplashSf > 0 &&
    computed.backsplashExactSf === 0;

  let summary = BENCHMARK_RESULT.PASS;
  if (!countertopPass || !backsplashPass || backsplashHighSeverity) {
    summary = BENCHMARK_RESULT.NEEDS_REVIEW;
  }

  return {
    benchmarkId:           benchmark.benchmarkId,
    benchmarkLabel:        benchmark.label,
    toleranceSf:           tolerance,
    expectedCountertopSf:  benchmark.expectedCountertopSf,
    expectedBacksplashSf:  benchmark.expectedBacksplashSf,
    expectedCombinedSf:    expectedCombined,
    computedCountertopSf:  computed.countertopExactSf,
    computedBacksplashSf:  computed.backsplashExactSf,
    computedCombinedSf:    computed.combinedExactSf,
    countertopDeltaSf,
    backsplashDeltaSf,
    combinedDeltaSf,
    countertopPctError,
    backsplashPctError,
    countertopPass,
    backsplashPass,
    backsplashHighSeverity,
    summary,
  };
}

// ── Run comparison ────────────────────────────────────────────────────────────

/**
 * Compare two evaluation runs to detect regression or improvement.
 *
 * A run "regresses" when it moves farther from the target than the previous run
 * by more than REGRESSION_BUFFER_SF.
 *
 * @param {TakeoffEvaluation} previousEval  Prior evaluation (e.g. prompt v1 result)
 * @param {TakeoffEvaluation} currentEval   Current evaluation (e.g. prompt v2 result)
 * @returns {TakeoffRunComparison}
 *
 * @typedef {Object} TakeoffRunComparison
 * @property {string}  benchmarkId
 * @property {number}  countertopChange        current − previous computed sf
 * @property {number}  backsplashChange
 * @property {boolean} countertopRegressed     current error > previous error + buffer
 * @property {boolean} countertopImproved      current error < previous error − buffer
 * @property {boolean} backsplashRegressed
 * @property {boolean} backsplashImproved
 * @property {number}  previousCountertopSf
 * @property {number}  currentCountertopSf
 * @property {number}  previousBacksplashSf
 * @property {number}  currentBacksplashSf
 * @property {"pass"|"needs_review"|"regression"} summary
 */
export function compareAiTakeoffRuns(previousEval, currentEval) {
  const REGRESSION_BUFFER_SF = 0.5; // a change must exceed this to be called a regression/improvement

  const countertopChange = round2(currentEval.computedCountertopSf - previousEval.computedCountertopSf);
  const backsplashChange = round2(currentEval.computedBacksplashSf - previousEval.computedBacksplashSf);

  const prevCtError = Math.abs(previousEval.countertopDeltaSf);
  const currCtError = Math.abs(currentEval.countertopDeltaSf);
  const countertopRegressed = currCtError > prevCtError + REGRESSION_BUFFER_SF;
  const countertopImproved  = currCtError < prevCtError - REGRESSION_BUFFER_SF;

  const prevBsError = Math.abs(previousEval.backsplashDeltaSf);
  const currBsError = Math.abs(currentEval.backsplashDeltaSf);
  const backsplashRegressed = currBsError > prevBsError + REGRESSION_BUFFER_SF;
  const backsplashImproved  = currBsError < prevBsError - REGRESSION_BUFFER_SF;

  // Comparison summary: regression takes precedence, then delegate to current eval.
  let summary = currentEval.summary;
  if (countertopRegressed || backsplashRegressed) {
    summary = BENCHMARK_RESULT.REGRESSION;
  }

  return {
    benchmarkId:           currentEval.benchmarkId,
    countertopChange,
    backsplashChange,
    countertopRegressed,
    countertopImproved,
    backsplashRegressed,
    backsplashImproved,
    previousCountertopSf:  previousEval.computedCountertopSf,
    currentCountertopSf:   currentEval.computedCountertopSf,
    previousBacksplashSf:  previousEval.computedBacksplashSf,
    currentBacksplashSf:   currentEval.computedBacksplashSf,
    summary,
  };
}
