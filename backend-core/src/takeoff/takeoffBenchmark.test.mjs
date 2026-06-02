/**
 * Tests for takeoffBenchmark — evaluation harness and regression guard.
 *
 * Run: npm run eos:test:takeoff-benchmark
 *
 * All tests are pure-function: no I/O, no DB, no AI, no pricing.
 * Synthetic computed inputs only — no raw customer PDFs.
 *
 * Test coverage:
 *   1. Exact target match → pass
 *   2. Countertop delta over tolerance → needs_review
 *   3. Backsplash expected > 0 but computed = 0 → high severity (not pass)
 *   4. benchmark v5.1 style result (68.41 ct / 1.04 bs) fails against 78/4 target
 *   5. Compare: prev 76.97/0 vs current 68.41/1.04 → countertop regression detected
 *   6. Evaluation result contains no pricing or quote data
 *   7. Within-tolerance result (borderline) → pass
 */

import assert from "node:assert/strict";
import {
  BENCHMARK_RESULT,
  HAND_SKETCH_BENCHMARK_001,
  evaluateTakeoffAgainstBenchmark,
  compareAiTakeoffRuns,
} from "./takeoffBenchmark.mjs";

// ── 1. Exact target match → pass ─────────────────────────────────────────────
{
  const computed = { countertopExactSf: 78, backsplashExactSf: 4, combinedExactSf: 82 };
  const result = evaluateTakeoffAgainstBenchmark(computed, HAND_SKETCH_BENCHMARK_001);

  assert.equal(result.summary, BENCHMARK_RESULT.PASS, "Exact match → pass");
  assert.equal(result.countertopPass,        true,  "CT pass");
  assert.equal(result.backsplashPass,        true,  "BS pass");
  assert.equal(result.backsplashHighSeverity, false, "No BS high severity when expected matches");
  assert.equal(result.countertopDeltaSf,     0,     "CT delta = 0");
  assert.equal(result.backsplashDeltaSf,     0,     "BS delta = 0");
  assert.equal(result.countertopPctError,    0,     "CT pct error = 0");
  assert.equal(result.backsplashPctError,    0,     "BS pct error = 0");
  console.log("ok: exact target match → pass");
}

// ── 2. Countertop delta over tolerance → needs_review ─────────────────────────
{
  // 68.41 sf vs 78 sf target — delta = -9.59 sf, well beyond ±2 tolerance
  const computed = { countertopExactSf: 68.41, backsplashExactSf: 4, combinedExactSf: 72.41 };
  const result = evaluateTakeoffAgainstBenchmark(computed, HAND_SKETCH_BENCHMARK_001);

  assert.equal(result.countertopPass,  false, "CT delta > tolerance → fail");
  assert.equal(result.backsplashPass,  true,  "BS still passes here");
  assert.ok(
    result.summary === BENCHMARK_RESULT.NEEDS_REVIEW ||
    result.summary === BENCHMARK_RESULT.REGRESSION,
    "Summary is needs_review or regression"
  );
  assert.ok(result.countertopPctError > 10, `CT pct error ${result.countertopPctError}% > 10%`);
  console.log(`ok: countertop delta ${result.countertopDeltaSf} sf over tolerance → needs_review`);
}

// ── 3. Backsplash expected > 0 but computed = 0 → high severity ───────────────
{
  const computed = { countertopExactSf: 76.97, backsplashExactSf: 0, combinedExactSf: 76.97 };
  const result = evaluateTakeoffAgainstBenchmark(computed, HAND_SKETCH_BENCHMARK_001);

  assert.equal(result.backsplashHighSeverity, true,  "Zero backsplash when expected > 0 → high severity");
  assert.equal(result.backsplashPass,         false, "backsplashPass = false");
  assert.ok(result.summary !== BENCHMARK_RESULT.PASS, "High severity → not pass");
  // Countertop is within tolerance (76.97 vs 78, delta = -1.03 ≤ 2 sf)
  assert.equal(result.countertopPass, true, "CT within tolerance");
  console.log("ok: backsplash expected > 0 but computed = 0 → high severity");
}

