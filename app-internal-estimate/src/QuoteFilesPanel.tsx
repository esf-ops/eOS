/**
 * QuoteFilesPanel — file attachment panel for Internal Estimate.
 *
 * Scope:
 *   - Upload / list / download / archive. No permanent delete, no preview, no AI Takeoff.
 *   - Requires a saved quote (quoteId). Shows a gated message for unsaved estimates.
 *   - All storage ops go through the backend signed-URL endpoints.
 *     The frontend never receives or stores a storage_path.
 *   - organizationId is derived server-side from auth context — never sent by the client.
 *
 * Upload flow (per file — runs sequentially for batch):
 *   1. POST /api/quote-files/upload-intent → { signedUploadUrl, quoteFileId, ... }
 *   2. PUT file bytes directly to signedUploadUrl (Supabase Storage signed URL, no auth header).
 *   3. POST /api/quote-files/confirm-upload → logs 'uploaded' event once bytes are confirmed.
 *   4. Refresh file list via GET /api/quote-files?quoteId=...
 *
 * Download flow:
 *   POST /api/quote-files/download-url → { signedUrl } → open in new tab.
 *
 * Archive flow:
 *   POST /api/quote-files/archive → sets status = 'archived'; removes from normal lists.
 *
 * Drag-and-drop:
 *   - Drop zone wraps the upload area when quoteId is present.
 *   - Dropping files triggers immediate sequential batch upload.
 *   - A document-level dragover/drop listener prevents accidental browser navigation.
 *   - dragCounterRef tracks nested dragenter/dragleave events to avoid flicker.
 *
 * Hard boundaries: no quote math, no pricing, no AI calls, no Moraware, no Monday.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGetJson, apiPostJson } from "@quote-lib/api";
import {
  MAX_FILE_SIZE_BYTES,
  FILE_ROLES,
  FILE_ACCEPT,
  VISIBILITY_OPTIONS,
  formatBytes,
  formatDate,
  roleLabelFor,
  validateFileForUpload,
  buildBatchSummaryMessage,
} from "./lib/quoteFilePanelHelpers";

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

/** Per-file status tracked during a batch upload run. */
type BatchItem = {
  /** Stable local key for React list rendering. */
  localId: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  msg: string | null;
};

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

