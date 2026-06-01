/**
 * AI Takeoff Lab — top-level shell.
 *
 * Lab v1: loads the Spec 73 fixture and runs all pure computations at init.
 * No API calls. No file upload. No quote mutation. Read-only review UI.
 */
import React, { useMemo } from "react";
import { buildSpec73Fixture } from "@takeoff-core/fixtures/spec73.fixture.mjs";
import { computeTakeoffMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "@takeoff-core/takeoffValidator.mjs";
import { planTakeoffImport } from "@takeoff-core/takeoffImportPlanner.mjs";
import TakeoffSummaryCards from "./components/TakeoffSummaryCards";
import TakeoffRoomsReview from "./components/TakeoffRoomsReview";
import TakeoffDiagnosticsPanel from "./components/TakeoffDiagnosticsPanel";
import TakeoffImportPreview from "./components/TakeoffImportPreview";

export default function TakeoffLabApp() {
  const { fixture, computed, validation, importPlan } = useMemo(() => {
    const fixture = buildSpec73Fixture();
    const computed = computeTakeoffMeasurements(fixture);
    const validation = validateTakeoffResult(fixture, computed);
    const importPlan = planTakeoffImport(fixture, computed);
    return { fixture, computed, validation, importPlan };
  }, []);

  return (
    <div className="lab-root">
      {/* ── Top bar ──────────────────────────────────────────────── */}
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

      {/* ── Page hero ────────────────────────────────────────────── */}
      <div className="lab-hero">
        <div className="lab-hero-inner">
          <h1 className="lab-hero-title">AI Takeoff Lab</h1>
          <p className="lab-hero-sub">
            Review countertop and backsplash measurements before they become quote data.
            AI proposes dimensions — eliteOS recomputes and validates independently.
          </p>
          <div className="lab-fixture-pill">
            Viewing fixture: <strong>Spec 73</strong>
            {fixture.source?.fileName && (
              <span className="lab-fixture-file">{fixture.source.fileName}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="lab-main">
        <div className="lab-main-inner">
          {/* Summary cards */}
          <section className="lab-section">
            <h2 className="lab-section-title">Measurement summary</h2>
            <TakeoffSummaryCards computed={computed} importPlan={importPlan} />
          </section>

          {/* Room / area / run review */}
          <section className="lab-section">
            <h2 className="lab-section-title">Rooms, areas & runs</h2>
            <TakeoffRoomsReview fixture={fixture} computed={computed} />
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
          {(fixture.projectAssumptions?.length ?? 0) > 0 && (
            <section className="lab-section">
              <h2 className="lab-section-title">Project assumptions</h2>
              <div className="lab-card">
                <ul className="lab-assumption-list">
                  {fixture.projectAssumptions!.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Footer note */}
          <div className="lab-footer-note">
            <span className="lab-footer-schema">Schema v{fixture.schemaVersion}</span>
            <span className="lab-footer-status">
              Takeoff status: <strong className={`status-chip status-${fixture.status}`}>{fixture.status}</strong>
            </span>
            <span className="lab-footer-safe">
              All computations are deterministic and local. No data is sent anywhere.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
