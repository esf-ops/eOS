/**
 * TakeoffQaGatePanel — automatic QA gate result card (v5.8).
 *
 * Shows an estimator-facing summary of the AI takeoff quality after every AI draft.
 * The user does not need to inspect JSON or choose benchmark presets to understand
 * whether the takeoff is usable.
 *
 * Statuses:
 *   ready_for_review  — green  — No critical issues; estimator can review and approve.
 *   needs_review      — yellow — Issues found; estimator review required before use.
 *   do_not_import     — red    — Critical issues; result likely incomplete or conflicting.
 *
 * Import remains disabled in v5.8 regardless of QA status.
 * AI output is evidence, not authority.
 */
import React, { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QaGateIssue {
  code:              string;
  label:             string;
  severity:          "info" | "warning" | "critical";
  message:           string;
  recommendedAction: string;
  source:            string;
}

export interface QaGateResult {
  status:                  "ready_for_review" | "needs_review" | "do_not_import";
  severity:                "green" | "yellow" | "red";
  headline:                string;
  summary:                 string;
  topIssues:               QaGateIssue[];
  positiveSignals:         string[];
  reviewChecklist:         string[];
  importBlockedReason:     string | null;
  benchmarkContextActive?: boolean;
}

interface Props {
  qaGate: QaGateResult;
  /** Optional fabrication rule findings for the dedicated "Fabrication rules" subsection. */
  fabricationFindings?: FabricationFinding[];
}

/** Lightweight shape for fabrication rule findings passed to the panel. */
export interface FabricationFinding {
  code:    string;
  level:   "info" | "warning" | "error";
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusIcon(severity: "green" | "yellow" | "red"): string {
  return severity === "green" ? "✓" : severity === "yellow" ? "⚠" : "✗";
}

function issueIcon(severity: "info" | "warning" | "critical"): string {
  return severity === "critical" ? "✗" : severity === "warning" ? "⚠" : "ℹ";
}

function sourceBadge(source: string): string {
  const MAP: Record<string, string> = {
    validator:         "Validator",
    evidence:          "Evidence",
    reference_total:   "Ref total",
    benchmark:         "Benchmark",
    page_inventory:    "Page inv",
    fabrication_rule:  "Fab rules",
    evidence_reconciliation: "Evidence",
  };
  return MAP[source] ?? source;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffQaGatePanel({ qaGate, fabricationFindings }: Props) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);

  const { status, severity, headline, summary, topIssues, positiveSignals, reviewChecklist } = qaGate;

  const displayIssues = fabricationFindings?.length
    ? topIssues.filter((issue) => issue.source !== "fabrication_rule")
    : topIssues;

  const hasBlockingFabRules = Boolean(
    fabricationFindings?.some((f) => f.level === "error")
  );

  return (
    <div className={`qa-gate-card lab-card qa-gate-card--${severity}`}>

      {/* Status badge + headline */}
      <div className="qa-gate-header">
        <span className={`qa-gate-badge qa-gate-badge--${severity}`}>
          {statusIcon(severity)}{" "}
          {status === "ready_for_review" ? "Ready for estimator review"
            : status === "needs_review"  ? "Needs estimator review"
            : "Do not import"}
        </span>
        <span className="qa-gate-headline">{headline}</span>
      </div>

      {/* Summary */}
      <p className="qa-gate-summary">{summary}</p>

      {/* Top issues (fabrication rules shown separately below) */}
      {displayIssues.length > 0 && (
        <div className="qa-gate-issues">
          {displayIssues.map((issue, i) => (
            <div key={i} className={`qa-gate-issue qa-gate-issue--${issue.severity}`}>
              <div className="qa-gate-issue-header">
                <span className="qa-gate-issue-icon">{issueIcon(issue.severity)}</span>
                <span className="qa-gate-issue-label">{issue.label}</span>
                <span className="qa-gate-issue-source">{sourceBadge(issue.source)}</span>
              </div>
              <p className="qa-gate-issue-msg">{issue.message}</p>
              <p className="qa-gate-issue-action">
                <strong>Action:</strong> {issue.recommendedAction}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Positive signals (collapsible) */}
      {positiveSignals.length > 0 && (
        <details
          className="qa-gate-signals"
          open={signalsOpen}
          onToggle={(e) => setSignalsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="qa-gate-signals-title">
            {positiveSignals.length} positive signal{positiveSignals.length !== 1 ? "s" : ""}
          </summary>
          <ul className="qa-gate-signals-list">
            {positiveSignals.map((s, i) => (
              <li key={i} className="qa-gate-signal">
                <span className="qa-gate-signal-check">✓</span> {s}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Fabrication rules subsection (v6.2) */}
      {fabricationFindings && fabricationFindings.length > 0 && (
        <details className="qa-gate-fab-rules" open={hasBlockingFabRules || undefined}>
          <summary className="qa-gate-fab-rules-title">
            Fabrication rules — technical detail ({fabricationFindings.length})
          </summary>
          <ul className="qa-gate-fab-rules-list">
            {fabricationFindings.map((f, i) => {
              const icon = f.level === "error" ? "✗" : f.level === "warning" ? "⚠" : "ℹ";
              return (
                <li key={i} className={`qa-gate-fab-rule qa-gate-fab-rule--${f.level}`}>
                  <span className="qa-gate-fab-rule-icon">{icon}</span>
                  <span className="qa-gate-fab-rule-msg">{f.message}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Review checklist (collapsible) */}
      <details
        className="qa-gate-checklist"
        open={checklistOpen}
        onToggle={(e) => setChecklistOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="qa-gate-checklist-title">
          Estimator review checklist ({reviewChecklist.length} items)
        </summary>
        <ul className="qa-gate-checklist-list">
          {reviewChecklist.map((item, i) => (
            <li key={i} className="qa-gate-checklist-item">
              <span className="qa-gate-checklist-box" role="checkbox" aria-checked="false" />
              {item}
            </li>
          ))}
        </ul>
      </details>

      {/* Import note + benchmark context indicator */}
      <div className="qa-gate-footer">
        {qaGate.benchmarkContextActive && (
          <span className="qa-gate-benchmark-note">
            ◎ QA includes selected benchmark target.
          </span>
        )}
        <span className="qa-gate-footer-note">
          Import to Internal Estimate is not yet enabled in v5.8.
          This QA result is for estimator review guidance only.
        </span>
      </div>
    </div>
  );
}