let _localIdCounter = 0;
function nextLocalId(): string {
  return `batch-${++_localIdCounter}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuoteFilesPanel({ quoteId, getToken }: QuoteFilesPanelProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [files, setFiles]             = useState<QuoteFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError]     = useState<string | null>(null);

  /** Files chosen via browse picker, waiting for the "Upload" button click. */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileRole, setFileRole]         = useState("cabinet_plan");
  const [visibility, setVisibility]     = useState("internal");

  /** Overall upload session status. */
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  /** Overall summary message shown below the upload button. */
  const [uploadMsg, setUploadMsg]       = useState<string | null>(null);
  /** Per-file status rows shown during/after a batch run. */
  const [batchItems, setBatchItems]     = useState<BatchItem[]>([]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [archivingId, setArchivingId]   = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  /** Tracks nested dragenter/dragleave calls to avoid false dragleave events. */
  const dragCounterRef = useRef(0);

  // ── Prevent accidental browser navigation on file drop ────────────────────

  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop     = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

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

  // ── Core batch upload ─────────────────────────────────────────────────────

  /**
   * Upload files sequentially one at a time (backend accepts one per request).
   * Tracks per-file status in batchItems. Continues even if individual files fail.
   * Does NOT modify existing quote pricing or any saved quote fields.
   */
  const uploadFiles = useCallback(async (filesToUpload: File[]) => {
    if (!quoteId || filesToUpload.length === 0) return;

    const token = await getToken();
    if (!token) {
      setUploadStatus("error");
      setUploadMsg("Not signed in. Please sign in and try again.");
      return;
    }

    // Build initial batch items
    const items: BatchItem[] = filesToUpload.map((file) => ({
      localId: nextLocalId(),
      file,
      status: "pending",
      msg: null,
    }));
    setBatchItems(items);
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const label = filesToUpload.length === 1 ? "Uploading file…" : `Uploading ${filesToUpload.length} files…`;
    setUploadStatus("uploading");
    setUploadMsg(label);
    setDownloadError(null);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const file = item.file;

      // Client-side validation (size, name).
      const validationError = validateFileForUpload(file);
      if (validationError) {
        items[i] = { ...item, status: "error", msg: validationError };
        setBatchItems([...items]);
        failCount++;
        continue;
      }
      items[i] = { ...item, status: "uploading", msg: "Uploading…" };
      setBatchItems([...items]);

      try {
        // Step 1 — Backend creates the quote_files row + signed upload URL.
        const intent = await apiPostJson("/api/quote-files/upload-intent", token, {
          quoteId,
          originalFilename: file.name,
          mimeType: file.type || null,
          fileSizeBytes: file.size,
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

        // Step 2 — PUT file bytes directly to the signed storage URL.
        // The token is embedded in the signed URL; no Authorization header is needed here.
        const uploadRes = await fetch(intent.signedUploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!uploadRes.ok) {
          let detail = `HTTP ${uploadRes.status}`;
          try { detail = await uploadRes.text() || detail; } catch { /* ignore */ }
          throw new Error(`Storage upload failed: ${detail.slice(0, 120)}`);
        }

        // Step 3 — Confirm upload: log 'uploaded' event now that bytes are in storage.
        await apiPostJson("/api/quote-files/confirm-upload", token, {
          quoteFileId: intent.quoteFileId,
        });

        items[i] = { ...item, status: "done", msg: "Uploaded" };
        setBatchItems([...items]);
        successCount++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Upload failed.";
        items[i] = { ...item, status: "error", msg };
        setBatchItems([...items]);
        failCount++;
      }
    }

    // Overall summary
    const summary = buildBatchSummaryMessage(filesToUpload.length, successCount, failCount);
    setUploadStatus(summary.status);
    setUploadMsg(summary.msg);

    // Refresh file list if at least one succeeded.
    if (successCount > 0) {
      await loadFiles();
    }
  }, [quoteId, fileRole, visibility, getToken, loadFiles]);

  // ── Browse (file input) ───────────────────────────────────────────────────

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setPendingFiles(selected);
    // Clear previous results when a new selection is made.
    setUploadStatus("idle");
    setUploadMsg(null);
    setBatchItems([]);
  }, []);

  /** Called by the "Upload file(s)" button for browsed files. */
  const handleUpload = useCallback(() => {
    void uploadFiles(pendingFiles);
  }, [pendingFiles, uploadFiles]);

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    if (!quoteId || uploadStatus === "uploading") return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length === 0) return;
    void uploadFiles(dropped);
  }, [quoteId, uploadStatus, uploadFiles]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const isBusy = uploadStatus === "uploading";
  const canUpload = Boolean(quoteId) && pendingFiles.length > 0 && !isBusy;

  const pendingLabel =
    pendingFiles.length === 0
      ? "No file chosen"
      : pendingFiles.length === 1
        ? pendingFiles[0].name
        : `${pendingFiles.length} files selected`;

  const uploadButtonLabel =
    isBusy
      ? (pendingFiles.length > 1 ? "Uploading…" : "Uploading…")
      : pendingFiles.length > 1
        ? `Upload ${pendingFiles.length} files`
        : "Upload file";

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

  // ── Archive ───────────────────────────────────────────────────────────────

  const handleArchive = useCallback(async (fileId: string, filename: string) => {
    const confirmed = window.confirm(
      `Remove this file from the quote?\n\n"${filename}"\n\nThe stored file will be archived, not permanently deleted.`
    );
    if (!confirmed) return;

    setArchivingId(fileId);
    setArchiveError(null);
    const token = await getToken();
    if (!token) {
      setArchiveError("Not signed in.");
      setArchivingId(null);
      return;
    }
    try {
      await apiPostJson("/api/quote-files/archive", token, { quoteFileId: fileId });
      await loadFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Archive failed. Please try again.";
      setArchiveError(msg);
    } finally {
      setArchivingId(null);
    }
  }, [getToken, loadFiles]);

  // ── Render ────────────────────────────────────────────────────────────────

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
          {/* ── Drop zone wrapper ────────────────────────────────────────── */}
          <div
            style={{ position: "relative" }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Drag-over overlay */}
            {isDragOver && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  background: "rgba(37, 99, 235, 0.06)",
                  border: "2px dashed var(--color-primary, #2563eb)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              >
                <span
                  style={{
                    fontWeight: 600,
                    color: "var(--color-primary, #2563eb)",
                    fontSize: "0.95rem",
                    background: "var(--color-bg, #fff)",
                    padding: "6px 14px",
                    borderRadius: 6,
                  }}
                >
                  Drop files to attach to quote
                </span>
              </div>
            )}

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
              {/* Hidden native file input — triggered by button. multiple allows batch selection. */}
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                multiple
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
                    {pendingLabel}
                  </span>
                </div>
                <p className="muted small" style={{ marginTop: 4, marginBottom: 0 }}>
                  Or drag files here to upload
                </p>
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
                onClick={handleUpload}
              >
                {uploadButtonLabel}
              </button>
            </div>

            {/* Overall upload status message */}
            {uploadMsg ? (
              <p
                className="muted small"
                role="status"
                aria-live="polite"
                style={{
                  marginBottom: batchItems.length > 0 ? 6 : 10,
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

            {/* Per-file status during / after batch upload */}
            {batchItems.length > 0 && (
              <div
                role="list"
                aria-label="Upload status per file"
                style={{ marginBottom: 12, fontSize: "0.83rem" }}
              >
                {batchItems.map((item) => (
                  <div
                    key={item.localId}
                    role="listitem"
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      padding: "2px 0",
                      color:
                        item.status === "error"
                          ? "var(--color-error, #b91c1c)"
                          : item.status === "done"
                            ? "var(--color-success, #16a34a)"
                            : undefined,
                    }}
                  >
                    <span aria-hidden="true">
                      {item.status === "done"      ? "✓"
                       : item.status === "error"   ? "✗"
                       : item.status === "uploading" ? "⏳"
                       : "·"}
                    </span>
                    <span style={{ wordBreak: "break-all", flex: 1 }}>
                      {item.file.name}
                    </span>
                    {item.msg ? (
                      <span className="muted small" style={{ whiteSpace: "nowrap" }}>
                        {item.msg}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

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
              {archiveError ? (
                <p className="muted small" style={{ color: "var(--color-error, #b91c1c)", marginBottom: 8 }}>
                  ✗ {archiveError}
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
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          disabled={downloadingId === f.id || archivingId === f.id}
                          onClick={() => void handleDownload(f.id)}
                        >
                          {downloadingId === f.id ? "Loading…" : "Download"}
                        </button>
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          disabled={archivingId === f.id || downloadingId === f.id}
                          onClick={() => void handleArchive(f.id, f.originalFilename)}
                          title="Archive this file (not permanently deleted)"
                          style={{ color: "var(--color-error, #b91c1c)" }}
                        >
                          {archivingId === f.id ? "Removing…" : "Remove"}
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
