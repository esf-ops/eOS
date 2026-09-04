/**
 * TakeoffPlanPreviewPanel — inline plan preview beside the review workbench (Phase D).
 *
 * Uses POST /api/quote-files/download-url (same secure flow as Open / Download).
 * storage_path is never exposed to the browser.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { labApiPost, LabApiError } from "../lib/api";
import {
  getCachedPlanSignedUrl,
  setCachedPlanSignedUrl
} from "../lib/planSignedUrlCache.mjs";

export interface PlanPreviewFileMeta {
  quoteFileId: string;
  originalFilename: string;
  mimeType: string | null;
  status: string;
}

export interface TakeoffPlanPreviewPanelProps {
  token: string | null;
  file: PlanPreviewFileMeta | null;
  /** Bust signed URL fetch when workspace or file changes. */
  refreshKey?: string | number | null;
  /**
   * Optional 1-based PDF page hint when piece metadata includes sourcePages.
   * Appended as `#page=N` for browsers that honor it; ignored for images.
   */
  focusPage?: number | null;
}

type PreviewMode = "image" | "pdf" | "external";

function resolvePreviewMode(file: PlanPreviewFileMeta): PreviewMode {
  const mime = String(file.mimeType ?? "").toLowerCase();
  const name = file.originalFilename.toLowerCase();
  if (mime.startsWith("image/") || name.endsWith(".svg")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "external";
}

export default function TakeoffPlanPreviewPanel({
  token,
  file,
  refreshKey,
  focusPage = null,
}: TakeoffPlanPreviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const previewMode = useMemo(
    () => (file ? resolvePreviewMode(file) : null),
    [file]
  );

  const pdfPreviewUrl = useMemo(() => {
    if (!signedUrl || previewMode !== "pdf") return signedUrl;
    const page = Number(focusPage);
    if (!Number.isFinite(page) || page < 1) return signedUrl;
    const base = signedUrl.split("#")[0];
    return `${base}#page=${Math.floor(page)}`;
  }, [signedUrl, previewMode, focusPage]);

  useEffect(() => {
    if (!file || !token || file.status === "archived") {
      setSignedUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Local review harness — deterministic SVG plan, no download-url API.
    if (file.quoteFileId === "local-review-plan" || token === "local-review-token") {
      const svg = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
          <rect width="640" height="480" fill="#f4f7f5"/>
          <rect x="40" y="40" width="360" height="280" fill="none" stroke="#1a4d38" stroke-width="3"/>
          <text x="60" y="80" font-family="IBM Plex Sans,sans-serif" font-size="18" fill="#14241c">Munsterman Plan</text>
          <text x="60" y="110" font-family="IBM Plex Sans,sans-serif" font-size="13" fill="#5a6b63">Kitchen U-shape · Bathroom vanity</text>
          <rect x="80" y="140" width="120" height="40" fill="#d7e2dc"/>
          <rect x="80" y="200" width="200" height="36" fill="#d7e2dc"/>
          <rect x="280" y="140" width="80" height="160" fill="#c5d6cc"/>
          <rect x="420" y="80" width="160" height="70" fill="#e8f0eb" stroke="#1a4d38"/>
          <text x="440" y="120" font-family="IBM Plex Sans,sans-serif" font-size="12" fill="#14241c">Vanity 37×22.5</text>
        </svg>`
      );
      setSignedUrl(`data:image/svg+xml;charset=utf-8,${svg}`);
      setLoading(false);
      setError(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);
    setSignedUrl(null);

    const cached = getCachedPlanSignedUrl(file.quoteFileId);
    if (cached) {
      setSignedUrl(cached);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    void (async () => {
      try {
        const res = (await labApiPost("/api/quote-files/download-url", token, {
          quoteFileId: file.quoteFileId
        })) as { signedUrl: string; expiresAt?: string };
        if (alive) {
          setCachedPlanSignedUrl(file.quoteFileId, {
            signedUrl: res.signedUrl,
            expiresAt: res.expiresAt || null
          });
          setSignedUrl(res.signedUrl);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          setError(
            e instanceof LabApiError ? e.message : "Could not load plan preview."
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [file?.quoteFileId, file?.status, token, refreshKey]);

  const handleOpenPlan = useCallback(async () => {
    if (!file || !token) return;
    setOpening(true);
    setError(null);
    try {
      let url = signedUrl || getCachedPlanSignedUrl(file.quoteFileId);
      if (!url) {
        const res = (await labApiPost("/api/quote-files/download-url", token, {
          quoteFileId: file.quoteFileId
        })) as { signedUrl: string; expiresAt?: string };
        url = res.signedUrl;
        setCachedPlanSignedUrl(file.quoteFileId, {
          signedUrl: res.signedUrl,
          expiresAt: res.expiresAt || null
        });
        setSignedUrl(url);
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof LabApiError ? e.message : "Could not open plan.");
    } finally {
      setOpening(false);
    }
  }, [file, token, signedUrl]);

  if (!file) {
    return (
      <section className="plan-preview-panel lab-card" aria-label="Plan preview">
        <header className="plan-preview-header">
          <h2 className="plan-preview-title">Plan preview</h2>
        </header>
        <p className="plan-preview-state plan-preview-state--empty" role="status">
          No plan file in this workspace.
        </p>
      </section>
    );
  }

  if (file.status === "archived") {
    return (
      <section className="plan-preview-panel lab-card" aria-label="Plan preview">
        <header className="plan-preview-header">
          <h2 className="plan-preview-title">Plan preview</h2>
          <p className="plan-preview-filename">{file.originalFilename}</p>
        </header>
        <p className="plan-preview-state plan-preview-state--empty" role="status">
          Source plan archived — preview unavailable. Open a saved takeoff run from history or upload a new plan.
        </p>
      </section>
    );
  }

  return (
    <section className="plan-preview-panel lab-card" aria-label="Plan preview">
      <header className="plan-preview-header plan-preview-header--toolbar">
        <div>
          <h2 className="plan-preview-title">Plan preview</h2>
          <p className="plan-preview-filename">{file.originalFilename}</p>
        </div>
        <button
          type="button"
          className="btn secondary btn-sm plan-preview-open-btn"
          disabled={opening || !token}
          onClick={() => void handleOpenPlan()}
        >
          {opening ? "Opening…" : "Open plan"}
        </button>
      </header>

      {loading ? (
        <p className="plan-preview-state" role="status" aria-live="polite">
          Loading preview…
        </p>
      ) : null}

      {!loading && error ? (
        <div className="plan-preview-unavailable" role="alert">
          <p className="plan-preview-unavailable-text">{error}</p>
          <button
            type="button"
            className="plan-btn plan-btn--secondary plan-preview-open-btn"
            disabled={opening || !token}
            onClick={() => void handleOpenPlan()}
          >
            {opening ? "Opening…" : "Open plan"}
          </button>
        </div>
      ) : null}

      {!loading && !error && signedUrl && previewMode === "image" ? (
        <div className="plan-preview-frame plan-preview-frame--image">
          <img
            src={signedUrl}
            alt={`Plan: ${file.originalFilename}`}
            className="plan-preview-img"
          />
        </div>
      ) : null}

      {!loading && !error && signedUrl && previewMode === "pdf" ? (
        <div className="plan-preview-frame plan-preview-frame--pdf">
          <object
            data={pdfPreviewUrl || signedUrl}
            type="application/pdf"
            className="plan-preview-object"
            aria-label={`Plan PDF: ${file.originalFilename}`}
          >
            <iframe
              src={pdfPreviewUrl || signedUrl}
              title={`Plan PDF: ${file.originalFilename}`}
              className="plan-preview-iframe"
            />
          </object>
          <p className="plan-preview-hint" role="note">
            PDF embedding varies by browser. Use <strong>Open plan</strong> if the preview is blank.
          </p>
        </div>
      ) : null}

      {!loading && !error && previewMode === "external" ? (
        <div className="plan-preview-unavailable" role="status">
          <span className="plan-preview-placeholder-icon" aria-hidden>📄</span>
          <p className="plan-preview-unavailable-text">
            Inline preview is not available for this file type.
            {signedUrl ? " Open the plan in a new tab to review it beside your measurements." : ""}
          </p>
        </div>
      ) : null}

      <div className="plan-preview-actions">
        <button
          type="button"
          className="plan-btn plan-btn--secondary plan-preview-open-btn"
          disabled={opening || loading || !token}
          onClick={() => void handleOpenPlan()}
        >
          {opening ? "Opening…" : "Open plan"}
        </button>
      </div>
    </section>
  );
}
