import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { formatPersonLabel, normalizeInboxItemLabels } from "../lib/formatPersonLabel.mjs";
import {
  filterInboxItems,
  groupInboxItems,
  resolveCustomerDisplay,
  resolveInboxGroupKey,
  resolveInboxProgress,
  resolveRequestTitle,
  sortInboxItemsForDisplay
} from "../lib/inboxGrouping.mjs";
import { formatBatchResultLine, humanInboxLabel } from "../lib/inboxUiHelpers.mjs";
import {
  dismissQuoteFlowInboxMessage,
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
  if (att.action === "unsupported") return "Unsupported";
  if (att.action === "mark_as_plan") {
    return selected ? "Start AI Takeoff (mark as plan)" : "Mark as plan";
  }
  return selected ? "Start AI Takeoff" : "Select for AI Takeoff";
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
    item.alreadyScoped;
  if (!show) return null;
  return (
    <div
      className={progress.isError ? "qf-progress is-error" : "qf-progress"}
      data-testid="qf-inbox-progress"
      data-stage={progress.stageKey}
    >
      <div className="qf-progress__meta">
        <span>{progress.stageLabel}</span>
        <span>{progress.isError ? "Error" : `${progress.percent}%`}</span>
      </div>
      <div className="qf-progress__track" aria-hidden="true">
        <div
          className="qf-progress__fill"
          style={{ width: progress.isError ? "100%" : `${progress.percent}%` }}
        />
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
  const [selectedAttachmentKey, setSelectedAttachmentKey] = useState<string | null>(null);
  /** messageKey → attachmentKey for bulk start */
  const [selectedAttachmentByMessage, setSelectedAttachmentByMessage] = useState<
    Record<string, string>
  >({});
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
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
  const selectedAttachmentKeyRef = useRef<string | null>(null);
  const selectedAttachmentByMessageRef = useRef<Record<string, string>>({});
  const itemsRef = useRef<QuoteFlowInboxItem[]>([]);
  const openedPostedRef = useRef<Set<string>>(new Set());

  selectedKeyRef.current = selectedKey;
  selectedAttachmentKeyRef.current = selectedAttachmentKey;
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
        setSelectedAttachmentKey(null);
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
          setSelectedAttachmentKey(null);
          setSelectedAttachmentByMessage((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        } else {
          const attKey = selectedAttachmentKeyRef.current;
          if (attKey) {
            const stillValid = (stillThere.attachments || []).some(
              (a) => a.attachmentKey === attKey
            );
            if (!stillValid) {
              const fromMap = selectedAttachmentByMessageRef.current[key];
              if (fromMap) {
                const mapValid = (stillThere.attachments || []).some(
                  (a) => a.attachmentKey === fromMap
                );
                if (!mapValid) setSelectedAttachmentKey(null);
              }
            }
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

  // Background poll while active takeoffs exist — never blanks the list.
  useEffect(() => {
    if (grouped.active.length === 0) return;
    const id = window.setInterval(() => {
      void loadList("poll");
    }, 12000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.active.length, authToken]);

  function rememberSelection(messageKey: string, attachmentKey: string | null) {
    if (!messageKey || !attachmentKey) return;
    setSelectedAttachmentByMessage((prev) => ({ ...prev, [messageKey]: attachmentKey }));
  }

  function clearSelection(messageKey: string) {
    setSelectedAttachmentByMessage((prev) => {
      const next = { ...prev };
      delete next[messageKey];
      return next;
    });
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
    setSelectedAttachmentKey(selectedAttachmentByMessage[messageKey] || null);
    setNotice(null);
    setMenuKey(null);
    setDetailLoading(true);
    setError(null);

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
      const existing = selectedAttachmentByMessage[messageKey];
      if (existing) {
        setSelectedAttachmentKey(existing);
      } else {
        const supported = (item.attachments || []).filter((a) => a.supportedForTakeoff);
        if (supported.length === 1 && supported[0].attachmentKey) {
          setSelectedAttachmentKey(supported[0].attachmentKey);
          rememberSelection(messageKey, supported[0].attachmentKey);
        } else if (item.bestPlanCandidate?.attachmentKey && !item.planSelectionRequired) {
          setSelectedAttachmentKey(item.bestPlanCandidate.attachmentKey);
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

  async function runStartTakeoff(att: QuoteFlowAttachment, markAsPlan = false) {
    if (!detail?.messageKey || !att.attachmentKey) return;
    if (detail.alreadyScoped) {
      setError("Scope is already set. Open in Estimates.");
      return;
    }
    const needsChoice =
      detail.planSelectionRequired ||
      (detail.attachments || []).filter((a) => a.supportedForTakeoff).length > 1;
    if (needsChoice && selectedAttachmentKey !== att.attachmentKey) {
      setSelectedAttachmentKey(att.attachmentKey);
      rememberSelection(detail.messageKey, att.attachmentKey);
      setNotice("Attachment selected. Click Start AI Takeoff to continue.");
      return;
    }

    setBusyKey(att.attachmentKey);
    setError(null);
    setNotice(null);
    try {
      const res = await startQuoteFlowTakeoff(authToken, detail.messageKey, {
        attachmentKey: att.attachmentKey,
        manualPlanOverride: markAsPlan,
        idempotencyKey: `qf-start-${detail.messageKey}-${att.attachmentKey}`
      });
      setNotice(
        res.message ||
          (res.alreadyRunning || res.reused
            ? "AI Takeoff is already running."
            : "AI Takeoff started.")
      );
      if (res.item) setDetail(normalizeInboxItemLabels(res.item) as QuoteFlowInboxItem);
      clearSelection(detail.messageKey);
      await loadList("refresh");
    } catch (e) {
      setError(errorMessage(e));
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
    const results: BatchResult[] = [];

    await Promise.all(
      entries.map(async ([messageKey, attachmentKey]) => {
        const row = itemsRef.current.find((i) => i.messageKey === messageKey);
        const label = humanInboxLabel(row, labelHelpers());
        if (row?.alreadyScoped) {
          results.push({
            messageKey,
            label,
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
          results.push({
            messageKey,
            label,
            ok: true,
            reused,
            takeoffJobId: res.takeoffJobId,
            kind: reused ? "already_running" : "started"
          });
        } catch (e) {
          const msg = errorMessage(e);
          results.push({
            messageKey,
            label,
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
    const started = results.filter((r) => r.ok && !r.reused).length;
    const running = results.filter((r) => r.ok && r.reused).length;
    const blocked = results.filter((r) => r.kind === "blocked").length;
    const failed = results.filter((r) => r.kind === "failed").length;
    const parts = [];
    if (started) parts.push(`${started} started`);
    if (running) parts.push(`${running} already running`);
    if (blocked) parts.push(`${blocked} blocked`);
    if (failed) parts.push(`${failed} failed`);
    setNotice(parts.length ? parts.join(" · ") : "No takeoffs started.");
    setSelectedAttachmentByMessage((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.ok || r.kind === "blocked") delete next[r.messageKey];
      }
      return next;
    });
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
                {row.takeoffStatus?.label || "Needs attachment selection"}
              </span>
              <span className="qf-inbox__next">{nextLabel}</span>
            </span>
            <ProgressBar item={row} />
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
              ? "Starting…"
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
      {batchResults.length ? (
        <ul className="qf-inbox__batch-results" data-testid="qf-inbox-batch-results">
          {batchResults.map((r) => (
            <li key={r.messageKey} data-ok={r.ok ? "1" : "0"} data-kind={r.kind}>
              {formatBatchResultLine(r)}
            </li>
          ))}
        </ul>
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
                "Ready for review",
                listReady,
                "No takeoffs ready for review."
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
                    {detail.takeoffStatus?.label}
                  </span>
                  {detail.nextAction?.label ? (
                    <span className="qf-inbox__next">{detail.nextAction.label}</span>
                  ) : null}
                </p>
                <ProgressBar item={detail} />
                <div className="qf-inbox__detail-actions">
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
                  {detail.viewQueue || detail.takeoffStatus?.key === "takeoff_returned" ? (
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
                  Multiple plan candidates — choose one before starting AI Takeoff.
                </p>
              ) : null}

              {detail.bestPlanCandidate?.filename ? (
                <p className="qf-inbox__selected-plan" data-testid="qf-inbox-selected-plan">
                  Selected plan: <strong>{detail.bestPlanCandidate.filename}</strong>
                </p>
              ) : null}

              <h3>Attachments</h3>
              <ul className="qf-inbox__attachments" data-testid="qf-inbox-attachments">
                {(detail.attachments || []).map((att) => {
                  const key = att.attachmentKey || att.filename;
                  const selected = selectedAttachmentKey === att.attachmentKey;
                  const canStart =
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
                          {att.supportedForTakeoff
                            ? "Supported plan"
                            : att.canMarkAsPlan
                              ? "Needs mark as plan"
                              : "Not supported for AI Takeoff"}
                        </div>
                        {att.detectionReason || att.supportLabel || att.support ? (
                          <div className="qf-muted qf-inbox__detection">
                            Detection: {att.detectionReason || att.supportLabel || att.support}
                          </div>
                        ) : null}
                        {selected ? (
                          <div className="qf-inbox__selected-pill" data-testid="qf-inbox-att-selected">
                            Selected
                          </div>
                        ) : null}
                      </div>
                      <div className="qf-inbox__att-actions">
                        {canStart ? (
                          <>
                            <button
                              type="button"
                              className="qf-btn-secondary"
                              data-testid="qf-inbox-select-attachment"
                              onClick={() => {
                                setSelectedAttachmentKey(att.attachmentKey);
                                if (detail.messageKey && att.attachmentKey) {
                                  rememberSelection(detail.messageKey, att.attachmentKey);
                                }
                              }}
                            >
                              {selected ? "Selected" : "Select plan"}
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
                                ? "Starting…"
                                : running
                                  ? "Already running"
                                  : attachmentActionLabel(
                                      att,
                                      selected || !detail.planSelectionRequired
                                    )}
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
    </section>
  );
}
