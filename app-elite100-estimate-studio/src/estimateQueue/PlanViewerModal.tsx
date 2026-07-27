import React, { useEffect, useRef, useState } from "react";
import { ApiError, isTransientHttpError } from "../lib/api";

export type PlanViewerSourceContext =
  | "shared-inbox"
  | "linked-estimate"
  | "ai-takeoff"
  | string;

export type PlanViewerModalProps = {
  open: boolean;
  authToken: string | null;
  title?: string;
  filename?: string | null;
  fileTypeLabel?: string | null;
  sizeLabel?: string | null;
  sourceContext?: PlanViewerSourceContext;
  /** Fetches authenticated blob — must not return remote Graph/storage URLs. */
  loadContent: () => Promise<{ blob: Blob; contentType: string; filename?: string | null }>;
  onClose: () => void;
};

function formatSource(ctx?: string) {
  if (ctx === "shared-inbox") return "Shared Inbox";
  if (ctx === "linked-estimate") return "Linked estimate";
  if (ctx === "ai-takeoff") return "AI Takeoff source";
  return ctx || "Plan";
}

/**
 * Secure Studio plan viewer — Blob URL only; revoked on close/replace/auth failure.
 * Read-only: viewing never imports, starts Takeoff, or mutates estimates.
 */
export default function PlanViewerModal({
  open,
  authToken,
  title = "Plan viewer",
  filename,
  fileTypeLabel,
  sizeLabel,
  sourceContext,
  loadContent,
  onClose
}: PlanViewerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transient, setTransient] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function revokeCurrent() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);
  }

  async function runLoad() {
    if (!authToken) {
      revokeCurrent();
      setError("You do not have access to this plan.");
      setTransient(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTransient(false);
    revokeCurrent();
    try {
      const result = await loadContent();
      const url = URL.createObjectURL(result.blob);
      objectUrlRef.current = url;
      setObjectUrl(url);
      setContentType(result.contentType || result.blob.type || null);
      setResolvedName(result.filename || filename || null);
    } catch (e) {
      revokeCurrent();
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setError("You do not have access to this plan.");
        setTransient(false);
      } else if (isTransientHttpError(e)) {
        setError(
          e instanceof ApiError
            ? e.message
            : "The attachment is known, but its contents are temporarily unavailable."
        );
        setTransient(true);
      } else if (e instanceof ApiError) {
        setError(e.message || "Unable to load plan.");
        setTransient(false);
      } else {
        setError("Unable to load plan.");
        setTransient(false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      revokeCurrent();
      setError(null);
      setLoading(false);
      setContentType(null);
      return;
    }
    void runLoad();
    return () => {
      revokeCurrent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
  }, [open, authToken]);

  if (!open) return null;

  const isPdf = (contentType || "").includes("pdf");
  const isImage = (contentType || "").startsWith("image/");
  const displayName = resolvedName || filename || "Plan";

  return (
    <div className="si-plan-viewer-overlay" data-testid="plan-viewer-modal" role="dialog" aria-modal="true">
      <div className="si-plan-viewer">
        <header className="si-plan-viewer-header">
          <div>
            <h2 className="si-plan-viewer-title">{title}</h2>
            <p className="eq-muted si-plan-viewer-meta">
              {displayName}
              {fileTypeLabel ? ` · ${fileTypeLabel}` : ""}
              {sizeLabel ? ` · ${sizeLabel}` : ""}
              {sourceContext ? ` · ${formatSource(sourceContext)}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="plan-viewer-close"
            onClick={() => {
              revokeCurrent();
              onClose();
            }}
          >
            Close
          </button>
        </header>

        {loading ? (
          <div className="eq-state" data-testid="plan-viewer-loading">
            Loading plan…
          </div>
        ) : null}

        {error ? (
          <div
            className={`eq-state ${transient ? "eq-state--warn" : "eq-state--error"}`}
            data-testid="plan-viewer-error"
            role="alert"
          >
            {error}
            {transient ? (
              <div className="eq-action-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="plan-viewer-retry"
                  onClick={() => void runLoad()}
                >
                  Retry viewing plan
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && objectUrl && isPdf ? (
          <object
            title={displayName}
            className="si-plan-viewer-frame"
            data-testid="plan-viewer-pdf"
            data={objectUrl}
            type="application/pdf"
          >
            <iframe title={displayName} src={objectUrl} className="si-plan-viewer-frame" />
          </object>
        ) : null}

        {!loading && !error && objectUrl && isImage ? (
          <div className="si-plan-viewer-image-wrap" data-testid="plan-viewer-image">
            <img src={objectUrl} alt={displayName} />
          </div>
        ) : null}

        {!loading && !error && objectUrl && !isPdf && !isImage ? (
          <div className="eq-state eq-state--warn">This file type cannot be previewed securely.</div>
        ) : null}
      </div>
    </div>
  );
}
