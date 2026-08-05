import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import OfficialScopeEditor, { roomsFromOfficialScope } from "../estimates/OfficialScopeEditor";
import type { QuoteFlowScopeRoom } from "../lib/quoteFlowEstimatesApi";
import {
  formatQueueTime,
  groupQueueItems,
  resolveQueueCustomer,
  resolveQueueGroupKey,
  resolveQueueTitle
} from "../lib/queueGrouping.mjs";
import {
  fetchQuoteFlowQueue,
  fetchQuoteFlowQueueDetail,
  setQuoteFlowManualScope,
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
  onOpenInbox?: (messageKey?: string | null) => void;
};

type DetailMode = "idle" | "review" | "manual" | "success";

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function statusPillClass(statusKey: string | undefined): string {
  const k = String(statusKey || "");
  if (k === "takeoff_failed") return "qf-pill qf-pill--error";
  if (k === "takeoff_queued" || k === "takeoff_processing") return "qf-pill qf-pill--active";
  if (k === "ready_for_review") return "qf-pill qf-pill--ready";
  if (k === "manual_scope_needed") return "qf-pill qf-pill--go";
  if (k === "scope_set") return "qf-pill qf-pill--done";
  return "qf-pill";
}

export default function EstimateQueuePage(props: Props) {
  const { authToken, onOpenEstimates, onOpenInbox } = props;
  const [items, setItems] = useState<QuoteFlowQueueItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteFlowQueueItem | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>("idle");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [setScopeBusy, setSetScopeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [manualRooms, setManualRooms] = useState<QuoteFlowScopeRoom[]>(() =>
    roomsFromOfficialScope([])
  );
  const inFlightRef = useRef(false);
  const successJobIdRef = useRef<string | null>(null);

  const grouped = useMemo(() => groupQueueItems(items), [items]);

  const takeoffSrc = useMemo(() => {
    if (!selectedJobId || detailMode !== "review") return null;
    const params = new URLSearchParams({
      takeoffJobId: String(selectedJobId),
      consolidated: "1",
      mode: "editable",
      persistentWorkspace: "1",
      quoteFlowSetScope: "1"
    });
    return `${aiTakeoffHeadUrl()}/?${params.toString()}`;
  }, [selectedJobId, detailMode]);

  async function loadList() {
    setLoading(true);
    // Keep success notice; clear hard errors on refresh.
    setError(null);
    try {
      // Default active filter — already-scoped items excluded by API.
      const res = await fetchQuoteFlowQueue(authToken, { filter: "active" });
      const rows = Array.isArray(res.items) ? res.items : [];
      setItems(rows);

      // If selected job left the queue after Set Scope, keep success panel.
      if (
        selectedJobId &&
        successJobIdRef.current !== selectedJobId &&
        !rows.some((r) => r.takeoffJobId === selectedJobId) &&
        detailMode !== "success"
      ) {
        setSelectedJobId(null);
        setDetail(null);
        setDetailMode("idle");
      }
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

  function applyScopeSuccess(res: {
    estimateId?: string | null;
    message?: string;
    alreadyScoped?: boolean;
    reused?: boolean;
  }) {
    const id = res.estimateId || null;
    setEstimateId(id);
    setNotice(res.message || "Scope is set for this estimate.");
    setError(null);
    setDetailMode("success");
    successJobIdRef.current = selectedJobId;
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            alreadyScoped: true,
            estimateId: id || prev.estimateId,
            status: { key: "scope_set", label: "Scope set" },
            action: "view_estimates",
            actionLabel: "Open in Estimates"
          }
        : prev
    );
  }

  async function openReview(takeoffJobId: string) {
    setSelectedJobId(takeoffJobId);
    setDetailMode("review");
    setNotice(null);
    setEstimateId(null);
    successJobIdRef.current = null;
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueueDetail(authToken, takeoffJobId);
      setDetail(res.item);
      if (res.item.alreadyScoped) {
        applyScopeSuccess({
          estimateId: res.item.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true
        });
      }
    } catch (e) {
      setDetail(null);
      setError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }

  async function openManualScope(row: QuoteFlowQueueItem) {
    const jobId = row.takeoffJobId || "";
    if (!jobId) return;
    setSelectedJobId(jobId);
    setDetailMode("manual");
    setNotice(null);
    setEstimateId(null);
    successJobIdRef.current = null;
    setManualRooms(roomsFromOfficialScope([]));
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueueDetail(authToken, jobId);
      setDetail(res.item);
      if (res.item.alreadyScoped) {
        applyScopeSuccess({
          estimateId: res.item.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true
        });
      }
    } catch (e) {
      // Still allow manual builder with list row data if detail fails.
      setDetail(row);
      const msg = errorMessage(e);
      if (!/not found|404/i.test(msg)) setError(msg);
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
      applyScopeSuccess(res);
      await loadList();
      // Do not refetch takeoff detail after success — avoids stale 404 noise.
    } catch (e) {
      const msg = errorMessage(e);
      if (/already.?scoped|Scope is already set|Open in Estimates/i.test(msg)) {
        applyScopeSuccess({
          estimateId: estimateId || detail?.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true
        });
        await loadList();
      } else {
        setError(msg);
      }
    } finally {
      inFlightRef.current = false;
      setSetScopeBusy(false);
    }
  }

  async function runManualSetScope() {
    if (!selectedJobId || inFlightRef.current || setScopeBusy) return;
    inFlightRef.current = true;
    setSetScopeBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await setQuoteFlowManualScope(authToken, selectedJobId, {
        confirm: true,
        rooms: manualRooms
      });
      applyScopeSuccess(res);
      await loadList();
    } catch (e) {
      const msg = errorMessage(e);
      if (/already.?scoped|Scope is already set|Open in Estimates/i.test(msg)) {
        applyScopeSuccess({
          estimateId: estimateId || detail?.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true
        });
        await loadList();
      } else {
        setError(msg);
      }
    } finally {
      inFlightRef.current = false;
      setSetScopeBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedJobId || detailMode !== "review") return;
    function onMessage(event: MessageEvent) {
      if (!isAllowedTakeoffMessageOrigin(event.origin)) return;
      if (!isValidTakeoffApprovedMessage(event.data, selectedJobId)) return;
      void runSetScope();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, selectedJobId, detailMode]);

  function renderRow(row: QuoteFlowQueueItem) {
    const jobId = row.takeoffJobId || "";
    const active = jobId && jobId === selectedJobId;
    const customer = resolveQueueCustomer(row);
    const title = resolveQueueTitle(row);
    const when =
      formatQueueTime(row.returnedAt) ||
      formatQueueTime(row.receivedAt) ||
      formatQueueTime(row.startedAt);
    const nextLabel = row.nextAction?.label || row.actionLabel || row.status?.label || "Open";

    return (
      <li key={jobId || row.intakeCaseId || title}>
        <div
          className={active ? "qf-inbox__row-card is-active" : "qf-inbox__row-card"}
          data-testid="qf-queue-row"
          data-takeoff-job-id={jobId}
          data-status={row.status?.key || ""}
          data-group={resolveQueueGroupKey(row)}
        >
          <button
            type="button"
            className="qf-inbox__row-main"
            onClick={() => {
              if (row.canReviewTakeoff && jobId) void openReview(jobId);
              else if (row.canCreateManualScope) void openManualScope(row);
            }}
          >
            <span className="qf-inbox__row-title">{title}</span>
            <span className="qf-inbox__row-meta">
              {customer}
              {when ? ` · ${when}` : ""}
            </span>
            {row.planFilename ? (
              <span className="qf-inbox__row-meta">Plan: {row.planFilename}</span>
            ) : null}
            {row.summary?.label ? (
              <span className="qf-inbox__row-meta" data-testid="qf-queue-row-summary">
                {row.summary.label}
              </span>
            ) : null}
            <span className="qf-inbox__row-status-line">
              <span
                className={statusPillClass(row.status?.key)}
                data-testid="qf-queue-row-status"
                data-status={row.status?.key || ""}
              >
                {row.status?.label || "Ready for review"}
              </span>
              <span className="qf-inbox__next">{nextLabel}</span>
            </span>
          </button>
          <div className="qf-queue__row-actions">
            {row.action === "review_takeoff" && jobId ? (
              <button
                type="button"
                className="qf-btn-primary"
                data-testid="qf-queue-review"
                onClick={() => void openReview(jobId)}
              >
                Review Takeoff
              </button>
            ) : null}
            {row.canCreateManualScope ? (
              <button
                type="button"
                className={row.action === "review_takeoff" ? "qf-btn-secondary" : "qf-btn-primary"}
                data-testid="qf-queue-manual-scope"
                onClick={() => void openManualScope(row)}
              >
                Create Manual Scope
              </button>
            ) : null}
            {row.status?.key === "takeoff_failed" ? (
              <button
                type="button"
                className="qf-btn-secondary"
                data-testid="qf-queue-choose-plan"
                onClick={() => onOpenInbox?.(row.messageKey)}
              >
                Choose another plan
              </button>
            ) : null}
            {row.action === "waiting" ? (
              <span className="qf-muted" data-testid="qf-queue-waiting">
                Waiting on AI Takeoff
              </span>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  function renderSection(
    testId: string,
    title: string,
    rows: QuoteFlowQueueItem[],
    empty: string
  ) {
    return (
      <div className="qf-inbox__section" data-testid={testId}>
        <h3 className="qf-inbox__section-title">
          {title}
          <span className="qf-inbox__section-count">{rows.length}</span>
        </h3>
        {rows.length === 0 ? (
          <p className="qf-muted qf-inbox__section-empty">{empty}</p>
        ) : (
          <ul className="qf-inbox__rows">{rows.map(renderRow)}</ul>
        )}
      </div>
    );
  }

  const showSuccess = detailMode === "success";
  const activeDetail = detail;

  return (
    <section className="qf-page qf-page--queue" data-testid="qf-queue-page">
      <header className="qf-page__header">
        <h1>Estimate Queue</h1>
        <p className="qf-muted">
          Create official estimate scope here. Review AI Takeoff measurements with{" "}
          <strong>Set Scope</strong> / <strong>Use these measurements</strong>, or build a manual
          scope. Once scope is set, the request leaves this queue and appears in Estimates.
        </p>
      </header>

      <div className="qf-stats qf-stats--command" data-testid="qf-queue-stats">
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.readyForReview}</span>
          <span className="qf-stat__label">Ready for AI review</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.manualScopeNeeded}</span>
          <span className="qf-stat__label">Manual scope needed</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.processing}</span>
          <span className="qf-stat__label">AI Takeoff processing</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.failed}</span>
          <span className="qf-stat__label">Failed / needs attention</span>
        </div>
      </div>

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

      <div className="qf-queue qf-queue--scope" data-testid="qf-queue">
        <div className="qf-queue__list" data-testid="qf-queue-list">
          <div className="qf-inbox__list-head">
            <h2>Scope creation</h2>
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
          {loading && items.length === 0 ? <p className="qf-muted">Loading queue…</p> : null}
          {!loading && grouped.stats.total === 0 ? (
            <p className="qf-muted" data-testid="qf-queue-empty">
              No requests need scope creation. Start AI Takeoff from Inbox, or check Estimates for
              scoped work.
            </p>
          ) : null}
          {grouped.stats.total > 0 ? (
            <>
              {renderSection(
                "qf-queue-group-ready",
                "Ready for AI review",
                grouped.ready as QuoteFlowQueueItem[],
                "No takeoffs ready for review."
              )}
              {renderSection(
                "qf-queue-group-manual",
                "Manual scope needed",
                grouped.manual as QuoteFlowQueueItem[],
                "No manual-scope requests."
              )}
              {renderSection(
                "qf-queue-group-processing",
                "AI Takeoff processing",
                grouped.processing as QuoteFlowQueueItem[],
                "No AI Takeoffs in progress."
              )}
              {renderSection(
                "qf-queue-group-failed",
                "Failed / needs attention",
                grouped.failed as QuoteFlowQueueItem[],
                "No failed takeoffs."
              )}
            </>
          ) : null}
        </div>

        <div className="qf-queue__detail" data-testid="qf-queue-detail">
          {detailMode === "idle" || !selectedJobId ? (
            <div className="qf-placeholder qf-placeholder--command">
              <h2>Create scope</h2>
              <p>
                Select <strong>Review Takeoff</strong> to verify AI measurements, or{" "}
                <strong>Create Manual Scope</strong> when AI Takeoff is not usable.
              </p>
            </div>
          ) : detailLoading && !activeDetail ? (
            <p className="qf-muted">Loading…</p>
          ) : showSuccess ? (
            <div className="qf-queue__success" data-testid="qf-queue-scope-set">
              <h2>Scope is set</h2>
              <p className="qf-notice">
                Scope is set for this estimate.
              </p>
              <p className="qf-muted">
                This request has left the Estimate Queue and is available in Estimates.
              </p>
              <div className="qf-inbox__detail-actions">
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-queue-goto-estimates"
                  onClick={() => onOpenEstimates?.(estimateId || activeDetail?.estimateId)}
                >
                  Open in Estimates
                </button>
                <button
                  type="button"
                  className="qf-btn-secondary"
                  onClick={() => {
                    setSelectedJobId(null);
                    setDetail(null);
                    setDetailMode("idle");
                    setNotice(null);
                    successJobIdRef.current = null;
                  }}
                >
                  Back to queue
                </button>
              </div>
            </div>
          ) : detailMode === "manual" ? (
            <>
              <div className="qf-queue__detail-head">
                <div>
                  <h2>Create Manual Scope</h2>
                  <p className="qf-muted">
                    {resolveQueueCustomer(activeDetail || {})}
                    {" — "}
                    {resolveQueueTitle(activeDetail || {})}
                  </p>
                </div>
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-queue-set-scope"
                  disabled={setScopeBusy}
                  onClick={() => void runManualSetScope()}
                >
                  {setScopeBusy ? "Setting scope…" : "Set Scope"}
                </button>
              </div>
              {activeDetail?.status?.key === "takeoff_failed" ? (
                <p className="qf-muted" data-testid="qf-queue-failed-reason">
                  {activeDetail.failureReason
                    ? `Takeoff failed: ${activeDetail.failureReason}`
                    : "AI Takeoff failed. Enter rooms and pieces manually, or choose another plan in Inbox."}
                </p>
              ) : (
                <p className="qf-muted" data-testid="qf-queue-manual-hint">
                  Add rooms and pieces, then click <strong>Set Scope</strong> to create the official
                  estimate scope.
                </p>
              )}
              {activeDetail?.status?.key === "takeoff_failed" ? (
                <div className="qf-inbox__detail-actions">
                  <button
                    type="button"
                    className="qf-btn-secondary"
                    data-testid="qf-queue-choose-plan"
                    onClick={() => onOpenInbox?.(activeDetail.messageKey)}
                  >
                    Choose another plan in Inbox
                  </button>
                </div>
              ) : null}
              <div data-testid="qf-queue-manual-builder">
                <OfficialScopeEditor
                  rooms={manualRooms}
                  onChange={setManualRooms}
                  disabled={setScopeBusy}
                />
              </div>
            </>
          ) : (
            <>
              <div className="qf-queue__detail-head">
                <div>
                  <h2>Takeoff review</h2>
                  <p className="qf-muted">
                    {resolveQueueCustomer(activeDetail || {})}
                    {" — "}
                    {resolveQueueTitle(activeDetail || {})}
                    {activeDetail?.planFilename ? ` · ${activeDetail.planFilename}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-queue-set-scope"
                  disabled={setScopeBusy || activeDetail?.alreadyScoped === true}
                  onClick={() => void runSetScope()}
                  title="Save verified measurements as official estimate scope"
                >
                  {setScopeBusy
                    ? "Setting scope…"
                    : activeDetail?.alreadyScoped
                      ? "Scope is set"
                      : "Set Scope"}
                </button>
              </div>

              <p className="qf-muted" data-testid="qf-queue-set-scope-hint">
                Verify dimensions, then click <strong>Set Scope</strong> or{" "}
                <strong>Use these measurements</strong> in the review panel.
              </p>
              <div className="qf-inbox__detail-actions">
                <button
                  type="button"
                  className="qf-btn-secondary"
                  data-testid="qf-queue-manual-scope"
                  onClick={() => activeDetail && void openManualScope(activeDetail)}
                >
                  Create Manual Scope
                </button>
              </div>

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
