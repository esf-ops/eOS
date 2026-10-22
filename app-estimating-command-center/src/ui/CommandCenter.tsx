import { useMemo } from "react";
import { attentionQueue, colorReport, computeMetrics, handoffQueue, jobRow } from "../lib/eccModel.mjs";
import { workspaceMetrics } from "../lib/workspaceModel.mjs";
import { Phase2, SectionHead, Source, Unknown, fmt, text } from "./common";
import type { Dataset, DrillTarget, Period } from "./Workspace";

function ageLabel(hours: number | null) {
  if (hours == null) return "—";
  if (hours < 1) return "<1h ago";
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const HANDOFF_LABEL: Record<string, string> = {
  not_sold: "—",
  awaiting_handoff: "Not sent",
  awaiting_tanya: "With Tanya",
  in_progress: "Tanya working",
  initiated: "In Moraware",
};

type Props = {
  dataset: Dataset;
  customers: any[];
  period: Period;
  freshness: Record<string, { state: string; ageHours: number | null }>;
  onDrill: (target: DrillTarget) => void;
  onOpenProject: (id: string) => void;
};

export default function CommandCenter({ dataset, customers, period, freshness, onDrill, onOpenProject }: Props) {
  const asOf = dataset.asOf;
  const metrics = useMemo(
    () => computeMetrics(dataset.opportunities, { from: period.from, to: period.to, asOf, freshnessByKey: freshness }),
    [dataset, period, asOf, freshness],
  );
  const finance = useMemo(
    () => workspaceMetrics(dataset.opportunities, customers, { from: period.from, to: period.to, freshnessByKey: freshness }),
    [dataset, customers, period, freshness],
  );
  const attention = useMemo(() => attentionQueue(dataset.opportunities, asOf), [dataset, asOf]);
  const colors = useMemo(() => colorReport(dataset.opportunities, period), [dataset, period]);
  const handoffs = useMemo(() => handoffQueue(dataset.opportunities, asOf), [dataset, asOf]);
  const rowById = useMemo(() => Object.fromEntries(dataset.opportunities.map((o) => [o.id, jobRow(o, asOf)])), [dataset, asOf]);

  const workflowItems = attention.filter((a) => !a.kind.startsWith("data_"));
  const dataGaps = attention.filter((a) => a.kind.startsWith("data_"));
  const v1Metrics = metrics.filter((m) => m.key !== "awaiting_handoff");

  return (
    <>
      <section className="ecc-card" aria-labelledby="ecc-fresh">
        <h2 id="ecc-fresh">Source freshness</h2>
        <div className="ecc-fresh-grid">
          {dataset.sources.map((s) => {
            const f = freshness[s.key];
            return (
              <div key={s.key} className={`ecc-fresh ecc-fresh-${f.state}`} title={s.table}>
                <div className="ecc-fresh-top">
                  <span className="ecc-fresh-label">{s.label}</span>
                  <span className={`ecc-pill ecc-pill-${f.state}`}>{f.state}</span>
                </div>
                <div className="ecc-fresh-age">{f.state === "static" ? "Configuration" : `Last success ${ageLabel(f.ageHours)}`}</div>
                <div className="ecc-fresh-meta">
                  {s.authority} · {s.cadence}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="ecc-card" aria-labelledby="ecc-metrics">
        <SectionHead title={`Quotes & sales orders · ${period.label}`} system="quickbooks">
          <span className="ecc-muted">Click a metric to open its jobs</span>
        </SectionHead>
        <div className="ecc-metric-grid">
          {v1Metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`ecc-metric ecc-metric-${m.state}`}
              onClick={() => onDrill({ kind: "projects", label: m.label, ids: m.drill })}
              title={m.definition}
            >
              <span className="ecc-metric-label">{m.label}</span>
              <span className="ecc-metric-value">{fmt(m.value, m.format, m.reason)}</span>
              <span className={`ecc-pill ecc-pill-${m.state}`}>{m.state}</span>
              {m.reason ? <span className="ecc-metric-reason">{m.reason}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="ecc-card" aria-labelledby="ecc-ar">
        <SectionHead title="Receivables & reconciliation" system="quickbooks">
          <span className="ecc-muted">Same A/R rows and aging rules as Finance and Account 360</span>
        </SectionHead>
        <div className="ecc-metric-grid">
          {finance.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`ecc-metric ecc-metric-${m.state}`}
              onClick={() => onDrill({ kind: m.drillKind as DrillTarget["kind"], label: m.label, ids: m.drill })}
              title={m.definition}
            >
              <span className="ecc-metric-label">
                {m.label} <Source system={m.owner as any} />
              </span>
              <span className="ecc-metric-value">{fmt(m.value, m.format, m.reason)}</span>
              <span className={`ecc-pill ecc-pill-${m.state}`}>{m.state}</span>
              {m.reason ? <span className="ecc-metric-reason">{m.reason}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <div className="ecc-two-col">
        <section className="ecc-card" aria-labelledby="ecc-gaps">
          <SectionHead title="Record-link gaps" system="derived">
            <span className="ecc-muted">{dataGaps.length} to validate before workflow</span>
          </SectionHead>
          <ul className="ecc-list">
            {dataGaps.map((a, i) => (
              <li key={`${a.oppId}-${a.kind}-${i}`} className="ecc-attn ecc-sev-low">
                <button type="button" className="ecc-link" onClick={() => onOpenProject(a.oppId)}>
                  {rowById[a.oppId]?.customer ?? "Unknown customer"} — {rowById[a.oppId]?.project ?? "Unknown project"}
                </button>
                <span>{a.message}</span>
              </li>
            ))}
            {dataGaps.length === 0 ? <li className="ecc-muted">No link gaps.</li> : null}
          </ul>
        </section>

        <section className="ecc-card" aria-labelledby="ecc-colors">
          <SectionHead title={`Color report · ${period.label}`} system="quickbooks">
            <span className="ecc-muted">
              {colors.totals.jobs} jobs · {colors.totals.multiColorJobs} multi-color · {colors.totals.unknownColorJobs} unknown
            </span>
          </SectionHead>
          <p className="ecc-note">A multi-color job counts once under each color, so per-color counts can exceed total jobs.</p>
          <table className="ecc-table compact">
            <thead>
              <tr>
                <th>Color</th>
                <th className="num">Jobs</th>
                <th className="num">Sold</th>
                <th className="num">Sq ft (known)</th>
              </tr>
            </thead>
            <tbody>
              {colors.rows.map((c) => (
                <tr key={c.key}>
                  <td>
                    <button type="button" className="ecc-link" onClick={() => onDrill({ kind: "projects", label: `Color: ${c.label}`, ids: c.drill })}>
                      {c.label}
                    </button>
                  </td>
                  <td className="num">{c.jobs}</td>
                  <td className="num">{c.soldJobs}</td>
                  <td className="num">{fmt(c.sqft, "count", "No line square footage")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <Phase2 title="Follow-ups, assignments and sold-job handoff">
        Built after reporting and record links are validated. Follow-ups extend Account Directory follow-ups with an optional project
        reference; assignments and Tanya's handoff are slabOS records keyed to the project. None of them change QuickBooks sold status
        or Moraware production status.
        <details className="ecc-details">
          <summary>Preview with fixture data ({workflowItems.length} follow-up items · {handoffs.length} sold jobs)</summary>
          <ul className="ecc-list">
            {workflowItems.map((a, i) => (
              <li key={`${a.oppId}-${a.kind}-${i}`} className={`ecc-attn ecc-sev-${a.severity}`}>
                <button type="button" className="ecc-link" onClick={() => onOpenProject(a.oppId)}>
                  {rowById[a.oppId]?.project ?? a.oppId}
                </button>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
          <table className="ecc-table compact">
            <thead>
              <tr>
                <th>Sold job</th>
                <th>Sold</th>
                <th>Handoff</th>
              </tr>
            </thead>
            <tbody>
              {handoffs.map((h: ReturnType<typeof handoffQueue>[number]) => (
                <tr key={h.id}>
                  <td>
                    <button type="button" className="ecc-link" onClick={() => onOpenProject(h.id)}>
                      {text(h.project)}
                    </button>
                  </td>
                  <td>{h.daysSinceSold != null ? `${h.daysSinceSold}d ago` : <Unknown />}</td>
                  <td>{HANDOFF_LABEL[h.stage]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Phase2>
    </>
  );
}
