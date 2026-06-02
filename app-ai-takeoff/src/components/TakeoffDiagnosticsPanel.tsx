import React from "react";
import type { TakeoffValidationResult } from "@takeoff-core/takeoffValidator.mjs";
import type { TakeoffDiagnostic } from "@takeoff-core/takeoffContract.mjs";

const AI_REFERENCE_CODES = new Set([
  "TOTAL_MISMATCH_COUNTERTOP",
  "TOTAL_MISMATCH_BACKSPLASH",
  "TOTAL_MISMATCH_COMBINED",
  "AI_BACKSPLASH_TOTAL_NOT_STRUCTURED",
  "POSSIBLE_BACKSPLASH_NOTE",
]);

interface Props {
  validation: TakeoffValidationResult;
}

function DiagRow({ d }: { d: TakeoffDiagnostic }) {
  return (
    <div className={`diag-row diag-row--${d.level}`}>
      <span className="diag-level">{d.level.toUpperCase()}</span>
      <span className="diag-code">{d.code}</span>
      <span className="diag-message">{d.message}</span>
      {d.path && <span className="diag-path">{d.path}</span>}
    </div>
  );
}

export default function TakeoffDiagnosticsPanel({ validation }: Props) {
  if (!validation.hasErrors && !validation.hasWarnings && validation.infoCount === 0) {
    return (
      <div className="lab-card diag-clean">
        <span className="diag-clean-icon">✓</span>
        <span className="diag-clean-text">No validation issues — all dimensions valid, AI totals match computed values.</span>
      </div>
    );
  }

  const errors = validation.diagnostics.filter((d) => d.level === "error");
  const warnings = validation.diagnostics.filter((d) => d.level === "warning");
  const infos = validation.diagnostics.filter((d) => d.level === "info");

  return (
    <div className="lab-card diag-panel">
      <div className="diag-summary">
        {errors.length > 0 && (
          <span className="diag-summary-chip diag-summary--error">
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="diag-summary-chip diag-summary--warning">
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </span>
        )}
        {infos.length > 0 && (
          <span className="diag-summary-chip diag-summary--info">
            {infos.length} info
          </span>
        )}
      </div>

      {errors.length > 0 && (
        <div className="diag-group">
          <div className="diag-group-label">Errors — must resolve before import</div>
          {errors.map((d, i) => <DiagRow key={i} d={d} />)}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="diag-group">
          <div className="diag-group-label">Warnings — review recommended</div>
          {warnings.map((d, i) => <DiagRow key={i} d={d} />)}
          {warnings.some((d) => AI_REFERENCE_CODES.has(d.code)) && (
            <p className="diag-ai-note">
              AI reference totals are not authoritative — eliteOS computed values are based on
              structured run dimensions, not the model&apos;s estimates. Countertop and backsplash
              square footage shown above are the eliteOS-computed values.
            </p>
          )}
        </div>
      )}
      {infos.length > 0 && (
        <div className="diag-group">
          <div className="diag-group-label">Info</div>
          {infos.map((d, i) => <DiagRow key={i} d={d} />)}
        </div>
      )}
    </div>
  );
}
