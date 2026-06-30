/**
 * TakeoffReviewWorkbench — estimator-facing run review table (v6.1).
 *
 * Lets the estimator:
 *   - Edit run dimensions (lengthIn, depthIn), labels, and area labels.
 *   - Exclude runs that should not count toward the total.
 *   - Add review notes per run.
 *   - See evidence status (supported / changed / conflict / unsupported) inline.
 *   - Review the completion checklist before saving.
 *
 * Pure display + local state callbacks. No backend calls, no quote mutation.
 * eliteOS recomputes measurement summary from the edited draft in the parent.
 */

import React, { useMemo, useState } from "react";
import { reconcileRunsWithEvidence } from "@takeoff-core/takeoffEvidenceRunReconciliation.mjs";
import { computeAreaSf } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import {
  buildAllPiecesDisplayIndex,
  formatBacksplashScopeLabel,
  formatPieceTypeLabel,
} from "@takeoff-core/reviewedTakeoffMath.mjs";
import type { TakeoffResult, TakeoffArea, TakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import type { DimensionEvidence } from "./TakeoffDimensionEvidencePanel";
import type { AreaPatch, RunPatch, RoomPatch, ManualRunInput } from "../TakeoffLabApp";
import { ADD_PIECE_PRESETS } from "@takeoff-core/takeoffWorkbenchHelpers.mjs";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RunLink {
  runId:          string;
  runLabel:       string;
  verdict:        "supported" | "changed" | "unsupported" | "exempt";
  conflicting:    boolean;
  nearestChanged: { label: string; lengthIn: number; pageNumber?: number } | null;
  matchedDims:    { label: string; lengthIn: number; pageNumber?: number }[];
}

interface ReconciliationResult {
  runLinks:                       RunLink[];
  unusedHighConfidenceDimensions: { id?: string; label: string; lengthIn: number; depthIn?: number | null; pageNumber?: number }[];
  unsupportedRuns:                RunLink[];
  changedRuns:                    RunLink[];
  conflictingRuns:                RunLink[];
  checksRan:                      boolean;
}

interface WorkbenchRow {
  roomIdx:   number;
  areaIdx:   number;
  runIdx:    number;
  roomName:  string;
  areaLabel: string;
  run:       TakeoffRun;
  link:      RunLink | null;
}

export interface TakeoffReviewWorkbenchProps {
  editDraft:           TakeoffResult;
  dimensionEvidence:   DimensionEvidence | null;
  excludedRunIds:      Set<string>;
  excludedRoomIds?:    Set<string>;
  manualRunIds?:       Set<string>;
  reviewNotes:         Record<string, string>;
  evidenceReviewState: Record<string, "ignored" | "reviewed">;
  /** Shared reviewed-takeoff math for totals and friendly labels */
  reviewedTotals?: {
    countertopSqft: number;
    totalBacksplashSqft: number;
    combinedSqft: number;
  } | null;
  onPatchRun:          (roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => void;
  onPatchArea:         (roomIdx: number, areaIdx: number, patch: AreaPatch) => void;
  onPatchRoom:         (roomIdx: number, patch: RoomPatch) => void;
  onSetRunIncluded:    (runId: string, included: boolean) => void;
  onRemoveManualRun?:  (runId: string) => void;
  onAddManualRun:      (input: ManualRunInput) => void;
  onSetReviewNote:     (runId: string, note: string) => void;
  /** Called from checklist — marks an evidence dim as reviewed so the checklist item clears */
  onMarkEvidenceReviewed: (dimId: string, status: "ignored" | "reviewed") => void;
}

// ── Verdict badge ──────────────────────────────────────────────────────────────

function EvidenceBadge({ link, excluded, isReviewed }: {
  link:       RunLink | null;
  excluded:   boolean;
  isReviewed: boolean;
}) {
  if (excluded) {
    return <span className="rw-badge rw-badge--excluded">excluded</span>;
  }
  if (!link || link.verdict === "exempt") {
    return null;
  }
  if (link.verdict === "supported" && !link.conflicting) {
    return <span className="rw-badge rw-badge--ok">✓ supported</span>;
  }
  // Issue rows: when the estimator has reviewed/accepted, show accepted badge
  if (isReviewed) {
    return <span className="rw-badge rw-badge--accepted">✓ accepted</span>;
  }
  if (link.verdict === "supported" && link.conflicting) {
    return <span className="rw-badge rw-badge--warn">⚠ conflict</span>;
  }
  if (link.verdict === "changed") {
    return <span className="rw-badge rw-badge--warn">⚠ changed</span>;
  }
  if (link.verdict === "unsupported") {
    return <span className="rw-badge rw-badge--error">✗ unsupported</span>;
  }
  return null;
}

// ── Evidence hint (inline guidance text per row) ───────────────────────────────

function EvidenceHint({ link }: { link: RunLink | null }) {
  if (!link || link.verdict === "exempt" || link.verdict === "supported") return null;
  if (link.verdict === "changed" && link.nearestChanged) {
    return (
      <span className="rw-ev-hint rw-ev-hint--warn">
        nearest plan dim: "{link.nearestChanged.label}" {link.nearestChanged.lengthIn}" · p.{link.nearestChanged.pageNumber ?? "?"}
      </span>
    );
  }
  if (link.verdict === "unsupported") {
    return <span className="rw-ev-hint rw-ev-hint--error">no plan evidence within ±10"</span>;
  }
  if (link.conflicting && link.matchedDims.length > 1) {
    return (
      <span className="rw-ev-hint rw-ev-hint--warn">
        conflict: {link.matchedDims.map((d) => `${d.lengthIn}"`).join(" vs ")}
      </span>
    );
  }
  return null;
}

// ── Area group header ──────────────────────────────────────────────────────────

interface AreaGroupHeaderProps {
  roomName:  string;
  areaLabel: string;
  roomIdx:   number;
  areaIdx:   number;
  onPatchRoom: (roomIdx: number, patch: RoomPatch) => void;
  onPatchArea: (roomIdx: number, areaIdx: number, patch: AreaPatch) => void;
}

function AreaGroupHeader({ roomName, areaLabel, roomIdx, areaIdx, onPatchRoom, onPatchArea }: AreaGroupHeaderProps) {
  return (
    <div className="rw-area-header">
      <input
        key={`room-${roomIdx}-${roomName}`}
        className="rw-area-room-input"
        type="text"
        defaultValue={roomName}
        aria-label={`Room name for ${roomName}`}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== roomName) onPatchRoom(roomIdx, { name: v });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
        }}
      />
      <span className="rw-area-sep">›</span>
      <input
        key={`area-${roomIdx}-${areaIdx}-${areaLabel}`}
        className="rw-area-label-input"
        type="text"
        defaultValue={areaLabel}
        aria-label={`Area / shape name for ${roomName} › ${areaLabel}`}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== areaLabel) onPatchArea(roomIdx, areaIdx, { label: v });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}

