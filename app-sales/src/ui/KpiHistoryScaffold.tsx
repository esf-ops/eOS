import React from "react";

/**
 * KPI History — planning / scaffold view (NOT LIVE).
 *
 * Communicates the intended Sales Head KPI architecture without inventing
 * fake metrics. Once backend-owned KPI snapshot tables exist (see future
 * tables list below + `docs/eliteos/sales-kpi-history-plan.md`), this view
 * will render real historical KPI panels. Until then, it is intentionally
 * a non-live, explanatory scaffold.
 *
 * Source-of-truth principle:
 *   - Moraware records production / work facts.
 *   - Quote Library records internal estimate / quote facts.
 *   - Partner Quote will record partner / dealer quote facts.
 *   - Sales Head explains and compares those facts; it does not mutate them.
 *
 * No fake KPI values are rendered here. No charts unless explicitly marked
 * planning placeholder. No new backend calls are added by this component.
 */

type SourceStatus = "planned" | "live" | "future";

type SourceCard = {
  source: "Moraware" | "Quote Library" | "Partner Quote" | "Manual import";
  status: SourceStatus;
  title: string;
  sub: string;
  metrics: string[];
};

const SOURCE_CARDS: SourceCard[] = [
  {
    source: "Moraware",
    status: "planned",
    title: "Moraware production KPIs",
    sub: "Sourced from synced Moraware records (`brain_moraware_*` / `moraware_raw_*`). Production / work facts only.",
    metrics: [
      "Installed square footage (week / month / quarter / YTD)",
      "Template count + template activity",
      "Job count by production status",
      "Production process facts (rough, polish, install, etc.) where normalized",
      "Branch / rep attribution only after approved Sales Account Mapping coverage"
    ]
  },
  {
    source: "Quote Library",
    status: "planned",
    title: "Quote Library pipeline KPIs",
    sub: "Sourced from `quote_headers` + Quote Library forecast events. Internal estimate / quote facts.",
    metrics: [
      "Quote count week-over-week",
      "Quote value (sum of grand totals) week-over-week",
      "Sent / sold / lost status counts where available",
      "Average quote value",
      "Branch / rep splits only after approved mapping"
    ]
  },
  {
    source: "Partner Quote",
    status: "future",
    title: "Partner Quote pipeline KPIs",
    sub: "Sourced from future Partner Quote head. Dealer / builder pipeline facts.",
    metrics: [
      "Partner quote count",
      "Partner quote value",
      "Dealer / builder pipeline cohort views",
      "Partner-vs-direct comparison",
      "Approval status / mapping required before trusting attribution"
    ]
  },
  {
    source: "Manual import",
    status: "planned",
    title: "Manual / historical imports",
    sub: "For years before normalized Brain tables existed (or when prepared rollups are unavailable). Imports must be labeled `manual` / `imported`.",
    metrics: [
      "Pre-Brain historical totals (annual / quarterly only)",
      "Founder-entered prior-year benchmarks",
      "Always carries source = `manual_import` and an import note",
      "Cannot overwrite normalized facts for the same period",
      "Never blended silently with live Moraware / Quote Library facts"
    ]
  }
];

const FUTURE_TABLES: Array<{ name: string; role: string }> = [
  {
    name: "sales_kpi_metric_definitions",
    role: "Catalog of named KPIs (e.g. installed_sqft_week, quote_value_week), with source, unit, and trust class."
  },
  {
    name: "sales_kpi_snapshots",
    role:
      "Periodic backend-prepared rollups: (organization_id, metric_id, period_grain, period_start, value, source, computed_at, trust_class)."
  },
  {
    name: "sales_kpi_targets",
    role:
      "Optional targets / quotas per metric, period, branch/rep — admin-edited only; never auto-inferred from production facts."
  },
  {
    name: "sales_kpi_notes",
    role: "Founder/operator annotations attached to a specific metric + period (e.g. 'storm closed Lisbon for 3 days')."
  },
  {
    name: "weekly_quote_pipeline_rollups",
    role: "Prepared Quote Library facts: per-week counts/value/status broken out by source (internal, public, partner)."
  },
  {
    name: "moraware_production_kpi_rollups",
    role: "Prepared Moraware production facts ready for Sales Head consumption without re-scanning raw payloads."
  }
];

function statusLabel(s: SourceStatus): string {
  if (s === "live") return "Live";
  if (s === "future") return "Future head";
  return "Planned";
}

function statusClass(s: SourceStatus): string {
  if (s === "live") return "kpi-source-chip kpi-source-chip--live";
  if (s === "future") return "kpi-source-chip kpi-source-chip--future";
  return "kpi-source-chip kpi-source-chip--planned";
}

