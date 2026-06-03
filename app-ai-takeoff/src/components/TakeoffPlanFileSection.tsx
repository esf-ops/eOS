/**
 * TakeoffPlanFileSection — source plan file upload + workspace panel (v5).
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
 * AI draft flow (v5):
 *   - User clicks "Generate AI takeoff draft".
 *   - POST /api/takeoff-jobs/:id/generate-ai-draft
 *   - Backend: downloads file from storage, calls OpenAI, recomputes server-side.
 *   - On success: calls onAiDraftGenerated(normalizedTakeoffJson, filename).
 *   - review_status is always 'needs_review' — estimator must approve before import.
 *
 * Security:
 *   - organizationId never sent from client — derived server-side from auth.
 *   - storage_path never displayed.
 *   - OPENAI_API_KEY never in client code.
 *   - No quote mutation.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";
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

interface ProviderConfig {
  takeoffAiEnabled: boolean;
  activeProvider:   string;
  model:            string;
  hasGeminiKey:     boolean;
  hasOpenAiKey:     boolean;
}

export interface TakeoffPlanFileSectionProps {
  /** Current takeoff job ID. Null when no workspace yet. */
  takeoffJobId: string | null;
  /** Bearer token for authenticated API calls. Null = not signed in. */
  token: string | null;
  /** Called when a new workspace is created after upload. */
  onWorkspaceCreated: (jobId: string, filename: string) => void;
  /** Called when an existing workspace loads (e.g. from URL param). */
  onWorkspaceLoaded: (filename: string) => void;
  /** Called when an AI draft is successfully generated. Parent loads it into the review UI. */
  onAiDraftGenerated: (
    result: TakeoffResult,
    filename: string,
    meta: {
      promptVersion: string | null;
      modelUsed:     string | null;
      resultRowId:   string | null;
      summary?:      object | null;
      pageInventory?:     object | null; // v5.4: PageInventory from classification pass
      dimensionEvidence?: object | null; // v5.5: DimensionEvidence from evidence pass
    }
  ) => void;
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

// Progress messages shown during AI extraction (timed — one API call, multiple UX steps).
const AI_STEP_MSGS: Record<AiStep, string | null> = {
  idle:        null,
  sending:     "Sending plan to AI model…",
  generating:  "Generating AI draft…",
  recomputing: "Recomputing with eliteOS…",
  done:        "Ready for review",
  error:       null,
};

type AiStep = "idle" | "sending" | "generating" | "recomputing" | "done" | "error";

