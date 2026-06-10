import React, { useCallback, useEffect, useState } from "react";

import {
  buildRecipientsPayload,
  previewEstimateEmail,
  sendEstimateEmail,
  type QuoteDeliveryResponse
} from "../../lib/quoteDeliveryApi";
import { friendlyApiErrorMessage } from "../../lib/saveErrorMessage";

export type EmailEstimateModalProps = {
  open: boolean;
  onClose: () => void;
  quoteId: string | null;
  sessionToken: string | null;
  blockReason: string | null;
  defaultToEmail: string;
  defaultSubject: string;
  quoteNumber: string | null;
  revisionLabel: string | null;
};

export default function EmailEstimateModal(props: EmailEstimateModalProps) {
  const {
    open,
    onClose,
    quoteId,
    sessionToken,
    blockReason,
    defaultToEmail,
    defaultSubject,
    quoteNumber,
    revisionLabel
  } = props;

  const [toField, setToField] = useState("");
  const [ccField, setCcField] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [lastPreviewAt, setLastPreviewAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToField(defaultToEmail.trim());
    setCcField("");
    setSubject(defaultSubject.trim());
    setHtmlPreview(null);
    setTextPreview(null);
    setWarnings([]);
    setStatusMsg(null);
    setErrorMsg(null);
    setLastPreviewAt(null);
  }, [open, defaultToEmail, defaultSubject]);

  const applyResponse = useCallback((res: QuoteDeliveryResponse) => {
    if (res.subject) setSubject(res.subject);
    if (res.htmlPreview) setHtmlPreview(res.htmlPreview);
    if (res.textPreview) setTextPreview(res.textPreview);
    const w = [...(res.warnings || [])];
    if (res.setupWarning) w.push(res.setupWarning);
    setWarnings(w);
  }, []);

  const buildPayload = useCallback(() => {
    const recipients = buildRecipientsPayload(toField, ccField);
    return {
      recipients,
      subject: subject.trim() || undefined
    };
  }, [toField, ccField, subject]);

  const handlePreview = useCallback(async () => {
    if (!quoteId || !sessionToken || blockReason) return;
    setPreviewBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await previewEstimateEmail(quoteId, sessionToken, buildPayload());
      if (!res.ok) throw new Error(res.error || "Preview failed");
      applyResponse(res);
      setLastPreviewAt(new Date().toLocaleString());
      setStatusMsg("Preview loaded from server.");
    } catch (e) {
      const info = friendlyApiErrorMessage(e, "/api/quote-delivery", "save");
      setErrorMsg(info.userMessage);
    } finally {
      setPreviewBusy(false);
    }
  }, [quoteId, sessionToken, blockReason, buildPayload, applyResponse]);

  const handleSendDryRun = useCallback(async () => {
    if (!quoteId || !sessionToken || blockReason) return;
    setSendBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await sendEstimateEmail(quoteId, sessionToken, buildPayload());
      if (!res.ok) throw new Error(res.error || "Send failed");
      applyResponse(res);
      if (res.blocked || res.dryRun || res.sendEnabled === false) {
        setStatusMsg("Dry run complete — no email was sent.");
      } else {
        setStatusMsg("Send request completed.");
      }
    } catch (e) {
      const info = friendlyApiErrorMessage(e, "/api/quote-delivery", "save");
      setErrorMsg(info.userMessage);
    } finally {
      setSendBusy(false);
    }
  }, [quoteId, sessionToken, blockReason, buildPayload, applyResponse]);

  if (!open) return null;

  const titleSuffix =
    quoteNumber != null
      ? `${quoteNumber}${revisionLabel ? ` (${revisionLabel})` : ""}`
      : null;

  return (
    <div
      className="ie-modal-overlay ie-email-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ie-email-estimate-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ie-modal-card ie-email-modal-card">
        <div className="ie-email-modal-header">
          <h3 id="ie-email-estimate-title" style={{ margin: 0 }}>
            Email estimate
          </h3>
          {titleSuffix ? <p className="muted small ie-email-modal-subtitle">{titleSuffix}</p> : null}
        </div>

        {blockReason ? (
          <>
            <p className="ie-email-block-reason" role="alert">
              {blockReason}
            </p>
            <p className="muted small">Save the estimate first, then try again.</p>
            <div className="ie-modal-actions ie-email-modal-actions">
              <button type="button" className="btn secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ie-email-form-grid">
              <label className="ie-email-field">
                <span>To</span>
                <input
                  type="email"
                  value={toField}
                  onChange={(e) => setToField(e.target.value)}
                  placeholder="customer@example.com"
                  autoComplete="off"
                />
              </label>
              <label className="ie-email-field">
                <span>CC</span>
                <input
                  type="text"
                  value={ccField}
                  onChange={(e) => setCcField(e.target.value)}
                  placeholder="Optional — comma-separated"
                  autoComplete="off"
                />
              </label>
              <label className="ie-email-field ie-email-field-full">
                <span>Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="ie-email-preview-section">
              <div className="ie-email-preview-head">
                <strong>Preview</strong>
                {lastPreviewAt ? <span className="muted small">Updated {lastPreviewAt}</span> : null}
              </div>
              {htmlPreview ? (
                <iframe
                  title="Customer estimate email preview"
                  className="ie-email-preview-frame"
                  sandbox=""
                  srcDoc={htmlPreview}
                />
              ) : (
                <div className="ie-email-preview-placeholder muted small">
                  Click Preview to load the customer-safe email from the server.
                </div>
              )}
              {textPreview ? (
                <details className="ie-email-text-preview">
                  <summary>Plain text version</summary>
                  <pre>{textPreview}</pre>
                </details>
              ) : null}
            </div>

            {warnings.length > 0 ? (
              <div className="ie-email-warnings" role="status">
                <strong>Warnings</strong>
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {statusMsg ? (
              <p className="ie-email-status-msg" role="status">
                {statusMsg}
              </p>
            ) : null}
            {errorMsg ? (
              <p className="ie-email-error-msg" role="alert">
                {errorMsg}
              </p>
            ) : null}

            <div className="ie-modal-actions ie-email-modal-actions ie-email-modal-actions-row">
              <button
                type="button"
                className="btn secondary"
                disabled={previewBusy || sendBusy}
                onClick={() => void handlePreview()}
              >
                {previewBusy ? "Loading preview…" : "Preview"}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={previewBusy || sendBusy || !toField.trim()}
                onClick={() => void handleSendDryRun()}
              >
                {sendBusy ? "Sending…" : "Send (dry run)"}
              </button>
              <button type="button" className="btn ghost" disabled={previewBusy || sendBusy} onClick={onClose}>
                Cancel
              </button>
            </div>
            <p className="muted small ie-email-dry-run-note">
              Email sending is disabled in this environment. Send runs a server-side dry run only.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
