/**
 * QuoteFilesBlock — read-only file list + download for Quote Library detail modal.
 *
 * Scope: list and download only. No upload, no delete, no AI Takeoff.
 * All file bytes are accessed via signed URLs returned by the backend.
 * storage_path is never requested, rendered, or stored in this component.
 * organizationId is never sent — backend derives it from the Bearer token.
 *
 * Hard boundaries: no quote math, no pricing, no Moraware, no Monday, no SQL.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "./lib/api";
import { formatShortDate } from "./lib/format";

// ── File role display labels ──────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  cabinet_plan:      "Cabinet plan",
  measurement_plan:  "Measurement plan",
  signed_quote:      "Signed quote",
  customer_pdf:      "Customer PDF",
  shop_drawing:      "Shop drawing",
  photo:             "Photo",
  spec:              "Spec sheet",
  contract:          "Contract",
  other:             "Other",
};

function roleLabelFor(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuoteFile {
  id: string;
  originalFilename: string;
  fileRole: string;
  visibility: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  status: string;
  createdAt: string;
}

export interface QuoteFilesBlockProps {
  /** The quote_headers.id to list files for. */
  quoteId: string;
  /** Bearer token for authenticated API calls. */
  token: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuoteFilesBlock({ quoteId, token }: QuoteFilesBlockProps) {
  const [files, setFiles]           = useState<QuoteFile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet(
        `/api/quote-files?quoteId=${encodeURIComponent(quoteId)}`,
        token
      ) as { files?: QuoteFile[] };
      setFiles(Array.isArray(res.files) ? res.files : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load files.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [quoteId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async (fileId: string) => {
    setDownloadingId(fileId);
    setDownloadError(null);
    try {
      const res = await apiPost(
        "/api/quote-files/download-url",
        token,
        { quoteFileId: fileId }
      ) as { signedUrl?: string };
      if (!res.signedUrl) throw new Error("No signed URL returned.");
      window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Download failed.";
      setDownloadError(msg);
    } finally {
      setDownloadingId(null);
    }
  }, [token]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="drawer-block">
      <h3>Quote Files</h3>
      <p className="muted-note section-lede">
        Files attached to this quote from Internal Estimate, AI Takeoff, or future handoff workflows.
      </p>

      {loading ? (
        <p className="muted-note qf-state">Loading files…</p>
      ) : error ? (
        <div className="qf-state qf-error">
          <span>{error}</span>
          <button
            type="button"
            className="btn ghost btn-xs"
            style={{ marginLeft: 10 }}
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : files.length === 0 ? (
        <p className="muted-note qf-state">No files attached to this quote yet.</p>
      ) : (
        <>
          {downloadError ? (
            <p className="qf-download-error">{downloadError}</p>
          ) : null}
          <ul className="qf-file-list">
            {files.map((f) => (
              <li key={f.id} className="qf-file-row">
                <div className="qf-file-main">
                  <span className="qf-filename">{f.originalFilename}</span>
                  <span className="qf-role-pill">{roleLabelFor(f.fileRole)}</span>
                </div>
                <div className="qf-file-meta">
                  <span>{formatBytes(f.fileSizeBytes)}</span>
                  <span className="qf-sep">·</span>
                  <span>{formatShortDate(f.createdAt)}</span>
                  <span className="qf-sep">·</span>
                  <span className="qf-visibility">{f.visibility}</span>
                </div>
                <div className="qf-file-actions">
                  <button
                    type="button"
                    className="btn ghost btn-xs"
                    disabled={downloadingId === f.id}
                    onClick={() => void handleDownload(f.id)}
                  >
                    {downloadingId === f.id ? "Loading…" : "Download"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