// ── Backsplash area row ────────────────────────────────────────────────────────

const BS_SCOPE_OPTIONS = [
  { value: "needs_review",   label: "Needs review" },
  { value: "standard",       label: "4\" backsplash" },
  { value: "full_height",    label: "Full-height backsplash" },
  { value: "no_stone",       label: "No stone backsplash" },
  { value: "tile_by_others", label: "No stone backsplash (tile by others)" },
] as const;

interface BacksplashAreaRowProps {
  area:              TakeoffArea;
  roomIdx:           number;
  areaIdx:           number;
  aiProvidedBsTotal: number;
  scopeLabel:        string;
  onPatchArea:       (roomIdx: number, areaIdx: number, patch: AreaPatch) => void;
}

function BacksplashAreaRow({ area, roomIdx, areaIdx, aiProvidedBsTotal, scopeLabel, onPatchArea }: BacksplashAreaRowProps) {
  const [editing, setEditing] = useState(false);
  const scope = (area.backsplashScope ?? "needs_review") as string;
  const showInputs = scope !== "no_stone" && scope !== "tile_by_others";

  const { backsplashSf } = computeAreaSf(area);

  const showAiHint =
    aiProvidedBsTotal > 0 &&
    showInputs &&
    !(area.backsplashManualSf ?? 0) &&
    !(area.backsplashLinearIn ?? 0);

  const handleScopeChange = (newScope: string) => {
    const patch: AreaPatch = { backsplashScope: newScope };
    if (newScope === "no_stone" || newScope === "tile_by_others") {
      patch.backsplashManualSf = 0;
      patch.backsplashLinearIn = 0;
    }
    onPatchArea(roomIdx, areaIdx, patch);
  };

  const handleUseAiTotal = () => {
    onPatchArea(roomIdx, areaIdx, {
      backsplashManualSf: aiProvidedBsTotal,
      backsplashScope: scope === "needs_review" ? "standard" : scope,
      backsplashReviewNote:
        `Used visible/reference backsplash total (${aiProvidedBsTotal.toFixed(2)} sf) after estimator review.`,
    });
  };

  if (!editing) {
    return (
      <div className="rw-bs-row rw-bs-row--display">
        <span className="rw-bs-label">Backsplash</span>
        <span className="rw-bs-display-scope">{scopeLabel}</span>
        <span className="rw-bs-computed">= {backsplashSf.toFixed(2)} sf</span>
        <button type="button" className="btn secondary btn-sm" onClick={() => setEditing(true)}>
          Edit backsplash
        </button>
      </div>
    );
  }

  return (
    <div className="rw-bs-row">
      <span className="rw-bs-label">Backsplash</span>

      <select
        className="rw-bs-scope-select"
        value={scope}
        onChange={(e) => handleScopeChange(e.target.value)}
        aria-label="Backsplash scope"
      >
        {BS_SCOPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {showInputs && (
        <>
          <label className="rw-bs-field">
            <span className="rw-bs-field-label">Height</span>
            <input
              key={`bsh-${area.id}-${area.backsplashHeightIn ?? ""}`}
              className="rw-dim-input rw-bs-input"
              type="number"
              step="0.5"
              min="0"
              placeholder="4"
              defaultValue={area.backsplashHeightIn ?? ""}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) onPatchArea(roomIdx, areaIdx, { backsplashHeightIn: v });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Backsplash height inches"
            />
            <span className="rw-dim-unit">"</span>
          </label>

          <label className="rw-bs-field">
            <span className="rw-bs-field-label">Linear in</span>
            <input
              key={`bsl-${area.id}-${area.backsplashLinearIn ?? ""}`}
              className="rw-dim-input rw-bs-input"
              type="number"
              step="1"
              min="0"
              defaultValue={area.backsplashLinearIn ?? ""}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0) onPatchArea(roomIdx, areaIdx, { backsplashLinearIn: v });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Backsplash linear inches"
            />
            <span className="rw-dim-unit">"</span>
          </label>

          <label className="rw-bs-field">
            <span className="rw-bs-field-label">Manual sf</span>
            <input
              key={`bsm-${area.id}-${area.backsplashManualSf ?? ""}`}
              className="rw-dim-input rw-bs-input"
              type="number"
              step="0.01"
              min="0"
              defaultValue={area.backsplashManualSf ?? ""}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0) onPatchArea(roomIdx, areaIdx, { backsplashManualSf: v });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Manual backsplash square footage override"
            />
            <span className="rw-dim-unit">sf</span>
          </label>
        </>
      )}

      <span className="rw-bs-computed">
        = {backsplashSf.toFixed(2)} sf
      </span>

      {showAiHint && (
        <button
          type="button"
          className="rw-bs-ai-btn"
          onClick={handleUseAiTotal}
          title={`AI/reference detected ${aiProvidedBsTotal.toFixed(2)} sf backsplash (not structured). Click to use as manual entry.`}
        >
          Use AI/ref total: {aiProvidedBsTotal.toFixed(2)} sf
        </button>
      )}

      <label className="rw-bs-note-field">
        <input
          key={`bsnote-${area.id}-${area.backsplashReviewNote ?? ""}`}
          className="rw-note-input rw-bs-note-input"
          type="text"
          defaultValue={area.backsplashReviewNote ?? ""}
          placeholder="Backsplash note…"
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (area.backsplashReviewNote ?? "")) {
              onPatchArea(roomIdx, areaIdx, { backsplashReviewNote: v });
            }
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          aria-label="Backsplash reviewer note"
        />
      </label>

      <button type="button" className="btn secondary btn-sm" onClick={() => setEditing(false)}>
        Done editing
      </button>
    </div>
  );
}

