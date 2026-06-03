/**
 * TakeoffEvidenceTracePanel — compact evidence trace view for the AI Takeoff Lab (v6.0).
 *
 * Shows per-run traceability: which evidence dimension supported each final run,
 * and flags runs that are unsupported, changed, or conflicting.
 *
 * Design constraints:
 *   - Only shown when dimensionEvidence is available (AI draft mode).
 *   - Compact — one row per run; warnings expand inline.
 *   - Lab-internal only; never shown in Internal Estimate or Quote Library.
 *   - Pure display: calls the reconcileRunsWithEvidence helper directly in the browser.
 */

import React, { useMemo } from "react";
import { reconcileRunsWithEvidence } from "@takeoff-core/takeoffEvidenceRunReconciliation.mjs";
import type { DimensionEvidence } from "./TakeoffDimensionEvidencePanel";
import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunLink {
  runId:         string;
  runLabel:      string;
  runPath:       string;
  lengthIn:      number;
  depthIn:       number;
  sourcePages:   number[];
  verdict:       "supported" | "changed" | "unsupported" | "exempt";
  matchedDims:   EvidenceDimInfo[];
  nearestChanged: EvidenceDimInfo | null;
  conflicting:   boolean;
  depthStandard: boolean;
}

interface EvidenceDimInfo {
  id?:        string;
  label:      string;
  lengthIn:   number;
  depthIn?:   number | null;
  pageNumber?: number;
}

interface ReconciliationResult {
  runLinks:                    RunLink[];
  unusedHighConfidenceDimensions: EvidenceDimInfo[];
  unsupportedRuns:             RunLink[];
  changedRuns:                 RunLink[];
  conflictingRuns:             RunLink[];
  cornerDeductionWarnings:     Array<{ areaPath: string; areaLabel: string }>;
  assemblyReviewRuns:          Array<{ runId: string; runLabel: string; runPath: string }>;
  diagnostics:                 Array<{ code: string; message: string }>;
  checksRan:                   boolean;
}