export default function TakeoffPlanFileSection({
  takeoffJobId,
  token,
  onWorkspaceCreated,
  onWorkspaceLoaded,
  onAiDraftGenerated,
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

  // AI draft generation state (v5)
  const [aiStep, setAiStep] = useState<AiStep>("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const aiTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Provider config badge state (v5.9.3) — fetched once per token+workspace load
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);

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

  // ── Fetch provider config (v5.9.3) ───────────────────────────────────────
  // Non-blocking: fetched when the workspace is loaded so the badge appears
  // before the user clicks Generate. Failure is silently swallowed.

  useEffect(() => {
    if (!token || !workspace) return;
    let alive = true;
    void (async () => {
      try {
        const cfg = await labApiGet("/api/takeoff/config", token) as ProviderConfig & { ok: boolean };
        if (alive && cfg.ok) setProviderConfig(cfg);
      } catch { /* non-blocking; badge stays hidden */ }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspace?.takeoffJobId]);

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

  // ── AI draft generation (v5) ─────────────────────────────────────────────

  const handleGenerateAiDraft = useCallback(async () => {
    if (!takeoffJobId || !token || !workspace) return;

    // Clear any previous timers.
    aiTimersRef.current.forEach(clearTimeout);
    aiTimersRef.current = [];

    setAiStep("sending");
    setAiError(null);

    // Simulate multi-step progress during the single API call.
    aiTimersRef.current.push(setTimeout(() => setAiStep("generating"),  3500));
    aiTimersRef.current.push(setTimeout(() => setAiStep("recomputing"), 9000));

    try {
      const res = await labApiPost(
        `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/generate-ai-draft`,
        token,
        {}
      ) as {
        ok:                    boolean;
        normalizedTakeoffJson: TakeoffResult;
        promptVersion:         string | null;
        modelUsed:             string | null;
        resultRowId:           string | null;
        summary:               object | null;
        pageInventory:         object | null; // v5.4
        dimensionEvidence:     object | null; // v5.5
      };

      // Clear progress timers.
      aiTimersRef.current.forEach(clearTimeout);
      aiTimersRef.current = [];

      if (res.ok && res.normalizedTakeoffJson) {
        setAiStep("done");
        onAiDraftGenerated(res.normalizedTakeoffJson, workspace.file.originalFilename, {
          promptVersion: res.promptVersion  ?? null,
          modelUsed:     res.modelUsed      ?? null,
          resultRowId:   res.resultRowId    ?? null,
          summary:       res.summary        ?? null,
          pageInventory:     res.pageInventory    ?? null,
          dimensionEvidence: res.dimensionEvidence ?? null,
        });
      } else {
        throw new Error("Server returned an unexpected response");
      }
    } catch (e) {
      aiTimersRef.current.forEach(clearTimeout);
      aiTimersRef.current = [];
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "AI extraction failed.";
      setAiStep("error");
      setAiError(msg);
    }
  }, [takeoffJobId, token, workspace, onAiDraftGenerated]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy = uploadStep !== "idle" && uploadStep !== "done" && uploadStep !== "error";
  const isAiBusy = aiStep === "sending" || aiStep === "generating" || aiStep === "recomputing";
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

          {/* AI draft generation (v5) */}
          <div className="ai-draft-panel">
            <div className="ai-draft-row">
              <button
                type="button"
                className={`plan-btn plan-btn--ai${isAiBusy ? " plan-btn--ai-busy" : ""}`}
                disabled={isAiBusy}
                onClick={() => void handleGenerateAiDraft()}
              >
                {isAiBusy ? (
                  <span className="ai-draft-spinner" aria-hidden>◌</span>
                ) : aiStep === "done" ? (
                  "↻ Re-generate AI takeoff draft"
                ) : (
                  "✦ Generate AI takeoff draft"
                )}
                {isAiBusy && (
                  <span className="ai-draft-progress-text">
                    {AI_STEP_MSGS[aiStep]}
                  </span>
                )}
              </button>

              {aiStep === "done" && (
                <span className="ai-draft-success-note">
                  AI draft loaded — estimator review required before import.
                </span>
              )}
            </div>

            {isAiBusy && (
              <p className="ai-draft-progress" role="status" aria-live="polite">
                {AI_STEP_MSGS[aiStep]}
              </p>
            )}

            {aiStep === "error" && aiError && (
              <p className="ai-draft-error" role="alert">
                ✗ {aiError}
              </p>
            )}

            {(aiStep === "idle" || aiStep === "done") && !isAiBusy && (
              <p className="ai-draft-hint">
                {aiStep === "done"
                  ? "AI draft requires estimator review before quote import. Dimensions are recomputed by eliteOS — AI totals are for reference only."
                  : "Send this plan to AI for automatic measurement extraction. eliteOS recomputes and validates all dimensions independently."}
              </p>
            )}

            {/* Provider config badge (v5.9.3) */}
            {providerConfig && (
              <div className="ai-provider-badge" aria-label="Active AI backend provider">
                <span className="ai-provider-badge-label">Backend provider:</span>
                <span
                  className={`ai-provider-badge-pill ai-provider-badge-pill--${providerConfig.activeProvider === "gemini" ? "gemini" : "openai"}`}
                >
                  {providerConfig.activeProvider} · {providerConfig.model}
                </span>
                {!providerConfig.takeoffAiEnabled && (
                  <span className="ai-provider-badge-warn">
                    AI disabled — set TAKEOFF_AI_ENABLED=1 in backend-core env
                  </span>
                )}
                {providerConfig.takeoffAiEnabled &&
                  providerConfig.activeProvider === "openai" &&
                  providerConfig.hasGeminiKey && (
                  <span className="ai-provider-badge-warn">
                    Backend is using OpenAI. If Gemini was expected, check TAKEOFF_AI_PROVIDER in backend-core Vercel env and redeploy.
                  </span>
                )}
              </div>
            )}
          </div>
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
