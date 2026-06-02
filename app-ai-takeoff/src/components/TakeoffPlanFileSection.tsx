/**
 * TakeoffPlanFileSection — source plan file upload + workspace panel.
 *
 * Upload flow:
 *   1. User picks a PDF/image file.
 *   2. POST /api/quote-files/upload-intent (no quoteId, fileRole = cabinet_plan/measurement_plan).
 *   3. PUT file bytes to Supabase signed URL (no auth header needed).
 *   4. POST /api/quote-files/confirm-upload — logs 'uploaded' event in audit.
 *   5. POST /api/takeoff-jobs with { quoteFileId } — creates takeoff workspace.
 *   6. Calls onWorkspaceCreated(takeoffJobId) so the parent Lab can persist the job ID.
 *
 * Load flow (when takeoffJobId is passed in):
 *   - GET /api/takeoff-jobs/:id on mount → show file metadata + workspace status.
 *   - Parent provides onWorkspaceLoaded(file) so the source pill can show the filename.
 *
 * Security:
 *   - organizationId never sent from client — derived server-side from auth.
 *   - storage_path never displayed.
 *   - Signed URLs only for download.
 *
 * No AI calls. No quote mutation.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { labApiGet, labApiPost, storagePut, LabApiError } from "../lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — mirrors backend

const FILE_ROLE_OPTIONS = [
  { value: "cabinet_plan",     label: "Cabinet plan" },
  { value: "measurement_plan", label: "Measurement plan" },
  { value: "photo",            label: "Photo / site photo" },
  { value: "other",            label: "Other" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanFileMeta {
  id: string;
  originalFilename: string;
  fileRole: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  status: string;
  createdAt: string;
}

interface WorkspaceState {
  takeoffJobId: string;
  reviewStatus: string;
  startedAt: string | null;
  hasSavedResult: boolean;
  file: PlanFileMeta;
}

export interface TakeoffPlanFileSectionProps {
  /** Current takeoff job ID (quoteFileId). Null when no workspace yet. */
  takeoffJobId: string | null;
  /** Bearer token for authenticated API calls. Null = not signed in. */
  token: string | null;
  /** Called when a new workspace is created after upload. */
  onWorkspaceCreated: (jobId: string, filename: string) => void;
  /** Called when an existing workspace loads (e.g. from URL param). */
  onWorkspaceLoaded: (filename: string) => void;
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
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function roleLabelFor(role: string): string {
  return FILE_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffPlanFileSection({
  takeoffJobId,
  token,
  onWorkspaceCreated,
  onWorkspaceLoaded,
}: TakeoffPlanFileSectionProps) {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileRole, setFileRole] = useState("cabinet_plan");

  type UploadStep =
    | "idle" | "getting-url" | "uploading" | "confirming" | "creating-workspace" | "done" | "error";
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load existing workspace ────────────────────────────────────────────────

  useEffect(() => {
    if (!takeoffJobId || !token) return;
    setLoadError(null);

    void (async () => {
      try {
        const res = await labApiGet(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`, token) as WorkspaceState & { ok: boolean };
        setWorkspace(res);
        onWorkspaceLoaded(res.file.originalFilename);
      } catch (e) {
        const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Failed to load workspace.";
        setLoadError(msg);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeoffJobId, token]);

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
    setUploadStep("idle");
    setUploadMsg(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !token) return;

    if (selectedFile.size > MAX_FILE_BYTES) {
      setUploadStep("error");
      setUploadMsg(`File too large (${formatBytes(selectedFile.size)}). Maximum is 50 MB.`);
      return;
    }

    setUploadStep("getting-url");
    setUploadMsg("Creating upload intent…");

    try {
      // Step 1 — Get signed upload URL from backend.
      const intent = await labApiPost("/api/quote-files/upload-intent", token, {
        originalFilename: selectedFile.name,
        mimeType: selectedFile.type || null,
        fileSizeBytes: selectedFile.size,
        fileRole,
        visibility: "internal",
        // No quoteId — this is a pre-quote Lab upload.
        // organizationId intentionally omitted — derived server-side.
      }) as { quoteFileId: string; signedUploadUrl: string };

      setUploadStep("uploading");
      setUploadMsg("Uploading file…");

      // Step 2 — PUT bytes to Supabase signed URL (no auth header needed).
      await storagePut(intent.signedUploadUrl, selectedFile);

      setUploadStep("confirming");
      setUploadMsg("Confirming upload…");

      // Step 3 — Confirm upload (logs 'uploaded' event now bytes are in storage).
      await labApiPost("/api/quote-files/confirm-upload", token, {
        quoteFileId: intent.quoteFileId,
      });

      setUploadStep("creating-workspace");
      setUploadMsg("Creating takeoff workspace…");

      // Step 4 — Create takeoff workspace.
      const ws = await labApiPost("/api/takeoff-jobs", token, {
        quoteFileId: intent.quoteFileId,
      }) as WorkspaceState & { ok: boolean };

      setWorkspace(ws);
      setUploadStep("done");
      setUploadMsg(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      onWorkspaceCreated(ws.takeoffJobId, ws.file.originalFilename);
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Upload failed.";
      setUploadStep("error");
      setUploadMsg(msg);
    }
  }, [selectedFile, token, fileRole, onWorkspaceCreated]);

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async (fileId: string) => {
    if (!token) return;
    setDownloadingId(fileId);
    setDownloadError(null);
    try {
      const res = await labApiPost("/api/quote-files/download-url", token, {
        quoteFileId: fileId,
      }) as { signedUrl: string };
      window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Download failed.";
      setDownloadError(msg);
    } finally {
      setDownloadingId(null);
    }
  }, [token]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy = uploadStep !== "idle" && uploadStep !== "done" && uploadStep !== "error";
  const canUpload = Boolean(selectedFile) && Boolean(token) && !isBusy;

  // Show sign-in prompt if no token.
  if (!token) {
    return (
      <div className="plan-file-section lab-card">
        <div className="plan-file-auth-gate">
          <span className="plan-file-auth-icon">🔒</span>
          <p className="plan-file-auth-text">
            Sign in to upload a plan file and use the file-backed workspace.
            The JSON workbench and Spec 73 sample are still available below without sign-in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-file-section lab-card">
      {/* Existing workspace — show file metadata */}
      {workspace ? (
        <div className="plan-file-loaded">
          <div className="plan-file-meta-row">
            <span className="plan-file-icon" aria-hidden>📄</span>
            <div className="plan-file-meta-details">
              <p className="plan-file-filename">{workspace.file.originalFilename}</p>
              <p className="plan-file-meta-sub">
                {roleLabelFor(workspace.file.fileRole)}
                {workspace.file.fileSizeBytes != null && ` · ${formatBytes(workspace.file.fileSizeBytes)}`}
                {` · Uploaded ${formatDate(workspace.file.createdAt)}`}
              </p>
            </div>
            <div className="plan-file-actions">
              <button
                type="button"
                className="plan-btn plan-btn--secondary"
                disabled={downloadingId === workspace.file.id}
                onClick={() => void handleDownload(workspace.file.id)}
              >
                {downloadingId === workspace.file.id ? "Opening…" : "Open / Download"}
              </button>
            </div>
          </div>

          {downloadError && (
            <p className="plan-file-error plan-file-error--inline">✗ {downloadError}</p>
          )}

          <div className="plan-file-workspace-meta">
            <span className="plan-file-job-label">Takeoff workspace ID:</span>
            <code className="plan-file-job-id">{workspace.takeoffJobId}</code>
            <span className="plan-file-status-chip plan-file-status-chip--review">
              {workspace.reviewStatus}
            </span>
            {workspace.hasSavedResult && (
              <span className="plan-file-status-chip plan-file-status-chip--saved">
                ✓ Result saved
              </span>
            )}
          </div>

          <p className="plan-file-note">
            No AI extraction yet — this file is stored and ready for a future AI takeoff job.
          </p>
        </div>
      ) : loadError ? (
        <p className="plan-file-error">Failed to load workspace: {loadError}</p>
      ) : takeoffJobId ? (
        <p className="plan-file-loading">Loading workspace…</p>
      ) : null}

      {/* Upload form — shown when no workspace yet */}
      {!workspace && !takeoffJobId && (
        <div className="plan-file-upload-form">
          <p className="plan-file-upload-hint">
            Upload the cabinet or measurement plan PDF for AI Takeoff.
            The file is stored privately and not visible to customers.
          </p>
          <div className="plan-file-upload-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
              disabled={isBusy}
            />
            <div className="plan-file-pick-group">
              <button
                type="button"
                className="plan-btn plan-btn--secondary"
                disabled={isBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose file
              </button>
              <span className="plan-file-chosen">
                {selectedFile ? selectedFile.name : "No file chosen"}
              </span>
            </div>

            <div className="plan-file-role-group">
              <label className="plan-file-role-label">File role</label>
              <select
                value={fileRole}
                onChange={(e) => setFileRole(e.target.value)}
                disabled={isBusy}
              >
                {FILE_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="plan-btn plan-btn--primary"
              disabled={!canUpload}
              onClick={() => void handleUpload()}
            >
              {isBusy ? "Uploading…" : "Upload plan"}
            </button>
          </div>

          {uploadMsg && (
            <p
              className={`plan-file-upload-msg${uploadStep === "error" ? " plan-file-upload-msg--error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {uploadStep === "error" ? "✗ " : "◌ "}
              {uploadMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
