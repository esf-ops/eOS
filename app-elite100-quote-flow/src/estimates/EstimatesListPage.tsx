import React from "react";

/**
 * Estimates — running list of scoped estimates.
 * Slice 1A: shell placeholder only (no scope editing yet).
 */
export default function EstimatesListPage() {
  return (
    <section className="qf-page" data-testid="qf-estimates-page">
      <header className="qf-page__header">
        <h1>Estimates</h1>
        <p className="qf-muted">
          Scoped estimates live here after Set Scope. Open an estimate to edit official scope and
          pricing later — future revisions are manual and do not rerun AI Takeoff.
        </p>
      </header>
      <div className="qf-placeholder" data-testid="qf-estimates-placeholder">
        <p>
          The Estimates list and detail workspace will appear after Set Scope is wired. Pricing and
          estimate approval remain separate later steps — not part of this shell.
        </p>
      </div>
    </section>
  );
}
