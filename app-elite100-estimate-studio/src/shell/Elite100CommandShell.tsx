import React, { type ReactNode } from "react";
import Elite100MetricCard from "./Elite100MetricCard";

export type Elite100CommandMetric = {
  key: string;
  label: string;
  value: string | number;
  emphasize?: boolean;
};

export type Elite100CommandShellProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  workspaceName?: string;
  workspaceMeta?: string;
  metrics?: Elite100CommandMetric[];
  /** When false, hide the hero (e.g. deep-linked Studio V2 workspace). */
  showHero?: boolean;
  children?: ReactNode;
};

/**
 * Command-center chrome for Elite 100 Estimate Studio.
 * Presentation only — does not own auth, routing, or estimate authority.
 */
export default function Elite100CommandShell({
  eyebrow = "Internal tool · Elite 100",
  title = "Elite 100 Estimate Studio",
  subtitle = "Quote request → estimate → Digital Estimate → customer selection → accepted / sold review",
  workspaceName = "Elite Stone Fabrication",
  workspaceMeta = "on eliteOS",
  metrics,
  showHero = true,
  children,
}: Elite100CommandShellProps) {
  const metricCards = Array.isArray(metrics) ? metrics : [];

  return (
    <div className="e100-command" data-testid="elite100-command-shell">
      {showHero ? (
        <section className="e100-hero" aria-labelledby="e100-hero-title" data-testid="elite100-command-hero">
          <div className="e100-hero-aurora" aria-hidden />
          <div className="e100-hero-grid">
            <div className="e100-hero-main">
              <p className="e100-hero-eyebrow">{eyebrow}</p>
              <h1 id="e100-hero-title" className="e100-hero-title">
                {title}
              </h1>
              <p className="e100-hero-sub">{subtitle}</p>
              <p className="e100-hero-flow" aria-label="Workflow stages">
                <span>Inbox</span>
                <span aria-hidden="true">→</span>
                <span>Estimate</span>
                <span aria-hidden="true">→</span>
                <span>Digital Estimate</span>
                <span aria-hidden="true">→</span>
                <span>Customer</span>
                <span aria-hidden="true">→</span>
                <span>Accepted</span>
              </p>
            </div>
            <aside className="e100-hero-workspace" aria-label={`Workspace · ${workspaceName}`}>
              <p className="e100-hero-workspace-eyebrow">Workspace</p>
              <div className="e100-hero-workspace-card">
                <div className="e100-hero-workspace-mark" aria-hidden>
                  ESF
                </div>
                <div className="e100-hero-workspace-text">
                  <p className="e100-hero-workspace-name">{workspaceName}</p>
                  <p className="e100-hero-workspace-meta">{workspaceMeta}</p>
                </div>
              </div>
            </aside>
          </div>
          {metricCards.length ? (
            <div
              className="e100-hero-metrics"
              role="list"
              aria-label="Studio overview metrics"
              data-testid="elite100-command-metrics"
            >
              {metricCards.map((m) => {
                const empty =
                  m.value === "—" ||
                  m.value === 0 ||
                  m.value === "0" ||
                  m.value === "$0";
                return (
                  <Elite100MetricCard
                    key={m.key}
                    label={m.label}
                    value={m.value}
                    emphasize={m.emphasize}
                    empty={empty}
                    testId={`elite100-metric-${m.key}`}
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
      {children}
    </div>
  );
}
