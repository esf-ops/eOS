import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "../lib/api";
import {
  buildPnlInsights,
  concentrationShare,
  normalizeFinanceLabel,
} from "../lib/financeInsights.mjs";
import {
  agingRowsFromBuckets,
  cashEventRoleLabel,
  domainPresentationLabel,
  financeDomainLabel,
  FINANCE_DOMAIN_DISPLAY_ORDER,
  formatMoney,
  formatPct,
  formatPeriodCaption,
  formatYmdUtc,
  metricDisplayValue,
  statusLabel,
  type FinanceMetric,
  type FinanceTab,
} from "../lib/financeViewModel";
import {
  AgingDistribution,
  CashActivityChart,
  ExposureBars,
  PnlTrendChart,
  type PnlComparison,
  type PnlTrendPoint,
} from "./FinanceCharts";
import { AnimatedNumber, FinanceReveal, useFinanceTilt } from "./financeMotion";

type ApiRecord = Record<string, unknown>;
type DrilldownKey =
  | "revenue"
  | "gross_profit"
  | "gross_margin"
  | "net_income"
  | "ar"
  | "ap"
  | "cash"
  | "balance_sheet";

function finiteValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Pill({ state, children }: { state?: string; children?: ReactNode }) {
  const normalized = String(state || "unavailable").toLowerCase();
  const tone =
    ["pass", "available", "success", "fresh", "fresh_nightly"].includes(normalized)
      ? "ok"
      : ["fail", "failed", "unavailable", "missing"].includes(normalized)
        ? "fail"
        : normalized === "stale"
          ? "stale"
          : "warn";
  return <span className={`fin-pill ${tone}`}>{children || statusLabel(state)}</span>;
}

function DomainFreshnessStrip({ domains }: { domains?: Record<string, ApiRecord> | null }) {
  const rows = FINANCE_DOMAIN_DISPLAY_ORDER.map((id) => domains?.[id]).filter(Boolean) as ApiRecord[];
  if (!rows.length) return null;
  return (
    <div className="fin-domain-freshness" aria-label="Finance data freshness by domain">
      {rows.map((domain) => {
        const presentation = String(domain.presentation || domain.state || "unavailable");
        const lastOk = domain.last_success_at || domain.last_completed_at;
        const staleNote =
          presentation === "stale" && lastOk
            ? `Last successful: ${new Date(String(lastOk)).toLocaleString("en-US", {
                timeZone: "America/Chicago",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}`
            : null;
        return (
          <div className="fin-domain-freshness-item" key={String(domain.domain)}>
            <span className="fin-domain-freshness-name">{financeDomainLabel(String(domain.domain))}</span>
            <Pill state={presentation}>{domainPresentationLabel(domain as { presentation?: string; state?: string; cadence?: string })}</Pill>
            {staleNote ? <small className="fin-domain-freshness-note">{staleNote}</small> : null}
          </div>
        );
      })}
    </div>
  );
}

