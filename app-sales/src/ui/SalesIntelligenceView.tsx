import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ApiError, apiFetch } from "../lib/api";
import type { MeResp, PerformanceIntelligenceResponse } from "../lib/types";

const ACTIVE_REPS = ["Casey Schenke", "Thera McEnany", "Michael Joseph"] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function nf(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(undefined, opts).format(n);
}

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function classBadge(cls: string) {
  const c = String(cls ?? "").split(",")[0].trim();
  if (c === "active_rep") return <span className="pi-badge pi-badge--active">Active Rep</span>;
  if (c === "house_account") return <span className="pi-badge pi-badge--house">House Account</span>;
  if (c === "fallback_moraware") return <span className="pi-badge pi-badge--fallback">Moraware Fallback</span>;
  if (c === "unknown") return <span className="pi-badge pi-badge--unknown">Unknown</span>;
  return <span className="pi-badge pi-badge--fallback">{c || "—"}</span>;
}

type TabId = "overview" | "reps" | "accounts" | "focus" | "jobs" | "quality";

type Props = {
  token: string;
  me: MeResp | null;
  legacyFilterQuery: string;
  onLoadError: (msg: string) => void;
};

export default function SalesIntelligenceView({ token, me, legacyFilterQuery, onLoadError }: Props) {
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const [tab, setTab] = useState<TabId>("overview");
  const [piBusy, setPiBusy] = useState(false);
  const [pi, setPi] = useState<PerformanceIntelligenceResponse | null>(null);

  const [periodMode, setPeriodMode] = useState("ytd_vs_prior_ytd");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [customStart, setCustomStart] = useState(`${now.getFullYear()}-01-01`);
  const [customEnd, setCustomEnd] = useState(now.toISOString().slice(0, 10));
  const [branch, setBranch] = useState("All");
  const [piSalesperson, setPiSalesperson] = useState("All");
  const [salespersonClass, setSalespersonClass] = useState("all");
  /** Immediate input; PI query uses debounced value to avoid fetch storms while typing. */
  const [customerSearchDraft, setCustomerSearchDraft] = useState("");
  const debouncedSearch = useDebounced(customerSearchDraft, 300);
  const [trendYearCurrent, setTrendYearCurrent] = useState(now.getFullYear());
  const [trendYearPrior, setTrendYearPrior] = useState(now.getFullYear() - 1);
  /** Advanced: when true, volume/rep tables show active rep + house rows only. Default off (Part F). */
  const [showActivePlusHouseOnly, setShowActivePlusHouseOnly] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  /** After Reset, next PI query must ignore stale debounced search until draft catches up. */
  const forceClearSearchOnNextPiQuery = useRef(false);

  const isAdmin = String(me?.user?.role ?? "").toLowerCase() === "admin";
  const [debugPi, setDebugPi] = useState(false);

  const buildPiQuery = useCallback(() => {
    const p = new URLSearchParams(legacyFilterQuery);
    p.set("periodMode", periodMode);
    p.set("year", String(year));
    p.set("month", String(month));
    p.set("quarter", String(quarter));
    p.set("start", customStart.trim());
    p.set("end", customEnd.trim());
    if (branch && branch !== "All") p.set("branch", branch);
    if (piSalesperson && piSalesperson !== "All") {
      if (piSalesperson === "__MORAWARE_FALLBACK__") {
        p.set("salespersonClass", "fallback_moraware");
      } else {
        p.set("piSalesperson", piSalesperson);
      }
    }
    if (salespersonClass && salespersonClass !== "all") p.set("salespersonClass", salespersonClass);
    const searchTrimmed = forceClearSearchOnNextPiQuery.current ? "" : debouncedSearch.trim();
    if (forceClearSearchOnNextPiQuery.current) forceClearSearchOnNextPiQuery.current = false;
    if (searchTrimmed) p.set("search", searchTrimmed);
    p.set("trendYearCurrent", String(trendYearCurrent));
    p.set("trendYearPrior", String(trendYearPrior));
    if (debugPi && isAdmin) p.set("debug", "1");
    return p.toString();
  }, [
    legacyFilterQuery,
    periodMode,
    year,
    month,
    quarter,
    customStart,
    customEnd,
    branch,
    piSalesperson,
    salespersonClass,
    debouncedSearch,
    trendYearCurrent,
    trendYearPrior,
    debugPi,
    isAdmin
  ]);

  const loadPi = useCallback(async () => {
    setPiBusy(true);
    onLoadErrorRef.current("");
    try {
      const q = buildPiQuery();
      const data = (await apiFetch(`/api/sales/performance-intelligence?${q}`, { token })) as PerformanceIntelligenceResponse;
      if (!data.ok) throw new Error("Performance intelligence response not ok");
      setPi(data);
    } catch (e: unknown) {
      if (e instanceof ApiError) onLoadErrorRef.current(e.message);
      else onLoadErrorRef.current(String((e as Error)?.message ?? e));
      setPi(null);
    } finally {
      setPiBusy(false);
    }
  }, [token, buildPiQuery]);

  useEffect(() => {
    if (!token.trim()) return;
    void loadPi();
  }, [token, legacyFilterQuery, debouncedSearch, loadPi, resetNonce]);

  function resetPrimaryFilters() {
    const d = new Date();
    setPeriodMode("ytd_vs_prior_ytd");
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setQuarter(Math.floor(d.getMonth() / 3) + 1);
    setCustomStart(`${d.getFullYear()}-01-01`);
    setCustomEnd(d.toISOString().slice(0, 10));
    setBranch("All");
    setPiSalesperson("All");
    setSalespersonClass("all");
    setCustomerSearchDraft("");
    forceClearSearchOnNextPiQuery.current = true;
    setTrendYearCurrent(d.getFullYear());
    setTrendYearPrior(d.getFullYear() - 1);
    setShowActivePlusHouseOnly(false);
    setDebugPi(false);
    setResetNonce((n) => n + 1);
  }

  const ex = pi?.executiveSnapshot;

  const repRows = useMemo(() => {
    const rows = (pi?.repSummary ?? []) as Array<{
      salesperson: string;
      salespersonClass: string;
      currentSqft: number;
      priorSqft: number;
      yoySqft: number;
      yoyPct: number | null;
      accountCount: number;
      jobCount: number;
    }>;
    if (!showActivePlusHouseOnly) return rows;
    return rows.filter((r) => r.salespersonClass === "active_rep" || r.salespersonClass === "house_account");
  }, [pi?.repSummary, showActivePlusHouseOnly]);

  const volRows = useMemo(() => {
    const rows = (pi?.volumeByLocationRep ?? []) as Array<{
      branch: string;
      salesperson: string;
      salespersonClass: string;
      currentSqft: number;
      priorSqft: number;
      yoyPct: number | null;
    }>;
    if (!showActivePlusHouseOnly) return rows;
    return rows.filter((r) => r.salespersonClass === "active_rep" || r.salespersonClass === "house_account");
  }, [pi?.volumeByLocationRep, showActivePlusHouseOnly]);

  const chartData = useMemo(() => {
    return (pi?.monthlyYoY.months ?? []).map((m) => ({
      ...m,
      label: m.monthLabel
    }));
  }, [pi?.monthlyYoY.months]);

  return (
    <div className="pi-dashboard">
      <div className="pi-topbar">
        <label>
          Performance period
          <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value)}>
            <option value="month_vs_prior_year_month">Month vs prior year month</option>
            <option value="quarter_vs_prior_year_quarter">Quarter vs prior year quarter</option>
            <option value="ytd_vs_prior_ytd">YTD vs prior YTD</option>
            <option value="custom_vs_prior_year">Custom vs prior year</option>
            <option value="custom_vs_previous_period">Custom vs previous period</option>
          </select>
        </label>
        {(periodMode === "month_vs_prior_year_month" || periodMode === "quarter_vs_prior_year_quarter" || periodMode === "ytd_vs_prior_ytd") ? (
          <label>
            Year
            <input type="number" min={2018} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
        ) : null}
        {periodMode === "month_vs_prior_year_month" ? (
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {periodMode === "quarter_vs_prior_year_quarter" ? (
          <label>
            Quarter
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              <option value={1}>Q1</option>
              <option value={2}>Q2</option>
              <option value={3}>Q3</option>
              <option value={4}>Q4</option>
            </select>
          </label>
        ) : null}
        {(periodMode === "custom_vs_prior_year" || periodMode === "custom_vs_previous_period") ? (
          <>
            <label>
              Start
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </label>
            <label>
              End
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </label>
          </>
        ) : null}
        <label>
          Branch / location
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="All">All</option>
            {(pi?.branches ?? []).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label>
          Salesperson (attributed)
          <select value={piSalesperson} onChange={(e) => setPiSalesperson(e.target.value)}>
            <option value="All">All</option>
            {ACTIVE_REPS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="House Account - Lisbon">House Account - Lisbon</option>
            {/* House Account - Dyersville removed: branch names come from approved Sales Account Mapping data, not hardcoded UI */}
            <option value="__MORAWARE_FALLBACK__">Moraware fallback (class)</option>
          </select>
        </label>
        <label>
          Class filter
          <select value={salespersonClass} onChange={(e) => setSalespersonClass(e.target.value)}>
            <option value="all">All classes</option>
            <option value="active_rep">Active rep</option>
            <option value="house_account">House account</option>
            <option value="fallback_moraware">Moraware fallback</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label style={{ minWidth: "200px" }}>
          Customer / job search
          <input
            type="text"
            placeholder="Account, job, Moraware text…"
            value={customerSearchDraft}
            onChange={(e) => setCustomerSearchDraft(e.target.value)}
          />
        </label>
        <label>
          YoY chart years
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" style={{ width: 88 }} value={trendYearPrior} onChange={(e) => setTrendYearPrior(Number(e.target.value))} />
            <span style={{ alignSelf: "center", color: "var(--pi-muted)" }}>vs</span>
            <input type="number" style={{ width: 88 }} value={trendYearCurrent} onChange={(e) => setTrendYearCurrent(Number(e.target.value))} />
          </div>
        </label>
        <button type="button" className="pi-btn pi-btn-primary" onClick={() => void loadPi()} disabled={piBusy}>
          {piBusy ? "Loading…" : "Apply"}
        </button>
        <button type="button" className="pi-btn" onClick={() => void loadPi()}>
          Refresh
        </button>
        <button type="button" className="pi-btn" onClick={resetPrimaryFilters} disabled={piBusy}>
          Reset
        </button>
      </div>

      <div className="pi-tabs" role="tablist">
        {(
          [
            ["overview", "Overview"],
            ["reps", "Reps"],
            ["accounts", "Accounts"],
            ["focus", "Focus Accounts"],
            ["jobs", "Jobs"],
            ["quality", "Data Quality"]
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="pi-tab" data-on={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="pi-main">
        <h1 className="pi-h1">Elite Stone Fabrication · Sales Performance Intelligence</h1>
        <p className="pi-sub">
          Moraware records the work. eliteOS explains the work. The heads move the work. · Worksheet Sq.Ft. only until Quote Platform unlocks
          revenue.
        </p>

        {piBusy && !pi ? <div className="pi-banner">Loading performance intelligence…</div> : null}

        {tab === "overview" && ex ? (
          <>
            <div className="pi-grid-cards">
              <div className="pi-card">
                <p className="pi-card-title">Current period Sq.Ft.</p>
                <p className="pi-card-value">{nf(ex.currentSqft, { maximumFractionDigits: 0 })}</p>
                <p className="pi-card-note">
                  {ex.currentStart} → {ex.currentEnd}
                </p>
              </div>
              <div className="pi-card">
                <p className="pi-card-title">Prior period Sq.Ft.</p>
                <p className="pi-card-value">{nf(ex.priorSqft, { maximumFractionDigits: 0 })}</p>
                <p className="pi-card-note">
                  {ex.priorStart} → {ex.priorEnd}
                </p>
              </div>
              <div className="pi-card">
                <p className="pi-card-title">Net change</p>
                <p className={`pi-card-value ${ex.netYoYChange >= 0 ? "pi-pos" : "pi-neg"}`}>
                  {ex.netYoYChange >= 0 ? "+" : ""}
                  {nf(ex.netYoYChange, { maximumFractionDigits: 0 })}
                </p>
                <p className="pi-card-note">YoY {pct(ex.yoyPct)}</p>
              </div>
              <div className="pi-card">
                <p className="pi-card-title">Active accounts (current)</p>
                <p className="pi-card-value">{nf(ex.activeAccounts)}</p>
              </div>
              <div className="pi-card">
                <p className="pi-card-title">Jobs (current)</p>
                <p className="pi-card-value">{nf(ex.jobCount)}</p>
                <p className="pi-card-note">Avg {nf(ex.avgSqftPerJob, { maximumFractionDigits: 1 })} Sq.Ft. / job</p>
              </div>
              <div className="pi-card">
                <p className="pi-card-title">Latest job creation in window</p>
                <p className="pi-card-value" style={{ fontSize: "1.1rem" }}>
                  {ex.latestProductionDate ?? "—"}
                </p>
              </div>
            </div>

            <div className="pi-section">
              <h2>
                Company-wide monthly YoY ({pi?.monthlyYoY.priorYear} vs {pi?.monthlyYoY.currentYear})
              </h2>
              <div className="pi-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fill: "#15803d", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                        color: "#0f172a"
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="right" dataKey="jobCountCurrent" name="Jobs (current yr)" fill="#94a3b8" />
                    <Line yAxisId="left" type="monotone" dataKey="currentYearSqft" name={`Sq.Ft. ${pi?.monthlyYoY.currentYear}`} stroke="#22c55e" dot={false} strokeWidth={2} />
                    <Line yAxisId="left" type="monotone" dataKey="priorYearSqft" name={`Sq.Ft. ${pi?.monthlyYoY.priorYear}`} stroke="#64748b" dot={false} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pi-section pi-two-col">
              <div>
                <h2>Volume by location & rep</h2>
                <div className="pi-table-wrap">
                  <table className="pi-table">
                    <thead>
                      <tr>
                        <th>Branch</th>
                        <th>Salesperson (norm.)</th>
                        <th>Class</th>
                        <th className="pi-num">Current</th>
                        <th className="pi-num">Prior</th>
                        <th className="pi-num">YoY %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volRows.slice(0, 40).map((r, i) => (
                        <tr key={`${r.branch}-${r.salesperson}-${i}`}>
                          <td>{r.branch}</td>
                          <td>
                            {r.salesperson}
                            {ACTIVE_REPS.includes(r.salesperson as (typeof ACTIVE_REPS)[number]) ? classBadge("active_rep") : classBadge(r.salespersonClass)}
                          </td>
                          <td>{r.salespersonClass}</td>
                          <td className="pi-num">{nf(r.currentSqft, { maximumFractionDigits: 0 })}</td>
                          <td className="pi-num">{nf(r.priorSqft, { maximumFractionDigits: 0 })}</td>
                          <td className={`pi-num ${(r.yoyPct ?? 0) >= 0 ? "pi-pos" : "pi-neg"}`}>{pct(r.yoyPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h2>Rep summary</h2>
                <p className="pi-banner" style={{ marginBottom: "0.5rem" }}>
                  <button
                    type="button"
                    className={`pi-btn pi-toggle${showActivePlusHouseOnly ? "" : ""}`}
                    data-on={showActivePlusHouseOnly}
                    onClick={() => setShowActivePlusHouseOnly((x) => !x)}
                  >
                    {showActivePlusHouseOnly ? "Showing: active reps + house" : "Showing: all attribution groups"}
                  </button>
                </p>
                <div className="pi-table-wrap">
                  <table className="pi-table">
                    <thead>
                      <tr>
                        <th>Rep</th>
                        <th>Class</th>
                        <th className="pi-num">Current</th>
                        <th className="pi-num">Prior</th>
                        <th className="pi-num">YoY %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repRows.map((r) => (
                        <tr key={`${r.salesperson}-${r.salespersonClass}`}>
                          <td>
                            {r.salesperson}
                            {ACTIVE_REPS.includes(r.salesperson as (typeof ACTIVE_REPS)[number]) ? classBadge("active_rep") : classBadge(r.salespersonClass)}
                          </td>
                          <td>{r.salespersonClass}</td>
                          <td className="pi-num">{nf(r.currentSqft, { maximumFractionDigits: 0 })}</td>
                          <td className="pi-num">{nf(r.priorSqft, { maximumFractionDigits: 0 })}</td>
                          <td className={`pi-num ${(r.yoyPct ?? 0) >= 0 ? "pi-pos" : "pi-neg"}`}>{pct(r.yoyPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {tab === "reps" && pi ? (
          <div className="pi-section">
            <h2>Rep summary (full)</h2>
            <div className="pi-table-wrap">
              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th>Class</th>
                    <th className="pi-num">Current Sq.Ft.</th>
                    <th className="pi-num">Prior Sq.Ft.</th>
                    <th>Top accounts (current)</th>
                  </tr>
                </thead>
                <tbody>
                  {(pi.repSummary as Array<{ salesperson: string; salespersonClass: string; currentSqft: number; priorSqft: number; topAccounts: { account: string; totalSqft: number }[] }>).map((r) => (
                    <tr key={`${r.salesperson}-full`}>
                      <td>
                        {r.salesperson}
                        {ACTIVE_REPS.includes(r.salesperson as (typeof ACTIVE_REPS)[number]) ? classBadge("active_rep") : classBadge(r.salespersonClass)}
                      </td>
                      <td>{r.salespersonClass}</td>
                      <td className="pi-num">{nf(r.currentSqft, { maximumFractionDigits: 0 })}</td>
                      <td className="pi-num">{nf(r.priorSqft, { maximumFractionDigits: 0 })}</td>
                      <td style={{ fontSize: "0.75rem" }}>
                        {(r.topAccounts ?? []).map((a) => (
                          <span key={a.account} style={{ display: "inline-block", marginRight: 8 }}>
                            {a.account}: {nf(a.totalSqft, { maximumFractionDigits: 0 })}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "accounts" && pi ? (
          <div className="pi-section pi-two-col">
            <div>
              <h2>Top customers / producers</h2>
              <div className="pi-table-wrap">
                <table className="pi-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Branch</th>
                      <th className="pi-num">Current</th>
                      <th className="pi-num">Prior</th>
                      <th className="pi-num">YoY %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pi.topCustomers as Array<{ account: string; branch: string; currentSqft: number; priorSqft: number; yoyPct: number | null }>).map((a) => (
                      <tr key={a.account}>
                        <td>{a.account}</td>
                        <td>{a.branch}</td>
                        <td className="pi-num">{nf(a.currentSqft, { maximumFractionDigits: 0 })}</td>
                        <td className="pi-num">{nf(a.priorSqft, { maximumFractionDigits: 0 })}</td>
                        <td className={`pi-num ${(a.yoyPct ?? 0) >= 0 ? "pi-pos" : "pi-neg"}`}>{pct(a.yoyPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2>Biggest YoY growers</h2>
              <div className="pi-table-wrap">
                <table className="pi-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className="pi-num">Δ Sq.Ft.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pi.biggestYoYGrowers as Array<{ account: string; yoySqft: number }>).map((a) => (
                      <tr key={`g-${a.account}`}>
                        <td>{a.account}</td>
                        <td className="pi-num pi-pos">+{nf(a.yoySqft, { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2 style={{ marginTop: "1rem" }}>Largest YoY declines</h2>
              <div className="pi-table-wrap">
                <table className="pi-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className="pi-num">Δ Sq.Ft.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pi.largestYoYDeclines as Array<{ account: string; yoySqft: number }>).map((a) => (
                      <tr key={`d-${a.account}`}>
                        <td>{a.account}</td>
                        <td className="pi-num pi-neg">{nf(a.yoySqft, { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "focus" && pi ? (
          <div className="pi-section">
            <h2>Focus accounts (prior ≥ 100 Sq.Ft. &amp; decline)</h2>
            <div className="pi-table-wrap">
              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Branch</th>
                    <th className="pi-num">Current</th>
                    <th className="pi-num">Prior</th>
                    <th className="pi-num">Net</th>
                    <th>Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {(pi.focusAccounts as Array<{ account: string; branch: string; currentSqft: number; priorSqft: number; yoySqft: number }>).map((a) => (
                    <tr key={`f-${a.account}`}>
                      <td>{a.account}</td>
                      <td>{a.branch}</td>
                      <td className="pi-num">{nf(a.currentSqft, { maximumFractionDigits: 0 })}</td>
                      <td className="pi-num">{nf(a.priorSqft, { maximumFractionDigits: 0 })}</td>
                      <td className="pi-num pi-neg">{nf(a.yoySqft, { maximumFractionDigits: 0 })}</td>
                      <td>Follow up / re-engage</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 style={{ marginTop: "1.5rem" }}>Account pipeline (selected salesperson)</h2>
            <p className="pi-banner">
              Use the <strong>Salesperson</strong> filter in the top bar to scope assigned accounts. Active reps (Casey, Thera, Michael) show
              accounts attributed to them; house rows are labeled.
            </p>
            <div className="pi-table-wrap">
              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Branch</th>
                    <th className="pi-num">Current</th>
                    <th className="pi-num">Prior</th>
                    <th className="pi-num">YoY %</th>
                    <th>Last job</th>
                    <th>Focus</th>
                  </tr>
                </thead>
                <tbody>
                  {(pi.assignedAccountsView.assignedAccounts as Array<{
                    account: string;
                    branch: string;
                    currentSqft: number;
                    priorSqft: number;
                    yoyPct: number | null;
                    lastJobDate: string | null;
                    focusFlag: boolean;
                  }>).map((a) => (
                    <tr key={`as-${a.account}`}>
                      <td>{a.account}</td>
                      <td>{a.branch}</td>
                      <td className="pi-num">{nf(a.currentSqft, { maximumFractionDigits: 0 })}</td>
                      <td className="pi-num">{nf(a.priorSqft, { maximumFractionDigits: 0 })}</td>
                      <td className={`pi-num ${(a.yoyPct ?? 0) >= 0 ? "pi-pos" : "pi-neg"}`}>{pct(a.yoyPct)}</td>
                      <td>{a.lastJobDate ?? "—"}</td>
                      <td>{a.focusFlag ? <span className="pi-neg">Watch</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: "1rem" }}>Highest YoY decline (selection)</h3>
            <div className="pi-table-wrap">
              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="pi-num">Current</th>
                    <th className="pi-num">Prior</th>
                    <th className="pi-num">Net decline</th>
                  </tr>
                </thead>
                <tbody>
                  {(pi.assignedAccountsView.focusAccountsForSelection as Array<{ account: string; currentSqft: number; priorSqft: number; yoySqft: number }>).map((a) => (
                    <tr key={`fs-${a.account}`}>
                      <td>{a.account}</td>
                      <td className="pi-num">{nf(a.currentSqft, { maximumFractionDigits: 0 })}</td>
                      <td className="pi-num">{nf(a.priorSqft, { maximumFractionDigits: 0 })}</td>
                      <td className="pi-num pi-neg">{nf(a.yoySqft, { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "quality" && pi ? (
          <div className="pi-section">
            <h2>{pi.classificationPanel.title}</h2>
            <p className="pi-banner">{pi.classificationPanel.disclaimer}</p>
            <h3>Applied account rules</h3>
            <ul style={{ color: "var(--pi-muted)", fontSize: "0.875rem" }}>
              {pi.classificationPanel.appliedAccountRules.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h3>Classification method</h3>
            <div className="pi-table-wrap">
              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th className="pi-num">Volume (Sq.Ft.)</th>
                    <th className="pi-num">Share</th>
                    <th className="pi-num">Accounts</th>
                    <th className="pi-num">Jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {pi.classificationPanel.methodTable.map((row) => (
                    <tr key={row.classificationMethod}>
                      <td>{row.classificationMethodLabel}</td>
                      <td className="pi-num">{nf(row.volume, { maximumFractionDigits: 0 })}</td>
                      <td className="pi-num">{row.share != null && Number.isFinite(row.share) ? `${(row.share * 100).toFixed(1)}%` : "—"}</td>
                      <td className="pi-num">{nf(row.accountCount)}</td>
                      <td className="pi-num">{nf(row.jobCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pi-banner">
              Mapped volume:{" "}
              {pi.classificationPanel.mappedVolumePct != null ? `${pi.classificationPanel.mappedVolumePct.toFixed(1)}%` : "—"} · Unmapped
              volume:{" "}
              {pi.classificationPanel.unmappedVolumePct != null ? `${pi.classificationPanel.unmappedVolumePct.toFixed(1)}%` : "—"} · Unknown
              salesperson jobs:{" "}
              {pi.classificationPanel.unknownSalespersonJobCount} · Unmapped branch jobs: {pi.classificationPanel.unknownBranchJobCount}
            </p>
            {isAdmin ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <input type="checkbox" checked={debugPi} onChange={(e) => setDebugPi(e.target.checked)} />
                <span>Include debug payload (admin)</span>
              </label>
            ) : null}
            {debugPi && pi.debug ? (
              <pre className="pi-banner" style={{ overflow: "auto", maxHeight: 360 }}>
                {JSON.stringify(pi.debug, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}

        {tab === "jobs" ? (
          <JobsTabEmbedded token={token} pi={pi} legacyFilterQuery={legacyFilterQuery} includeAttribution={isAdmin} />
        ) : null}

        {pi?.dataNotes?.length ? (
          <div className="pi-banner" style={{ marginTop: "1.5rem" }}>
            {pi.dataNotes.join(" ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function JobsTabEmbedded({
  token,
  pi,
  legacyFilterQuery,
  includeAttribution
}: {
  token: string;
  pi: PerformanceIntelligenceResponse | null;
  legacyFilterQuery: string;
  includeAttribution: boolean;
}) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [localSearch, setLocalSearch] = useState("");

  const loadJobs = useCallback(async () => {
    if (!pi?.legacyQueryForJobs) return;
    setBusy(true);
    try {
      const p = new URLSearchParams(legacyFilterQuery);
      p.set("range", pi.legacyQueryForJobs.range);
      p.set("start", pi.legacyQueryForJobs.start);
      p.set("end", pi.legacyQueryForJobs.end);
      p.set("compare", "none");
      p.set("sortBy", sortBy);
      p.set("sortDir", sortDir);
      p.set("limit", "100");
      p.set("offset", String(offset));
      if (includeAttribution) p.set("attribution", "1");
      const jr = (await apiFetch(`/api/sales/jobs?${p.toString()}`, { token })) as { rows: Array<Record<string, unknown>>; total: number };
      setRows(jr.rows ?? []);
      setTotal(jr.total ?? 0);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }, [token, pi, legacyFilterQuery, sortBy, sortDir, offset, includeAttribution]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const visible = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [r.jobName, r.account, r.jobId, r.salesperson].map((x) => String(x ?? "").toLowerCase()).join(" ");
      return blob.includes(q);
    });
  }, [rows, localSearch]);

  if (!pi) {
    return <div className="pi-banner">Load performance intelligence first (Overview tab).</div>;
  }

  return (
    <div className="pi-section">
      <h2>Jobs (current PI window)</h2>
      <p className="pi-banner">
        {pi.legacyQueryForJobs.start} → {pi.legacyQueryForJobs.end} · {busy ? "Loading…" : `${total} jobs`}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <input className="pi-input-inline" style={{ minWidth: 220 }} placeholder="Search loaded page…" value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date">Date</option>
          <option value="account">Account</option>
          <option value="salesperson">Salesperson</option>
          <option value="sqft">Sq.Ft.</option>
        </select>
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}>
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
        <button type="button" className="pi-btn" onClick={() => setOffset(Math.max(0, offset - 100))} disabled={offset <= 0}>
          Prev
        </button>
        <button type="button" className="pi-btn" onClick={() => setOffset(offset + 100)} disabled={offset + 100 >= total}>
          Next
        </button>
      </div>
      <div className="pi-table-wrap">
        <table className="pi-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Account</th>
              <th>Moraware SP</th>
              <th>Norm. SP / branch</th>
              <th className="pi-num">Sq.Ft.</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const att = r.attribution as { normalizedSalesperson?: string; branch?: string; morawareSalesperson?: string } | undefined;
              return (
                <tr key={String(r.jobId)}>
                  <td>{String(r.jobName)}</td>
                  <td>{String(r.account)}</td>
                  <td>{String(r.salesperson)}</td>
                  <td style={{ fontSize: "0.75rem" }}>
                    {att ? (
                      <>
                        {att.normalizedSalesperson}
                        <br />
                        <span className="pi-muted">{att.branch}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="pi-num">{nf(Number(r.sqft ?? 0), { maximumFractionDigits: 1 })}</td>
                  <td>{String(r.creationDate ?? "")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
