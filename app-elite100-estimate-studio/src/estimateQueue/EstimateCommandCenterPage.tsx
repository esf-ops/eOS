import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchEstimateQueue,
  fetchEstimateQueuePreview,
  recordEstimateQueueOpened
} from "../lib/estimateQueueApi.mjs";
import { createQuoteIntakeApiClient } from "../lib/quoteIntakeApi.mjs";
import { ApiError, isAbortError } from "../lib/api";
import { formatReceivedAt } from "../lib/quoteIntakeFormat.mjs";
import {
  COMMAND_CENTER_STAGE_TABS,
  COMMAND_CENTER_SUMMARY_CARDS,
  apiFilterForStageTab,
  commandCenterSummaryCounts,
  filterCommandCenterItems,
  loadCommandCenterSessionPrefs,
  saveCommandCenterSessionPrefs,
  sortCommandCenterItems,
  toCommandCenterItem
} from "../../../backend-core/src/elite100EstimateStudio/studioCommandCenterViewModel.mjs";

export type EstimateCommandCenterPageProps = {
  authToken: string | null;
  currentUserId?: string | null;
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onOpenEstimate: (caseId: string, options?: { openTarget?: string }) => void;
};

type QueueApiRow = {
  id: string;
  customerName?: string;
  projectName?: string;
  senderLabel?: string;
  salespersonLabel?: string | null;
  receivedAt?: string | null;
  lastActivityAt?: string | null;
  workflowStatus?: string;
  needsAttention?: boolean;
  attentionReasons?: string[];
  openTarget?: string;
  assignedEstimatorLabel?: string;
  assignedEstimatorUserId?: string | null;
  roomCount?: number;
  pieceCount?: number;
  estimateStatus?: string;
  digitalEstimateStatus?: string;
  customerReviewStatus?: string;
  indicators?: Record<string, boolean>;
};

type DetailState =
  | { kind: "closed" }
  | { kind: "loading"; caseId: string }
  | { kind: "ready"; caseId: string; preview: Record<string, unknown>; item: ReturnType<typeof toCommandCenterItem> }
  | { kind: "error"; caseId: string; message: string };

type EmailSyncStatus = {
  configured?: boolean;
  canManualSync?: boolean;
  mailboxDisplay?: string | null;
  state?: string;
  activeRunId?: string | null;
  lastStartedAt?: string | null;
  lastCompletedAt?: string | null;
  lastSuccessfulAt?: string | null;
  initiatedBy?: string | null;
  result?: {
    checked?: number;
    created?: number;
    duplicates?: number;
    ignored?: number | null;
    failed?: number;
    manualReview?: number;
  };
  safeError?: { category?: string; message?: string; retryable?: boolean } | null;
  recentRuns?: Array<Record<string, unknown>>;
  persistenceNote?: string;
};

const SORTS = [
  { key: "attention", label: "Needs attention first" },
  { key: "newest_received", label: "Newest received" },
  { key: "oldest_received", label: "Oldest received" },
  { key: "customer", label: "Customer / project" }
];

const EMAIL_SYNC_POLL_MS = 2500;
const EMAIL_SYNC_POLL_MAX_MS = 120000;

function severityTone(severity: number, blocked: boolean): string {
  if (blocked || severity >= 3) return "danger";
  if (severity >= 2) return "warn";
  if (severity >= 1) return "warn";
  return "neutral";
}

function formatSyncClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function syncStateLabel(status: EmailSyncStatus | null): string {
  const state = String(status?.state || "");
  if (state === "running") return "Syncing";
  if (state === "completed") return "Completed";
  if (state === "failed") return "Needs attention";
  if (state === "not_configured") return "Not configured";
  if (state === "permission_denied") return "Permission denied";
  if (status?.configured) return "Ready";
  return "Not configured";
}

/**
 * Elite 100 Estimate Command Center — presentation layer over the existing queue API.
 * Read-only list/filter/sort; writes only when the user opens an existing workspace action.
 */
