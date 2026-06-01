/**
 * TakeoffWorkbench — pasted JSON workbench panel.
 *
 * Provides:
 *   - "Load Spec 73 sample" → fills textarea with the known-good fixture JSON
 *   - Textarea for pasting any TakeoffResult JSON
 *   - "Validate takeoff" → triggers parse + compute + validate + import-plan
 *   - "Reset" → clears textarea + restores Spec 73
 *   - "Copy computed summary" → copies formatted sf/diagnostics summary to clipboard
 *   - Parse error display (friendly, non-crashing)
 */
import React from "react";
import type { SourceMode } from "../TakeoffLabApp";

interface Props {
  pastedDraft: string;
  onDraftChange: (s: string) => void;
  onLoadSample: () => void;
  onValidate: () => void;
  onReset: () => void;
  onCopySummary: () => void;
  parseError: string | null;
  copyFeedback: boolean;
  sourceMode: SourceMode;
}

export default function TakeoffWorkbench({
  pastedDraft,
  onDraftChange,
  onLoadSample,
  onValidate,
  onReset,
  onCopySummary,
  parseError,
  copyFeedback,
  sourceMode
}: Props) {
  const charCount = pastedDraft.length;

  return (
    <div className="workbench-card lab-card">
      {/* Toolbar */}
      <div className="workbench-toolbar">
        <div className="workbench-toolbar-left">
          <button className="btn-wb btn-wb--secondary" onClick={onLoadSample} type="button">
            Load Spec 73 sample
          </button>
          <span className="workbench-hint">
            or paste a <code>TakeoffResult</code> JSON below, then click Validate
          </span>
        </div>
        <div className="workbench-toolbar-right">
          <button
            className="btn-wb btn-wb--ghost"
            onClick={onReset}
            type="button"
            aria-label="Reset to Spec 73"
          >
            Reset
          </button>
          <button
            className={`btn-wb btn-wb--copy${copyFeedback ? " btn-wb--copied" : ""}`}
            onClick={onCopySummary}
            type="button"
          >
            {copyFeedback ? "✓ Copied" : "Copy summary"}
          </button>
          <button className="btn-wb btn-wb--primary" onClick={onValidate} type="button">
            Validate takeoff
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="workbench-textarea-wrap">
        <textarea
          className={`workbench-textarea${sourceMode === "invalid" ? " workbench-textarea--error" : sourceMode === "pasted" ? " workbench-textarea--ok" : ""}`}
          value={pastedDraft}
          onChange={(e) => onDraftChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={`Paste TakeoffResult JSON here…\n\nExample structure:\n{\n  "schemaVersion": "1.0",\n  "status": "reviewed",\n  "rooms": [\n    {\n      "id": "room-1",\n      "name": "Kitchen",\n      "areas": [\n        {\n          "id": "area-1",\n          "label": "Main counter",\n          "runs": [\n            { "id": "r1", "label": "Left wall", "lengthIn": 72, "depthIn": 25.5, "pieceType": "counter" }\n          ]\n        }\n      ]\n    }\n  ]\n}`}
          rows={12}
          aria-label="Paste TakeoffResult JSON"
        />
        <div className="workbench-textarea-footer">
          <span className="workbench-char-count">{charCount > 0 ? `${charCount.toLocaleString()} chars` : "Empty"}</span>
          {sourceMode === "pasted" && !parseError && (
            <span className="workbench-status-ok">✓ Valid — displayed below</span>
          )}
          {sourceMode === "spec73" && (
            <span className="workbench-status-info">Spec 73 sample active</span>
          )}
        </div>
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="workbench-error" role="alert">
          <span className="workbench-error-icon">⚠</span>
          <div className="workbench-error-body">
            <strong className="workbench-error-title">JSON parse error</strong>
            <span className="workbench-error-msg">{parseError}</span>
          </div>
        </div>
      )}

      {/* Schema hint */}
      <div className="workbench-schema-hint">
        <span>Schema v1.0 · </span>
        <span>Required: <code>schemaVersion</code>, <code>status</code> (reviewed/approved), <code>rooms[]</code> → <code>areas[]</code> → <code>runs[]</code> with <code>lengthIn</code> / <code>depthIn</code></span>
        <span> · Use <code>backsplashLinearIn</code> on an area for 4″ backsplash totals</span>
      </div>
    </div>
  );
}
