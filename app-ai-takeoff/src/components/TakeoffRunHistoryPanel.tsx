/**
 * TakeoffRunHistoryPanel — compact AI extraction run history for a workspace.
 *
 * Shows recent AI extraction runs (from GET /api/takeoff-jobs/:id/results).
 * For each run: timestamp, prompt version, model, computed CT sf, BS sf (with
 * delta vs currently loaded run), warning count, and a "Load this run" button.
 *
 * "Load this run" fetches the full result by ID and calls onLoadRun so the
 * parent Lab can restore that run into the review UI.
 *
 * Security:
 *   - storage_path and secrets are never in the API response — no extra guard needed.
 *   - organizationId derived server-side — never sent from client.
 *   - No quote mutation. No pricing.
 */
import React, { useCallback, useEffect, useState } from "react";
import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import { labApiGet, LabApiError } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunSummary {
  id:                   string | null;
  createdAt:            string;
  promptVersion:        string | null;
  provider:             string | null; // v5.9: "openai" | "gemini"
  modelUsed:            string | null;
  computedCountertopSf: number;
  computedBacksplashSf: number;
  computedCombinedSf:   number;
  warningCount:         number;
  errorCount:           number;
  reviewStatus:         string;
  schemaVersion:        string | null;
  source:               "results_table" | "result_summary";
}

interface LoadedRunResult {
  ok:                        boolean;
  takeoffJobId:              string;
  resultId:                  string;
  promptVersion:             string | null;
  modelUsed:                 string | null;
  normalizedTakeoffJson:     TakeoffResult;
  computedMeasurementsJson:  TakeoffComputedMeasurements;
  pageInventory:             object | null; // v5.4
  dimensionEvidence:         object | null; // v5.5
}

