import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { normalizeFinanceLabel } from "../lib/financeInsights.mjs";
import {
  FINANCE_TABS,
  agingRowsFromBuckets,
  cashEventRoleLabel,
  formatMoney,
  formatPct,
  formatPeriodCaption,
  isFinanceTab,
  metricDisplayValue,
  statusLabel,
  type FinanceMetric,
  type FinanceTab,
} from "../lib/financeViewModel";
import FinanceDrilldownContent, {
  type DrilldownData,
  type FinanceDrilldownKind,
} from "./FinanceDrilldownContent";
import FinanceDrilldown from "./FinanceDrilldown";

type Props = { token: string };

function tabFromHash(): FinanceTab {
  const raw = String(window.location.hash || "").replace(/^#/, "");
  return isFinanceTab(raw) ? raw : "overview";
}

function Pill({ state, children }: { state?: string; children: ReactNode }) {
  const s = String(state || "unavailable").toLowerCase();
  let cls = "warn";
  if (s === "pass" || s === "available" || s === "success") cls = "ok";
  else if (s === "fail" || s === "failed" || s === "unavailable" || s === "missing") cls = "fail";
  else if (s === "stale") cls = "stale";
  return <span className={`fin-pill ${cls}`}>{children}</span>;
}

function MetricCard({
  metric,
  tone = "light",
  onOpen,
}: {
  metric?: FinanceMetric | null;
  tone?: "light" | "dark" | "red";
  onOpen?: () => void;
}) {
  const display = metricDisplayValue(metric);
  const open = () => {
    if (onOpen && display !== "unavailable") onOpen();
  };
  return (
    <article
      className={`fin-card ${tone}${onOpen ? " fin-explorable" : ""}`}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen && display !== "unavailable" ? 0 : undefined}
      aria-disabled={onOpen && display === "unavailable" ? true : undefined}
      aria-label={onOpen ? `Explore ${metric?.label || "Finance metric"}` : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
    >
      <p className="fin-kicker">{metric?.label || "Metric"}</p>
      {display === "unavailable" ? (
        <p className="fin-unavailable">Data unavailable</p>
      ) : (
        <p className="fin-kpi">
          {metric?.key?.includes("pct") || metric?.key?.includes("margin")
            ? formatPct(metric?.value)
            : formatMoney(metric?.value)}
        </p>
      )}
      {formatPeriodCaption(metric) ? <p className="fin-period">{formatPeriodCaption(metric)}</p> : null}
      <div className="fin-card-meta">
        <Pill state={metric?.state}>{statusLabel(metric?.state)}</Pill>
        {metric?.notes ? <span className="fin-muted">{metric.notes}</span> : null}
      </div>
      {onOpen ? <span className="fin-explore-cue">Open drilldown <i aria-hidden="true">↗</i></span> : null}
    </article>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="fin-banner dark">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <FinanceDrilldown
      index="A/R"
      kicker="Receivable detail"
      title={title}
      lead="A focused preview of the governed customer balance. Customer 360 is intentionally out of scope."
      onClose={onClose}
    >
      <div className="fin-banner">{children}</div>
    </FinanceDrilldown>
  );
}

function StatementTable({
  rows,
}: {
  rows: Array<{
    label?: string;
    row_type?: string | null;
    current_amount?: number | null;
    compare_amount?: number | null;
    variance_amount?: number | null;
    variance_pct?: number | null;
    amount?: number | null;
  }>;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No transactions for this period"
        body="No Accrual report lines are stored for the selected window."
      />
    );
  }
  return (
    <div className="fin-table-wrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Account / line</th>
            <th>Current</th>
            <th>Compare</th>
            <th>Variance</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.label}-${i}`} className={String(row.row_type || "").toLowerCase() === "total" ? "is-total" : ""}>
              <td>{normalizeFinanceLabel(row.label)}</td>
              <td>{formatMoney(row.current_amount ?? row.amount)}</td>
              <td>{formatMoney(row.compare_amount)}</td>
              <td>{formatMoney(row.variance_amount)}</td>
              <td>{formatPct(row.variance_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinanceWorkspace({ token }: Props) {
  const [tab, setTab] = useState<FinanceTab>(tabFromHash);
  const [pnlPreset, setPnlPreset] = useState("ytd");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [pnl, setPnl] = useState<Record<string, unknown> | null>(null);
  const [bs, setBs] = useState<Record<string, unknown> | null>(null);
  const [ar, setAr] = useState<Record<string, unknown> | null>(null);
  const [ap, setAp] = useState<Record<string, unknown> | null>(null);
  const [cash, setCash] = useState<Record<string, unknown> | null>(null);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [modal, setModal] = useState<{ title: string; body: ReactNode } | null>(null);
  const [drilldown, setDrilldown] = useState<FinanceDrilldownKind | null>(null);
  const [drilldownData, setDrilldownData] = useState<DrilldownData | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState("");
  const [drilldownCache, setDrilldownCache] = useState<Partial<Record<FinanceDrilldownKind, DrilldownData>>>({});

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".fin-page > *, .fin-kpi-grid > *, .fin-split > *, .fin-domain-grid > *, .fin-section, .fin-table-wrap"
      )
    );
    targets.forEach((element, index) => {
      element.classList.add("fin-motion-ready");
      element.style.setProperty("--fin-reveal-delay", `${(index % 4) * 65}ms`);
    });
    if (reducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    targets.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [tab, overview, pnl, bs, ar, ap, cash, recon]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".fin-explorable"));
    const cleanups = cards.map((card) => {
      card.classList.add("fin-tilt");
      const move = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--fin-tilt-x", `${(0.5 - y) * 2.4}deg`);
        card.style.setProperty("--fin-tilt-y", `${(x - 0.5) * 3.2}deg`);
        card.style.setProperty("--fin-shine-x", `${x * 100}%`);
        card.style.setProperty("--fin-shine-y", `${y * 100}%`);
      };
      const reset = () => {
        card.style.setProperty("--fin-tilt-x", "0deg");
        card.style.setProperty("--fin-tilt-y", "0deg");
      };
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerleave", reset);
      return () => {
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerleave", reset);
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [tab, overview]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hero = document.querySelector<HTMLElement>(".fin-hero");
    if (!hero) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      hero.style.setProperty("--fin-hero-scroll", `${Math.min(window.scrollY, 360)}px`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (tab === "overview") {
          const data = await apiFetch("/api/finance/overview", { token });
          if (!cancelled) setOverview(data as Record<string, unknown>);
        } else if (tab === "pnl") {
          const data = await apiFetch(`/api/finance/pnl?preset=${encodeURIComponent(pnlPreset)}`, { token });
          if (!cancelled) setPnl(data as Record<string, unknown>);
        } else if (tab === "balance-sheet") {
          const data = await apiFetch("/api/finance/balance-sheet", { token });
          if (!cancelled) setBs(data as Record<string, unknown>);
        } else if (tab === "ar") {
          const data = await apiFetch("/api/finance/ar", { token });
          if (!cancelled) setAr(data as Record<string, unknown>);
        } else if (tab === "ap") {
          const data = await apiFetch("/api/finance/ap", { token });
          if (!cancelled) setAp(data as Record<string, unknown>);
        } else if (tab === "cash") {
          const data = await apiFetch("/api/finance/cash", { token });
          if (!cancelled) setCash(data as Record<string, unknown>);
        } else {
          const data = await apiFetch("/api/finance/reconciliation", { token });
          if (!cancelled) setRecon(data as Record<string, unknown>);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, token, pnlPreset]);

  async function loadPnlDrilldown(): Promise<DrilldownData> {
    const ytd = (await apiFetch("/api/finance/pnl?preset=ytd", { token })) as Record<string, unknown>;
    const windows = (ytd.contributing_windows || []) as Array<{ period_start?: string; period_end?: string }>;
    const monthly = await Promise.all(
      windows
        .filter((window) => window.period_start && window.period_end)
        .map((window) =>
          apiFetch(
            `/api/finance/pnl?period_start=${encodeURIComponent(String(window.period_start))}&period_end=${encodeURIComponent(String(window.period_end))}`,
            { token }
          ) as Promise<Record<string, unknown>>
        )
    );
    return {
      ytd,
      monthly,
      current: monthly.at(-1),
      previous: monthly.at(-2),
    };
  }

  async function openDrilldown(kind: FinanceDrilldownKind) {
    setDrilldown(kind);
    setDrilldownError("");
    const cached = drilldownCache[kind];
    if (cached) {
      setDrilldownData(cached);
      setDrilldownLoading(false);
      return;
    }
    setDrilldownData(null);
    setDrilldownLoading(true);
    try {
      let data: DrilldownData;
      if (["revenue", "gross_profit", "gross_margin", "net_income"].includes(kind)) {
        data = await loadPnlDrilldown();
      } else if (kind === "ar") {
        data = { ar: (ar || await apiFetch("/api/finance/ar", { token })) as Record<string, unknown> };
      } else if (kind === "ap") {
        data = { ap: (ap || await apiFetch("/api/finance/ap", { token })) as Record<string, unknown> };
      } else if (kind === "cash") {
        data = { cash: (cash || await apiFetch("/api/finance/cash", { token })) as Record<string, unknown> };
      } else {
        data = { bs: (bs || await apiFetch("/api/finance/balance-sheet", { token })) as Record<string, unknown> };
      }
      setDrilldownCache((current) =>
        ["revenue", "gross_profit", "gross_margin", "net_income"].includes(kind)
          ? {
              ...current,
              revenue: data,
              gross_profit: data,
              gross_margin: data,
              net_income: data,
            }
          : { ...current, [kind]: data }
      );
      setDrilldownData(data);
    } catch (e: unknown) {
      setDrilldownError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setDrilldownLoading(false);
    }
  }

  function navigateFromDrilldown(nextTab: FinanceTab) {
    setDrilldown(null);
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  const metrics = (overview?.metrics || {}) as Record<string, FinanceMetric>;
  const domains = (overview?.domains || recon?.domains || {}) as Record<string, { domain?: string; status?: string; state?: string; last_success_at?: string; coverage_start?: string; coverage_end?: string; notes?: string }>;
  const trend = (overview?.pnl_trend || {}) as {
    state?: string;
    notes?: string;
    points?: Array<{ period_start: string; revenue: number | null; net_income: number | null }>;
  };

  const maxTrend = useMemo(() => {
    const pts = trend.points || [];
    return Math.max(1, ...pts.map((p) => Math.abs(Number(p.revenue) || 0)));
  }, [trend]);

  return (
    <div>
      <section className="fin-hero">
        <div className="fin-hero-inner">
          <p className="fin-kicker">eliteOS Finance · Accrual</p>
          <h1>
            Financial condition, <em>governed</em>
          </h1>
          <p>
            QuickBooks remains the accounting system of record. eliteOS shows stored Accrual statements and
            prepared working-capital facts — never reconstructed P&amp;L, never live bank-feed cash, never
            AI-calculated totals.
          </p>
        </div>
      </section>

      <nav className="fin-tabbar" aria-label="Finance sections">
        {FINANCE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
          >
            <span>{item.index}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="fin-page">
        {error ? <div className="fin-banner fail">{error}</div> : null}
        {loading ? <p className="fin-muted">Loading governed Finance facts…</p> : null}

        <div className="fin-tab-content" key={tab}>
        {tab === "overview" && overview ? (
          <>
            <div className="fin-kpi-grid">
              <MetricCard metric={metrics.revenue} tone="light" onOpen={() => void openDrilldown("revenue")} />
              <MetricCard metric={metrics.gross_profit} tone="dark" onOpen={() => void openDrilldown("gross_profit")} />
              <MetricCard metric={metrics.gross_margin_pct} tone="light" onOpen={() => void openDrilldown("gross_margin")} />
              <MetricCard metric={metrics.net_income} tone="red" onOpen={() => void openDrilldown("net_income")} />
              <MetricCard metric={metrics.cash} tone="dark" onOpen={() => void openDrilldown("cash")} />
              <MetricCard metric={metrics.open_ar} tone="light" onOpen={() => void openDrilldown("ar")} />
              <MetricCard metric={metrics.open_ap} tone="light" onOpen={() => void openDrilldown("ap")} />
            </div>

            <div className="fin-split">
              <article className="fin-card light">
                <p className="fin-kicker">P&amp;L trend preview</p>
                {trend.state !== "available" ? (
                  <EmptyState title="Trend unavailable" body={String(trend.notes || "Need at least two monthly Accrual P&L snapshots.")} />
                ) : (
                  <div className="fin-bars" aria-hidden="true">
                    {(trend.points || []).map((p) => (
                      <div key={p.period_start} className="fin-bar-col">
                        <div className="fin-bar" style={{ height: `${Math.max(6, ((Number(p.revenue) || 0) / maxTrend) * 120)}px` }} />
                        <span>{String(p.period_start).slice(0, 7)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
              <article className="fin-card light">
                <p className="fin-kicker">Working capital</p>
                <MetricCard metric={(overview.working_capital as FinanceMetric) || null} />
                <p className="fin-muted">Open A/R minus open A/P when both facts are available.</p>
              </article>
            </div>

            <article
              className="fin-card light fin-trust-card fin-explorable"
              role="button"
              tabIndex={0}
              aria-label="Explore Balance Sheet reconciliation"
              onClick={() => void openDrilldown("balance_sheet")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void openDrilldown("balance_sheet");
                }
              }}
            >
              <p className="fin-kicker">Balance Sheet identity</p>
              <div className="fin-trust-card-equation">
                <strong>Assets</strong>
                <span>=</span>
                <strong>Liabilities + Equity</strong>
              </div>
              <p className="fin-trust-card-result">
                <Pill state={String((overview.balance_sheet_identity as { status?: string })?.status)}>
                  {statusLabel(String((overview.balance_sheet_identity as { status?: string })?.status))}
                </Pill>
                <span>
                  Difference{" "}
                  {formatMoney((overview.balance_sheet_identity as { delta?: number | null })?.delta)}
                </span>
              </p>
              <span className="fin-explore-cue">Open trust detail <i aria-hidden="true">↗</i></span>
            </article>

            <article className="fin-card dark">
              <p className="fin-kicker">Data freshness</p>
              <div className="fin-domain-grid">
                {Object.values(domains).map((d) => (
                  <div key={d.domain}>
                    <strong>{d.domain}</strong>
                    <Pill state={d.state}>{statusLabel(d.state)}</Pill>
                    <p className="fin-muted">
                      {d.last_success_at ? `Last success ${d.last_success_at}` : d.notes || "Awaiting first Finance sync"}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </>
        ) : null}

        {tab === "pnl" && pnl ? (
          <>
            <div className="fin-controls">
              {["current_month", "previous_month", "ytd", "prior_ytd"].map((p) => (
                <button key={p} type="button" className={pnlPreset === p ? "is-active" : ""} onClick={() => setPnlPreset(p)}>
                  {p.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            {pnl.state === "unavailable" ? (
              <EmptyState title="Data unavailable" body={String(pnl.notes || "No Accrual P&L snapshot for this period.")} />
            ) : (
              <>
                <p className="fin-period-banner">
                  {formatPeriodCaption({
                    period_start: String(pnl.period_start || (pnl.period as { period_start?: string })?.period_start || ""),
                    period_end: String(pnl.period_end || (pnl.period as { period_end?: string })?.period_end || ""),
                    is_derived: pnl.is_derived === true,
                    preset: String((pnl.period as { preset?: string })?.preset || pnlPreset),
                  }) || "Accounting period unavailable"}
                </p>
                <div className="fin-kpi-grid compact">
                  {([
                    ["revenue", "Revenue", (pnl.headline as { revenue?: number | null })?.revenue],
                    ["gp", "Gross Profit", (pnl.headline as { gross_profit?: number | null })?.gross_profit],
                    ["gm_pct", "Gross Margin", (pnl.headline as { gross_margin_pct?: number | null })?.gross_margin_pct],
                    ["ni", "Net Income", (pnl.headline as { net_income?: number | null })?.net_income],
                  ] as Array<[string, string, number | null | undefined]>).map(([key, label, value]) => (
                    <MetricCard
                      key={key}
                      metric={{
                        key,
                        label,
                        value: value ?? null,
                        state: value == null ? "unavailable" : "available",
                        period_start: String(pnl.period_start || ""),
                        period_end: String(pnl.period_end || ""),
                        is_derived: pnl.is_derived === true,
                        preset: String((pnl.period as { preset?: string })?.preset || pnlPreset),
                      }}
                    />
                  ))}
                </div>
                {pnl.hierarchy_state === "unavailable" ? (
                  <EmptyState
                    title="Detailed YTD statement unavailable"
                    body={String(
                      pnl.hierarchy_notes ||
                        "YTD control totals are summed from monthly Accrual P&L snapshots. Line-level hierarchy is not aggregated without a stable account identity."
                    )}
                  />
                ) : (
                  <StatementTable rows={(pnl.lines as never[]) || []} />
                )}
              </>
            )}
          </>
        ) : null}

        {tab === "balance-sheet" && bs ? (
          <>
            {bs.state === "unavailable" ? (
              <EmptyState title="Data unavailable" body={String(bs.notes || "No current Accrual Balance Sheet snapshot.")} />
            ) : (
              <>
                <article className="fin-card light">
                  <p className="fin-kicker">Assets = Liabilities + Equity</p>
                  <p className="fin-kpi">{formatMoney((bs.totals as { total_assets?: number })?.total_assets)}</p>
                  <Pill state={String((bs.identity as { status?: string })?.status)}>
                    {statusLabel(String((bs.identity as { status?: string })?.status))} delta {formatMoney((bs.identity as { delta?: number })?.delta)}
                  </Pill>
                  <p className="fin-muted">
                    Opening snapshot {String((bs.opening as { as_of_date?: string })?.as_of_date || "2024-12-31")} is metadata only — not the current statement.
                  </p>
                </article>
                <h2 className="fin-section">Assets</h2>
                <StatementTable
                  rows={((bs.assets as Array<{ label: string; amount: number | null; row_type?: string }>) || []).map((r) => ({
                    ...r,
                    current_amount: r.amount,
                  }))}
                />
                <h2 className="fin-section">Liabilities</h2>
                <StatementTable
                  rows={((bs.liabilities as Array<{ label: string; amount: number | null }>) || []).map((r) => ({
                    ...r,
                    current_amount: r.amount,
                  }))}
                />
                <h2 className="fin-section">Equity</h2>
                <StatementTable
                  rows={((bs.equity as Array<{ label: string; amount: number | null }>) || []).map((r) => ({
                    ...r,
                    current_amount: r.amount,
                  }))}
                />
              </>
            )}
          </>
        ) : null}

        {tab === "ar" && ar ? (
          <>
            <div className="fin-kpi-grid compact">
              <MetricCard metric={ar.total as FinanceMetric} tone="light" />
              <MetricCard metric={ar.overdue as FinanceMetric} tone="red" />
            </div>
            {(ar.aging as { state?: string })?.state !== "available" ? (
              <EmptyState
                title="Aging unavailable"
                body={String((ar.aging as { notes?: string })?.notes || "DueDate coverage is not sufficient. Invoice date is never used.")}
              />
            ) : (
              <article className="fin-card light">
                <p className="fin-kicker">Aging</p>
                <div className="fin-table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Bucket</th>
                        <th>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingRowsFromBuckets((ar.aging as { buckets?: Record<string, number | null> }).buckets).map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{formatMoney(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Open</th>
                    <th>Overdue</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {((ar.customers as Array<{ customer_name: string; open_amount: number; overdue_amount: number; invoice_count: number }>) || []).map((c) => (
                    <tr key={c.customer_name}>
                      <td>{c.customer_name}</td>
                      <td>{formatMoney(c.open_amount)}</td>
                      <td>{formatMoney(c.overdue_amount)}</td>
                      <td>
                        <button
                          type="button"
                          className="fin-text-btn"
                          onClick={() =>
                            setModal({
                              title: c.customer_name,
                              body: (
                                <p>
                                  Open {formatMoney(c.open_amount)} · Overdue {formatMoney(c.overdue_amount)} ·{" "}
                                  {c.invoice_count} invoices. Full Account 360 is not part of Finance v1.
                                </p>
                              ),
                            })
                          }
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "ap" && ap ? (
          <>
            <div className="fin-kpi-grid compact">
              <MetricCard metric={ap.total as FinanceMetric} />
              <MetricCard metric={ap.overdue as FinanceMetric} tone="red" />
              <MetricCard metric={ap.due as FinanceMetric} tone="dark" />
            </div>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Open</th>
                    <th>Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {((ap.vendors as Array<{ vendor_name: string; open_amount: number; overdue_amount: number }>) || []).map((v) => (
                    <tr key={v.vendor_name}>
                      <td>{v.vendor_name}</td>
                      <td>{formatMoney(v.open_amount)}</td>
                      <td>{formatMoney(v.overdue_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2 className="fin-section">Bills</h2>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Ref</th>
                    <th>Due</th>
                    <th>Open</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {((ap.bills as Array<{ vendor_name: string; reference_number?: string; due_date?: string; open_amount: number; is_paid: boolean }>) || []).map((b, i) => (
                    <tr key={`${b.reference_number}-${i}`}>
                      <td>{b.vendor_name}</td>
                      <td>{b.reference_number || "—"}</td>
                      <td>{b.due_date || "—"}</td>
                      <td>{formatMoney(b.open_amount)}</td>
                      <td>{b.is_paid ? "Paid" : "Open"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "cash" && cash ? (
          <>
            <MetricCard metric={cash.position as FinanceMetric} tone="dark" />
            <div className="fin-banner dark">
              <strong>Do not add receipts + deposits</strong>
              <p>{String((cash.anti_double_count as { notes?: string })?.notes)}</p>
            </div>
            <div className="fin-kpi-grid">
              {((cash.by_event_role as Array<{ event_role: string; amount: number | null; count: number }>) || []).map((role) => (
                <article key={role.event_role} className="fin-card light">
                  <p className="fin-kicker">{cashEventRoleLabel(role.event_role)}</p>
                  <p className="fin-kpi">{formatMoney(role.amount)}</p>
                  <p className="fin-muted">{role.count} events</p>
                </article>
              ))}
            </div>
            {((cash.recent_checks as Array<{ payee_name?: string; txn_date?: string; amount?: number | null; reference_number?: string }>) || []).length ? (
              <>
                <h2 className="fin-section">Recent checks</h2>
                <div className="fin-table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Payee</th>
                        <th>Date</th>
                        <th>Ref</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((cash.recent_checks as Array<{
                        payee_name?: string;
                        txn_date?: string;
                        amount?: number | null;
                        reference_number?: string;
                      }>) || []).map((c, i) => (
                        <tr key={`${c.reference_number || c.payee_name || "check"}-${i}`}>
                          <td>{c.payee_name || "—"}</td>
                          <td>{c.txn_date || "—"}</td>
                          <td>{c.reference_number || "—"}</td>
                          <td>{formatMoney(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {tab === "reconciliation" && recon ? (
          <>
            <article className="fin-card light">
              <p className="fin-kicker">Balance Sheet identity</p>
              <Pill state={String((recon.balance_sheet_identity as { status?: string })?.status)}>
                {statusLabel(String((recon.balance_sheet_identity as { status?: string })?.status))}
              </Pill>
            </article>
            <div className="fin-domain-grid">
              {Object.values(domains).map((d) => (
                <article key={d.domain} className="fin-card light">
                  <p className="fin-kicker">{d.domain}</p>
                  <Pill state={d.state}>{statusLabel(d.status || d.state)}</Pill>
                  <p className="fin-muted">
                    Coverage {d.coverage_start || "—"} → {d.coverage_end || "—"}
                  </p>
                  <p className="fin-muted">{d.last_success_at || d.notes || "Awaiting first Finance sync"}</p>
                </article>
              ))}
            </div>
          </>
        ) : null}
        </div>
      </div>

      {modal ? (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          {modal.body}
        </Modal>
      ) : null}
      {drilldown && overview ? (
        <FinanceDrilldownContent
          kind={drilldown}
          overview={overview}
          data={drilldownData}
          loading={drilldownLoading}
          error={drilldownError}
          onClose={() => setDrilldown(null)}
          onNavigate={navigateFromDrilldown}
        />
      ) : null}
    </div>
  );
}
