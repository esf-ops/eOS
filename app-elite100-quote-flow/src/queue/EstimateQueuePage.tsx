import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  fetchQuoteFlowQueue,
  fetchQuoteFlowQueueDetail,
  setQuoteFlowScope,
  type QuoteFlowQueueItem
} from "../lib/quoteFlowQueueApi";
import {
  aiTakeoffHeadUrl,
  isAllowedTakeoffMessageOrigin,
  isValidTakeoffApprovedMessage
} from "../lib/takeoffPostMessageOrigins.mjs";

type Props = {
  authToken: string;
  onOpenEstimates?: (estimateId?: string | null) => void;
};

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export default function EstimateQueuePage(props: Props) {
  const { authToken, onOpenEstimates } = props;
  const [items, setItems] = useState<QuoteFlowQueueItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteFlowQueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [setScopeBusy, setSetScopeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const takeoffSrc = useMemo(() => {
    if (!selectedJobId) return null;
    const params = new URLSearchParams({
      takeoffJobId: String(selectedJobId),
      consolidated: "1",
      mode: "editable",
      persistentWorkspace: "1",
      quoteFlowSetScope: "1"
    });
    return `${aiTakeoffHeadUrl()}/?${params.toString()}`;
  }, [selectedJobId]);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueue(authToken, { filter: "all" });
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  async function openReview(takeoffJobId: string) {
    setSelectedJobId(takeoffJobId);
    setNotice(null);
    setEstimateId(null);
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueueDetail(authToken, takeoffJobId);
      setDetail(res.item);
      if (res.item.estimateId) setEstimateId(res.item.estimateId);
    } catch (e) {
      setDetail(null);
      setError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }

  async function runSetScope() {
    if (!selectedJobId || inFlightRef.current || setScopeBusy) return;
    inFlightRef.current = true;
    setSetScopeBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await setQuoteFlowScope(authToken, selectedJobId, { confirm: true });
      setEstimateId(res.estimateId || null);
      setNotice(res.message || "Scope is set for this estimate.");
      await loadList();
      if (selectedJobId) {
        const refreshed = await fetchQuoteFlowQueueDetail(authToken, selectedJobId);
        setDetail(refreshed.item);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlightRef.current = false;
      setSetScopeBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedJobId) return;
    function onMessage(event: MessageEvent) {
      if (!isAllowedTakeoffMessageOrigin(event.origin)) return;
      if (!isValidTakeoffApprovedMessage(event.data, selectedJobId)) return;
      void runSetScope();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, selectedJobId]);

  return (
    <section className="qf-page" data-testid="qf-queue-page">
      <header className="qf-page__header">
        <h1>Estimate Queue</h1>
        <p className="qf-muted">
          Review returned AI Takeoff measurements against the plan. When dimensions look right, use{" "}
          <strong>Set Scope</strong> / <strong>Use these measurements</strong> to make them the
          official estimate scope. AI Takeoff is then complete for that estimate.
        </p>
      </header>

      {error ? (
        <div className="qf-error-box" data-testid="qf-queue-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-queue-notice">
          {notice}
        </p>
      ) : null}

      <div className="qf-queue" data-testid="qf-queue">
        <div className="qf-queue__list" data-testid="qf-queue-list">
          <div className="qf-inbox__list-head">
            <h2>Returned takeoffs</h2>
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-queue-refresh"
              onClick={() => void loadList()}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
          {loading ? <p className="qf-muted">Loading queue…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="qf-muted" data-testid="qf-queue-empty">
              No takeoffs ready for review yet. Start AI Takeoff from Inbox first.
            </p>
          ) : null}
          <ul className="qf-inbox__rows">
            {items.map((row) => {
              const jobId = row.takeoffJobId || "";
              const active = jobId && jobId === selectedJobId;
              return (
                <li key={jobId || row.intakeCaseId || row.customerName || "row"}>
                  <div
                    className={active ? "qf-inbox__row is-active" : "qf-inbox__row"}
                    data-testid="qf-queue-row"
                    data-takeoff-job-id={jobId}
                  >
                    <span className="qf-inbox__row-title">
                      {row.customerName || "Customer"} — {row.projectName || "Project"}
                    </span>
                    <span className="qf-inbox__row-meta">
                      {jobId ? `Job ${jobId.slice(0, 8)}…` : "No job"}
                    </span>
                    <span
                      className="qf-inbox__status"
                      data-testid="qf-queue-row-status"
                      data-status={row.status?.key || ""}
                    >
                      {row.status?.label || "Ready for review"}
                    </span>
                    {row.action === "review_takeoff" && jobId ? (
                      <button
                        type="button"
                        className="qf-btn-primary"
                        data-testid="qf-queue-review"
                        onClick={() => void openReview(jobId)}
                      >
                        Review Takeoff
                      </button>
                    ) : row.alreadyScoped ? (
                      <button
                        type="button"
                        className="qf-btn-secondary"
                        data-testid="qf-queue-open-estimates"
                        onClick={() => onOpenEstimates?.(row.estimateId)}
                      >
                        View in Estimates
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="qf-queue__detail" data-testid="qf-queue-detail">
          {!selectedJobId ? (
            <div className="qf-placeholder">
              <p>Select Review Takeoff to verify measurements with the plan visible.</p>
            </div>
          ) : detailLoading ? (
            <p className="qf-muted">Loading takeoff review…</p>
          ) : (
            <>
              <div className="qf-queue__detail-head">
                <div>
                  <h2>Takeoff review</h2>
                  <p className="qf-muted">
                    {detail?.customerName || "Customer"} — {detail?.projectName || "Project"}
                    {selectedJobId ? ` · Job ${selectedJobId}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-queue-set-scope"
                  disabled={setScopeBusy || detail?.alreadyScoped === true}
                  onClick={() => void runSetScope()}
                  title="Save verified measurements as official estimate scope"
                >
                  {setScopeBusy
                    ? "Setting scope…"
                    : detail?.alreadyScoped
                      ? "Scope is set"
                      : "Set Scope"}
                </button>
              </div>

              {detail?.alreadyScoped || estimateId ? (
                <p className="qf-notice" data-testid="qf-queue-scope-set">
                  Scope is set for this estimate.
                  {estimateId ? ` Estimate ${estimateId}.` : ""}{" "}
                  <button
                    type="button"
                    className="qf-linkish"
                    data-testid="qf-queue-goto-estimates"
                    onClick={() => onOpenEstimates?.(estimateId || detail?.estimateId)}
                  >
                    Open Estimates
                  </button>
                </p>
              ) : (
                <p className="qf-muted" data-testid="qf-queue-set-scope-hint">
                  Verify dimensions, then click <strong>Set Scope</strong> or{" "}
                  <strong>Use these measurements</strong> in the review panel.
                </p>
              )}

              {takeoffSrc ? (
                <div className="qf-queue__frame-wrap">
                  <iframe
                    title="Takeoff review"
                    src={takeoffSrc}
                    className="qf-queue__frame"
                    data-testid="qf-queue-takeoff-iframe"
                    allow="fullscreen"
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
