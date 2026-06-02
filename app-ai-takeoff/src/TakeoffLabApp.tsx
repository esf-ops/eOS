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
 *   sourceResult  — the last validated source TakeoffResult (never mutated by edits)
 *   editDraft     — a mutable copy; patch handlers produce new objects immutably
 *   hasEdits      — derived: editDraft.rooms ≠ sourceResult.rooms
 *   displayMode   — "spec73" | "pasted" | "file" | "ai-draft" | "edited" | "invalid"
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
import TakeoffRunHistoryPanel from "./components/TakeoffRunHistoryPanel";
import TakeoffDebugPanel from "./components/TakeoffDebugPanel";
import TakeoffPageInventoryPanel from "./components/TakeoffPageInventoryPanel";
import type { PageInventory } from "./components/TakeoffPageInventoryPanel";
import { getSupabase } from "./lib/supabase";
import { resolveAccessToken } from "./lib/authSession";
import { labApiGet, labApiPost, LabApiError } from "./lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export type SourceMode = "spec73" | "pasted" | "file" | "ai-draft" | "invalid";
export type DisplayMode = "spec73" | "pasted" | "file" | "ai-draft" | "edited" | "invalid";

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
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Sign-in form
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) { setAuthChecked(true); return; }
    void resolveAccessToken(supabase).then(async (tok) => {
      setAuthToken(tok);
      setAuthChecked(true);
      if (tok) {
        const { data } = await supabase.auth.getUser();
        setUserEmail(data.user?.email ?? null);
      }
    });
    // Listen for auth changes (sign-in / sign-out).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const tok = await resolveAccessToken(supabase);
      setAuthToken(tok);
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
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
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) throw error;
      setAuthPassword(""); // clear password from memory
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
    setUserEmail(null);
  }, []);

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
  const [pageInventory, setPageInventory] = useState<PageInventory | null>(null);

  // ── Workspace state (file-backed) ────────────────────────────────────────
  const [takeoffJobId, setTakeoffJobId] = useState<string | null>(urlJobId);
  const [planFilename, setPlanFilename] = useState<string | null>(null);

  // ── Source state (last validated; never mutated by UI edits) ─────────────
  const [sourceResult, setSourceResult] = useState<TakeoffResult>(makeSpec73);
  const [sourceMode, setSourceMode] = useState<SourceMode>("spec73");

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

  const displayMode: DisplayMode =
    sourceMode === "invalid"   ? "invalid"   :
    hasEdits                   ? "edited"    :
    sourceMode;

  const activeState = useMemo((): ActiveComputedState => {
    try { return computeAll(editDraft); }
    catch { return computeAll(makeSpec73()); }
  }, [editDraft]);

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
    const srcLabel = {
      spec73: "Spec 73 sample", pasted: "Pasted takeoff JSON",
      file: planFilename ?? "Plan file", edited: "Edited draft", invalid: "Invalid draft",
    }[displayMode];
    triggerCopy("summary", [
      "eliteOS AI Takeoff — Computed Summary",
      `Source: ${srcLabel}  ·  Schema: v${result.schemaVersion}  ·  Status: ${result.status}`,
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
      pageInventory?: object | null;
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
    setPageInventory((meta.pageInventory as PageInventory | null) ?? null);
  }, []);

  // ── Handle loading a historical run from run history panel (v5.3) ─────────

  const handleLoadHistoricalRun = useCallback((
    result: TakeoffResult,
    meta:   {
      promptVersion:  string | null;
      modelUsed:      string | null;
      resultId:       string;
      pageInventory?: PageInventory | null;
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
  }, []);

  // ── Derived display values ────────────────────────────────────────────────
  const sourceLabel: Record<DisplayMode, string> = {
    spec73:    "Spec 73 sample",
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
    <div className="lab-root">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="lab-topbar">
        <div className="lab-topbar-inner">
          <div className="lab-topbar-brand">
            <span className="lab-topbar-wordmark">eliteOS</span>
            <span className="lab-topbar-divider" aria-hidden>·</span>
            <span className="lab-topbar-head">AI Takeoff Lab</span>
          </div>
          <div className="lab-topbar-right">
            <div className="lab-topbar-badges">
              <span className="badge badge-lab">Lab · review only</span>
              <span className="badge badge-safe">No quote mutation</span>
            </div>
            {authChecked && (
              authToken
                ? <div className="auth-topbar-user">
                    {userEmail && <span className="auth-topbar-email">{userEmail}</span>}
                    <button type="button" className="auth-topbar-signout" onClick={() => void signOut()}>
                      Sign out
                    </button>
                  </div>
                : <span className="badge badge-unauthed">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      {/* ── Page hero ─────────────────────────────────────────────── */}
      <div className="lab-hero">
        <div className="lab-hero-inner">
          <h1 className="lab-hero-title">AI Takeoff Lab</h1>
          <p className="lab-hero-sub">
            Review countertop and backsplash measurements before they become quote data.
            AI proposes dimensions — eliteOS recomputes and validates independently.
          </p>
          <div className="hero-pills">
            <span className={pillClass}>
              {displayMode === "invalid"  ? "⚠"  :
               displayMode === "edited"   ? "✎"  :
               displayMode === "ai-draft" ? "✦"  :
               displayMode === "file"     ? "📄" : "◎"}{" "}
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
            {result.source?.fileName && displayMode !== "file" && displayMode !== "invalid" && (
              <span className="source-pill source-pill--file">{result.source.fileName}</span>
            )}
            {hasEdits && (
              <span className="source-pill source-pill--edit-note">
                Changes are local to this Lab session
              </span>
            )}
            {takeoffJobId && (
              <span className="source-pill source-pill--workspace">
                Workspace active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="lab-main">
        <div className="lab-main-inner">

          {/* ── Sign-in panel (shown only when not authenticated) ─────── */}
          {authChecked && !authToken && (
            <section className="lab-section">
              <h2 className="lab-section-title">Sign in</h2>
              <div className="auth-panel lab-card">
                <p className="auth-panel-desc">
                  Sign in to upload plan files, create workspaces, and generate AI drafts.
                  The JSON workbench and Spec 73 sample are available without sign-in.
                </p>
                {!getSupabase() && (
                  <div className="auth-panel-warn">
                    <strong>Supabase is not configured.</strong>{" "}
                    Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code> file.
                  </div>
                )}
                <div className="auth-panel-fields">
                  <label className="auth-panel-label">
                    Email
                    <input
                      type="email"
                      className="auth-panel-input"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      autoComplete="username"
                      disabled={authBusy || !getSupabase()}
                      onKeyDown={(e) => e.key === "Enter" && void signIn()}
                    />
                  </label>
                  <label className="auth-panel-label">
                    Password
                    <input
                      type="password"
                      className="auth-panel-input"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={authBusy || !getSupabase()}
                      onKeyDown={(e) => e.key === "Enter" && void signIn()}
                    />
                  </label>
                </div>
                {authError && (
                  <div className="auth-panel-error" role="alert">{authError}</div>
                )}
                <button
                  type="button"
                  className="auth-panel-btn"
                  disabled={authBusy || !authEmail.trim() || !authPassword || !getSupabase()}
                  onClick={() => void signIn()}
                >
                  {authBusy ? "Signing in…" : "Sign in"}
                </button>
              </div>
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

          {/* JSON workbench */}
          <section className="lab-section">
            <h2 className="lab-section-title">JSON workbench</h2>
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
              displayMode={displayMode as "spec73" | "pasted" | "edited" | "invalid"}
            />
          </section>

          {/* Summary cards */}
          <section className="lab-section">
            <h2 className="lab-section-title">Measurement summary</h2>
            <TakeoffSummaryCards computed={computed} importPlan={importPlan} />
          </section>

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
            <TakeoffBenchmarkPanel computed={computed} />
          </section>

          {/* ── Page inventory (v5.4) — shown when a page inventory is available ── */}
          {pageInventory && (
            <section className="lab-section">
              <h2 className="lab-section-title">Page inventory</h2>
              <TakeoffPageInventoryPanel inventory={pageInventory} />
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
            />
          </section>

          {/* Footer */}
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

        </div>
      </main>
    </div>
  );
}
