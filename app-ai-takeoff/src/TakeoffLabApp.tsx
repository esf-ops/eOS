/**
 * AI Takeoff Lab — top-level shell (v5: live AI extraction from uploaded plan files).
 *
 * v1: loads Spec 73 fixture at init, read-only viewer.
 * v2: adds JSON workbench (paste + validate).
 * v3: adds inline edit mode — edit run dimensions, room/area names,
 *     backsplash assumptions; eliteOS recomputes on every change.
 * v4: file-backed workspace — upload plan file, create takeoff job,
 *     save/load reviewed TakeoffResult; no AI extraction yet.
 * v4.5: normalized takeoff workspace persistence (quote_takeoff_jobs + quote_takeoff_results).
 * v5: live AI extraction — "Generate AI takeoff draft" calls backend which sends the
 *     source file to OpenAI, receives TakeoffResult JSON, recomputes and validates
 *     server-side, and returns the normalized result. review_status is always 'needs_review'.
 *
 * State model:
 *   authToken     — Supabase access token (null = not signed in)
 *   takeoffJobId  — quote_takeoff_jobs.id (null = no workspace)
 *   sourceMode    — "none" (upload-first empty) | "spec73" | "pasted" | "file" | "ai-draft" | "invalid"
 *   sourceResult  — the last validated source TakeoffResult (never mutated by edits)
 *   editDraft     — a mutable copy; patch handlers produce new objects immutably
 *   hasEdits      — derived: editDraft.rooms ≠ sourceResult.rooms
 *   hasActiveSource — derived: sourceMode !== "none"; gates all measurement sections
 *   displayMode   — "none" | "spec73" | "pasted" | "file" | "ai-draft" | "edited" | "invalid"
 *   activeState   — always computed from editDraft (pure, synchronous)
 *
 * URL param: ?takeoffJobId=<uuid> — auto-loads workspace on init.
 *
 * Core lab features (spec73, paste JSON, edit) are available without auth.
 * File upload, workspace save/load, AI extraction require an authenticated session.
 *
 * v6.0: Reviewed takeoff → Internal Estimate draft import (approved snapshots only).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSpec73Fixture } from "@takeoff-core/fixtures/spec73.fixture.mjs";
import { computeTakeoffMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "@takeoff-core/takeoffValidator.mjs";
import { planTakeoffImport } from "@takeoff-core/takeoffImportPlanner.mjs";
import { evaluateTakeoffQaGate } from "@takeoff-core/takeoffQaGate.mjs";
import { evaluateTakeoffApprovalGate } from "@takeoff-core/takeoffApprovalGate.mjs";
import { deriveTakeoffWorkflowStatus } from "@takeoff-core/takeoffReviewStatus.mjs";
import {
  computeReviewedTakeoffMath,
  validateReviewedTakeoffConsistency,
  canMarkRoomVerified,
} from "@takeoff-core/reviewedTakeoffMath.mjs";
import { buildRoomVerificationView } from "@takeoff-core/roomVerificationView.mjs";
import type { TakeoffResult, TakeoffArea, TakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import type { TakeoffValidationResult } from "@takeoff-core/takeoffValidator.mjs";
import type { TakeoffImportPlan } from "@takeoff-core/takeoffImportPlanner.mjs";
import TakeoffMeasurementSummarySimple from "./components/TakeoffMeasurementSummarySimple";
import TakeoffWorkflowStepper from "./components/TakeoffWorkflowStepper";
import TakeoffPrimaryStatusCard from "./components/TakeoffPrimaryStatusCard";
import TakeoffItemsToReviewPanel from "./components/TakeoffItemsToReviewPanel";
import TakeoffRoomsReview from "./components/TakeoffRoomsReview";
import TakeoffDiagnosticsPanel from "./components/TakeoffDiagnosticsPanel";
import TakeoffImportPreview, { type TakeoffImportPreviewHandle } from "./components/TakeoffImportPreview";
import TakeoffBetaBanner from "@eliteos-ui/TakeoffBetaBanner";
import TakeoffFeedbackForm from "@eliteos-ui/TakeoffFeedbackForm";
import TakeoffIssueReportModal from "@eliteos-ui/TakeoffIssueReportModal";
import TakeoffBetaQaPanel from "./components/TakeoffBetaQaPanel";
import TakeoffImportReadinessPanel from "./components/TakeoffImportReadinessPanel";
import TakeoffWorkbench from "./components/TakeoffWorkbench";
import TakeoffPlanFileSection from "./components/TakeoffPlanFileSection";
import type {
  PlanFilePreviewMeta,
  WorkspaceReviewMeta,
  TakeoffPlanFileSectionHandle,
} from "./components/TakeoffPlanFileSection";
import TakeoffPlanPreviewPanel from "./components/TakeoffPlanPreviewPanel";
import TakeoffBenchmarkPanel from "./components/TakeoffBenchmarkPanel";
import type { BenchmarkQaContext } from "./components/TakeoffBenchmarkPanel";
import TakeoffRunHistoryPanel from "./components/TakeoffRunHistoryPanel";
import TakeoffRunInbox from "./components/TakeoffRunInbox";
import TakeoffDebugPanel from "./components/TakeoffDebugPanel";
import TakeoffQaGatePanel from "./components/TakeoffQaGatePanel";
import type { QaGateResult, FabricationFinding } from "./components/TakeoffQaGatePanel";
import TakeoffPageInventoryPanel from "./components/TakeoffPageInventoryPanel";
import type { PageInventory } from "./components/TakeoffPageInventoryPanel";
import TakeoffDimensionEvidencePanel from "./components/TakeoffDimensionEvidencePanel";
import type { DimensionEvidence } from "./components/TakeoffDimensionEvidencePanel";
import TakeoffEvidenceTracePanel from "./components/TakeoffEvidenceTracePanel";
import TakeoffReviewWorkbench, { countUnresolvedWorkbenchIssues } from "./components/TakeoffReviewWorkbench";
import TakeoffValidationFixPanel from "./components/TakeoffValidationFixPanel";
import {
  deriveCurrentWorkflowStep,
  deriveWorkflowGuidance,
  isWorkflowStepComplete,
  stepTaskTitle,
  unifiedStatusLabel,
  type PrimaryCtaConfig,
} from "./lib/takeoffWorkflowUi";
import { reconcileRunsWithEvidence } from "@takeoff-core/takeoffEvidenceRunReconciliation.mjs";
import { evaluateTakeoffFabricationRules } from "@takeoff-core/takeoffFabricationRules.mjs";
import { makeTakeoffRun, makeTakeoffRoom } from "@takeoff-core/takeoffContract.mjs";
import { addManualRunToDraft, moveRunToRoom, filterReviewStateFromDraft, removeRunFromDraft, removeRoomFromDraft } from "@takeoff-core/takeoffWorkbenchHelpers.mjs";
import TakeoffRoomReviewWorkbench from "./components/TakeoffRoomReviewWorkbench";
import TakeoffReviewActionBar from "./components/TakeoffReviewActionBar";
import { deriveReviewActionPath } from "./lib/reviewActionPath.mjs";
import { getSupabase } from "./lib/supabase";
import {
  labApiGet,
  labApiPost,
  saveTakeoffCorrection,
  approveTakeoffJob,
  importInternalEstimateFromTakeoff,
  recordTakeoffReviewStarted,
  recordTakeoffImportCancelled,
  submitTakeoffFeedback,
  submitTakeoffIssueReport,
  LabApiError,
} from "./lib/api";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

// ── Dev-tools flag ─────────────────────────────────────────────────────────
// Set VITE_TAKEOFF_SHOW_DEV_TOOLS=1 in .env.local to expose JSON workbench,
// benchmark tools, and debug JSON. Hidden by default in normal estimator flow.
const showDevTools = String(
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_TAKEOFF_SHOW_DEV_TOOLS ?? ""
).trim() === "1";

// ── Workspace + head constants ─────────────────────────────────────────────

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

function homeLauncherUrl(): string {
  const raw = String(
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_HEAD_URL_HOME ?? ""
  ).trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

function internalEstimateUrl(): string {
  const raw = String(
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_HEAD_URL_INTERNAL_ESTIMATE ?? ""
  ).trim();
  return raw.replace(/\/+$/, "") || "https://internal.eliteosfab.com";
}

const PLAN_FILE_ROLE_LABELS: Record<string, string> = {
  cabinet_plan: "Cabinet plan",
  measurement_plan: "Measurement plan",
  photo: "Photo",
  other: "Other",
};

function planFileRoleLabel(role: string | undefined): string {
  if (!role) return "Plan file";
  return PLAN_FILE_ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

function resolveWorkspaceLogoUrl(): string | null {
  return EOS_LOGO_URL || null;
}

function deriveDisplayNameFromEmail(email: string): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return e;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

// ── Types ──────────────────────────────────────────────────────────────────

/** "none" = upload-first empty state (default when signed in, no source loaded yet). */
export type SourceMode = "none" | "spec73" | "pasted" | "file" | "ai-draft" | "invalid";
export type DisplayMode = "none" | "spec73" | "pasted" | "file" | "ai-draft" | "edited" | "invalid";

export interface ActiveComputedState {
  result: TakeoffResult;
  computed: TakeoffComputedMeasurements;
  validation: TakeoffValidationResult;
  importPlan: TakeoffImportPlan;
}

export type RoomPatch  = { name?: string };
export type AreaPatch  = {
  label?: string;
  backsplashLinearIn?: number;
  backsplashHeightIn?: number;
  backsplashManualSf?: number;
  backsplashScope?: string;
  backsplashReviewNote?: string;
};
export type RunPatch   = {
  label?: string;
  lengthIn?: number;
  depthIn?: number;
  assemblyNotes?: string;
  pieceType?: string;
  isBacksplash?: boolean;
  sourcePages?: number[];
};

/** Structured manual piece entry from Review Workbench. */
export type ManualRunInput = {
  roomIdx: number;
  areaLabel?: string;
  preset?: string;
  pieceLabel?: string;
  lengthIn: number;
  depthIn: number;
  pageNumber?: string | number | null;
  note?: string;
  includeInTakeoff?: boolean;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ApproveStatus = "idle" | "approving" | "approved" | "error";

// ── Helpers ────────────────────────────────────────────────────────────────

function computeAll(result: TakeoffResult): ActiveComputedState {
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  const importPlan = planTakeoffImport(result, computed);
  return { result, computed, validation, importPlan };
}

/** Collect all assumption/note strings from the full TakeoffResult tree. */
function gatherReviewNotes(result: TakeoffResult): string[] {
  const notes: string[] = [];
  for (const a of result.projectAssumptions ?? []) notes.push(a);
  for (const room of result.rooms ?? []) {
    for (const n of room.notes ?? []) notes.push(`[${room.name}] ${n}`);
    for (const a of room.assumptions ?? []) notes.push(`[${room.name}] ${a}`);
    for (const area of room.areas ?? []) {
      for (const n of area.notes ?? []) notes.push(`[${room.name} › ${area.label}] ${n}`);
      for (const a of area.assumptions ?? []) notes.push(`[${room.name} › ${area.label}] ${a}`);
    }
  }
  return notes;
}

function makeSpec73(): TakeoffResult { return buildSpec73Fixture(); }

function urlJobId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("takeoffJobId");
    return id?.trim() || null;
  } catch { return null; }
}

type WorkspaceBootState = "idle" | "loading" | "ready" | "error";

// ── Component ──────────────────────────────────────────────────────────────

