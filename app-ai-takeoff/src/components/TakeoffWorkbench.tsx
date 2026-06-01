/**
 * TakeoffWorkbench — JSON workbench panel (v3).
 *
 * Buttons:
 *   - Load Spec 73 sample → fills textarea + resets to spec73
 *   - Validate takeoff    → parse + compute + validate + import-plan
 *   - Reset               → clears textarea + restores Spec 73 ("Reset all")
 *   - Copy summary        → copies computed sf/diagnostics summary
 *   - Copy edited JSON    → copies current editDraft as JSON (shown when applicable)
 */
import React from "react";
import type { DisplayMode } from "../TakeoffLabApp";

interface Props {
  pastedDraft: string;
  onDraftChange: (s: string) => void;
  onLoadSample: () => void;
  onValidate: () => void;
  onResetAll: () => void;
  onCopySummary: () => void;
  onCopyEditedJson: () => void;
  parseError: string | null;
  copyFeedback: "summary" | "json" | null;
  displayMode: DisplayMode;
}

export default function TakeoffWorkbench({
  pastedDraft,
  onDraftChange,
  onLoadSample,
  onValidate,
  onResetAll,
  onCopySummary,
  onCopyEditedJson,
  parseError,
  copyFeedback,
  displayMode,
}: Props) {
  const charCount = pastedDraft.length;
  const showEditedJson = displayMode === "edited" || displayMode === "pasted" || displayMode === "spec73";

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
            onClick={onResetAll}
            type="button"
            aria-label="Reset all to Spec 73"
            title="Reset all — restores Spec 73 sample and clears edits"
          >
            Reset all
          </button>
          {showEditedJson && (
            <button
              className={`btn-wb btn-wb--copy${copyFeedback === "json" ? " btn-wb--copied" : ""}`}
              onClick={onCopyEditedJson}
              type="button"
              title="Copy current TakeoffResult JSON (including any edits)"
            >
              {copyFeedback === "json" ? "✓ Copied JSON" : "Copy edited JSON"}
            </button>
          )}
          <button
            className={`btn-wb btn-wb--copy${copyFeedback === "summary" ? " btn-wb--copied" : ""}`}
            onClick={onCopySummary}
            type="button"
          >
            {copyFeedback === "summary" ? "✓ Copied" : "Copy summary"}
          </button>
          <button className="btn-wb btn-wb--primary" onClick={onValidate} type="button">
            Validate takeoff
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="workbench-textarea-wrap">
        <textarea
          className={`workbench-textarea${
            displayMode === "invalid" ? " workbench-textarea--error" :
            displayMode === "pasted"  ? " workbench-textarea--ok" :
            ""
          }`}
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
          {displayMode === "pasted" && !parseError && (
            <span className="workbench-status-ok">✓ Valid — displayed below</span>
          )}
          {displayMode === "edited" && (
            <span className="workbench-status-edited">✎ Edited draft — use "Copy edited JSON" to export</span>
          )}
          {displayMode === "spec73" && (
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
