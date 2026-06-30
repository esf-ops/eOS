/**
 * TakeoffRunInbox — org-scoped run list for AI Takeoff Lab operators.
 *
 * Loads recent takeoff jobs via GET /api/takeoff-jobs and lets the user open a run
 * (updates parent state + ?takeoffJobId= deep link).
 */
import React, { useCallback, useEffect, useState } from "react";
import { listTakeoffJobs, LabApiError, type TakeoffJobListItem } from "../lib/api";

export interface TakeoffRunInboxProps {
  token: string;
  selectedJobId: string | null;
  refreshKey?: number;
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

function statusChipClass(status: string): string {
  if (status === "completed") return "takeoff-inbox-chip takeoff-inbox-chip--completed";
  if (status === "failed") return "takeoff-inbox-chip takeoff-inbox-chip--failed";
  if (status === "processing") return "takeoff-inbox-chip takeoff-inbox-chip--processing";
  return "takeoff-inbox-chip takeoff-inbox-chip--pending";
}

function reviewChipClass(reviewStatus: string): string {
  if (reviewStatus === "approved") return "status-chip status-approved";
  if (reviewStatus === "rejected") return "takeoff-inbox-chip takeoff-inbox-chip--failed";
  return "status-chip status-draft";
}

export default function TakeoffRunInbox({
  token,
  selectedJobId,
  refreshKey = 0,
  pauseBackgroundRefresh = false,
  onSelectJob,
}: TakeoffRunInboxProps) {
  const [jobs, setJobs] = useState<TakeoffJobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!token) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listTakeoffJobs(token, { limit: 25 });
      setJobs(res.jobs ?? []);
    } catch (err) {
      const msg = err instanceof LabApiError ? err.message : String(err);
      setError(msg);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (pauseBackgroundRefresh) return;
    void loadJobs();
  }, [loadJobs, refreshKey, pauseBackgroundRefresh]);

  const hasProcessingJobs = jobs.some((j) => j.status === "processing");

  useEffect(() => {
    if (!token || !hasProcessingJobs || pauseBackgroundRefresh) return;
    const interval = setInterval(() => void loadJobs(), 10000);
    return () => clearInterval(interval);
  }, [token, hasProcessingJobs, loadJobs, pauseBackgroundRefresh]);

  return (
    <div className="takeoff-inbox">
      <div className="takeoff-inbox-header">
        <p className="lab-section-desc">
          Recent takeoff runs for your organization. Open a run to continue review.
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
        <p className="takeoff-inbox-empty">Loading runs…</p>
      ) : null}

      {!loading && jobs.length === 0 && !error ? (
        <p className="takeoff-inbox-empty">No takeoff runs yet. Upload a plan file to start.</p>
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
                    <span className={statusChipClass(job.status)} title={job.processing?.phaseLabel ?? undefined}>
                      {job.status === "processing" && job.processing?.phaseLabel
                        ? job.processing.phaseLabel
                        : job.status}
                    </span>
                    <span className={reviewChipClass(job.reviewStatus)}>{job.reviewStatus}</span>
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