export default function TakeoffLabApp() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userMetaName, setUserMetaName] = useState<string>("");
  const [userProfile, setUserProfile] = useState<{ role: string; jobTitle: string; department: string }>({
    role: "",
    jobTitle: "",
    department: "",
  });

  // Sign-in form
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) { setAuthChecked(true); return; }
    let alive = true;
    /**
     * Mirrors the Pricing Admin / Quote Library session hydration pattern.
     * Uses getSession() for fast initial load from the shared .eliteosfab.com
     * cookie, then onAuthStateChange keeps the token up-to-date on refresh.
     */
    const applySession = (sess: {
      access_token?: string;
      user?: { email?: string | null; user_metadata?: Record<string, unknown> } | null;
    } | null) => {
      if (!alive) return;
      const tok = String(sess?.access_token ?? "").trim();
      setAuthToken(tok || null);
      setAuthChecked(true);
      const u = sess?.user ?? null;
      setUserEmail(String(u?.email ?? ""));
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const metaName =
        [meta.full_name, meta.name, meta.display_name]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .find((v) => Boolean(v)) || "";
      setUserMetaName(metaName);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async () => {
    setAuthError(null);
    const supabase = getSupabase();
    if (!supabase) {
      setAuthError("Sign-in is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) throw error;
      if (!data.session?.access_token) throw new Error("No access token returned.");
      // onAuthStateChange → applySession handles setting authToken / userEmail
      setAuthPassword("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword]);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    setAuthToken(null);
    setUserEmail("");
    setUserMetaName("");
    setUserProfile({ role: "", jobTitle: "", department: "" });
  }, []);

  useEffect(() => {
    if (!authToken) {
      setUserProfile({ role: "", jobTitle: "", department: "" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const me = (await labApiGet("/api/me", authToken)) as {
          user?: { role?: string; job_title?: string | null; department?: string | null };
        };
        if (cancelled) return;
        setUserProfile({
          role: String(me?.user?.role ?? "").trim(),
          jobTitle: String(me?.user?.job_title ?? "").trim(),
          department: String(me?.user?.department ?? "").trim(),
        });
      } catch {
        /* non-fatal — subtitle falls back to email */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const userChipSubtitle = useMemo(() => {
    const roleTitle = (userProfile.jobTitle || userProfile.department || userProfile.role || "").trim();
    if (roleTitle) return roleTitle;
    return userEmail;
  }, [userProfile, userEmail]);

  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );
  const userDisplayInitials = useMemo(
    () => userInitialsFor(userMetaName, userEmail),
    [userMetaName, userEmail]
  );

  // ── AI draft metadata (prompt version, model, result ID) ────────────────
  const [aiDraftMeta, setAiDraftMeta] = useState<{
    promptVersion: string | null;
    modelUsed:     string | null;
    summary:       object | null;
  } | null>(null);

  // ID of the currently-loaded AI extraction result row (for history indicator).
  const [currentResultId, setCurrentResultId] = useState<string | null>(null);

  // Incremented after new AI extraction to trigger run history refresh.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // v5.4: Page inventory from the classification pass (null = not yet run or failed).
  const [pageInventory,    setPageInventory]    = useState<PageInventory    | null>(null);
  const [dimensionEvidence, setDimensionEvidence] = useState<DimensionEvidence | null>(null);

  // v5.8.1: Benchmark/manual QA context — set by TakeoffBenchmarkPanel after "Evaluate" click.
  const [benchmarkQaContext, setBenchmarkQaContext] = useState<BenchmarkQaContext | null>(null);

  // ── Workspace state (file-backed) ────────────────────────────────────────
  const [takeoffJobId, setTakeoffJobId] = useState<string | null>(urlJobId);
  const [planFilename, setPlanFilename] = useState<string | null>(null);
  const [planFileMeta, setPlanFileMeta] = useState<PlanFilePreviewMeta | null>(null);
  /** Deep-link boot: avoid upload-first chrome until workspace metadata hydrates. */
  const [workspaceBoot, setWorkspaceBoot] = useState<WorkspaceBootState>(() =>
    urlJobId() ? "loading" : "idle"
  );
  const [workspaceBootError, setWorkspaceBootError] = useState<string | null>(null);

  // ── Source state (last validated; never mutated by UI edits) ─────────────
  // Initialized to Spec73 as a computation fallback, but sourceMode starts as
  // "none" — the upload-first empty state. Measurement sections are gated on
  // hasActiveSource (sourceMode !== "none") and are not displayed until the
  // user uploads a plan or explicitly loads the demo sample.
  const [sourceResult, setSourceResult] = useState<TakeoffResult>(makeSpec73);
  const [sourceMode, setSourceMode] = useState<SourceMode>("none");

  // ── Edit draft (starts = sourceResult; patched by inline edit handlers) ──
  const [editDraft, setEditDraft] = useState<TakeoffResult>(makeSpec73);
  const [isEditing, setIsEditing] = useState(false);

  const [resetKey, setResetKey] = useState(0);

  // ── Workbench state ───────────────────────────────────────────────────────
  const [pastedDraft, setPastedDraft] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // ── Save state ────────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [approveStatus, setApproveStatus] = useState<ApproveStatus>("idle");
  const [approveMsg, setApproveMsg] = useState<string | null>(null);
  const [workspaceReview, setWorkspaceReview] = useState<WorkspaceReviewMeta | null>(null);

  // ── Copy feedback ─────────────────────────────────────────────────────────
  const [copyFeedback, setCopyFeedback] = useState<"summary" | "json" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planSectionRef = useRef<HTMLDivElement>(null);
  const planFileSectionRef = useRef<TakeoffPlanFileSectionHandle>(null);
  const importPreviewRef = useRef<TakeoffImportPreviewHandle>(null);
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<import("./components/TakeoffPrimaryStatusCard").GenerationProgressDisplay | null>(null);
  const [generationElapsedMs, setGenerationElapsedMs] = useState(0);

  // ── Review workbench state (v6.1) ─────────────────────────────────────────
  /** Run IDs excluded by the estimator — filtered from computation but kept in editDraft */
  const [excludedRunIds, setExcludedRunIds] = useState<Set<string>>(() => new Set());
  const [excludedRoomIds, setExcludedRoomIds] = useState<Set<string>>(() => new Set());
  const [manualRunIds, setManualRunIds] = useState<Set<string>>(() => new Set());
  const [manualRoomIds, setManualRoomIds] = useState<Set<string>>(() => new Set());
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  /** Per-run reviewer notes keyed by run.id */
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  /** Per-evidence-dim review state (ignored | reviewed), keyed by dim id or label */
  const [evidenceReviewState, setEvidenceReviewState] = useState<Record<string, "ignored" | "reviewed">>({});
  const [roomCompleteness, setRoomCompleteness] = useState<Record<string, boolean>>({});
  const [flagResolutions, setFlagResolutions] = useState<Record<string, { action: "resolved" | "ignored"; note: string; at?: string; userId?: string }>>({});
  const [referenceTotalAcks, setReferenceTotalAcks] = useState<Record<string, boolean>>({});
  const [evidenceAcks, setEvidenceAcks] = useState<Record<string, boolean>>({});
  const [importJobStatus, setImportJobStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [importJobMsg, setImportJobMsg] = useState<string | null>(null);
  const [approvedImportPayload, setApprovedImportPayload] = useState<object | null>(null);
  const [takeoffImportStatus, setTakeoffImportStatus] = useState<string | null>(null);
  const [importedQuoteId, setImportedQuoteId] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [issueReportOpen, setIssueReportOpen] = useState(false);
  const reviewStartedRef = useRef<string | null>(null);

  // ── Load saved result when workspace changes ───────────────────────────────
  useEffect(() => {
    if (!takeoffJobId || !authToken) return;
    void (async () => {
      try {
        const res = await labApiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/results/latest`,
          authToken
        ) as {
          ok: boolean;
          normalizedTakeoffJson?: TakeoffResult;
          savedAt?: string;
          reviewState?: {
            excludedRunIds?: string[];
            excludedRoomIds?: string[];
            manualRunIds?: string[];
            manualRoomIds?: string[];
            roomCompleteness?: Record<string, boolean>;
            flagResolutions?: Record<string, { action: "resolved" | "ignored"; note: string }>;
            referenceTotalAcks?: Record<string, boolean>;
            evidenceAcks?: Record<string, boolean>;
            reviewNotes?: Record<string, string>;
            evidenceReviewState?: Record<string, "ignored" | "reviewed">;
          };
          importPayload?: object | null;
          reviewStatus?: string;
        };
        if (res.ok && res.normalizedTakeoffJson) {
          commitSource(res.normalizedTakeoffJson, "file");
          setSavedAt(res.savedAt ?? null);
          if (reviewStartedRef.current !== takeoffJobId) {
            reviewStartedRef.current = takeoffJobId;
            void recordTakeoffReviewStarted(authToken, takeoffJobId).catch(() => {});
          }
          if (res.reviewState) {
            setExcludedRunIds(new Set(res.reviewState.excludedRunIds ?? []));
            setExcludedRoomIds(new Set(res.reviewState.excludedRoomIds ?? []));
            setManualRunIds(new Set(res.reviewState.manualRunIds ?? []));
            setManualRoomIds(new Set(res.reviewState.manualRoomIds ?? []));
            setRoomCompleteness(res.reviewState.roomCompleteness ?? {});
            setFlagResolutions(res.reviewState.flagResolutions ?? {});
            setReferenceTotalAcks(res.reviewState.referenceTotalAcks ?? {});
            setEvidenceAcks(res.reviewState.evidenceAcks ?? {});
            if (res.reviewState.reviewNotes) setReviewNotes(res.reviewState.reviewNotes);
            if (res.reviewState.evidenceReviewState) setEvidenceReviewState(res.reviewState.evidenceReviewState);
          }
          if (res.importPayload) setApprovedImportPayload(res.importPayload);
          if (res.reviewStatus === "approved") {
            setWorkspaceReview((prev) => ({
              ...(prev ?? { reviewStatus: "approved" }),
              reviewStatus: "approved",
              approvalStatus: "approved_for_import",
              canApprove: false,
              hasSavedResult: true,
            }));
          }
        } else {
          setSourceMode("none");
          setSavedAt(null);
        }
      } catch {
        setSourceMode("none");
        setSavedAt(null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeoffJobId, authToken]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const hasEdits = useMemo(
    () => JSON.stringify(editDraft.rooms) !== JSON.stringify(sourceResult.rooms),
    [editDraft.rooms, sourceResult.rooms]
  );

  /** True when a real source is loaded (uploaded plan, AI draft, pasted JSON, or demo). */
  const hasActiveSource = sourceMode !== "none";

  /** URL or in-app selection points at a persisted workspace (not upload-first empty state). */
  const isWorkspaceRoute = Boolean(takeoffJobId);

  /**
   * Workspace hydration in progress — derived from URL takeoffJobId immediately,
   * not only after async plan metadata / saved result loads.
   */
  const isWorkspaceHydrating = isWorkspaceRoute && (
    !authChecked || (Boolean(authToken) && workspaceBoot === "loading" && !planFileMeta)
  );

  /** True when the Spec 73 demo sample is explicitly loaded — show demo badge. */
  const isDemoMode = sourceMode === "spec73";

  const displayMode: DisplayMode =
    sourceMode === "none"      ? "none"      :
    sourceMode === "invalid"   ? "invalid"   :
    hasEdits                   ? "edited"    :
    sourceMode;

  /**
   * effectiveDraft = editDraft with excluded runs filtered out.
   * This is what eliteOS recomputes and what gets saved to the backend.
   * The full editDraft (including excluded) is passed to the review workbench
   * so the estimator can see and re-include excluded runs.
   */
  const effectiveDraft = useMemo((): TakeoffResult => {
    return filterReviewStateFromDraft(editDraft, { excludedRunIds, excludedRoomIds });
  }, [editDraft, excludedRunIds, excludedRoomIds]);

  /** True when saved payload (after exclusions) differs from last loaded source. */
  const hasSaveableChanges = useMemo(() => {
    try {
      return JSON.stringify(effectiveDraft.rooms) !== JSON.stringify(sourceResult.rooms);
    } catch {
      return hasEdits || excludedRunIds.size > 0 || excludedRoomIds.size > 0;
    }
  }, [effectiveDraft.rooms, sourceResult.rooms, hasEdits, excludedRunIds.size, excludedRoomIds.size]);

  const activeState = useMemo((): ActiveComputedState => {
    try { return computeAll(effectiveDraft); }
    catch { return computeAll(makeSpec73()); }
  }, [effectiveDraft]);

  // v5.8: Automatic QA gate — only for AI drafts and file-loaded results.
  // v5.8.1: Includes benchmarkQaContext when the user has evaluated a benchmark preset/target.
  // v5.9.2: Also skips "none" (empty/upload-first state).
  // Declared after activeState to avoid temporal dead zone.
  const qaGate = useMemo((): QaGateResult | null => {
    if (sourceMode === "none" || sourceMode === "spec73" || sourceMode === "pasted" || sourceMode === "invalid") return null;
    try {
      return evaluateTakeoffQaGate({
        takeoffResult:         activeState.result,
        computedMeasurements:  activeState.computed,
        validationDiagnostics: activeState.validation,
        dimensionEvidence:     dimensionEvidence ?? null,
        pageInventory:         pageInventory     ?? null,
        benchmarkEvaluation:   benchmarkQaContext?.benchmarkEvaluation ?? null,
        benchmarkContext:      benchmarkQaContext ? {
          expectedCountertopSf:  benchmarkQaContext.expectedCountertopSf,
          expectedBacksplashSf:  benchmarkQaContext.expectedBacksplashSf,
          toleranceCountertopSf: benchmarkQaContext.toleranceCountertopSf,
          toleranceBacksplashSf: benchmarkQaContext.toleranceBacksplashSf,
          source:                benchmarkQaContext.source,
          label:                 benchmarkQaContext.label,
        } : null,
      }) as QaGateResult;
    } catch {
      return null;
    }
  }, [sourceMode, activeState, dimensionEvidence, pageInventory, benchmarkQaContext]);

  const buildReviewState = useCallback(() => ({
    excludedRunIds: [...excludedRunIds],
    excludedRoomIds: [...excludedRoomIds],
    manualRunIds: [...manualRunIds],
    manualRoomIds: [...manualRoomIds],
    flagResolutions,
    roomCompleteness,
    referenceTotalAcks,
    evidenceAcks,
    reviewNotes,
    evidenceReviewState,
  }), [excludedRunIds, excludedRoomIds, manualRunIds, manualRoomIds, flagResolutions, roomCompleteness, referenceTotalAcks, evidenceAcks, reviewNotes, evidenceReviewState]);

  const reviewedMath = useMemo(() => {
    if (!hasActiveSource) return null;
    try {
      return computeReviewedTakeoffMath(editDraft, buildReviewState());
    } catch {
      return null;
    }
  }, [hasActiveSource, editDraft, buildReviewState]);

  const mathConsistency = useMemo(() => {
    if (!reviewedMath) return { ok: true, issues: [] as Array<{ code: string; message: string }> };
    const importTotals = approvedImportPayload && typeof approvedImportPayload === "object"
      ? (approvedImportPayload as { totals?: Record<string, number> }).totals ?? null
      : null;
    return validateReviewedTakeoffConsistency(reviewedMath, importTotals);
  }, [reviewedMath, approvedImportPayload]);

  const approvalGate = useMemo(() => {
    if (!hasActiveSource) return null;
    try {
      return evaluateTakeoffApprovalGate({
        takeoffResult: editDraft,
        computed: activeState.computed,
        validation: activeState.validation,
        qaGate,
        dimensionEvidence: dimensionEvidence ?? null,
        reviewState: buildReviewState(),
        hasSavedResult: Boolean(savedAt || workspaceReview?.hasSavedResult),
        hasUnsavedEdits: hasSaveableChanges,
        reviewStatus: workspaceReview?.reviewStatus ?? "needs_review",
        importStatus: takeoffImportStatus,
      });
    } catch {
      return null;
    }
  }, [
    hasActiveSource,
    editDraft,
    activeState,
    qaGate,
    dimensionEvidence,
    buildReviewState,
    savedAt,
    workspaceReview,
    hasSaveableChanges,
    takeoffImportStatus,
  ]);

  const workflowStatus = useMemo(
    () => approvalGate?.workflowStatus ?? deriveTakeoffWorkflowStatus({
      reviewStatus: workspaceReview?.reviewStatus ?? "needs_review",
      hasSavedResult: Boolean(savedAt),
      importStatus: takeoffImportStatus,
      hasUnsavedEdits: hasSaveableChanges,
      approvalGate,
    }),
    [approvalGate, workspaceReview, savedAt, takeoffImportStatus, hasSaveableChanges]
  );

  const canApproveTakeoff = useMemo(() => {
    if (!takeoffJobId || !hasActiveSource) return false;
    if (workspaceReview?.reviewStatus === "approved" && !hasSaveableChanges) return false;
    return Boolean(approvalGate?.canApprove);
  }, [takeoffJobId, hasActiveSource, workspaceReview?.reviewStatus, hasSaveableChanges, approvalGate]);

  const canImportToEstimate = useMemo(() => {
    if (takeoffImportStatus === "imported") return false;
    return Boolean(approvalGate?.canImport);
  }, [approvalGate, takeoffImportStatus]);

  const approveBlockedReason = useMemo(() => {
    if (!takeoffJobId || !hasActiveSource) return "Load a takeoff workspace first.";
    if (workspaceReview?.reviewStatus === "approved" && !hasSaveableChanges) return "This takeoff is already approved.";
    const first = approvalGate?.blockers?.[0];
    if (first) return first.message;
    return null;
  }, [takeoffJobId, hasActiveSource, workspaceReview?.reviewStatus, hasSaveableChanges, approvalGate]);

  // v6.2: Fabrication rule findings — computed from the current effective draft.
  // Passed to TakeoffQaGatePanel for the dedicated "Fabrication rules" subsection.
  const fabricationFindings = useMemo((): FabricationFinding[] => {
    if (sourceMode === "none" || sourceMode === "invalid") return [];
    try {
      const { findings } = evaluateTakeoffFabricationRules({
        takeoffResult:     activeState.result,
        dimensionEvidence: dimensionEvidence ?? null,
        reviewState:       excludedRunIds.size > 0 ? { excludedRunIds } : null,
      });
      // Return a compact shape for the UI: only code, level, and a short message.
      return findings.map((f) => ({
        code:    f.code,
        level:   f.level as "info" | "warning" | "error",
        message: f.message,
      }));
    } catch {
      return [];
    }
  }, [sourceMode, activeState, dimensionEvidence, excludedRunIds]);

  const spec73Json = useMemo(() => JSON.stringify(makeSpec73(), null, 2), []);

  // ── Helper: commit a new source ───────────────────────────────────────────
  function commitSource(result: TakeoffResult, mode: SourceMode) {
    setSourceResult(result);
    setEditDraft(result);
    setSourceMode(mode);
    setParseError(null);
    setIsEditing(false);
    setResetKey((k) => k + 1);
    // Reset review workbench state for each new source load.
    setExcludedRunIds(new Set());
    setExcludedRoomIds(new Set());
    setManualRunIds(new Set());
    setManualRoomIds(new Set());
    setSelectedRoomId(null);
    setReviewNotes({});
    setEvidenceReviewState({});
    setRoomCompleteness({});
    setFlagResolutions({});
    setReferenceTotalAcks({});
    setEvidenceAcks({});
  }

  useEffect(() => {
    setRoomCompleteness((prev) => {
      const next = { ...prev };
      for (const room of editDraft.rooms ?? []) {
        if (next[room.id] === undefined) next[room.id] = false;
      }
      return next;
    });
  }, [editDraft.rooms]);

  const handleSetRoomComplete = useCallback((roomId: string, complete: boolean) => {
    if (complete) {
      const roomMath = reviewedMath?.activeRooms?.find((r) => r.roomId === roomId);
      if (roomMath) {
        const verify = canMarkRoomVerified(roomMath);
        if (!verify.ok) return;
      }
    }
    setRoomCompleteness((prev) => ({ ...prev, [roomId]: complete }));
  }, [reviewedMath]);

  const handleSetRoomExcluded = useCallback((roomId: string, excluded: boolean) => {
    setExcludedRoomIds((prev) => {
      const next = new Set(prev);
      if (excluded) {
        next.add(roomId);
        setRoomCompleteness((rc) => ({ ...rc, [roomId]: false }));
        setSelectedRoomId((cur) => (cur === roomId ? null : cur));
      } else {
        next.delete(roomId);
      }
      return next;
    });
  }, []);

  const handleMoveRun = useCallback((runId: string, targetRoomIdx: number) => {
    setEditDraft((prev) => moveRunToRoom(prev, runId, targetRoomIdx));
  }, []);

  const handleAddRoom = useCallback((name: string, roomType = "Kitchen") => {
    const room = makeTakeoffRoom({
      name,
      roomType,
      areas: [{
        id: `area-${Date.now()}`,
        label: "Main",
        runs: [],
        backsplashIncluded: true,
        backsplashScope: "stone",
      }],
    });
    setEditDraft((prev) => ({ ...prev, rooms: [...(prev.rooms ?? []), room] }));
    setManualRoomIds((prev) => new Set(prev).add(room.id));
    setRoomCompleteness((prev) => ({ ...prev, [room.id]: false }));
    setSelectedRoomId(room.id);
  }, []);

  const handleRemoveManualRoom = useCallback((roomId: string) => {
    setEditDraft((prev) => removeRoomFromDraft(prev, roomId));
    setManualRoomIds((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
      return next;
    });
    setExcludedRoomIds((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
      return next;
    });
    setRoomCompleteness((prev) => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    setSelectedRoomId((cur) => (cur === roomId ? null : cur));
  }, []);

  const handleLoadSample = useCallback(() => {
    setPastedDraft(spec73Json);
    commitSource(makeSpec73(), "spec73");
  }, [spec73Json]);

  const handleValidate = useCallback(() => {
    const text = pastedDraft.trim();
    if (!text) {
      setParseError("Paste a TakeoffResult JSON first.");
      setSourceMode("invalid");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const msg = err instanceof SyntaxError ? err.message : String(err);
      setParseError(`Invalid JSON: ${msg}`);
      setSourceMode("invalid");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setParseError("Invalid schema: root must be a JSON object (TakeoffResult).");
      setSourceMode("invalid");
      return;
    }
    try {
      commitSource(parsed as TakeoffResult, "pasted");
    } catch (err) {
      setParseError(`Computation error: ${err instanceof Error ? err.message : String(err)}`);
      setSourceMode("invalid");
    }
  }, [pastedDraft]);

  const handleResetAll = useCallback(() => {
    setPastedDraft("");
    setParseError(null);
    commitSource(makeSpec73(), "spec73");
  }, []);

  // v5.8:   Start New Takeoff — clears workspace state + URL param without deleting any data.
  // v5.9.2: Resets to upload-first empty state ("none"), not Spec 73 sample.
  // v5.9.4: Setting takeoffJobId → null now also triggers TakeoffPlanFileSection's reset
  //         effect, which clears its own `workspace` state and reveals the upload form.
  // v6.1.1: Also resets workbench/benchmark state.
  const handleStartNewTakeoff = useCallback(() => {
    if (hasEdits) {
      if (!window.confirm(
        "Start a new takeoff? This will leave the current workspace saved but clear it from the screen."
      )) return;
    }
    // Remove takeoffJobId from URL without a page reload.
    const url = new URL(window.location.href);
    url.searchParams.delete("takeoffJobId");
    window.history.pushState({}, "", url.toString());

    // ── Parent-owned workspace / source / result state ────────────────────
    setTakeoffJobId(null);       // triggers TakeoffPlanFileSection reset effect
    setPlanFilename(null);
    setPlanFileMeta(null);
    setAiDraftMeta(null);
    setCurrentResultId(null);
    setPageInventory(null);
    setDimensionEvidence(null);
    setBenchmarkQaContext(null);
    setPastedDraft("");
    setParseError(null);

    // ── Save panel state ──────────────────────────────────────────────────
    setSaveStatus("idle");
    setSaveMsg(null);
    setSavedAt(null);
    setApproveStatus("idle");
    setApproveMsg(null);
    setWorkspaceReview(null);

    // ── Source / edit / display state — go to upload-first empty state ────
    setSourceResult(makeSpec73()); // keep computation fallback safe
    setEditDraft(makeSpec73());
    setSourceMode("none");
    setIsEditing(false);
    setResetKey((k) => k + 1);

    // ── Review workbench state ────────────────────────────────────────────
    setExcludedRunIds(new Set());
    setExcludedRoomIds(new Set());
    setManualRunIds(new Set());
    setManualRoomIds(new Set());
    setSelectedRoomId(null);
    setReviewNotes({});
    setEvidenceReviewState({});
    setRoomCompleteness({});
    setFlagResolutions({});
    setReferenceTotalAcks({});
    setEvidenceAcks({});
    setImportJobStatus("idle");
    setImportJobMsg(null);
    setApprovedImportPayload(null);
    setTakeoffImportStatus(null);
    setWorkspaceBoot("idle");
    setWorkspaceBootError(null);
  }, [hasEdits]);

  const handleWorkspaceLoadStart = useCallback(() => {
    setWorkspaceBoot("loading");
    setWorkspaceBootError(null);
  }, []);

  const handleWorkspaceLoaded = useCallback((filename: string, meta?: WorkspaceReviewMeta) => {
    setPlanFilename(filename);
    if (meta?.file) setPlanFileMeta(meta.file);
    if (meta) setWorkspaceReview(meta);
    setWorkspaceBoot("ready");
    setWorkspaceBootError(null);
  }, []);

  const handleWorkspaceLoadError = useCallback((message: string) => {
    setWorkspaceBoot("error");
    setWorkspaceBootError(message);
  }, []);

  const handleWorkspaceCreated = useCallback((jobId: string, filename: string, file?: PlanFilePreviewMeta) => {
    setTakeoffJobId(jobId);
    setPlanFilename(filename);
    setPlanFileMeta(file ?? null);
    setHistoryRefreshKey((k) => k + 1);
    setWorkspaceBoot("ready");
    setWorkspaceBootError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("takeoffJobId", jobId);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const handleSelectRun = useCallback((jobId: string) => {
    if (jobId === takeoffJobId) return;
    setTakeoffJobId(jobId);
    setPlanFilename(null);
    setPlanFileMeta(null);
    setAiDraftMeta(null);
    setCurrentResultId(null);
    setPageInventory(null);
    setDimensionEvidence(null);
    setBenchmarkQaContext(null);
    setPastedDraft("");
    setParseError(null);
    setSaveStatus("idle");
    setSaveMsg(null);
    setSavedAt(null);
    setApproveStatus("idle");
    setApproveMsg(null);
    setWorkspaceReview(null);
    setSourceMode("none");
    setIsEditing(false);
    setResetKey((k) => k + 1);
    setExcludedRunIds(new Set());
    setExcludedRoomIds(new Set());
    setManualRunIds(new Set());
    setManualRoomIds(new Set());
    setSelectedRoomId(null);
    setReviewNotes({});
    setEvidenceReviewState({});
    setWorkspaceBoot("loading");
    setWorkspaceBootError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("takeoffJobId", jobId);
    window.history.replaceState({}, "", url.toString());
  }, [takeoffJobId]);

  // ── Edit actions ──────────────────────────────────────────────────────────

  const handleResetEdits = useCallback(() => {
    setEditDraft(sourceResult);
    setResetKey((k) => k + 1);
  }, [sourceResult]);

  const handlePatchRoom = useCallback((roomIdx: number, patch: RoomPatch) => {
    setEditDraft((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r, ri) => ri !== roomIdx ? r : { ...r, ...patch })
    }));
  }, []);

  const handleApplyValidationFix = useCallback((nextDraft: TakeoffResult) => {
    setEditDraft(nextDraft);
  }, []);

  const handlePatchArea = useCallback((roomIdx: number, areaIdx: number, patch: AreaPatch) => {
    setEditDraft((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r, ri) =>
        ri !== roomIdx ? r : {
          ...r,
          areas: r.areas.map((a: TakeoffArea, ai: number) => ai !== areaIdx ? a : { ...a, ...patch })
        }
      )
    }));
  }, []);

  const handlePatchRun = useCallback((roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => {
    setEditDraft((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r, ri) =>
        ri !== roomIdx ? r : {
          ...r,
          areas: r.areas.map((a: TakeoffArea, ai: number) =>
            ai !== areaIdx ? a : {
              ...a,
              runs: a.runs.map((rn: TakeoffRun, rni: number) => rni !== runIdx ? rn : { ...rn, ...patch })
            }
          )
        }
      )
    }));
  }, []);

  // ── Review workbench handlers (v6.1) ─────────────────────────────────────

  const handleSetRunIncluded = useCallback((runId: string, included: boolean) => {
    setExcludedRunIds((prev) => {
      const next = new Set(prev);
      if (included) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const handleAddManualRun = useCallback((input: ManualRunInput) => {
    try {
      const { draft, run } = addManualRunToDraft(editDraft, input);
      setEditDraft(draft);
      setManualRunIds((prev) => new Set(prev).add(run.id));
      if (input.includeInTakeoff === false) {
        setExcludedRunIds((prev) => new Set(prev).add(run.id));
      }
      if (input.note?.trim()) {
        setReviewNotes((prev) => ({ ...prev, [run.id]: input.note!.trim() }));
      }
    } catch (e) {
      console.error("Failed to add manual run", e);
    }
  }, [editDraft]);

  const handleRemoveManualRun = useCallback((runId: string) => {
    setEditDraft((prev) => removeRunFromDraft(prev, runId));
    setManualRunIds((prev) => {
      const next = new Set(prev);
      next.delete(runId);
      return next;
    });
    setExcludedRunIds((prev) => {
      const next = new Set(prev);
      next.delete(runId);
      return next;
    });
  }, []);

  const handleSetReviewNote = useCallback((runId: string, note: string) => {
    setReviewNotes((prev) => ({ ...prev, [runId]: note }));
  }, []);

  const handleMarkEvidenceReviewed = useCallback((dimId: string, status: "ignored" | "reviewed") => {
    setEvidenceReviewState((prev) => ({ ...prev, [dimId]: status }));
  }, []);

  /** Patch a run by its ID (used by evidence trace "Use evidence value" actions). */
  const handlePatchRunById = useCallback((runId: string, patch: RunPatch) => {
    setEditDraft((prev) => {
      for (let ri = 0; ri < prev.rooms.length; ri++) {
        for (let ai = 0; ai < prev.rooms[ri].areas.length; ai++) {
          const runIdx = prev.rooms[ri].areas[ai].runs.findIndex((r: TakeoffRun) => r.id === runId);
          if (runIdx >= 0) {
            return {
              ...prev,
              rooms: prev.rooms.map((room, rr) =>
                rr !== ri ? room : {
                  ...room,
                  areas: room.areas.map((area: TakeoffArea, aa: number) =>
                    aa !== ai ? area : {
                      ...area,
                      runs: area.runs.map((run: TakeoffRun, xx: number) =>
                        xx !== runIdx ? run : { ...run, ...patch }
                      ),
                    }
                  ),
                }
              ),
            };
          }
        }
      }
      return prev;
    });
  }, []);

  /** Add an evidence dimension as a new run to the first eligible countertop area. */
  const handleAddEvidenceAsRun = useCallback((dim: {
    id?: string; label: string; lengthIn: number; depthIn?: number | null; pageNumber?: number
  }) => {
    setEditDraft((prev) => {
      if (!prev.rooms.length) return prev;
      // Find first countertop-type area across all rooms.
      for (let ri = 0; ri < prev.rooms.length; ri++) {
        const room = prev.rooms[ri];
        for (let ai = 0; ai < room.areas.length; ai++) {
          const area = room.areas[ai] as TakeoffArea;
          if (area.areaType === "countertop" || !area.areaType) {
            const newRun = makeTakeoffRun({
              label:       dim.label,
              lengthIn:    dim.lengthIn,
              depthIn:     dim.depthIn ?? 25.5,
              pieceType:   "counter",
              shape:       "rect",
              sourcePages: dim.pageNumber != null ? [dim.pageNumber] : [],
            });
            return {
              ...prev,
              rooms: prev.rooms.map((room2, rr) =>
                rr !== ri ? room2 : {
                  ...room2,
                  areas: room2.areas.map((area2: TakeoffArea, aa: number) =>
                    aa !== ai ? area2 : {
                      ...area2,
                      runs: [...area2.runs, newRun],
                    }
                  ),
                }
              ),
            };
          }
        }
      }
      return prev;
    });
    // Mark the evidence dim as reviewed once it's been added as a run.
    const dimId = dim.id ?? dim.label;
    setEvidenceReviewState((prev) => ({ ...prev, [dimId]: "reviewed" }));
  }, []);

  // ── Reconciliation against full editDraft (for workbench + save warning) ─
  // Re-runs when editDraft or dimensionEvidence changes.
  const fullReconciliation = useMemo(() => {
    if (!dimensionEvidence) return null;
    try {
      return reconcileRunsWithEvidence({
        takeoffResult:     editDraft,
        dimensionEvidence,
      }) as {
        runLinks:                       { runId: string; verdict: string; conflicting: boolean }[];
        unusedHighConfidenceDimensions: { id?: string; label: string; lengthIn: number; depthIn?: number | null; pageNumber?: number }[];
        unsupportedRuns:                { runId: string }[];
        changedRuns:                    { runId: string }[];
        conflictingRuns:                { runId: string }[];
        checksRan:                      boolean;
      };
    } catch { return null; }
  }, [editDraft, dimensionEvidence]);

  /**
   * True when the evidence reconciliation found issues that need estimator attention.
   * Used to auto-open the Evidence trace collapsible panel.
   */
  const hasEvidenceIssues = Boolean(
    fullReconciliation?.checksRan && (
      fullReconciliation.unsupportedRuns.length > 0 ||
      fullReconciliation.changedRuns.length > 0 ||
      fullReconciliation.conflictingRuns.length > 0 ||
      fullReconciliation.unusedHighConfidenceDimensions.length > 0
    )
  );

  /** Count of unresolved evidence issues (for save warning + summary labels). */
  const unresolvedCount = fullReconciliation ? countUnresolvedWorkbenchIssues({
    reconciliation:      fullReconciliation as Parameters<typeof countUnresolvedWorkbenchIssues>[0]["reconciliation"],
    excludedRunIds,
    reviewNotes,
    evidenceReviewState,
  }) : 0;

  // ── Save reviewed takeoff ─────────────────────────────────────────────────

  const handleSaveDraft = useCallback(async () => {
    if (!takeoffJobId || !authToken) return;
    setSaveStatus("saving");
    setSaveMsg(hasSaveableChanges ? "Saving reviewed draft with correction audit…" : "Saving reviewed draft…");
    try {
      const reviewStatePayload = buildReviewState();
      const res = hasSaveableChanges
        ? await saveTakeoffCorrection(authToken, takeoffJobId, {
            takeoffResult: effectiveDraft,
            baseResultId: currentResultId,
            reviewState: reviewStatePayload,
          })
        : await labApiPost(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/results`, authToken, {
            takeoffResult: effectiveDraft,
            reviewStatus: "needs_review",
          }) as { ok: boolean; savedAt: string; summary: { countertopExactSf: number; backsplashExactSf: number } };
      setSaveStatus("saved");
      setSavedAt(res.savedAt);
      setWorkspaceReview((prev) => ({
        ...(prev ?? { reviewStatus: "needs_review" }),
        reviewStatus: "needs_review",
        approvalStatus: "needs_review",
        canApprove: true,
        approvedAt: null,
        approvedByUserId: null,
        hasSavedResult: true,
      }));
      setHistoryRefreshKey((k) => k + 1);
      setSaveMsg(
        `${hasSaveableChanges ? "Correction saved" : "Reviewed draft saved"} — ${res.summary.countertopExactSf.toFixed(2)} sf countertop · ${res.summary.backsplashExactSf.toFixed(2)} sf backsplash`
      );
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Save failed.";
      setSaveStatus("error");
      setSaveMsg(msg);
    }
  }, [takeoffJobId, authToken, effectiveDraft, hasSaveableChanges, currentResultId, buildReviewState]);

  const handleApproveTakeoff = useCallback(async () => {
    if (!takeoffJobId || !authToken || !canApproveTakeoff) return;
    setApproveStatus("approving");
    setApproveMsg("Validating and approving takeoff…");
    try {
      const res = await approveTakeoffJob(authToken, takeoffJobId, {
        takeoffResult: effectiveDraft,
        reviewState: buildReviewState(),
        dimensionEvidence: dimensionEvidence ?? undefined,
      });
      setApproveStatus("approved");
      setWorkspaceReview({
        reviewStatus: "approved",
        approvalStatus: "approved_for_import",
        canApprove: false,
        approvedAt: res.approvedAt,
        approvedByUserId: res.approvedByUserId,
        hasSavedResult: true,
      });
      if ((res as { importPayload?: object }).importPayload) {
        setApprovedImportPayload((res as { importPayload?: object }).importPayload ?? null);
      }
      setHistoryRefreshKey((k) => k + 1);
      setApproveMsg(
        `Takeoff approved for import — ${res.summary.countertopExactSf.toFixed(2)} sf countertop · ${res.summary.backsplashExactSf.toFixed(2)} sf backsplash.`
      );
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Approval failed.";
      setApproveStatus("error");
      setApproveMsg(msg);
    }
  }, [takeoffJobId, authToken, effectiveDraft, canApproveTakeoff, buildReviewState, dimensionEvidence]);

  const handleImportToInternalEstimate = useCallback(async () => {
    if (!takeoffJobId || !authToken || !canImportToEstimate) return;
    setImportJobStatus("importing");
    setImportJobMsg(null);
    try {
      const res = await importInternalEstimateFromTakeoff(authToken, takeoffJobId, {
        betaImportConfirmed: true,
      });
      setImportJobStatus("done");
      setTakeoffImportStatus("imported");
      setImportedQuoteId(res.quoteId);
      setFeedbackSubmitted(false);
      setImportJobMsg(`Draft ${res.quote_number} created — opening Internal Estimate…`);
      const url = `${internalEstimateUrl()}/?quoteId=${encodeURIComponent(res.quoteId)}&fromTakeoff=${encodeURIComponent(takeoffJobId)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Import failed.";
      setImportJobStatus("error");
      setImportJobMsg(msg);
    }
  }, [takeoffJobId, authToken, canImportToEstimate]);

  const handleImportCancelled = useCallback(() => {
    if (!takeoffJobId || !authToken) return;
    void recordTakeoffImportCancelled(authToken, takeoffJobId, "confirmation_dismissed").catch(() => {});
  }, [takeoffJobId, authToken]);

  const handleSubmitTakeoffFeedback = useCallback(
    async (payload: Parameters<typeof submitTakeoffFeedback>[2]) => {
      if (!takeoffJobId || !authToken) return;
      setFeedbackBusy(true);
      try {
        await submitTakeoffFeedback(authToken, takeoffJobId, {
          ...payload,
          quoteId: payload.quoteId ?? importedQuoteId,
        });
        setFeedbackSubmitted(true);
      } finally {
        setFeedbackBusy(false);
      }
    },
    [takeoffJobId, authToken, importedQuoteId]
  );

  const handleSubmitTakeoffIssue = useCallback(
    async (payload: Parameters<typeof submitTakeoffIssueReport>[2]) => {
      if (!takeoffJobId || !authToken) return;
      await submitTakeoffIssueReport(authToken, takeoffJobId, payload);
    },
    [takeoffJobId, authToken]
  );

  // ── Copy actions ──────────────────────────────────────────────────────────

  function triggerCopy(kind: "summary" | "json", text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyFeedback(null), 2000);
    });
  }

  const handleCopySummary = useCallback(() => {
    const { result, computed, validation, importPlan } = activeState;
    const srcLabel: Record<string, string> = {
      none:       "No source loaded",
      spec73:     "Spec 73 demo sample",
      pasted:     "Pasted takeoff JSON",
      "ai-draft": planFilename ? `AI draft: ${planFilename}` : "AI draft",
      file:       planFilename ?? "Plan file",
      edited:     "Edited draft",
      invalid:    "Invalid draft",
    };
    const srcLabelStr = srcLabel[displayMode] ?? displayMode;
    triggerCopy("summary", [
      "eliteOS AI Takeoff — Computed Summary",
      `Source: ${srcLabelStr}  ·  Schema: v${result.schemaVersion}  ·  Status: ${result.status}`,
      "",
      `Countertop:  ${computed.countertopExactSf.toFixed(2)} sf exact  (${computed.chargeableCountertopSf} sf chargeable)`,
      `Backsplash:  ${computed.backsplashExactSf.toFixed(2)} sf exact  (${computed.chargeableBacksplashSf} sf chargeable)`,
      `Combined:    ${computed.combinedExactSf.toFixed(2)} sf exact`,
      "",
      `Validator:   ${validation.errorCount} error${validation.errorCount !== 1 ? "s" : ""}, ${validation.warningCount} warning${validation.warningCount !== 1 ? "s" : ""}, ${validation.infoCount} info`,
      `Import:      ${importPlan.canImport ? `Ready — ${importPlan.rooms.length} room${importPlan.rooms.length !== 1 ? "s" : ""} mapped` : `Blocked — ${importPlan.blockedReason ?? "see diagnostics"}`}`,
      takeoffJobId ? `\nWorkspace ID: ${takeoffJobId}` : "",
    ].join("\n").trim());
  }, [activeState, displayMode, planFilename, takeoffJobId]);

  const handleCopyEditedJson = useCallback(() => {
    triggerCopy("json", JSON.stringify(editDraft, null, 2));
  }, [editDraft]);

  // ── Handle AI draft generated (v5) ───────────────────────────────────────

  const handleAiDraftGenerated = useCallback((
    result:   TakeoffResult,
    filename: string,
    meta:     {
      promptVersion: string | null;
      modelUsed:     string | null;
      resultRowId:   string | null;
      summary?:      object | null;
      pageInventory?:     object | null;
      dimensionEvidence?: object | null;
    }
  ) => {
    commitSource(result, "ai-draft");
    setPlanFilename(filename);
    setAiDraftMeta({
      promptVersion: meta.promptVersion ?? null,
      modelUsed:     meta.modelUsed     ?? null,
      summary:       meta.summary       ?? null,
    });
    setCurrentResultId(meta.resultRowId ?? null);
    setHistoryRefreshKey((k) => k + 1);
    setPageInventory((meta.pageInventory    as PageInventory    | null) ?? null);
    setDimensionEvidence((meta.dimensionEvidence as DimensionEvidence | null) ?? null);
    setGenerationFailed(false);
  }, []);

  // ── Handle loading a historical run from run history panel (v5.3) ─────────

  const handleLoadHistoricalRun = useCallback((
    result: TakeoffResult,
    meta:   {
      promptVersion:  string | null;
      modelUsed:      string | null;
      resultId:       string;
      pageInventory?:     PageInventory    | null;
      dimensionEvidence?: DimensionEvidence | null;
    }
  ) => {
    commitSource(result, "ai-draft");
    setAiDraftMeta({
      promptVersion: meta.promptVersion ?? null,
      modelUsed:     meta.modelUsed     ?? null,
      summary:       null,
    });
    setCurrentResultId(meta.resultId);
    setPageInventory(meta.pageInventory ?? null);
    setDimensionEvidence(meta.dimensionEvidence ?? null);
  }, []);

  // ── Workspace / shell values (stable — no deps) ──────────────────────────
  const workspaceName   = DEFAULT_WORKSPACE_NAME;
  const workspaceLogoUrl = resolveWorkspaceLogoUrl();
  const homeBase        = homeLauncherUrl();

  const takeoffMenuItems: EliteosTopbarMenuItem[] = [
    {
      label: "Open Home",
      meta: "eliteOS Launcher",
      href: homeBase,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      ),
    },
  ];

  // ── Derived display values ────────────────────────────────────────────────
  const { result, computed, validation, importPlan } = activeState;

  const showPlanPreviewColumn = Boolean(takeoffJobId && planFileMeta && authToken);
  const isActiveReviewMode = Boolean(takeoffJobId && hasActiveSource && authToken);
  const useWorkspaceSourceSection = Boolean(isWorkspaceRoute && takeoffJobId);
  /** Deep-linked workspace requires sign-in before showing upload-first source UI. */
  const showSourcePlanSectionBase = Boolean(authToken || !isWorkspaceRoute);
  const hasBlockingValidation = Boolean(
    hasActiveSource && (validation.hasErrors || (validation.errorCount ?? 0) > 0)
  );
  const isTakeoffApproved = workspaceReview?.reviewStatus === "approved";
  const approvalStale = Boolean(isTakeoffApproved && hasSaveableChanges);
  const showApprovedInUi = workflowStatus === "approved_for_import" && !approvalStale;
  const hasQaBlocker = qaGate?.status === "do_not_import";

  const currentWorkflowStep = useMemo(
    () =>
      deriveCurrentWorkflowStep({
        hasPlanFile: Boolean(planFileMeta),
        hasActiveSource,
        workflowStatus,
        approvalStale,
      }),
    [planFileMeta, hasActiveSource, workflowStatus, approvalStale]
  );

  const workflowStepComplete = useCallback(
    (step: Parameters<typeof isWorkflowStepComplete>[0]) =>
      isWorkflowStepComplete(step, {
        hasPlanFile: Boolean(planFileMeta),
        hasActiveSource,
        workflowStatus,
        approvalStale,
      }),
    [planFileMeta, hasActiveSource, workflowStatus, approvalStale]
  );

  const workflowGuidance = useMemo(
    () =>
      deriveWorkflowGuidance({
        step: currentWorkflowStep,
        workflowStatus,
        approvalStale,
        blockerCount: approvalGate?.blockers.length ?? 0,
        unresolvedWorkbenchCount: unresolvedCount,
        hasBlockingValidation,
        hasQaBlocker,
        canApprove: canApproveTakeoff,
        canImport: canImportToEstimate,
        saveStatus,
        approveStatus,
        importStatus: importJobStatus,
        showApprovedInUi,
        generationInFlight: generationBusy,
        generationFailed,
      }),
    [
      currentWorkflowStep,
      workflowStatus,
      approvalStale,
      approvalGate,
      unresolvedCount,
      hasBlockingValidation,
      hasQaBlocker,
      canApproveTakeoff,
      canImportToEstimate,
      saveStatus,
      approveStatus,
      importJobStatus,
      showApprovedInUi,
      generationBusy,
      generationFailed,
    ]
  );

  const handleGenerationStateChange = useCallback(
    (state: {
      busy: boolean;
      failed: boolean;
      progress: import("./components/TakeoffPrimaryStatusCard").GenerationProgressDisplay | null;
      elapsedMs: number;
    }) => {
      setGenerationBusy(state.busy);
      setGenerationFailed(state.failed);
      setGenerationProgress(state.busy || state.failed ? state.progress : null);
      setGenerationElapsedMs(state.elapsedMs);
    },
    []
  );

  const selectedRoomVerify = useMemo(() => {
    if (!selectedRoomId || !reviewedMath) return null;
    const roomMath = reviewedMath.activeRooms.find((r) => r.roomId === selectedRoomId);
    if (!roomMath) return null;
    const view = buildRoomVerificationView(roomMath, {
      approvalBlockers: approvalGate?.blockers ?? [],
      mathConsistencyIssues: mathConsistency.ok ? [] : mathConsistency.issues,
    });
    return {
      ok: view.canVerify,
      roomBlockers: view.roomBlockers,
      globalBlockers: view.globalBlockers,
      displayBlockers: view.displayBlockers,
    };
  }, [selectedRoomId, reviewedMath, approvalGate?.blockers, mathConsistency]);

  const reviewActionPath = useMemo(() => {
    if (!hasActiveSource) return null;
    return deriveReviewActionPath({
      workflowStatus,
      showApprovedInUi,
      approvalStale,
      canApprove: canApproveTakeoff,
      canImport: canImportToEstimate,
      savedAt,
      hasSaveableChanges,
      saveStatus,
      approveStatus,
      importStatus: importJobStatus,
      activeRooms: (reviewedMath?.activeRooms ?? []).map((r) => ({
        roomId: r.roomId,
        roomName: r.roomName,
        roomIdx: r.roomIdx,
      })),
      roomCompleteness,
      excludedRoomIds,
      selectedRoomId,
      selectedRoomVerify,
    });
  }, [
    hasActiveSource,
    workflowStatus,
    showApprovedInUi,
    approvalStale,
    canApproveTakeoff,
    canImportToEstimate,
    savedAt,
    hasSaveableChanges,
    saveStatus,
    approveStatus,
    importJobStatus,
    reviewedMath?.activeRooms,
    roomCompleteness,
    excludedRoomIds,
    selectedRoomId,
    selectedRoomVerify,
  ]);

  const showReviewActionBar = Boolean(
    hasActiveSource &&
    reviewActionPath &&
    (currentWorkflowStep === "review" ||
      currentWorkflowStep === "approve" ||
      currentWorkflowStep === "import")
  );

  const executeReviewPathAction = useCallback(
    (action: string, roomId?: string) => {
      switch (action) {
        case "verify_room": {
          const targetId = roomId ?? selectedRoomId;
          if (targetId) void handleSetRoomComplete(targetId, true);
          break;
        }
        case "focus_blockers": {
          const focusTarget = reviewActionPath?.primaryAction?.focusTarget as
            | { elementId?: string; blockerCode?: string }
            | null
            | undefined;
          const targetEl = focusTarget?.elementId
            ? document.getElementById(focusTarget.elementId)
            : null;
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            targetEl.classList.add("takeoff-blocker-highlight");
            window.setTimeout(() => targetEl.classList.remove("takeoff-blocker-highlight"), 2200);
            break;
          }
          document.getElementById("takeoff-room-verify-blockers")?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          break;
        }
        case "next_room": {
          const targetId = roomId ?? reviewActionPath?.nextRoomNeedingReview?.roomId ?? null;
          if (targetId) setSelectedRoomId(targetId);
          document.getElementById("takeoff-room-workbench")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          break;
        }
        case "save":
          if (unresolvedCount > 0) {
            if (
              !window.confirm(
                `${unresolvedCount} review item${unresolvedCount !== 1 ? "s" : ""} are still unresolved. Save anyway? They should be resolved before approval.`
              )
            ) {
              return;
            }
          }
          void handleSaveDraft();
          break;
        case "approve":
          if (unresolvedCount > 0) {
            if (
              !window.confirm(
                `${unresolvedCount} review item${unresolvedCount !== 1 ? "s" : ""} are still unresolved. Approve anyway?`
              )
            ) {
              return;
            }
          }
          void handleApproveTakeoff();
          break;
        case "import":
          importPreviewRef.current?.openImportConfirm();
          break;
        default:
          break;
      }
    },
    [
      selectedRoomId,
      handleSetRoomComplete,
      reviewActionPath?.primaryAction?.focusTarget,
      reviewActionPath?.nextRoomNeedingReview?.roomId,
      handleSaveDraft,
      handleApproveTakeoff,
      unresolvedCount,
    ]
  );

  const effectiveWorkflowGuidance = useMemo(() => {
    if (!showReviewActionBar || !reviewActionPath) return workflowGuidance;
    const pa = reviewActionPath.primaryAction;
    return {
      ...workflowGuidance,
      statusHint: reviewActionPath.roomProgress.label,
      nextAction: reviewActionPath.statusMessage,
      primaryCta: {
        label: pa.label,
        action: pa.action as PrimaryCtaConfig["action"],
        disabled: pa.disabled,
        loading: pa.loading,
        title: pa.title,
        roomId: pa.roomId,
      },
    };
  }, [workflowGuidance, showReviewActionBar, reviewActionPath]);

  const handlePrimaryWorkflowAction = useCallback(
    (action: PrimaryCtaConfig["action"]) => {
      switch (action) {
        case "upload":
          planSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        case "generate":
          void planFileSectionRef.current?.generateAiDraft();
          break;
        case "verify_room":
        case "focus_blockers":
        case "next_room":
          executeReviewPathAction(action);
          break;
        case "save":
          if (unresolvedCount > 0) {
            if (
              !window.confirm(
                `${unresolvedCount} review item${unresolvedCount !== 1 ? "s" : ""} are still unresolved. Save anyway? They should be resolved before approval.`
              )
            ) {
              return;
            }
          }
          executeReviewPathAction("save");
          break;
        case "approve":
          executeReviewPathAction("approve");
          break;
        case "import":
          executeReviewPathAction("import");
          break;
        default:
          break;
      }
    },
    [unresolvedCount, executeReviewPathAction]
  );

  const workflowSecondaryActions = useMemo(() => {
    const actions: Array<{ label: string; onClick: () => void }> = [];
    if (takeoffJobId && authToken) {
      actions.push({ label: "Report issue", onClick: () => setIssueReportOpen(true) });
    }
    if (takeoffJobId) {
      actions.push({ label: "Start new takeoff", onClick: handleStartNewTakeoff });
    }
    return actions;
  }, [takeoffJobId, authToken, handleStartNewTakeoff]);

  const workflowStatusFooter = (
    <>
      {hasEdits ? (
        <p className="save-panel-note">Unsaved edits — saving records a correction audit entry.</p>
      ) : null}
      {savedAt ? (
        <p className="save-panel-last-saved">
          Last saved:{" "}
          <strong>
            {new Date(savedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
          </strong>
        </p>
      ) : null}
      {!canApproveTakeoff && approveBlockedReason && hasActiveSource && !showApprovedInUi ? (
        <p className="save-panel-blocked" role="note">
          Approval blocked: {approveBlockedReason}
        </p>
      ) : null}
      {saveMsg ? (
        <p
          className={`save-panel-msg${saveStatus === "error" ? " save-panel-msg--error" : saveStatus === "saved" ? " save-panel-msg--saved" : ""}`}
          role="status"
          aria-live="polite"
        >
          {saveStatus === "saved" ? "✓ " : saveStatus === "error" ? "✗ " : ""}
          {saveMsg}
        </p>
      ) : null}
      {approveMsg ? (
        <p
          className={`save-panel-msg${approveStatus === "error" ? " save-panel-msg--error" : approveStatus === "approved" ? " save-panel-msg--saved" : ""}`}
          role="status"
          aria-live="polite"
        >
          {approveStatus === "approved" ? "✓ " : approveStatus === "error" ? "✗ " : ""}
          {approveMsg}
        </p>
      ) : null}
      {importJobMsg ? (
        <p
          className={`save-panel-msg${importJobStatus === "error" ? " save-panel-msg--error" : importJobStatus === "done" ? " save-panel-msg--saved" : ""}`}
          role="status"
          aria-live="polite"
        >
          {importJobMsg}
        </p>
      ) : null}
    </>
  );

  const suggestedAddOnsForReview =
    (approvedImportPayload as { suggestedAddOns?: Array<{ label: string; reviewRequired?: boolean }> } | null)
      ?.suggestedAddOns ?? [];

  /** Upload/generate steps embed plan file controls in the task panel. */
  const embedPlanInTaskPanel =
    Boolean(authToken) &&
    !isWorkspaceHydrating &&
    (currentWorkflowStep === "upload" || currentWorkflowStep === "generate");

  const showSourcePlanSection = showSourcePlanSectionBase && !embedPlanInTaskPanel && !hasActiveSource;

  const takeoffStatusSlot = authToken ? (
    <span className="takeoff-topbar-pill takeoff-topbar-pill--status takeoff-topbar-pill--lab">
      {hasActiveSource || takeoffJobId
        ? unifiedStatusLabel(workflowStatus, { approvalStale })
        : "Draft"}
    </span>
  ) : null;

  const workflowStatusCard = (
    <TakeoffPrimaryStatusCard
      taskTitle={stepTaskTitle(currentWorkflowStep)}
      statusLabel={effectiveWorkflowGuidance.statusLabel}
      statusHint={effectiveWorkflowGuidance.statusHint}
      nextAction={effectiveWorkflowGuidance.nextAction}
      primaryCta={{
        ...effectiveWorkflowGuidance.primaryCta,
        title: effectiveWorkflowGuidance.primaryCta.action === "approve" ? approveBlockedReason ?? undefined : effectiveWorkflowGuidance.primaryCta.title,
      }}
      onPrimaryAction={handlePrimaryWorkflowAction}
      secondaryActions={workflowSecondaryActions}
      footerNotes={hasActiveSource || takeoffJobId ? workflowStatusFooter : undefined}
      generationProgress={generationBusy || generationFailed ? generationProgress : null}
      generationElapsedMs={generationElapsedMs}
    />
  );

  const reviewSections = hasActiveSource ? (
    <div className="takeoff-task-panel">
      {workflowStatusCard}

      {(currentWorkflowStep === "review" || currentWorkflowStep === "import") && (
        <TakeoffMeasurementSummarySimple
          computed={computed}
          consistencyOk={mathConsistency.ok}
        />
      )}

      {currentWorkflowStep === "review" && approvalGate ? (
        <TakeoffItemsToReviewPanel
          blockers={approvalGate.blockers}
          suggestedAddOns={suggestedAddOnsForReview}
        />
      ) : null}

      {currentWorkflowStep === "review" ? (
        <>
          <TakeoffRoomReviewWorkbench
            editDraft={editDraft}
            reviewedRooms={reviewedMath?.activeRooms ?? []}
            unassignedItems={reviewedMath?.unassignedItems ?? []}
            excludedRunIds={excludedRunIds}
            excludedRoomIds={excludedRoomIds}
            manualRunIds={manualRunIds}
            manualRoomIds={manualRoomIds}
            roomCompleteness={roomCompleteness}
            selectedRoomId={selectedRoomId}
            approvalBlockers={approvalGate?.blockers ?? []}
            mathConsistencyIssues={mathConsistency.ok ? [] : mathConsistency.issues}
            onSelectRoom={setSelectedRoomId}
            onSetRoomComplete={handleSetRoomComplete}
            onSetRoomExcluded={handleSetRoomExcluded}
            onRemoveManualRoom={handleRemoveManualRoom}
            onPatchRoom={handlePatchRoom}
            onAddRoom={handleAddRoom}
            onPatchRun={handlePatchRun}
            onPatchArea={handlePatchArea}
            onSetRunIncluded={handleSetRunIncluded}
            onRemoveManualRun={handleRemoveManualRun}
            onMoveRun={handleMoveRun}
            onAddManualRun={handleAddManualRun}
          />
          <details className="lab-section lab-section-collapsible takeoff-all-pieces">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>All pieces</span>
              <span className="lab-section-summary-note">Full measurement table</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <TakeoffValidationFixPanel
                editDraft={editDraft}
                validation={validation}
                onApplyDraft={handleApplyValidationFix}
              />
              <TakeoffReviewWorkbench
                editDraft={editDraft}
                dimensionEvidence={dimensionEvidence}
                excludedRunIds={excludedRunIds}
                excludedRoomIds={excludedRoomIds}
                manualRunIds={manualRunIds}
                reviewedTotals={reviewedMath ? {
                  countertopSqft: reviewedMath.countertopSqft,
                  totalBacksplashSqft: reviewedMath.totalBacksplashSqft,
                  combinedSqft: reviewedMath.combinedSqft,
                } : null}
                reviewNotes={reviewNotes}
                evidenceReviewState={evidenceReviewState}
                onPatchRun={handlePatchRun}
                onPatchArea={handlePatchArea}
                onPatchRoom={handlePatchRoom}
                onSetRunIncluded={handleSetRunIncluded}
                onRemoveManualRun={handleRemoveManualRun}
                onAddManualRun={handleAddManualRun}
                onSetReviewNote={handleSetReviewNote}
                onMarkEvidenceReviewed={handleMarkEvidenceReviewed}
              />
            </div>
          </details>
        </>
      ) : null}

      {currentWorkflowStep === "import" ? (
        <>
          <TakeoffImportPreview
            ref={importPreviewRef}
            importPlan={importPlan}
            importPayload={approvedImportPayload as Parameters<typeof TakeoffImportPreview>[0]["importPayload"]}
            canImport={canImportToEstimate}
            importBlockedReason={approvalGate?.blockers?.[0]?.message ?? importPlan.blockedReason ?? null}
            onImport={handleImportToInternalEstimate}
            onImportCancelled={handleImportCancelled}
            onReportIssue={() => setIssueReportOpen(true)}
            importStatus={importJobStatus}
            importMessage={importJobMsg}
            hideImportButton
          />
          {importJobStatus === "done" && takeoffJobId ? (
            <TakeoffFeedbackForm
              quoteId={importedQuoteId}
              onSubmit={handleSubmitTakeoffFeedback}
              busy={feedbackBusy}
              submitted={feedbackSubmitted}
            />
          ) : null}
        </>
      ) : null}

      <details className="takeoff-advanced lab-section lab-section-collapsible">
        <summary className="lab-section-summary">
          <span className="lab-section-title" style={{ margin: 0 }}>Advanced details</span>
          <span className="lab-section-summary-note">Diagnostics, history, and technical metadata</span>
        </summary>
        <div className="takeoff-advanced-body">
          {qaGate ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>QA signals &amp; checklist</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffQaGatePanel qaGate={qaGate} fabricationFindings={fabricationFindings.length > 0 ? fabricationFindings : undefined} />
              </div>
            </details>
          ) : null}

          {(() => {
            const notes = gatherReviewNotes(result);
            if (notes.length === 0) return null;
            return (
              <details className="lab-section lab-section-collapsible">
                <summary className="lab-section-summary">
                  <span className="lab-section-title" style={{ margin: 0 }}>Plan notes &amp; AI flags</span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  <ul className="ai-review-notes-list">
                    {notes.map((note, i) => (
                      <li key={i} className="ai-review-notes-item">{note}</li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })()}

          {approvalGate && currentWorkflowStep !== "import" ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Import readiness detail</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffImportReadinessPanel
                  blockers={approvalGate.blockers}
                  canApprove={canApproveTakeoff}
                  canImport={canImportToEstimate}
                  workflowStatus={workflowStatus}
                  workflowLabel={unifiedStatusLabel(workflowStatus, { approvalStale })}
                />
              </div>
            </details>
          ) : null}

          {currentWorkflowStep !== "import" ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Import preview</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffImportPreview
                  importPlan={importPlan}
                  importPayload={approvedImportPayload as Parameters<typeof TakeoffImportPreview>[0]["importPayload"]}
                  canImport={canImportToEstimate}
                  importBlockedReason={approvalGate?.blockers?.[0]?.message ?? importPlan.blockedReason ?? null}
                  onImport={handleImportToInternalEstimate}
                  onImportCancelled={handleImportCancelled}
                  onReportIssue={() => setIssueReportOpen(true)}
                  importStatus={importJobStatus}
                  importMessage={importJobMsg}
                />
              </div>
            </details>
          ) : null}

          <details className="lab-section lab-section-collapsible">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>Technical metadata</span>
              <span className="lab-section-summary-note">
                Schema v{result.schemaVersion}
                {takeoffJobId ? ` · Workspace ${takeoffJobId.slice(0, 8)}…` : ""}
              </span>
            </summary>
            <div style={{ marginTop: 12 }} className="lab-footer-note">
              <span className="lab-footer-schema">Schema v{result.schemaVersion}</span>
              {displayMode === "ai-draft" && aiDraftMeta ? (
                <span className="lab-footer-safe">
                  Provider: {aiDraftMeta.promptVersion ?? "?"} · {aiDraftMeta.modelUsed ?? "model unknown"}
                </span>
              ) : null}
              {takeoffJobId ? (
                <span className="lab-footer-safe">
                  Workspace: <code className="lab-footer-job-id">{takeoffJobId}</code>
                </span>
              ) : null}
            </div>
          </details>

          {dimensionEvidence && (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Evidence tracing</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffEvidenceTracePanel
                  result={editDraft}
                  dimensionEvidence={dimensionEvidence}
                  actions={{
                    onUseEvidenceValue: handlePatchRunById,
                    onAddEvidenceAsRun: handleAddEvidenceAsRun,
                    onMarkEvidenceReviewed: handleMarkEvidenceReviewed,
                    evidenceReviewState,
                  }}
                />
              </div>
            </details>
          )}

          <details className="lab-section lab-section-collapsible">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>Math consistency</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              {mathConsistency.ok ? (
                <p className="muted small">Room subtotals match measurement summary and import preview totals.</p>
              ) : (
                <ul className="takeoff-math-consistency-list">
                  {mathConsistency.issues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              )}
              {reviewedMath ? (
                <p className="muted small" style={{ marginTop: 8 }}>
                  Room sums: CT {reviewedMath.roomSubtotalSums.countertopSqft.toFixed(2)} sf · Backsplash {reviewedMath.roomSubtotalSums.backsplashSqft.toFixed(2)} sf · Combined {reviewedMath.roomSubtotalSums.combinedSqft.toFixed(2)} sf
                </p>
              ) : null}
            </div>
          </details>

          <details className="lab-section lab-section-collapsible">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>Validation diagnostics</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <TakeoffDiagnosticsPanel validation={validation} />
            </div>
          </details>

          {takeoffJobId && authToken ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Source plan file</span>
                <span className="lab-section-summary-note">
                  {planFilename ?? "Plan attached"} · upload or re-run AI extraction
                </span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffPlanFileSection
                  takeoffJobId={takeoffJobId}
                  token={authToken}
                  onWorkspaceLoadStart={handleWorkspaceLoadStart}
                  onWorkspaceCreated={handleWorkspaceCreated}
                  onWorkspaceLoaded={handleWorkspaceLoaded}
                  onWorkspaceLoadError={handleWorkspaceLoadError}
                  onAiDraftGenerated={handleAiDraftGenerated}
                  onPlanArchived={handleStartNewTakeoff}
                  onProcessingTerminal={() => setHistoryRefreshKey((k) => k + 1)}
                />
              </div>
            </details>
          ) : null}

          {takeoffJobId && authToken ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Run history</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffRunHistoryPanel
                  takeoffJobId={takeoffJobId}
                  token={authToken}
                  currentResultId={currentResultId}
                  currentComputed={computed}
                  refreshKey={historyRefreshKey}
                  pauseBackgroundRefresh={generationBusy}
                  embedded
                  onLoadRun={handleLoadHistoricalRun}
                />
              </div>
            </details>
          ) : null}

          {pageInventory ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Page inventory</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffPageInventoryPanel inventory={pageInventory} />
              </div>
            </details>
          ) : null}

          {dimensionEvidence ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Dimension evidence</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffDimensionEvidencePanel
                  evidence={dimensionEvidence}
                  computed={computed}
                  validation={validation}
                />
              </div>
            </details>
          ) : null}

          <details className="lab-section lab-section-collapsible">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>Rooms tree view</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <TakeoffRoomsReview
                key={resetKey}
                result={result}
                computed={computed}
                editMode={isEditing}
                onPatchRoom={handlePatchRoom}
                onPatchArea={handlePatchArea}
                onPatchRun={handlePatchRun}
              />
            </div>
          </details>

          {authToken ? (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Beta QA dashboard</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffBetaQaPanel
                  authToken={authToken}
                  refreshKey={historyRefreshKey}
                  pauseBackgroundRefresh={generationBusy}
                />
              </div>
            </details>
          ) : null}

          {showDevTools ? (
            <>
              <details className="lab-section lab-section-collapsible lab-section-dev">
                <summary className="lab-section-summary">
                  <span className="lab-section-title lab-section-title--dev" style={{ margin: 0 }}>Developer / benchmark tools</span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  <TakeoffBenchmarkPanel
                    computed={computed}
                    dimensionEvidence={dimensionEvidence}
                    validation={validation}
                    onBenchmarkEvaluated={setBenchmarkQaContext}
                  />
                </div>
              </details>
              <section className="lab-section">
                <TakeoffDebugPanel
                  result={result}
                  computed={computed}
                  validation={validation}
                  importPlan={importPlan}
                  pageInventory={pageInventory}
                  dimensionEvidence={dimensionEvidence}
                />
              </section>
            </>
          ) : null}
        </div>
      </details>
    </div>
  ) : null;

  const uploadGenerateTaskPanel = embedPlanInTaskPanel ? (
    <div className="takeoff-task-panel">
      {workflowStatusCard}
      <div ref={planSectionRef}>
        <TakeoffPlanFileSection
          ref={planFileSectionRef}
          takeoffJobId={takeoffJobId}
          token={authToken}
          enableJobPolling
          onWorkspaceLoadStart={handleWorkspaceLoadStart}
          onWorkspaceCreated={handleWorkspaceCreated}
          onWorkspaceLoaded={handleWorkspaceLoaded}
          onWorkspaceLoadError={handleWorkspaceLoadError}
          onAiDraftGenerated={handleAiDraftGenerated}
          onPlanArchived={handleStartNewTakeoff}
          onProcessingTerminal={() => setHistoryRefreshKey((k) => k + 1)}
          onGenerationStateChange={handleGenerationStateChange}
        />
      </div>
    </div>
  ) : null;

  const taskPanelContent = hasActiveSource ? reviewSections : uploadGenerateTaskPanel;

  return (
    <div className={`shell page-ai-takeoff${showReviewActionBar ? " page-ai-takeoff--review-actions" : ""}`}>
      {authChecked && authToken ? (
        <EliteosTopbar
          appName="AI Takeoff"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
          homeHref={homeBase}
          userName={userDisplayName}
          userEmail={userEmail}
          userSubtitle={userChipSubtitle}
          initials={userDisplayInitials}
          menuItems={takeoffMenuItems}
          statusSlot={takeoffStatusSlot}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar
          appName="AI Takeoff"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
          homeHref={homeBase}
          statusSlot={takeoffStatusSlot}
        />
      )}

      {/* ── Page intro + workflow stepper ─────────────────────────── */}
      <div className="takeoff-page-hero takeoff-page-hero--compact" role="region" aria-label="AI Takeoff overview">
        <div className="takeoff-page-hero-inner">
          <div className="takeoff-page-hero-main">
            <h1 className="takeoff-page-heading takeoff-page-heading--compact">AI Takeoff</h1>
            <TakeoffBetaBanner compact />
            {authToken && !isWorkspaceHydrating ? (
              <TakeoffWorkflowStepper
                currentStep={currentWorkflowStep}
                isStepComplete={workflowStepComplete}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="main" role="main">
        <div
          className={`lab-main-inner${
            showPlanPreviewColumn ? " lab-main-inner--active-review" : ""
          }${takeoffJobId && planFileMeta ? " lab-main-inner--review" : ""}`}
        >

          {isWorkspaceHydrating ? (
            <div className="takeoff-boot-panel" role="status" aria-live="polite">
              <div className="takeoff-boot-spinner" aria-hidden />
              <p className="takeoff-boot-title">Loading takeoff workspace…</p>
              <p className="takeoff-boot-hint">Restoring plan file and review state.</p>
            </div>
          ) : workspaceBootError ? (
            <div className="banner banner-error takeoff-boot-error" role="alert">
              <strong>Could not load workspace.</strong> {workspaceBootError}
            </div>
          ) : null}

          <div className={isWorkspaceHydrating ? "takeoff-boot-suspended" : undefined}>

          {/* ── Sign-in panel (shown only when not authenticated) ─────── */}
          {authChecked && !authToken && (
            <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
              <header className="auth-panel-header">
                <p className="auth-panel-eyebrow">AI Takeoff · {workspaceName}</p>
                <h2 className="auth-panel-title">Sign in to continue</h2>
                <p className="auth-panel-sub">
                  Sign in with your eliteOS staff account to upload plan files, create workspaces,
                  and generate AI drafts. Backend head access is enforced on every API call.
                </p>
              </header>
              {!getSupabase() ? (
                <div className="banner banner-warn" role="alert">
                  <strong>Supabase is not configured.</strong>{" "}
                  Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
                </div>
              ) : null}
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="atl-email">Email</label>
                  <input
                    id="atl-email"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="you@example.com"
                    disabled={authBusy || !getSupabase()}
                    onKeyDown={(e) => e.key === "Enter" && void signIn()}
                  />
                </div>
                <div className="field">
                  <label htmlFor="atl-password">Password</label>
                  <input
                    id="atl-password"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={authBusy || !getSupabase()}
                    onKeyDown={(e) => e.key === "Enter" && void signIn()}
                  />
                </div>
              </div>
              {authError ? (
                <div className="banner banner-error" role="alert" style={{ marginTop: 8 }}>
                  {authError}
                </div>
              ) : null}
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 16 }}
                disabled={authBusy || !authEmail.trim() || !authPassword || !getSupabase()}
                onClick={() => void signIn()}
              >
                {authBusy ? "Signing in…" : "Sign in"}
              </button>
              <p className="auth-trust">
                Authenticated through Supabase. No service-role keys are used in the browser.
              </p>
            </section>
          )}

          {/* ── Active review zone (primary when workspace + plan loaded) ── */}
          {showPlanPreviewColumn ? (
            <div className="takeoff-active-review-zone">
              <div className="takeoff-review-layout">
                <aside className="takeoff-review-preview-col">
                  <TakeoffPlanPreviewPanel
                    token={authToken}
                    file={planFileMeta}
                    refreshKey={takeoffJobId}
                  />
                </aside>
                <div className="takeoff-review-main-col">
                  {taskPanelContent}
                </div>
              </div>
            </div>
          ) : null}

          {!showPlanPreviewColumn && taskPanelContent}

          {/* ── Takeoff runs inbox ─────────────────────────────────────── */}
          {authToken ? (
            takeoffJobId ? (
              <details
                className="lab-section lab-section-collapsible lab-section--compact"
                open={false}
              >
                <summary className="lab-section-summary">
                  <span className="lab-section-title" style={{ margin: 0 }}>Takeoff runs</span>
                  <span className="lab-section-summary-note">
                    {planFilename ?? "Active workspace"} · switch runs or refresh
                  </span>
                </summary>
                <div className="lab-section-collapsible-body">
                  <TakeoffRunInbox
                    token={authToken}
                    selectedJobId={takeoffJobId}
                    refreshKey={historyRefreshKey}
                    pauseBackgroundRefresh={generationBusy}
                    onSelectJob={handleSelectRun}
                  />
                </div>
              </details>
            ) : (
              <section className="lab-section lab-section--card">
                <h2 className="lab-section-title">Takeoff runs</h2>
                <TakeoffRunInbox
                  token={authToken}
                  selectedJobId={takeoffJobId}
                  refreshKey={historyRefreshKey}
                  pauseBackgroundRefresh={generationBusy}
                  onSelectJob={handleSelectRun}
                />
              </section>
            )
          ) : null}

          {/* ── Source plan file (v4) ──────────────────────────────────── */}
          {showSourcePlanSection ? (
          useWorkspaceSourceSection ? (
            <details className="lab-section lab-section-collapsible lab-section--compact" open={false}>
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Source plan file</span>
                <span className="lab-section-summary-note">
                  {planFilename ?? "Plan attached"} · upload, AI draft, or async processing
                </span>
              </summary>
              <div className="lab-section-collapsible-body">
                <TakeoffPlanFileSection
                  takeoffJobId={takeoffJobId}
                  token={authToken}
                  onWorkspaceLoadStart={handleWorkspaceLoadStart}
                  onWorkspaceCreated={handleWorkspaceCreated}
                  onWorkspaceLoaded={handleWorkspaceLoaded}
                  onWorkspaceLoadError={handleWorkspaceLoadError}
                  onAiDraftGenerated={handleAiDraftGenerated}
                  onPlanArchived={handleStartNewTakeoff}
                  onProcessingTerminal={() => setHistoryRefreshKey((k) => k + 1)}
                />
              </div>
            </details>
          ) : (
            <section className="lab-section">
              <h2 className="lab-section-title">Source plan file</h2>
              <TakeoffPlanFileSection
                takeoffJobId={takeoffJobId}
                token={authToken}
                onWorkspaceLoadStart={handleWorkspaceLoadStart}
                onWorkspaceCreated={handleWorkspaceCreated}
                onWorkspaceLoaded={handleWorkspaceLoaded}
                onWorkspaceLoadError={handleWorkspaceLoadError}
                onAiDraftGenerated={handleAiDraftGenerated}
                onPlanArchived={handleStartNewTakeoff}
                onProcessingTerminal={() => setHistoryRefreshKey((k) => k + 1)}
              />
            </section>
          )
          ) : null}

          {/* ── AI extraction run history (v5.3) ──────────────────────── */}
          {takeoffJobId && authToken && (
            <details
              className="lab-section lab-section-collapsible lab-section--compact"
              open={!currentResultId && !hasActiveSource}
            >
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>AI extraction history</span>
                <span className="lab-section-summary-note">
                  {currentResultId
                    ? "Result loaded — expand to switch runs"
                    : "Load a prior extraction run"}
                </span>
              </summary>
              <div className="lab-section-collapsible-body">
                <TakeoffRunHistoryPanel
                  takeoffJobId={takeoffJobId}
                  token={authToken}
                  currentResultId={currentResultId}
                  currentComputed={hasActiveSource ? computed : null}
                  refreshKey={historyRefreshKey}
                  pauseBackgroundRefresh={generationBusy}
                  embedded
                  onLoadRun={handleLoadHistoricalRun}
                />
              </div>
            </details>
          )}

          {/* JSON workbench — developer-only tool, hidden unless VITE_TAKEOFF_SHOW_DEV_TOOLS=1 */}
          {showDevTools && (
          <details className="lab-section lab-section-collapsible lab-section-dev">
            <summary className="lab-section-summary">
              <span className="lab-section-title lab-section-title--dev" style={{ margin: 0 }}>JSON workbench</span>
              <span className="lab-section-summary-note">Developer / demo — paste or load Spec 73 sample</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <TakeoffWorkbench
                pastedDraft={pastedDraft}
                onDraftChange={setPastedDraft}
                onLoadSample={handleLoadSample}
                onValidate={handleValidate}
                onResetAll={handleResetAll}
                onCopySummary={handleCopySummary}
                onCopyEditedJson={handleCopyEditedJson}
                parseError={parseError}
                copyFeedback={copyFeedback}
                displayMode={displayMode as "none" | "spec73" | "pasted" | "edited" | "invalid"}
              />
            </div>
          </details>
          )}

          {/* ── Demo sample notice — shown when Spec 73 is explicitly loaded ── */}
          {isDemoMode && (
            <div className="demo-notice" role="note">
              <span className="demo-notice-badge">Demo sample</span>
              <span className="demo-notice-text">
                <strong>Not a real workspace.</strong>{" "}
                The Spec 73 fixture uses a 41" peninsula depth specific to this test plan.
                Do not treat this as a template — nonstandard depths must come from the actual plan.{" "}
                <button
                  type="button"
                  className="demo-notice-clear"
                  onClick={() => {
                    setSourceResult(makeSpec73());
                    setEditDraft(makeSpec73());
                    setSourceMode("none");
                    setIsEditing(false);
                    setResetKey((k) => k + 1);
                    setPastedDraft("");
                    setParseError(null);
                  }}
                >
                  Clear demo data
                </button>
              </span>
            </div>
          )}

          {/* ── Review without plan preview (fallback) ───────────────────── */}
          </div>
        </div>
      </main>

      {showReviewActionBar && reviewActionPath ? (
        <TakeoffReviewActionBar
          visible
          statusMessage={reviewActionPath.statusMessage}
          roomProgressLabel={reviewActionPath.roomProgress.label}
          selectedRoomName={reviewActionPath.selectedRoom?.roomName ?? null}
          selectedRoomVerified={Boolean(reviewActionPath.selectedRoom?.verified)}
          unresolvedBlockerCount={reviewActionPath.selectedRoom?.blockerCount ?? 0}
          globalBlockerCount={reviewActionPath.selectedRoom?.globalBlockerCount ?? 0}
          primaryAction={reviewActionPath.primaryAction}
          secondaryAction={reviewActionPath.secondaryAction}
          onPrimaryAction={(action) => executeReviewPathAction(action.action, action.roomId)}
          onSecondaryAction={(action) => executeReviewPathAction(action.action, action.roomId)}
        />
      ) : null}

      <footer className="footer-bar" role="contentinfo">
        <span>eliteOS · AI Takeoff</span>
        <span className="footer-meta">Authorized staff only — backend authorization is the source of truth.</span>
      </footer>

      {takeoffJobId && authToken ? (
        <TakeoffIssueReportModal
          open={issueReportOpen}
          onClose={() => setIssueReportOpen(false)}
          onSubmit={handleSubmitTakeoffIssue}
          quoteId={importedQuoteId}
          sourcePage="ai_takeoff_review"
        />
      ) : null}
    </div>
  );
}
