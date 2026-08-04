import React from "react";

/**
 * Estimate Queue — verify AI-proposed dimensions, then Set Scope.
 * Slice 1A: shell placeholder only (no Set Scope / takeoff review yet).
 */
export default function EstimateQueuePage() {
  return (
    <section className="qf-page" data-testid="qf-queue-page">
      <header className="qf-page__header">
        <h1>Estimate Queue</h1>
        <p className="qf-muted">
          Review returned AI Takeoff measurements against the plan. When dimensions look right, use{" "}
          <strong>Set Scope</strong> to make them the official estimate scope. AI Takeoff is then
          complete for that estimate.
        </p>
      </header>
      <div className="qf-placeholder" data-testid="qf-queue-placeholder">
        <p>
          Takeoff review and Set Scope will appear in the next slice. This queue is for verifying
          proposed dimensions only — not for pricing, estimate approval, or publishing.
        </p>
      </div>
    </section>
  );
}
