import React, { useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/api";
import { formatPersonLabel, normalizeInboxItemLabels } from "../lib/formatPersonLabel.mjs";
import {
  groupInboxItems,
  resolveCustomerDisplay,
  resolveInboxProgress,
  resolveRequestTitle
} from "../lib/inboxGrouping.mjs";
import {
  fetchQuoteFlowInbox,
  fetchQuoteFlowInboxMessage,
  startQuoteFlowTakeoff,
  type QuoteFlowAttachment,
  type QuoteFlowInboxItem
} from "../lib/quoteFlowInboxApi";

type Props = {
  authToken: string;
  onOpenQueue?: () => void;
  onOpenEstimates?: (estimateId?: string | null) => void;
  /** @deprecated use onOpenQueue */
  onOpenQueuePlaceholder?: () => void;
};

type BatchResult = {
  messageKey: string;
  ok: boolean;
  reused?: boolean;
  takeoffJobId?: string | null;
  error?: string;
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
  const { authToken, onOpenEstimates } = props;
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
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const grouped = useMemo(() => groupInboxItems(items), [items]);
  const selectedCount = Object.keys(selectedAttachmentByMessage).length;

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowInbox(authToken, { limit: 50, state: "all" });
      const rows = Array.isArray(res.items) ? res.items : [];
      setItems(rows.map((row) => normalizeInboxItemLabels(row) as QuoteFlowInboxItem));
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

  // Light poll while active takeoffs exist.
  useEffect(() => {
    if (grouped.active.length === 0) return;
    const id = window.setInterval(() => {
      void loadList();
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
    if (!messageKey || row.alreadyScoped) return;
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
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowInboxMessage(authToken, messageKey);
      const item = normalizeInboxItemLabels(res.item) as QuoteFlowInboxItem;
      setDetail(item);
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

  async function runStartTakeoff(att: QuoteFlowAttachment, markAsPlan = false) {
    if (!detail?.messageKey || !att.attachmentKey) return;
    if (detail.alreadyScoped) {
      setError("Scope is already set for this estimate. AI Takeoff will not run again.");
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
        res.reused
          ? `AI Takeoff job reused (${res.takeoffJobId || "same job"}).`
          : `AI Takeoff started (${res.takeoffJobId || "queued"}).`
      );
      if (res.item) setDetail(normalizeInboxItemLabels(res.item) as QuoteFlowInboxItem);
      clearSelection(detail.messageKey);
      await loadList();
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
        const row = items.find((i) => i.messageKey === messageKey);
        if (row?.alreadyScoped) {
          results.push({
            messageKey,
            ok: false,
            error: "Scope already set — AI Takeoff will not run again."
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
          results.push({
            messageKey,
            ok: true,
            reused: res.reused === true,
            takeoffJobId: res.takeoffJobId
          });
        } catch (e) {
          results.push({ messageKey, ok: false, error: errorMessage(e) });
        }
      })
    );

    setBatchResults(results);
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    setNotice(
      `Started ${okCount} AI Takeoff${okCount === 1 ? "" : "s"}${
        failCount ? ` · ${failCount} failed` : ""
      }.`
    );
    setSelectedAttachmentByMessage((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.ok) delete next[r.messageKey];
      }
      return next;
    });
    await loadList();
    if (selectedKey) {
      try {
        const refreshed = await fetchQuoteFlowInboxMessage(authToken, selectedKey);
        setDetail(normalizeInboxItemLabels(refreshed.item) as QuoteFlowInboxItem);
      } catch {
        /* keep prior detail */
      }
    }
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

    return (
      <li key={key || title} className="qf-inbox__row-wrap">
        <div
          className={
            active
              ? "qf-inbox__row-card is-active"
              : batchSelected
                ? "qf-inbox__row-card is-batch"
                : "qf-inbox__row-card"
          }
          data-testid="qf-inbox-row"
          data-message-key={key}
          data-group={row.group?.key || ""}
          data-status={row.takeoffStatus?.key || ""}
        >
          <label className="qf-inbox__batch-check">
            <input
              type="checkbox"
              data-testid="qf-inbox-batch-check"
              checked={batchSelected}
              disabled={row.alreadyScoped === true || !key}
              onChange={() => toggleBatchSelection(row)}
              aria-label={`Select ${title} for bulk AI Takeoff`}
            />
          </label>
          <button
            type="button"
            className="qf-inbox__row-main"
            onClick={() => key && void openRow(key)}
          >
            <span className="qf-inbox__row-title">{title}</span>
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
            <span
              className="qf-inbox__status"
              data-testid="qf-inbox-row-status"
              data-status={row.takeoffStatus?.key || ""}
            >
              {row.takeoffStatus?.label || "Needs attachment selection"}
              {" · "}
              {nextLabel}
            </span>
            <ProgressBar item={row} />
          </button>
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

  return (
    <section className="qf-page" data-testid="qf-inbox-page">
      <header className="qf-page__header">
        <h1>Inbox</h1>
        <p className="qf-muted">
          New quote requests land here. Select plan attachments, start one or several AI Takeoffs,
          and track progress before Estimate Queue review.
        </p>
      </header>

      <div className="qf-stats" data-testid="qf-inbox-stats">
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.needsAction}</span>
          <span className="qf-stat__label">Needs action</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.activeTakeoffs}</span>
          <span className="qf-stat__label">Active takeoffs</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.readyForReview}</span>
          <span className="qf-stat__label">Ready for review</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{grouped.stats.scopeSet}</span>
          <span className="qf-stat__label">Scope set</span>
        </div>
      </div>

      {error ? (
        <div className="qf-error-box" data-testid="qf-inbox-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-inbox-notice">
          {notice}
        </p>
      ) : null}
      {batchResults.length ? (
        <ul className="qf-inbox__batch-results" data-testid="qf-inbox-batch-results">
          {batchResults.map((r) => (
            <li key={r.messageKey} data-ok={r.ok ? "1" : "0"}>
              {r.ok
                ? `${r.messageKey}: ${r.reused ? "Reused" : "Started"} ${r.takeoffJobId || "job"}`
                : `${r.messageKey}: ${r.error || "Failed"}`}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="qf-inbox qf-inbox--ops" data-testid="qf-inbox">
        <div className="qf-inbox__list" data-testid="qf-inbox-list">
          <div className="qf-inbox__list-head">
            <h2>Requests</h2>
            <div className="qf-inbox__list-actions">
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
                onClick={() => void loadList()}
                disabled={loading}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>
          {loading ? <p className="qf-muted">Loading inbox…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="qf-muted" data-testid="qf-inbox-empty">
              No quote requests right now.
            </p>
          ) : null}
          {!loading && items.length > 0 ? (
            <>
              {renderSection(
                "qf-inbox-group-needs-action",
                "New / needs action",
                grouped.needs_action,
                "No new requests needing action."
              )}
              {renderSection(
                "qf-inbox-group-active",
                "Active AI Takeoffs",
                grouped.active,
                "No AI Takeoffs running right now."
              )}
              {renderSection(
                "qf-inbox-group-completed",
                "Completed / already handled",
                grouped.completed,
                "No completed requests yet."
              )}
            </>
          ) : null}
        </div>

        <div className="qf-inbox__detail" data-testid="qf-inbox-detail">
          {!selectedKey ? (
            <div className="qf-placeholder">
              <p>Select a request to review attachments and start AI Takeoff.</p>
            </div>
          ) : detailLoading ? (
            <p className="qf-muted">Loading attachments…</p>
          ) : detail ? (
            <>
              <h2>{resolveRequestTitle(detail)}</h2>
              <p className="qf-muted">
                {resolveCustomerDisplay(detail, formatPersonLabel)}
                {detail.bodyPreview ? ` — ${detail.bodyPreview}` : ""}
              </p>
              <p
                className="qf-inbox__status qf-inbox__status--detail"
                data-testid="qf-inbox-detail-status"
                data-status={detail.takeoffStatus?.key || ""}
              >
                {detail.takeoffStatus?.label}
                {detail.takeoffJobId ? ` · Job ${detail.takeoffJobId}` : ""}
                {detail.nextAction?.label ? ` · ${detail.nextAction.label}` : ""}
              </p>
              <ProgressBar item={detail} />

              {detail.alreadyScoped ? (
                <p className="qf-notice" data-testid="qf-inbox-already-scoped">
                  Scope is already set for this estimate. AI Takeoff will not run again.
                </p>
              ) : null}

              {detail.planSelectionRequired ? (
                <p className="qf-muted" data-testid="qf-inbox-choose-plan">
                  Multiple plan candidates — choose one before starting AI Takeoff.
                </p>
              ) : null}

              <h3>Attachments</h3>
              <ul className="qf-inbox__attachments" data-testid="qf-inbox-attachments">
                {(detail.attachments || []).map((att) => {
                  const key = att.attachmentKey || att.filename;
                  const selected = selectedAttachmentKey === att.attachmentKey;
                  const canStart =
                    !detail.alreadyScoped &&
                    (att.supportedForTakeoff || att.canMarkAsPlan) &&
                    Boolean(att.attachmentKey);
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
                          {att.contentType || "unknown type"}
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
                              {selected ? "Selected" : "Select"}
                            </button>
                            <button
                              type="button"
                              className="qf-btn-primary"
                              data-testid="qf-inbox-start-takeoff"
                              disabled={busyKey === att.attachmentKey}
                              onClick={() =>
                                void runStartTakeoff(
                                  att,
                                  att.canMarkAsPlan && !att.supportedForTakeoff
                                )
                              }
                            >
                              {busyKey === att.attachmentKey
                                ? "Starting…"
                                : attachmentActionLabel(
                                    att,
                                    selected || !detail.planSelectionRequired
                                  )}
                            </button>
                          </>
                        ) : (
                          <span className="qf-muted" data-testid="qf-inbox-att-disabled">
                            {detail.alreadyScoped ? "Takeoff not allowed" : "No action"}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="qf-inbox__detail-actions">
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
            </>
          ) : (
            <p className="qf-muted">Unable to load this request.</p>
          )}
        </div>
      </div>
    </section>
  );
}