export default function KpiHistoryScaffold() {
  return (
    <div className="kpi-scaffold" aria-labelledby="kpi-scaffold-title">
      <section className="kpi-scaffold-hero">
        <p className="kpi-scaffold-eyebrow">Planning · KPI history (not live)</p>
        <h2 id="kpi-scaffold-title" className="kpi-scaffold-title">
          Historical KPI tracking — sourced facts, not invented numbers
        </h2>
        <p className="kpi-scaffold-sub">
          Sales Head is the combined view for <strong>Moraware production facts</strong>,{" "}
          <strong>Quote Library pipeline facts</strong>, future <strong>Partner Quote</strong> facts, and{" "}
          <strong>historical KPI tracking</strong>. Each metric must carry a source, freshness, and trust label.
          Moraware records the work; Quote Library records the quotes; Sales Head explains and compares — it does
          not mutate the underlying systems. No KPI values are drawn here until backend-prepared snapshot tables
          exist.
        </p>

        <div className="kpi-scaffold-pipeline" role="list" aria-label="KPI data flow">
          <article className="kpi-pipeline-step" role="listitem">
            <p className="kpi-pipeline-step-eyebrow">1 · External</p>
            <p className="kpi-pipeline-step-title">Source systems</p>
            <p className="kpi-pipeline-step-sub">
              Moraware (production), Quote Library (internal quotes), future Partner Quote (dealer pipeline).
            </p>
          </article>
          <article className="kpi-pipeline-step" role="listitem">
            <p className="kpi-pipeline-step-eyebrow">2 · Mirror</p>
            <p className="kpi-pipeline-step-title">Raw + prepared facts</p>
            <p className="kpi-pipeline-step-sub">
              <code>brain_moraware_*</code> / <code>moraware_raw_*</code>, <code>quote_headers</code> /
              forecast events, with org-scoped <code>organization_id</code>.
            </p>
          </article>
          <article className="kpi-pipeline-step" role="listitem">
            <p className="kpi-pipeline-step-eyebrow">3 · Rollup</p>
            <p className="kpi-pipeline-step-title">Backend KPI snapshots</p>
            <p className="kpi-pipeline-step-sub">
              Future <code>sales_kpi_snapshots</code> per metric + period + grain. Source-labeled, immutable
              for historical periods.
            </p>
          </article>
          <article className="kpi-pipeline-step" role="listitem">
            <p className="kpi-pipeline-step-eyebrow">4 · Sales Head</p>
            <p className="kpi-pipeline-step-title">Explain &amp; compare</p>
            <p className="kpi-pipeline-step-sub">
              Render historical trends, year-over-year deltas, branch / rep gated by approved Sales Account
              Mapping.
            </p>
          </article>
        </div>
      </section>

      <section aria-label="Planned KPI source feeds">
        <div className="kpi-source-grid">
          {SOURCE_CARDS.map((card) => (
            <article key={card.title} className="kpi-source-card">
              <header className="kpi-source-card-head">
                <h3 className="kpi-source-card-title">{card.title}</h3>
                <span className={statusClass(card.status)}>{statusLabel(card.status)}</span>
              </header>
              <p className="kpi-source-card-sub">
                <strong>Source ·</strong> {card.source}. {card.sub}
              </p>
              <ul className="kpi-source-card-list">
                {card.metrics.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="kpi-trust-card" aria-label="KPI trust + guardrail rules">
        <h3>Data trust + guardrail rules (binding)</h3>
        <p>
          These guardrails apply to every KPI rendered in Sales Head — current Command Center tiles and future
          KPI History tiles alike.
        </p>
        <ul>
          <li>Every metric carries a <strong>source</strong> (Moraware, Quote Library, Partner Quote, manual import).</li>
          <li>Every metric carries a <strong>freshness</strong> label (latest sync time / rollup time).</li>
          <li>Every metric carries a <strong>trust class</strong> (production / preview / planning / manual import).</li>
          <li>Moraware and Quote Library facts are <strong>not blended</strong> blindly. Composite KPIs must be explicitly defined.</li>
          <li>
            <strong>Branch / rep / account attribution</strong> remains gated by approved{" "}
            <strong>Sales Account Mapping</strong>. Company-wide totals may surface before mapping coverage is high;
            split totals may not.
          </li>
          <li>
            <strong>Blackstone guardrail preserved.</strong> Blackstone does not default to Dyersville — this rule
            survives any new KPI rollup unless Chris explicitly approves a mapping change.
          </li>
          <li>Manual / historical imports are allowed for older years, but must be labeled <code>manual_import</code> with an import note.</li>
          <li>Frontend never calculates production / pipeline KPI totals from raw payloads — backend prepared rollups own the math.</li>
        </ul>
      </section>

      <section className="kpi-future-card" aria-label="Future backend tables planned for KPI rollups">
        <h3>Future backend tables (planning only — no migrations in this pass)</h3>
        <p>
          When approved, these org-scoped tables would carry the prepared KPI facts. Sales Head would then read
          them directly, replacing this scaffold with live historical panels. No SQL is created in this pass.
        </p>
        <ul className="kpi-future-list">
          {FUTURE_TABLES.map((t) => (
            <li key={t.name}>
              <code>{t.name}</code> — {t.role}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
