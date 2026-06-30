import React, { useEffect, useState } from "react";
import type { TakeoffBetaQaRow } from "../lib/takeoffBeta";
import { fetchTakeoffBetaQaSummary } from "../lib/api";

interface Props {
  authToken: string;
  refreshKey?: number;
  pauseBackgroundRefresh?: boolean;
}

function fmtSf(n: number) {
  return `${Number(n).toFixed(2)} sf`;
}

export default function TakeoffBetaQaPanel({
  authToken,
  refreshKey = 0,
  pauseBackgroundRefresh = false,
}: Props) {
  const [rows, setRows] = useState<TakeoffBetaQaRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authToken || pauseBackgroundRefresh) return;
    setLoading(true);
    void fetchTakeoffBetaQaSummary(authToken, 25)
      .then((res) => setRows(res.rows ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load QA summary"))
      .finally(() => setLoading(false));
  }, [authToken, refreshKey, pauseBackgroundRefresh]);

  return (
    <div className="takeoff-beta-qa">
      <p className="muted small">Staff-only beta QA — latest imported takeoff quotes for this org.</p>
      {pauseBackgroundRefresh ? (
        <p className="muted small">QA refresh paused while AI takeoff is generating.</p>
      ) : null}
      {loading ? <p className="muted small">Loading…</p> : null}
      {error ? <p className="error small">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="muted small">No imported takeoff quotes yet.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="takeoff-beta-qa-table-wrap">
          <table className="takeoff-beta-qa-table">
            <thead>
              <tr>
                <th>Quote</th>
                <th>Takeoff job</th>
                <th>Estimator</th>
                <th>Imported CT/BS</th>
                <th>Current CT/BS</th>
                <th>Delta</th>
                <th>Feedback</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.quoteId}-${row.takeoffJobId}`}>
                  <td>{row.quoteNumber ?? row.quoteId?.slice(0, 8) ?? "—"}</td>
                  <td>{row.takeoffJobId?.slice(0, 8) ?? "—"}</td>
                  <td>{row.estimator ?? "—"}</td>
                  <td>{fmtSf(row.importedCountertopSf)} / {fmtSf(row.importedBacksplashSf)}</td>
                  <td>{fmtSf(row.currentCountertopSf)} / {fmtSf(row.currentBacksplashSf)}</td>
                  <td>{fmtSf(row.deltaCountertopSf)} / {fmtSf(row.deltaBacksplashSf)}</td>
                  <td>{row.feedbackStatus}{row.feedbackCount > 1 ? ` (${row.feedbackCount})` : ""}</td>
                  <td>{row.issueCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
