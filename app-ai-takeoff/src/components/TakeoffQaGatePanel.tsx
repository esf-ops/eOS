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
  status:              "ready_for_review" | "needs_review" | "do_not_import";
  severity:            "green" | "yellow" | "red";
  headline:            string;
  summary:             string;
  topIssues:           QaGateIssue[];
  positiveSignals:     string[];
  reviewChecklist:     string[];
  importBlockedReason: string | null;
}

interface Props {
  qaGate: QaGateResult;
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
    validator:       "Validator",
    evidence:        "Evidence",
    reference_total: "Ref total",
    benchmark:       "Benchmark",
    page_inventory:  "Page inv",
  };
  return MAP[source] ?? source;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffQaGatePanel({ qaGate }: Props) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);

  const { status, severity, headline, summary, topIssues, positiveSignals, reviewChecklist } = qaGate;

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

      {/* Top issues */}
      {topIssues.length > 0 && (
        <div className="qa-gate-issues">
          {topIssues.map((issue, i) => (
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

      {/* Import note */}
      <div className="qa-gate-footer">
        <span className="qa-gate-footer-note">
          Import to Internal Estimate is not yet enabled in v5.8.
          This QA result is for estimator review guidance only.
        </span>
      </div>
    </div>
  );
}
