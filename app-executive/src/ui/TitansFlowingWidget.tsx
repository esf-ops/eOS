import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError, joinBackendUrl } from "../lib/api";
import { config } from "../lib/config";
import type { TitansTodayJob, TitansTodayResponse } from "../lib/types";
import { nf } from "./exec/execFormat";

const OVERVIEW_PREVIEW_ROWS = 13;
const FALLBACK_OPERATIONAL_CADENCE =
  "For production review, schedule recent operational sync every 5–15 minutes during shop hours. Live accuracy follows Moraware ingestion.";

function formatIsoAgeLabel(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 120) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 120) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function freshnessPillClass(label: string | undefined | null) {
  switch (label) {
    case "Fresh":
      return "titans-fresh-pill titans-fresh-pill--fresh";
    case "Aging":
      return "titans-fresh-pill titans-fresh-pill--aging";
    case "Stale":
      return "titans-fresh-pill titans-fresh-pill--stale";
    default:
      return "titans-fresh-pill titans-fresh-pill--unknown";
  }
}

type TitansJobsTableProps = {
  rows: TitansTodayJob[];
  flashIds: Set<string>;
  onRowClick: (j: TitansTodayJob) => void;
  /** Omit activity-group column when space-constrained */
  omitGroupColumn?: boolean;
};