export interface TakeoffRunHistoryPanelProps {
  takeoffJobId:    string;
  token:           string;
  currentResultId: string | null;
  currentComputed: TakeoffComputedMeasurements | null;
  refreshKey?:     number;
  onLoadRun: (
    result:   TakeoffResult,
    meta:     {
      promptVersion: string | null;
      modelUsed:     string | null;
      resultId:      string;
      pageInventory?:     object | null;
      dimensionEvidence?: object | null;
    }
  ) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtSf(n: number): string {
  return n.toFixed(2);
}

function fmtDelta(curr: number, ref: number | null): string | null {
  if (ref === null) return null;
  const d = curr - ref;
  return `${d >= 0 ? "+" : ""}${d.toFixed(2)}`;
}

function deltaClass(curr: number, ref: number | null): string {
  if (ref === null) return "";
  const d = curr - ref;
  if (Math.abs(d) < 0.05) return "run-history-delta--neutral";
  return d > 0 ? "run-history-delta--pos" : "run-history-delta--neg";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffRunHistoryPanel({
  takeoffJobId,
  token,
  currentResultId,
  currentComputed,
  refreshKey = 0,
  onLoadRun,
}: TakeoffRunHistoryPanelProps) {
  const [runs,      setRuns]      = useState<RunSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadErr,   setLoadErr]   = useState<string | null>(null);

  // Fetch run history when job ID, token, or refreshKey changes.
  useEffect(() => {
    if (!takeoffJobId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchErr(null);

    void (async () => {
      try {
        const res = await labApiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/results`,
          token
        ) as { ok: boolean; results: RunSummary[] };
        setRuns(res.results ?? []);
      } catch (e) {
        const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Failed to load run history.";
        setFetchErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [takeoffJobId, token, refreshKey]);

  const handleLoad = useCallback(async (run: RunSummary) => {
    if (!run.id || !token) return;
    setLoadingId(run.id);
    setLoadErr(null);

    try {
      const res = await labApiGet(
        `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/results/${encodeURIComponent(run.id)}`,
        token
      ) as LoadedRunResult;

      if (res.ok && res.normalizedTakeoffJson) {
        onLoadRun(res.normalizedTakeoffJson, {
          promptVersion: res.promptVersion  ?? null,
          modelUsed:     res.modelUsed      ?? null,
          resultId:      res.resultId,
          pageInventory:     res.pageInventory    ?? null,
          dimensionEvidence: res.dimensionEvidence ?? null,
        });
      } else {
        throw new Error("Server returned unexpected response");
      }
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Load failed.";
      setLoadErr(msg);
    } finally {
      setLoadingId(null);
    }
  }, [takeoffJobId, token, onLoadRun]);

  if (loading) {
    return (
      <div className="run-history-panel lab-card">
        <p className="run-history-loading">Loading run history…</p>
      </div>
    );
  }

  if (fetchErr) {
    return (
      <div className="run-history-panel lab-card">
        <p className="run-history-error">✗ {fetchErr}</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="run-history-panel lab-card">
        <p className="run-history-empty">No AI extraction runs yet for this workspace.</p>
      </div>
    );
  }

  const refCt = currentComputed?.countertopExactSf ?? null;
  const refBs = currentComputed?.backsplashExactSf ?? null;

  return (
    <div className="run-history-panel lab-card">
      <div className="run-history-header">
        <span className="run-history-title">AI extraction history</span>
        <span className="run-history-count">{runs.length} run{runs.length !== 1 ? "s" : ""} · newest first</span>
      </div>

      <table className="run-history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Provider · Model</th>
            <th>CT sf</th>
            <th>BS sf</th>
            <th>Warnings</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, i) => {
            const isLoaded = run.id !== null && run.id === currentResultId;
            const ctDelta  = fmtDelta(run.computedCountertopSf, refCt);
            const bsDelta  = fmtDelta(run.computedBacksplashSf, refBs);
            const canLoad  = run.id !== null && !isLoaded;

            return (
              <tr key={run.id ?? `run-${i}`} className={isLoaded ? "run-history-row run-history-row--loaded" : "run-history-row"}>
                <td className="run-history-ts">{fmtDate(run.createdAt)}</td>
                <td className="run-history-meta">
                  {run.provider && (
                    <span className={`run-history-provider-pill run-history-provider-pill--${run.provider}`}>
                      {run.provider}
                    </span>
                  )}
                  {run.modelUsed ? ` ${run.modelUsed}` : (run.promptVersion ? `Prompt ${run.promptVersion}` : "—")}
                </td>
                <td className="run-history-sf">
                  {fmtSf(run.computedCountertopSf)}
                  {ctDelta && !isLoaded && (
                    <span className={`run-history-delta ${deltaClass(run.computedCountertopSf, refCt)}`}>
                      {" "}{ctDelta}
                    </span>
                  )}
                </td>
                <td className="run-history-sf">
                  {fmtSf(run.computedBacksplashSf)}
                  {bsDelta && !isLoaded && (
                    <span className={`run-history-delta ${deltaClass(run.computedBacksplashSf, refBs)}`}>
                      {" "}{bsDelta}
                    </span>
                  )}
                </td>
                <td className="run-history-warnings">
                  {run.warningCount > 0
                    ? <span className="run-history-warn-badge">{run.warningCount}</span>
                    : <span className="run-history-ok-badge">0</span>
                  }
                  {run.errorCount > 0 && (
                    <span className="run-history-err-badge">{run.errorCount} err</span>
                  )}
                </td>
                <td className="run-history-action">
                  {isLoaded ? (
                    <span className="run-history-loaded-tag">Loaded ✓</span>
                  ) : canLoad ? (
                    <button
                      type="button"
                      className="run-history-load-btn"
                      disabled={loadingId === run.id}
                      onClick={() => void handleLoad(run)}
                    >
                      {loadingId === run.id ? "Loading…" : "Load"}
                    </button>
                  ) : (
                    <span className="run-history-no-id">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {loadErr && (
        <p className="run-history-load-error" role="alert">✗ {loadErr}</p>
      )}
    </div>
  );
}
