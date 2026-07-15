import React, { useState } from "react";
import { classifyQuoteIntakeError } from "../../lib/quoteIntakeApi.mjs";
import type { QuoteIntakeApiClient } from "../../lib/quoteIntakeApiTypes";

export type MailboxPreviewMessage = {
  graphMessageId: string;
  internetMessageId?: string | null;
  receivedDateTime?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  sender?: {
    displayName?: string | null;
    emailPresent?: boolean;
    fromAddressHashPrefix?: string | null;
  };
  hasAttachments?: boolean;
  attachments?: Array<{
    sourceAttachmentId?: string | null;
    name?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    support?: string;
    kind?: string;
  }>;
  alreadyImported?: boolean;
  existingCaseId?: string | null;
  dedupeState?: string;
  eligibilityHint?: string;
  importable?: boolean;
};

type Props = {
  open: boolean;
  authToken: string;
  apiClient: QuoteIntakeApiClient;
  mailboxDisplay?: string | null;
  onClose: () => void;
  onImported: () => void;
};

type Phase = "idle" | "previewing" | "previewed" | "importing" | "done" | "error";

/**
 * Pilot Sync mailbox workspace — explicit Preview then confirm Import.
 * Never auto-runs on open. Never starts Takeoff / classification.
 */
export default function MailboxSyncModal({
  open,
  authToken,
  apiClient,
  mailboxDisplay,
  onClose,
  onImported
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailboxPreviewMessage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmImport, setConfirmImport] = useState(false);
  const [results, setResults] = useState<
    Array<{ graphMessageId: string; status: string; caseId?: string | null; code?: string }>
  >([]);

  if (!open) return null;

  /** Wipe preview/selection so 401/403 cannot leave mailbox rows on screen. */
  function clearPreviewData() {
    setMessages([]);
    setSelected(new Set());
    setConfirmImport(false);
    setResults([]);
  }

  function reset() {
    setPhase("idle");
    setError(null);
    clearPreviewData();
  }

  async function runPreview() {
    setPhase("previewing");
    setError(null);
    clearPreviewData();
    try {
      const res = await apiClient.previewMailbox(authToken);
      setMessages(Array.isArray(res.messages) ? res.messages : []);
      setPhase("previewed");
    } catch (e) {
      clearPreviewData();
      const classified = classifyQuoteIntakeError(e);
      setPhase("error");
      setError(classified.message || "Preview failed");
    }
  }

  async function runImport() {
    if (!confirmImport) return;
    const ids = [...selected];
    if (!ids.length) return;
    setPhase("importing");
    setError(null);
    try {
      const res = await apiClient.importMailboxMessages(authToken, {
        messageIds: ids,
        confirm: true
      });
      setResults(Array.isArray(res.results) ? res.results : []);
      setPhase("done");
      onImported();
    } catch (e) {
      const classified = classifyQuoteIntakeError(e);
      if (classified.kind === "unauthorized" || classified.kind === "forbidden") {
        clearPreviewData();
      }
      setPhase("error");
      setError(classified.message || "Import failed");
      setResults([]);
    }
  }

  function toggle(id: string, importable: boolean) {
    if (!importable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="eq-modal-backdrop" role="presentation">
      <div
        className="eq-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eq-mailbox-sync-title"
      >
        <header className="eq-modal-head">
          <div>
            <h2 id="eq-mailbox-sync-title">Sync mailbox</h2>
            <p className="eq-muted">
              Read-only manual preview of{" "}
              {mailboxDisplay || "the configured quotes mailbox"}. Messages are not marked read,
              moved, or deleted. Classification and Takeoff stay off.
            </p>
          </div>
          <button
            type="button"
            className="eq-btn-ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Close
          </button>
        </header>

        <div className="eq-modal-body">
          {phase === "idle" || phase === "error" ? (
            <div className="eq-state">
              <p>
                Click <strong>Preview mailbox</strong> to contact Microsoft Graph. Nothing is
                imported until you select messages and confirm.
              </p>
              {error ? (
                <p className="eq-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="button" className="eq-btn-primary" onClick={() => void runPreview()}>
                Preview mailbox
              </button>
            </div>
          ) : null}

          {phase === "previewing" || phase === "importing" ? (
            <div className="eq-state" role="status">
              {phase === "previewing" ? "Loading mailbox preview…" : "Importing selected messages…"}
            </div>
          ) : null}

          {phase === "previewed" || phase === "done" ? (
            <>
              <div className="eq-mailbox-toolbar">
                <button type="button" className="eq-btn-secondary" onClick={() => void runPreview()}>
                  Refresh preview
                </button>
                <span className="eq-muted">{messages.length} message(s)</span>
              </div>
              {messages.length === 0 ? (
                <div className="eq-empty">
                  <h3>No messages in preview</h3>
                  <p>Inbox returned no rows for this bounded page.</p>
                </div>
              ) : (
                <ul className="eq-mailbox-list">
                  {messages.map((m) => {
                    const importable = Boolean(m.importable);
                    const checked = selected.has(m.graphMessageId);
                    return (
                      <li key={m.graphMessageId} className="eq-mailbox-item">
                        <label className="eq-mailbox-row">
                          <input
                            type="checkbox"
                            disabled={!importable}
                            checked={checked}
                            onChange={() => toggle(m.graphMessageId, importable)}
                          />
                          <div>
                            <div className="eq-cell-primary">
                              {m.subject || "Unknown subject"}
                            </div>
                            <div className="eq-cell-meta">
                              {m.receivedDateTime || "Unknown received time"} ·{" "}
                              {m.sender?.displayName ||
                                (m.sender?.emailPresent ? "Sender present" : "Unknown sender")}
                              {m.alreadyImported ? " · Already imported" : ""}
                              {m.eligibilityHint ? ` · ${m.eligibilityHint}` : ""}
                            </div>
                            {m.bodyPreview ? (
                              <p className="eq-pre eq-pre--compact">{m.bodyPreview}</p>
                            ) : null}
                            <div className="eq-cell-meta">
                              Attachments:{" "}
                              {(m.attachments ?? [])
                                .map((a) => `${a.name || "file"} (${a.support || a.kind})`)
                                .join(", ") || "none"}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="eq-mailbox-confirm">
                <label className="eq-confirm-check">
                  <input
                    type="checkbox"
                    checked={confirmImport}
                    onChange={(e) => setConfirmImport(e.target.checked)}
                  />
                  <span>
                    I confirm importing the selected messages into Quote Intake (metadata only; no
                    Takeoff).
                  </span>
                </label>
                <button
                  type="button"
                  className="eq-btn-primary"
                  disabled={!confirmImport || selected.size === 0 || phase === "importing"}
                  onClick={() => void runImport()}
                >
                  Import selected ({selected.size})
                </button>
              </div>

              {results.length ? (
                <section className="eq-detail-section" aria-label="Import results">
                  <h3>Import results</h3>
                  <ul className="eq-list">
                    {results.map((r) => (
                      <li key={r.graphMessageId}>
                        {r.status}
                        {r.caseId ? ` · case ${r.caseId}` : ""}
                        {r.code ? ` · ${r.code}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
