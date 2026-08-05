import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import OfficialScopeEditor, { roomsFromOfficialScope } from "../estimates/OfficialScopeEditor";
import type { QuoteFlowScopeRoom } from "../lib/quoteFlowEstimatesApi";
import {
  filterQueueItems,
  formatQueueTime,
  groupQueueItems,
  resolveDefaultEstimateName,
  resolveQueueCustomer,
  resolveQueueGroupKey,
  resolveQueueSubtitle,
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
  isValidTakeoffApprovedMessage,
  requestSetScopePayloadFromIframe
} from "../lib/takeoffPostMessageOrigins.mjs";

type Props = {
  authToken: string;
  onOpenEstimates?: (estimateId?: string | null) => void;
  onOpenInbox?: (messageKey?: string | null) => void;
};

type DetailMode = "idle" | "review" | "manual" | "success";
type FilterKey = "all_active" | "ready" | "manual" | "processing" | "failed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all_active", label: "All active" },
  { key: "ready", label: "Ready for AI review" },
  { key: "manual", label: "Manual scope needed" },
  { key: "processing", label: "Processing" },
  { key: "failed", label: "Failed" }
];

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
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [setScopeBusy, setSetScopeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [successName, setSuccessName] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all_active");
  const [search, setSearch] = useState("");
  const [estimateName, setEstimateName] = useState("");
  const [manualRooms, setManualRooms] = useState<QuoteFlowScopeRoom[]>(() =>
    roomsFromOfficialScope([])
  );
  const inFlightRef = useRef(false);
  const listInFlightRef = useRef(false);
  const successJobIdRef = useRef<string | null>(null);
  const selectedJobIdRef = useRef<string | null>(null);
  const detailModeRef = useRef<DetailMode>("idle");
  const estimateNameByJobRef = useRef<Record<string, string>>({});
  const takeoffIframeRef = useRef<HTMLIFrameElement | null>(null);

  selectedJobIdRef.current = selectedJobId;
  detailModeRef.current = detailMode;

  const allGrouped = useMemo(() => groupQueueItems(items), [items]);
  const visibleRows = useMemo(
    () => filterQueueItems(items, filter, search) as QuoteFlowQueueItem[],
    [items, filter, search]
  );
  const visibleGrouped = useMemo(() => groupQueueItems(visibleRows), [visibleRows]);
  const showSyncing = isRefreshing || setScopeBusy;

  const selectedListRow = useMemo(
    () => items.find((r) => r.takeoffJobId === selectedJobId) || null,
    [items, selectedJobId]
  );
  const workspaceItem = detail || selectedListRow;

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

  function syncEstimateNameForItem(item: QuoteFlowQueueItem | null, jobId: string | null) {
    if (!jobId) {
      setEstimateName("");
      return;
    }
    const remembered = estimateNameByJobRef.current[jobId];
    if (remembered) {
      setEstimateName(remembered);
      return;
    }
    const next = resolveDefaultEstimateName(item || {});
    setEstimateName(next);
    estimateNameByJobRef.current[jobId] = next;
  }

  async function loadList(mode: "initial" | "refresh" = "refresh") {
    if (listInFlightRef.current) return;
    listInFlightRef.current = true;
    const isInitial = mode === "initial";
    if (isInitial) setInitialLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      // Default active filter — already-scoped items excluded by API.
      const res = await fetchQuoteFlowQueue(authToken, { filter: "active" });
      const rows = Array.isArray(res.items) ? res.items : [];
      setItems(rows);

      const jobId = selectedJobIdRef.current;
      const modeNow = detailModeRef.current;
      if (
        jobId &&
        successJobIdRef.current !== jobId &&
        !rows.some((r) => r.takeoffJobId === jobId) &&
        modeNow !== "success"
      ) {
        setSelectedJobId(null);
        setDetail(null);
        setDetailMode("idle");
        setEstimateName("");
      }
    } catch (e) {
      if (items.length === 0) {
        setError(errorMessage(e));
        setItems([]);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      listInFlightRef.current = false;
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadList("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  function applyScopeSuccess(res: {
    estimateId?: string | null;
    message?: string;
    alreadyScoped?: boolean;
    reused?: boolean;
    projectName?: string | null;
    estimateName?: string | null;
  }) {
    const id = res.estimateId || null;
    const name =
      String(res.projectName || res.estimateName || estimateName || "").trim() ||
      "Untitled quote request";
    setEstimateId(id);
    setSuccessName(name);
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
            projectName: name,
            estimateName: name,
            requestTitle: name,
            status: { key: "scope_set", label: "Scope set" },
            action: "view_estimates",
            actionLabel: "Open in Estimates"
          }
        : prev
    );
  }

  async function openReview(takeoffJobId: string, seedItem?: QuoteFlowQueueItem | null) {
    setSelectedJobId(takeoffJobId);
    setDetailMode("review");
    setNotice(null);
    setEstimateId(null);
    successJobIdRef.current = null;
    if (seedItem) {
      setDetail(seedItem);
      syncEstimateNameForItem(seedItem, takeoffJobId);
    }
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueueDetail(authToken, takeoffJobId);
      setDetail(res.item);
      syncEstimateNameForItem(res.item, takeoffJobId);
      if (res.item.alreadyScoped) {
        applyScopeSuccess({
          estimateId: res.item.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: resolveDefaultEstimateName(res.item)
        });
      }
    } catch (e) {
      if (!seedItem) setDetail(null);
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
    setDetail(row);
    syncEstimateNameForItem(row, jobId);
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueueDetail(authToken, jobId);
      setDetail(res.item);
      syncEstimateNameForItem(res.item, jobId);
      if (res.item.alreadyScoped) {
        applyScopeSuccess({
          estimateId: res.item.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: resolveDefaultEstimateName(res.item)
        });
      }
    } catch (e) {
      const msg = errorMessage(e);
      if (!/not found|404/i.test(msg)) setError(msg);
    } finally {
      setDetailLoading(false);
    }
  }

  function selectRow(row: QuoteFlowQueueItem) {
    const jobId = row.takeoffJobId || "";
    if (!jobId) return;
    setSelectedJobId(jobId);
    setDetail(row);
    setNotice(null);
    setEstimateId(null);
    successJobIdRef.current = null;
    setError(null);
    syncEstimateNameForItem(row, jobId);
    if (row.canReviewTakeoff || row.action === "review_takeoff") {
      void openReview(jobId, row);
    } else if (row.action === "create_manual_scope" || row.status?.key === "manual_scope_needed") {
      void openManualScope(row);
    } else if (row.status?.key === "takeoff_failed" || row.action === "needs_decision") {
      // Failed: open workspace idle so estimator chooses AI retry path (Inbox) or Manual.
      setDetailMode("idle");
    } else {
      setDetailMode("idle");
    }
  }

  function onEstimateNameChange(value: string) {
    setEstimateName(value);
    if (selectedJobId) estimateNameByJobRef.current[selectedJobId] = value;
  }

  function resolvedNameForSubmit(): string {
    const typed = String(estimateName || "").trim();
    if (typed && !/^unknown contact$/i.test(typed)) return typed;
    return resolveDefaultEstimateName(workspaceItem || {});
  }

  async function runSetScope() {
    if (!selectedJobId || inFlightRef.current || setScopeBusy) return;
    inFlightRef.current = true;
    setSetScopeBusy(true);
    setError(null);
    setNotice(null);
    const name = resolvedNameForSubmit();
    try {
      // Collect unsaved worksheet edits from the embedded review (no Save Draft required).
      const payload = await requestSetScopePayloadFromIframe(
        takeoffIframeRef.current,
        selectedJobId,
        { timeoutMs: 8000 }
      );
      const res = await setQuoteFlowScope(authToken, selectedJobId, {
        confirm: true,
        projectName: name,
        estimateName: name,
        takeoffResult: payload?.takeoffResult || undefined,
        reviewState: payload?.reviewState || undefined
      });
      applyScopeSuccess({ ...res, projectName: res.projectName || name });
      await loadList("refresh");
      // Do not refetch takeoff detail after success — avoids stale 404 noise.
    } catch (e) {
      const msg = errorMessage(e);
      // Soften locked-approved takeoff copy — Quote Flow Set Scope should not need Edit Measurements.
      if (/Approved Takeoff measurements cannot be changed|Edit Measurements/i.test(msg)) {
        try {
          const retry = await setQuoteFlowScope(authToken, selectedJobId, {
            confirm: true,
            projectName: name,
            estimateName: name
          });
          applyScopeSuccess({ ...retry, projectName: retry.projectName || name });
          await loadList("refresh");
          return;
        } catch (retryErr) {
          setError(errorMessage(retryErr));
          return;
        }
      }
      if (/already.?scoped|Scope is already set|Open in Estimates/i.test(msg)) {
        applyScopeSuccess({
          estimateId: estimateId || detail?.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: name
        });
        await loadList("refresh");
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
    const name = resolvedNameForSubmit();
    try {
      const res = await setQuoteFlowManualScope(authToken, selectedJobId, {
        confirm: true,
        rooms: manualRooms,
        projectName: name,
        estimateName: name
      });
      applyScopeSuccess({ ...res, projectName: res.projectName || name });
      await loadList("refresh");
    } catch (e) {
      const msg = errorMessage(e);
      if (/already.?scoped|Scope is already set|Open in Estimates/i.test(msg)) {
        applyScopeSuccess({
          estimateId: estimateId || detail?.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: name
        });
        await loadList("refresh");
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
  }, [authToken, selectedJobId, detailMode, estimateName]);

  function renderRow(row: QuoteFlowQueueItem) {
    const jobId = row.takeoffJobId || "";
    const active = Boolean(jobId && jobId === selectedJobId);
    const title = resolveQueueTitle(row);
    const customer = resolveQueueCustomer(row);
    const subtitle = resolveQueueSubtitle(row, title);
    const when =
      formatQueueTime(row.returnedAt) ||
      formatQueueTime(row.receivedAt) ||
      formatQueueTime(row.startedAt);
    const nextLabel = row.nextAction?.label || row.actionLabel || row.status?.label || "Open";
    const rowAction = row.rowAction || row.action;

    return (
      <li key={jobId || row.intakeCaseId || title}>
        <div
          className={active ? "qf-inbox__row-card is-active" : "qf-inbox__row-card"}
          data-testid="qf-queue-row"
          data-takeoff-job-id={jobId}
          data-status={row.status?.key || ""}
          data-group={resolveQueueGroupKey(row)}
          data-row-action={rowAction || ""}
        >
          <button type="button" className="qf-inbox__row-main" onClick={() => selectRow(row)}>
            <span className="qf-inbox__row-title">{title}</span>
            {subtitle ? <span className="qf-inbox__row-meta">{subtitle}</span> : null}
            {!subtitle && customer ? (
              <span className="qf-inbox__row-meta">{customer}</span>
            ) : null}
            {when ? <span className="qf-inbox__row-meta">{when}</span> : null}
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
            {rowAction === "review_takeoff" && jobId ? (
              <button
                type="button"
                className="qf-btn-primary"
                data-testid="qf-queue-review"
                onClick={() => void openReview(jobId, row)}
              >
                Review Takeoff
              </button>
            ) : null}
            {rowAction === "create_manual_scope" ? (
              <button
                type="button"
                className="qf-btn-primary"
                data-testid="qf-queue-manual-scope"
                onClick={() => void openManualScope(row)}
              >
                Create Manual Scope
              </button>
            ) : null}
            {rowAction === "needs_decision" ? (
              <button
                type="button"
                className="qf-btn-secondary"
                data-testid="qf-queue-needs-decision"
                onClick={() => selectRow(row)}
              >
                Needs decision
              </button>
            ) : null}
            {rowAction === "waiting" ? (
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
    if (filter !== "all_active" && rows.length === 0) return null;
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

  function renderEstimateNameField() {
    return (
      <label className="qf-queue__estimate-name" data-testid="qf-queue-estimate-name">
        <span>Estimate name</span>
        <input
          type="text"
          value={estimateName}
          onChange={(e) => onEstimateNameChange(e.target.value)}
          placeholder="Job or estimate name"
          data-testid="qf-queue-estimate-name-input"
        />
      </label>
    );
  }

  const showSuccess = detailMode === "success";
  const showFullLoading = initialLoading && items.length === 0;
  const showEmpty = !initialLoading && visibleRows.length === 0;
  const workspaceTitle =
    showSuccess && successName
      ? successName
      : estimateName || resolveQueueTitle(workspaceItem || {});
  const workspaceSubtitle = resolveQueueSubtitle(workspaceItem || {}, workspaceTitle);

  return (
    <section className="qf-page qf-page--command qf-page--queue" data-testid="qf-queue-page">
      <header className="qf-command-header" data-testid="qf-queue-command-header">
        <div className="qf-command-header__titles">
          <h1>Estimate Queue</h1>
          <p className="qf-muted">
            Create official estimate scope from AI Takeoff measurements or manual dimensions. Once
            scope is set, the request moves to Estimates.
          </p>
        </div>
        <div className="qf-command-header__actions">
          {showSyncing ? (
            <span className="qf-inbox__syncing" data-testid="qf-queue-syncing">
              Syncing…
            </span>
          ) : null}
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-queue-refresh"
            onClick={() => void loadList("refresh")}
            disabled={initialLoading || isRefreshing}
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="qf-stats qf-stats--command" data-testid="qf-queue-stats">
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.readyForReview}</span>
          <span className="qf-stat__label">Ready for AI review</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.manualScopeNeeded}</span>
          <span className="qf-stat__label">Manual scope needed</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.processing}</span>
          <span className="qf-stat__label">AI Takeoff processing</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.failed}</span>
          <span className="qf-stat__label">Failed / needs attention</span>
        </div>
      </div>

      <div className="qf-inbox-toolbar" data-testid="qf-queue-filters">
        <div className="qf-filter-chips" role="tablist" aria-label="Queue filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              className={filter === f.key ? "qf-chip is-active" : "qf-chip"}
              data-testid={`qf-queue-filter-${f.key}`}
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="qf-inbox-search">
          <span className="qf-visually-hidden">Search</span>
          <input
            type="search"
            data-testid="qf-queue-search"
            placeholder="Search customer, project, plan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
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

      <div className="qf-queue qf-queue--scope qf-queue--command" data-testid="qf-queue">
        <div className="qf-queue__list" data-testid="qf-queue-list">
          <div className="qf-inbox__list-head">
            <h2>Scope creation</h2>
            <span className="qf-muted">{visibleRows.length} shown</span>
          </div>
          {showFullLoading ? (
            <p className="qf-muted" data-testid="qf-queue-initial-loading">
              Loading queue…
            </p>
          ) : null}
          {showEmpty ? (
            <div className="qf-inbox__empty" data-testid="qf-queue-empty">
              <p className="qf-muted">
                {search
                  ? "No requests match this search."
                  : filter !== "all_active"
                    ? "No requests in this filter."
                    : "No requests need scope creation. Start AI Takeoff from Inbox, or check Estimates for scoped work."}
              </p>
            </div>
          ) : null}
          {!showEmpty ? (
            <>
              {renderSection(
                "qf-queue-group-ready",
                "Ready for AI review",
                visibleGrouped.ready as QuoteFlowQueueItem[],
                "No takeoffs ready for review."
              )}
              {renderSection(
                "qf-queue-group-manual",
                "Manual scope needed",
                visibleGrouped.manual as QuoteFlowQueueItem[],
                "No manual-scope requests."
              )}
              {renderSection(
                "qf-queue-group-processing",
                "AI Takeoff processing",
                visibleGrouped.processing as QuoteFlowQueueItem[],
                "No AI Takeoffs in progress."
              )}
              {renderSection(
                "qf-queue-group-failed",
                "Failed / needs attention",
                visibleGrouped.failed as QuoteFlowQueueItem[],
                "No failed takeoffs."
              )}
            </>
          ) : null}
        </div>

        <div
          className={
            detailMode === "review"
              ? "qf-queue__detail qf-queue__detail--review"
              : detailMode === "manual"
                ? "qf-queue__detail qf-queue__detail--manual"
                : "qf-queue__detail"
          }
          data-testid="qf-queue-detail"
        >
          {!selectedJobId && detailMode === "idle" ? (
            <div
              className="qf-placeholder qf-placeholder--command"
              data-testid="qf-queue-empty-workspace"
            >
              <h2>Select a request to create scope</h2>
              <p>
                Create scope for this request using AI measurements or manual entry. Review Takeoff
                verifies dimensions; Create Manual Scope builds rooms and pieces by hand.
              </p>
            </div>
          ) : detailLoading && !workspaceItem ? (
            <p className="qf-muted">Loading…</p>
          ) : showSuccess ? (
            <div className="qf-queue__success" data-testid="qf-queue-scope-set">
              <h2>{successName || workspaceTitle}</h2>
              <p className="qf-notice">Scope is set for this estimate.</p>
              <p className="qf-muted">
                This request has left the Estimate Queue and is available in Estimates.
              </p>
              <div className="qf-inbox__detail-actions">
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-queue-goto-estimates"
                  onClick={() => onOpenEstimates?.(estimateId || workspaceItem?.estimateId)}
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
                    setSuccessName(null);
                    setEstimateName("");
                    successJobIdRef.current = null;
                  }}
                >
                  Back to queue
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="qf-queue__workspace-summary" data-testid="qf-queue-workspace-summary">
                <div className="qf-queue__detail-sticky">
                  <div className="qf-queue__detail-head">
                    <div>
                      <h2 data-testid="qf-queue-workspace-title">{workspaceTitle}</h2>
                      {workspaceSubtitle ? (
                        <p className="qf-muted" data-testid="qf-queue-workspace-subtitle">
                          {workspaceSubtitle}
                        </p>
                      ) : null}
                      <span
                        className={statusPillClass(workspaceItem?.status?.key)}
                        data-testid="qf-queue-detail-status"
                      >
                        {workspaceItem?.status?.label || "Needs scope"}
                      </span>
                      {workspaceItem?.summary?.label ? (
                        <span className="qf-queue__summary-chip">{workspaceItem.summary.label}</span>
                      ) : null}
                      <p className="qf-muted qf-queue__method-hint">
                        Create scope for this request using AI measurements or manual entry.
                      </p>
                    </div>
                    <div className="qf-queue__workspace-actions" data-testid="qf-queue-workspace-actions">
                      {workspaceItem?.canReviewTakeoff && selectedJobId ? (
                        <button
                          type="button"
                          className={
                            detailMode === "review" ? "qf-btn-primary" : "qf-btn-secondary"
                          }
                          data-testid="qf-queue-review"
                          onClick={() => void openReview(selectedJobId, workspaceItem)}
                        >
                          Review AI Takeoff
                        </button>
                      ) : null}
                      {workspaceItem?.canCreateManualScope ? (
                        <button
                          type="button"
                          className={
                            detailMode === "manual" ? "qf-btn-primary" : "qf-btn-secondary"
                          }
                          data-testid="qf-queue-manual-scope"
                          onClick={() => workspaceItem && void openManualScope(workspaceItem)}
                        >
                          Create Manual Scope
                        </button>
                      ) : null}
                      {workspaceItem?.status?.key === "takeoff_failed" ? (
                        <button
                          type="button"
                          className="qf-btn-secondary"
                          data-testid="qf-queue-choose-plan"
                          onClick={() => onOpenInbox?.(workspaceItem.messageKey)}
                        >
                          Choose another plan
                        </button>
                      ) : null}
                      {detailMode === "review" ? (
                        <button
                          type="button"
                          className="qf-btn-primary"
                          data-testid="qf-queue-set-scope"
                          disabled={setScopeBusy || workspaceItem?.alreadyScoped === true}
                          onClick={() => void runSetScope()}
                          title="Save verified measurements as official estimate scope"
                        >
                          {setScopeBusy
                            ? "Setting scope…"
                            : workspaceItem?.alreadyScoped
                              ? "Scope is set"
                              : "Set Scope"}
                        </button>
                      ) : null}
                      {detailMode === "manual" ? (
                        <button
                          type="button"
                          className="qf-btn-primary"
                          data-testid="qf-queue-set-scope"
                          disabled={setScopeBusy}
                          onClick={() => void runManualSetScope()}
                        >
                          {setScopeBusy ? "Setting scope…" : "Set Scope"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {(detailMode === "review" || detailMode === "manual" || detailMode === "idle") &&
                  workspaceItem
                    ? renderEstimateNameField()
                    : null}

                  {detailMode === "review" ? (
                    <p className="qf-muted" data-testid="qf-queue-set-scope-hint">
                      Set Scope saves these reviewed measurements as the official estimate scope.
                      Save Draft is optional — you do not need it before Set Scope.
                    </p>
                  ) : null}
                  {detailMode === "manual" ? (
                    <p className="qf-muted" data-testid="qf-queue-manual-hint">
                      {workspaceItem?.status?.key === "takeoff_failed"
                        ? workspaceItem.failureReason
                          ? `Takeoff failed: ${workspaceItem.failureReason}`
                          : "AI Takeoff failed. Enter rooms and pieces manually, or choose another plan in Inbox."
                        : "Add rooms and pieces, then click Set Scope to create the official estimate scope."}
                    </p>
                  ) : null}
                  {detailMode === "idle" && workspaceItem?.action === "waiting" ? (
                    <p className="qf-muted" data-testid="qf-queue-waiting">
                      Waiting on AI Takeoff. Scope creation unlocks when measurements are ready.
                    </p>
                  ) : null}
                  {detailMode === "idle" &&
                  (workspaceItem?.status?.key === "takeoff_failed" ||
                    workspaceItem?.action === "needs_decision") ? (
                    <p className="qf-muted" data-testid="qf-queue-failed-reason">
                      {workspaceItem.failureReason
                        ? `Takeoff failed: ${workspaceItem.failureReason}`
                        : "AI Takeoff needs a decision. Choose another plan in Inbox, or create scope manually."}
                    </p>
                  ) : null}
                </div>
              </div>

              {detailMode === "manual" ? (
                <div className="qf-queue-manual-builder" data-testid="qf-queue-manual-builder">
                  <OfficialScopeEditor
                    rooms={manualRooms}
                    onChange={setManualRooms}
                    disabled={setScopeBusy}
                    heading="Manual scope"
                    hint="Add rooms and pieces with length, depth, and quantity. This creates official estimate scope — not a price."
                  />
                </div>
              ) : null}

              {detailMode === "review" && takeoffSrc ? (
                <div className="qf-queue__frame-wrap qf-queue__frame-wrap--command">
                  <iframe
                    ref={takeoffIframeRef}
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
