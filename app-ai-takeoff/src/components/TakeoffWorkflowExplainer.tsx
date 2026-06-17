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

export default function TakeoffWorkflowExplainer() {
  return (
    <div className="takeoff-workflow" aria-label="AI Takeoff workflow">
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
              <span className="takeoff-workflow-step-detail">{step.detail}</span>
            </div>
          </li>
        ))}
      </ol>

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
    </div>
  );
}