function MetricCard({
  metric,
  animationKey,
  onOpen,
  compact = false,
}: {
  metric?: FinanceMetric | null;
  animationKey: string;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const tiltRef = useFinanceTilt<HTMLButtonElement>(Boolean(onOpen));
  const available = metricDisplayValue(metric) !== "unavailable";
  const isPct = metric?.key?.includes("pct") || metric?.key?.includes("margin");
  const accessibleValue = available
    ? isPct
      ? formatPct(metric?.value)
      : formatMoney(metric?.value)
    : "Unavailable";
  const content = (
    <>
      <span className="fin-metric-accent" aria-hidden="true" />
      <p className="fin-kicker">{metric?.label || "Metric"}</p>
      {available ? (
        <AnimatedNumber
          value={metric?.value}
          format={isPct ? formatPct : formatMoney}
          animationKey={animationKey}
          className="fin-kpi"
        />
      ) : (
        <p className="fin-unavailable">Unavailable</p>
      )}
      {formatPeriodCaption(metric) ? (
        <p className="fin-period">{formatPeriodCaption(metric)}</p>
      ) : metric?.as_of ? (
        <p className="fin-period">As of {formatYmdUtc(metric.as_of)}</p>
      ) : null}
      <div className="fin-card-meta">
        <Pill state={metric?.state} />
        {onOpen && available ? <span className="fin-card-open">Explore ↗</span> : null}
      </div>
    </>
  );

  if (onOpen) {
    return (
      <button
        ref={tiltRef}
        type="button"
        className={`fin-card fin-metric-card fin-explorable${compact ? " is-compact" : ""}`}
        disabled={!available}
        aria-label={`Explore ${metric?.label || "Finance metric"}: ${accessibleValue}${
          formatPeriodCaption(metric) ? `, ${formatPeriodCaption(metric)}` : ""
        }`}
        onClick={onOpen}
      >
        {content}
        <span className="fin-card-shine" aria-hidden="true" />
      </button>
    );
  }
  return <article className={`fin-card fin-metric-card${compact ? " is-compact" : ""}`}>{content}</article>;
}

function SectionHead({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  action?: ReactNode;
}) {
  return (
    <header className="fin-section-head">
      <div>
        <p className="fin-kicker">{eyebrow}</p>
        <h2>{title}</h2>
        {copy ? <p>{copy}</p> : null}
      </div>
      {action}
    </header>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="fin-empty" role="status">
      <span aria-hidden="true">◇</span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}

function metricFrom(overview: ApiRecord, key: string): FinanceMetric | null {
  return ((overview.metrics as Record<string, FinanceMetric> | undefined)?.[key] || null);
}

function headlineFromPoint(point?: PnlTrendPoint) {
  if (!point) return undefined;
  return {
    period_start: point.period_start,
    headline: {
      revenue: point.revenue,
      gross_profit: point.gross_profit,
      gross_margin_pct: point.gross_margin_pct,
      net_income: point.net_income,
    },
  };
}

export function OverviewCommandCenter({
  overview,
  onOpen,
  onNavigate,
}: {
  overview: ApiRecord;
  onOpen: (kind: DrilldownKey) => void;
  onNavigate: (tab: FinanceTab) => void;
}) {
  const metrics = (overview.metrics || {}) as Record<string, FinanceMetric>;
  const domains = (overview.domains || {}) as Record<string, ApiRecord>;
  const trend = (overview.pnl_trend || {}) as {
    state?: string;
    notes?: string;
    points?: PnlTrendPoint[];
    comparisons?: PnlComparison[];
  };
  const arSummary = (overview.ar_summary || {}) as ApiRecord;
  const apSummary = (overview.ap_summary || {}) as ApiRecord;
  const arCustomers = (arSummary.customers || []) as Array<Record<string, unknown>>;
  const latest = trend.points?.at(-1);
  const previous = trend.points?.at(-2);
  const changed = buildPnlInsights(headlineFromPoint(latest), headlineFromPoint(previous));
  const arConcentration = concentrationShare(arCustomers, metrics.open_ar?.value, 5);
  const attention = [
    metrics.overdue_ar?.value != null && Number(metrics.overdue_ar.value) > 0
      ? {
          label: "Past-due receivables",
          value: Number(metrics.overdue_ar.value),
          copy: `${formatMoney(metrics.overdue_ar.value)} of open A/R is past due.`,
          tab: "ar" as FinanceTab,
        }
      : null,
    metrics.overdue_ap?.value != null && Number(metrics.overdue_ap.value) > 0
      ? {
          label: "Past-due payables",
          value: Number(metrics.overdue_ap.value),
          copy: `${formatMoney(metrics.overdue_ap.value)} of open A/P is past due.`,
          tab: "ap" as FinanceTab,
        }
      : null,
    arConcentration != null && arConcentration >= 40
      ? {
          label: "Customer concentration",
          value: arConcentration,
          copy: `The five largest customer balances represent ${arConcentration.toFixed(1)}% of open A/R.`,
          tab: "ar" as FinanceTab,
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0)) as Array<{
    label: string;
    value: number;
    copy: string;
    tab: FinanceTab;
  }>;

  return (
    <>
      <FinanceReveal motionKey="overview-kpis" className="fin-command-section fin-command-section-first">
        <SectionHead
          eyebrow="Financial condition"
          title={`Through ${formatYmdUtc(String((overview.ytd_period as ApiRecord)?.period_end || "")) || "the latest governed period"}`}
          copy="Exact governed values first. Open any card to investigate the monthly path or supporting detail."
        />
        <DomainFreshnessStrip domains={domains} />
        <div className="fin-kpi-grid fin-kpi-grid-headline">
          <MetricCard metric={metrics.revenue} animationKey="overview-revenue" onOpen={() => onOpen("revenue")} />
          <MetricCard metric={metrics.gross_profit} animationKey="overview-gp" onOpen={() => onOpen("gross_profit")} />
          <MetricCard metric={metrics.gross_margin_pct} animationKey="overview-gm" onOpen={() => onOpen("gross_margin")} />
          <MetricCard metric={metrics.net_income} animationKey="overview-ni" onOpen={() => onOpen("net_income")} />
          <MetricCard metric={metrics.cash} animationKey="overview-cash" onOpen={() => onOpen("cash")} />
          <MetricCard metric={metrics.open_ar} animationKey="overview-ar" onOpen={() => onOpen("ar")} />
          <MetricCard metric={metrics.open_ap} animationKey="overview-ap" onOpen={() => onOpen("ap")} />
        </div>
      </FinanceReveal>

      <FinanceReveal motionKey="overview-performance" className="fin-command-section">
        <article className="fin-card fin-panel">
          <SectionHead
            eyebrow="Financial performance"
            title="How the year took shape"
            copy="Monthly Accrual P&L facts. Prior-year overlays appear only where monthly coverage is equivalent."
            action={
              <button className="fin-link-btn" type="button" onClick={() => onNavigate("pnl")}>
                Open full P&amp;L →
              </button>
            }
          />
          {trend.state === "available" && trend.points?.length ? (
            <PnlTrendChart
              points={trend.points}
              comparisons={trend.comparisons}
              motionKey="overview-performance"
              onSelectPeriod={() => onNavigate("pnl")}
            />
          ) : (
            <EmptyState title="Monthly trend unavailable" body={String(trend.notes || "Stored monthly P&L history is not available.")} />
          )}
        </article>
      </FinanceReveal>

      <FinanceReveal motionKey="overview-working-capital" className="fin-command-section">
        <SectionHead
          eyebrow="Working capital"
          title="What customers owe versus what the business owes"
          copy="A/R and A/P are current snapshots. No historical working-capital trend is shown without historical snapshots."
        />
        <div className="fin-working-grid">
          <article className="fin-card fin-working-panel">
            <div className="fin-working-metrics">
              <MetricCard metric={metrics.open_ar} animationKey="working-ar" compact />
              <MetricCard metric={metrics.overdue_ar} animationKey="working-overdue-ar" compact />
            </div>
            <button type="button" className="fin-link-row" onClick={() => onNavigate("ar")}>
              Investigate customer exposure <span>→</span>
            </button>
          </article>
          <article className="fin-card fin-working-panel">
            <div className="fin-working-metrics">
              <MetricCard metric={metrics.open_ap} animationKey="working-ap" compact />
              <MetricCard metric={metrics.overdue_ap} animationKey="working-overdue-ap" compact />
            </div>
            <button type="button" className="fin-link-row" onClick={() => onNavigate("ap")}>
              Investigate vendor exposure <span>→</span>
            </button>
          </article>
          <article className="fin-card fin-working-net">
            <p className="fin-kicker">A/R less A/P</p>
            <AnimatedNumber
              value={(overview.working_capital as FinanceMetric | undefined)?.value}
              format={formatMoney}
              animationKey="working-net"
              className="fin-kpi"
            />
            <p>Current relationship only. This is not a cash forecast.</p>
          </article>
        </div>
      </FinanceReveal>

      <div className="fin-two-column fin-command-section">
        <FinanceReveal motionKey="overview-changed" className="fin-card fin-panel">
          <SectionHead
            eyebrow="What changed"
            title="Latest month in context"
            copy="Deterministic comparisons from adjacent stored monthly P&L periods."
          />
          <div className="fin-insight-list">
            {changed.length ? (
              changed.map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </div>
              ))
            ) : (
              <p className="fin-muted">Comparable adjacent monthly facts are unavailable.</p>
            )}
            {arConcentration != null ? (
              <div>
                <span>{String(changed.length + 1).padStart(2, "0")}</span>
                <p>The five largest customer balances represent {arConcentration.toFixed(1)}% of open A/R.</p>
              </div>
            ) : null}
          </div>
        </FinanceReveal>

        <FinanceReveal motionKey="overview-attention" className="fin-card fin-panel">
          <SectionHead
            eyebrow="Requires attention"
            title="Facts worth investigating"
            copy="Ranked by governed exposure; no prediction or automated recommendation."
          />
          <div className="fin-attention-list">
            {attention.length ? (
              attention.map((item, index) => (
                <button key={item.label} type="button" onClick={() => onNavigate(item.tab)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.copy}</p>
                  </div>
                  <i aria-hidden="true">→</i>
                </button>
              ))
            ) : (
              <EmptyState title="No ranked exposure" body="No non-zero governed attention facts are available in the current snapshots." />
            )}
          </div>
        </FinanceReveal>
      </div>

      <FinanceReveal motionKey="overview-trust" className="fin-command-section">
        <button
          type="button"
          className="fin-card fin-trust-card fin-explorable"
          onClick={() => onOpen("balance_sheet")}
        >
          <div>
            <p className="fin-kicker">Statement trust</p>
            <h2>Assets equal Liabilities + Equity</h2>
            <p>Open the accounting identity, statement date, opening reference, and reconciliation tolerance.</p>
          </div>
          <div className="fin-trust-summary">
            <Pill state={String((overview.balance_sheet_identity as ApiRecord)?.status)} />
            <strong>{formatMoney(finiteValue((overview.balance_sheet_identity as ApiRecord)?.delta))}</strong>
            <span>difference</span>
          </div>
        </button>
      </FinanceReveal>
    </>
  );
}

