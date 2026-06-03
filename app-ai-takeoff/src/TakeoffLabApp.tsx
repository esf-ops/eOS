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
import TakeoffBenchmarkPanel from "./components/TakeoffBenchmarkPanel";
import type { BenchmarkQaContext } from "./components/TakeoffBenchmarkPanel";
import TakeoffRunHistoryPanel from "./components/TakeoffRunHistoryPanel";
import TakeoffDebugPanel from "./components/TakeoffDebugPanel";
import TakeoffQaGatePanel from "./components/TakeoffQaGatePanel";
import type { QaGateResult } from "./components/TakeoffQaGatePanel";
import TakeoffPageInventoryPanel from "./components/TakeoffPageInventoryPanel";
import type { PageInventory } from "./components/TakeoffPageInventoryPanel";
import TakeoffDimensionEvidencePanel from "./components/TakeoffDimensionEvidencePanel";
import type { DimensionEvidence } from "./components/TakeoffDimensionEvidencePanel";
import { getSupabase } from "./lib/supabase";
import { labApiGet, labApiPost, LabApiError } from "./lib/api";

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
export type AreaPatch  = { label?: string; backsplashLinearIn?: number; backsplashHeightIn?: number };
export type RunPatch   = { label?: string; lengthIn?: number; depthIn?: number };

