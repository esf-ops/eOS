import React, { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { formatPersonLabel, normalizeInboxItemLabels } from "../lib/formatPersonLabel.mjs";
import {
  fetchQuoteFlowInbox,
  fetchQuoteFlowInboxMessage,
  startQuoteFlowTakeoff,
  type QuoteFlowAttachment,
  type QuoteFlowInboxItem
} from "../lib/quoteFlowInboxApi";

type Props = {
  authToken: string;
  onOpenQueuePlaceholder?: () => void;
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

export default function InboxPage(props: Props) {
  const { authToken, onOpenQueuePlaceholder } = props;
  const [items, setItems] = useState<QuoteFlowInboxItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteFlowInboxItem | null>(null);
  const [selectedAttachmentKey, setSelectedAttachmentKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function openRow(messageKey: string) {
    setSelectedKey(messageKey);
    setSelectedAttachmentKey(null);
    setNotice(null);
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowInboxMessage(authToken, messageKey);
      setDetail(normalizeInboxItemLabels(res.item) as QuoteFlowInboxItem);
      const supported = (res.item.attachments || []).filter((a) => a.supportedForTakeoff);
      if (supported.length === 1 && supported[0].attachmentKey) {
        setSelectedAttachmentKey(supported[0].attachmentKey);
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
      await loadList();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="qf-page" data-testid="qf-inbox-page">
      <header className="qf-page__header">
        <h1>Inbox</h1>
        <p className="qf-muted">
          Quote request messages and plan attachments land here. Select the correct plan to start AI
          Takeoff — no pricing or locked scope yet.
        </p>
      </header>

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

      <div className="qf-inbox" data-testid="qf-inbox">
        <div className="qf-inbox__list" data-testid="qf-inbox-list">
          <div className="qf-inbox__list-head">
            <h2>Requests</h2>
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
          {loading ? <p className="qf-muted">Loading inbox…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="qf-muted" data-testid="qf-inbox-empty">
              No quote requests right now.
            </p>
          ) : null}
          <ul className="qf-inbox__rows">
            {items.map((row) => {
              const key = row.messageKey || "";
              const active = key && key === selectedKey;
              return (
                <li key={key || row.subject}>
                  <button
                    type="button"
                    className={active ? "qf-inbox__row is-active" : "qf-inbox__row"}
                    data-testid="qf-inbox-row"
                    data-message-key={key}
                    onClick={() => key && void openRow(key)}
                  >
                    <span className="qf-inbox__row-title">{row.subject}</span>
                    <span className="qf-inbox__row-meta">
                      {formatPersonLabel(row.senderLabel ?? row.sender, "Unknown contact")}
                      {row.receivedAt ? ` · ${new Date(row.receivedAt).toLocaleString()}` : ""}
                    </span>
                    <span
                      className="qf-inbox__status"
                      data-testid="qf-inbox-row-status"
                      data-status={row.takeoffStatus?.key || ""}
                    >
                      {row.takeoffStatus?.label || "Needs attachment selection"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
              <h2>{detail.subject}</h2>
              <p className="qf-muted">
                {formatPersonLabel(detail.senderLabel ?? detail.sender, "Unknown contact")}
                {detail.bodyPreview ? ` — ${detail.bodyPreview}` : ""}
              </p>
              <p
                className="qf-inbox__status qf-inbox__status--detail"
                data-testid="qf-inbox-detail-status"
                data-status={detail.takeoffStatus?.key || ""}
              >
                {detail.takeoffStatus?.label}
                {detail.takeoffJobId ? ` · Job ${detail.takeoffJobId}` : ""}
              </p>

              {detail.alreadyScoped ? (
                <p className="qf-notice" data-testid="qf-inbox-already-scoped">
                  Scope is already set for this estimate. AI Takeoff will not run again.
                </p>
              ) : null}

              {detail.planSelectionRequired ? (
                <p className="qf-muted" data-testid="qf-inbox-choose-plan">
                  Choose the plan file to send to AI Takeoff.
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
                          {att.support ? ` (${att.support})` : ""}
                        </div>
                      </div>
                      <div className="qf-inbox__att-actions">
                        {canStart ? (
                          <button
                            type="button"
                            className="qf-btn-primary"
                            data-testid="qf-inbox-start-takeoff"
                            disabled={busyKey === att.attachmentKey}
                            onClick={() =>
                              void runStartTakeoff(att, att.canMarkAsPlan && !att.supportedForTakeoff)
                            }
                          >
                            {busyKey === att.attachmentKey
                              ? "Starting…"
                              : attachmentActionLabel(att, selected || !detail.planSelectionRequired)}
                          </button>
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

              {detail.queueHint ? (
                <button
                  type="button"
                  className="qf-btn-secondary"
                  data-testid="qf-inbox-view-queue"
                  title="Estimate Queue review comes in a later slice"
                  onClick={() => onOpenQueuePlaceholder?.()}
                >
                  {detail.queueHint}
                </button>
              ) : null}
            </>
          ) : (
            <p className="qf-muted">Unable to load this request.</p>
          )}
        </div>
      </div>
    </section>
  );
}