type StatementNode = {
  label?: string;
  amount?: number | null;
  current_amount?: number | null;
  row_type?: string | null;
  children?: StatementNode[];
};

function StatementTreeNode({ node, depth = 0 }: { node: StatementNode; depth?: number }) {
  const children = node.children || [];
  const amount = node.current_amount ?? node.amount;
  const rowType = String(node.row_type || "").toLowerCase();
  if (children.length) {
    return (
      <details className="fin-statement-group" open={depth < 2}>
        <summary style={{ "--statement-depth": depth } as CSSProperties}>
          <span>{normalizeFinanceLabel(node.label)}</span>
          <strong>{amount == null ? "" : formatMoney(amount)}</strong>
        </summary>
        <div>
          {children.map((child, index) => (
            <StatementTreeNode key={`${child.label}-${index}`} node={child} depth={depth + 1} />
          ))}
        </div>
      </details>
    );
  }
  return (
    <div
      className={`fin-statement-row${rowType === "total" ? " is-total" : ""}`}
      style={{ "--statement-depth": depth } as CSSProperties}
    >
      <span>{normalizeFinanceLabel(node.label)}</span>
      <strong>{amount == null ? "—" : formatMoney(amount)}</strong>
    </div>
  );
}

function StatementTree({ hierarchy }: { hierarchy: StatementNode[] }) {
  if (!hierarchy.length) {
    return <EmptyState title="Statement detail unavailable" body="No stored report hierarchy is available for this period." />;
  }
  return (
    <div className="fin-statement" aria-label="QuickBooks statement hierarchy">
      {hierarchy.map((node, index) => (
        <StatementTreeNode key={`${node.label}-${index}`} node={node} />
      ))}
    </div>
  );
}