// ── 4. benchmark v5.1 style result (68.41 ct / 1.04 bs) fails against 78/4 ──────
{
  // These are the observed v5.1 (prompt v2) benchmark fixture numbers.
  const computed = { countertopExactSf: 68.41, backsplashExactSf: 1.04, combinedExactSf: 69.45 };
  const result = evaluateTakeoffAgainstBenchmark(computed, HAND_SKETCH_BENCHMARK_001);

  assert.equal(result.countertopPass,  false, "68.41 sf fails 78 sf target with ±2 sf tolerance");
  assert.equal(result.backsplashPass,  false, "1.04 sf fails 4 sf target with ±2 sf tolerance");
  assert.equal(result.backsplashHighSeverity, false, "BS is low but not zero, so not high-severity");
  assert.equal(result.summary, BENCHMARK_RESULT.NEEDS_REVIEW, "Summary = needs_review");
  assert.ok(result.countertopDeltaSf < -5, `CT delta ${result.countertopDeltaSf} should be < -5 sf`);
  assert.ok(result.countertopPctError > 10, `CT pct error ${result.countertopPctError}% > 10%`);
  assert.ok(result.backsplashPctError > 50, `BS pct error ${result.backsplashPctError}% > 50%`);
  console.log(`ok: v5.1 hand sketch 001 result (${computed.countertopExactSf}/${computed.backsplashExactSf}) fails against 78/4 target`);
}

// ── 5. Compare: prev 76.97/0 vs current 68.41/1.04 → countertop regression ────
{
  const prevComputed = { countertopExactSf: 76.97, backsplashExactSf: 0.00, combinedExactSf: 76.97 };
  const currComputed = { countertopExactSf: 68.41, backsplashExactSf: 1.04, combinedExactSf: 69.45 };

  const prevEval = evaluateTakeoffAgainstBenchmark(prevComputed, HAND_SKETCH_BENCHMARK_001);
  const currEval = evaluateTakeoffAgainstBenchmark(currComputed, HAND_SKETCH_BENCHMARK_001);
  const comparison = compareAiTakeoffRuns(prevEval, currEval);

  // Countertop moved farther from target (76.97→68.41, error grew from 1.03 to 9.59)
  assert.equal(comparison.countertopRegressed, true,  "CT regressed (error grew > 0.5 sf buffer)");
  // Backsplash moved closer to target (0→1.04, error shrunk from 4 to 2.96)
  assert.equal(comparison.backsplashImproved,  true,  "BS improved (error shrunk > 0.5 sf buffer)");
  assert.equal(comparison.backsplashRegressed, false, "BS did not regress");
  assert.equal(comparison.summary, BENCHMARK_RESULT.REGRESSION, "Summary = regression");
  assert.ok(comparison.countertopChange < -5, `CT change ${comparison.countertopChange} should be < -5`);
  assert.ok(comparison.backsplashChange > 0.5, `BS change ${comparison.backsplashChange} should be > 0.5`);
  console.log(`ok: countertop regression detected (prev ${prevComputed.countertopExactSf} → curr ${currComputed.countertopExactSf} sf)`);
}

// ── 6. Evaluation result contains no pricing or quote data ────────────────────
{
  const computed = { countertopExactSf: 76.97, backsplashExactSf: 1.04, combinedExactSf: 78.01 };
  const result = evaluateTakeoffAgainstBenchmark(computed, HAND_SKETCH_BENCHMARK_001);

  assert.ok(!("pricePerSf"     in result), "No pricePerSf in evaluation result");
  assert.ok(!("markup"         in result), "No markup in evaluation result");
  assert.ok(!("customerPrice"  in result), "No customerPrice in evaluation result");
  assert.ok(!("quoteId"        in result), "No quoteId in evaluation result");
  assert.ok(!("quote_headers"  in result), "No quote_headers in evaluation result");
  console.log("ok: evaluation result contains no pricing or quote data");
}

// ── 7. Within-tolerance borderline cases → pass ───────────────────────────────
{
  // 76.5 sf CT (delta = -1.5, within ±2) + 2.1 sf BS (delta = -1.9, within ±2)
  const computed = { countertopExactSf: 76.5, backsplashExactSf: 2.1, combinedExactSf: 78.6 };
  const result = evaluateTakeoffAgainstBenchmark(computed, HAND_SKETCH_BENCHMARK_001);

  assert.equal(result.countertopPass,       true,  "76.5 sf within ±2 of 78 → pass");
  assert.equal(result.backsplashPass,       true,  "2.1 sf within ±2 of 4 → pass");
  assert.equal(result.backsplashHighSeverity, false, "BS is non-zero → no high severity");
  assert.equal(result.summary, BENCHMARK_RESULT.PASS, "Borderline within-tolerance → pass");
  console.log("ok: within-tolerance borderline result passes");
}

console.log("\ntakeoffBenchmark: all tests passed");
