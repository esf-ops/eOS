/**
 * TakeoffBenchmarkPanel — local QA evaluation panel for AI Takeoff Lab.
 *
 * Purpose: Let estimators and developers compare eliteOS-computed measurements
 * against manually-entered target values. Flags when a new AI extraction has
 * regressed or missed a category.
 *
 * State: local only — not persisted, not sent to backend.
 * Input: eliteOS computed measurements (never raw AI totals).
 * Output: delta, % error, pass/needs_review per category.
 *
 * Built-in target: "Load hand sketch target" pre-fills the hand sketch job 001
 * estimator-approved values (78 sf CT / 4 sf BS) for quick QA after each run.
 */
import React, { useState } from "react";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import {
  evaluateTakeoffAgainstBenchmark,
  HAND_SKETCH_BENCHMARK_001,
  BENCHMARK_RESULT,
} from "@takeoff-core/takeoffBenchmark.mjs";

// ── Types ─────────────────────────────────────────────────────────────────────

type EvalResult = ReturnType<typeof evaluateTakeoffAgainstBenchmark>;

interface Props {
  computed: TakeoffComputedMeasurements;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSf(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function fmtDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} sf`;
}

function fmtPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(1)}%`;
}

function summaryLabel(s: string): string {
  if (s === BENCHMARK_RESULT.PASS)        return "✓ PASS";
  if (s === BENCHMARK_RESULT.REGRESSION)  return "✗ REGRESSION";
  return "⚠ NEEDS REVIEW";
}

