/**
 * TakeoffBenchmarkPanel — local QA evaluation panel for AI Takeoff Lab.
 *
 * Purpose: Let estimators and developers compare eliteOS-computed measurements
 * against manually-entered targets or known benchmark presets. Flags when a new
 * AI extraction has regressed or missed a category.
 *
 * v5.7 additions:
 *   - Benchmark preset buttons for REFERENCE_BENCHMARK_001–004 (and more)
 *   - Rich evaluator output via evaluateTakeoffBenchmark when a preset is loaded
 *   - Failure category and final recommendation display
 *   - Reference totals captured / evidence coverage status
 *
 * State: local only — not persisted, not sent to backend.
 * Input: eliteOS computed measurements (never raw AI totals).
 */
import React, { useState } from "react";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import {
  evaluateTakeoffAgainstBenchmark,
  HAND_SKETCH_BENCHMARK_001,
  REFERENCE_BENCHMARK_001,
  REFERENCE_BENCHMARK_002,
  REFERENCE_BENCHMARK_003,
  REFERENCE_BENCHMARK_004,
  CLEAN_RECTANGLE_GEOMETRY_001,
  WATERFALL_STEPPED_SHAPE_001,
  BENCHMARK_RESULT,
} from "@takeoff-core/takeoffBenchmark.mjs";
import { evaluateTakeoffBenchmark } from "@takeoff-core/takeoffBenchmarkEvaluator.mjs";

// ── Types ─────────────────────────────────────────────────────────────────────

type SimpleEvalResult = ReturnType<typeof evaluateTakeoffAgainstBenchmark>;
type RichEvalResult   = ReturnType<typeof evaluateTakeoffBenchmark>;

/** Passed to TakeoffLabApp so the main QA card can reflect benchmark truth. */
export interface BenchmarkQaContext {
  expectedCountertopSf:  number;
  expectedBacksplashSf:  number;
  toleranceCountertopSf: number;
  toleranceBacksplashSf: number;
  source:                "benchmark_preset" | "manual_qa";
  label:                 string;
  benchmarkEvaluation:   object | null;  // richResult from evaluateTakeoffBenchmark
}

interface Props {
  computed:               TakeoffComputedMeasurements;
  dimensionEvidence?:     object | null;
  validation?:            { diagnostics: Array<{ code: string; level: string; message: string }> } | null;
  onBenchmarkEvaluated?:  (ctx: BenchmarkQaContext | null) => void;
}

// ── Preset list ───────────────────────────────────────────────────────────────

const PRESETS = [
  { key: "ref001",  label: "Ref 001 — 31 CT / 0 BS",            fixture: REFERENCE_BENCHMARK_001 },
  { key: "ref002",  label: "Ref 002 — 53 CT / 6 BS",            fixture: REFERENCE_BENCHMARK_002 },
  { key: "ref003",  label: "Ref 003 — 49 CT / no BS",           fixture: REFERENCE_BENCHMARK_003 },
  { key: "ref004",  label: "Ref 004 — 50 CT / no BS",           fixture: REFERENCE_BENCHMARK_004 },
  { key: "rect001", label: "Clean rect — ~78 CT / 0 BS",        fixture: CLEAN_RECTANGLE_GEOMETRY_001 },
  { key: "wf001",   label: "Waterfall — ~76.3 CT (review req)", fixture: WATERFALL_STEPPED_SHAPE_001 },
  { key: "hs001",   label: "Hand sketch — 78 CT / 4 BS",        fixture: HAND_SKETCH_BENCHMARK_001 },
];

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

function simpleSummaryLabel(s: string): string {
  if (s === BENCHMARK_RESULT.PASS)        return "✓ PASS";
  if (s === BENCHMARK_RESULT.REGRESSION)  return "✗ REGRESSION";
  return "⚠ NEEDS REVIEW";
}

function simpleSummaryClass(s: string): string {
  if (s === BENCHMARK_RESULT.PASS)        return "benchmark-summary benchmark-summary--pass";
  if (s === BENCHMARK_RESULT.REGRESSION)  return "benchmark-summary benchmark-summary--regression";
  return "benchmark-summary benchmark-summary--needs-review";
}

