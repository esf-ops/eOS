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
 * Hard boundary: Import to Internal Estimate remains disabled.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSpec73Fixture } from "@takeoff-core/fixtures/spec73.fixture.mjs";
import { computeTakeoffMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "@takeoff-core/takeoffValidator.mjs";
import { planTakeoffImport } from "@takeoff-core/takeoffImportPlanner.mjs";
import { evaluateTakeoffQaGate } from "@takeoff-core/takeoffQaGate.mjs";
import type { TakeoffResult, TakeoffArea, TakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import type { TakeoffValidationResult } from "@takeoff-core/takeoffValidator.mjs";
import type { TakeoffImportPlan } from "@takeoff-core/takeoffImportPlanner.mjs";
import TakeoffSummaryCards from "./components/TakeoffSummaryCards";
import TakeoffRoomsReview from "./components/TakeoffRoomsReview";
import TakeoffDiagnosticsPanel from "./components/TakeoffDiagnosticsPanel";
import TakeoffImportPreview from "./components/TakeoffImportPreview";
import TakeoffWorkbench from "./components/TakeoffWorkbench";
import TakeoffPlanFileSection from "./components/TakeoffPlanFileSection";
import type { PlanFilePreviewMeta, WorkspaceReviewMeta } from "./components/TakeoffPlanFileSection";
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
import TakeoffWorkflowExplainer from "./components/TakeoffWorkflowExplainer";
import { reconcileRunsWithEvidence } from "@takeoff-core/takeoffEvidenceRunReconciliation.mjs";
import { evaluateTakeoffFabricationRules } from "@takeoff-core/takeoffFabricationRules.mjs";
import { makeTakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import { getSupabase } from "./lib/supabase";
import { labApiGet, labApiPost, saveTakeoffCorrection, approveTakeoffJob, LabApiError } from "./lib/api";
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
export type RunPatch   = { label?: string; lengthIn?: number; depthIn?: number; assemblyNotes?: string };

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

// ── Component ──────────────────────────────────────────────────────────────

export default function TakeoffLabApp() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userMetaName, setUserMetaName] = useState<string>("");

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
  }, []);

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

  // ── Review workbench state (v6.1) ─────────────────────────────────────────
  /** Run IDs excluded by the estimator — filtered from computation but kept in editDraft */
  const [excludedRunIds, setExcludedRunIds] = useState<Set<string>>(() => new Set());
  /** Per-run reviewer notes keyed by run.id */
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  /** Per-evidence-dim review state (ignored | reviewed), keyed by dim id or label */
  const [evidenceReviewState, setEvidenceReviewState] = useState<Record<string, "ignored" | "reviewed">>({});

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
        };
        if (res.ok && res.normalizedTakeoffJson) {
          commitSource(res.normalizedTakeoffJson, "file");
          setSavedAt(res.savedAt ?? null);
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
    if (excludedRunIds.size === 0) return editDraft;
    return {
      ...editDraft,
      rooms: editDraft.rooms.map((room) => ({
        ...room,
        areas: room.areas.map((area: TakeoffArea) => ({
          ...area,
          runs: area.runs.filter((run: TakeoffRun) => !excludedRunIds.has(run.id)),
        })),
      })),
    };
  }, [editDraft, excludedRunIds]);

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

  const canApproveTakeoff = useMemo(() => {
    if (!takeoffJobId || !hasActiveSource) return false;
    if (workspaceReview?.reviewStatus === "approved") return false;
    if (activeState.validation.hasErrors || (activeState.validation.errorCount ?? 0) > 0) return false;
    if (qaGate?.status === "do_not_import") return false;
    return true;
  }, [takeoffJobId, hasActiveSource, workspaceReview?.reviewStatus, activeState.validation, qaGate?.status]);

  const approveBlockedReason = useMemo(() => {
    if (!takeoffJobId || !hasActiveSource) return "Load a takeoff workspace first.";
    if (workspaceReview?.reviewStatus === "approved") return "This takeoff is already approved.";
    if (activeState.validation.hasErrors || (activeState.validation.errorCount ?? 0) > 0) {
      return "Resolve validation errors before approval.";
    }
    if (qaGate?.status === "do_not_import") {
      return qaGate.headline ?? "QA gate blocks approval for this takeoff.";
    }
    return null;
  }, [takeoffJobId, hasActiveSource, workspaceReview?.reviewStatus, activeState.validation, qaGate]);

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
    setReviewNotes({});
    setEvidenceReviewState({});
  }

  // ── Workbench actions ─────────────────────────────────────────────────────

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
    setReviewNotes({});
    setEvidenceReviewState({});
  }, [hasEdits]);

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
    setReviewNotes({});
    setEvidenceReviewState({});
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

  const handleToggleExcludeRun = useCallback((runId: string) => {
    setExcludedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
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
    setSaveMsg(hasEdits ? "Saving reviewed draft with correction audit…" : "Saving reviewed draft…");
    try {
      const res = hasEdits
        ? await saveTakeoffCorrection(authToken, takeoffJobId, {
            takeoffResult: effectiveDraft,
            baseResultId: currentResultId,
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
        `${hasEdits ? "Correction saved" : "Reviewed draft saved"} — ${res.summary.countertopExactSf.toFixed(2)} sf countertop · ${res.summary.backsplashExactSf.toFixed(2)} sf backsplash`
      );
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Save failed.";
      setSaveStatus("error");
      setSaveMsg(msg);
    }
  }, [takeoffJobId, authToken, effectiveDraft, hasEdits, currentResultId]);

  const handleApproveTakeoff = useCallback(async () => {
    if (!takeoffJobId || !authToken || !canApproveTakeoff) return;
    setApproveStatus("approving");
    setApproveMsg("Validating and approving takeoff…");
    try {
      const res = await approveTakeoffJob(authToken, takeoffJobId, effectiveDraft);
      setApproveStatus("approved");
      setWorkspaceReview({
        reviewStatus: "approved",
        approvalStatus: "approved",
        canApprove: false,
        approvedAt: res.approvedAt,
        approvedByUserId: res.approvedByUserId,
        hasSavedResult: true,
      });
      setHistoryRefreshKey((k) => k + 1);
      setApproveMsg(
        `Takeoff approved — ${res.summary.countertopExactSf.toFixed(2)} sf countertop · ${res.summary.backsplashExactSf.toFixed(2)} sf backsplash. No quote was created.`
      );
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Approval failed.";
      setApproveStatus("error");
      setApproveMsg(msg);
    }
  }, [takeoffJobId, authToken, effectiveDraft, canApproveTakeoff]);

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

  const takeoffStatusSlot = (
    <div className="takeoff-topbar-status" aria-label="Takeoff lab boundaries">
      <span className="takeoff-topbar-pill takeoff-topbar-pill--lab">Review only</span>
      <span className="takeoff-topbar-pill takeoff-topbar-pill--safe">No quote mutation</span>
    </div>
  );

  // ── Derived display values ────────────────────────────────────────────────
  const sourceLabel: Record<DisplayMode, string> = {
    none:      "No source",
    spec73:    "Spec 73 demo sample",
    pasted:    "Pasted takeoff JSON",
    file:      planFilename ? `Plan: ${planFilename}` : "Uploaded plan",
    "ai-draft": planFilename ? `AI draft: ${planFilename}` : "AI draft",
    edited:    "Edited draft",
    invalid:   "Invalid draft",
  };
  const pillClass =
    displayMode === "invalid"   ? "source-pill source-pill--invalid"   :
    displayMode === "edited"    ? "source-pill source-pill--edited"    :
    displayMode === "ai-draft"  ? "source-pill source-pill--ai-draft"  :
    displayMode === "file"      ? "source-pill source-pill--file"      :
    "source-pill";

  const { result, computed, validation, importPlan } = activeState;

  const showPlanPreviewColumn = Boolean(takeoffJobId && planFileMeta && authToken);
  const isActiveReviewMode = Boolean(takeoffJobId && hasActiveSource && authToken);
  const hasBlockingValidation = Boolean(
    hasActiveSource && (validation.hasErrors || (validation.errorCount ?? 0) > 0)
  );
  const isTakeoffApproved = workspaceReview?.reviewStatus === "approved";
  const hasQaBlocker = qaGate?.status === "do_not_import";

  const reviewSections = hasActiveSource ? (
    <>
          {isActiveReviewMode && (
            <div className="takeoff-active-review-banner" role="status">
              <div className="takeoff-active-review-banner-main">
                <h2 className="takeoff-active-review-title">Active takeoff review</h2>
                <p className="takeoff-active-review-next">
                  {isTakeoffApproved
                    ? "Approved for future import — Internal Estimate import is not enabled yet."
                    : hasBlockingValidation || hasQaBlocker
                      ? "Fix validation and QA blockers below, then approve this takeoff."
                      : unresolvedCount > 0
                        ? "Complete the review checklist, then save and approve."
                        : "Review measurements beside the plan, then save and approve this takeoff."}
                </p>
              </div>
              {planFilename ? (
                <p className="takeoff-active-review-file">{planFilename}</p>
              ) : null}
            </div>
          )}

          {/* ── 1. Measurement summary ──────────────────────────────────── */}
          <section className="lab-section lab-section--review-primary">
            <h2 className="lab-section-title">Measurement summary</h2>
            <TakeoffSummaryCards
              computed={computed}
              importPlan={importPlan}
              reviewStatus={workspaceReview?.reviewStatus}
            />
          </section>

          {/* ── 2. Takeoff QA result ─────────────────────────────────────── */}
          {qaGate && (
            <section className="lab-section lab-section--review-primary">
              <h2 className="lab-section-title">QA &amp; blockers</h2>
              <TakeoffQaGatePanel qaGate={qaGate} fabricationFindings={fabricationFindings.length > 0 ? fabricationFindings : undefined} />
            </section>
          )}

          {/* ── 3. Plan notes & AI review flags ──────────────────────────── */}
          {(() => {
            const notes = gatherReviewNotes(result);
            if (notes.length === 0) return null;

            // Separate notes into categories by heuristic keywords
            const flagKeywords = /\b(assumed?|unclear|uncertain|ambiguous|estimate|inferred?|to reconcile|duplicate|missing|conflict|review|check|verify|note:|warning|caution)\b/i;
            const planNotes   = notes.filter((n) => !flagKeywords.test(n));
            const reviewFlags = notes.filter((n) =>  flagKeywords.test(n));

            return (
              <section className="lab-section">
                <h2 className="lab-section-title">Plan notes &amp; AI review flags</h2>
                <div className="ai-review-notes lab-card">
                  <p className="ai-review-notes-intro">
                    These are notes the AI noticed from the plan. Confirm anything flagged in the Review Workbench before saving.
                  </p>
                  {planNotes.length > 0 && (
                    <>
                      {reviewFlags.length > 0 && (
                        <p className="ai-review-notes-category">Plan notes</p>
                      )}
                      <ul className="ai-review-notes-list">
                        {planNotes.map((note, i) => (
                          <li key={i} className="ai-review-notes-item ai-review-notes-item--info">{note}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {reviewFlags.length > 0 && (
                    <>
                      <p className="ai-review-notes-category ai-review-notes-category--flags">AI flags — review before saving</p>
                      <ul className="ai-review-notes-list">
                        {reviewFlags.map((note, i) => (
                          <li key={i} className="ai-review-notes-item ai-review-notes-item--flag">{note}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </section>
            );
          })()}

          {/* ── 4. Review measurements (PRIMARY) ─────────────────────────── */}
          <section className="lab-section lab-section--review-primary">
            <div className="lab-section-header">
              <div>
                <h2 className="lab-section-title" style={{ margin: 0 }}>Review measurements</h2>
                <p className="lab-section-desc" style={{ marginTop: 4, marginBottom: 0 }}>
                  Edit dimensions, exclude incorrect runs, or mark flagged items reviewed.
                  The measurement totals above update instantly.
                </p>
              </div>
              {hasEdits && (
                <button className="btn-edit-action btn-edit-action--reset" onClick={handleResetEdits} type="button">
                  Reset edits
                </button>
              )}
            </div>
            <TakeoffValidationFixPanel
              editDraft={editDraft}
              validation={validation}
              onApplyDraft={handleApplyValidationFix}
            />
            <TakeoffReviewWorkbench
              editDraft={editDraft}
              dimensionEvidence={dimensionEvidence}
              excludedRunIds={excludedRunIds}
              reviewNotes={reviewNotes}
              evidenceReviewState={evidenceReviewState}
              onPatchRun={handlePatchRun}
              onPatchArea={handlePatchArea}
              onToggleExcludeRun={handleToggleExcludeRun}
              onSetReviewNote={handleSetReviewNote}
              onMarkEvidenceReviewed={handleMarkEvidenceReviewed}
            />
          </section>

          {/* ── 5. Review workflow ───────────────────────────────────────── */}
          {takeoffJobId && authToken && (
            <section className="lab-section lab-section--review-actions">
              <h2 className="lab-section-title">Save &amp; approve</h2>
              <div className="save-panel lab-card">
                {isTakeoffApproved && workspaceReview?.approvedAt ? (
                  <div className="save-panel-approved" role="status">
                    <span className="status-chip status-approved">Approved</span>
                    <span>
                      Approved{" "}
                      {new Date(workspaceReview.approvedAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      . Approved for future import — Internal Estimate import is not enabled yet.
                    </span>
                  </div>
                ) : (
                  <div className="save-panel-next-action" role="status">
                    Review, fix issues, then approve this takeoff.
                  </div>
                )}
                {unresolvedCount > 0 && (
                  <div className="save-panel-warning" role="alert">
                    <span className="save-panel-warning-icon">⚠</span>
                    <span>
                      <strong>{unresolvedCount} review item{unresolvedCount !== 1 ? "s" : ""} still unresolved</strong>{" "}
                      in the workbench checklist. You can save now, but resolve them before import.
                    </span>
                  </div>
                )}
                {excludedRunIds.size > 0 && (
                  <div className="save-panel-info-note">
                    <span className="save-panel-info-icon">ℹ</span>
                    <span>
                      {excludedRunIds.size} excluded run{excludedRunIds.size !== 1 ? "s" : ""} will not be saved.
                    </span>
                  </div>
                )}
                <div className="save-panel-inner">
                  <div className="save-panel-info">
                    <p className="save-panel-desc">
                      <strong>Save reviewed draft</strong> stores your in-progress review (correction audit
                      is recorded when you changed AI values).
                      <strong> Approve takeoff</strong> marks the workspace approved after server validation —
                      it does not create a quote or import into Internal Estimate.
                      Review status (<code>needs_review</code> / <code>approved</code>) updates automatically
                      when you save or approve — there is no manual status field.
                    </p>
                    {hasEdits ? (
                      <p className="save-panel-note">
                        Unsaved edits detected — saving will append a correction audit entry.
                      </p>
                    ) : null}
                    {savedAt && (
                      <p className="save-panel-last-saved">
                        Last saved:{" "}
                        <strong>{new Date(savedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</strong>
                      </p>
                    )}
                  </div>
                  <div className="save-panel-actions save-panel-actions--split">
                    <button
                      type="button"
                      className="save-panel-btn save-panel-btn--secondary"
                      disabled={saveStatus === "saving" || approveStatus === "approving"}
                      onClick={() => {
                        if (unresolvedCount > 0) {
                          if (!window.confirm(
                            `${unresolvedCount} review item${unresolvedCount !== 1 ? "s" : ""} are still unresolved. Save anyway? They should be resolved before approval.`
                          )) return;
                        }
                        void handleSaveDraft();
                      }}
                    >
                      {saveStatus === "saving" ? "Saving…" : "Save reviewed draft"}
                    </button>
                    <button
                      type="button"
                      className="save-panel-btn save-panel-btn--approve"
                      disabled={!canApproveTakeoff || approveStatus === "approving" || saveStatus === "saving"}
                      title={approveBlockedReason ?? undefined}
                      onClick={() => {
                        if (unresolvedCount > 0) {
                          if (!window.confirm(
                            `${unresolvedCount} review item${unresolvedCount !== 1 ? "s" : ""} are still unresolved. Approve anyway?`
                          )) return;
                        }
                        void handleApproveTakeoff();
                      }}
                    >
                      {approveStatus === "approving" ? "Approving…" : "Approve takeoff"}
                    </button>
                  </div>
                </div>
                {!canApproveTakeoff && approveBlockedReason && hasActiveSource ? (
                  <p className="save-panel-blocked" role="note">
                    Approval blocked: {approveBlockedReason}
                  </p>
                ) : null}
                {saveMsg && (
                  <p
                    className={`save-panel-msg${saveStatus === "error" ? " save-panel-msg--error" : saveStatus === "saved" ? " save-panel-msg--saved" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {saveStatus === "saved" ? "✓ " : saveStatus === "error" ? "✗ " : ""}
                    {saveMsg}
                  </p>
                )}
                {approveMsg && (
                  <p
                    className={`save-panel-msg${approveStatus === "error" ? " save-panel-msg--error" : approveStatus === "approved" ? " save-panel-msg--saved" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {approveStatus === "approved" ? "✓ " : approveStatus === "error" ? "✗ " : ""}
                    {approveMsg}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
              SECONDARY PANELS — collapsed by default
              All panels below are for reference or debugging. They do not
              affect the review workflow above.
              ════════════════════════════════════════════════════════════════ */}
          <div className="lab-secondary-group">
            <p className="lab-secondary-group-label">Technical details</p>

          {/* ── Evidence trace (auto-opens when issues exist) ─────────────── */}
          {dimensionEvidence && (
            <details
              className="lab-section lab-section-collapsible"
              open={hasEvidenceIssues || undefined}
            >
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Evidence trace</span>
                <span className="lab-section-summary-note">
                  {fullReconciliation?.checksRan
                    ? unresolvedCount > 0
                      ? `${unresolvedCount} issue${unresolvedCount !== 1 ? "s" : ""} — check workbench checklist`
                      : "all clear"
                    : "per-run traceability to dimension evidence"}
                </span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <p className="lab-section-desc">
                  Each final run traced against extracted dimension evidence. Use action buttons to apply evidence values or mark unused evidence reviewed.
                </p>
                <TakeoffEvidenceTracePanel
                  result={editDraft}
                  dimensionEvidence={dimensionEvidence}
                  actions={{
                    onUseEvidenceValue:     handlePatchRunById,
                    onAddEvidenceAsRun:     handleAddEvidenceAsRun,
                    onMarkEvidenceReviewed: handleMarkEvidenceReviewed,
                    evidenceReviewState,
                  }}
                />
              </div>
            </details>
          )}

          {/* ── Rooms, areas & runs (legacy tree view) ───────────────────── */}
          <details className="lab-section lab-section-collapsible">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>Rooms, areas &amp; runs</span>
              <span className="lab-section-summary-note">Tree view — use Review Workbench above for editing</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <div className="lab-section-header" style={{ marginBottom: 8 }}>
                <div className="edit-mode-controls">
                  {hasEdits && (
                    <button className="btn-edit-action btn-edit-action--reset" onClick={handleResetEdits} type="button">
                      Reset edits
                    </button>
                  )}
                  <button
                    className={`btn-edit-toggle${isEditing ? " btn-edit-toggle--active" : ""}`}
                    onClick={() => setIsEditing((v) => !v)}
                    type="button"
                  >
                    {isEditing ? "✓ Done editing" : "✎ Edit measurements"}
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="edit-mode-banner">
                  <span className="edit-mode-banner-icon">✎</span>
                  <span>Edit mode — changes update totals instantly. Use Review Workbench above for run-level edits.</span>
                </div>
              )}
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

          {/* ── Page inventory ───────────────────────────────────────────── */}
          {pageInventory && (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Page inventory</span>
                <span className="lab-section-summary-note">Plan page classification</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffPageInventoryPanel inventory={pageInventory} />
              </div>
            </details>
          )}

          {/* ── Dimension evidence ───────────────────────────────────────── */}
          {dimensionEvidence && (
            <details className="lab-section lab-section-collapsible">
              <summary className="lab-section-summary">
                <span className="lab-section-title" style={{ margin: 0 }}>Dimension evidence</span>
                <span className="lab-section-summary-note">Raw extracted dimensions from plan</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <TakeoffDimensionEvidencePanel
                  evidence={dimensionEvidence}
                  computed={computed}
                  validation={validation}
                />
              </div>
            </details>
          )}

          {/* ── Validation diagnostics ───────────────────────────────────── */}
          <details
            className="lab-section lab-section-collapsible"
            open={hasBlockingValidation || undefined}
          >
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>Validation diagnostics</span>
              <span className="lab-section-summary-note">
                {validation.errorCount > 0
                  ? `${validation.errorCount} error${validation.errorCount !== 1 ? "s" : ""}, ${validation.warningCount} warning${validation.warningCount !== 1 ? "s" : ""}`
                  : validation.warningCount > 0
                  ? `${validation.warningCount} warning${validation.warningCount !== 1 ? "s" : ""}`
                  : "no errors"}
              </span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <TakeoffDiagnosticsPanel validation={validation} />
            </div>
          </details>

          {/* ── Import preview ───────────────────────────────────────────── */}
          <details className="lab-section lab-section-collapsible">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>Import preview</span>
              <span className="lab-section-summary-note">
                {isTakeoffApproved
                  ? "Approved for future import — not enabled yet"
                  : importPlan.canImport
                    ? `${importPlan.rooms.length} room${importPlan.rooms.length !== 1 ? "s" : ""} mapped`
                    : "blocked — resolve issues first"}
              </span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <TakeoffImportPreview importPlan={importPlan} />
            </div>
          </details>

          </div>{/* end lab-secondary-group */}

          {/* ── Developer / benchmark tools (dev-only) ───────────────────── */}
          {showDevTools && (
          <details className="lab-section lab-section-collapsible lab-section-dev">
            <summary className="lab-section-summary">
              <span className="lab-section-title lab-section-title--dev" style={{ margin: 0 }}>Developer / benchmark tools</span>
              <span className="lab-section-summary-note">Internal model testing only</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <div className="dev-tools-notice" role="note">
                Benchmark presets are for internal model testing only.
                Estimator review should use the Review Workbench above.
                {benchmarkQaContext && (
                  <span className="dev-tools-active-badge"> · Benchmark active: {benchmarkQaContext.label}</span>
                )}
              </div>
              <TakeoffBenchmarkPanel
                computed={computed}
                dimensionEvidence={dimensionEvidence}
                validation={validation}
                onBenchmarkEvaluated={setBenchmarkQaContext}
              />
            </div>
          </details>
          )}

          {/* ── Debug JSON (dev-only) ─────────────────────────────────────── */}
          {showDevTools && (
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
          )}

          {/* Footer note */}
          <div className="lab-footer-note">
            <span className="lab-footer-schema">Schema v{result.schemaVersion}</span>
            <span className="lab-footer-status">
              Status: <strong className={`status-chip status-${result.status}`}>{result.status}</strong>
            </span>
            {takeoffJobId ? (
              <span className="lab-footer-safe">
                Workspace: <code className="lab-footer-job-id">{takeoffJobId}</code>
              </span>
            ) : (
              <span className="lab-footer-safe">
                Computations are deterministic and local.
              </span>
            )}
          </div>


    </>
  ) : null;

  return (
    <div className="shell page-ai-takeoff">
      {authChecked && authToken ? (
        <EliteosTopbar
          appName="AI Takeoff"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
          homeHref={homeBase}
          userName={userDisplayName}
          userEmail={userEmail}
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

      {/* ── Page intro + workflow explainer ───────────────────────── */}
      <div className="takeoff-page-hero" role="region" aria-label="AI Takeoff overview">
        <div className="takeoff-page-hero-inner">
          <div className="takeoff-page-hero-main">
            <p className="takeoff-page-eyebrow">AI Takeoff Lab · {workspaceName}</p>
            <h1 className="takeoff-page-heading">Review plan measurements before quoting</h1>
            <p className="takeoff-page-desc">
              Upload a plan, generate an AI measurement draft, correct what the model missed,
              and approve a reviewed takeoff for your organization. This tool prepares measurements —
              it does not create quotes or import into Internal Estimate yet.
            </p>
            <TakeoffWorkflowExplainer />
          </div>
          {authToken && hasActiveSource && (
            <aside className="takeoff-page-hero-aside" aria-label="Current session">
              <p className="takeoff-page-aside-label">Current session</p>
              <div className="hero-pills">
                <span className={pillClass}>
                  {displayMode === "invalid"  ? "⚠"  :
                   displayMode === "edited"   ? "✎"  :
                   displayMode === "ai-draft" ? "✦"  :
                   displayMode === "file"     ? "📄" :
                   displayMode === "spec73"   ? "⚙"  : "◎"}{" "}
                  {sourceLabel[displayMode]}
                </span>
                {displayMode === "ai-draft" && aiDraftMeta && (
                  <span className="source-pill source-pill--ai-meta">
                    {aiDraftMeta.promptVersion ?? "?"} · {aiDraftMeta.modelUsed ?? "model unknown"}
                  </span>
                )}
                {result.source?.fileName && displayMode !== "file" && displayMode !== "invalid" && displayMode !== "spec73" && (
                  <span className="source-pill source-pill--file">{result.source.fileName}</span>
                )}
                {hasEdits && displayMode !== "spec73" && (
                  <span className="source-pill source-pill--edit-note">Edited</span>
                )}
                {excludedRunIds.size > 0 && (
                  <span className="source-pill source-pill--excluded">{excludedRunIds.size} run{excludedRunIds.size !== 1 ? "s" : ""} excluded</span>
                )}
                {takeoffJobId && (
                  <>
                    <span className="source-pill source-pill--workspace">Workspace active</span>
                    <button
                      type="button"
                      className="start-new-btn"
                      onClick={handleStartNewTakeoff}
                      title="Clear this workspace from the screen and start a fresh takeoff (data is preserved)"
                    >
                      ↩ Start new takeoff
                    </button>
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="main" role="main">
        <div
          className={`lab-main-inner${
            showPlanPreviewColumn && hasActiveSource ? " lab-main-inner--active-review" : ""
          }${takeoffJobId && planFileMeta ? " lab-main-inner--review" : ""}`}
        >

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
                  {reviewSections ?? (
                    <section className="lab-section lab-section--review-primary">
                      <h2 className="lab-section-title">Review measurements</h2>
                      <p className="lab-section-desc">
                        Generate an AI draft from <strong>Source plan file</strong> below, or load a
                        saved result from <strong>AI extraction history</strong>, to review measurements
                        beside this plan.
                      </p>
                    </section>
                  )}
                </div>
              </div>
            </div>
          ) : null}

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
                  onSelectJob={handleSelectRun}
                />
              </section>
            )
          ) : null}

          {/* ── Source plan file (v4) ──────────────────────────────────── */}
          {hasActiveSource && takeoffJobId ? (
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
                  onWorkspaceCreated={(jobId, filename, file) => {
                    setTakeoffJobId(jobId);
                    setPlanFilename(filename);
                    setPlanFileMeta(file ?? null);
                    setHistoryRefreshKey((k) => k + 1);
                    const url = new URL(window.location.href);
                    url.searchParams.set("takeoffJobId", jobId);
                    window.history.replaceState({}, "", url.toString());
                  }}
                  onWorkspaceLoaded={(filename, meta) => {
                    setPlanFilename(filename);
                    if (meta?.file) setPlanFileMeta(meta.file);
                    if (meta) setWorkspaceReview(meta);
                  }}
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
                onWorkspaceCreated={(jobId, filename, file) => {
                  setTakeoffJobId(jobId);
                  setPlanFilename(filename);
                  setPlanFileMeta(file ?? null);
                  setHistoryRefreshKey((k) => k + 1);
                  const url = new URL(window.location.href);
                  url.searchParams.set("takeoffJobId", jobId);
                  window.history.replaceState({}, "", url.toString());
                }}
                onWorkspaceLoaded={(filename, meta) => {
                  setPlanFilename(filename);
                  if (meta?.file) setPlanFileMeta(meta.file);
                  if (meta) setWorkspaceReview(meta);
                }}
                onAiDraftGenerated={handleAiDraftGenerated}
                onPlanArchived={handleStartNewTakeoff}
                onProcessingTerminal={() => setHistoryRefreshKey((k) => k + 1)}
              />
            </section>
          )}

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
          {hasActiveSource && !showPlanPreviewColumn ? reviewSections : null}

        </div>
      </main>

      <footer className="footer-bar" role="contentinfo">
        <span>eliteOS · AI Takeoff</span>
        <span className="footer-meta">Authorized staff only — backend authorization is the source of truth.</span>
      </footer>
    </div>
  );
}