function summaryClass(s: string): string {
  if (s === BENCHMARK_RESULT.PASS)        return "benchmark-summary benchmark-summary--pass";
  if (s === BENCHMARK_RESULT.REGRESSION)  return "benchmark-summary benchmark-summary--regression";
  return "benchmark-summary benchmark-summary--needs-review";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffBenchmarkPanel({ computed }: Props) {
  const [expectedCt,   setExpectedCt]   = useState("");
  const [expectedBs,   setExpectedBs]   = useState("");
  const [toleranceSf,  setToleranceSf]  = useState("2");
  const [evalNotes,    setEvalNotes]    = useState("");
  const [evalResult,   setEvalResult]   = useState<EvalResult | null>(null);
  const [evalError,    setEvalError]    = useState<string | null>(null);

  function loadHandSketch001() {
    setExpectedCt(String(HAND_SKETCH_BENCHMARK_001.expectedCountertopSf));
    setExpectedBs(String(HAND_SKETCH_BENCHMARK_001.expectedBacksplashSf));
    setToleranceSf(String(HAND_SKETCH_BENCHMARK_001.toleranceSf));
    setEvalNotes("");
    setEvalResult(null);
    setEvalError(null);
  }

  function evaluate() {
    setEvalError(null);
    const ct  = parseSf(expectedCt);
    const bs  = parseSf(expectedBs);
    const tol = parseSf(toleranceSf) ?? 2;
    if (ct === null || bs === null) {
      setEvalError("Enter valid expected countertop and backsplash values before evaluating.");
      return;
    }
    const bench = {
      benchmarkId:          "manual",
      label:                "Manual QA target",
      expectedCountertopSf: ct,
      expectedBacksplashSf: bs,
      expectedCombinedSf:   ct + bs,
      toleranceSf:          tol,
    };
    setEvalResult(evaluateTakeoffAgainstBenchmark(computed, bench));
  }

  const canEvaluate = Boolean(expectedCt.trim()) && Boolean(expectedBs.trim());

  return (
    <div className="benchmark-panel lab-card">
      <div className="benchmark-header">
        <span className="benchmark-header-title">Benchmark / QA evaluation</span>
        <span className="benchmark-header-sub">
          Compares eliteOS-computed values against estimator-approved targets.
          AI reference totals are not used here.
        </span>
      </div>

      <div className="benchmark-inputs">
        <label className="benchmark-label">
          Expected CT sf
          <input
            type="number"
            className="benchmark-input"
            value={expectedCt}
            onChange={(e) => { setExpectedCt(e.target.value); setEvalResult(null); }}
            placeholder="78"
            step="0.5"
          />
        </label>
        <label className="benchmark-label">
          Expected BS sf
          <input
            type="number"
            className="benchmark-input"
            value={expectedBs}
            onChange={(e) => { setExpectedBs(e.target.value); setEvalResult(null); }}
            placeholder="4"
            step="0.5"
          />
        </label>
        <label className="benchmark-label">
          Tolerance ±sf
          <input
            type="number"
            className="benchmark-input"
            value={toleranceSf}
            onChange={(e) => { setToleranceSf(e.target.value); setEvalResult(null); }}
            placeholder="2"
            step="0.5"
            min="0"
          />
        </label>
        <div className="benchmark-actions">
          <button
            type="button"
            className="benchmark-btn benchmark-btn--load"
            onClick={loadHandSketch001}
          >
            Load hand sketch target
          </button>
          <button
            type="button"
            className="benchmark-btn benchmark-btn--evaluate"
            disabled={!canEvaluate}
            onClick={evaluate}
          >
            Evaluate current draft
          </button>
        </div>
      </div>

      {evalError && (
        <p className="benchmark-error" role="alert">{evalError}</p>
      )}

      {evalResult && (
        <div className="benchmark-results">
          <table className="benchmark-table">
            <thead>
              <tr>
                <th></th>
                <th>Expected</th>
                <th>Computed</th>
                <th>Delta</th>
                <th>% Error</th>
                <th>Pass</th>
              </tr>
            </thead>
            <tbody>
              <tr className={evalResult.countertopPass ? "" : "benchmark-row--fail"}>
                <td className="benchmark-category">Countertop</td>
                <td>{evalResult.expectedCountertopSf.toFixed(2)} sf</td>
                <td>{evalResult.computedCountertopSf.toFixed(2)} sf</td>
                <td className={evalResult.countertopDeltaSf < 0 ? "benchmark-delta--neg" : "benchmark-delta--pos"}>
                  {fmtDelta(evalResult.countertopDeltaSf)}
                </td>
                <td>{fmtPct(evalResult.countertopPctError)}</td>
                <td>{evalResult.countertopPass ? "✓" : "✗"}</td>
              </tr>
              <tr className={evalResult.backsplashPass ? "" : "benchmark-row--fail"}>
                <td className="benchmark-category">
                  Backsplash
                  {evalResult.backsplashHighSeverity && (
                    <span className="benchmark-severity-flag" title="Expected backsplash but computed 0 sf"> ⚠</span>
                  )}
                </td>
                <td>{evalResult.expectedBacksplashSf.toFixed(2)} sf</td>
                <td>{evalResult.computedBacksplashSf.toFixed(2)} sf</td>
                <td className={evalResult.backsplashDeltaSf < 0 ? "benchmark-delta--neg" : "benchmark-delta--pos"}>
                  {fmtDelta(evalResult.backsplashDeltaSf)}
                </td>
                <td>{fmtPct(evalResult.backsplashPctError)}</td>
                <td>{evalResult.backsplashPass ? "✓" : "✗"}</td>
              </tr>
              <tr>
                <td className="benchmark-category">Combined</td>
                <td>{evalResult.expectedCombinedSf.toFixed(2)} sf</td>
                <td>{evalResult.computedCombinedSf.toFixed(2)} sf</td>
                <td className={evalResult.combinedDeltaSf < 0 ? "benchmark-delta--neg" : "benchmark-delta--pos"}>
                  {fmtDelta(evalResult.combinedDeltaSf)}
                </td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>

          <div className="benchmark-footer">
            <span className={summaryClass(evalResult.summary)}>
              {summaryLabel(evalResult.summary)}
            </span>
            <span className="benchmark-tolerance">
              Tolerance: ±{evalResult.toleranceSf} sf
            </span>
            {evalResult.backsplashHighSeverity && (
              <span className="benchmark-high-severity">
                ⚠ Backsplash expected but computed = 0.00 sf — check structured backsplashLinearIn
              </span>
            )}
          </div>

          <label className="benchmark-notes-label">
            QA notes (local only — not saved)
            <textarea
              className="benchmark-notes"
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Island shrank in prompt v2; backsplash note ambiguous — review dimensions manually"
            />
          </label>
        </div>
      )}

      {!evalResult && canEvaluate && (
        <p className="benchmark-hint">
          Press &ldquo;Evaluate current draft&rdquo; to compare eliteOS computed totals against your target.
        </p>
      )}

      {!canEvaluate && (
        <p className="benchmark-hint">
          Enter expected countertop and backsplash sf, or click &ldquo;Load hand sketch target&rdquo; for the
          hand sketch 001 estimator target (78 sf CT / 4 sf BS).
        </p>
      )}
    </div>
  );
}