export interface TakeoffEvidenceTracePanelProps {
  result:           TakeoffResult;
  dimensionEvidence: DimensionEvidence | null;
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

function VerdictBadge({ verdict, conflicting }: { verdict: RunLink["verdict"]; conflicting: boolean }) {
  if (verdict === "supported" && !conflicting) {
    return <span className="et-badge et-badge--ok" title="Run length matches evidence">✓ supported</span>;
  }
  if (verdict === "supported" && conflicting) {
    return <span className="et-badge et-badge--warn" title="Multiple evidence dimensions nearby">⚠ conflict</span>;
  }
  if (verdict === "changed") {
    return <span className="et-badge et-badge--warn" title="Run length modified from evidence">⚠ changed</span>;
  }
  if (verdict === "unsupported") {
    return <span className="et-badge et-badge--error" title="No evidence supports this length">✗ unsupported</span>;
  }
  return <span className="et-badge et-badge--muted">exempt</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TakeoffEvidenceTracePanel({
  result,
  dimensionEvidence,
}: TakeoffEvidenceTracePanelProps) {
  const reconciliation = useMemo<ReconciliationResult | null>(() => {
    if (!result || !dimensionEvidence) return null;
    try {
      return reconcileRunsWithEvidence({
        takeoffResult: result,
        dimensionEvidence,
      }) as ReconciliationResult;
    } catch {
      return null;
    }
  }, [result, dimensionEvidence]);

  if (!reconciliation) {
    return (
      <div className="et-panel lab-card">
        <p className="et-empty">Evidence trace is only available after a Gemini/AI draft is generated.</p>
      </div>
    );
  }

  if (!reconciliation.checksRan) {
    return (
      <div className="et-panel lab-card">
        <p className="et-empty">
          No high-confidence countertop evidence dimensions were extracted — cannot trace runs to evidence.
          Check the Dimension evidence section for details.
        </p>
        {reconciliation.cornerDeductionWarnings.length > 0 && (
          <ul className="et-issue-list" role="list">
            {reconciliation.cornerDeductionWarnings.map((w, i) => (
              <li key={i} className="et-issue et-issue--warn">
                <span className="et-issue-icon">⚠</span>
                <span>Area <strong>"{w.areaLabel}"</strong>: cornerDeductions present but no L-Shape/U-Shape overlapMode set.</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const counterRuns = reconciliation.runLinks.filter((r) => r.verdict !== "exempt");
  const problemRuns = counterRuns.filter(
    (r) => r.verdict !== "supported" || r.conflicting
  );

  return (
    <div className="et-panel lab-card">
      {/* ── Summary bar ──────────────────────────────────────────────────── */}
      <div className="et-summary-bar">
        <span className="et-summary-item et-summary-item--ok">
          {counterRuns.filter((r) => r.verdict === "supported" && !r.conflicting).length} supported
        </span>
        {reconciliation.changedRuns.length > 0 && (
          <span className="et-summary-item et-summary-item--warn">
            {reconciliation.changedRuns.length} changed
          </span>
        )}
        {reconciliation.unsupportedRuns.length > 0 && (
          <span className="et-summary-item et-summary-item--error">
            {reconciliation.unsupportedRuns.length} unsupported
          </span>
        )}
        {reconciliation.conflictingRuns.length > 0 && (
          <span className="et-summary-item et-summary-item--warn">
            {reconciliation.conflictingRuns.length} conflict
          </span>
        )}
        {reconciliation.unusedHighConfidenceDimensions.length > 0 && (
          <span className="et-summary-item et-summary-item--warn">
            {reconciliation.unusedHighConfidenceDimensions.length} evidence unused
          </span>
        )}
      </div>

      {/* ── Per-run table ──────────────────────────────────────────────────── */}
      <div className="et-run-table" role="table" aria-label="Evidence trace by run">
        <div className="et-run-row et-run-row--header" role="row">
          <span role="columnheader">Run</span>
          <span role="columnheader">Length</span>
          <span role="columnheader">Depth</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Evidence used</span>
        </div>

        {counterRuns.map((link) => (
          <div
            key={link.runId}
            className={`et-run-row${link.verdict === "unsupported" ? " et-run-row--error" : link.verdict === "changed" || link.conflicting ? " et-run-row--warn" : ""}`}
            role="row"
          >
            <span className="et-run-label" role="cell">{link.runLabel}</span>
            <span role="cell" className="et-run-dim">{link.lengthIn}"</span>
            <span role="cell" className="et-run-dim">
              {link.depthIn}"
              {link.depthStandard && <span className="et-dim-note"> (std)</span>}
            </span>
            <span role="cell">
              <VerdictBadge verdict={link.verdict} conflicting={link.conflicting} />
            </span>
            <span role="cell" className="et-evidence-ref">
              {link.verdict === "supported" && !link.conflicting && link.matchedDims.length > 0 && (
                <span className="et-ev-match">
                  "{link.matchedDims[0].label}" {link.matchedDims[0].lengthIn}" · p.{link.matchedDims[0].pageNumber ?? "?"}
                </span>
              )}
              {link.verdict === "changed" && link.nearestChanged && (
                <span className="et-ev-change">
                  nearest: "{link.nearestChanged.label}" {link.nearestChanged.lengthIn}" · p.{link.nearestChanged.pageNumber ?? "?"}
                  {" "}(Δ{Math.abs(link.lengthIn - (link.nearestChanged.lengthIn ?? 0)).toFixed(1)}")
                </span>
              )}
              {link.verdict === "unsupported" && (
                <span className="et-ev-none">no match within ±10"</span>
              )}
              {link.conflicting && link.matchedDims.length > 1 && (
                <span className="et-ev-conflict">
                  {link.matchedDims.length} nearby: {link.matchedDims.map((d) => `${d.lengthIn}"`).join(", ")}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* ── Unused evidence ────────────────────────────────────────────────── */}
      {reconciliation.unusedHighConfidenceDimensions.length > 0 && (
        <div className="et-unused-section">
          <p className="et-unused-title">High-confidence evidence not used in any run:</p>
          <ul className="et-unused-list">
            {reconciliation.unusedHighConfidenceDimensions.map((d, i) => (
              <li key={i} className="et-unused-item">
                "{d.label}" {d.lengthIn}"{d.depthIn != null ? ` × ${d.depthIn}"` : ""} · p.{(d as EvidenceDimInfo).pageNumber ?? "?"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Corner deduction warnings ─────────────────────────────────────── */}
      {reconciliation.cornerDeductionWarnings.length > 0 && (
        <ul className="et-issue-list" role="list">
          {reconciliation.cornerDeductionWarnings.map((w, i) => (
            <li key={i} className="et-issue et-issue--warn">
              <span className="et-issue-icon">⚠</span>
              <span>Area <strong>"{w.areaLabel}"</strong>: cornerDeductions present without L-Shape or U-Shape overlapMode — these deductions incorrectly reduce sf.</span>
            </li>
          ))}
        </ul>
      )}

      {/* ── No problems indicator ─────────────────────────────────────────── */}
      {problemRuns.length === 0 &&
       reconciliation.unusedHighConfidenceDimensions.length === 0 &&
       reconciliation.cornerDeductionWarnings.length === 0 && (
        <p className="et-all-clear">
          ✓ All counter runs are traceable to dimension evidence. No geometry changes detected.
        </p>
      )}
    </div>
  );
}
