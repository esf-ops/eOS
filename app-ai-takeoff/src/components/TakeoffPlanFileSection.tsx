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
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";
import {
  labApiGet,
  labApiPost,
  storagePut,
  startTakeoffProcessing,
  generateAiTakeoffDraft,
  submitTakeoffIssueReport,
  LabApiError,
} from "../lib/api";
import type { TakeoffProcessingStatus } from "../lib/api";
import { mapAiGenerateError, isGenerateInFlight } from "../lib/takeoffGenerateErrors.mjs";

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
  status?: string;
  reviewStatus: string;
  approvalStatus?: string;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  canApprove?: boolean;
  hasSavedResult: boolean;
  startedAt: string | null;
  file: PlanFileMeta;
  processing?: TakeoffProcessingStatus;
  errorMessage?: string | null;
  exayard?: {
    status:             string | null;
    assessmentId:       string | null;
    retryAfterAt:       string | null;
    retryAfterSeconds:  number | null;
    exayardCode:        string | null;
    pausedStep:         string | null;
  } | null;
}

interface ProviderConfig {
  takeoffAiEnabled: boolean;
  activeProvider:   string;
  model:            string;
  hasGeminiKey:     boolean;
  hasOpenAiKey:     boolean;
  takeoffAsyncStartAllowed?: boolean;
  takeoffAsyncStubEnabled?: boolean;
  takeoffAsyncWorkerEnabled?: boolean;
  hasExayardKey?:           boolean;
  hasExayardOrganizationId?: boolean;
  exayard?: {
    provider:              string;
    enabled:               boolean;
    organizationIdPresent: boolean;
    apiKeyPresent:         boolean;
    authenticated:         boolean;
    tokenType:             string | null;
    membershipsCount:      number | null;
    configuredOrganizationId:            string | null;
    membershipOrganizationIds:           string[];
    membershipOrganizations?:            Array<{
      orgId: string;
      role:  string | null;
      name:  string | null;
      slug:  string | null;
    }>;
    configuredOrganizationIdInMemberships?: boolean;
    recommendedOrganizationId?:            string | null;
    setupError?:           string;
    setupWarning?:         string;
    connectionError?:      string;
  };
}

export interface PlanFilePreviewMeta {
  quoteFileId: string;
  originalFilename: string;
  mimeType: string | null;
  status: string;
  fileRole?: string;
}

export interface WorkspaceReviewMeta {
  reviewStatus: string;
  approvalStatus?: string;
  canApprove?: boolean;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  hasSavedResult?: boolean;
  file?: PlanFilePreviewMeta;
}

export interface TakeoffPlanFileSectionProps {
  /** Current takeoff job ID. Null when no workspace yet. */
  takeoffJobId: string | null;
  /** Bearer token for authenticated API calls. Null = not signed in. */
  token: string | null;
  /** Called when a new workspace is created after upload. */
  onWorkspaceCreated: (jobId: string, filename: string, file?: PlanFilePreviewMeta) => void;
  /** Called when an existing workspace loads (e.g. from URL param). */
  onWorkspaceLoaded: (filename: string, meta?: WorkspaceReviewMeta) => void;
  /** Called when workspace fetch begins (deep-link hydration). */
  onWorkspaceLoadStart?: () => void;
  /** Called when workspace fetch fails. */
  onWorkspaceLoadError?: (message: string) => void;
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
      exayardRawCaptured?:  boolean;
      exayardWorkflow?:     object | null;
    }
  ) => void;
  /**
   * Called after the source plan is successfully archived.
   * Parent should clear workspace + URL and return to upload-first empty state.
   * (v5.9.5)
   */
  onPlanArchived: () => void;
  /** Called when async processing reaches completed or failed (for inbox refresh). */
  onProcessingTerminal?: () => void;
  /** Called when AI generation busy/failed state changes (for primary CTA). */
  onGenerationStateChange?: (state: {
    busy: boolean;
    failed: boolean;
    phaseLabel: string | null;
  }) => void;
}

