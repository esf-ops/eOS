import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { formatPersonLabel, normalizeInboxItemLabels } from "../lib/formatPersonLabel.mjs";
import {
  filterInboxItems,
  formatClockTime,
  formatElapsedLabel,
  groupInboxItems,
  resolveCustomerDisplay,
  resolveInboxGroupKey,
  resolveInboxProgress,
  resolveRequestTitle,
  sortInboxItemsForDisplay
} from "../lib/inboxGrouping.mjs";
import {
  ACTIVE_TAKEOFF_STAGE_CHIPS,
  formatBatchResultLine,
  resolveActiveTakeoffStageIndex,
  resolveBatchRequestIdentity,
  resolveTrackedBatchCompletion,
  shortJobLabel,
  summarizeBatchStartResults
} from "../lib/inboxUiHelpers.mjs";
import {
  dismissQuoteFlowInboxMessage,
  fetchQuoteFlowAttachmentDownload,
  fetchQuoteFlowAttachmentPreview,
  fetchQuoteFlowInbox,
  fetchQuoteFlowInboxMessage,
  markQuoteFlowInboxOpened,
  restoreQuoteFlowInboxMessage,
  startQuoteFlowTakeoff,
  type QuoteFlowAttachment,
  type QuoteFlowInboxItem
} from "../lib/quoteFlowInboxApi";

type Props = {
  authToken: string;
  onOpenQueue?: () => void;
  onOpenEstimates?: (estimateId?: string | null) => void;
  /** Open a specific Inbox request after navigating from Estimate Queue. */
  initialMessageKey?: string | null;
  /** @deprecated use onOpenQueue */
  onOpenQueuePlaceholder?: () => void;
};

type BatchResult = {
  messageKey: string;
  label: string;
  subject?: string | null;
  planFilename?: string | null;
  customerLabel?: string | null;
  ok: boolean;
  reused?: boolean;
  takeoffJobId?: string | null;
  error?: string;
  kind: "started" | "already_running" | "blocked" | "failed";
};

type LoadMode = "initial" | "refresh" | "poll";

type FilterKey =
  | "all_active"
  | "new"
  | "needs_attachment"
  | "active"
  | "ready"
  | "scope_set"
  | "removed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all_active", label: "All active" },
  { key: "new", label: "New / unopened" },
  { key: "needs_attachment", label: "Needs attachment" },
  { key: "active", label: "Active takeoffs" },
  { key: "ready", label: "Ready for review" },
  { key: "scope_set", label: "Scope set" },
  { key: "removed", label: "Removed" }
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

function attachmentActionLabel(att: QuoteFlowAttachment, selected: boolean): string {
  if (att.canMarkAsPlan && !att.supportedForTakeoff) {
    return selected ? "Start AI Takeoff with selected files" : "Mark as plan & select";
  }
  return selected ? "Start AI Takeoff with selected files" : "Select for takeoff packet";
}

function attachmentSupportCopy(att: QuoteFlowAttachment): string {
  if (att.likelyInlineImage || att.support === "likely_inline_image" || att.support === "inline_ignored") {
    return "Likely inline email image — preview only unless manually selected.";
  }
  if (att.supportedForTakeoff) return "Supported for AI Takeoff";
  if (att.canMarkAsPlan) return "Needs mark as plan";
  return "Unsupported for AI Takeoff. You can preview/download if available.";
}

function isPreviewableAttachment(att: QuoteFlowAttachment): boolean {
  if (att.previewSupported === true) return true;
  const ct = String(att.contentType || "").toLowerCase();
  const name = String(att.filename || "").toLowerCase();
  return (
    ct.includes("pdf") ||
    /\.pdf$/i.test(name) ||
    ct.startsWith("image/") ||
    /\.(jpe?g|png|webp)$/i.test(name)
  );
}

