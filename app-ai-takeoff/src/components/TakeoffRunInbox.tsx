/**
 * TakeoffRunInbox — org-scoped run list for AI Takeoff Lab operators.
 *
 * Loads recent takeoff jobs via GET /api/takeoff-jobs and lets the user open a run
 * (updates parent state + ?takeoffJobId= deep link).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { listTakeoffJobs, LabApiError, type TakeoffJobListItem } from "../lib/api";
import {
  deriveTakeoffJobDisplayStatus,
  takeoffJobStatusChipClass,
} from "../lib/takeoffJobStatusLabels.mjs";

export interface TakeoffRunInboxProps {
  token: string;
  selectedJobId: string | null;
  refreshKey?: number;
  /** Restrict the list to a review status (e.g. "approved" for the history view). */
  reviewStatusFilter?: string;
  /** Pause list polling while async generation is active. */
  pauseBackgroundRefresh?: boolean;
  onSelectJob: (jobId: string) => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TakeoffRunInbox({
  token,
  selectedJobId,
  refreshKey = 0,
  reviewStatusFilter,
  pauseBackgroundRefresh = false,
  onSelectJob,
}: TakeoffRunInboxProps) {
  const [jobs, setJobs] = useState<TakeoffJobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);

  const loadJobs = useCallback(async (signal?: AbortSignal) => {
    if (!token) {
      setJobs([]);
      setLoading(false);
      return false;
    }
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const query = reviewStatusFilter
        ? { limit: 25, review_status: reviewStatusFilter }
        : { limit: 25 };
      const res = await listTakeoffJobs(token, query, { signal });
      if (signal?.aborted) return false;
      setJobs(res.jobs ?? []);
      return true;
    } catch (err) {
      if (signal?.aborted) return false;
      const msg = err instanceof LabApiError ? err.message : String(err);
      setError(msg);
      setJobs([]);
      return false;
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [token, reviewStatusFilter]);

  useEffect(() => {
    if (pauseBackgroundRefresh) return;
    const ac = new AbortController();
    void loadJobs(ac.signal);
    return () => ac.abort();
  }, [loadJobs, refreshKey, pauseBackgroundRefresh]);

  const hasProcessingJobs = jobs.some((j) => j.status === "processing");

  useEffect(() => {
    if (!token || !hasProcessingJobs || pauseBackgroundRefresh) return;
    let stopped = false;
    let timer: number | null = null;
    let errors = 0;
    const ac = new AbortController();
    const schedule = (delayMs: number) => {
      if (stopped) return;
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), delayMs);
    };
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const ok = await loadJobs(ac.signal);
      errors = ok ? 0 : errors + 1;
      schedule(ok ? 10_000 : Math.min(60_000, 10_000 * 2 ** errors));
    };
    schedule(10_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      ac.abort();
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, hasProcessingJobs, loadJobs, pauseBackgroundRefresh]);

  const isApprovedView = reviewStatusFilter === "approved";

  return (
    <div className="takeoff-inbox">
      <div className="takeoff-inbox-header">
        <p className="lab-section-desc">
          {isApprovedView
            ? "Approved takeoffs for your organization. Open one to view its measurement evidence."
            : "Takeoff jobs for your organization. Open a job to review its AI measurements."}
        </p>
        <button
          type="button"
          className="btn secondary takeoff-inbox-refresh"
          disabled={loading || !token}
          onClick={() => void loadJobs()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="banner banner-error takeoff-inbox-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading && jobs.length === 0 ? (
        <p className="takeoff-inbox-empty">
          {isApprovedView ? "Loading approved takeoffs…" : "Loading takeoff jobs…"}
        </p>
      ) : null}

      {!loading && jobs.length === 0 && !error ? (
        <p className="takeoff-inbox-empty">
          {isApprovedView
            ? "No approved takeoffs yet. Approved measurement evidence will appear here."
            : "No takeoff jobs yet. Upload a plan file to begin."}
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="takeoff-inbox-list">
          {jobs.map((job) => {
            const isSelected = selectedJobId === job.takeoffJobId;
            const label = job.originalFilename ?? "Untitled plan";
            const modelLabel =
              job.modelProvider || job.modelVersion
                ? [job.modelProvider, job.modelVersion].filter(Boolean).join(" · ")
                : null;
            const display = deriveTakeoffJobDisplayStatus(job);
            const runningPhase =
              job.status === "processing" ? job.processing?.phaseLabel ?? null : null;

            return (
              <li key={job.takeoffJobId}>
                <button
                  type="button"
                  className={`takeoff-inbox-row${isSelected ? " takeoff-inbox-row--selected" : ""}`}
                  onClick={() => onSelectJob(job.takeoffJobId)}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <div className="takeoff-inbox-row-main">
                    <span className="takeoff-inbox-filename">{label}</span>
                    <span className="takeoff-inbox-meta">{fmtDate(job.createdAt)}</span>
                  </div>
                  <div className="takeoff-inbox-row-sub">
                    <span className={takeoffJobStatusChipClass(display.tone)} title={runningPhase ?? undefined}>
                      {display.label}
                    </span>
                    {runningPhase ? (
                      <span className="takeoff-inbox-phase">{runningPhase}</span>
                    ) : null}
                    {job.resultCount > 0 ? (
                      <span className="takeoff-inbox-count">
                        {job.resultCount} result{job.resultCount === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="takeoff-inbox-count takeoff-inbox-count--muted">No results</span>
                    )}
                    {job.reviewStatus === "approved" && job.approvedAt ? (
                      <span className="takeoff-inbox-approved">
                        Approved {fmtDate(job.approvedAt)}
                      </span>
                    ) : null}
                    {modelLabel ? (
                      <span className="takeoff-inbox-model">{modelLabel}</span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