export default function EstimateCommandCenterPage({
  authToken,
  currentUserId = null,
  selectedCaseId,
  onSelectCase,
  onOpenEstimate
}: EstimateCommandCenterPageProps) {
  const prefs = useMemo(() => loadCommandCenterSessionPrefs() || {}, []);
  const [rows, setRows] = useState<QueueApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(String(prefs.search || ""));
  const [debouncedSearch, setDebouncedSearch] = useState(String(prefs.search || ""));
  const [stageTab, setStageTab] = useState(String(prefs.stageTab || "needs_attention"));
  const [myWorkOnly, setMyWorkOnly] = useState(Boolean(prefs.myWorkOnly));
  const [sort, setSort] = useState(String(prefs.sort || "attention"));
  const [offset, setOffset] = useState(Number(prefs.offset) || 0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<DetailState>({ kind: "closed" });
  const drawerCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const intakeClient = useMemo(() => createQuoteIntakeApiClient(), []);
  const [emailStatus, setEmailStatus] = useState<EmailSyncStatus | null>(null);
  const [emailStatusError, setEmailStatusError] = useState<string | null>(null);
  const [emailSyncForbidden, setEmailSyncForbidden] = useState(false);
  const [emailActionBusy, setEmailActionBusy] = useState(false);
  const [showEmailDetails, setShowEmailDetails] = useState(false);
  const [showLastResult, setShowLastResult] = useState(false);
  const emailStatusGenRef = useRef(0);
  const limit = 50;

  const applyEmailStatus = useCallback((next: EmailSyncStatus, generation: number) => {
    if (generation < emailStatusGenRef.current) return;
    emailStatusGenRef.current = generation;
    setEmailStatus(next);
  }, []);

  const loadEmailStatus = useCallback(
    async (signal?: AbortSignal) => {
      if (!authToken) {
        setEmailStatus(null);
        return null;
      }
      const generation = Date.now();
      try {
        const status = (await intakeClient.getMailboxSyncStatus(authToken)) as EmailSyncStatus;
        if (signal?.aborted) return null;
        applyEmailStatus(status, generation);
        setEmailStatusError(null);
        setEmailSyncForbidden(false);
        return status;
      } catch (e) {
        if (isAbortError(e) || signal?.aborted) return null;
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 401 || status === 403) {
          setEmailSyncForbidden(true);
          setEmailStatusError(null);
          applyEmailStatus(
            { configured: false, canManualSync: false, state: "permission_denied" },
            generation
          );
          return null;
        }
        if (status === 404) {
          applyEmailStatus(
            { configured: false, canManualSync: false, state: "not_configured" },
            generation
          );
          setEmailStatusError(null);
          return null;
        }
        setEmailStatusError(e instanceof ApiError ? e.message : "Unable to load email intake status");
        return null;
      }
    },
    [authToken, intakeClient, applyEmailStatus]
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadEmailStatus(ac.signal);
    return () => ac.abort();
  }, [loadEmailStatus]);

  // Restrained polling while a sync is running; stop on completion/failure/timeout.
  useEffect(() => {
    if (!authToken || emailStatus?.state !== "running") return;
    const started = Date.now();
    let stopped = false;
    const tick = window.setInterval(() => {
      if (stopped) return;
      if (Date.now() - started > EMAIL_SYNC_POLL_MAX_MS) {
        stopped = true;
        window.clearInterval(tick);
        return;
      }
      void loadEmailStatus().then((status) => {
        if (!status || status.state !== "running") {
          stopped = true;
          window.clearInterval(tick);
          if (status?.state === "completed") {
            setShowLastResult(true);
            setRefreshTick((n) => n + 1);
          }
        }
      });
    }, EMAIL_SYNC_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(tick);
    };
  }, [authToken, emailStatus?.state, loadEmailStatus]);

  async function runInboxSync() {
    if (!authToken || emailActionBusy || emailStatus?.state === "running") return;
    setEmailActionBusy(true);
    setShowEmailDetails(false);
    try {
      const body = (await intakeClient.startMailboxSync(authToken)) as {
        status?: EmailSyncStatus;
        attached?: boolean;
      };
      const status = (body.status || {}) as EmailSyncStatus;
      applyEmailStatus(status, Date.now());
      if (status.state === "completed") {
        setShowLastResult(true);
        setRefreshTick((n) => n + 1);
      } else if (status.state === "failed") {
        setShowLastResult(false);
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401 || status === 403) {
        setEmailSyncForbidden(true);
      }
      setEmailStatusError(e instanceof ApiError ? e.message : "Unable to start inbox sync");
      void loadEmailStatus();
    } finally {
      setEmailActionBusy(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    saveCommandCenterSessionPrefs({
      search: debouncedSearch,
      stageTab,
      myWorkOnly,
      sort,
      offset
    });
  }, [debouncedSearch, stageTab, myWorkOnly, sort, offset]);

  const apiFilter = apiFilterForStageTab(stageTab);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!authToken) {
        setRows([]);
        setError("Sign in to view the Estimate Command Center.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const body = (await fetchEstimateQueue(authToken, {
          search: debouncedSearch,
          filter: apiFilter,
          sort: sort === "attention" ? "newest_received" : sort,
          limit,
          offset,
          signal
        })) as { cases?: QueueApiRow[]; total?: number };
        if (signal?.aborted) return;
        setRows(Array.isArray(body.cases) ? body.cases : []);
        setTotal(Number(body.total) || 0);
      } catch (e) {
        if (isAbortError(e) || signal?.aborted) return;
        setRows([]);
        setError(e instanceof ApiError ? e.message : "Unable to load Command Center");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [authToken, debouncedSearch, apiFilter, sort, offset, refreshTick]
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, stageTab, sort, myWorkOnly]);

  const items = useMemo(() => {
    let mapped = rows.map((r) => toCommandCenterItem(r));
    if (myWorkOnly && currentUserId) {
      mapped = mapped.filter((i) => i.assignedEstimatorUserId === currentUserId);
    } else if (myWorkOnly && !currentUserId) {
      // Assignment id unavailable — keep full list but do not invent ownership.
      mapped = mapped.filter((i) => i.assignedUser !== "Unassigned");
    }
    mapped = filterCommandCenterItems(mapped, stageTab);
    return sortCommandCenterItems(mapped, sort);
  }, [rows, myWorkOnly, currentUserId, stageTab, sort]);

  const pageCounts = useMemo(() => {
    const allMapped = rows.map((r) => toCommandCenterItem(r));
    return commandCenterSummaryCounts(allMapped);
  }, [rows]);

  const rangeLabel = useMemo(() => {
    if (!items.length && !loading) return "No matching estimates";
    const start = offset + 1;
    const end = Math.min(offset + rows.length, total);
    return total ? `Showing ${start}–${end} of ${total}` : "No matching estimates";
  }, [offset, rows.length, total, items.length, loading]);

  async function openDetail(caseId: string) {
    if (!authToken) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const base = items.find((i) => i.estimateRef === caseId) || toCommandCenterItem({ id: caseId });
    onSelectCase(caseId);
    setDetail({ kind: "loading", caseId });
    try {
      const body = (await fetchEstimateQueuePreview(authToken, caseId)) as {
        preview?: Record<string, unknown>;
        case?: QueueApiRow;
      };
      const item = body.case ? toCommandCenterItem(body.case) : base;
      setDetail({ kind: "ready", caseId, preview: body.preview || {}, item });
    } catch (e) {
      setDetail({
        kind: "error",
        caseId,
        message: e instanceof ApiError ? e.message : "Unable to load estimate details"
      });
    }
  }

  async function runPrimary(item: ReturnType<typeof toCommandCenterItem>) {
    if (authToken) {
      void recordEstimateQueueOpened(authToken, item.estimateRef).catch(() => {});
    }
    setDetail({ kind: "closed" });
    onOpenEstimate(item.estimateRef, { openTarget: item.nextActionRoute });
  }

  function closeDetail() {
    setDetail({ kind: "closed" });
    const prev = lastFocusRef.current;
    if (prev && typeof prev.focus === "function") {
      window.setTimeout(() => prev.focus(), 0);
    }
  }

  useEffect(() => {
    if (detail.kind === "closed") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDetail();
      }
    }
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => drawerCloseBtnRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [detail.kind]);

  return (
    <div className="ecc" data-testid="estimate-command-center">
      <header className="ecc-header">
        <div>
          <h1 className="ecc-title">Elite 100 Estimate Command Center</h1>
          <p className="ecc-subtitle" data-testid="ecc-subtitle">
            Manage estimate requests from intake through customer approval.
          </p>
        </div>
        <div className="ecc-header-actions">
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="ecc-refresh"
            title="Reload queue data without contacting the mailbox"
            disabled={loading}
            onClick={() => setRefreshTick((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
      </header>

      <section
        className="ecc-email-intake"
        aria-label="Email intake"
        data-testid="ecc-email-intake"
      >
        <div className="ecc-email-intake-main">
          <h2 className="ecc-email-intake-title">Email intake</h2>
          <p className="ecc-email-intake-meta">
            Last synced: {formatSyncClock(emailStatus?.lastSuccessfulAt || emailStatus?.lastCompletedAt)}
            {" · "}
            Status: {syncStateLabel(emailStatus)}
            {emailStatus?.mailboxDisplay ? ` · ${emailStatus.mailboxDisplay}` : ""}
          </p>
        </div>
        <div className="ecc-email-intake-actions">
          {emailStatus?.state === "running" ? (
            <span className="ecc-sync-progress" data-testid="ecc-email-syncing">
              Syncing…
            </span>
          ) : null}
          {!emailSyncForbidden && emailStatus?.canManualSync ? (
            <button
              type="button"
              className="eq-btn-primary"
              data-testid="ecc-sync-inbox"
              title="Run the canonical inbox ingestion process"
              disabled={emailActionBusy || emailStatus?.state === "running"}
              onClick={() => void runInboxSync()}
            >
              {emailStatus?.state === "running" || emailActionBusy ? "Syncing…" : "Sync inbox"}
            </button>
          ) : null}
        </div>

        {emailStatus?.state === "failed" || emailStatusError ? (
          <div className="ecc-email-alert" data-tone="danger" data-testid="ecc-email-failure" role="alert">
            <strong>Email sync needs attention</strong>
            <div>
              {emailStatus?.safeError?.message ||
                emailStatusError ||
                "The inbox could not be synchronized. No estimate records were changed."}
            </div>
            <div className="ecc-email-intake-actions" style={{ marginTop: "0.5rem" }}>
              {emailStatus?.safeError?.retryable !== false && !emailSyncForbidden ? (
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="ecc-email-retry"
                  disabled={emailActionBusy || emailStatus?.state === "running"}
                  onClick={() => void runInboxSync()}
                >
                  Try again
                </button>
              ) : null}
              <button
                type="button"
                className="eq-btn-ghost"
                data-testid="ecc-email-view-details"
                onClick={() => setShowEmailDetails((v) => !v)}
              >
                {showEmailDetails ? "Hide details" : "View details"}
              </button>
            </div>
            {showEmailDetails ? (
              <div className="ecc-email-details" data-testid="ecc-email-diagnostics">
                <p className="eq-muted">
                  Category: {emailStatus?.safeError?.category || "unavailable"}
                  {emailStatus?.activeRunId || emailStatus?.recentRuns?.[0]?.runId
                    ? ` · Run: ${String(emailStatus.activeRunId || emailStatus.recentRuns?.[0]?.runId)}`
                    : ""}
                  {emailStatus?.lastStartedAt
                    ? ` · Started: ${formatSyncClock(emailStatus.lastStartedAt)}`
                    : ""}
                </p>
                <p className="eq-muted">
                  Retryable: {emailStatus?.safeError?.retryable === false ? "No" : "Yes"}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {emailStatus?.state === "completed" && showLastResult ? (
          <div className="ecc-email-result" data-testid="ecc-email-result">
            <strong>Inbox sync completed</strong>
            <ul>
              {Number.isFinite(Number(emailStatus?.result?.checked)) ? (
                <li>{Number(emailStatus?.result?.checked)} emails checked</li>
              ) : null}
              {Number.isFinite(Number(emailStatus?.result?.created)) ? (
                <li>{Number(emailStatus?.result?.created)} new estimate requests created</li>
              ) : null}
              {Number.isFinite(Number(emailStatus?.result?.duplicates)) ? (
                <li>{Number(emailStatus?.result?.duplicates)} existing requests skipped</li>
              ) : null}
              {emailStatus?.result?.ignored != null &&
              Number.isFinite(Number(emailStatus.result.ignored)) ? (
                <li>{Number(emailStatus.result.ignored)} unrelated emails ignored</li>
              ) : null}
              {Number.isFinite(Number(emailStatus?.result?.failed)) ? (
                <li>{Number(emailStatus?.result?.failed)} failures</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <details className="ecc-email-details" data-testid="ecc-sync-activity">
          <summary>Sync activity</summary>
          {Array.isArray(emailStatus?.recentRuns) && emailStatus.recentRuns.length ? (
            <ul>
              {emailStatus.recentRuns.slice(0, 10).map((run) => (
                <li key={String(run.runId || run.startedAt)}>
                  {formatSyncClock(String(run.startedAt || ""))}
                  {" · "}
                  {String(run.status || "—")}
                  {" · "}
                  initiated by {String(run.initiatedBy || "system")}
                  {run.created != null ? ` · ${Number(run.created)} created` : ""}
                  {run.duplicates != null ? ` · ${Number(run.duplicates)} skipped` : ""}
                  {run.failed != null ? ` · ${Number(run.failed)} failed` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="eq-muted">
              No recent sync runs in this server process yet. Durable run history is a later
              enhancement.
            </p>
          )}
        </details>
      </section>

      <section className="ecc-summary" aria-label="Estimate summary">
        {COMMAND_CENTER_SUMMARY_CARDS.map((card) => {
          const count =
            card.key === "needs_attention"
              ? pageCounts.needs_attention
              : card.key === "in_progress"
                ? pageCounts.in_progress
                : card.key === "ready_to_publish"
                  ? pageCounts.ready_to_publish
                  : card.key === "waiting_on_customer"
                    ? pageCounts.waiting_on_customer
                    : pageCounts.review_requested;
          const active =
            stageTab === card.key ||
            (card.key === "waiting_on_customer" && stageTab === "customer") ||
            (card.key === "in_progress" && (stageTab === "takeoff" || stageTab === "pricing"));
          return (
            <button
              key={card.key}
              type="button"
              className={`ecc-card ${active ? "is-active" : ""} ${
                card.key === "needs_attention" && count > 0 ? "ecc-card--attention" : ""
              }`}
              data-testid={`ecc-summary-${card.key}`}
              aria-pressed={active}
              onClick={() => {
                if (card.key === "waiting_on_customer") setStageTab("customer");
                else if (card.key === "in_progress") setStageTab("takeoff");
                else setStageTab(card.key);
              }}
            >
              <span className="ecc-card-count">{count}</span>
              <span className="ecc-card-label">{card.label}</span>
              <span className="ecc-card-desc">{card.description}</span>
            </button>
          );
        })}
      </section>

      <section className="ecc-toolbar" aria-label="Search and filters">
        <label className="ecc-search">
          <span className="eq-muted">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, project, quote, sender…"
            data-testid="ecc-search"
          />
        </label>
        <label className="ecc-toggle">
          <input
            type="checkbox"
            checked={myWorkOnly}
            onChange={(e) => setMyWorkOnly(e.target.checked)}
            data-testid="ecc-my-work"
          />
          My work
        </label>
        <button
          type="button"
          className="eq-btn-secondary ecc-filters-toggle"
          data-testid="ecc-filters-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          Filters
        </button>
        <label>
          <span className="eq-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            data-testid="ecc-sort"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="eq-muted ecc-range">{rangeLabel}</div>
      </section>

      <div
        className={`ecc-filters ${filtersOpen ? "is-open" : ""}`}
        role="tablist"
        aria-label="Stage filters"
        data-testid="ecc-stage-tabs"
      >
        {COMMAND_CENTER_STAGE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={stageTab === tab.key}
            className={`eq-chip ${stageTab === tab.key ? "is-active" : ""}`}
            onClick={() => {
              setStageTab(tab.key);
              setFiltersOpen(false);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="ecc-error">
          {error}
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="ecc-retry"
              onClick={() => setRefreshTick((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {loading && !rows.length ? (
        <div className="ecc-skeleton" data-testid="ecc-loading" aria-busy="true">
          <div className="ecc-skeleton-row" />
          <div className="ecc-skeleton-row" />
          <div className="ecc-skeleton-row" />
        </div>
      ) : null}

      {!loading && !error && !items.length ? (
        <div className="ecc-empty" data-testid="ecc-empty">
          {stageTab === "needs_attention" ? (
            <>
              <p>
                <strong>No estimates need your attention.</strong>
              </p>
              <p className="eq-muted">You’re caught up.</p>
            </>
          ) : (
            <>
              <p>
                <strong>No estimates match these filters.</strong>
              </p>
              <button
                type="button"
                className="eq-btn-secondary"
                onClick={() => {
                  setStageTab("all");
                  setSearch("");
                  setMyWorkOnly(false);
                }}
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : null}

      <ul className="ecc-list" data-testid="ecc-list">
        {items.map((item) => {
          const selected = selectedCaseId === item.estimateRef;
          return (
            <li key={item.estimateRef}>
              <article
                className={`ecc-item ${selected ? "is-selected" : ""} ${
                  item.attentionRequired ? "ecc-item--attention" : ""
                }`}
                data-testid="ecc-item"
                data-stage={item.stageKey}
              >
                <button
                  type="button"
                  className="ecc-item-main"
                  onClick={() => void openDetail(item.estimateRef)}
                  aria-pressed={selected}
                >
                  <div className="ecc-item-top">
                    <h2 className="ecc-item-customer">
                      {item.customerLabel}
                      {item.needsCompletionHint ? (
                        <span className="ecc-hint"> Needs details</span>
                      ) : null}
                    </h2>
                    <span
                      className={`eq-pill eq-pill--${severityTone(item.severity, item.blocked)}`}
                      data-testid="ecc-stage-badge"
                    >
                      {item.stageLabel}
                    </span>
                  </div>
                  <p className="ecc-item-project">
                    {item.projectLabel}
                    {item.quoteLabel ? ` · ${item.quoteLabel}` : ""}
                  </p>
                  {item.attentionRequired && item.attentionReason ? (
                    <p className="ecc-item-reason" data-testid="ecc-attention-reason">
                      <strong>{item.attentionReason}</strong>
                      {item.attentionDetail ? ` — ${item.attentionDetail}` : ""}
                    </p>
                  ) : (
                    <p className="ecc-item-summary eq-muted">{item.summaryText}</p>
                  )}
                  <p className="ecc-item-meta eq-muted" data-testid="ecc-item-assignee">
                    {item.assignedUser}
                    {item.receivedAt
                      ? ` · Received ${formatReceivedAt(item.receivedAt)}`
                      : ""}
                    {item.ageInStage ? ` · In stage ${item.ageInStage}` : ""}
                  </p>
                </button>
                <div className="ecc-item-actions">
                  <button
                    type="button"
                    className="eq-btn-primary"
                    data-testid="ecc-primary-action"
                    onClick={() => void runPrimary(item)}
                  >
                    {item.nextActionLabel}
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <div className="ecc-pager">
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={offset <= 0 || loading}
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
        >
          Previous
        </button>
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={offset + limit >= total || loading}
          onClick={() => setOffset((o) => o + limit)}
        >
          Next
        </button>
      </div>

      {detail.kind !== "closed" ? (
        <div
          className="eq-drawer-backdrop ecc-drawer-root"
          role="presentation"
          data-testid="ecc-detail-drawer"
          onClick={closeDetail}
        >
          <aside
            className="eq-drawer ecc-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Estimate details"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="eq-drawer-header ecc-drawer-header">
              <h2>
                {detail.kind === "ready"
                  ? detail.item.customerLabel
                  : detail.kind === "loading"
                    ? "Loading…"
                    : "Details"}
              </h2>
              <button
                type="button"
                className="eq-btn-secondary"
                ref={drawerCloseBtnRef}
                data-testid="ecc-drawer-close"
                onClick={closeDetail}
              >
                Close
              </button>
            </header>
            {detail.kind === "loading" ? <p className="eq-muted">Loading estimate summary…</p> : null}
            {detail.kind === "error" ? (
              <p className="eq-state eq-state--error" role="alert">
                {detail.message}
              </p>
            ) : null}
            {detail.kind === "ready" ? (
              <>
                <p className="ecc-drawer-project">{detail.item.projectLabel}</p>
                <p>
                  <span
                    className={`eq-pill eq-pill--${severityTone(detail.item.severity, detail.item.blocked)}`}
                  >
                    {detail.item.stageLabel}
                  </span>
                </p>
                {detail.item.attentionReason ? (
                  <p data-testid="ecc-detail-reason">
                    <strong>{detail.item.attentionReason}</strong>
                    <br />
                    <span className="eq-muted">{detail.item.attentionDetail}</span>
                  </p>
                ) : null}
                <p className="eq-muted" data-testid="ecc-detail-assignee">
                  {detail.item.assignedUser === "Unassigned"
                    ? "Unassigned"
                    : detail.item.assignedUser === "Assigned estimator"
                      ? "Assigned estimator"
                      : `Assigned to ${detail.item.assignedUser}`}
                  {detail.item.ageInStage ? ` · In stage ${detail.item.ageInStage}` : ""}
                </p>
                <p className="eq-muted">{detail.item.summaryText}</p>
                <ol className="ecc-timeline" aria-label="Workflow timeline">
                  {[
                    "Received",
                    "AI Takeoff",
                    "Takeoff Approved",
                    "Pricing",
                    "Estimate Approved",
                    "Published",
                    "Customer Review"
                  ].map((label) => {
                    const current = detail.item.stageLabel;
                    const isCurrent =
                      (label === "AI Takeoff" && detail.item.stageKey === "takeoff") ||
                      (label === "Pricing" &&
                        (detail.item.stageKey === "pricing" ||
                          detail.item.stageKey === "pricing_stale")) ||
                      (label === "Estimate Approved" &&
                        detail.item.stageKey === "ready_to_publish") ||
                      (label === "Published" && detail.item.stageKey === "customer") ||
                      (label === "Customer Review" &&
                        detail.item.stageKey === "review_requested") ||
                      (label === "Received" && detail.item.stageKey === "new");
                    return (
                      <li
                        key={label}
                        className={isCurrent ? "is-current" : "is-muted"}
                        aria-current={isCurrent ? "step" : undefined}
                      >
                        {label}
                        {isCurrent ? ` · ${current}` : ""}
                      </li>
                    );
                  })}
                </ol>
                <div className="eq-drawer-actions">
                  <button
                    type="button"
                    className="eq-btn-primary"
                    data-testid="ecc-detail-primary"
                    onClick={() => void runPrimary(detail.item)}
                  >
                    {detail.item.nextActionLabel}
                  </button>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