function formatReceived(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function fileTypeLabel(att: QuoteFlowAttachment): string {
  const ct = String(att.contentType || "").toLowerCase();
  const name = String(att.filename || "").toLowerCase();
  if (ct.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (ct.includes("image") || /\.(png|jpe?g|gif|webp)$/i.test(name)) return "Image";
  if (ct.includes("dwg") || name.endsWith(".dwg")) return "DWG";
  if (ct) return ct.split("/").pop() || "File";
  return "File";
}

function labelHelpers() {
  return { resolveCustomerDisplay, resolveRequestTitle, formatPersonLabel };
}

function statusPillClass(statusKey: string | undefined): string {
  const k = String(statusKey || "");
  if (k === "takeoff_failed") return "qf-pill qf-pill--error";
  if (k === "takeoff_queued" || k === "takeoff_processing") return "qf-pill qf-pill--active";
  if (k === "takeoff_returned") return "qf-pill qf-pill--ready";
  if (k === "already_scoped") return "qf-pill qf-pill--done";
  if (k === "ready_to_start") return "qf-pill qf-pill--go";
  return "qf-pill";
}

function ProgressBar({ item }: { item: QuoteFlowInboxItem }) {
  const progress = resolveInboxProgress(item);
  const show =
    item.takeoffStatus?.key === "takeoff_queued" ||
    item.takeoffStatus?.key === "takeoff_processing" ||
    item.takeoffStatus?.key === "takeoff_returned" ||
    item.takeoffStatus?.key === "takeoff_failed" ||
    item.takeoffStatus?.key === "already_scoped" ||
    item.alreadyScoped ||
    item.isActiveTakeoff === true;
  if (!show) return null;
  const elapsed =
    formatElapsedLabel(item.takeoffElapsedSeconds) ||
    (item.takeoffStartedAt
      ? formatElapsedLabel(
          Math.max(
            0,
            Math.floor((Date.now() - Date.parse(String(item.takeoffStartedAt))) / 1000)
          )
        )
      : null);
  const startedClock = formatClockTime(item.takeoffStartedAt);
  const updatedClock = formatClockTime(item.takeoffUpdatedAt);
  const rightLabel = progress.isError
    ? "Failed"
    : progress.isComplete
      ? "Ready for review"
      : progress.indeterminate || progress.percent == null
        ? "Processing plan"
        : `${progress.percent}%`;
  return (
    <div
      className={
        progress.isError
          ? "qf-progress is-error"
          : progress.indeterminate
            ? "qf-progress is-indeterminate"
            : "qf-progress"
      }
      data-testid="qf-inbox-progress"
      data-stage={progress.stageKey}
      data-indeterminate={progress.indeterminate ? "1" : "0"}
      data-stale={item.isStaleProcessing ? "1" : item.isLongRunning ? "warn" : "0"}
    >
      <div className="qf-progress__meta">
        <span>{progress.stageLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="qf-progress__track" aria-hidden="true">
        <div
          className="qf-progress__fill"
          style={
            progress.isError || progress.indeterminate || progress.percent == null
              ? undefined
              : { width: `${progress.percent}%` }
          }
        />
      </div>
      <div className="qf-progress__details" data-testid="qf-inbox-progress-details">
        {item.takeoffPlanFilename || item.bestPlanCandidate?.filename ? (
          <span>Plan: {item.takeoffPlanFilename || item.bestPlanCandidate?.filename}</span>
        ) : null}
        {startedClock ? <span>Started {startedClock}</span> : null}
        {elapsed ? <span>Elapsed {elapsed}</span> : null}
        {updatedClock ? <span>Updated {updatedClock}</span> : null}
        {item.staleLabel ? (
          <span className="qf-progress__stale" data-testid="qf-inbox-stale">
            {item.staleLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TakeoffTimeline({ item }: { item: QuoteFlowInboxItem }) {
  const steps = Array.isArray(item.takeoffTimeline) ? item.takeoffTimeline : [];
  if (!steps.length) return null;
  return (
    <ol className="qf-inbox__timeline" data-testid="qf-inbox-takeoff-timeline">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`qf-inbox__timeline-step is-${step.tone || "pending"}`}
          data-tone={step.tone || "pending"}
        >
          <span className="qf-inbox__timeline-label">{step.label}</span>
          {step.at ? (
            <span className="qf-muted">{formatClockTime(step.at) || step.at}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function TakeoffStageChips({ item }: { item: QuoteFlowInboxItem }) {
  const progress = resolveInboxProgress(item);
  const idx = resolveActiveTakeoffStageIndex(item.takeoffStatus?.key, progress.stageKey);
  return (
    <ol className="qf-inbox__stage-chips" data-testid="qf-inbox-stage-chips" aria-label="Takeoff stages">
      {ACTIVE_TAKEOFF_STAGE_CHIPS.map((chip, i) => {
        const tone = idx < 0 ? "pending" : i < idx ? "done" : i === idx ? "active" : "pending";
        return (
          <li key={chip.key} className={`qf-inbox__stage-chip is-${tone}`} data-stage={chip.key}>
            {chip.label}
          </li>
        );
      })}
    </ol>
  );
}

function ActiveTakeoffCard({
  item,
  onOpen,
  onOpenQueue,
  onRetry,
  onRemove,
  busy,
  dismissBusy
}: {
  item: QuoteFlowInboxItem;
  onOpen: () => void;
  onOpenQueue?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  busy?: boolean;
  dismissBusy?: boolean;
}) {
  const progress = resolveInboxProgress(item);
  const identity = resolveBatchRequestIdentity(item, labelHelpers());
  const statusKey = item.takeoffStatus?.key || "";
  const isReturned = statusKey === "takeoff_returned";
  const isFailed = statusKey === "takeoff_failed";
  const isActive =
    statusKey === "takeoff_queued" ||
    statusKey === "takeoff_processing" ||
    item.isActiveTakeoff === true;
  const elapsed =
    formatElapsedLabel(item.takeoffElapsedSeconds) ||
    (item.takeoffStartedAt
      ? formatElapsedLabel(
          Math.max(
            0,
            Math.floor((Date.now() - Date.parse(String(item.takeoffStartedAt))) / 1000)
          )
        )
      : null);
  const updatedClock = formatClockTime(item.takeoffUpdatedAt);
  const statusLabel = isReturned
    ? "Ready for review"
    : isFailed
      ? "Failed"
      : progress.stageLabel === "AI Takeoff processing"
        ? "Processing plan"
        : progress.stageLabel === "Sending plan to AI Takeoff"
          ? "Sending plan"
          : progress.stageLabel || item.takeoffStatusLabel || item.takeoffStatus?.label || "Processing";

  return (
    <article
      className={
        isFailed
          ? "qf-inbox__active-card is-failed"
          : isReturned
            ? "qf-inbox__active-card is-ready"
            : "qf-inbox__active-card"
      }
      data-testid="qf-inbox-active-card"
      data-status={statusKey}
      data-message-key={item.messageKey || ""}
    >
      <div className="qf-inbox__active-card-head">
        <div>
          <h3 data-testid="qf-inbox-active-title">{identity.subject || identity.primaryLabel}</h3>
          <p className="qf-muted" data-testid="qf-inbox-active-meta">
            {[identity.planFilename ? `Plan: ${identity.planFilename}` : null, identity.customerLabel]
              .filter(Boolean)
              .join(" · ") || "AI Takeoff"}
          </p>
        </div>
        <span className={statusPillClass(statusKey)} data-testid="qf-inbox-active-status">
          {statusLabel}
        </span>
      </div>
      {isActive || isReturned ? <TakeoffStageChips item={item} /> : null}
      {isActive ? (
        <div
          className={
            progress.indeterminate ? "qf-progress is-indeterminate" : "qf-progress"
          }
          data-testid="qf-inbox-active-progress"
          data-indeterminate={progress.indeterminate ? "1" : "0"}
        >
          <div className="qf-progress__meta">
            <span>{statusLabel}</span>
            <span>{progress.isComplete ? "100%" : "Processing plan"}</span>
          </div>
          <div className="qf-progress__track" aria-hidden="true">
            <div
              className="qf-progress__fill"
              style={
                progress.indeterminate || progress.percent == null
                  ? undefined
                  : { width: `${progress.percent}%` }
              }
            />
          </div>
          <div className="qf-progress__details">
            {elapsed ? <span>Elapsed {elapsed}</span> : null}
            {updatedClock ? <span>Updated {updatedClock}</span> : null}
            {item.staleLabel ? <span className="qf-progress__stale">{item.staleLabel}</span> : null}
          </div>
        </div>
      ) : null}
      {isReturned ? (
        <p className="qf-inbox__active-ready" data-testid="qf-inbox-active-ready">
          Returned from AI Takeoff — ready for Estimate Queue review.
        </p>
      ) : null}
      {isFailed ? (
        <p className="qf-error" data-testid="qf-inbox-active-error">
          {item.takeoffErrorMessageSafe ||
            "AI Takeoff failed, but no detailed reason was returned."}
        </p>
      ) : null}
      <TakeoffTimeline item={item} />
      <div className="qf-inbox__active-card-actions">
        <button type="button" className="qf-btn-secondary" onClick={onOpen}>
          Open request
        </button>
        {isReturned && onOpenQueue ? (
          <button
            type="button"
            className="qf-btn-primary"
            data-testid="qf-inbox-active-view-queue"
            onClick={onOpenQueue}
          >
            View in Estimate Queue
          </button>
        ) : null}
        {isFailed && onRetry ? (
          <button
            type="button"
            className="qf-btn-primary"
            data-testid="qf-inbox-active-retry"
            disabled={busy}
            onClick={onRetry}
          >
            {busy ? "Starting takeoff…" : "Retry AI Takeoff"}
          </button>
        ) : null}
        {(isReturned || isFailed) && onRemove ? (
          <button
            type="button"
            className="qf-btn-secondary"
            disabled={dismissBusy}
            onClick={onRemove}
          >
            Remove from Inbox
          </button>
        ) : null}
      </div>
    </article>
  );
}

function FailureCard({
  item,
  onRetry,
  onRemove,
  onRefresh,
  busy,
  dismissBusy
}: {
  item: QuoteFlowInboxItem;
  onRetry: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  busy: boolean;
  dismissBusy: boolean;
}) {
  if (item.takeoffStatus?.key !== "takeoff_failed") return null;
  return (
    <div className="qf-inbox__failure-card" data-testid="qf-inbox-failure-card">
      <h3>AI Takeoff failed</h3>
      <p data-testid="qf-inbox-failure-message">
        {item.takeoffErrorMessageSafe ||
          "AI Takeoff failed, but no detailed reason was returned."}
      </p>
      <dl className="qf-inbox__failure-meta">
        {item.takeoffFailedAt || item.takeoffUpdatedAt ? (
          <>
            <dt>Failed</dt>
            <dd>{formatClockTime(item.takeoffFailedAt || item.takeoffUpdatedAt)}</dd>
          </>
        ) : null}
        {item.takeoffFailureStage ? (
          <>
            <dt>Stage</dt>
            <dd>{item.takeoffFailureStage}</dd>
          </>
        ) : null}
        {item.takeoffErrorCode ? (
          <>
            <dt>Code</dt>
            <dd>{item.takeoffErrorCode}</dd>
          </>
        ) : null}
        {item.takeoffPlanFilename || item.bestPlanCandidate?.filename ? (
          <>
            <dt>Plan</dt>
            <dd>{item.takeoffPlanFilename || item.bestPlanCandidate?.filename}</dd>
          </>
        ) : null}
        {item.takeoffJobId ? (
          <>
            <dt>Job</dt>
            <dd>{shortJobLabel(item.takeoffJobId)}</dd>
          </>
        ) : null}
      </dl>
      <div className="qf-inbox__failure-actions">
        <button
          type="button"
          className="qf-btn-secondary"
          data-testid="qf-inbox-failure-refresh"
          onClick={onRefresh}
        >
          Refresh status
        </button>
        {item.canRetryTakeoff || item.canStartTakeoff ? (
          <button
            type="button"
            className="qf-btn-primary"
            data-testid="qf-inbox-retry-takeoff"
            disabled={busy}
            onClick={onRetry}
          >
            {busy ? "Starting takeoff…" : "Retry AI Takeoff"}
          </button>
        ) : null}
        {item.messageKey ? (
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-inbox-failure-remove"
            disabled={dismissBusy}
            onClick={onRemove}
          >
            Remove from Quote Flow
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function InboxPage(props: Props) {
  const { authToken, onOpenEstimates, initialMessageKey = null } = props;
  const onOpenQueue = props.onOpenQueue || props.onOpenQueuePlaceholder;
  const [items, setItems] = useState<QuoteFlowInboxItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteFlowInboxItem | null>(null);
  const [selectedAttachmentKeys, setSelectedAttachmentKeys] = useState<string[]>([]);
  /** messageKey → attachmentKeys for bulk start (first key retained for batch compat) */
  const [selectedAttachmentByMessage, setSelectedAttachmentByMessage] = useState<
    Record<string, string>
  >({});
  const [previewAtt, setPreviewAtt] = useState<QuoteFlowAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [trackedBatchKeys, setTrackedBatchKeys] = useState<string[]>([]);
  const [batchCompleteDismissed, setBatchCompleteDismissed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [dismissBusy, setDismissBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all_active");
  const [search, setSearch] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [pendingDismissKey, setPendingDismissKey] = useState<string | null>(null);
  const [undoDismissKey, setUndoDismissKey] = useState<string | null>(null);

  const listInFlightRef = useRef(false);
  const selectedKeyRef = useRef<string | null>(null);
  const selectedAttachmentKeysRef = useRef<string[]>([]);
  const selectedAttachmentByMessageRef = useRef<Record<string, string>>({});
  const itemsRef = useRef<QuoteFlowInboxItem[]>([]);
  const openedPostedRef = useRef<Set<string>>(new Set());
  const previewObjectUrlRef = useRef<string | null>(null);

  selectedKeyRef.current = selectedKey;
  selectedAttachmentKeysRef.current = selectedAttachmentKeys;
  selectedAttachmentByMessageRef.current = selectedAttachmentByMessage;
  itemsRef.current = items;

  const grouped = useMemo(() => groupInboxItems(items), [items]);
  const visibleRows = useMemo(
    () => sortInboxItemsForDisplay(filterInboxItems(items, filter, search)),
    [items, filter, search]
  );

  const selectedCount = Object.keys(selectedAttachmentByMessage).length;
  const showSyncing = isRefreshing || isPolling || batchBusy;

  function applyListRows(rows: QuoteFlowInboxItem[]) {
    setItems(rows);

    const key = selectedKeyRef.current;
    if (key) {
      const stillThere = rows.find((r) => r.messageKey === key);
      if (!stillThere) {
        setSelectedKey(null);
        setDetail(null);
        setSelectedAttachmentKeys([]);
      } else {
        // Soft-merge status onto open detail without wiping the panel.
        setDetail((prev) => {
          if (!prev || prev.messageKey !== key) return prev;
          return {
            ...prev,
            ...stillThere,
            attachments:
              Array.isArray(stillThere.attachments) && stillThere.attachments.length
                ? stillThere.attachments
                : prev.attachments
          };
        });
        if (stillThere.alreadyScoped) {
          setSelectedAttachmentKeys([]);
          setSelectedAttachmentByMessage((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        } else {
          const attKeys = selectedAttachmentKeysRef.current;
          if (attKeys.length) {
            const valid = attKeys.filter((attKey) =>
              (stillThere.attachments || []).some((a) => a.attachmentKey === attKey)
            );
            if (valid.length !== attKeys.length) setSelectedAttachmentKeys(valid);
          }
        }
      }
    }

    setSelectedAttachmentByMessage((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const messageKey of Object.keys(next)) {
        const row = rows.find((r) => r.messageKey === messageKey);
        if (row?.alreadyScoped || row?.dismissed) {
          delete next[messageKey];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

  async function loadList(mode: LoadMode = "refresh") {
    if (listInFlightRef.current) return;
    listInFlightRef.current = true;
    const isInitial = mode === "initial" || (mode !== "poll" && itemsRef.current.length === 0);
    if (isInitial) setInitialLoading(true);
    else if (mode === "poll") setIsPolling(true);
    else setIsRefreshing(true);

    if (mode !== "poll") setError(null);

    try {
      const res = await fetchQuoteFlowInbox(authToken, { limit: 50, state: "all" });
      const rows = (Array.isArray(res.items) ? res.items : []).map(
        (row) => normalizeInboxItemLabels(row) as QuoteFlowInboxItem
      );
      applyListRows(rows);
    } catch (e) {
      if (itemsRef.current.length === 0) {
        setError(errorMessage(e));
        setItems([]);
      } else if (mode !== "poll") {
        setError(errorMessage(e));
      }
    } finally {
      listInFlightRef.current = false;
      setInitialLoading(false);
      setIsRefreshing(false);
      setIsPolling(false);
    }
  }

  useEffect(() => {
    void loadList("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  // Deep-link / cross-tab: open a request when navigating from Estimate Queue.
  useEffect(() => {
    const key = String(initialMessageKey || "").trim();
    if (!key || items.length === 0) return;
    if (selectedKey === key) return;
    void openRow(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessageKey, items.length]);

  // Background poll while active takeoffs exist (or tracked batch still in flight).
  useEffect(() => {
    const trackedActive = trackedBatchKeys.some((key) => {
      const row = itemsRef.current.find((i) => i.messageKey === key);
      const status = row?.takeoffStatus?.key;
      return (
        status === "takeoff_queued" ||
        status === "takeoff_processing" ||
        row?.isActiveTakeoff === true
      );
    });
    if (grouped.active.length === 0 && !trackedActive) return;
    const id = window.setInterval(() => {
      void loadList("poll");
    }, 12000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.active.length, trackedBatchKeys.join("|"), authToken]);

  function rememberSelection(messageKey: string, attachmentKey: string | null) {
    if (!messageKey || !attachmentKey) return;
    setSelectedAttachmentByMessage((prev) => ({ ...prev, [messageKey]: attachmentKey }));
  }

  function toggleAttachmentSelection(attachmentKey: string | null) {
    if (!attachmentKey) return;
    setSelectedAttachmentKeys((prev) => {
      if (prev.includes(attachmentKey)) return prev.filter((k) => k !== attachmentKey);
      return [...prev, attachmentKey];
    });
    if (detail?.messageKey) rememberSelection(detail.messageKey, attachmentKey);
  }

  function clearSelection(messageKey: string) {
    setSelectedAttachmentByMessage((prev) => {
      const next = { ...prev };
      delete next[messageKey];
      return next;
    });
  }

  function closePreview() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewAtt(null);
    setPreviewUrl(null);
    setPreviewContentType(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }

  async function openAttachmentPreview(att: QuoteFlowAttachment) {
    if (!detail?.messageKey || !att.attachmentKey) return;
    closePreview();
    setPreviewAtt(att);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await fetchQuoteFlowAttachmentPreview(
        authToken,
        detail.messageKey,
        att.attachmentKey
      );
      const url = URL.createObjectURL(result.blob);
      previewObjectUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewContentType(result.contentType || result.blob.type || att.contentType || null);
    } catch (e) {
      if (e instanceof ApiError) {
        setPreviewError(e.message || "Attachment could not be loaded.");
      } else {
        setPreviewError("Attachment could not be loaded.");
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  async function downloadAttachment(att: QuoteFlowAttachment) {
    if (!detail?.messageKey || !att.attachmentKey) return;
    try {
      const result = await fetchQuoteFlowAttachmentDownload(
        authToken,
        detail.messageKey,
        att.attachmentKey
      );
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename || att.filename || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message || "Download unavailable for this attachment."
          : "Download unavailable for this attachment."
      );
    }
  }

  function toggleBatchSelection(row: QuoteFlowInboxItem) {
    const messageKey = row.messageKey || "";
    if (!messageKey || row.alreadyScoped || row.dismissed) return;
    if (selectedAttachmentByMessage[messageKey]) {
      clearSelection(messageKey);
      return;
    }
    const attKey =
      row.bestPlanCandidate?.attachmentKey ||
      (row.attachments || []).find((a) => a.supportedForTakeoff)?.attachmentKey ||
      (row.attachments || []).find((a) => a.canMarkAsPlan)?.attachmentKey ||
      null;
    if (attKey) rememberSelection(messageKey, attKey);
  }

  async function openRow(messageKey: string) {
    setSelectedKey(messageKey);
    const existing = selectedAttachmentByMessage[messageKey];
    setSelectedAttachmentKeys(existing ? [existing] : []);
    setNotice(null);
    setMenuKey(null);
    setDetailLoading(true);
    setError(null);
    closePreview();

    // Quote Flow local viewed state — does not change Outlook read/unread.
    setItems((prev) =>
      prev.map((r) => (r.messageKey === messageKey ? { ...r, opened: true } : r))
    );
    if (!openedPostedRef.current.has(messageKey)) {
      openedPostedRef.current.add(messageKey);
      void markQuoteFlowInboxOpened(authToken, messageKey).catch(() => {
        openedPostedRef.current.delete(messageKey);
      });
    }

    try {
      const res = await fetchQuoteFlowInboxMessage(authToken, messageKey);
      const item = normalizeInboxItemLabels(res.item) as QuoteFlowInboxItem;
      setDetail({ ...item, opened: true });
      const mapped = selectedAttachmentByMessage[messageKey];
      if (mapped) {
        setSelectedAttachmentKeys([mapped]);
      } else {
        const supported = (item.attachments || []).filter((a) => a.supportedForTakeoff);
        if (supported.length === 1 && supported[0].attachmentKey) {
          setSelectedAttachmentKeys([supported[0].attachmentKey]);
          rememberSelection(messageKey, supported[0].attachmentKey);
        } else if (item.bestPlanCandidate?.attachmentKey && !item.planSelectionRequired) {
          setSelectedAttachmentKeys([item.bestPlanCandidate.attachmentKey]);
        } else {
          setSelectedAttachmentKeys([]);
        }
      }
    } catch (e) {
      setDetail(null);
      setError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }

  function requestDismiss(row: QuoteFlowInboxItem) {
    const key = row.messageKey || "";
    if (!key) return;
    setMenuKey(null);
    const started =
      row.alreadyScoped ||
      row.takeoffStatus?.key === "takeoff_returned" ||
      row.takeoffStatus?.key === "takeoff_queued" ||
      row.takeoffStatus?.key === "takeoff_processing";
    if (started) {
      void runDismiss(key);
      return;
    }
    setPendingDismissKey(key);
  }

  async function runDismiss(messageKey: string) {
    setPendingDismissKey(null);
    setDismissBusy(true);
    setError(null);
    try {
      const res = await dismissQuoteFlowInboxMessage(authToken, messageKey);
      setItems((prev) =>
        prev.map((r) =>
          r.messageKey === messageKey
            ? {
                ...r,
                dismissed: true,
                group: { key: "dismissed", label: "Removed", sortOrder: 99 },
                canStartTakeoff: false
              }
            : r
        )
      );
      if (selectedKey === messageKey) {
        setDetail((prev) => (prev ? { ...prev, dismissed: true } : prev));
      }
      setUndoDismissKey(messageKey);
      setNotice(
        res.message ||
          "Removed from Quote Flow. This only removes the request from Quote Flow. It does not delete the original email."
      );
      clearSelection(messageKey);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDismissBusy(false);
    }
  }

  async function runRestore(messageKey: string) {
    setDismissBusy(true);
    setError(null);
    setMenuKey(null);
    try {
      const res = await restoreQuoteFlowInboxMessage(authToken, messageKey);
      setUndoDismissKey(null);
      setNotice(res.message || "Restored to Quote Flow Inbox.");
      if (res.item) {
        const item = normalizeInboxItemLabels(res.item) as QuoteFlowInboxItem;
        setItems((prev) =>
          prev.map((r) => (r.messageKey === messageKey ? { ...item, dismissed: false } : r))
        );
        if (selectedKey === messageKey) setDetail({ ...item, dismissed: false });
      } else {
        setItems((prev) =>
          prev.map((r) =>
            r.messageKey === messageKey
              ? {
                  ...r,
                  dismissed: false,
                  group: { key: "needs_action", label: "Needs action", sortOrder: 1 }
                }
              : r
          )
        );
      }
      await loadList("refresh");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDismissBusy(false);
    }
  }

  async function runRetryTakeoffForItem(row: QuoteFlowInboxItem) {
    const messageKey = row.messageKey || "";
    const att =
      (row.attachments || []).find((a) => a.supportedForTakeoff && a.attachmentKey) ||
      (row.attachments || []).find(
        (a) => a.attachmentKey && a.attachmentKey === row.bestPlanCandidate?.attachmentKey
      ) ||
      (row.attachments || []).find((a) => a.canMarkAsPlan && a.attachmentKey) ||
      null;
    if (!messageKey || !att?.attachmentKey) {
      setError("Select a plan attachment to retry AI Takeoff.");
      if (messageKey) void openRow(messageKey);
      return;
    }
    setBusyKey(att.attachmentKey);
    setError(null);
    setNotice(null);
    try {
      const res = await startQuoteFlowTakeoff(authToken, messageKey, {
        attachmentKey: att.attachmentKey,
        manualPlanOverride: Boolean(att.canMarkAsPlan && !att.supportedForTakeoff),
        idempotencyKey: `qf-retry-${messageKey}-${att.attachmentKey}`
      });
      setNotice(
        res.message ||
          (res.alreadyRunning || res.reused
            ? "AI Takeoff is already running."
            : "AI Takeoff started.")
      );
      clearSelection(messageKey);
      await loadList("refresh");
      void openRow(messageKey);
    } catch (e) {
      setError(errorMessage(e) || "AI Takeoff could not start.");
    } finally {
      setBusyKey(null);
    }
  }

  async function runStartTakeoff(att: QuoteFlowAttachment, markAsPlan = false) {
    if (!detail?.messageKey || !att.attachmentKey) return;
    if (detail.alreadyScoped) {
      setError("Scope is already set. Open in Estimates.");
      return;
    }

    let keys = selectedAttachmentKeys.filter(Boolean);
    if (!keys.includes(att.attachmentKey)) {
      keys = [...keys, att.attachmentKey];
      setSelectedAttachmentKeys(keys);
    }
    if (!keys.length) {
      setError("Select the plan files to include in this takeoff packet.");
      return;
    }

    setBusyKey(att.attachmentKey);
    setError(null);
    setNotice(null);
    try {
      const needsManual = (detail.attachments || []).some(
        (a) =>
          a.attachmentKey &&
          keys.includes(a.attachmentKey) &&
          a.canMarkAsPlan &&
          !a.supportedForTakeoff
      );
      const res = await startQuoteFlowTakeoff(authToken, detail.messageKey, {
        attachmentKeys: keys,
        attachmentKey: keys[0],
        manualPlanOverride: markAsPlan || needsManual,
        idempotencyKey: `qf-start-${detail.messageKey}-${keys.join("+").slice(0, 80)}`
      });
      setNotice(
        res.message ||
          (res.alreadyRunning || res.reused
            ? "AI Takeoff is already running."
            : keys.length > 1
              ? "AI Takeoff started with selected plan packet."
              : "AI Takeoff started.")
      );
      if (res.item) setDetail(normalizeInboxItemLabels(res.item) as QuoteFlowInboxItem);
      setSelectedAttachmentKeys([]);
      clearSelection(detail.messageKey);
      await loadList("refresh");
    } catch (e) {
      setError(errorMessage(e) || "AI Takeoff could not start for the selected plan packet.");
    } finally {
      setBusyKey(null);
    }
  }

  async function runBatchStart() {
    const entries = Object.entries(selectedAttachmentByMessage);
    if (!entries.length || batchBusy) return;
    setBatchBusy(true);
    setError(null);
    setNotice(null);
    setBatchResults([]);
    setBatchCompleteDismissed(false);
    const results: BatchResult[] = [];

    await Promise.all(
      entries.map(async ([messageKey, attachmentKey]) => {
        const row = itemsRef.current.find((i) => i.messageKey === messageKey);
        const identity = resolveBatchRequestIdentity(row, labelHelpers());
        if (row?.alreadyScoped) {
          results.push({
            messageKey,
            label: identity.primaryLabel,
            subject: identity.subject,
            planFilename: identity.planFilename,
            customerLabel: identity.customerLabel,
            ok: false,
            kind: "blocked",
            error: "Scope is already set. Open in Estimates."
          });
          return;
        }
        try {
          const att = (row?.attachments || []).find((a) => a.attachmentKey === attachmentKey);
          const res = await startQuoteFlowTakeoff(authToken, messageKey, {
            attachmentKey,
            manualPlanOverride: Boolean(att && att.canMarkAsPlan && !att.supportedForTakeoff),
            idempotencyKey: `qf-batch-${messageKey}-${attachmentKey}`
          });
          const reused = res.alreadyRunning === true || res.reused === true;
          const planFromAtt = att?.filename || identity.planFilename;
          results.push({
            messageKey,
            label: identity.primaryLabel,
            subject: identity.subject,
            planFilename: planFromAtt,
            customerLabel: identity.customerLabel,
            ok: true,
            reused,
            takeoffJobId: res.takeoffJobId,
            kind: reused ? "already_running" : "started"
          });
        } catch (e) {
          const msg = errorMessage(e);
          results.push({
            messageKey,
            label: identity.primaryLabel,
            subject: identity.subject,
            planFilename: identity.planFilename,
            customerLabel: identity.customerLabel,
            ok: false,
            error: msg,
            kind: /scope already set|already_scoped|Open in Estimates/i.test(msg)
              ? "blocked"
              : "failed"
          });
        }
      })
    );

    setBatchResults(results);
    const trackingKeys = results
      .filter((r) => r.ok && (r.kind === "started" || r.kind === "already_running"))
      .map((r) => r.messageKey);
    setTrackedBatchKeys(trackingKeys);
    setSelectedAttachmentByMessage((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.ok || r.kind === "blocked") delete next[r.messageKey];
      }
      return next;
    });
    const detailKey = selectedKeyRef.current;
    if (detailKey && results.some((r) => r.messageKey === detailKey && (r.ok || r.kind === "blocked"))) {
      setSelectedAttachmentKeys([]);
    }
    await loadList("refresh");
    setBatchBusy(false);
  }

  function renderRow(row: QuoteFlowInboxItem) {
    const key = row.messageKey || "";
    const active = key && key === selectedKey;
    const batchSelected = Boolean(key && selectedAttachmentByMessage[key]);
    const customer = resolveCustomerDisplay(row, formatPersonLabel);
    const title = resolveRequestTitle(row);
    const attachmentCount =
      typeof row.attachmentCount === "number" ? row.attachmentCount : (row.attachments || []).length;
    const nextLabel = row.nextAction?.label || row.takeoffStatus?.label || "Open";
    const unopened = row.opened !== true && !row.dismissed;

    return (
      <li key={key || title} className="qf-inbox__row-wrap">
        <div
          className={
            active
              ? "qf-inbox__row-card is-active"
              : batchSelected
                ? "qf-inbox__row-card is-batch"
                : unopened
                  ? "qf-inbox__row-card is-unopened"
                  : "qf-inbox__row-card"
          }
          data-testid="qf-inbox-row"
          data-message-key={key}
          data-group={row.group?.key || resolveInboxGroupKey(row)}
          data-status={row.takeoffStatus?.key || ""}
          data-opened={row.opened === true ? "1" : "0"}
          data-dismissed={row.dismissed === true ? "1" : "0"}
        >
          <label className="qf-inbox__batch-check">
            <input
              type="checkbox"
              data-testid="qf-inbox-batch-check"
              checked={batchSelected}
              disabled={row.alreadyScoped === true || row.dismissed === true || !key}
              onChange={() => toggleBatchSelection(row)}
              aria-label={`Select ${title} for bulk AI Takeoff`}
            />
          </label>
          <button
            type="button"
            className="qf-inbox__row-main"
            onClick={() => key && void openRow(key)}
          >
            <span className="qf-inbox__row-title-line">
              {unopened ? <span className="qf-inbox__dot" aria-label="Unopened" /> : null}
              <span className="qf-inbox__row-title">{title}</span>
            </span>
            <span className="qf-inbox__row-meta">
              {customer}
              {" · "}
              {formatReceived(row.receivedAt)}
            </span>
            <span className="qf-inbox__row-meta">
              {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
              {row.bestPlanCandidate?.filename
                ? ` · Plan: ${row.bestPlanCandidate.filename}`
                : ""}
            </span>
            <span className="qf-inbox__row-status-line">
              <span
                className={statusPillClass(row.takeoffStatus?.key)}
                data-testid="qf-inbox-row-status"
                data-status={row.takeoffStatus?.key || ""}
              >
                {row.takeoffStatusLabel || row.takeoffStatus?.label || "Needs attachment selection"}
              </span>
              {row.staleLabel ? (
                <span className="qf-pill qf-pill--warn" data-testid="qf-inbox-row-stale">
                  {row.staleLabel}
                </span>
              ) : null}
              <span className="qf-inbox__next">{nextLabel}</span>
            </span>
            <ProgressBar item={row} />
            {row.takeoffStatus?.key === "takeoff_failed" && row.takeoffErrorMessageSafe ? (
              <span className="qf-inbox__row-error" data-testid="qf-inbox-row-error">
                {row.takeoffErrorMessageSafe}
              </span>
            ) : null}
          </button>
          <div className="qf-inbox__row-menu">
            <button
              type="button"
              className="qf-btn-ghost"
              data-testid="qf-inbox-row-menu"
              aria-label="Row actions"
              onClick={(e) => {
                e.stopPropagation();
                setMenuKey((prev) => (prev === key ? null : key));
              }}
            >
              ···
            </button>
            {menuKey === key ? (
              <div className="qf-menu" data-testid="qf-inbox-row-actions">
                <button type="button" onClick={() => key && void openRow(key)}>
                  Open
                </button>
                {row.viewQueue || row.takeoffStatus?.key === "takeoff_returned" ? (
                  <button
                    type="button"
                    data-testid="qf-inbox-view-queue"
                    onClick={() => {
                      setMenuKey(null);
                      onOpenQueue?.();
                    }}
                  >
                    View in Estimate Queue
                  </button>
                ) : null}
                {row.viewEstimates || row.alreadyScoped ? (
                  <button
                    type="button"
                    data-testid="qf-inbox-view-estimates"
                    onClick={() => {
                      setMenuKey(null);
                      onOpenEstimates?.(row.estimateId);
                    }}
                  >
                    View in Estimates
                  </button>
                ) : null}
                {row.dismissed ? (
                  <button
                    type="button"
                    data-testid="qf-inbox-restore"
                    disabled={dismissBusy}
                    onClick={() => key && void runRestore(key)}
                  >
                    Restore to Quote Flow
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="qf-inbox-remove"
                    disabled={dismissBusy}
                    onClick={() => requestDismiss(row)}
                  >
                    Remove from Quote Flow
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  function renderSection(
    testId: string,
    title: string,
    rows: QuoteFlowInboxItem[],
    empty: string
  ) {
    return (
      <div className="qf-inbox__section" data-testid={testId}>
        <h3 className="qf-inbox__section-title">
          {title}
          <span className="qf-inbox__section-count">{rows.length}</span>
        </h3>
        {rows.length === 0 ? (
          <p className="qf-muted qf-inbox__section-empty" data-testid={`${testId}-empty`}>
            {empty}
          </p>
        ) : (
          <ul className="qf-inbox__rows">{rows.map(renderRow)}</ul>
        )}
      </div>
    );
  }

  const showFullLoading = initialLoading && items.length === 0;
  const listNeedsAction = visibleRows.filter((r) => resolveInboxGroupKey(r) === "needs_action");
  const listActive = visibleRows.filter((r) => resolveInboxGroupKey(r) === "active");
  const listReady = visibleRows.filter((r) => resolveInboxGroupKey(r) === "ready_for_review");
  const listCompleted = visibleRows.filter((r) => resolveInboxGroupKey(r) === "completed");
  const listDismissed = visibleRows.filter((r) => resolveInboxGroupKey(r) === "dismissed");
  const showGroups = visibleRows.length > 0;
  const showEmpty = !initialLoading && visibleRows.length === 0;

  const batchSummary = batchResults.length ? summarizeBatchStartResults(batchResults) : null;
  const trackedCompletion = resolveTrackedBatchCompletion(items, trackedBatchKeys);
  const showBatchComplete =
    !batchCompleteDismissed &&
    trackedBatchKeys.length > 0 &&
    trackedCompletion.allReturned;

  const progressPanelItems = (() => {
    const byKey = new Map<string, QuoteFlowInboxItem>();
    for (const row of items) {
      const key = row.messageKey || "";
      if (!key) continue;
      const status = row.takeoffStatus?.key || "";
      const isLive =
        status === "takeoff_queued" ||
        status === "takeoff_processing" ||
        row.isActiveTakeoff === true;
      const inTracked =
        trackedBatchKeys.includes(key) &&
        (status === "takeoff_returned" || status === "takeoff_failed");
      if (isLive || inTracked) byKey.set(key, row);
    }
    return Array.from(byKey.values());
  })();

  const stats = {
    newUnopened: grouped.stats.newUnopened ?? 0,
    needsAction: grouped.stats.needsAction,
    activeTakeoffs: grouped.stats.activeTakeoffs,
    readyForReview: grouped.stats.readyForReview,
    scopeSet: grouped.stats.scopeSet,
    dismissed: grouped.stats.dismissed ?? 0
  };

  return (
    <section className="qf-page qf-page--command" data-testid="qf-inbox-page">
      <header className="qf-command-header" data-testid="qf-inbox-command-header">
        <div className="qf-command-header__titles">
          <h1>Quote Flow Inbox</h1>
          <p className="qf-muted">
            Select plan attachments, start AI Takeoff, and track progress before Estimate Queue
            review.
          </p>
        </div>
        <div className="qf-command-header__actions">
          {showSyncing ? (
            <span className="qf-inbox__syncing" data-testid="qf-inbox-syncing">
              Syncing…
            </span>
          ) : null}
          <button
            type="button"
            className="qf-btn-primary"
            data-testid="qf-inbox-start-selected"
            disabled={batchBusy || selectedCount === 0}
            onClick={() => void runBatchStart()}
          >
            {batchBusy
              ? "Starting takeoffs…"
              : `Start selected AI Takeoffs${selectedCount ? ` (${selectedCount})` : ""}`}
          </button>
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-inbox-refresh"
            onClick={() => void loadList("refresh")}
            disabled={initialLoading || isRefreshing}
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-inbox-toggle-removed"
            onClick={() => {
              if (showRemoved || filter === "removed") {
                setShowRemoved(false);
                setFilter("all_active");
              } else {
                setShowRemoved(true);
                setFilter("removed");
              }
            }}
          >
            {showRemoved || filter === "removed" ? "Hide removed" : "Show removed"}
          </button>
        </div>
      </header>

      <div className="qf-stats qf-stats--command" data-testid="qf-inbox-stats">
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.newUnopened}</span>
          <span className="qf-stat__label">New</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.needsAction}</span>
          <span className="qf-stat__label">Needs action</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.activeTakeoffs}</span>
          <span className="qf-stat__label">Active takeoffs</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.readyForReview}</span>
          <span className="qf-stat__label">Ready for review</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.scopeSet}</span>
          <span className="qf-stat__label">Scope set</span>
        </div>
        {showRemoved || filter === "removed" ? (
          <div className="qf-stat" data-testid="qf-inbox-stat-removed">
            <span className="qf-stat__value">{stats.dismissed}</span>
            <span className="qf-stat__label">Removed</span>
          </div>
        ) : null}
      </div>

      <div className="qf-inbox-toolbar" data-testid="qf-inbox-filters">
        <div className="qf-filter-chips" role="tablist" aria-label="Inbox filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              className={filter === f.key ? "qf-chip is-active" : "qf-chip"}
              data-testid={`qf-inbox-filter-${f.key}`}
              aria-selected={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                if (f.key === "removed") setShowRemoved(true);
                if (f.key !== "removed" && showRemoved) setShowRemoved(false);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="qf-inbox-search">
          <span className="qf-visually-hidden">Search</span>
          <input
            type="search"
            data-testid="qf-inbox-search"
            placeholder="Search sender, subject, attachment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="qf-error-box" data-testid="qf-inbox-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-inbox-notice">
          {notice}
          {undoDismissKey ? (
            <>
              {" "}
              <button
                type="button"
                className="qf-link-btn"
                data-testid="qf-inbox-undo-remove"
                onClick={() => void runRestore(undoDismissKey)}
              >
                Undo
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {batchResults.length && batchSummary ? (
        <div className="qf-inbox__batch-panel" data-testid="qf-inbox-batch-banner">
          <div className="qf-inbox__batch-panel-head">
            <p data-testid="qf-inbox-batch-summary">{batchSummary.summaryLine}</p>
            <button
              type="button"
              className="qf-link-btn"
              data-testid="qf-inbox-batch-dismiss"
              onClick={() => setBatchResults([])}
            >
              Dismiss
            </button>
          </div>
          <ul className="qf-inbox__batch-results" data-testid="qf-inbox-batch-results">
            {batchResults.map((r) => (
              <li key={r.messageKey} data-ok={r.ok ? "1" : "0"} data-kind={r.kind}>
                <div className="qf-inbox__batch-result-main">{formatBatchResultLine(r)}</div>
                {r.subject || r.planFilename || r.customerLabel ? (
                  <div className="qf-muted qf-inbox__batch-result-meta" data-testid="qf-inbox-batch-result-meta">
                    {[r.subject, r.planFilename ? `Plan: ${r.planFilename}` : null, r.customerLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ) : null}
                {!r.ok && r.error ? (
                  <div className="qf-error qf-inbox__batch-result-error" data-testid="qf-inbox-batch-result-error">
                    {r.error}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showBatchComplete ? (
        <div className="qf-inbox__batch-complete" data-testid="qf-inbox-batch-complete">
          <p data-testid="qf-inbox-batch-complete-copy">
            {trackedCompletion.returnedCount === 1
              ? "1 takeoff returned and is ready for review."
              : `${trackedCompletion.returnedCount} takeoffs returned and are ready for review.`}
          </p>
          <div className="qf-inbox__batch-complete-actions">
            <button
              type="button"
              className="qf-btn-primary"
              data-testid="qf-inbox-batch-view-queue"
              onClick={() => {
                setBatchCompleteDismissed(true);
                onOpenQueue?.();
              }}
            >
              View Estimate Queue
            </button>
            <button
              type="button"
              className="qf-btn-secondary"
              onClick={() => {
                setBatchCompleteDismissed(true);
                setTrackedBatchKeys([]);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {progressPanelItems.length ? (
        <section className="qf-inbox__active-panel" data-testid="qf-inbox-active-panel">
          <div className="qf-inbox__active-panel-head">
            <h2>Active AI Takeoffs</h2>
            <span className="qf-muted">
              {stats.activeTakeoffs
                ? `${stats.activeTakeoffs} processing`
                : "Tracking progress"}
              {stats.readyForReview ? ` · ${stats.readyForReview} ready for review` : ""}
            </span>
          </div>
          <div className="qf-inbox__active-cards">
            {progressPanelItems.map((row) => {
              const key = row.messageKey || "";
              return (
                <ActiveTakeoffCard
                  key={key || row.subject}
                  item={row}
                  busy={Boolean(busyKey)}
                  dismissBusy={dismissBusy}
                  onOpen={() => {
                    if (key) void openRow(key);
                  }}
                  onOpenQueue={onOpenQueue}
                  onRetry={
                    row.takeoffStatus?.key === "takeoff_failed" &&
                    (row.canRetryTakeoff || row.canStartTakeoff)
                      ? () => void runRetryTakeoffForItem(row)
                      : undefined
                  }
                  onRemove={key ? () => requestDismiss(row) : undefined}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {pendingDismissKey ? (
        <div className="qf-confirm" data-testid="qf-inbox-dismiss-confirm">
          <p>
            Remove this request from Quote Flow? The original email will not be deleted.
          </p>
          <p className="qf-muted">
            This only removes the request from Quote Flow. It does not delete the original email.
          </p>
          <div className="qf-confirm__actions">
            <button
              type="button"
              className="qf-btn-secondary"
              onClick={() => setPendingDismissKey(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="qf-btn-primary"
              data-testid="qf-inbox-dismiss-confirm-yes"
              onClick={() => void runDismiss(pendingDismissKey)}
            >
              Remove from Quote Flow
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="qf-inbox qf-inbox--ops qf-inbox--command"
        data-testid="qf-inbox"
      >
        <div className="qf-inbox__list" data-testid="qf-inbox-list">
          <div className="qf-inbox__list-head">
            <h2>Requests</h2>
            <span className="qf-muted">{visibleRows.length} shown</span>
          </div>
          {showFullLoading ? (
            <p className="qf-muted" data-testid="qf-inbox-initial-loading">
              Loading inbox…
            </p>
          ) : null}
          {showEmpty ? (
            <div className="qf-inbox__empty" data-testid="qf-inbox-empty">
              <p className="qf-muted">
                {filter === "removed" || showRemoved
                  ? "No removed requests."
                  : search
                    ? "No requests match this search."
                    : "No quote requests right now."}
              </p>
            </div>
          ) : null}
          {showGroups ? (
            <>
              {renderSection(
                "qf-inbox-group-needs-action",
                "New / needs action",
                listNeedsAction,
                "No new requests needing action."
              )}
              {renderSection(
                "qf-inbox-group-active",
                "Active AI Takeoffs",
                listActive,
                "No AI Takeoffs running right now."
              )}
              {renderSection(
                "qf-inbox-group-ready",
                "Takeoff returned",
                listReady,
                "No takeoffs returned yet."
              )}
              {renderSection(
                "qf-inbox-group-completed",
                "Completed / already handled",
                listCompleted,
                "No completed requests yet."
              )}
              {filter === "removed" || showRemoved
                ? renderSection(
                    "qf-inbox-group-dismissed",
                    "Removed",
                    listDismissed,
                    "No removed requests."
                  )
                : null}
            </>
          ) : null}
        </div>

        <div className="qf-inbox__detail" data-testid="qf-inbox-detail">
          {!selectedKey ? (
            <div className="qf-placeholder qf-placeholder--command">
              <h2>Request detail</h2>
              <p>Select a request to review attachments and start AI Takeoff.</p>
            </div>
          ) : detailLoading && !detail ? (
            <p className="qf-muted">Loading attachments…</p>
          ) : detail ? (
            <>
              <div className="qf-inbox__detail-sticky">
                <h2>{resolveRequestTitle(detail)}</h2>
                <p className="qf-muted">
                  {resolveCustomerDisplay(detail, formatPersonLabel)}
                  {" · "}
                  {formatReceived(detail.receivedAt)}
                </p>
                {detail.bodyPreview ? (
                  <p className="qf-inbox__preview" data-testid="qf-inbox-body-preview">
                    {detail.bodyPreview}
                  </p>
                ) : null}
                <p
                  className="qf-inbox__status qf-inbox__status--detail"
                  data-testid="qf-inbox-detail-status"
                  data-status={detail.takeoffStatus?.key || ""}
                >
                  <span className={statusPillClass(detail.takeoffStatus?.key)}>
                    {detail.takeoffStatusLabel || detail.takeoffStatus?.label}
                  </span>
                  {detail.staleLabel ? (
                    <span className="qf-pill qf-pill--warn" data-testid="qf-inbox-detail-stale">
                      {detail.staleLabel}
                    </span>
                  ) : null}
                  {detail.nextAction?.label ? (
                    <span className="qf-inbox__next">{detail.nextAction.label}</span>
                  ) : null}
                </p>
                <ProgressBar item={detail} />
                <TakeoffTimeline item={detail} />
                <FailureCard
                  item={detail}
                  busy={busyKey != null}
                  dismissBusy={dismissBusy}
                  onRefresh={() => void loadList("refresh")}
                  onRemove={() => requestDismiss(detail)}
                  onRetry={() => {
                    const att =
                      (detail.attachments || []).find(
                        (a) => a.attachmentKey && selectedAttachmentKeys.includes(a.attachmentKey)
                      ) ||
                      (detail.attachments || []).find((a) => a.supportedForTakeoff) ||
                      (detail.attachments || []).find((a) => a.canMarkAsPlan) ||
                      null;
                    if (att) {
                      void runStartTakeoff(
                        att,
                        Boolean(att.canMarkAsPlan && !att.supportedForTakeoff)
                      );
                    }
                  }}
                />
                <div className="qf-inbox__detail-actions">
                  {detail.takeoffStatus?.key === "takeoff_returned" ? (
                    <button
                      type="button"
                      className="qf-btn-primary"
                      data-testid="qf-inbox-view-queue"
                      onClick={() => onOpenQueue?.()}
                    >
                      View in Estimate Queue
                    </button>
                  ) : null}
                  {detail.isActiveTakeoff ||
                  detail.takeoffStatus?.key === "takeoff_queued" ||
                  detail.takeoffStatus?.key === "takeoff_processing" ? (
                    <button
                      type="button"
                      className="qf-btn-secondary"
                      data-testid="qf-inbox-refresh-status"
                      onClick={() => void loadList("refresh")}
                      disabled={isRefreshing || isPolling}
                    >
                      Refresh status
                    </button>
                  ) : null}
                  {detail.dismissed ? (
                    <button
                      type="button"
                      className="qf-btn-secondary"
                      data-testid="qf-inbox-restore"
                      disabled={dismissBusy}
                      onClick={() => detail.messageKey && void runRestore(detail.messageKey)}
                    >
                      Restore to Quote Flow
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="qf-btn-secondary"
                      data-testid="qf-inbox-remove"
                      disabled={dismissBusy}
                      onClick={() => requestDismiss(detail)}
                    >
                      Remove from Quote Flow
                    </button>
                  )}
                  {detail.takeoffStatus?.key !== "takeoff_returned" &&
                  (detail.viewQueue || detail.takeoffStatus?.key === "takeoff_returned") ? (
                    <button
                      type="button"
                      className="qf-btn-secondary"
                      data-testid="qf-inbox-view-queue"
                      onClick={() => onOpenQueue?.()}
                    >
                      View in Estimate Queue
                    </button>
                  ) : null}
                  {detail.viewEstimates || detail.alreadyScoped ? (
                    <button
                      type="button"
                      className="qf-btn-secondary"
                      data-testid="qf-inbox-view-estimates"
                      onClick={() => onOpenEstimates?.(detail.estimateId)}
                    >
                      View in Estimates
                    </button>
                  ) : null}
                </div>
              </div>

              {detail.alreadyScoped ? (
                <p className="qf-notice" data-testid="qf-inbox-already-scoped">
                  Scope is already set. Open in Estimates.
                </p>
              ) : null}

              {detail.dismissed ? (
                <p className="qf-notice" data-testid="qf-inbox-dismissed-note">
                  Removed from Quote Flow. The original email was not deleted.
                </p>
              ) : null}

              {detail.planSelectionRequired ? (
                <p className="qf-muted" data-testid="qf-inbox-choose-plan">
                  Select the plan files to include in this takeoff packet. PDFs and real plan
                  images are supported.
                </p>
              ) : null}

              {selectedAttachmentKeys.length ? (
                <p className="qf-inbox__selected-plan" data-testid="qf-inbox-selected-plan">
                  Selected for packet ({selectedAttachmentKeys.length}):{" "}
                  <strong>
                    {(detail.attachments || [])
                      .filter(
                        (a) => a.attachmentKey && selectedAttachmentKeys.includes(a.attachmentKey)
                      )
                      .map((a) => a.filename)
                      .join(", ") || "—"}
                  </strong>
                </p>
              ) : detail.bestPlanCandidate?.filename ? (
                <p className="qf-inbox__selected-plan" data-testid="qf-inbox-selected-plan">
                  Suggested plan: <strong>{detail.bestPlanCandidate.filename}</strong>
                </p>
              ) : null}

              <h3>Attachments</h3>
              <ul className="qf-inbox__attachments" data-testid="qf-inbox-attachments">
                {(detail.attachments || []).map((att) => {
                  const key = att.attachmentKey || att.filename;
                  const selected = Boolean(
                    att.attachmentKey && selectedAttachmentKeys.includes(att.attachmentKey)
                  );
                  const canSelect =
                    !detail.alreadyScoped &&
                    !detail.dismissed &&
                    (att.supportedForTakeoff || att.canMarkAsPlan) &&
                    Boolean(att.attachmentKey);
                  const running =
                    detail.takeoffStatus?.key === "takeoff_queued" ||
                    detail.takeoffStatus?.key === "takeoff_processing";
                  return (
                    <li
                      key={key}
                      className={selected ? "qf-inbox__att is-selected" : "qf-inbox__att"}
                      data-testid="qf-inbox-attachment"
                      data-selected={selected ? "1" : "0"}
                    >
                      <div>
                        <strong>{att.filename}</strong>
                        <div className="qf-muted">
                          {fileTypeLabel(att)}
                          {" · "}
                          {attachmentSupportCopy(att)}
                        </div>
                        {att.detectionReason || att.supportLabel || att.support ? (
                          <div className="qf-muted qf-inbox__detection">
                            Detection: {att.detectionReason || att.supportLabel || att.support}
                          </div>
                        ) : null}
                        {selected ? (
                          <div className="qf-inbox__selected-pill" data-testid="qf-inbox-att-selected">
                            In takeoff packet
                          </div>
                        ) : null}
                      </div>
                      <div className="qf-inbox__att-actions">
                        {isPreviewableAttachment(att) && att.attachmentKey ? (
                          <>
                            <button
                              type="button"
                              className="qf-btn-secondary"
                              data-testid="qf-inbox-preview-attachment"
                              onClick={() => void openAttachmentPreview(att)}
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              className="qf-btn-secondary"
                              data-testid="qf-inbox-download-attachment"
                              onClick={() => void downloadAttachment(att)}
                            >
                              Download
                            </button>
                          </>
                        ) : (
                          <span className="qf-muted" data-testid="qf-inbox-preview-unavailable">
                            Preview unavailable for this file type. Use Download if needed.
                          </span>
                        )}
                        {canSelect ? (
                          <>
                            <button
                              type="button"
                              className="qf-btn-secondary"
                              data-testid="qf-inbox-select-attachment"
                              onClick={() => toggleAttachmentSelection(att.attachmentKey)}
                            >
                              {selected ? "Remove from packet" : "Add to packet"}
                            </button>
                            <button
                              type="button"
                              className="qf-btn-primary"
                              data-testid="qf-inbox-start-takeoff"
                              disabled={busyKey === att.attachmentKey || running}
                              onClick={() =>
                                void runStartTakeoff(
                                  att,
                                  att.canMarkAsPlan && !att.supportedForTakeoff
                                )
                              }
                            >
                              {busyKey === att.attachmentKey
                                ? "Starting takeoff…"
                                : running
                                  ? "Already running"
                                  : detail.takeoffStatus?.key === "takeoff_failed"
                                    ? "Retry AI Takeoff"
                                    : selectedAttachmentKeys.length > 1
                                      ? `Start AI Takeoff with ${selectedAttachmentKeys.length} files`
                                      : attachmentActionLabel(att, selected)}
                            </button>
                          </>
                        ) : detail.viewQueue || detail.takeoffStatus?.key === "takeoff_returned" ? (
                          <button
                            type="button"
                            className="qf-btn-secondary"
                            onClick={() => onOpenQueue?.()}
                          >
                            View in Queue
                          </button>
                        ) : detail.alreadyScoped ? (
                          <button
                            type="button"
                            className="qf-btn-secondary"
                            onClick={() => onOpenEstimates?.(detail.estimateId)}
                          >
                            View in Estimates
                          </button>
                        ) : (
                          <span className="qf-muted" data-testid="qf-inbox-att-disabled">
                            {detail.dismissed ? "Removed" : "No action"}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="qf-muted">Unable to load this request.</p>
          )}
        </div>
      </div>

      {previewAtt ? (
        <div className="qf-inbox__preview-modal" data-testid="qf-inbox-preview-modal" role="dialog">
          <div className="qf-inbox__preview-panel">
            <div className="qf-inbox__preview-head">
              <strong>{previewAtt.filename}</strong>
              <div className="qf-inbox__preview-actions">
                {previewUrl && !previewError ? (
                  <a
                    className="qf-btn-secondary"
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="qf-inbox-preview-open-tab"
                  >
                    Open in new tab
                  </a>
                ) : null}
                <button type="button" className="qf-btn-secondary" onClick={closePreview}>
                  Close
                </button>
              </div>
            </div>
            {previewLoading ? <p className="qf-muted">Loading preview…</p> : null}
            {previewError ? (
              <p className="qf-error" data-testid="qf-inbox-preview-error">
                {previewError}
              </p>
            ) : null}
            {previewUrl && !previewError
              ? (() => {
                  const ct = String(previewContentType || previewAtt.contentType || "").toLowerCase();
                  const name = String(previewAtt.filename || "").toLowerCase();
                  const isPdf = ct.includes("pdf") || /\.pdf$/i.test(name);
                  const isImage =
                    ct.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(name);
                  if (isPdf) {
                    return (
                      <iframe
                        title={previewAtt.filename}
                        src={previewUrl}
                        className="qf-inbox__preview-frame"
                        data-testid="qf-inbox-preview-pdf"
                      />
                    );
                  }
                  if (isImage) {
                    return (
                      <img
                        src={previewUrl}
                        alt={previewAtt.filename}
                        className="qf-inbox__preview-image"
                        data-testid="qf-inbox-preview-image"
                      />
                    );
                  }
                  return (
                    <p className="qf-muted" data-testid="qf-inbox-preview-unsupported">
                      Preview unavailable for this file type. Use Download if needed.
                    </p>
                  );
                })()
              : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
