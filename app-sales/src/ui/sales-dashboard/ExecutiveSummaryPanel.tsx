import React from "react";
import { useSalesDashboard } from "./SalesDashboardContext";

export default function ExecutiveSummaryPanel() {
  const {
    data,
    loading,
    copyExecutiveSummary,
    copyMsg,
    executiveSummaryOpen,
    setExecutiveSummaryOpen
  } = useSalesDashboard();

  const summary = data?.executiveSummary;
  if (loading || !summary) return null;

  return (
    <section className="sd-exec-summary" aria-label="Executive summary">
      <header className="sd-exec-summary-head">
        <div>
          <p className="sd-exec-eyebrow">Executive summary</p>
          <h2 className="sd-exec-title">{summary.headline}</h2>
        </div>
        <div className="sd-exec-actions">
          <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={() => setExecutiveSummaryOpen(!executiveSummaryOpen)}>
            {executiveSummaryOpen ? "Collapse" : "Expand"}
          </button>
          <button type="button" className="sd-btn sd-btn--primary sd-btn--sm" onClick={() => void copyExecutiveSummary()} disabled={loading}>
            {copyMsg || "Copy executive summary"}
          </button>
        </div>
      </header>

      {executiveSummaryOpen ? (
        <div className="sd-exec-grid">
          {summary.highlights.length ? (
            <div className="sd-exec-block sd-exec-block--positive">
              <h3>Highlights</h3>
              <ul>{summary.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          ) : null}
          {summary.risks.length ? (
            <div className="sd-exec-block sd-exec-block--warn">
              <h3>Risks</h3>
              <ul>{summary.risks.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : null}
          {summary.opportunities.length ? (
            <div className="sd-exec-block sd-exec-block--info">
              <h3>Opportunities</h3>
              <ul>{summary.opportunities.map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
          ) : null}
          {summary.caveats.length ? (
            <div className="sd-exec-block sd-exec-block--muted">
              <h3>Data caveats</h3>
              <ul>{summary.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          ) : null}
          {summary.suggestedActions.length ? (
            <div className="sd-exec-block sd-exec-block--action">
              <h3>Suggested actions</h3>
              <ul>{summary.suggestedActions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
