/**
 * QuoteFilesPanel — v1 file attachment panel for Internal Estimate.
 *
 * Scope:
 *   - Upload / list / download only. No delete, no preview, no AI Takeoff.
 *   - Requires a saved quote (quoteId). Shows a gated message for unsaved estimates.
 *   - All storage ops go through the backend signed-URL endpoints.
 *     The frontend never receives or stores a storage_path.
 *   - organizationId is derived server-side from auth context — never sent by the client.
 *
 * Upload flow:
 *   1. POST /api/quote-files/upload-intent → { signedUploadUrl, quoteFileId, ... }
 *   2. PUT file bytes directly to signedUploadUrl (Supabase Storage signed URL, no auth header).
 *   3. Refresh file list via GET /api/quote-files?quoteId=...
 *
 * Download flow:
 *   POST /api/quote-files/download-url → { signedUrl } → open in new tab.
 *
 * Hard boundaries: no quote math, no pricing, no AI calls, no Moraware, no Monday.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGetJson, apiPostJson } from "@quote-lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB — mirrors backend

const FILE_ROLES: { value: string; label: string }[] = [
  { value: "cabinet_plan",      label: "Cabinet plan" },
  { value: "measurement_plan",  label: "Measurement plan" },
  { value: "signed_quote",      label: "Signed quote" },
  { value: "customer_pdf",      label: "Customer PDF" },
  { value: "shop_drawing",      label: "Shop drawing" },
  { value: "photo",             label: "Photo" },
  { value: "spec",              label: "Spec sheet" },
  { value: "contract",          label: "Contract" },
  { value: "other",             label: "Other" },
];

const VISIBILITY_OPTIONS: { value: string; label: string }[] = [
  { value: "internal", label: "Internal only" },
  { value: "partner",  label: "Partner-visible" },
  { value: "customer", label: "Customer-visible" },
];

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

type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface QuoteFilesPanelProps {
  /** UUID of the saved quote_headers row. Null = estimate not yet saved. */
  quoteId: string | null;
  /** Returns a valid Bearer token for authenticated API calls. */
  getToken: () => Promise<string | null>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function roleLabelFor(role: string): string {
  return FILE_ROLES.find((r) => r.value === role)?.label ?? role;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuoteFilesPanel({ quoteId, getToken }: QuoteFilesPanelProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [files, setFiles]           = useState<QuoteFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError]   = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileRole, setFileRole]     = useState("cabinet_plan");
  const [visibility, setVisibility] = useState("internal");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadMsg, setUploadMsg]   = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load file list ────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    if (!quoteId) return;
    const token = await getToken();
    if (!token) {
      setListError("Not signed in — sign in to view files.");
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await apiGetJson(
        `/api/quote-files?quoteId=${encodeURIComponent(quoteId)}`,
        token
      ) as { files?: QuoteFile[] };
      setFiles(Array.isArray(res.files) ? res.files : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load files.";
      setListError(msg);
    } finally {
      setListLoading(false);
    }
  }, [quoteId, getToken]);

  useEffect(() => {
    if (quoteId) {
      void loadFiles();
    } else {
      setFiles([]);
      setListError(null);
    }
  }, [quoteId, loadFiles]);

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    // Reset previous upload status when a new file is chosen.
    setUploadStatus("idle");
    setUploadMsg(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!quoteId || !selectedFile) return;

    // Client-side size guard (backend enforces too, but fast feedback is better UX).
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setUploadStatus("error");
      setUploadMsg(`File is too large (${formatBytes(selectedFile.size)}). Maximum is 50 MB.`);
      return;
    }

    const token = await getToken();
    if (!token) {
      setUploadStatus("error");
      setUploadMsg("Not signed in. Please sign in and try again.");
      return;
    }

    setUploadStatus("uploading");
    setUploadMsg("Creating upload intent…");
    setDownloadError(null);

    try {
      // Step 1 — Backend creates the quote_files row + signed upload URL.
      const intent = await apiPostJson("/api/quote-files/upload-intent", token, {
        quoteId,
        originalFilename: selectedFile.name,
        mimeType: selectedFile.type || null,
        fileSizeBytes: selectedFile.size,
        fileRole,
        visibility,
        // organizationId intentionally omitted — backend derives from auth session.
      }) as {
        ok: boolean;
        quoteFileId: string;
        signedUploadUrl: string;
        expiresAt: string;
        safeFilename: string;
      };

      setUploadMsg("Uploading file to storage…");

      // Step 2 — PUT file bytes directly to the signed storage URL.
      // The token is embedded in the signed URL; no Authorization header is needed here.
      const uploadRes = await fetch(intent.signedUploadUrl, {
        method: "PUT",
        headers: { "content-type": selectedFile.type || "application/octet-stream" },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        let detail = `HTTP ${uploadRes.status}`;
        try { detail = await uploadRes.text() || detail; } catch { /* ignore */ }
        throw new Error(`Storage upload failed: ${detail.slice(0, 120)}`);
      }

      setUploadStatus("success");
      setUploadMsg("File uploaded successfully.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Step 3 — Refresh file list.
      await loadFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed. Please try again.";
      setUploadStatus("error");
      setUploadMsg(msg);
    }
  }, [quoteId, selectedFile, fileRole, visibility, getToken, loadFiles]);

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async (fileId: string) => {
    setDownloadingId(fileId);
    setDownloadError(null);
    const token = await getToken();
    if (!token) {
      setDownloadError("Not signed in.");
      setDownloadingId(null);
      return;
    }
    try {
      const res = await apiPostJson("/api/quote-files/download-url", token, {
        quoteFileId: fileId,
      }) as { signedUrl: string };
      window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Download failed.";
      setDownloadError(msg);
    } finally {
      setDownloadingId(null);
    }
  }, [getToken]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy = uploadStatus === "uploading";
  const canUpload = Boolean(quoteId) && Boolean(selectedFile) && !isBusy;

  return (
    <section className="card" id="sec-quote-files" aria-labelledby="quote-files-heading">
      <div className="ie-section-head">
        <h2 className="ie-section-title" id="quote-files-heading">Quote Files</h2>
        <p className="ie-section-meta">
          Upload cabinet plans, measurement plans, photos, specs, signed approvals, or other files connected to this estimate.
        </p>
      </div>

      {/* ── Gate: not saved yet ─────────────────────────────────────────── */}
      {!quoteId ? (
        <p className="muted small" style={{ marginTop: 8 }}>
          Save this estimate before uploading files.
        </p>
      ) : (
        <>
          {/* ── Upload form ──────────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 8,
              alignItems: "end",
              marginBottom: 12,
            }}
          >
            {/* Hidden native file input — triggered by button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*,.doc,.docx,.txt"
              style={{ display: "none" }}
              onChange={handleFileChange}
              disabled={isBusy}
            />

            {/* File picker button */}
            <div>
              <label className="muted small" style={{ display: "block", marginBottom: 4 }}>
                File
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </button>
                <span className="muted small" style={{ wordBreak: "break-all" }}>
                  {selectedFile ? selectedFile.name : "No file chosen"}
                </span>
              </div>
            </div>

            {/* Role selector */}
            <div>
              <label className="muted small" style={{ display: "block", marginBottom: 4 }}>
                File role
              </label>
              <select
                value={fileRole}
                onChange={(e) => setFileRole(e.target.value)}
                disabled={isBusy}
                style={{ minWidth: 150 }}
              >
                {FILE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Visibility selector */}
            <div>
              <label className="muted small" style={{ display: "block", marginBottom: 4 }}>
                Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                disabled={isBusy}
              >
                {VISIBILITY_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Upload button */}
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="btn primary btn-sm"
              disabled={!canUpload}
              onClick={() => void handleUpload()}
            >
              {isBusy ? "Uploading…" : "Upload file"}
            </button>
          </div>

          {/* Upload status message */}
          {uploadMsg ? (
            <p
              className="muted small"
              role="status"
              aria-live="polite"
              style={{
                marginBottom: 10,
                color:
                  uploadStatus === "error"   ? "var(--color-error, #b91c1c)" :
                  uploadStatus === "success" ? "var(--color-success, #16a34a)" :
                  undefined,
              }}
            >
              {uploadStatus === "success" ? "✓ " : uploadStatus === "error" ? "✗ " : ""}
              {uploadMsg}
            </p>
          ) : null}

          {/* ── File list ────────────────────────────────────────────────── */}
          {listLoading ? (
            <p className="muted small">Loading files…</p>
          ) : listError ? (
            <p className="muted small" style={{ color: "var(--color-error, #b91c1c)" }}>
              {listError}
              <button
                type="button"
                className="btn secondary btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => void loadFiles()}
              >
                Retry
              </button>
            </p>
          ) : files.length === 0 ? (
            <p className="muted small">No files attached yet.</p>
          ) : (
            <div style={{ marginTop: 4 }}>
              {downloadError ? (
                <p className="muted small" style={{ color: "var(--color-error, #b91c1c)", marginBottom: 8 }}>
                  ✗ {downloadError}
                </p>
              ) : null}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.85rem",
                }}
              >
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                    <th style={{ padding: "4px 8px 4px 0", fontWeight: 600 }}>File</th>
                    <th style={{ padding: "4px 8px", fontWeight: 600 }}>Role</th>
                    <th style={{ padding: "4px 8px", fontWeight: 600 }}>Size</th>
                    <th style={{ padding: "4px 8px", fontWeight: 600 }}>Added</th>
                    <th style={{ padding: "4px 8px", fontWeight: 600 }}>Visibility</th>
                    <th style={{ padding: "4px 8px", fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr
                      key={f.id}
                      style={{ borderBottom: "1px solid var(--color-border, #f3f4f6)" }}
                    >
                      <td style={{ padding: "6px 8px 6px 0", wordBreak: "break-all", maxWidth: 220 }}>
                        {f.originalFilename}
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {roleLabelFor(f.fileRole)}
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {formatBytes(f.fileSizeBytes)}
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {formatDate(f.createdAt)}
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <span className="muted small">{f.visibility}</span>
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          disabled={downloadingId === f.id}
                          onClick={() => void handleDownload(f.id)}
                        >
                          {downloadingId === f.id ? "Loading…" : "Download"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