export interface TakeoffPlanFileSectionHandle {
  generateAiDraft: () => Promise<void>;
  isGenerating: boolean;
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

function toPlanFilePreviewMeta(file: PlanFileMeta): PlanFilePreviewMeta {
  return {
    quoteFileId: file.id,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    status: file.status,
    fileRole: file.fileRole,
  };
}

function formatRetryAfter(iso: string | null | undefined): string {
  if (!iso) return "later";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day:   "numeric",
      hour:  "numeric",
      minute: "2-digit",
    });
  } catch {
    return "later";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type AiStep = "idle" | "sending" | "generating" | "recomputing" | "polling" | "waiting" | "done" | "error";

// Progress messages shown during AI extraction (timed — one API call, multiple UX steps).
const AI_STEP_MSGS: Record<AiStep, string | null> = {
  idle:        null,
  sending:     "Sending plan to AI model…",
  generating:  "Generating AI takeoff…",
  recomputing: "Recomputing with eliteOS…",
  polling:     "Generating AI takeoff…",
  waiting:     null,
  done:        "Ready for review",
  error:       null,
};

const EXAYARD_STEP_MSGS: Record<AiStep, string | null> = {
  idle:        null,
  sending:     "Starting Exayard workflow v1…",
  generating:  "Uploading plan and running Exayard analysis…",
  recomputing: "Polling Exayard assessment status…",
  waiting:     "Exayard is still processing this assessment…",
  done:        "Exayard raw result captured — normalization pending.",
  error:       null,
};

function aiStepMessage(step: AiStep, activeProvider: string | null | undefined): string | null {
  if (activeProvider === "exayard") return EXAYARD_STEP_MSGS[step];
  return AI_STEP_MSGS[step];
}

export default forwardRef<TakeoffPlanFileSectionHandle, TakeoffPlanFileSectionProps>(
  function TakeoffPlanFileSection(
    {
      takeoffJobId,
      token,
      onWorkspaceCreated,
      onWorkspaceLoaded,
      onWorkspaceLoadStart,
      onWorkspaceLoadError,
      onAiDraftGenerated,
      onPlanArchived,
      onProcessingTerminal,
      onGenerationStateChange,
    },
    ref
  ) {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Archive state (v5.9.5)
  type ArchiveStep = "idle" | "archiving" | "done" | "error";
  const [archiveStep, setArchiveStep] = useState<ArchiveStep>("idle");
  const [archiveError, setArchiveError] = useState<string | null>(null);

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
  const [aiErrorView, setAiErrorView] = useState<ReturnType<typeof mapAiGenerateError> | null>(null);
  const [issueReportStatus, setIssueReportStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [exayardRawCaptured, setExayardRawCaptured] = useState(false);
  const [exayardWaitingInfo, setExayardWaitingInfo] = useState<{
    retryAfterAt: string | null;
    assessmentId: string | null;
    message:      string | null;
  } | null>(null);
  const aiTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const generationFlowRef = useRef(false);
  const generateInFlightRef = useRef(false);

  const [asyncBusy, setAsyncBusy] = useState(false);
  const [asyncError, setAsyncError] = useState<string | null>(null);

  // Provider config badge state (v5.9.3) — fetched once per token+workspace load
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset all local state when parent clears the workspace (v5.9.4) ────────
  //
  // When handleStartNewTakeoff() runs, the parent sets takeoffJobId → null.
  // The workspace-load effect below just returns early on null — it never clears
  // `workspace` — so the old file card stays visible. This effect explicitly
  // resets every piece of local state owned by this component when the job ID
  // is cleared, leaving the component in its blank upload-ready state.
  //
  // Also runs on initial mount when takeoffJobId is already null, which is fine
  // since the state is already at defaults.

  useEffect(() => {
    if (takeoffJobId !== null) return;
    setWorkspace(null);
    setLoadError(null);
    setSelectedFile(null);
    setFileRole("cabinet_plan");
    setUploadStep("idle");
    setUploadMsg(null);
    setDownloadingId(null);
    setDownloadError(null);
    setAiStep("idle");
    setAiError(null);
    setAiErrorView(null);
    setIssueReportStatus("idle");
    setExayardRawCaptured(false);
    setExayardWaitingInfo(null);
    setProviderConfig(null);
    setArchiveStep("idle");
    setArchiveError(null);
    setAsyncBusy(false);
    setAsyncError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [takeoffJobId]);

  // ── Load existing workspace ────────────────────────────────────────────────

  useEffect(() => {
    if (!takeoffJobId || !token) return;
    setLoadError(null);
    onWorkspaceLoadStart?.();

    void (async () => {
      try {
        const res = await labApiGet(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`, token) as WorkspaceState & { ok: boolean };
        setWorkspace(res);
        if (
          res.exayard?.status === "waiting_on_exayard" &&
          res.exayard.assessmentId
        ) {
          setAiStep("waiting");
          setExayardWaitingInfo({
            retryAfterAt: res.exayard.retryAfterAt ?? null,
            assessmentId: res.exayard.assessmentId,
            message:      "Exayard is still processing this assessment.",
          });
        }
        onWorkspaceLoaded(res.file.originalFilename, {
          reviewStatus: res.reviewStatus,
          approvalStatus: res.approvalStatus,
          canApprove: res.canApprove,
          approvedAt: res.approvedAt ?? null,
          approvedByUserId: res.approvedByUserId ?? null,
          hasSavedResult: res.hasSavedResult,
          file: toPlanFilePreviewMeta(res.file),
        });
      } catch (e) {
        const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Failed to load workspace.";
        setLoadError(msg);
        onWorkspaceLoadError?.(msg);
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

      onWorkspaceCreated(
        ws.takeoffJobId,
        ws.file.originalFilename,
        toPlanFilePreviewMeta(ws.file)
      );
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

  const loadLatestResultIntoReview = useCallback(async () => {
    if (!takeoffJobId || !token || !workspace) return;
    const latest = await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/results/latest`,
      token
    ) as {
      ok: boolean;
      normalizedTakeoffJson?: TakeoffResult;
      resultRowId?: string | null;
      pageInventory?: object | null;
      dimensionEvidence?: object | null;
      promptVersion?: string | null;
      modelUsed?: string | null;
    };
    if (latest.ok && latest.normalizedTakeoffJson) {
      onAiDraftGenerated(latest.normalizedTakeoffJson, workspace.file.originalFilename, {
        promptVersion: latest.promptVersion ?? null,
        modelUsed: latest.modelUsed ?? null,
        resultRowId: latest.resultRowId ?? null,
        pageInventory: latest.pageInventory ?? null,
        dimensionEvidence: latest.dimensionEvidence ?? null,
      });
    }
  }, [takeoffJobId, token, workspace, onAiDraftGenerated]);

  const refreshWorkspaceFromServer = useCallback(async () => {
    if (!takeoffJobId || !token) return null;
    const res = await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
      token
    ) as WorkspaceState & { ok: boolean };
    setWorkspace(res);
    return res;
  }, [takeoffJobId, token]);

  const handleGenerateAiDraft = useCallback(async () => {
    if (!takeoffJobId || !token || !workspace) return;
    if (generateInFlightRef.current) return;

    generateInFlightRef.current = true;
    generationFlowRef.current = true;

    aiTimersRef.current.forEach(clearTimeout);
    aiTimersRef.current = [];

    setAiStep("sending");
    setAiError(null);
    setAiErrorView(null);
    setIssueReportStatus("idle");
    setExayardRawCaptured(false);
    setExayardWaitingInfo(null);

    const endpoint = `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/generate-ai-draft`;
    const errorCtx = {
      endpoint,
      jobId: takeoffJobId,
      provider: providerConfig?.activeProvider ?? null,
      model: providerConfig?.model ?? null,
    };

    const isExayard = providerConfig?.activeProvider === "exayard";
    aiTimersRef.current.push(setTimeout(() => setAiStep("generating"), isExayard ? 4000 : 3500));
    aiTimersRef.current.push(setTimeout(() => setAiStep("recomputing"), isExayard ? 12000 : 9000));

    try {
      const res = await generateAiTakeoffDraft(token, takeoffJobId);

      aiTimersRef.current.forEach(clearTimeout);
      aiTimersRef.current = [];

      if ("accepted" in res && res.accepted) {
        setAiStep("polling");
        const ws = await refreshWorkspaceFromServer();
        if (ws?.status === "completed") {
          await loadLatestResultIntoReview();
          setAiStep("done");
          generationFlowRef.current = false;
          generateInFlightRef.current = false;
          return;
        }
        if (ws?.status === "failed") {
          throw new Error(ws.processing?.error ?? ws.errorMessage ?? "Generation failed");
        }
        return;
      }

      if (res.ok && res.exayardStatus === "waiting_on_exayard") {
        setAiStep("waiting");
        setExayardWaitingInfo({
          retryAfterAt: res.retryAfterAt ?? (res.exayardWorkflow as { retryAfterAt?: string })?.retryAfterAt ?? null,
          assessmentId: res.assessmentId ?? (res.exayardWorkflow as { assessmentId?: string })?.assessmentId ?? null,
          message: res.message ?? "Exayard is still processing this assessment.",
        });
        generationFlowRef.current = false;
        generateInFlightRef.current = false;
        return;
      }

      if (res.ok && res.normalizedTakeoffJson) {
        setAiStep("done");
        setExayardRawCaptured(Boolean(res.exayardRawCaptured));
        onAiDraftGenerated(res.normalizedTakeoffJson as TakeoffResult, workspace.file.originalFilename, {
          promptVersion: res.promptVersion ?? null,
          modelUsed: res.modelUsed ?? null,
          resultRowId: res.resultRowId ?? null,
          summary: res.summary ?? null,
          pageInventory: res.pageInventory ?? null,
          dimensionEvidence: res.dimensionEvidence ?? null,
          exayardRawCaptured: res.exayardRawCaptured ?? false,
          exayardWorkflow: res.exayardWorkflow ?? null,
        });
        generationFlowRef.current = false;
        generateInFlightRef.current = false;
      } else {
        throw new Error("Server returned an unexpected response");
      }
    } catch (e) {
      aiTimersRef.current.forEach(clearTimeout);
      aiTimersRef.current = [];
      const view = mapAiGenerateError(e, errorCtx);
      setAiStep("error");
      setAiError(view.body);
      setAiErrorView(view);
      generationFlowRef.current = false;
      generateInFlightRef.current = false;
    }
  }, [
    takeoffJobId,
    token,
    workspace,
    onAiDraftGenerated,
    providerConfig?.activeProvider,
    providerConfig?.model,
    refreshWorkspaceFromServer,
    loadLatestResultIntoReview,
  ]);

  const handleReportGenerationIssue = useCallback(async () => {
    if (!takeoffJobId || !token || !aiErrorView) return;
    setIssueReportStatus("sending");
    try {
      const details = Object.entries(aiErrorView.advanced)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      await submitTakeoffIssueReport(token, takeoffJobId, {
        category: "other",
        note:
          `AI takeoff generation failed.\n\n${aiErrorView.title}\n${aiErrorView.body}\n\nAdvanced:\n${details}`,
        sourcePage: "generate_ai_draft",
      });
      setIssueReportStatus("sent");
    } catch {
      setIssueReportStatus("error");
    }
  }, [takeoffJobId, token, aiErrorView]);

  const handleStartAsyncProcessing = useCallback(async () => {
    if (!takeoffJobId || !token || !workspace) return;
    setAsyncBusy(true);
    setAsyncError(null);
    try {
      const res = await startTakeoffProcessing(token, takeoffJobId);
      const ws = await refreshWorkspaceFromServer();
      if (res.status === "completed" || ws?.status === "completed") {
        await loadLatestResultIntoReview();
        onProcessingTerminal?.();
      } else if (ws?.status === "failed") {
        setAsyncError(ws.processing?.error ?? ws.errorMessage ?? "Processing failed.");
        onProcessingTerminal?.();
      }
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Processing failed.";
      setAsyncError(msg);
    } finally {
      setAsyncBusy(false);
    }
  }, [
    takeoffJobId,
    token,
    workspace,
    refreshWorkspaceFromServer,
    loadLatestResultIntoReview,
    onProcessingTerminal,
  ]);

  // Poll workspace while pipeline status is processing (worker mode).
  useEffect(() => {
    if (!takeoffJobId || !token || workspace?.status !== "processing") return;

    let alive = true;
    const poll = async () => {
      try {
        const res = await labApiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
          token
        ) as WorkspaceState & { ok: boolean };
        if (!alive) return;
        setWorkspace(res);
        if (res.status === "completed") {
          if (generationFlowRef.current) {
            setAiStep("done");
            generationFlowRef.current = false;
            generateInFlightRef.current = false;
          }
          await loadLatestResultIntoReview();
          onProcessingTerminal?.();
        } else if (res.status === "failed") {
          if (generationFlowRef.current) {
            const endpoint = `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/generate-ai-draft`;
            const view = mapAiGenerateError(
              new Error(res.processing?.error ?? res.errorMessage ?? "Generation failed"),
              {
                endpoint,
                jobId: takeoffJobId,
                provider: providerConfig?.activeProvider ?? null,
                model: providerConfig?.model ?? null,
              }
            );
            setAiStep("error");
            setAiError(view.body);
            setAiErrorView(view);
            generationFlowRef.current = false;
            generateInFlightRef.current = false;
          } else {
            setAsyncError(res.processing?.error ?? res.errorMessage ?? "Processing failed.");
          }
          onProcessingTerminal?.();
        } else if (generationFlowRef.current && res.processing?.phaseLabel) {
          setAiStep("polling");
        }
      } catch {
        /* non-fatal poll error */
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 4000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [
    takeoffJobId,
    token,
    workspace?.status,
    loadLatestResultIntoReview,
    onProcessingTerminal,
    providerConfig?.activeProvider,
    providerConfig?.model,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      generateAiDraft: () => handleGenerateAiDraft(),
      isGenerating: isGenerateInFlight(aiStep) || generateInFlightRef.current,
    }),
    [handleGenerateAiDraft, aiStep]
  );

  useEffect(() => {
    const busy = isGenerateInFlight(aiStep) || generateInFlightRef.current;
    const failed = aiStep === "error" || workspace?.status === "failed";
    const phaseLabel =
      aiStep === "polling"
        ? workspace?.processing?.phaseLabel ?? "Generating AI takeoff…"
        : aiStepMessage(aiStep, providerConfig?.activeProvider);
    onGenerationStateChange?.({ busy, failed, phaseLabel });
  }, [aiStep, workspace?.status, workspace?.processing?.phaseLabel, providerConfig?.activeProvider, onGenerationStateChange]);

  const handleResumeExayard = useCallback(async () => {
    if (!takeoffJobId || !token || !workspace) return;

    setAiStep("waiting");
    setAiError(null);

    try {
      const res = await labApiPost(
        `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/resume-exayard`,
        token,
        {}
      ) as {
        ok:                   boolean;
        exayardStatus?:       string;
        normalizedTakeoffJson?: TakeoffResult;
        retryAfterAt?:        string | null;
        message?:             string | null;
        assessmentId?:        string | null;
        exayardRawCaptured?:  boolean;
        promptVersion?:       string | null;
        modelUsed?:           string | null;
        resultRowId?:         string | null;
        summary?:             object | null;
      };

      if (res.ok && res.exayardStatus === "waiting_on_exayard") {
        setExayardWaitingInfo({
          retryAfterAt: res.retryAfterAt ?? null,
          assessmentId: res.assessmentId ?? exayardWaitingInfo?.assessmentId ?? null,
          message:      res.message ?? "Exayard is still processing this assessment.",
        });
        setAiStep("waiting");
        return;
      }

      if (res.ok && res.normalizedTakeoffJson) {
        setAiStep("done");
        setExayardRawCaptured(Boolean(res.exayardRawCaptured));
        setExayardWaitingInfo(null);
        onAiDraftGenerated(res.normalizedTakeoffJson, workspace.file.originalFilename, {
          promptVersion: res.promptVersion ?? null,
          modelUsed:     res.modelUsed ?? null,
          resultRowId:   res.resultRowId ?? null,
          summary:       res.summary ?? null,
          exayardRawCaptured: res.exayardRawCaptured ?? false,
        });
        return;
      }

      throw new Error("Unexpected Exayard resume response");
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Exayard status check failed.";
      setAiStep("waiting");
      setAiError(msg);
    }
  }, [takeoffJobId, token, workspace, onAiDraftGenerated, exayardWaitingInfo?.assessmentId]);

  // ── Remove / archive plan (v5.9.5) ───────────────────────────────────────
  //
  // Soft-archives the source file via POST /api/quote-files/archive.
  // File bytes and rows are NOT deleted. Saved takeoff runs remain in history.
  // On success, calls onPlanArchived() which triggers the parent reset
  // (same cleanup as Start New Takeoff).

  const handleRemovePlan = useCallback(async () => {
    if (!workspace || !token) return;
    const quoteFileId = workspace.file.id;

    const confirmed = window.confirm(
      "Remove this plan from the active AI Takeoff workspace?\n\n" +
      "The file will be archived — not permanently deleted. " +
      "Saved takeoff runs will remain in history.\n\n" +
      "You can upload a different plan after removing."
    );
    if (!confirmed) return;

    setArchiveStep("archiving");
    setArchiveError(null);

    try {
      await labApiPost("/api/quote-files/archive", token, { quoteFileId });
      setArchiveStep("done");
      onPlanArchived();
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Archive failed.";
      setArchiveStep("error");
      setArchiveError(msg);
    }
  }, [workspace, token, onPlanArchived]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy = uploadStep !== "idle" && uploadStep !== "done" && uploadStep !== "error";
  const isAiBusy = isGenerateInFlight(aiStep);
  const pipelineStatus = workspace?.status ?? "pending";
  const isPipelineProcessing = pipelineStatus === "processing";
  const showAsyncPanel = Boolean(providerConfig?.takeoffAsyncStartAllowed);
  const canResumeExayard = Boolean(
    providerConfig?.activeProvider === "exayard" &&
    (exayardWaitingInfo?.assessmentId || workspace?.exayard?.assessmentId)
  );
  const canUpload = Boolean(selectedFile) && Boolean(token) && !isBusy;
  const isArchiving = archiveStep === "archiving";
  /** True if the workspace's source file has been archived (shows notice, hides Generate). */
  const isFileArchived = workspace?.file.status === "archived";

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
              {!isFileArchived && (
                <button
                  type="button"
                  className="plan-btn plan-btn--secondary"
                  disabled={downloadingId === workspace.file.id}
                  onClick={() => void handleDownload(workspace.file.id)}
                >
                  {downloadingId === workspace.file.id ? "Opening…" : "Open / Download"}
                </button>
              )}
              {!isFileArchived && (
                <button
                  type="button"
                  className="plan-btn plan-btn--remove"
                  disabled={isArchiving}
                  onClick={() => void handleRemovePlan()}
                  title="Archive the source plan — the file is not deleted and saved takeoff runs remain in history"
                >
                  {isArchiving ? "Removing…" : "Remove plan"}
                </button>
              )}
            </div>
          </div>

          {downloadError && (
            <p className="plan-file-error plan-file-error--inline">✗ {downloadError}</p>
          )}

          <div className="plan-file-workspace-meta">
            <span className="plan-file-job-label">Takeoff workspace ID:</span>
            <code className="plan-file-job-id">{workspace.takeoffJobId}</code>
            <span className={`plan-file-status-chip plan-file-status-chip--pipeline plan-file-status-chip--${pipelineStatus}`}>
              {pipelineStatus}
            </span>
            <span className="plan-file-status-chip plan-file-status-chip--review">
              {workspace.reviewStatus}
            </span>
            {workspace.hasSavedResult && (
              <span className="plan-file-status-chip plan-file-status-chip--saved">
                ✓ Result saved
              </span>
            )}
          </div>

          {/* Archive error */}
          {archiveStep === "error" && archiveError && (
            <p className="plan-file-error plan-file-error--inline">✗ {archiveError}</p>
          )}

          {/* Archived file notice — shown when source file was previously archived */}
          {isFileArchived && (
            <div className="plan-file-archived-notice" role="alert">
              <span className="plan-file-archived-icon" aria-hidden>📦</span>
              <div className="plan-file-archived-body">
                <p className="plan-file-archived-title">Source plan archived</p>
                <p className="plan-file-archived-desc">
                  This source plan was archived. Saved takeoff runs remain in history.
                  Start a new takeoff or upload another plan.
                </p>
              </div>
            </div>
          )}

          {/* Async processing (Phase E) — only when server allows async start */}
          {showAsyncPanel && !isFileArchived && (
            <div className="async-process-panel">
              <p className="async-process-intro">
                {providerConfig?.takeoffAsyncStubEnabled
                  ? "Dev/test async pipeline (stub fixture — not live AI)."
                  : "Queue async processing for a background worker (when configured)."}
              </p>
              {isPipelineProcessing && (
                <p className="async-process-status" role="status" aria-live="polite">
                  <span className="ai-draft-spinner" aria-hidden>◌</span>{" "}
                  {workspace.processing?.phaseLabel ?? "Processing…"}
                  {workspace.processing?.pageProgress &&
                  workspace.processing.pageProgress.total > 0 ? (
                    <>
                      {" "}
                      ({workspace.processing.pageProgress.current}/
                      {workspace.processing.pageProgress.total})
                    </>
                  ) : null}
                </p>
              )}
              {pipelineStatus === "failed" && (asyncError || workspace.errorMessage) && (
                <p className="plan-file-error plan-file-error--inline" role="alert">
                  ✗ {asyncError ?? workspace.errorMessage}
                </p>
              )}
              <div className="ai-draft-row">
                <button
                  type="button"
                  className="plan-btn plan-btn--secondary"
                  disabled={asyncBusy || isPipelineProcessing || isAiBusy}
                  onClick={() => void handleStartAsyncProcessing()}
                >
                  {asyncBusy || isPipelineProcessing
                    ? "Processing…"
                    : pipelineStatus === "failed"
                      ? "Retry async processing"
                      : "Start async processing"}
                </button>
                {pipelineStatus === "completed" && workspace.processing?.mode === "stub" && (
                  <span className="ai-draft-success-note">Stub processing complete — review result below.</span>
                )}
              </div>
            </div>
          )}

          {/* AI generation status — primary CTA lives in workflow status card */}
          {!isFileArchived && (
            <div className="ai-draft-panel">
            {isAiBusy && (
              <p className="ai-draft-progress" role="status" aria-live="polite">
                <span className="ai-draft-spinner" aria-hidden>◌</span>{" "}
                {aiStep === "polling" && workspace?.processing?.phaseLabel
                  ? workspace.processing.phaseLabel
                  : aiStepMessage(aiStep, providerConfig?.activeProvider)}
                {workspace?.processing?.pageProgress &&
                workspace.processing.pageProgress.total > 0 ? (
                  <>
                    {" "}
                    ({workspace.processing.pageProgress.current}/
                    {workspace.processing.pageProgress.total})
                  </>
                ) : null}
              </p>
            )}

            {aiStep === "done" && (
              <p className="ai-draft-success-note" role="status">
                {exayardRawCaptured || providerConfig?.activeProvider === "exayard"
                  ? "Exayard raw result captured — normalization pending."
                  : "AI draft loaded — estimator review required before import."}
              </p>
            )}

            {aiStep === "error" && aiErrorView && (
              <div className="ai-generation-error" role="alert">
                <p className="ai-generation-error-title">{aiErrorView.title}</p>
                <p className="ai-generation-error-body">{aiErrorView.body}</p>
                <div className="ai-generation-error-actions">
                  {aiErrorView.canRetry && (
                    <button
                      type="button"
                      className="plan-btn plan-btn--primary"
                      disabled={isAiBusy}
                      onClick={() => void handleGenerateAiDraft()}
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    className="plan-btn plan-btn--secondary"
                    disabled={issueReportStatus === "sending" || issueReportStatus === "sent"}
                    onClick={() => void handleReportGenerationIssue()}
                  >
                    {issueReportStatus === "sending"
                      ? "Reporting…"
                      : issueReportStatus === "sent"
                        ? "Report sent"
                        : "Report issue"}
                  </button>
                </div>
                {issueReportStatus === "error" && (
                  <p className="ai-generation-error-report-fail">Could not send report — try again later.</p>
                )}
                <details className="ai-generation-error-advanced">
                  <summary>Advanced</summary>
                  <dl>
                    {Object.entries(aiErrorView.advanced).map(([key, value]) => (
                      <div key={key} className="ai-generation-error-advanced-row">
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            )}

            {workspace?.status === "failed" && aiStep !== "error" && !isAiBusy && (
              <p className="ai-draft-error" role="status">
                Generation failed — needs retry. Use <strong>Generate AI takeoff</strong> above to try again.
              </p>
            )}

            {providerConfig?.activeProvider === "exayard" && aiStep === "idle" && (
              <p className="ai-draft-hint ai-draft-hint--exayard">
                Exayard workflow v1: upload plan → analysis → poll assessment. Raw Exayard output is stored; countertop mapping is not applied yet.
              </p>
            )}

            {aiStep === "waiting" && (
              <div className="ai-draft-waiting" role="status" aria-live="polite">
                <p className="ai-draft-waiting-msg">
                  {exayardWaitingInfo?.message ?? "Exayard is still processing this assessment."}
                  {exayardWaitingInfo?.retryAfterAt && (
                    <>
                      {" "}
                      Try refreshing after {formatRetryAfter(exayardWaitingInfo.retryAfterAt)}.
                    </>
                  )}
                </p>
                {canResumeExayard && (
                  <button
                    type="button"
                    className="plan-btn plan-btn--secondary ai-draft-resume-btn"
                    onClick={() => void handleResumeExayard()}
                  >
                    Check Exayard status
                  </button>
                )}
                {aiError && (
                  <p className="ai-draft-warn" role="status">
                    {aiError}
                  </p>
                )}
              </div>
            )}

            {(aiStep === "idle" || aiStep === "done") && !isAiBusy && providerConfig?.activeProvider !== "exayard" && (
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
                  className={`ai-provider-badge-pill ai-provider-badge-pill--${
                    providerConfig.activeProvider === "gemini"
                      ? "gemini"
                      : providerConfig.activeProvider === "exayard"
                        ? "exayard"
                        : "openai"
                  }`}
                >
                  {providerConfig.activeProvider}
                  {providerConfig.activeProvider !== "exayard" && ` · ${providerConfig.model}`}
                </span>
                {providerConfig.activeProvider === "exayard" && providerConfig.exayard && (
                  <span className="ai-provider-badge-meta">
                    {providerConfig.exayard.authenticated
                      ? `authenticated · ${providerConfig.exayard.tokenType ?? "unknown"}`
                      : providerConfig.exayard.setupError
                        ? providerConfig.exayard.setupError
                        : providerConfig.exayard.connectionError
                          ? `not authenticated — ${providerConfig.exayard.connectionError}`
                          : "not authenticated"}
                    {providerConfig.exayard.configuredOrganizationIdInMemberships === false &&
                      providerConfig.exayard.membershipOrganizationIds.length > 0 && (
                      <>
                        {" · configured org not in memberships"}
                        {providerConfig.exayard.recommendedOrganizationId && (
                          <> — set EXAYARD_ORGANIZATION_ID={providerConfig.exayard.recommendedOrganizationId}</>
                        )}
                      </>
                    )}
                    {providerConfig.exayard.configuredOrganizationIdInMemberships === true &&
                      providerConfig.exayard.configuredOrganizationId && (
                      <> · org {providerConfig.exayard.configuredOrganizationId}</>
                    )}
                    {providerConfig.exayard.setupWarning &&
                      providerConfig.exayard.configuredOrganizationIdInMemberships !== false && (
                      <> · {providerConfig.exayard.setupWarning}</>
                    )}
                  </span>
                )}
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
          )}
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
});