// ── Run row ────────────────────────────────────────────────────────────────────

interface RunRowProps {
  row:                WorkbenchRow;
  excluded:           boolean;
  isManual:           boolean;
  pieceTypeLabel:     string;
  statusLabel:        string;
  note:               string;
  onPatchRun:         (roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => void;
  onSetRunIncluded:   (runId: string, included: boolean) => void;
  onRemoveManualRun?: (runId: string) => void;
  onSetNote:          (runId: string, note: string) => void;
}

function PieceActionControl({
  runId,
  excluded,
  isManual,
  onSetRunIncluded,
  onRemoveManualRun,
}: {
  runId: string;
  excluded: boolean;
  isManual: boolean;
  onSetRunIncluded: (runId: string, included: boolean) => void;
  onRemoveManualRun?: (runId: string) => void;
}) {
  if (isManual) {
    return (
      <div className="rw-include-control">
        <span className="rw-include-status">Manual piece</span>
        <button
          type="button"
          className="btn secondary btn-sm"
          onClick={() => onRemoveManualRun?.(runId)}
        >
          Remove piece
        </button>
      </div>
    );
  }
  if (excluded) {
    return (
      <div className="rw-include-control">
        <span className="rw-include-status rw-include-status--excluded">Excluded from takeoff</span>
        <button
          type="button"
          className="btn secondary btn-sm"
          onClick={() => onSetRunIncluded(runId, true)}
        >
          Restore
        </button>
      </div>
    );
  }
  return (
    <div className="rw-include-control">
      <span className="rw-include-status">Included in takeoff</span>
      <button
        type="button"
        className="btn secondary btn-sm"
        onClick={() => onSetRunIncluded(runId, false)}
      >
        Exclude from takeoff
      </button>
    </div>
  );
}

function RunMeta({ link, excluded, isReviewed, sourcePages }: {
  link: RunLink | null;
  excluded: boolean;
  isReviewed: boolean;
  sourcePages?: number[];
}) {
  if (excluded) return null;
  const parts: string[] = [];
  if (sourcePages?.length) {
    parts.push(`p.${sourcePages.join(",")}`);
  }
  if (link && link.verdict !== "exempt") {
    if (link.verdict === "supported" && !link.conflicting) {
      if (!isReviewed) parts.push("evidence supported");
    } else if (isReviewed) {
      parts.push("reviewed");
    } else if (link.verdict === "unsupported") {
      parts.push("no matching plan evidence");
    } else if (link.verdict === "changed" && link.nearestChanged) {
      parts.push(`plan dim ${link.nearestChanged.lengthIn}"`);
    } else if (link.conflicting) {
      parts.push("evidence conflict");
    }
  }
  if (!parts.length) return null;
  return <span className="rw-run-meta">{parts.join(" · ")}</span>;
}

function RunRow({
  row,
  excluded,
  isManual,
  pieceTypeLabel,
  statusLabel,
  note,
  onPatchRun,
  onSetRunIncluded,
  onRemoveManualRun,
  onSetNote,
}: RunRowProps) {
  const { roomIdx, areaIdx, runIdx, run, link } = row;
  const [noteOpen, setNoteOpen] = useState(() => Boolean(note.trim()));

  const isCounter = (run.pieceType ?? "counter") === "counter";

  // A row "has an evidence issue" when it has a flagged verdict or conflicting match.
  const hasEvidenceIssue = !excluded && link !== null && (
    link.verdict === "unsupported" ||
    link.verdict === "changed" ||
    (link.verdict === "supported" && link.conflicting)
  );

  // A row is considered "reviewed / accepted" when it has an issue AND a reviewer note.
  // This is the same signal that countUnresolvedWorkbenchIssues uses.
  const isReviewed = hasEvidenceIssue && Boolean(note);

  const rowCls = [
    "rw-run-row",
    excluded ? "rw-run-row--excluded" : "",
    // Only show error/warn highlight when unresolved
    !excluded && !isReviewed && link?.verdict === "unsupported" ? "rw-run-row--error" : "",
    !excluded && !isReviewed && (link?.verdict === "changed" || link?.conflicting) ? "rw-run-row--warn" : "",
  ].filter(Boolean).join(" ");

  const ACCEPT_NOTE = "Reviewed and accepted as correct.";

  const handleAccept = () => {
    setNoteOpen(true);
    // Set the reviewer note state (drives checklist resolution)
    onSetNote(run.id, ACCEPT_NOTE);
    // Also bake into run.assemblyNotes so the note survives save/reload
    const existing = run.assemblyNotes?.trim() ?? "";
    const combined = existing ? `${existing}; ${ACCEPT_NOTE}` : ACCEPT_NOTE;
    onPatchRun(roomIdx, areaIdx, runIdx, { assemblyNotes: combined });
  };

  const runSf =
    isCounter && run.lengthIn > 0 && run.depthIn > 0
      ? ((run.lengthIn * run.depthIn) / 144).toFixed(2)
      : null;

  return (
    <div className={rowCls} role="row">
      {/* Piece */}
      <div className="rw-cell rw-cell--label" role="cell">
        {excluded ? (
          <span className="rw-excluded-banner">{statusLabel}</span>
        ) : isManual ? (
          <span className="rw-manual-banner">Manual piece</span>
        ) : null}
        <input
          className="rw-label-input"
          type="text"
          defaultValue={run.label}
          disabled={excluded}
          aria-label="Piece name"
          title={run.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== run.label) onPatchRun(roomIdx, areaIdx, runIdx, { label: v });
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <div className="rw-label-sub">
          <span className="rw-piece-type">{pieceTypeLabel}</span>
          <RunMeta
            link={link}
            excluded={excluded}
            isReviewed={isReviewed}
            sourcePages={run.sourcePages}
          />
          {!excluded && !isReviewed && link && link.verdict !== "exempt" && (
            <EvidenceBadge link={link} excluded={excluded} isReviewed={isReviewed} />
          )}
        </div>
        {!excluded && !isReviewed && <EvidenceHint link={link} />}
      </div>

      {/* Length */}
      <div className="rw-cell rw-cell--dim" role="cell">
        <input
          className="rw-dim-input"
          type="number"
          step="0.5"
          min="0"
          defaultValue={run.lengthIn}
          disabled={excluded || !isCounter}
          aria-label="Length (inches)"
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0 && v !== run.lengthIn) onPatchRun(roomIdx, areaIdx, runIdx, { lengthIn: v });
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <span className="rw-dim-unit">"</span>
      </div>

      {/* Depth */}
      <div className="rw-cell rw-cell--dim" role="cell">
        <input
          className="rw-dim-input"
          type="number"
          step="0.5"
          min="0"
          defaultValue={run.depthIn}
          disabled={excluded || !isCounter}
          aria-label="Depth (inches)"
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0 && v !== run.depthIn) onPatchRun(roomIdx, areaIdx, runIdx, { depthIn: v });
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <span className="rw-dim-unit">"</span>
      </div>

