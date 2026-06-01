/**
 * AI Takeoff Lab — top-level shell (v2: pasted JSON workbench).
 *
 * v1: loads Spec 73 fixture at init, read-only viewer.
 * v2: adds a JSON workbench panel — paste any TakeoffResult, validate,
 *     and see recomputed sf + diagnostics + import preview update live.
 *
 * Architecture:
 *   Spec 73 fixture (or pasted JSON)
 *     → computeTakeoffMeasurements  (deterministic sf)
 *     → validateTakeoffResult       (structured diagnostics)
 *     → planTakeoffImport           (RoomScopeBuilder-compatible plan)
 *   All pure functions. No API calls. No quote mutation.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { buildSpec73Fixture } from "@takeoff-core/fixtures/spec73.fixture.mjs";
import { computeTakeoffMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "@takeoff-core/takeoffValidator.mjs";
import { planTakeoffImport } from "@takeoff-core/takeoffImportPlanner.mjs";
import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";
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

export interface ActiveComputedState {
  result: TakeoffResult;
  computed: TakeoffComputedMeasurements;
  validation: TakeoffValidationResult;
  importPlan: TakeoffImportPlan;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeAll(result: TakeoffResult): ActiveComputedState {
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  const importPlan = planTakeoffImport(result, computed);
  return { result, computed, validation, importPlan };
}

function makeSpec73State(): ActiveComputedState {
  return computeAll(buildSpec73Fixture());
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TakeoffLabApp() {
  // Start with the Spec 73 fixture as the active/displayed state.
  const [activeState, setActiveState] = useState<ActiveComputedState>(makeSpec73State);
  const [sourceMode, setSourceMode] = useState<SourceMode>("spec73");
  const [pastedDraft, setPastedDraft] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-stringify the Spec 73 fixture so "Load Spec 73 sample" is instant.
  const spec73Json = useMemo(
    () => JSON.stringify(buildSpec73Fixture(), null, 2),
    []
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleLoadSample = useCallback(() => {
    setPastedDraft(spec73Json);
    setParseError(null);
    // Restore the spec73 computed state as the active display (it's already loaded).
    setActiveState(makeSpec73State());
    setSourceMode("spec73");
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

    // Basic structural check — must be an object with a rooms array.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setParseError("Invalid schema: root must be a JSON object (TakeoffResult).");
      setSourceMode("invalid");
      return;
    }

    // Run computations. The validator will surface any schema issues as diagnostics.
    try {
      const newState = computeAll(parsed as TakeoffResult);
      setActiveState(newState);
      setSourceMode("pasted");
      setParseError(null);
    } catch (err) {
      setParseError(`Computation error: ${err instanceof Error ? err.message : String(err)}`);
      setSourceMode("invalid");
    }
  }, [pastedDraft]);

  const handleReset = useCallback(() => {
    setPastedDraft("");
    setParseError(null);
    setActiveState(makeSpec73State());
    setSourceMode("spec73");
  }, []);

  const handleCopySummary = useCallback(() => {
    const { result, computed, validation, importPlan } = activeState;
    const srcLabel =
      sourceMode === "spec73"
        ? "Spec 73 sample"
        : sourceMode === "pasted"
          ? "Pasted takeoff JSON"
          : "Invalid draft";
    const lines = [
      "eliteOS AI Takeoff — Computed Summary",
      `Source: ${srcLabel}  ·  Schema: v${result.schemaVersion}  ·  Status: ${result.status}`,
      "",
      `Countertop:  ${computed.countertopExactSf.toFixed(2)} sf exact  (${computed.chargeableCountertopSf} sf chargeable)`,
      `Backsplash:  ${computed.backsplashExactSf.toFixed(2)} sf exact  (${computed.chargeableBacksplashSf} sf chargeable)`,
      `Combined:    ${computed.combinedExactSf.toFixed(2)} sf exact`,
      "",
      `Validator:   ${validation.errorCount} error${validation.errorCount !== 1 ? "s" : ""}, ${validation.warningCount} warning${validation.warningCount !== 1 ? "s" : ""}, ${validation.infoCount} info`,
      `Import:      ${importPlan.canImport ? `Ready — ${importPlan.rooms.length} room${importPlan.rooms.length !== 1 ? "s" : ""} mapped` : `Blocked — ${importPlan.blockedReason ?? "see diagnostics"}`}`,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopyFeedback(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, [activeState, sourceMode]);

  // ── Source label ──────────────────────────────────────────────────────────
  const sourceLabel =
    sourceMode === "spec73"
      ? "Spec 73 sample"
      : sourceMode === "pasted"
        ? "Pasted takeoff JSON"
        : "Invalid draft";

  const sourceLabelClass =
    sourceMode === "invalid" ? "source-pill source-pill--invalid" : "source-pill";

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
            <span className={sourceLabelClass}>
              {sourceMode === "invalid" ? "⚠" : "◎"} {sourceLabel}
            </span>
            {result.source?.fileName && sourceMode !== "invalid" && (
              <span className="source-pill source-pill--file">{result.source.fileName}</span>
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
              onReset={handleReset}
              onCopySummary={handleCopySummary}
              parseError={parseError}
              copyFeedback={copyFeedback}
              sourceMode={sourceMode}
            />
          </section>

          {/* Summary cards */}
          <section className="lab-section">
            <h2 className="lab-section-title">Measurement summary</h2>
            <TakeoffSummaryCards computed={computed} importPlan={importPlan} />
          </section>

          {/* Room / area / run review */}
          <section className="lab-section">
            <h2 className="lab-section-title">Rooms, areas & runs</h2>
            <TakeoffRoomsReview fixture={result} computed={computed} />
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
