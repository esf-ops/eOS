/**
 * AI Takeoff Lab — top-level shell (v3: editable review fields).
 *
 * v1: loads Spec 73 fixture at init, read-only viewer.
 * v2: adds JSON workbench (paste + validate).
 * v3: adds inline edit mode — edit run dimensions, room/area names,
 *     backsplash assumptions; eliteOS recomputes on every change.
 *
 * State model:
 *   sourceResult  — the last validated source TakeoffResult (never mutated by edits)
 *   editDraft     — a mutable copy; patch handlers produce new objects immutably
 *   hasEdits      — derived: editDraft.rooms ≠ sourceResult.rooms
 *   displayMode   — "spec73" | "pasted" | "edited" | "invalid"
 *   activeState   — always computed from editDraft (pure, synchronous)
 *
 * No API calls. No quote mutation. All computations are local.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
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

// ── Types ──────────────────────────────────────────────────────────────────

export type SourceMode = "spec73" | "pasted" | "invalid";
export type DisplayMode = "spec73" | "pasted" | "edited" | "invalid";

export interface ActiveComputedState {
  result: TakeoffResult;
  computed: TakeoffComputedMeasurements;
  validation: TakeoffValidationResult;
  importPlan: TakeoffImportPlan;
}

// Patch types for each level
export type RoomPatch  = { name?: string };
export type AreaPatch  = { label?: string; backsplashLinearIn?: number; backsplashHeightIn?: number };
export type RunPatch   = { label?: string; lengthIn?: number; depthIn?: number };

// ── Helpers ────────────────────────────────────────────────────────────────

function computeAll(result: TakeoffResult): ActiveComputedState {
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  const importPlan = planTakeoffImport(result, computed);
  return { result, computed, validation, importPlan };
}

function makeSpec73(): TakeoffResult { return buildSpec73Fixture(); }

// ── Component ──────────────────────────────────────────────────────────────

export default function TakeoffLabApp() {
  // ── Source state (last validated; never mutated by UI edits) ─────────────
  const [sourceResult, setSourceResult] = useState<TakeoffResult>(makeSpec73);
  const [sourceMode, setSourceMode] = useState<SourceMode>("spec73");

  // ── Edit draft (starts = sourceResult; patched by inline edit handlers) ──
  const [editDraft, setEditDraft] = useState<TakeoffResult>(makeSpec73);
  const [isEditing, setIsEditing] = useState(false);

  // Increment to force remount of uncontrolled inputs when source resets.
  const [resetKey, setResetKey] = useState(0);

  // ── Workbench state ───────────────────────────────────────────────────────
  const [pastedDraft, setPastedDraft] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // ── Copy feedback (tracks which button is in "Copied" state) ─────────────
  const [copyFeedback, setCopyFeedback] = useState<"summary" | "json" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived: has the user edited anything relative to sourceResult? ───────
  const hasEdits = useMemo(
    () => JSON.stringify(editDraft.rooms) !== JSON.stringify(sourceResult.rooms),
    [editDraft.rooms, sourceResult.rooms]
  );

  // ── Derived: display mode for pill label ────────────────────────────────
  const displayMode: DisplayMode =
    sourceMode === "invalid" ? "invalid" :
    hasEdits ? "edited" :
    sourceMode;

  // ── Active computed state — always from editDraft ─────────────────────
  const activeState = useMemo((): ActiveComputedState => {
    try { return computeAll(editDraft); }
    catch { return computeAll(makeSpec73()); }
  }, [editDraft]);

  // ── Spec 73 JSON (pre-stringified for fast "Load sample") ────────────────
  const spec73Json = useMemo(() => JSON.stringify(makeSpec73(), null, 2), []);

  // ── Helper: commit a new source (validate/load) ──────────────────────────
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
    const srcLabel = { spec73: "Spec 73 sample", pasted: "Pasted takeoff JSON", edited: "Edited draft", invalid: "Invalid draft" }[displayMode];
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
    ].join("\n"));
  }, [activeState, displayMode]);

  const handleCopyEditedJson = useCallback(() => {
    triggerCopy("json", JSON.stringify(editDraft, null, 2));
  }, [editDraft]);

  // ── Derived display values ─────────────────────────────────────────────
  const sourceLabel: Record<DisplayMode, string> = {
    spec73:  "Spec 73 sample",
    pasted:  "Pasted takeoff JSON",
    edited:  "Edited draft",
    invalid: "Invalid draft",
  };
  const pillClass =
    displayMode === "invalid" ? "source-pill source-pill--invalid" :
    displayMode === "edited"  ? "source-pill source-pill--edited"  :
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
          <div className="lab-topbar-badges">
            <span className="badge badge-lab">Lab · review only</span>
            <span className="badge badge-safe">No quote mutation</span>
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
              {displayMode === "invalid" ? "⚠" : displayMode === "edited" ? "✎" : "◎"}{" "}
              {sourceLabel[displayMode]}
            </span>
            {result.source?.fileName && displayMode !== "invalid" && (
              <span className="source-pill source-pill--file">{result.source.fileName}</span>
            )}
            {hasEdits && (
              <span className="source-pill source-pill--edit-note">
                Changes are local to this Lab session
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="lab-main">
        <div className="lab-main-inner">

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
              displayMode={displayMode}
            />
          </section>

          {/* Summary cards */}
          <section className="lab-section">
            <h2 className="lab-section-title">Measurement summary</h2>
            <TakeoffSummaryCards computed={computed} importPlan={importPlan} />
          </section>

          {/* Room / area / run review (with optional edit mode) */}
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

          {/* Assumptions */}
          {(result.projectAssumptions?.length ?? 0) > 0 && (
            <section className="lab-section">
              <h2 className="lab-section-title">Project assumptions</h2>
              <div className="lab-card">
                <ul className="lab-assumption-list">
                  {result.projectAssumptions!.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="lab-footer-note">
            <span className="lab-footer-schema">Schema v{result.schemaVersion}</span>
            <span className="lab-footer-status">
              Status: <strong className={`status-chip status-${result.status}`}>{result.status}</strong>
            </span>
            <span className="lab-footer-safe">
              All computations are deterministic and local — no data is sent anywhere.
            </span>
          </div>

        </div>
      </main>
    </div>
  );
}
