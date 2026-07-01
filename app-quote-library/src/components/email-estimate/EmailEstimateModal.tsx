import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  describeQuoteDeliveryPdfWarning,
  describeQuoteDeliverySendMode,
  quoteDeliverySendButtonLabel,
  quoteDeliverySendSuccessMessage
} from "@quote-lib/quoteDeliveryEmailUi";
import { ApiError } from "../../lib/api";
import {
  buildRecipientsPayload,
  previewEstimateEmail,
  sendEstimateEmail,
  type QuoteDeliveryResponse
} from "../../lib/quoteDeliveryApi";

export type EmailEstimateModalProps = {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  sessionToken: string;
  defaultToEmail: string;
  defaultCcEmail: string;
  defaultSubject: string;
  quoteNumber: string | null;
  revisionLabel: string | null;
};

function formatApiError(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Request failed (${e.status})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function EmailEstimateModal(props: EmailEstimateModalProps) {
  const {
    open,
    onClose,
    quoteId,
    sessionToken,
    defaultToEmail,
    defaultCcEmail,
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
  const [deliveryMeta, setDeliveryMeta] = useState<QuoteDeliveryResponse | null>(null);
  const autoPreviewRanRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setToField(defaultToEmail.trim());
    setCcField(defaultCcEmail.trim());
    setSubject(defaultSubject.trim());
    setHtmlPreview(null);
    setTextPreview(null);
    setWarnings([]);
    setStatusMsg(null);
    setErrorMsg(null);
    setLastPreviewAt(null);
    setDeliveryMeta(null);
    autoPreviewRanRef.current = false;
  }, [open, defaultToEmail, defaultCcEmail, defaultSubject]);

  const applyResponse = useCallback((res: QuoteDeliveryResponse) => {
    setDeliveryMeta(res);
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

  const runPreview = useCallback(async () => {
    if (!quoteId || !sessionToken) return false;
    setPreviewBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await previewEstimateEmail(quoteId, sessionToken, buildPayload());
      if (!res.ok) throw new Error(res.error || "Preview failed");
      applyResponse(res);
      setLastPreviewAt(new Date().toLocaleString());
      setStatusMsg("Preview loaded from server.");
      return true;
    } catch (e) {
      setErrorMsg(formatApiError(e));
      return false;
    } finally {
      setPreviewBusy(false);
    }
  }, [quoteId, sessionToken, buildPayload, applyResponse]);

  useEffect(() => {
    if (!open || !quoteId || !sessionToken) return;
    if (autoPreviewRanRef.current) return;
    autoPreviewRanRef.current = true;
    void runPreview();
  }, [open, quoteId, sessionToken, runPreview]);

  const handlePreview = useCallback(async () => {
    await runPreview();
  }, [runPreview]);

  const handleSend = useCallback(async () => {
    if (!quoteId || !sessionToken) return;
    setSendBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await sendEstimateEmail(quoteId, sessionToken, buildPayload());
      if (!res.ok) throw new Error(res.error || "Send failed");
      applyResponse(res);
      setStatusMsg(quoteDeliverySendSuccessMessage(res));
    } catch (e) {
      setErrorMsg(formatApiError(e));
    } finally {
      setSendBusy(false);
    }
  }, [quoteId, sessionToken, buildPayload, applyResponse]);

  if (!open) return null;

  const titleSuffix =
    quoteNumber != null
      ? `${quoteNumber}${revisionLabel ? ` (${revisionLabel})` : ""}`
      : null;

  const sendModeMessage = describeQuoteDeliverySendMode(deliveryMeta);
  const pdfWarning = describeQuoteDeliveryPdfWarning(deliveryMeta);

  return (
    <div
      className="ql-email-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ql-email-estimate-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ql-email-modal-card">
        <div className="ql-email-modal-header">
          <h3 id="ql-email-estimate-title" style={{ margin: 0 }}>
            Email estimate
          </h3>
          {titleSuffix ? <p className="muted small ql-email-modal-subtitle">{titleSuffix}</p> : null}
        </div>

        <div className="ql-email-delivery-status" role="status">
          <strong>Delivery status</strong>
          <p className="muted small">{sendModeMessage}</p>
          {pdfWarning ? <p className="muted small ql-email-pdf-warning">{pdfWarning}</p> : null}
        </div>

        <div className="ql-email-form-grid">
          <label className="ql-email-field">
            <span>To</span>
            <input
              type="email"
              value={toField}
              onChange={(e) => setToField(e.target.value)}
              placeholder="customer@example.com"
              autoComplete="off"
            />
          </label>
          <label className="ql-email-field">
            <span>CC</span>
            <input
              type="text"
              value={ccField}
              onChange={(e) => setCcField(e.target.value)}
              placeholder="Optional — comma-separated"
              autoComplete="off"
            />
          </label>
          <label className="ql-email-field ql-email-field-full">
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

        <div className="ql-email-preview-section">
          <div className="ql-email-preview-head">
            <strong>Preview</strong>
            {lastPreviewAt ? <span className="muted small">Updated {lastPreviewAt}</span> : null}
          </div>
          {htmlPreview ? (
            <iframe
              title="Customer estimate email preview"
              className="ql-email-preview-frame"
              sandbox=""
              srcDoc={htmlPreview}
            />
          ) : (
            <div className="ql-email-preview-placeholder muted small">
              Click Preview to load the customer-safe email from the server.
            </div>
          )}
          {textPreview ? (
            <details className="ql-email-text-preview">
              <summary>Plain text version</summary>
              <pre>{textPreview}</pre>
            </details>
          ) : null}
        </div>

        {warnings.length > 0 ? (
          <div className="ql-email-warnings" role="status">
            <strong>Warnings</strong>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {statusMsg ? (
          <p className="ql-email-status-msg" role="status">
            {statusMsg}
          </p>
        ) : null}
        {errorMsg ? (
          <p className="ql-email-error-msg" role="alert">
            {errorMsg}
          </p>
        ) : null}

        <div className="ql-email-modal-actions">
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
            onClick={() => void handleSend()}
          >
            {quoteDeliverySendButtonLabel(deliveryMeta, sendBusy)}
          </button>
          <button type="button" className="btn ghost" disabled={previewBusy || sendBusy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