export function PnlWorkspace({ pnl, token }: { pnl: ApiRecord; token: string }) {
  const trend = (pnl.monthly_trend || {}) as {
    state?: string;
    notes?: string;
    points?: PnlTrendPoint[];
    comparisons?: PnlComparison[];
  };
  const windows = (pnl.contributing_windows || []) as Array<{
    period_start: string;
    period_end: string;
  }>;
  const [selected, setSelected] = useState(() => windows.at(-1) || null);
  const [statement, setStatement] = useState<ApiRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!windows.length) return;
    setSelected((current) => current || windows.at(-1) || null);
  }, [windows.length]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    void apiFetch(
      `/api/finance/pnl?period_start=${encodeURIComponent(selected.period_start)}&period_end=${encodeURIComponent(selected.period_end)}`,
      { token },
    )
      .then((result) => {
        if (!cancelled) setStatement(result as ApiRecord);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.period_end, selected?.period_start, token]);

  const headline = (pnl.headline || {}) as Record<string, number | null>;
  const period = pnl.period as ApiRecord;
  return (
    <>
      <FinanceReveal motionKey="pnl-summary" className="fin-command-section fin-command-section-first">
        <SectionHead
          eyebrow="Profit & Loss · Accrual"
          title="Year-to-date performance"
          copy="YTD control totals combine contiguous monthly QuickBooks statements. Select a month below to inspect its stored hierarchy."
        />
        <p className="fin-period-band">
          {formatPeriodCaption({
            period_start: String(pnl.period_start || ""),
            period_end: String(pnl.period_end || ""),
            is_derived: pnl.is_derived === true,
            preset: String(period?.preset || "ytd"),
          })}
        </p>
        <div className="fin-kpi-grid fin-kpi-grid-compact">
          {[
            ["revenue", "Revenue", headline.revenue],
            ["gross_profit", "Gross Profit", headline.gross_profit],
            ["gross_margin_pct", "Gross Margin", headline.gross_margin_pct],
            ["net_income", "Net Income", headline.net_income],
          ].map(([key, label, value]) => (
            <MetricCard
              key={String(key)}
              animationKey={`pnl-${key}`}
              compact
              metric={{
                key: String(key),
                label: String(label),
                value: value as number | null,
                state: value == null ? "unavailable" : "available",
                period_start: String(pnl.period_start || ""),
                period_end: String(pnl.period_end || ""),
                is_derived: true,
              }}
            />
          ))}
        </div>
      </FinanceReveal>

      <FinanceReveal motionKey="pnl-trend" className="fin-command-section fin-card fin-panel">
        <SectionHead
          eyebrow="Monthly path"
          title="Revenue, gross profit, margin, and net income"
          copy="Switch the series or compare 2026 against legitimately comparable 2025 months."
        />
        {trend.state === "available" && trend.points?.length ? (
          <PnlTrendChart
            points={trend.points}
            comparisons={trend.comparisons}
            motionKey="pnl-workspace"
            onSelectPeriod={(point) => {
              const match = windows.find((window) => window.period_start === point.period_start);
              if (match) setSelected(match);
            }}
          />
        ) : (
          <EmptyState title="Monthly trend unavailable" body={String(trend.notes || "Monthly snapshots are unavailable.")} />
        )}
      </FinanceReveal>

      <FinanceReveal motionKey="pnl-explorer" className="fin-command-section fin-card fin-panel">
        <SectionHead
          eyebrow="Monthly Statement Explorer"
          title="Inspect the stored QuickBooks statement"
          copy="YTD totals combine the monthly QuickBooks statements above. Select a month to inspect the detailed statement."
          action={<Pill state={String(statement?.state || "available")}>Accrual basis</Pill>}
        />
        <div className="fin-month-picker" role="tablist" aria-label="P&L month">
          {windows.map((window) => (
            <button
              key={window.period_start}
              type="button"
              role="tab"
              aria-selected={selected?.period_start === window.period_start}
              className={selected?.period_start === window.period_start ? "is-active" : ""}
              onClick={() => setSelected(window)}
            >
              <strong>{new Date(`${window.period_start}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</strong>
              <span>{window.period_end.slice(8) === "14" ? "Through 14" : window.period_start.slice(0, 4)}</span>
            </button>
          ))}
        </div>
        <div className="fin-statement-meta">
          <span>
            Period{" "}
            <strong>
              {selected ? `${formatYmdUtc(selected.period_start)} – ${formatYmdUtc(selected.period_end)}` : "unavailable"}
            </strong>
          </span>
          <span>
            Basis <strong>Accrual</strong>
          </span>
          <span>
            Source <strong>QuickBooks P&amp;L</strong>
          </span>
        </div>
        {loading ? (
          <div className="fin-loading">Loading stored monthly statement…</div>
        ) : (
          <StatementTree hierarchy={((statement?.hierarchy || []) as StatementNode[])} />
        )}
      </FinanceReveal>
    </>
  );
}

export function BalanceSheetWorkspace({ data }: { data: ApiRecord }) {
  const identity = (data.identity || {}) as ApiRecord;
  const totals = (data.totals || {}) as ApiRecord;
  const history = (data.history || {}) as ApiRecord;
  const snapshot = (data.snapshot || {}) as ApiRecord;
  const opening = (data.opening || {}) as ApiRecord;
  return (
    <>
      <FinanceReveal motionKey="bs-trust" className="fin-command-section fin-command-section-first">
        <article className="fin-card fin-bs-trust">
          <SectionHead
            eyebrow="Balance Sheet · Accrual"
            title={`Statement at ${formatYmdUtc(String(snapshot.as_of_date || data.as_of || "")) || "latest stored date"}`}
            copy="The accounting identity is calculated from one governed QuickBooks statement snapshot."
            action={<Pill state={String(identity.status)} />}
          />
          <div className="fin-bs-equation">
            <div>
              <span>Assets</span>
              <AnimatedNumber
                value={finiteValue(totals.total_assets)}
                format={formatMoney}
                animationKey="bs-assets"
                className="fin-kpi"
              />
            </div>
            <i aria-hidden="true">=</i>
            <div>
              <span>Liabilities + Equity</span>
              <AnimatedNumber
                value={finiteValue(totals.total_liabilities_and_equity)}
                format={formatMoney}
                animationKey="bs-liabilities-equity"
                className="fin-kpi"
              />
            </div>
          </div>
          <div className="fin-bs-proof">
            <span>
              Difference <strong>{formatMoney(finiteValue(identity.delta))}</strong>
            </span>
            <span>
              Tolerance <strong>{formatMoney(finiteValue(identity.tolerance_abs))}</strong>
            </span>
            <span>
              Opening reference <strong>{formatYmdUtc(String(opening.as_of_date || "")) || "Unavailable"}</strong>
            </span>
          </div>
        </article>
      </FinanceReveal>
      <FinanceReveal motionKey="bs-detail" className="fin-command-section fin-card fin-panel">
        <SectionHead
          eyebrow="Complete statement"
          title="Assets, liabilities, and equity"
          copy="Expand or collapse the actual stored QuickBooks report hierarchy."
        />
        <StatementTree hierarchy={(data.hierarchy || []) as StatementNode[]} />
      </FinanceReveal>
      <FinanceReveal motionKey="bs-history" className="fin-command-section">
        <EmptyState
          title={history.state === "available" ? "Balance Sheet history available" : "Balance Sheet trend unavailable"}
          body={String(
            history.notes ||
              (history.state === "available"
                ? "Multiple distinct current statement dates are stored. No interpolated Balance Sheet trend is shown."
                : "A Balance Sheet trend needs at least two distinct current statement dates. The opening reference is not presented as a comparable trend point."),
          )}
        />
      </FinanceReveal>
    </>
  );
}

type CounterpartyRow = {
  customer_name?: string;
  vendor_name?: string;
  open_amount?: number;
  overdue_amount?: number;
  invoice_count?: number;
  bill_count?: number;
  oldest_due_date?: string | null;
};

function ExplorerToolbar({
  search,
  onSearch,
  sort,
  onSort,
  filter,
  onFilter,
  filterOptions,
}: {
  search: string;
  onSearch: (value: string) => void;
  sort: string;
  onSort: (value: string) => void;
  filter: string;
  onFilter: (value: string) => void;
  filterOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="fin-explorer-toolbar">
      <label className="fin-search">
        <span className="sr-only">Search</span>
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name…" />
      </label>
      <label>
        <span>Filter</span>
        <select value={filter} onChange={(event) => onFilter(event.target.value)}>
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Sort</span>
        <select value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="balance">Largest balance</option>
          <option value="due_date">Oldest due date</option>
          <option value="name">Name</option>
        </select>
      </label>
    </div>
  );
}

function Pagination({
  page,
  hasMore,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="fin-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Previous
      </button>
      <span>Page {page}</span>
      <button type="button" disabled={!hasMore} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  );
}

export function ReceivablesWorkspace({
  data,
  token,
  onCustomer,
}: {
  data: ApiRecord;
  token: string;
  onCustomer: (row: CounterpartyRow) => void;
}) {
  const total = data.total as FinanceMetric;
  const overdue = data.overdue as FinanceMetric;
  const aging = (data.aging || {}) as ApiRecord;
  const customers = (data.customers || []) as CounterpartyRow[];
  const payments = ((data.recent_payments as ApiRecord)?.items || []) as ApiRecord[];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("balance");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ApiRecord>({ items: [], pagination: {} });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const apiSort = sort === "name" ? "customer" : sort;
      void apiFetch(
        `/api/finance/ar/invoices?q=${encodeURIComponent(search)}&sort=${encodeURIComponent(apiSort)}&direction=${sort === "balance" ? "desc" : "asc"}&state=${filter}&page=${page}&limit=50`,
        { token },
      ).then((result) => setDetail(result as ApiRecord));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [filter, page, search, sort, token]);

  const invoices = (detail.items || []) as ApiRecord[];
  const pagination = (detail.pagination || {}) as ApiRecord;

  return (
    <>
      <FinanceReveal motionKey="ar-summary" className="fin-command-section fin-command-section-first">
        <SectionHead
          eyebrow="A/R command center"
          title={`Receivables at ${formatYmdUtc(String(data.as_of || "")) || "latest refresh"}`}
          copy="Open balances, past-due exposure, DueDate aging, customer concentration, and safe invoice facts."
        />
        <div className="fin-kpi-grid fin-kpi-grid-compact">
          <MetricCard metric={total} animationKey="ar-total" compact />
          <MetricCard metric={overdue} animationKey="ar-overdue" compact />
          <MetricCard
            animationKey="ar-concentration"
            compact
            metric={{
              key: "ar_concentration_pct",
              label: "Top 5 concentration",
              value: concentrationShare(customers, total?.value, 5),
              state: customers.length ? "available" : "unavailable",
            }}
          />
          <MetricCard
            animationKey="ar-coverage"
            compact
            metric={{
              key: "due_date_coverage_pct",
              label: "DueDate coverage",
              value: aging.due_date_coverage == null ? null : Number(aging.due_date_coverage) * 100,
              state: aging.due_date_coverage == null ? "unavailable" : "available",
            }}
          />
        </div>
      </FinanceReveal>
      <div className="fin-two-column fin-command-section">
        <FinanceReveal motionKey="ar-aging" className="fin-card fin-panel">
          <SectionHead eyebrow="Aging distribution" title="Where open A/R sits" copy="DueDate only; invoice date is never substituted." />
          {aging.state === "available" ? (
            <AgingDistribution
              rows={agingRowsFromBuckets(aging.buckets as Record<string, number | null>)}
              total={total?.value}
              motionKey="ar"
            />
          ) : (
            <EmptyState title="Aging unavailable" body={String(aging.notes || "DueDate coverage is insufficient.")} />
          )}
        </FinanceReveal>
        <FinanceReveal motionKey="ar-exposure" className="fin-card fin-panel">
          <SectionHead eyebrow="Customer exposure" title="Largest open balances" copy="Select a customer for a focused receivable drilldown." />
          <ExposureBars
            rows={customers.slice(0, 10) as Array<Record<string, unknown>>}
            amountKey="open_amount"
            labelKey="customer_name"
            motionKey="ar"
            onSelect={(row) => onCustomer(row)}
          />
        </FinanceReveal>
      </div>
      <FinanceReveal motionKey="ar-invoices" className="fin-command-section fin-card fin-panel">
        <SectionHead eyebrow="Invoice explorer" title="Open invoice facts" copy="Bounded to 50 browser-safe rows per page." />
        <ExplorerToolbar
          search={search}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          sort={sort}
          onSort={(value) => {
            setSort(value);
            setPage(1);
          }}
          filter={filter}
          onFilter={(value) => {
            setFilter(value);
            setPage(1);
          }}
          filterOptions={[
            { value: "all", label: "All current rows" },
            { value: "overdue", label: "Past due" },
            { value: "current", label: "Not yet due" },
            { value: "unknown", label: "Due date unavailable" },
          ]}
        />
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Reference</th>
                <th>Invoice date</th>
                <th>Due date</th>
                <th>Original</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((row, index) => (
                <tr key={`${row.reference_number}-${index}`}>
                  <td>{String(row.customer_name || "Unnamed customer")}</td>
                  <td>{String(row.reference_number || "—")}</td>
                  <td>{formatYmdUtc(String(row.invoice_date || "")) || "—"}</td>
                  <td>{formatYmdUtc(String(row.due_date || "")) || "—"}</td>
                  <td>{formatMoney(finiteValue(row.original_amount))}</td>
                  <td>{formatMoney(finiteValue(row.open_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} hasMore={pagination.has_more === true} onPage={setPage} />
      </FinanceReveal>
      <FinanceReveal motionKey="ar-payments" className="fin-command-section fin-card fin-panel">
        <SectionHead eyebrow="Recent payment activity" title="Applied customer payments" copy="Application facts only; no collections automation." />
        <div className="fin-compact-rows">
          {payments.slice(0, 12).map((payment, index) => (
            <div key={`${payment.payment_date}-${index}`}>
              <span>{String(payment.customer_name || "Customer")}</span>
              <small>{formatYmdUtc(String(payment.payment_date || "")) || "Date unavailable"}</small>
              <strong>{formatMoney(finiteValue(payment.applied_amount))}</strong>
            </div>
          ))}
        </div>
      </FinanceReveal>
    </>
  );
}

export function PayablesWorkspace({
  data,
  token,
  onVendor,
}: {
  data: ApiRecord;
  token: string;
  onVendor: (row: CounterpartyRow) => void;
}) {
  const total = data.total as FinanceMetric;
  const overdue = data.overdue as FinanceMetric;
  const due = data.due as FinanceMetric;
  const aging = (data.aging || {}) as ApiRecord;
  const vendors = (data.vendors || []) as CounterpartyRow[];
  const applications = ((data.applications as ApiRecord)?.items || []) as ApiRecord[];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("balance");
  const [filter, setFilter] = useState("open");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ApiRecord>({ items: [], pagination: {} });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const apiSort = sort === "balance" ? "open_amount" : sort === "name" ? "vendor" : sort;
      void apiFetch(
        `/api/finance/ap/bills?q=${encodeURIComponent(search)}&sort=${encodeURIComponent(apiSort)}&direction=${sort === "balance" ? "desc" : "asc"}&state=${filter}&page=${page}&limit=50`,
        { token },
      ).then((result) => setDetail(result as ApiRecord));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [filter, page, search, sort, token]);
  const bills = (detail.items || []) as ApiRecord[];
  const pagination = (detail.pagination || {}) as ApiRecord;

  return (
    <>
      <FinanceReveal motionKey="ap-summary" className="fin-command-section fin-command-section-first">
        <SectionHead
          eyebrow="A/P command center"
          title={`Payables at ${formatYmdUtc(String(data.as_of || "")) || "latest refresh"}`}
          copy="Open bills, past-due and near-term exposure, vendor concentration, and payment-application state."
        />
        <div className="fin-kpi-grid fin-kpi-grid-compact">
          <MetricCard metric={total} animationKey="ap-total" compact />
          <MetricCard metric={overdue} animationKey="ap-overdue" compact />
          <MetricCard metric={due} animationKey="ap-due" compact />
          <MetricCard
            animationKey="ap-concentration"
            compact
            metric={{
              key: "ap_concentration_pct",
              label: "Top 5 concentration",
              value: concentrationShare(vendors, total?.value, 5),
              state: vendors.length ? "available" : "unavailable",
            }}
          />
        </div>
      </FinanceReveal>
      <div className="fin-two-column fin-command-section">
        <FinanceReveal motionKey="ap-aging" className="fin-card fin-panel">
          <SectionHead eyebrow="Aging distribution" title="Where open A/P sits" copy="Bill DueDate drives aging when available." />
          {aging.state === "available" ? (
            <AgingDistribution
              rows={agingRowsFromBuckets(aging.buckets as Record<string, number | null>)}
              total={total?.value}
              motionKey="ap"
            />
          ) : (
            <EmptyState title="Aging unavailable" body={String(aging.notes || "DueDate coverage is insufficient.")} />
          )}
        </FinanceReveal>
        <FinanceReveal motionKey="ap-exposure" className="fin-card fin-panel">
          <SectionHead eyebrow="Vendor exposure" title="Largest open balances" copy="Select a vendor for a focused payable drilldown." />
          <ExposureBars
            rows={vendors.slice(0, 10) as Array<Record<string, unknown>>}
            amountKey="open_amount"
            labelKey="vendor_name"
            motionKey="ap"
            onSelect={(row) => onVendor(row)}
          />
        </FinanceReveal>
      </div>
      <FinanceReveal motionKey="ap-bills" className="fin-command-section fin-card fin-panel">
        <SectionHead eyebrow="Bill explorer" title="Bill and payment state" copy="Bounded to 50 browser-safe rows per page." />
        <ExplorerToolbar
          search={search}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          sort={sort}
          onSort={(value) => {
            setSort(value);
            setPage(1);
          }}
          filter={filter}
          onFilter={(value) => {
            setFilter(value);
            setPage(1);
          }}
          filterOptions={[
            { value: "open", label: "Open bills" },
            { value: "paid", label: "Paid bills" },
            { value: "all", label: "All bills" },
          ]}
        />
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Reference</th>
                <th>Bill date</th>
                <th>Due date</th>
                <th>Terms</th>
                <th>Open</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((row, index) => (
                <tr key={`${row.reference_number}-${index}`}>
                  <td>{String(row.vendor_name || "Unnamed vendor")}</td>
                  <td>{String(row.reference_number || "—")}</td>
                  <td>{formatYmdUtc(String(row.bill_date || "")) || "—"}</td>
                  <td>{formatYmdUtc(String(row.due_date || "")) || "—"}</td>
                  <td>{String(row.terms_name || "—")}</td>
                  <td>{formatMoney(finiteValue(row.open_amount))}</td>
                  <td><Pill state={row.is_paid ? "success" : "warning"}>{row.is_paid ? "Paid" : "Open"}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} hasMore={pagination.has_more === true} onPage={setPage} />
      </FinanceReveal>
      <FinanceReveal motionKey="ap-applications" className="fin-command-section fin-card fin-panel">
        <SectionHead eyebrow="Payment applications" title="Recent applied vendor payments" copy="Observed payment facts only; no bill-pay recommendations." />
        <div className="fin-compact-rows">
          {applications.slice(0, 12).map((application, index) => (
            <div key={`${application.payment_date}-${index}`}>
              <span>{String(application.vendor_name || "Vendor")}</span>
              <small>{formatYmdUtc(String(application.payment_date || "")) || "Date unavailable"} · {String(application.payment_method || "method unavailable")}</small>
              <strong>{formatMoney(finiteValue(application.applied_amount))}</strong>
            </div>
          ))}
        </div>
      </FinanceReveal>
    </>
  );
}

export function CashWorkspace({ data }: { data: ApiRecord }) {
  const position = data.position as FinanceMetric;
  const roles = (data.by_event_role || []) as Array<{
    event_role: string;
    amount: number | null;
    count: number;
    state?: string;
    notes?: string;
  }>;
  const trend = (data.trend || {}) as ApiRecord;
  const [roleFilter, setRoleFilter] = useState("all");
  const activity = ((data.recent_activity || []) as ApiRecord[]).filter(
    (row) => roleFilter === "all" || row.event_role === roleFilter,
  );
  return (
    <>
      <FinanceReveal motionKey="cash-position" className="fin-command-section fin-command-section-first">
        <article className="fin-card fin-cash-position">
          <div>
            <p className="fin-kicker">Accounting cash position</p>
            <h2>QuickBooks accounting cash</h2>
            <p>Accounting balance · not a live bank feed</p>
          </div>
          <AnimatedNumber value={position?.value} format={formatMoney} animationKey="cash-position" className="fin-kpi" />
        </article>
        <div className="fin-kpi-grid fin-kpi-grid-compact">
          {roles
            .filter((role) => ["bank_deposit", "bank_disbursement", "customer_receipt", "transfer"].includes(role.event_role))
            .map((role) => (
              <MetricCard
                key={role.event_role}
                animationKey={`cash-${role.event_role}`}
                compact
                metric={{
                  key: role.event_role,
                  label: cashEventRoleLabel(role.event_role),
                  value: role.amount,
                  state: role.state || "unavailable",
                  notes: role.count ? `${role.count} governed events` : role.notes,
                }}
              />
            ))}
        </div>
      </FinanceReveal>
      <FinanceReveal motionKey="cash-trend" className="fin-command-section fin-card fin-panel">
        <SectionHead
          eyebrow="Cash activity"
          title="Monthly activity by governed event role"
          copy="Deposits, disbursements, transfers, and customer receipts stay separate."
        />
        {trend.state === "available" ? (
          <CashActivityChart
            points={(trend.points || []) as never[]}
            availableRoles={
              (trend.available_roles || []) as Array<
                "bank_deposit" | "bank_disbursement" | "customer_receipt" | "transfer"
              >
            }
            motionKey="cash-workspace"
          />
        ) : (
          <EmptyState title="Cash activity unavailable" body={String(trend.notes || "No dated cash facts are stored.")} />
        )}
        <div className="fin-quiet-note">
          <strong>Anti-double-count control</strong>
          <span>
            Customer receipts and bank deposits may describe two stages of the same cash. Do not add them together.
          </span>
        </div>
      </FinanceReveal>
      <FinanceReveal motionKey="cash-activity" className="fin-command-section fin-card fin-panel">
        <SectionHead
          eyebrow="Chronological activity"
          title="Recent deposits, checks, transfers, and receipts"
          copy="Up to 100 browser-safe activity rows, newest first."
          action={
            <select aria-label="Cash activity role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">All activity</option>
              <option value="bank_deposit">Bank deposits</option>
              <option value="bank_disbursement">Checks / disbursements</option>
              <option value="customer_receipt">Customer receipts</option>
              <option value="transfer">Transfers</option>
            </select>
          }
        />
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Role</th>
                <th>Counterparty / account</th>
                <th>Reference</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((row, index) => (
                <tr key={`${row.event_role}-${row.txn_date}-${index}`}>
                  <td>{formatYmdUtc(String(row.txn_date || "")) || "—"}</td>
                  <td>{cashEventRoleLabel(String(row.event_role || ""))}</td>
                  <td>{String(row.counterparty || "—")}</td>
                  <td>{String(row.reference_number || "—")}</td>
                  <td>{formatMoney(finiteValue(row.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FinanceReveal>
    </>
  );
}

export function ReconciliationWorkspace({ data, token }: { data: ApiRecord; token: string }) {
  const domainsRaw = (data.domains || {}) as Record<string, ApiRecord>;
  const domains = FINANCE_DOMAIN_DISPLAY_ORDER.map((id) => domainsRaw[id]).filter(Boolean) as ApiRecord[];
  const results = (data.results || []) as ApiRecord[];
  const [detailView, setDetailView] = useState<"accounts" | "transactions" | "journals">("accounts");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ApiRecord>({ items: [], pagination: {} });
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const path =
        detailView === "accounts"
          ? `/api/finance/accounts?q=${encodeURIComponent(search)}&page=${page}&limit=50`
          : detailView === "journals"
            ? `/api/finance/journal-entries?q=${encodeURIComponent(search)}&page=${page}&limit=50`
            : `/api/finance/transaction-activity?page=${page}&limit=50`;
      void apiFetch(path, { token }).then((result) => setDetail(result as ApiRecord));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [detailView, page, search, token]);
  const rows = (detail.items || []) as ApiRecord[];
  const pagination = (detail.pagination || {}) as ApiRecord;

  return (
    <>
      <FinanceReveal motionKey="recon-health" className="fin-command-section fin-command-section-first">
        <SectionHead
          eyebrow="Data health"
          title="Governed Finance coverage"
          copy="Each source domain is judged against its own refresh cadence — nightly Accounting and Master stay fresh through the business day after a successful overnight run."
        />
        <div className="fin-domain-grid">
          {domains.map((domain) => {
            const presentation = String(domain.presentation || domain.state || "unavailable");
            const lastOk = domain.last_success_at || domain.last_completed_at;
            return (
              <article className="fin-card fin-domain-card" key={String(domain.domain)}>
                <div>
                  <strong>{financeDomainLabel(String(domain.domain))}</strong>
                  <Pill state={presentation}>
                    {domainPresentationLabel(domain as { presentation?: string; state?: string; cadence?: string })}
                  </Pill>
                </div>
                <p>
                  Coverage {String(domain.coverage_start || "—")} → {String(domain.coverage_end || "—")}
                </p>
                <small>
                  {presentation === "stale" && lastOk
                    ? `Last successful: ${new Date(String(lastOk)).toLocaleString("en-US", {
                        timeZone: "America/Chicago",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : String(domain.last_success_at || domain.notes || "Awaiting first Finance sync")}
                </small>
              </article>
            );
          })}
        </div>
      </FinanceReveal>
      <FinanceReveal motionKey="recon-checks" className="fin-command-section fin-card fin-panel">
        <SectionHead eyebrow="Reconciliation" title="Recorded control checks" copy="Values compared against their governed QuickBooks source." />
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Period</th>
                <th>eliteOS</th>
                <th>QuickBooks</th>
                <th>Difference</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, index) => (
                <tr key={`${row.check_type}-${index}`}>
                  <td>{String(row.check_type || "").replace(/_/g, " ")}</td>
                  <td>{String(row.as_of_date || row.period_end || "—")}</td>
                  <td>{formatMoney(finiteValue(row.eliteos_value))}</td>
                  <td>{formatMoney(finiteValue(row.quickbooks_value))}</td>
                  <td>{formatMoney(finiteValue(row.delta))}</td>
                  <td><Pill state={String(row.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FinanceReveal>
      <FinanceReveal motionKey="recon-detail" className="fin-command-section fin-card fin-panel">
        <SectionHead
          eyebrow="Governed detail browser"
          title="Accounts and transaction evidence"
          copy="Bounded, browser-safe reads. Transaction activity is not a complete ledger; journal lines use QuickBooks modification time."
        />
        <div className="fin-chart-toolbar">
          <div className="fin-segmented">
            {[
              ["accounts", "Chart of Accounts"],
              ["transactions", "Transaction activity"],
              ["journals", "Journal-entry lines"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={detailView === key ? "is-active" : ""}
                onClick={() => {
                  setDetailView(key as typeof detailView);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {detailView !== "transactions" ? (
            <input
              className="fin-inline-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={detailView === "accounts" ? "Search account…" : "Search account name…"}
            />
          ) : null}
        </div>
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                {detailView === "accounts" ? (
                  <>
                    <th>Account</th><th>Number</th><th>Type</th><th>Parent</th><th>Balance</th>
                  </>
                ) : detailView === "journals" ? (
                  <>
                    <th>Modified</th><th>Account</th><th>Line type</th><th>Amount</th>
                  </>
                ) : (
                  <>
                    <th>Date</th><th>Type</th><th>Entity</th><th>Account</th><th>Reference</th><th>Amount</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {detailView === "accounts" ? (
                    <>
                      <td>{normalizeFinanceLabel(row.name)}</td>
                      <td>{String(row.account_number || "—")}</td>
                      <td>{String(row.account_type || "—")}</td>
                      <td>{String(row.parent_account_name || "—")}</td>
                      <td>{formatMoney(finiteValue(row.balance))}</td>
                    </>
                  ) : detailView === "journals" ? (
                    <>
                      <td>{formatYmdUtc(String(row.modified_at || "")) || "Unavailable"}</td>
                      <td>{normalizeFinanceLabel(row.account_name)}</td>
                      <td>{String(row.line_type || "—")}</td>
                      <td>{formatMoney(finiteValue(row.amount))}</td>
                    </>
                  ) : (
                    <>
                      <td>{formatYmdUtc(String(row.txn_date || "")) || "—"}</td>
                      <td>{String(row.transaction_type || "—")}</td>
                      <td>{String(row.entity_name || "—")}</td>
                      <td>{normalizeFinanceLabel(row.account_name)}</td>
                      <td>{String(row.reference_number || "—")}</td>
                      <td>{formatMoney(finiteValue(row.amount))}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} hasMore={pagination.has_more === true} onPage={setPage} />
      </FinanceReveal>
    </>
  );
}

export { EmptyState, MetricCard, Pill, SectionHead, StatementTree };