function richRecommendationClass(rec: string): string {
  if (rec === "auto_pass")      return "benchmark-rec benchmark-rec--pass";
  if (rec === "fail")           return "benchmark-rec benchmark-rec--fail";
  return "benchmark-rec benchmark-rec--review";
}

function richRecommendationLabel(rec: string): string {
  if (rec === "auto_pass")   return "✓ AUTO PASS";
  if (rec === "fail")        return "✗ FAIL";
  return "⚠ REVIEW REQUIRED";
}

function failureCategoryLabel(cat: string): string {
  const MAP: Record<string, string> = {
    none:                          "None",
    cutout_deduction_violation:    "Cutout deduction violation",
    extraction_failure:            "Extraction failure (CT = 0)",
    backsplash_classification_failure: "Backsplash classification failure",
    geometry_failure:              "Geometry failure (CT error > 10%)",
    reference_reconciliation_failure: "Reference total reconciliation failure",
    mixed_area_scope_failure:      "Mixed area / scope failure",
    evidence_coverage_failure:     "Evidence coverage failure",
    review_gate_failure:           "Review gate (expected review required)",
  };
  return MAP[cat] ?? cat;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffBenchmarkPanel({
  computed,
  dimensionEvidence,
  validation,
  onBenchmarkEvaluated,
}: Props) {
  const [expectedCt,    setExpectedCt]    = useState("");
  const [expectedBs,    setExpectedBs]    = useState("");
  const [toleranceSf,   setToleranceSf]   = useState("2");
  const [evalNotes,     setEvalNotes]     = useState("");
  const [activePreset,  setActivePreset]  = useState<string | null>(null);
  const [activeLabel,   setActiveLabel]   = useState<string>("Manual QA target");
  const [activeFixture, setActiveFixture] = useState<object | null>(null);
  const [simpleResult,  setSimpleResult]  = useState<SimpleEvalResult | null>(null);
  const [richResult,    setRichResult]    = useState<RichEvalResult | null>(null);
  const [evalError,     setEvalError]     = useState<string | null>(null);

  /** Clear the parent QA context whenever inputs change without re-evaluating. */
  function clearContext() {
    setSimpleResult(null);
    setRichResult(null);
    onBenchmarkEvaluated?.(null);
  }

  function loadPreset(key: string, fixture: typeof REFERENCE_BENCHMARK_001, label: string) {
    const expBs = (fixture as any).expectedStandardBacksplashSf
      ?? (fixture as any).expectedBacksplashSf ?? 0;
    setExpectedCt(String((fixture as any).expectedCountertopSf ?? ""));
    setExpectedBs(String(expBs));
    setToleranceSf(String(
      (fixture as any).toleranceCountertopSf ?? (fixture as any).toleranceSf ?? 2
    ));
    setActivePreset(key);
    setActiveLabel(label);
    setActiveFixture(fixture);
    clearContext();
    setEvalError(null);
    setEvalNotes("");
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

    const manualBench = {
      benchmarkId:          "manual",
      label:                "Manual QA target",
      expectedCountertopSf: ct,
      expectedBacksplashSf: bs,
      expectedCombinedSf:   ct + bs,
      toleranceSf:          tol,
    };

    const benchForSimple = activeFixture ?? manualBench;
    setSimpleResult(evaluateTakeoffAgainstBenchmark(computed, benchForSimple as any));

    let rich: RichEvalResult | null = null;
    if (activeFixture) {
      rich = evaluateTakeoffBenchmark({
        benchmark:            activeFixture,
        computedMeasurements: computed,
        dimensionEvidence:    dimensionEvidence as any ?? null,
        validationDiagnostics: validation ?? null,
      });
      setRichResult(rich);
    } else {
      setRichResult(null);
    }

    // Notify parent so the main QA card can include this benchmark truth.
    onBenchmarkEvaluated?.({
      expectedCountertopSf:  ct,
      expectedBacksplashSf:  bs,
      toleranceCountertopSf: tol,
      toleranceBacksplashSf: tol,
      source:                activePreset ? "benchmark_preset" : "manual_qa",
      label:                 activeLabel,
      benchmarkEvaluation:   rich,
    });
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

      {/* Preset buttons */}
      <div className="benchmark-presets">
        <span className="benchmark-presets-label">Presets:</span>
        <div className="benchmark-preset-btns">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`benchmark-preset-btn ${activePreset === p.key ? "benchmark-preset-btn--active" : ""}`}
              onClick={() => loadPreset(p.key, p.fixture as any, p.label)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="benchmark-inputs">
        <label className="benchmark-label">
          Expected CT sf
          <input
            type="number"
            className="benchmark-input"
            value={expectedCt}
            onChange={(e) => { setExpectedCt(e.target.value); clearContext(); }}
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
            onChange={(e) => { setExpectedBs(e.target.value); clearContext(); }}
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
            onChange={(e) => { setToleranceSf(e.target.value); clearContext(); }}
            placeholder="2"
            step="0.5"
            min="0"
          />
        </label>
        <div className="benchmark-actions">
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

      {simpleResult && (
        <div className="benchmark-results">
          {/* Simple CT/BS/Combined table */}
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
              <tr className={simpleResult.countertopPass ? "" : "benchmark-row--fail"}>
                <td className="benchmark-category">Countertop</td>
                <td>{simpleResult.expectedCountertopSf.toFixed(2)} sf</td>
                <td>{simpleResult.computedCountertopSf.toFixed(2)} sf</td>
                <td className={simpleResult.countertopDeltaSf < 0 ? "benchmark-delta--neg" : "benchmark-delta--pos"}>
                  {fmtDelta(simpleResult.countertopDeltaSf)}
                </td>
                <td>{fmtPct(simpleResult.countertopPctError)}</td>
                <td>{simpleResult.countertopPass ? "✓" : "✗"}</td>
              </tr>
              <tr className={simpleResult.backsplashPass ? "" : "benchmark-row--fail"}>
                <td className="benchmark-category">
                  Backsplash
                  {simpleResult.backsplashHighSeverity && (
                    <span className="benchmark-severity-flag" title="Expected backsplash but computed 0 sf"> ⚠</span>
                  )}
                </td>
                <td>{simpleResult.expectedBacksplashSf.toFixed(2)} sf</td>
                <td>{simpleResult.computedBacksplashSf.toFixed(2)} sf</td>
                <td className={simpleResult.backsplashDeltaSf < 0 ? "benchmark-delta--neg" : "benchmark-delta--pos"}>
                  {fmtDelta(simpleResult.backsplashDeltaSf)}
                </td>
                <td>{fmtPct(simpleResult.backsplashPctError)}</td>
                <td>{simpleResult.backsplashPass ? "✓" : "✗"}</td>
              </tr>
              <tr>
                <td className="benchmark-category">Combined</td>
                <td>{simpleResult.expectedCombinedSf.toFixed(2)} sf</td>
                <td>{simpleResult.computedCombinedSf.toFixed(2)} sf</td>
                <td className={simpleResult.combinedDeltaSf < 0 ? "benchmark-delta--neg" : "benchmark-delta--pos"}>
                  {fmtDelta(simpleResult.combinedDeltaSf)}
                </td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>

          <div className="benchmark-footer">
            <span className={simpleSummaryClass(simpleResult.summary)}>
              {simpleSummaryLabel(simpleResult.summary)}
            </span>
            <span className="benchmark-tolerance">
              Tolerance: ±{simpleResult.toleranceSf} sf
            </span>
            {simpleResult.backsplashHighSeverity && (
              <span className="benchmark-high-severity">
                ⚠ Backsplash expected but computed = 0.00 sf — check structured backsplashLinearIn
              </span>
            )}
          </div>

          {/* Rich evaluator output (preset only) */}
          {richResult && (
            <details className="benchmark-rich" open>
              <summary className="benchmark-rich-title">
                Evaluator analysis
                {activeFixture && (
                  <span className="benchmark-rich-category">
                    {" · "}{(activeFixture as any).category ?? ""}
                  </span>
                )}
              </summary>

              <div className="benchmark-rich-body">

                {/* Final recommendation + failure category */}
                <div className="benchmark-rich-row">
                  <span className="benchmark-rich-key">Recommendation</span>
                  <span className={richRecommendationClass(richResult.finalRecommendation)}>
                    {richRecommendationLabel(richResult.finalRecommendation)}
                  </span>
                </div>

                {richResult.failureCategory !== "none" && (
                  <div className="benchmark-rich-row">
                    <span className="benchmark-rich-key">Failure category</span>
                    <span className="benchmark-rich-value benchmark-rich-value--warn">
                      {failureCategoryLabel(richResult.failureCategory)}
                    </span>
                  </div>
                )}

                {/* Review gate */}
                {richResult.reviewGate.expectedReviewRequired && (
                  <div className="benchmark-rich-row">
                    <span className="benchmark-rich-key">Review gate</span>
                    <span className="benchmark-rich-value">
                      Review required — {richResult.reviewGate.modelAttemptedAutoPass
                        ? "computed totals would otherwise pass"
                        : "metrics also failed"}
                    </span>
                  </div>
                )}

                {/* Reference totals captured */}
                {richResult.referenceTotals.expectedCaptured > 0 && (
                  <div className="benchmark-rich-row">
                    <span className="benchmark-rich-key">Ref totals</span>
                    <span className="benchmark-rich-value">
                      {richResult.referenceTotals.captured} / {richResult.referenceTotals.expectedCaptured} captured
                      {richResult.referenceTotals.noBacksplashCorrect === false && (
                        <span className="benchmark-rich-value--warn"> · No-BS conflict</span>
                      )}
                      {richResult.referenceTotals.mismatchWarnings.length > 0 && (
                        <span className="benchmark-rich-value--warn">
                          {" · "}{richResult.referenceTotals.mismatchWarnings.length} mismatch warning(s)
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Evidence coverage */}
                <div className="benchmark-rich-row">
                  <span className="benchmark-rich-key">Evidence coverage</span>
                  <span className={richResult.evidenceCoverage.pass ? "benchmark-rich-value--ok" : "benchmark-rich-value--warn"}>
                    {richResult.evidenceCoverage.pass
                      ? "All high-confidence dims used"
                      : `${richResult.evidenceCoverage.unusedHighConfidenceDimensions} dim(s) not used in final runs`}
                  </span>
                </div>

                {/* Validator failures */}
                {richResult.validatorFailures.length > 0 && (
                  <div className="benchmark-rich-failures">
                    <span className="benchmark-rich-key">Validator failures</span>
                    <ul className="benchmark-rich-failure-list">
                      {richResult.validatorFailures.map((msg, i) => (
                        <li key={i} className="benchmark-rich-failure-item">{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evaluator notes */}
                {richResult.notes.length > 0 && (
                  <details className="benchmark-rich-notes-detail">
                    <summary className="benchmark-rich-key">Notes ({richResult.notes.length})</summary>
                    <ul className="benchmark-rich-notes-list">
                      {richResult.notes.map((n, i) => (
                        <li key={i} className="benchmark-rich-note">{n}</li>
                      ))}
                    </ul>
                  </details>
                )}

              </div>
            </details>
          )}

          <label className="benchmark-notes-label">
            QA notes (local only — not saved)
            <textarea
              className="benchmark-notes"
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Island shrank in prompt v5; backsplash note ambiguous — review dimensions manually"
            />
          </label>
        </div>
      )}

      {!simpleResult && canEvaluate && (
        <p className="benchmark-hint">
          Press &ldquo;Evaluate current draft&rdquo; to compare eliteOS computed totals against your target.
        </p>
      )}

      {!canEvaluate && (
        <p className="benchmark-hint">
          Select a preset or enter expected countertop and backsplash sf to evaluate.
        </p>
      )}
    </div>
  );
}