function TitansJobsTable({ rows, flashIds, onRowClick, omitGroupColumn }: TitansJobsTableProps) {
  return (
    <table className="titans-table">
      <thead>
        <tr>
          <th>Job Name</th>
          <th>Account</th>
          {!omitGroupColumn ? <th>Activity group</th> : null}
          <th>Material</th>
          <th>Sq.Ft.</th>
          <th>Status</th>
          <th>Last Update</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((j) => (
          <tr
            key={j.jobId}
            className={flashIds.has(j.jobId) ? "titans-row-flash" : ""}
            onClick={() => onRowClick(j)}
          >
            <td className="titans-ellipsis" title={j.jobName}>
              {j.jobName}
            </td>
            <td className="titans-ellipsis" title={j.account}>
              {j.account || "—"}
            </td>
            {!omitGroupColumn ? (
              <td className="titans-ellipsis titans-muted" title={j.activityGroupLabel ?? j.activityGroupKey}>
                {(j.activityGroupLabel ?? j.activityGroupKey ?? "—").replace(/\([^)]*\)\s*$/g, "").trim() || "—"}
              </td>
            ) : null}
            <td>{j.materialColor ?? "Unknown material"}</td>
            <td>{j.squareFootage != null ? nf(j.squareFootage, { maximumFractionDigits: 1 }) : "—"}</td>
            <td>
              <span className={statusBadgeClass(j.status)}>{j.status}</span>
            </td>
            <td className="titans-nowrap">{j.lastPhaseUpdate ? new Date(j.lastPhaseUpdate).toLocaleString() : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ymdLocal(d = new Date()) {
  return d.toLocaleDateString("en-CA");
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const dt = new Date(y, mo, day);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== day) return null;
  return dt;
}

function formatDisplayDate(ymd: string) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

const STATUS_URGENCY: Record<string, number> = {
  "Missing Material": 0,
  "Held / Needs Review": 1,
  "Waiting on Template": 2,
  "Cutting Now": 3,
  "Queued for Titan": 4,
  "Ready for Next Phase": 5,
  "Cut Complete": 6
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "Cutting Now":
      return "titans-badge titans-badge--cut";
    case "Queued for Titan":
      return "titans-badge titans-badge--queue";
    case "Cut Complete":
      return "titans-badge titans-badge--done";
    case "Held / Needs Review":
      return "titans-badge titans-badge--held";
    case "Missing Material":
      return "titans-badge titans-badge--miss";
    case "Waiting on Template":
      return "titans-badge titans-badge--tmpl";
    case "Ready for Next Phase":
      return "titans-badge titans-badge--next";
    default:
      return "titans-badge titans-badge--neutral";
  }
}

type FilterChip = "all" | "active" | "completed" | "held";
type SortMode = "urgency" | "lastUpdate" | "sqft";

function filterJobs(jobs: TitansTodayJob[], chip: FilterChip) {
  if (chip === "all") return jobs;
  if (chip === "active") return jobs.filter((j) => j.status !== "Cut Complete");
  if (chip === "completed") return jobs.filter((j) => j.status === "Cut Complete");
  return jobs.filter((j) =>
    ["Held / Needs Review", "Missing Material", "Waiting on Template"].includes(j.status)
  );
}

function sortJobs(jobs: TitansTodayJob[], mode: SortMode) {
  const copy = [...jobs];
  if (mode === "urgency") {
    copy.sort((a, b) => {
      const ua = STATUS_URGENCY[a.status] ?? 99;
      const ub = STATUS_URGENCY[b.status] ?? 99;
      if (ua !== ub) return ua - ub;
      return String(b.lastPhaseUpdate ?? "").localeCompare(String(a.lastPhaseUpdate ?? ""));
    });
  } else if (mode === "lastUpdate") {
    copy.sort((a, b) => String(b.lastPhaseUpdate ?? "").localeCompare(String(a.lastPhaseUpdate ?? "")));
  } else {
    copy.sort((a, b) => (Number(b.squareFootage) || 0) - (Number(a.squareFootage) || 0));
  }
  return copy;
}

type Props = {
  token: string;
  recordApi: (path: string, patch: Record<string, unknown>) => void;
  refreshTick: number;
  /** Used to gate admin/debug mapping tooling (Executive users outside admin do not see the toggle except in DEV). */
  userRole?: string;
};

export default function TitansFlowingWidget({ token, recordApi, refreshTick, userRole = "" }: Props) {
  const canMappingToggle = userRole === "admin" || import.meta.env.DEV;

  const [selectedYmd, setSelectedYmd] = useState(() => ymdLocal());
  const [showMappingDetails, setShowMappingDetails] = useState(false);
  const [data, setData] = useState<TitansTodayResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [futureSkipped, setFutureSkipped] = useState(false);
  const [fullListOpen, setFullListOpen] = useState(false);
  const [chip, setChip] = useState<FilterChip>("all");
  const [sortMode, setSortMode] = useState<SortMode>("urgency");
  const [searchRaw, setSearchRaw] = useState("");
  const [detail, setDetail] = useState<TitansTodayJob | null>(null);
  const [tick, setTick] = useState(0);
  const [tabVisible, setTabVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true
  );

  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  const [titansLoadCount, setTitansLoadCount] = useState(0);
  const [lastTitansLoadAt, setLastTitansLoadAt] = useState("");
  const [lastTitansAttemptUrl, setLastTitansAttemptUrl] = useState("");
  const [lastTitansStatus, setLastTitansStatus] = useState<number | "—">("—");

  const todayYmd = useMemo(() => ymdLocal(), [tick]);
  const isTodayView = selectedYmd === todayYmd;
  /** Compare ISO date strings — valid for YYYY-MM-DD. */
  const isFuture = Boolean(selectedYmd && selectedYmd > todayYmd);

  const loadTitans = useCallback(async () => {
    if (!token) return;
    if (isFuture) {
      setFutureSkipped(true);
      setData(null);
      setLoadError("");
      recordApi("/api/titans/today", { status: "skipped", reason: "future_date" });
      setTitansLoadCount((n) => n + 1);
      setLastTitansLoadAt(new Date().toISOString());
      setLastTitansAttemptUrl("(future date — request not sent)");
      setLastTitansStatus("skipped");
      return;
    }
    setFutureSkipped(false);
    setLoadError("");
    const q = new URLSearchParams();
    q.set("date", selectedYmd);
    q.set("limit", "200");
    if (canMappingToggle && showMappingDetails) q.set("debug", "1");
    const path = `/api/titans/today?${q.toString()}`;
    const attemptUrl = joinBackendUrl(path);
    setTitansLoadCount((n) => n + 1);
    setLastTitansLoadAt(new Date().toISOString());
    setLastTitansAttemptUrl(attemptUrl);
    setLoading(true);
    recordApi(path, { status: "starting", url: attemptUrl, backendBase: config.backendBaseUrl });
    try {
      const json = (await apiFetch(path, { token })) as TitansTodayResponse;
      setData(json);
      recordApi(path, { status: 200, ok: true, url: attemptUrl });
      setLastTitansStatus(200);

      if (isTodayView && Array.isArray(json.jobs)) {
        const nextFlash = new Set<string>();
        const m = prevStatusRef.current;
        for (const j of json.jobs) {
          const prev = m.get(j.jobId);
          if (prev !== undefined && prev !== j.status) nextFlash.add(j.jobId);
          m.set(j.jobId, j.status);
        }
        if (nextFlash.size) {
          setFlashIds(nextFlash);
          window.setTimeout(() => setFlashIds(new Set()), 2200);
        }
      } else {
        prevStatusRef.current.clear();
      }
    } catch (e: unknown) {
      setData(null);
      if (e instanceof ApiError) {
        setLoadError(e.message);
        recordApi(path, {
          status: e.status,
          ok: false,
          message: e.message,
          url: e.attemptedUrl ?? attemptUrl
        });
        setLastTitansStatus(e.status);
      } else {
        const msg = String((e as Error)?.message || e);
        setLoadError(
          `Backend is not reachable at ${config.backendBaseUrl}. Attempted ${attemptUrl}. Confirm backend-core is running and this origin is allowed by CORS. (${msg})`
        );
        recordApi(path, { status: 0, ok: false, message: msg, url: attemptUrl });
        setLastTitansStatus(0);
      }
    } finally {
      setLoading(false);
    }
  }, [token, selectedYmd, isFuture, isTodayView, recordApi, showMappingDetails, canMappingToggle]);

  useEffect(() => {
    void loadTitans();
  }, [loadTitans, refreshTick]);

  useEffect(() => {
    const fn = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);

  useEffect(() => {
    if (!isTodayView || !tabVisible) return;
    const id = window.setInterval(() => void loadTitans(), 30000);
    return () => window.clearInterval(id);
  }, [isTodayView, tabVisible, loadTitans]);

  /**
   * Not API polling — re-computes local "today" (YYYY-MM-DD) so `isTodayView` rolls over across midnight.
   * Throttled when the tab is hidden; also bumps once when returning visible (eos refresh policy).
   */
  useEffect(() => {
    const bump = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      setTick((t) => t + 1);
    };
    bump();
    const id = window.setInterval(bump, 60_000);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  const searchQs = searchRaw.trim().toLowerCase();

  const overviewRows = useMemo(() => {
    return sortJobs(filterJobs(data?.jobs ?? [], "all"), "urgency").slice(0, OVERVIEW_PREVIEW_ROWS);
  }, [data?.jobs]);

  const filteredTableFull = useMemo(() => {
    let rows = data?.jobs ?? [];
    rows = filterJobs(rows, chip);
    if (searchQs) {
      rows = rows.filter((j) => {
        const blob = [
          j.jobName,
          j.account,
          j.materialColor,
          j.status,
          j.rawActivityType,
          j.rawActivityStatus,
          j.activityGroupLabel,
          j.activityGroupKey
        ]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" ");
        return blob.includes(searchQs);
      });
    }
    return sortJobs(rows, sortMode);
  }, [data, chip, searchQs, sortMode]);

  const filledShops = useMemo(() => {
    const list = data?.shops ?? [];
    return list.filter(
      (s) =>
        (s.activeJobs ?? 0) + (s.completedToday ?? 0) + (s.heldOrNeedsReview ?? 0) > 0 ||
        (s.totalSqftToday ?? 0) > 0
    );
  }, [data?.shops]);

  const pulseLive = isTodayView && !isFuture && !loadError;

  return (
    <section className="titans-widget" aria-labelledby="titans-heading">
      <div className="titans-widget-shell">
        <header className="titans-widget-header">
          <div className="titans-widget-title-block">
            <div className="titans-live-row">
              {pulseLive ? (
                <span className="titans-pulse" title="Live polling when this tab is visible">
                  <span className="titans-pulse-dot" />
                  Live Today
                </span>
              ) : (
                <span className="titans-historical-label">Historical Review</span>
              )}
              <span className="titans-brain-pill">
                {isTodayView ? "Live from eOS Brain" : "Historical from eOS Brain"}
              </span>
            </div>
            <h2 id="titans-heading" className="titans-title">
              Are the Titans Flowing?
            </h2>
            <p className="titans-subtitle">Live Titan/Saw Activity Signals</p>
            {isTodayView && !isFuture ? (
              <p className="titans-tagline-emphasis">Your paper Titan list, live.</p>
            ) : (
              <p className="titans-tagline-emphasis">Titan/Saw day review for {formatDisplayDate(selectedYmd)}.</p>
            )}
            <p className="titans-help">
              This is the digital version of the paper list — except now it updates itself from Moraware, follows the Titan
              saws in real time, and can be seen from anywhere.
            </p>
          </div>

          <div className="titans-date-controls">
            <label className="titans-date-label">Date</label>
            <input
              type="date"
              className="titans-date-input"
              value={selectedYmd}
              onChange={(e) => setSelectedYmd(e.target.value || ymdLocal())}
            />
            <div className="titans-quick-btns">
              <button type="button" className="btn btn-sm titans-qbtn" onClick={() => setSelectedYmd(ymdLocal())}>
                Today
              </button>
              <button
                type="button"
                className="btn btn-sm titans-qbtn"
                onClick={() => {
                  const t = new Date();
                  t.setDate(t.getDate() - 1);
                  setSelectedYmd(ymdLocal(t));
                }}
              >
                Yesterday
              </button>
              <button
                type="button"
                className="btn btn-sm titans-qbtn"
                onClick={() => {
                  const t = parseYmd(selectedYmd) ?? new Date();
                  t.setDate(t.getDate() - 1);
                  setSelectedYmd(ymdLocal(t));
                }}
              >
                Previous Day
              </button>
              <button
                type="button"
                className="btn btn-sm titans-qbtn"
                onClick={() => {
                  const t = parseYmd(selectedYmd) ?? new Date();
                  t.setDate(t.getDate() + 1);
                  setSelectedYmd(ymdLocal(t));
                }}
              >
                Next Day
              </button>
            </div>
            <p className="titans-viewing-line">
              <strong>Viewing activity date:</strong> {formatDisplayDate(selectedYmd)}{" "}
              <span className="titans-muted">({selectedYmd})</span>
            </p>
            <p className="titans-meta-line titans-sync-meta-stack">
              <span>
                <strong>Moraware activity signals.</strong> Last activity row refresh (Brain payload)&nbsp;
                <strong>{formatIsoAgeLabel(data?.lastUpdated)}</strong>
              </span>
              <span className="titans-meta-muted">
                <code>{data?.lastUpdated ?? "—"}</code>
              </span>
            </p>
            <p className="titans-meta-line">
              <strong>Last Brain sync:</strong>{" "}
              {data?.syncFreshness?.lastBrainSyncAt
                ? `${new Date(data.syncFreshness.lastBrainSyncAt).toLocaleString()} · ${formatIsoAgeLabel(data.syncFreshness.lastBrainSyncAt)}`
                : "—"}
            </p>
            <div className="titans-overview-pulse-row">
              <span className={freshnessPillClass(data?.syncFreshness?.freshnessLabel ?? "")} title="From latest relevant brain_sync_runs finish">
                Freshness: {data?.syncFreshness?.freshnessLabel ?? "Unknown"}
              </span>
              {data?.syncFreshness?.ageSeconds != null &&
              typeof data.syncFreshness.ageSeconds === "number" &&
              Number.isFinite(data.syncFreshness.ageSeconds) ? (
                <span className="titans-muted">Brain sync age · {data.syncFreshness.ageSeconds}s</span>
              ) : null}
            </div>
            {!isTodayView ? (
              <p className="titans-muted">Data for selected day · No automatic polling for historical dates.</p>
            ) : (
              <p className="titans-muted">Auto-refresh every 30s while this tab is visible.</p>
            )}
            <button type="button" className="btn btn-sm titans-refresh-inline" onClick={() => void loadTitans()}>
              Refresh this widget
            </button>
            {canMappingToggle ? (
              <label className="titans-mapping-toggle">
                <input
                  type="checkbox"
                  checked={showMappingDetails}
                  onChange={(e) => setShowMappingDetails(e.target.checked)}
                />
                Show mapping details <span className="titans-muted">(Eric validation / Brain routing)</span>
              </label>
            ) : null}
          </div>
        </header>

        <div className="titans-honesty-note">
          <strong>{futureSkipped ? "Titan/Saw activity signals" : data?.label ?? "Titan/Saw activity signals"}</strong> — These
          are Moraware/eOS Brain activity signals and should be validated against Eric&apos;s paper list before being treated
          as final machine telemetry.
          {data?.notes?.length ? (
            <ul className="titans-notes-list">
              {data.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {!futureSkipped && !loadError ? (
          <p className="titans-cadence-foot">
            Live accuracy depends on recent operational sync cadence.{" "}
            {data?.recommendedSyncCadence ?? FALLBACK_OPERATIONAL_CADENCE}
          </p>
        ) : null}

        {futureSkipped ? (
          <div className="titans-empty">
            <p>No Titan/Saw activity can be shown for a future date.</p>
          </div>
        ) : loadError ? (
          <div className="titans-widget-error">
            <strong>Could not load Titan/Saw list.</strong> {loadError}
          </div>
        ) : (
          <>
            <div className="titans-metrics titans-metrics--compact">
              <div className="titans-metric">
                <div className="titans-metric-val">{nf(data?.activeTitanJobs ?? 0)}</div>
                <div className="titans-metric-lbl">Active signals</div>
              </div>
              <div className="titans-metric">
                <div className="titans-metric-val">{nf(data?.completedToday ?? 0)}</div>
                <div className="titans-metric-lbl">Completed</div>
              </div>
              <div className="titans-metric">
                <div className="titans-metric-val">{nf(data?.heldOrNeedsReview ?? 0)}</div>
                <div className="titans-metric-lbl">Held / review</div>
              </div>
              <div className="titans-metric">
                <div className="titans-metric-val">
                  {data?.totalSqftToday != null ? nf(data.totalSqftToday, { maximumFractionDigits: 0 }) : "—"}
                </div>
                <div className="titans-metric-lbl">Total Sq.Ft.</div>
              </div>
              <div className="titans-metric">
                <div className="titans-metric-val">
                  {data?.averageCompletionPace != null && Number.isFinite(data.averageCompletionPace)
                    ? `${nf(data.averageCompletionPace, { maximumFractionDigits: 1 })} / hr`
                    : "—"}
                </div>
                <div className="titans-metric-lbl">Sq.Ft./hr pace (window)</div>
              </div>
              <div className="titans-metric">
                <div className="titans-metric-val" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                  {data?.pace?.averageMinutesBetweenCompletions != null &&
                  Number.isFinite(data.pace.averageMinutesBetweenCompletions)
                    ? `${nf(data.pace.averageMinutesBetweenCompletions, { maximumFractionDigits: 1 })} min`
                    : "—"}
                </div>
                <div className="titans-metric-lbl">Avg min between completions</div>
              </div>
            </div>

            <div className="titans-pace-detail">
              <strong>Average time between Moraware completion signals</strong>
              {": "}
              {data?.pace?.averageMinutesBetweenCompletions != null &&
              Number.isFinite(data.pace.averageMinutesBetweenCompletions) ? (
                <>
                  {nf(data.pace.averageMinutesBetweenCompletions!, { maximumFractionDigits: 1 })} minutes (mean gap across{" "}
                  {nf(data.pace.completedJobCount ?? 0)} cut-complete jobs).
                  {data.pace.longestGapMinutes != null && Number.isFinite(data.pace.longestGapMinutes) ? (
                    <span className="titans-muted">
                      {" "}
                      Longest gap {nf(data.pace.longestGapMinutes, { maximumFractionDigits: 1 })} min.
                    </span>
                  ) : null}
                  {data.pace.completedSqftPerHour != null && Number.isFinite(data.pace.completedSqftPerHour) ? (
                    <span className="titans-muted">
                      {" "}
                      Completed volume pace {nf(data.pace.completedSqftPerHour!, { maximumFractionDigits: 1 })} Sq.Ft./hr
                      (completion window).
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="titans-muted">
                  —
                  {(data?.pace?.completedJobCount ?? 0) <= 1
                    ? " Need at least two Moraware-cut-complete jobs with timestamps for spacing math."
                    : " Not calculable from current Brain timestamps."}
                </span>
              )}
            </div>

            {canMappingToggle && showMappingDetails && !futureSkipped && !loadError ? (
              <section className="titans-mapping-panel" aria-label="Titans routing debug">
                <h4 className="titans-mapping-title">Eric validation overlay</h4>
                <p className="titans-mapping-lede">
                  Moraware <code>activity_type</code>/<code>activity_status</code> strings, heuristic activity groups,
                  freshness row pick logic, and small candidate samples ({/* no XML */}&nbsp;brain ingest only).
                </p>
                {loading ? <p className="titans-muted">Loading Brain response with <code>?debug=1</code>…</p> : null}
                {data?.syncFreshness ? (
                  <p className="titans-mapping-sync">
                    <strong>Rendered freshness:</strong> {data.syncFreshness.freshnessLabel ?? "—"} · last Brain sync iso{" "}
                    <code>{data.syncFreshness.lastBrainSyncAt ?? "—"}</code>
                  </p>
                ) : null}
                {data?.debug?.syncFreshnessPickReason ? (
                  <p className="titans-mapping-sync">
                    <strong>Freshness source:</strong> <code>{data.debug.syncFreshnessPickReason}</code> · lite row{" "}
                    <code>{JSON.stringify(data.debug.brainSyncRowUsed)}</code>
                  </p>
                ) : loading ? null : (
                  <p className="titans-muted">
                    Payload has no debug envelope yet — toggle on and wait for reload (or Refresh this widget).
                  </p>
                )}
                {data?.debug ? (
                  <>
                    <details className="titans-mapping-details">
                      <summary>Distinct Moraware signals used for grouping</summary>
                      <dl className="titans-mapping-dl-compact">
                        <dt>activities_on_date_total</dt>
                        <dd>
                          {nf(
                            (data.debug.omittedReasonCounts?.activities_on_date_not_matching_titan_keyword_heuristic ?? 0) +
                              (data.debug.candidateActivityCount ?? 0)
                          )}{" "}
                          (= filtered <code>{nf(data.debug.candidateActivityCount ?? 0)}</code> Titan-like acts + omissions)
                        </dd>
                        <dt>activity_groups</dt>
                        <dd>
                          <code>{JSON.stringify(data.debug.activityGroupCounts ?? {})}</code>
                        </dd>
                        <dt>Omissions</dt>
                        <dd>
                          <code>{JSON.stringify(data.debug.omittedReasonCounts ?? {})}</code>
                        </dd>
                        <dt>Keyword heuristics</dt>
                        <dd>
                          <code>{JSON.stringify((data.debug.filterKeywordsUsed ?? []).map((x) => x.slug))}</code>
                        </dd>
                        <dt>Timestamp fields rule</dt>
                        <dd>{(data.debug.timestampFieldsUsed ?? []).join(" · ")}</dd>
                      </dl>
                      <pre className="titans-mapping-pre">
                        {JSON.stringify(
                          {
                            rawActivityTypesSeen: (data.debug.rawActivityTypesSeen ?? []).slice(0, 48),
                            rawStatusesSeen: (data.debug.rawStatusesSeen ?? []).slice(0, 48),
                            sampleCandidates: data.debug.sampleCandidates
                          },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  </>
                ) : null}

                {(overviewRows?.length ?? 0) > 0 ? (
                  <div style={{ overflow: "auto", marginTop: "0.75rem" }}>
                    <table className="titans-table titans-mapping-subtable">
                      <thead>
                        <tr>
                          <th>Job</th>
                          <th>Moraware type</th>
                          <th>Moraware status</th>
                          <th>Activity group</th>
                          <th>Leadership status</th>
                          <th>lastPhaseUpdate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewRows.map((j) => (
                          <tr key={`map-${j.jobId}`}>
                            <td className="titans-ellipsis" title={j.jobName}>
                              {j.jobName}
                            </td>
                            <td className="titans-muted titans-mapping-mono">{j.rawActivityType ?? "—"}</td>
                            <td className="titans-muted titans-mapping-mono">{j.rawActivityStatus ?? "—"}</td>
                            <td className="titans-muted">{j.activityGroupLabel ?? j.activityGroupKey ?? "—"}</td>
                            <td>
                              <span className={statusBadgeClass(j.status)}>{j.status}</span>
                            </td>
                            <td className="titans-nowrap">{j.lastPhaseUpdate ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}

            {(data?.jobs?.length ?? 0) > 0 && filledShops.length ? (
              <div className="titans-shop-section">
                <h3 className="titans-shop-heading">Activity group breakdown (Moraware signals)</h3>
                <p className="titans-shop-sub">
                  Labels are heuristic <strong>activity groups</strong> — validate against Eric&apos;s paper list before treating
                  them as literal shop routing.
                </p>
                <div className="titans-shop-grid">
                  {filledShops.map((s) => (
                    <article key={s.shopKey ?? s.shopName} className="titans-shop-card">
                      <header className="titans-shop-card-head">{s.shopName}</header>
                      <dl className="titans-shop-dl">
                        <div>
                          <dt>Active</dt>
                          <dd>{nf(s.activeJobs ?? 0)}</dd>
                        </div>
                        <div>
                          <dt>Completed</dt>
                          <dd>{nf(s.completedToday ?? 0)}</dd>
                        </div>
                        <div>
                          <dt>Held / review</dt>
                          <dd>{nf(s.heldOrNeedsReview ?? 0)}</dd>
                        </div>
                        <div>
                          <dt>Sq.Ft.</dt>
                          <dd>{nf(s.totalSqftToday ?? 0, { maximumFractionDigits: 0 })}</dd>
                        </div>
                      </dl>
                      <p className="titans-shop-pace">
                        Avg min between completions (group)&nbsp;
                        {s.averageMinutesBetweenCompletions != null &&
                        typeof s.averageMinutesBetweenCompletions === "number" &&
                        Number.isFinite(s.averageMinutesBetweenCompletions) ? (
                          <strong>{nf(s.averageMinutesBetweenCompletions, { maximumFractionDigits: 1 })}</strong>
                        ) : (
                          <span className="titans-muted">—</span>
                        )}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {loading && !data ? (
              <div className="titans-loading">Loading Titan/Saw Moraware activity signals…</div>
            ) : data && !data.jobs?.length ? (
              <div className="titans-empty">
                <p>{data.emptyStateMessage || "No Titan/Saw jobs for this day in the loaded Brain slice."}</p>
                <p className="titans-muted">
                  Run operational sync or validate Titan/Saw activity mappings if this should not be empty.
                </p>
              </div>
            ) : (
              <>
                <div className="titans-snapshot-heading">
                  <h3 className="titans-snapshot-title">Highest-urgency jobs (pulse snapshot)</h3>
                  <p className="titans-snapshot-meta">
                    Showing {overviewRows.length} of {nf(data?.jobs?.length ?? 0)} jobs loaded (Brain limit 200; Moraware
                    timestamps).
                  </p>
                </div>
                <div className="titans-table-wrap titans-overview-table">
                  <TitansJobsTable
                    rows={overviewRows}
                    flashIds={flashIds}
                    omitGroupColumn
                    onRowClick={(j) => setDetail(j)}
                  />
                </div>
                <div className="titans-full-day-actions">
                  <button type="button" className="btn btn-accent titans-full-day-btn" onClick={() => setFullListOpen(true)}>
                    View full day list ({nf(data?.jobs?.length ?? 0)})
                  </button>
                  <span className="titans-muted">Search, chips, sort, and inspect raw Moraware fields in this drawer.</span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {import.meta.env.DEV ? (
        <p className="titans-dev-trace">
          titansLoadCount={titansLoadCount} · lastTitansLoadAt={lastTitansLoadAt || "—"} · lastTitansAttemptUrl=
          {lastTitansAttemptUrl || "—"} · lastTitansStatus={String(lastTitansStatus)} · selectedTitansDate={selectedYmd} ·
          isTitansTodayView={isTodayView ? "true" : "false"} · brainBase={config.backendBaseUrl}
        </p>
      ) : null}

      {fullListOpen && data?.jobs?.length ? (
        <div
          className="modal-overlay titans-full-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFullListOpen(false);
          }}
        >
          <div className="modal-sheet titans-full-day-sheet" role="dialog" aria-labelledby="titans-full-day-title">
            <div className="titans-full-day-head">
              <div>
                <h3 id="titans-full-day-title" style={{ margin: 0 }}>
                  Full day list — Moraware Titan/Saw signals
                </h3>
                <p className="titans-muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
                  Activity date <strong>{formatDisplayDate(selectedYmd)}</strong> ({selectedYmd}) · {(data?.jobs ?? []).length}{" "}
                  jobs loaded
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setFullListOpen(false)}>
                Close
              </button>
            </div>

            <div className="titans-toolbar titans-toolbar--drawer">
              <div className="titans-chips">
                {(
                  [
                    ["all", "All"],
                    ["active", "Active"],
                    ["completed", "Completed"],
                    ["held", "Held / Review"]
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    className={`titans-filter-chip ${chip === k ? "is-on" : ""}`}
                    onClick={() => setChip(k)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <input
                type="search"
                className="titans-search"
                placeholder="Search Titan jobs…"
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
              />
              <label className="titans-sort">
                Sort
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="urgency">Status urgency</option>
                  <option value="lastUpdate">Last update</option>
                  <option value="sqft">Sq.Ft.</option>
                </select>
              </label>
            </div>

            <div className="titans-full-day-scroll">
              <TitansJobsTable rows={filteredTableFull} flashIds={flashIds} onRowClick={(j) => setDetail(j)} />
              {!filteredTableFull.length ? (
                <p className="titans-muted" style={{ padding: "1rem" }}>
                  No rows match filters/search.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div
          className="modal-overlay titans-detail-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="modal-sheet titans-detail-sheet" role="dialog" aria-labelledby="tid">
            <h3 id="tid" style={{ marginTop: 0 }}>
              Titan/Saw job detail
            </h3>
            <p className="titans-muted">Selected calendar day: {selectedYmd}</p>
            <dl className="mini-stat-grid">
              <dt>Job ID</dt>
              <dd>{detail.jobId}</dd>
              <dt>Job</dt>
              <dd>{detail.jobName}</dd>
              <dt>Account</dt>
              <dd>{detail.account || "—"}</dd>
              <dt>Material</dt>
              <dd>{detail.materialColor ?? "Unknown material"}</dd>
              <dt>Sq.Ft.</dt>
              <dd>{detail.squareFootage != null ? nf(detail.squareFootage, { maximumFractionDigits: 1 }) : "—"}</dd>
              <dt>Status</dt>
              <dd>{detail.status}</dd>
              <dt>Activity group</dt>
              <dd>{detail.activityGroupLabel ?? detail.activityGroupKey ?? "—"}</dd>
              <dt>Signals (Brain)</dt>
              <dd>
                <code className="titans-detail-code">{JSON.stringify(detail.signals)}</code>
              </dd>
              <dt>Last phase update</dt>
              <dd>{detail.lastPhaseUpdate ?? "—"}</dd>
            </dl>
            <details className="titans-detail-raw">
              <summary>Raw Moraware activity strings</summary>
              <dl className="mini-stat-grid" style={{ marginTop: 8 }}>
                <dt>Type</dt>
                <dd>{detail.rawActivityType ?? "—"}</dd>
                <dt>Status</dt>
                <dd>{detail.rawActivityStatus ?? "—"}</dd>
              </dl>
            </details>
            <button type="button" className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
