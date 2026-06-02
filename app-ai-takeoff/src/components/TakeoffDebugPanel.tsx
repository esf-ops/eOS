/**
 * TakeoffDebugPanel — collapsed JSON debug view for the AI Takeoff Lab.
 *
 * Shows four collapsible sections:
 *   1. Normalized TakeoffResult JSON (the contract-validated structure)
 *   2. Computed measurements (eliteOS recomputed — not AI totals)
 *   3. Validation diagnostics (errors + warnings)
 *   4. Import plan JSON
 *
 * Each section has a "Copy" button for easy export to a text editor.
 *
 * This panel is Lab-internal only. It is never shown in Internal Estimate
 * or Quote Library. Keep it collapsed by default.
 */
import React, { useCallback, useState } from "react";
import type { TakeoffResult,
              TakeoffValidationResult,
              TakeoffImportPlan } from "@takeoff-core/takeoffContract.mjs";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import type { PageInventory }     from "./TakeoffPageInventoryPanel";
import type { DimensionEvidence } from "./TakeoffDimensionEvidencePanel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  result:             TakeoffResult;
  computed:           TakeoffComputedMeasurements;
  validation:         TakeoffValidationResult;
  importPlan:         TakeoffImportPlan;
  pageInventory?:     PageInventory | null;
  dimensionEvidence?: DimensionEvidence | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function prettyJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// ── Sub-component: single JSON section ───────────────────────────────────────

function DebugSection({
  title,
  data,
}: {
  title: string;
  data: unknown;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = prettyJson(data);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [data]);

  return (
    <div className="debug-section">
      <div className="debug-section-header">
        <span className="debug-section-title">{title}</span>
        <button
          type="button"
          className="debug-copy-btn"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="debug-json">{prettyJson(data)}</pre>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffDebugPanel({
  result,
  computed,
  validation,
  importPlan,
  pageInventory,
  dimensionEvidence,
}: Props) {
  return (
    <details className="debug-panel lab-card">
      <summary className="debug-panel-summary">
        <span className="debug-panel-title">Debug: AI output</span>
        <span className="debug-panel-hint">
          Normalized JSON · Computed · Diagnostics · Import plan
          {pageInventory     ? " · Page inventory"      : ""}
          {dimensionEvidence ? " · Dimension evidence"  : ""}
        </span>
      </summary>

      <div className="debug-panel-sections">
        <DebugSection
          title="Normalized TakeoffResult JSON"
          data={result}
        />
        <DebugSection
          title="Computed measurements (eliteOS recomputed)"
          data={computed}
        />
        <DebugSection
          title="Validation diagnostics"
          data={validation}
        />
        <DebugSection
          title="Import plan"
          data={importPlan}
        />
        {pageInventory && (
          <DebugSection
            title="Page inventory JSON"
            data={pageInventory}
          />
        )}
        {dimensionEvidence && (
          <DebugSection
            title="Dimension evidence JSON"
            data={dimensionEvidence}
          />
        )}
      </div>
    </details>
  );
}
