/**
 * TakeoffWorkflowExplainer — estimator-facing product clarity for AI Takeoff Lab.
 * Explains the review-only workflow and hard boundaries (no quote, no IE import yet).
 */
import React from "react";

const STEPS = [
  {
    key: "upload",
    label: "Upload plan",
    detail: "Attach a cabinet or measurement PDF to a takeoff workspace.",
  },
  {
    key: "draft",
    label: "Generate AI draft",
    detail: "AI proposes measurements — eliteOS recomputes square footage server-side.",
  },
  {
    key: "review",
    label: "Review & correct",
    detail: "Estimator edits runs, fixes validation issues, and saves a reviewed draft.",
  },
  {
    key: "approve",
    label: "Approve takeoff",
    detail: "Human approval is required before any downstream use.",
  },
  {
    key: "import",
    label: "Import to Internal Estimate",
    detail: "Planned — not enabled in this release.",
    future: true,
  },
] as const;

export interface TakeoffWorkflowExplainerProps {
  /** Shorter layout when an active review session is in progress. */
  compact?: boolean;
}

export default function TakeoffWorkflowExplainer({ compact = false }: TakeoffWorkflowExplainerProps) {
  return (
    <div className={`takeoff-workflow${compact ? " takeoff-workflow--compact" : ""}`} aria-label="AI Takeoff workflow">
      <ol className="takeoff-workflow-steps">
        {STEPS.map((step, index) => (
          <li
            key={step.key}
            className={`takeoff-workflow-step${step.future ? " takeoff-workflow-step--future" : ""}`}
          >
            <span className="takeoff-workflow-step-num" aria-hidden>
              {index + 1}
            </span>
            <div className="takeoff-workflow-step-body">
              <span className="takeoff-workflow-step-label">{step.label}</span>
              {!compact ? (
                <span className="takeoff-workflow-step-detail">{step.detail}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {compact ? (
        <details className="takeoff-workflow-boundaries-wrap">
          <summary className="takeoff-workflow-boundaries-summary">Safety boundaries</summary>
          <ul className="takeoff-workflow-boundaries" aria-label="Important boundaries">
            <li>
              <strong>No quotes created.</strong> Review-only — no quote creation or mutation.
            </li>
            <li>
              <strong>eliteOS recomputes totals.</strong> AI output is never authoritative.
            </li>
            <li>
              <strong>Human approval required.</strong> Stays <code>needs_review</code> until approved.
            </li>
            <li>
              <strong>Internal Estimate import is not enabled yet.</strong>
            </li>
          </ul>
        </details>
      ) : (
      <ul className="takeoff-workflow-boundaries" aria-label="Important boundaries">
        <li>
          <strong>No quotes created.</strong> This head reviews measurements only — it does not
          create, price, or mutate quotes.
        </li>
        <li>
          <strong>eliteOS recomputes totals.</strong> AI output is never authoritative; the server
          validates and recomputes square footage independently.
        </li>
        <li>
          <strong>Human approval required.</strong> Every takeoff stays <code>needs_review</code> until
          an estimator explicitly approves it.
        </li>
        <li>
          <strong>Internal Estimate import is not enabled yet.</strong> Approved takeoffs are stored for
          a future import path — they are not pushed into Internal Estimate today.
        </li>
      </ul>
      )}
    </div>
  );
}