type SaveStatus = "idle" | "saving" | "saved" | "error";

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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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
    setUserMenuOpen(false);
  }, []);

  /** Close user menu on outside click or Escape. */
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setUserMenuOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

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

  // ── Copy feedback ─────────────────────────────────────────────────────────
  const [copyFeedback, setCopyFeedback] = useState<"summary" | "json" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load saved result from workspace ─────────────────────────────────────
  useEffect(() => {
    const jobId = urlJobId();
    if (!jobId || !authToken) return;
    void (async () => {
      try {
        const res = await labApiGet(`/api/takeoff-jobs/${encodeURIComponent(jobId)}/results/latest`, authToken) as {
          ok: boolean;
          normalizedTakeoffJson: TakeoffResult;
          savedAt: string;
        };
        if (res.ok && res.normalizedTakeoffJson) {
          commitSource(res.normalizedTakeoffJson, "file");
          setSavedAt(res.savedAt);
        }
      } catch {
        // No saved result yet — that's fine; Lab starts with spec73.
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]); // only on first token resolution

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

  const activeState = useMemo((): ActiveComputedState => {
    try { return computeAll(editDraft); }
    catch { return computeAll(makeSpec73()); }
  }, [editDraft]);

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

  const spec73Json = useMemo(() => JSON.stringify(makeSpec73(), null, 2), []);

  // ── Helper: commit a new source ───────────────────────────────────────────
  function commitSource(result: TakeoffResult, mode: SourceMode) {
    setSourceResult(result);
    setEditDraft(result);
    setSourceMode(mode);
    setParseError(null);
    setIsEditing(false);
    setResetKey((k) => k + 1);
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

    // ── Source / edit / display state — go to upload-first empty state ────
    setSourceResult(makeSpec73()); // keep computation fallback safe
    setEditDraft(makeSpec73());
    setSourceMode("none");
    setIsEditing(false);
    setResetKey((k) => k + 1);
  }, [hasEdits]);

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

  // ── Save reviewed takeoff ─────────────────────────────────────────────────

  const handleSaveDraft = useCallback(async () => {
    if (!takeoffJobId || !authToken) return;
    setSaveStatus("saving");
    setSaveMsg("Saving takeoff draft…");
    try {
      const res = await labApiPost(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/results`, authToken, {
        takeoffResult: editDraft,
        reviewStatus: "needs_review",
      }) as { ok: boolean; savedAt: string; summary: { countertopExactSf: number; backsplashExactSf: number } };
      setSaveStatus("saved");
      setSavedAt(res.savedAt);
      setSaveMsg(
        `Saved — ${res.summary.countertopExactSf.toFixed(2)} sf countertop · ${res.summary.backsplashExactSf.toFixed(2)} sf backsplash`
      );
    } catch (e) {
      const msg = e instanceof LabApiError ? e.message : e instanceof Error ? e.message : "Save failed.";
      setSaveStatus("error");
      setSaveMsg(msg);
    }
  }, [takeoffJobId, authToken, editDraft]);

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

  return (
    <div className="shell">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="topbar" role="banner">
        <a
          href={homeBase}
          className="brand-row brand-row-link"
          aria-label={`eliteOS AI Takeoff Lab — ${workspaceName}`}
        >
          <span className="brand-mark" aria-hidden>
            {workspaceLogoUrl ? <img src={workspaceLogoUrl} alt="" /> : null}
          </span>
          <span className="brand-text">
            <span className="brand-wordmark">eliteOS</span>
            <span className="brand-sub">AI Takeoff Lab · {workspaceName}</span>
          </span>
        </a>
        <div className="topbar-actions">
          <div className="topbar-badges">
            <span className="badge badge-lab">Lab · review only</span>
            <span className="badge badge-safe">No quote mutation</span>
          </div>
          {authChecked && authToken ? (
            <div className="topbar-account-wrap" ref={userMenuRef}>
              <button
                type="button"
                className={`topbar-account${userMenuOpen ? " is-open" : ""}`}
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <span className="topbar-avatar" aria-hidden>{userDisplayInitials}</span>
                <span className="topbar-account-text">
                  <span className="topbar-account-name">{userDisplayName}</span>
                  {userEmail && userEmail.toLowerCase() !== userDisplayName.toLowerCase() ? (
                    <span className="topbar-account-role">{userEmail}</span>
                  ) : null}
                </span>
                <span className="topbar-account-caret" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              {userMenuOpen ? (
                <div className="user-menu" role="menu" aria-label="Account menu">
                  <div className="user-menu-header">
                    <p className="user-menu-name">{userDisplayName}</p>
                    {userEmail ? <p className="user-menu-email">{userEmail}</p> : null}
                    <p className="user-menu-workspace">
                      <span>Workspace ·</span>{" "}
                      <strong>{workspaceName}</strong>
                    </p>
                  </div>
                  <div className="user-menu-list">
                    <a
                      href={homeBase}
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 11.5L12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
                        </svg>
                      </span>
                      <span className="user-menu-label">
                        <span>Open Home</span>
                        <span className="user-menu-meta">eliteOS Launcher</span>
                      </span>
                      <span className="user-menu-shortcut" aria-hidden>↗</span>
                    </a>
                  </div>
                  <div className="user-menu-footer">
                    <button
                      type="button"
                      className="user-menu-item user-menu-signout"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); void signOut(); }}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </span>
                      <span className="user-menu-label">Sign out</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {/* ── Compact page subheader (replaces dark hero block) ────── */}
      <div className="takeoff-page-sub" role="region" aria-label="Takeoff session status">
        <div className="takeoff-page-sub-inner">
          <div className="takeoff-page-sub-title">
            <h1 className="takeoff-page-heading">AI Takeoff Lab</h1>
            <p className="takeoff-page-desc">
              AI proposes countertop and backsplash dimensions — eliteOS recomputes and validates
              independently. No quote is created or mutated.
            </p>
          </div>
          {authToken && hasActiveSource && (
            <div className="hero-pills">
              <span className={pillClass}>
                {displayMode === "invalid"  ? "⚠"  :
                 displayMode === "edited"   ? "✎"  :
                 displayMode === "ai-draft" ? "✦"  :
                 displayMode === "file"     ? "📄" :
                 displayMode === "spec73"   ? "⚙"  : "◎"}{" "}
                {sourceLabel[displayMode]}
              </span>
              {displayMode === "ai-draft" && (
                <span className="source-pill source-pill--review-note">
                  AI draft · estimator review required
                </span>
              )}
              {displayMode === "ai-draft" && aiDraftMeta && (
                <span className="source-pill source-pill--ai-meta">
                  Prompt {aiDraftMeta.promptVersion ?? "?"} · {aiDraftMeta.modelUsed ?? "model unknown"}
                </span>
              )}
              {result.source?.fileName && displayMode !== "file" && displayMode !== "invalid" && displayMode !== "spec73" && (
                <span className="source-pill source-pill--file">{result.source.fileName}</span>
              )}
              {hasEdits && displayMode !== "spec73" && (
                <span className="source-pill source-pill--edit-note">
                  Changes are local to this Lab session
                </span>
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
          )}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="main" role="main">
        <div className="lab-main-inner">

          {/* ── Sign-in panel (shown only when not authenticated) ─────── */}
          {authChecked && !authToken && (
            <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
              <header className="auth-panel-header">
                <p className="auth-panel-eyebrow">AI Takeoff Lab · {workspaceName}</p>
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

          {/* ── Source plan file (v4) ──────────────────────────────────── */}
          <section className="lab-section">
            <h2 className="lab-section-title">Source plan file</h2>
            <TakeoffPlanFileSection
              takeoffJobId={takeoffJobId}
              token={authToken}
              onWorkspaceCreated={(jobId, filename) => {
                setTakeoffJobId(jobId);
                setPlanFilename(filename);
                // Update URL so the workspace survives a reload.
                const url = new URL(window.location.href);
                url.searchParams.set("takeoffJobId", jobId);
                window.history.replaceState({}, "", url.toString());
              }}
              onWorkspaceLoaded={(filename) => {
                setPlanFilename(filename);
              }}
              onAiDraftGenerated={handleAiDraftGenerated}
              onPlanArchived={handleStartNewTakeoff}
            />
          </section>

          {/* ── AI extraction run history (v5.3) ──────────────────────── */}
          {takeoffJobId && authToken && (
            <section className="lab-section">
              <h2 className="lab-section-title">AI extraction history</h2>
              <TakeoffRunHistoryPanel
                takeoffJobId={takeoffJobId}
                token={authToken}
                currentResultId={currentResultId}
                currentComputed={computed}
                refreshKey={historyRefreshKey}
                onLoadRun={handleLoadHistoricalRun}
              />
            </section>
          )}

          {/* JSON workbench — secondary / developer tool — collapsed by default */}
          <details className="lab-section lab-section-collapsible">
            <summary className="lab-section-summary">
              <span className="lab-section-title" style={{ margin: 0 }}>JSON workbench</span>
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

          {/* ── All measurement sections — only shown when a source is loaded ── */}
          {hasActiveSource && (
            <>

          {/* Summary cards */}
          <section className="lab-section">
            <h2 className="lab-section-title">Measurement summary</h2>
            <TakeoffSummaryCards computed={computed} importPlan={importPlan} />
          </section>

          {/* ── v5.8: Automatic QA gate — estimator-facing result ─────────── */}
          {qaGate && (
            <section className="lab-section">
              <h2 className="lab-section-title">Takeoff QA result</h2>
              <TakeoffQaGatePanel qaGate={qaGate} />
            </section>
          )}

          {/* AI review notes — visible whenever assumptions/notes exist in the result */}
          {(() => {
            const notes = gatherReviewNotes(result);
            if (notes.length === 0) return null;
            return (
              <section className="lab-section">
                <h2 className="lab-section-title">AI assumptions &amp; review notes</h2>
                <div className="ai-review-notes lab-card">
                  <p className="ai-review-notes-intro">
                    Review these AI-generated notes before saving or importing.
                    Correct any assumptions that do not match the plan.
                  </p>
                  <ul className="ai-review-notes-list">
                    {notes.map((note, i) => (
                      <li key={i} className="ai-review-notes-item">{note}</li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })()}

          {/* Room / area / run review */}
          <section className="lab-section">
            <div className="lab-section-header">
              <h2 className="lab-section-title" style={{ margin: 0 }}>Rooms, areas & runs</h2>
              <div className="edit-mode-controls">
                {hasEdits && !isEditing && (
                  <button className="btn-edit-action btn-edit-action--reset" onClick={handleResetEdits} type="button">
                    Reset edits
                  </button>
                )}
                {isEditing && hasEdits && (
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
                <span>Edit mode — changes update totals and diagnostics instantly. Changes are local to this Lab session.</span>
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
          </section>

          {/* ── Save reviewed takeoff draft (v4) ─────────────────────── */}
          {takeoffJobId && authToken && (
            <section className="lab-section">
              <h2 className="lab-section-title">Save reviewed takeoff</h2>
              <div className="save-panel lab-card">
                <div className="save-panel-inner">
                  <div className="save-panel-info">
                    <p className="save-panel-desc">
                      Save the current edited measurements as a reviewed draft tied to the workspace.
                      The backend recomputes all square footage independently from your dimensions.
                      No quote is created or mutated.
                    </p>
                    {savedAt && (
                      <p className="save-panel-last-saved">
                        Last saved:{" "}
                        <strong>{new Date(savedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</strong>
                      </p>
                    )}
                  </div>
                  <div className="save-panel-actions">
                    <button
                      type="button"
                      className="save-panel-btn"
                      disabled={saveStatus === "saving"}
                      onClick={() => void handleSaveDraft()}
                    >
                      {saveStatus === "saving" ? "Saving…" : "Save reviewed takeoff draft"}
                    </button>
                  </div>
                </div>
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
              </div>
            </section>
          )}

          {/* Validator diagnostics */}
          <section className="lab-section">
            <h2 className="lab-section-title">Validation diagnostics</h2>
            <TakeoffDiagnosticsPanel validation={validation} />
          </section>

          {/* Import preview */}
          <section className="lab-section">
            <h2 className="lab-section-title">Import preview</h2>
            <TakeoffImportPreview importPlan={importPlan} />
          </section>

          {/* ── Benchmark / QA evaluation (v5.2) ─────────────────────── */}
          <section className="lab-section">
            <h2 className="lab-section-title">Benchmark / QA evaluation</h2>
            <TakeoffBenchmarkPanel
              computed={computed}
              dimensionEvidence={dimensionEvidence}
              validation={validation}
              onBenchmarkEvaluated={setBenchmarkQaContext}
            />
          </section>

          {/* ── Page inventory (v5.4) — shown when a page inventory is available ── */}
          {pageInventory && (
            <section className="lab-section">
              <h2 className="lab-section-title">Page inventory</h2>
              <TakeoffPageInventoryPanel inventory={pageInventory} />
            </section>
          )}

          {/* ── Dimension evidence (v5.5/v5.6) — shown when evidence table is available ── */}
          {dimensionEvidence && (
            <section className="lab-section">
              <h2 className="lab-section-title">Dimension evidence</h2>
              <TakeoffDimensionEvidencePanel
                evidence={dimensionEvidence}
                computed={computed}
                validation={validation}
              />
            </section>
          )}

          {/* ── Debug: AI output (v5.3) — collapsed JSON view ──────────── */}
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
                All computations are deterministic and local — no data is sent anywhere.
              </span>
            )}
          </div>

            </> /* end hasActiveSource */
          )}

        </div>
      </main>

      <footer className="footer-bar" role="contentinfo">
        <span>eliteOS · AI Takeoff Lab</span>
        <span className="footer-meta">Authorized staff only — backend authorization is the source of truth.</span>
      </footer>
    </div>
  );
}
