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
 *   - Drop zone is a distinct visual target. Dropping files triggers immediate sequential upload.
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
  mimeTypeToFileTag,
  mimeTypeToCategory,
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

// ── Local helpers ─────────────────────────────────────────────────────────────

let _localIdCounter = 0;
function nextLocalId(): string {
  return `batch-${++_localIdCounter}`;
}

/** Max pending files to show by name before collapsing to "+N more". */
const PENDING_SHOW_MAX = 5;

// ── Inline SVG upload icon ────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M10 13V4M10 4L7 7M10 4L13 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
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
  /** Overall summary message shown in the batch panel. */
  const [uploadMsg, setUploadMsg]       = useState<string | null>(null);
  /** Per-file status rows shown during/after a batch run. */
  const [batchItems, setBatchItems]     = useState<BatchItem[]>([]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [archivingId, setArchivingId]   = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
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

  /** Clear pending file selection without uploading. */
  const clearPending = useCallback(() => {
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  // ── Derived state ─────────────────────────────────────────────────────────

  const isBusy     = uploadStatus === "uploading";
  const canUpload  = Boolean(quoteId) && pendingFiles.length > 0 && !isBusy;
  const hasBatch   = uploadMsg !== null || batchItems.length > 0;

  const uploadButtonLabel = isBusy
    ? "Uploading…"
    : pendingFiles.length > 1
      ? `Upload ${pendingFiles.length} files`
      : "Upload file";

  // For the pending list: show first PENDING_SHOW_MAX by name, then "+N more"
  const shownPending  = pendingFiles.slice(0, PENDING_SHOW_MAX);
  const hiddenPending = pendingFiles.length - shownPending.length;

  // Drop zone CSS class
  const dropZoneClass = [
    "qfp-drop-zone",
    isDragOver ? "is-drag-over" : "",
    isBusy     ? "is-busy"     : "",
  ].filter(Boolean).join(" ");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="card" id="sec-quote-files" aria-labelledby="quote-files-heading">
      <div className="ie-section-head">
        <h2 className="ie-section-title" id="quote-files-heading">Quote Files</h2>
        <p className="ie-section-meta">
          Upload cabinet plans, measurement plans, specs, photos, signed approvals, or supporting documents.
          <span className="qfp-accept-hint">PDF, images, Word, and text files · up to 50 MB each</span>
        </p>
      </div>

      {/* ── Gate: not saved yet ─────────────────────────────────────────── */}
      {!quoteId ? (
        <div className="qfp-unsaved-gate" role="note">
          <span className="qfp-unsaved-icon" aria-hidden="true">📎</span>
          <span>Save this estimate before uploading files.</span>
        </div>
      ) : (
        <>
          {/* ── Upload settings row (role + visibility) ──────────────────── */}
          <div className="qfp-settings-row">
            <span className="qfp-settings-label">Default upload settings</span>
            <div className="qfp-settings-controls">
              <div className="qfp-settings-field">
                <label htmlFor="qfp-role-select" className="qfp-field-label">File role</label>
                <select
                  id="qfp-role-select"
                  value={fileRole}
                  onChange={(e) => setFileRole(e.target.value)}
                  disabled={isBusy}
                >
                  {FILE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="qfp-settings-field">
                <label htmlFor="qfp-vis-select" className="qfp-field-label">Visibility</label>
                <select
                  id="qfp-vis-select"
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
          </div>

          {/* Hidden native file input — triggered programmatically */}
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
            disabled={isBusy}
          />

          {/* ── Drop zone ────────────────────────────────────────────────── */}
          <div
            className={dropZoneClass}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="File drop zone"
          >
            {isDragOver ? (
              /* Drag-over state */
              <div className="qfp-dz-drag-content" aria-live="polite">
                <div className="qfp-dz-drag-arrow" aria-hidden="true">↓</div>
                <p className="qfp-dz-drag-text">Drop files to attach to quote</p>
              </div>
            ) : pendingFiles.length > 0 ? (
              /* Files selected via browse — awaiting upload click */
              <div className="qfp-dz-pending">
                <p className="qfp-dz-pending-header">
                  {pendingFiles.length === 1
                    ? "1 file selected"
                    : `${pendingFiles.length} files selected`}
                </p>
                <ul className="qfp-dz-pending-list" aria-label="Selected files">
                  {shownPending.map((f, i) => (
                    <li key={i} className="qfp-dz-pending-item">
                      <span className="qfp-dz-pending-item-name" title={f.name}>{f.name}</span>
                      <span className="qfp-dz-pending-item-size">{formatBytes(f.size)}</span>
                    </li>
                  ))}
                </ul>
                {hiddenPending > 0 && (
                  <p className="qfp-dz-pending-more">+{hiddenPending} more file{hiddenPending !== 1 ? "s" : ""}</p>
                )}
                <div className="qfp-dz-pending-actions">
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    disabled={!canUpload}
                    onClick={handleUpload}
                  >
                    {uploadButtonLabel}
                  </button>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    disabled={isBusy}
                    onClick={clearPending}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              /* Idle state */
              <>
                <div className="qfp-dz-icon">
                  <UploadIcon />
                </div>
                <p className="qfp-dz-main">Drag files here</p>
                <p className="qfp-dz-sub">
                  or{" "}
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    disabled={isBusy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose files
                  </button>
                </p>
                <p className="qfp-dz-hint">PDF, images, Word, and text files · up to 50 MB each</p>
              </>
            )}
          </div>

          {/* ── Batch upload status panel ─────────────────────────────────── */}
          {hasBatch && (
            <div className="qfp-batch-panel" role="status" aria-live="polite">
              {uploadMsg && (
                <p className={[
                  "qfp-batch-summary",
                  uploadStatus === "success" ? "is-success" : "",
                  uploadStatus === "error"   ? "is-error"   : "",
                ].filter(Boolean).join(" ")}>
                  {uploadStatus === "success" ? "✓ " : uploadStatus === "error" ? "✗ " : ""}
                  {uploadMsg}
                </p>
              )}
              {batchItems.length > 0 && (
                <ul className="qfp-batch-list" aria-label="Upload status per file">
                  {batchItems.map((item) => (
                    <li key={item.localId} className={`qfp-batch-item is-${item.status}`}>
                      <span className="qfp-batch-icon" aria-hidden="true">
                        {item.status === "done"      ? "✓"
                         : item.status === "error"   ? "✗"
                         : item.status === "uploading" ? "↑"
                         : "·"}
                      </span>
                      <span className="qfp-batch-name">{item.file.name}</span>
                      {item.msg ? (
                        <span className="qfp-batch-msg" title={item.msg}>{item.msg}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Uploaded file list ────────────────────────────────────────── */}
          {listLoading ? (
            <p className="muted small">Loading files…</p>
          ) : listError ? (
            <div className="qfp-list-error">
              <span>✗ {listError}</span>
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => void loadFiles()}
              >
                Retry
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="qfp-empty-state">
              <p className="qfp-empty-primary">No files attached yet.</p>
              <p className="qfp-empty-secondary">
                Upload cabinet plans, photos, specs, or approvals for this quote.
              </p>
            </div>
          ) : (
            <div>
              {downloadError ? (
                <div className="qfp-list-error">✗ {downloadError}</div>
              ) : null}
              {archiveError ? (
                <div className="qfp-list-error">✗ {archiveError}</div>
              ) : null}

              <p className="qfp-files-heading">
                {files.length === 1 ? "1 attached file" : `${files.length} attached files`}
              </p>
              <div className="qfp-file-list">
                {files.map((f) => (
                  <div key={f.id} className="qfp-file-row">
                    <div
                      className={`qfp-file-icon qfp-file-icon--${mimeTypeToCategory(f.mimeType)}`}
                      aria-hidden="true"
                    >
                      {mimeTypeToFileTag(f.mimeType)}
                    </div>
                    <div className="qfp-file-info">
                      <div className="qfp-file-name" title={f.originalFilename}>
                        {f.originalFilename}
                      </div>
                      <div className="qfp-file-meta">
                        {roleLabelFor(f.fileRole)}
                        {" · "}
                        {formatBytes(f.fileSizeBytes)}
                        {" · "}
                        {formatDate(f.createdAt)}
                        {" · "}
                        {f.visibility}
                      </div>
                    </div>
                    <div className="qfp-file-actions">
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