      {/* SF */}
      <div className="rw-cell rw-cell--sf" role="cell">
        <span className="rw-sf-value" title={runSf ? `${runSf} square feet` : undefined}>
          {runSf ?? "—"}
        </span>
      </div>

      {/* Include / exclude / remove */}
      <div className="rw-cell rw-cell--toggle" role="cell">
        <PieceActionControl
          runId={run.id}
          excluded={excluded}
          isManual={isManual}
          onSetRunIncluded={onSetRunIncluded}
          onRemoveManualRun={onRemoveManualRun}
        />
      </div>

      {/* Review note */}
      <div className="rw-cell rw-cell--note" role="cell">
        {hasEvidenceIssue && !note && !excluded && (
          <button
            type="button"
            className="rw-accept-btn"
            onClick={handleAccept}
            title="Mark this run as reviewed and accepted without changing its dimensions"
          >
            Accept
          </button>
        )}
        {noteOpen || note ? (
          <input
            className="rw-note-input"
            type="text"
            value={note}
            placeholder={hasEvidenceIssue ? "Note why accepted…" : "Reviewer note…"}
            aria-label="Reviewer note"
            onChange={(e) => onSetNote(run.id, e.target.value)}
          />
        ) : (
          <button
            type="button"
            className="rw-note-toggle"
            onClick={() => setNoteOpen(true)}
          >
            Add note
          </button>
        )}
      </div>
    </div>
  );
}

// ── Review checklist ───────────────────────────────────────────────────────────

interface ChecklistItem {
  id:       string;
  label:    string;
  ok:       boolean;
  count?:   number;
}

interface ReviewChecklistProps {
  items:    ChecklistItem[];
  unusedDims: { id?: string; label: string; lengthIn: number; depthIn?: number | null; pageNumber?: number }[];
  evidenceReviewState: Record<string, "ignored" | "reviewed">;
  onMarkEvidenceReviewed: (dimId: string, status: "ignored" | "reviewed") => void;
}

function ReviewChecklist({ items, unusedDims, evidenceReviewState, onMarkEvidenceReviewed }: ReviewChecklistProps) {
  const unresolvedItems = items.filter((i) => !i.ok);
  const unresolvedCount = unresolvedItems.length;

  return (
    <div className="rw-checklist">
      <div className="rw-checklist-header">
        <span className="rw-checklist-title">Review checklist</span>
        {unresolvedCount === 0 ? (
          <span className="rw-checklist-all-clear">✓ All items reviewed</span>
        ) : (
          <span className="rw-checklist-pending">{unresolvedCount} item{unresolvedCount !== 1 ? "s" : ""} need attention</span>
        )}
      </div>
      <div className="rw-checklist-items">
        {items.map((item) => (
          <div key={item.id} className={`rw-checklist-item${item.ok ? " rw-checklist-item--ok" : " rw-checklist-item--pending"}`}>
            <span className="rw-checklist-icon">{item.ok ? "✓" : "○"}</span>
            <span className="rw-checklist-label">
              {item.label}
              {!item.ok && item.count != null && item.count > 0 ? (
                <span className="rw-checklist-count"> ({item.count})</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {/* Unused evidence quick-resolve */}
      {unusedDims.length > 0 && (
        <div className="rw-checklist-unused">
          <p className="rw-checklist-unused-title">Unused high-confidence evidence — mark each as reviewed or ignored:</p>
          <div className="rw-checklist-unused-list">
            {unusedDims.map((dim, i) => {
              const dimId = dim.id ?? dim.label;
              const state = evidenceReviewState[dimId];
              return (
                <div key={i} className={`rw-unused-dim${state ? ` rw-unused-dim--${state}` : ""}`}>
                  <span className="rw-unused-dim-label">
                    "{dim.label}" {dim.lengthIn}"{dim.depthIn != null ? ` × ${dim.depthIn}"` : ""} · p.{dim.pageNumber ?? "?"}
                  </span>
                  <div className="rw-unused-dim-actions">
                    {!state && (
                      <>
                        <button
                          type="button"
                          className="rw-action-btn rw-action-btn--sm"
                          onClick={() => onMarkEvidenceReviewed(dimId, "reviewed")}
                        >
                          Mark reviewed
                        </button>
                        <button
                          type="button"
                          className="rw-action-btn rw-action-btn--sm rw-action-btn--muted"
                          onClick={() => onMarkEvidenceReviewed(dimId, "ignored")}
                        >
                          Ignore
                        </button>
                      </>
                    )}
                    {state === "reviewed" && (
                      <span className="rw-unused-state rw-unused-state--reviewed">✓ reviewed</span>
                    )}
                    {state === "ignored" && (
                      <>
                        <span className="rw-unused-state rw-unused-state--ignored">ignored</span>
                        <button
                          type="button"
                          className="rw-action-btn rw-action-btn--sm rw-action-btn--muted"
                          onClick={() => {
                            // Reset by passing empty string — parent handles removal
                            onMarkEvidenceReviewed(dimId, "reviewed");
                          }}
                        >
                          Undo
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add missing piece (structured v1) ─────────────────────────────────────────

const PRESET_KEYS = ["countertop", "island", "vanity", "backsplash"] as const;

function AddPieceForm({
  rooms,
  onAddManualRun,
}: {
  rooms: TakeoffResult["rooms"];
  onAddManualRun: (input: ManualRunInput) => void;
}) {
  const [preset, setPreset] = useState<string>("countertop");
  const [roomIdx, setRoomIdx] = useState(0);
  const [areaLabel, setAreaLabel] = useState(ADD_PIECE_PRESETS.countertop.defaultAreaLabel);
  const [pieceLabel, setPieceLabel] = useState(ADD_PIECE_PRESETS.countertop.defaultPieceLabel);
  const [lengthIn, setLengthIn] = useState("");
  const [depthIn, setDepthIn] = useState(String(ADD_PIECE_PRESETS.countertop.defaultDepth));
  const [pageNumber, setPageNumber] = useState("");
  const [note, setNote] = useState("");
  const [includeInTakeoff, setIncludeInTakeoff] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const applyPreset = (key: string) => {
    const p = ADD_PIECE_PRESETS[key] ?? ADD_PIECE_PRESETS.countertop;
    setPreset(key);
    setAreaLabel(p.defaultAreaLabel);
    setPieceLabel(p.defaultPieceLabel);
    setDepthIn(String(p.defaultDepth));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const len = parseFloat(lengthIn);
    const depth = parseFloat(depthIn);
    if (!rooms.length) {
      setFormError("Add a room in the draft before adding a piece.");
      return;
    }
    if (!pieceLabel.trim()) {
      setFormError("Piece name is required.");
      return;
    }
    if (!Number.isFinite(len) || len <= 0) {
      setFormError("Length must be greater than zero.");
      return;
    }
    if (!Number.isFinite(depth) || depth <= 0) {
      setFormError("Depth must be greater than zero.");
      return;
    }
    setFormError(null);
    onAddManualRun({
      roomIdx,
      areaLabel: areaLabel.trim(),
      preset,
      pieceLabel: pieceLabel.trim(),
      lengthIn: len,
      depthIn: depth,
      pageNumber: pageNumber.trim() || null,
      note: note.trim() || undefined,
      includeInTakeoff,
    });
    setLengthIn("");
    setPageNumber("");
    setNote("");
    setIncludeInTakeoff(true);
  };

  if (!rooms.length) return null;

  return (
    <form className="rw-add-piece" onSubmit={handleSubmit}>
      <div className="rw-add-piece-head">
        <h3 className="rw-add-piece-title">Add missing shape / piece</h3>
        <p className="rw-add-piece-desc">
          Structured entry for estimator corrections — maps to room, area/shape, and run for future Internal Estimate import.
        </p>
      </div>
      <div className="rw-add-piece-presets">
        {PRESET_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`rw-add-preset-btn${preset === key ? " rw-add-preset-btn--active" : ""}`}
            onClick={() => applyPreset(key)}
          >
            {key === "countertop" ? "Countertop run" : key === "backsplash" ? "Backsplash line" : ADD_PIECE_PRESETS[key]?.defaultPieceLabel ?? key}
          </button>
        ))}
      </div>
      <div className="rw-add-piece-grid">
        <label>
          Room
          <select value={roomIdx} onChange={(e) => setRoomIdx(Number(e.target.value))}>
            {rooms.map((room, idx) => (
              <option key={room.id ?? idx} value={idx}>
                {room.name?.trim() || `Room ${idx + 1}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Area / shape name
          <input type="text" value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder="Island, Vanity, Hall Bath…" />
        </label>
        <label>
          Piece / run name
          <input type="text" value={pieceLabel} onChange={(e) => setPieceLabel(e.target.value)} placeholder="Piece label" />
        </label>
        <label>
          Length (in)
          <input type="number" step="0.5" min="0" value={lengthIn} onChange={(e) => setLengthIn(e.target.value)} />
        </label>
        <label>
          Depth (in)
          <input type="number" step="0.5" min="0" value={depthIn} onChange={(e) => setDepthIn(e.target.value)} />
        </label>
        <label>
          Page #
          <input type="number" min="1" step="1" value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} placeholder="Optional" />
        </label>
        <label className="rw-add-piece-note">
          Review note
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional estimator note" />
        </label>
        <label className="rw-add-piece-include">
          <span>In takeoff</span>
          <div className="rw-include-segmented" role="group" aria-label="Include added piece">
            <button
              type="button"
              className={`rw-include-seg${includeInTakeoff ? " rw-include-seg--active" : ""}`}
              aria-pressed={includeInTakeoff}
              onClick={() => setIncludeInTakeoff(true)}
            >
              Yes
            </button>
            <button
              type="button"
              className={`rw-include-seg${!includeInTakeoff ? " rw-include-seg--active" : ""}`}
              aria-pressed={!includeInTakeoff}
              onClick={() => setIncludeInTakeoff(false)}
            >
              No
            </button>
          </div>
        </label>
      </div>
      {formError ? <p className="rw-add-piece-error" role="alert">{formError}</p> : null}
      <button type="submit" className="btn secondary btn-sm rw-add-piece-submit">
        Add piece to review
      </button>
    </form>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TakeoffReviewWorkbench({
  editDraft,
  dimensionEvidence,
  excludedRunIds,
  excludedRoomIds = new Set(),
  manualRunIds = new Set(),
  reviewNotes,
  evidenceReviewState,
  reviewedTotals = null,
  onPatchRun,
  onPatchArea,
  onPatchRoom,
  onSetRunIncluded,
  onRemoveManualRun,
  onAddManualRun,
  onSetReviewNote,
  onMarkEvidenceReviewed,
}: TakeoffReviewWorkbenchProps) {

  const reviewStateForDisplay = useMemo(
    () => ({
      excludedRunIds: [...excludedRunIds],
      excludedRoomIds: [...excludedRoomIds],
      manualRunIds: [...manualRunIds],
    }),
    [excludedRunIds, excludedRoomIds, manualRunIds]
  );

  const displayIndex = useMemo(
    () => buildAllPiecesDisplayIndex(editDraft, reviewStateForDisplay),
    [editDraft, reviewStateForDisplay]
  );

  const totals = reviewedTotals ?? displayIndex.totals;

  // ── Build flat run rows ────────────────────────────────────────────────────

  const rows = useMemo<WorkbenchRow[]>(() => {
    const out: WorkbenchRow[] = [];
    for (let ri = 0; ri < (editDraft?.rooms ?? []).length; ri++) {
      const room = editDraft.rooms[ri];
      for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
        const area = room.areas[ai];
        for (let xi = 0; xi < (area?.runs ?? []).length; xi++) {
          out.push({
            roomIdx:   ri,
            areaIdx:   ai,
            runIdx:    xi,
            roomName:  room.name ?? `Room ${ri + 1}`,
            areaLabel: area.label ?? `Area ${ai + 1}`,
            run:       area.runs[xi],
            link:      null, // filled below
          });
        }
      }
    }
    return out;
  }, [editDraft]);

  // ── Evidence reconciliation (against full editDraft, including excluded runs) ──

  const reconciliation = useMemo<ReconciliationResult | null>(() => {
    if (!editDraft || !dimensionEvidence) return null;
    try {
      return reconcileRunsWithEvidence({
        takeoffResult: editDraft,
        dimensionEvidence,
      }) as ReconciliationResult;
    } catch {
      return null;
    }
  }, [editDraft, dimensionEvidence]);

  // ── Merge evidence links into rows ────────────────────────────────────────

  const rowsWithLinks = useMemo<WorkbenchRow[]>(() => {
    if (!reconciliation) return rows;
    const linkByRunId = new Map<string, RunLink>();
    for (const l of reconciliation.runLinks) linkByRunId.set(l.runId, l);
    return rows.map((row) => ({
      ...row,
      link: linkByRunId.get(row.run.id) ?? null,
    }));
  }, [rows, reconciliation]);

  // ── Group rows by room/area for display ───────────────────────────────────

  interface AreaGroup {
    key:      string;
    roomIdx:  number;
    areaIdx:  number;
    roomName: string;
    areaLabel: string;
    rows:     WorkbenchRow[];
  }

  const groups = useMemo<AreaGroup[]>(() => {
    const map = new Map<string, AreaGroup>();
    for (let ri = 0; ri < (editDraft?.rooms ?? []).length; ri++) {
      const room = editDraft.rooms[ri];
      if (excludedRoomIds.has(room.id)) continue;
      for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
        const area = room.areas[ai];
        const key = `${ri}:${ai}`;
        map.set(key, {
          key,
          roomIdx: ri,
          areaIdx: ai,
          roomName: room.name ?? `Room ${ri + 1}`,
          areaLabel: area.label ?? `Area ${ai + 1}`,
          rows: [],
        });
      }
    }
    for (const row of rowsWithLinks) {
      if (excludedRoomIds.has(editDraft.rooms[row.roomIdx]?.id ?? "")) continue;
      const key = `${row.roomIdx}:${row.areaIdx}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          roomIdx: row.roomIdx,
          areaIdx: row.areaIdx,
          roomName: row.roomName,
          areaLabel: row.areaLabel,
          rows: [],
        });
      }
      map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  }, [rowsWithLinks, editDraft, excludedRoomIds]);

  // ── Checklist ─────────────────────────────────────────────────────────────

  const checklistItems = useMemo<ChecklistItem[]>(() => {
    if (!reconciliation?.checksRan) return [];

    const includedLinks = rowsWithLinks
      .filter((r) => !excludedRunIds.has(r.run.id) && r.link)
      .map((r) => r.link!);

    const unsupportedIncluded = includedLinks.filter(
      (l) => l.verdict === "unsupported"
    );
    const changedIncluded = includedLinks.filter(
      (l) => l.verdict === "changed"
    );
    const conflictingIncluded = includedLinks.filter(
      (l) => l.conflicting && l.verdict !== "unsupported"
    );

    const unusedTotal = (reconciliation?.unusedHighConfidenceDimensions ?? []).length;
    const unusedReviewed = (reconciliation?.unusedHighConfidenceDimensions ?? []).filter(
      (d) => evidenceReviewState[d.id ?? d.label]
    ).length;

    return [
      {
        id: "unsupported",
        label: "All unsupported runs excluded or noted",
        ok: unsupportedIncluded.every((l) => reviewNotes[l.runId]),
        count: unsupportedIncluded.filter((l) => !reviewNotes[l.runId]).length,
      },
      {
        id: "changed",
        label: "All changed dimensions reviewed",
        ok: changedIncluded.every((l) => reviewNotes[l.runId]),
        count: changedIncluded.filter((l) => !reviewNotes[l.runId]).length,
      },
      {
        id: "conflict",
        label: "All conflicting evidence resolved",
        ok: conflictingIncluded.every((l) => reviewNotes[l.runId]),
        count: conflictingIncluded.filter((l) => !reviewNotes[l.runId]).length,
      },
      {
        id: "unused",
        label: `Unused high-confidence evidence reviewed (${unusedReviewed}/${unusedTotal})`,
        ok: unusedTotal === 0 || unusedReviewed >= unusedTotal,
        count: unusedTotal - unusedReviewed,
      },
    ];
  }, [reconciliation, rowsWithLinks, excludedRunIds, reviewNotes, evidenceReviewState]);

  const areaCount = groups.length;

  if (areaCount === 0 && rows.length === 0) {
    return (
      <div className="rw-panel lab-card">
        <p className="rw-empty">No rooms or pieces in the current draft.</p>
      </div>
    );
  }

  return (
    <div className="rw-panel lab-card">

      <AddPieceForm rooms={editDraft.rooms ?? []} onAddManualRun={onAddManualRun} />

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      <div className="rw-summary-bar">
        <span className="rw-summary-item rw-summary-item--totals">
          CT {totals.countertopSqft.toFixed(2)} sf · Backsplash {totals.totalBacksplashSqft.toFixed(2)} sf · Combined {totals.combinedSqft.toFixed(2)} sf
        </span>
        <span className="rw-summary-item">
          {rows.length} piece{rows.length !== 1 ? "s" : ""} in table
        </span>
        {excludedRunIds.size > 0 && (
          <span className="rw-summary-item rw-summary-item--excluded">
            {excludedRunIds.size} excluded
          </span>
        )}
        {reconciliation?.checksRan && reconciliation.unsupportedRuns.length > 0 && (
          <span className="rw-summary-item rw-summary-item--error">
            {reconciliation.unsupportedRuns.filter((r) => !excludedRunIds.has(r.runId)).length} unsupported included
          </span>
        )}
        {reconciliation?.checksRan && reconciliation.changedRuns.length > 0 && (
          <span className="rw-summary-item rw-summary-item--warn">
            {reconciliation.changedRuns.filter((r) => !excludedRunIds.has(r.runId)).length} changed
          </span>
        )}
        {!reconciliation?.checksRan && dimensionEvidence && (
          <span className="rw-summary-item rw-summary-item--muted">No evidence trace — evidence not extracted</span>
        )}
      </div>

      {/* ── Run table ──────────────────────────────────────────────────────── */}
      <div className="rw-run-table" role="table" aria-label="Review workbench runs">

        {/* Table header */}
        <div className="rw-run-row rw-run-row--header" role="row">
          <span role="columnheader" className="rw-cell rw-cell--label">Piece</span>
          <span role="columnheader" className="rw-cell rw-cell--dim">Length</span>
          <span role="columnheader" className="rw-cell rw-cell--dim">Depth</span>
          <span role="columnheader" className="rw-cell rw-cell--sf">SF</span>
          <span role="columnheader" className="rw-cell rw-cell--toggle">In takeoff</span>
          <span role="columnheader" className="rw-cell rw-cell--note">Notes</span>
        </div>

        {/* Rows grouped by area */}
        {groups.map((group) => {
          const area = editDraft.rooms[group.roomIdx]?.areas[group.areaIdx];
          const aiProvidedBsTotal = Number(editDraft.aiProvidedTotals?.backsplashExactSf ?? 0);
          const areaMeta = displayIndex.areaByKey.get(group.key);
          const scopeLabel =
            areaMeta?.backsplashScopeLabel ??
            formatBacksplashScopeLabel(area?.backsplashScope, area?.backsplashHeightIn);
          return (
            <React.Fragment key={group.key}>
              <AreaGroupHeader
                roomName={group.roomName}
                areaLabel={group.areaLabel}
                roomIdx={group.roomIdx}
                areaIdx={group.areaIdx}
                onPatchRoom={onPatchRoom}
                onPatchArea={onPatchArea}
              />
              {group.rows.length === 0 && areaMeta?.needsReview ? (
                <div className="rw-area-empty-note muted small">Needs review — no included pieces in this area yet.</div>
              ) : null}
              {group.rows.map((row) => {
                const pieceMeta = displayIndex.pieceByRunId.get(row.run.id);
                const isManual = manualRunIds.has(row.run.id) || Boolean(pieceMeta?.isManual);
                const excluded = excludedRunIds.has(row.run.id);
                return (
                  <RunRow
                    key={row.run.id}
                    row={row}
                    excluded={excluded}
                    isManual={isManual}
                    pieceTypeLabel={
                      pieceMeta?.pieceTypeLabel ??
                      formatPieceTypeLabel(row.run.pieceType, Boolean(row.run.isBacksplash))
                    }
                    statusLabel={pieceMeta?.statusLabel ?? (excluded ? "Excluded from takeoff" : "Included in takeoff")}
                    note={reviewNotes[row.run.id] ?? ""}
                    onPatchRun={onPatchRun}
                    onSetRunIncluded={onSetRunIncluded}
                    onRemoveManualRun={onRemoveManualRun}
                    onSetNote={onSetReviewNote}
                  />
                );
              })}
              {area ? (
                <BacksplashAreaRow
                  area={area}
                  roomIdx={group.roomIdx}
                  areaIdx={group.areaIdx}
                  aiProvidedBsTotal={aiProvidedBsTotal}
                  scopeLabel={scopeLabel}
                  onPatchArea={onPatchArea}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Checklist ──────────────────────────────────────────────────────── */}
      {reconciliation?.checksRan && (
        <ReviewChecklist
          items={checklistItems}
          unusedDims={reconciliation.unusedHighConfidenceDimensions ?? []}
          evidenceReviewState={evidenceReviewState}
          onMarkEvidenceReviewed={onMarkEvidenceReviewed}
        />
      )}

      {!dimensionEvidence && (
        <p className="rw-no-evidence-note">
          Evidence tracing is only available for AI-generated drafts. Dimension editing is still active above.
        </p>
      )}
    </div>
  );
}

// ── Exported helpers for parent ────────────────────────────────────────────────

/**
 * Count unresolved evidence issues across the workbench state.
 * Used by the save panel to decide whether to show the "save anyway?" warning.
 */
export function countUnresolvedWorkbenchIssues(params: {
  reconciliation: ReconciliationResult | null;
  excludedRunIds:      Set<string>;
  reviewNotes:         Record<string, string>;
  evidenceReviewState: Record<string, "ignored" | "reviewed">;
}): number {
  const { reconciliation, excludedRunIds, reviewNotes, evidenceReviewState } = params;
  if (!reconciliation?.checksRan) return 0;

  let count = 0;

  for (const l of reconciliation.unsupportedRuns) {
    if (!excludedRunIds.has(l.runId) && !reviewNotes[l.runId]) count++;
  }
  for (const l of reconciliation.changedRuns) {
    if (!excludedRunIds.has(l.runId) && !reviewNotes[l.runId]) count++;
  }
  for (const l of reconciliation.conflictingRuns) {
    if (!excludedRunIds.has(l.runId) && !reviewNotes[l.runId]) count++;
  }
  for (const d of reconciliation.unusedHighConfidenceDimensions) {
    const dimId = d.id ?? d.label;
    if (!evidenceReviewState[dimId]) count++;
  }

  return count;
}
