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

import React, { useMemo, useRef } from "react";
import { reconcileRunsWithEvidence } from "@takeoff-core/takeoffEvidenceRunReconciliation.mjs";
import type { TakeoffResult, TakeoffArea, TakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import type { DimensionEvidence } from "./TakeoffDimensionEvidencePanel";
import type { RunPatch } from "../TakeoffLabApp";

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
  reviewNotes:         Record<string, string>;
  evidenceReviewState: Record<string, "ignored" | "reviewed">;
  onPatchRun:          (roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => void;
  onPatchArea:         (roomIdx: number, areaIdx: number, patch: { label?: string }) => void;
  onToggleExcludeRun:  (runId: string) => void;
  onSetReviewNote:     (runId: string, note: string) => void;
  /** Called from checklist — marks an evidence dim as reviewed so the checklist item clears */
  onMarkEvidenceReviewed: (dimId: string, status: "ignored" | "reviewed") => void;
}

// ── Verdict badge ──────────────────────────────────────────────────────────────

function EvidenceBadge({ link, excluded }: { link: RunLink | null; excluded: boolean }) {
  if (excluded) {
    return <span className="rw-badge rw-badge--excluded">excluded</span>;
  }
  if (!link || link.verdict === "exempt") {
    return <span className="rw-badge rw-badge--muted">n/a</span>;
  }
  if (link.verdict === "supported" && !link.conflicting) {
    return <span className="rw-badge rw-badge--ok">✓ supported</span>;
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
        nearest: "{link.nearestChanged.label}" {link.nearestChanged.lengthIn}" · p.{link.nearestChanged.pageNumber ?? "?"}
        {" "}(Δ{Math.abs(0).toFixed(1)}")
      </span>
    );
  }
  if (link.verdict === "unsupported") {
    return <span className="rw-ev-hint rw-ev-hint--error">no evidence within ±10"</span>;
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
  onPatchArea: (roomIdx: number, areaIdx: number, patch: { label?: string }) => void;
}

function AreaGroupHeader({ roomName, areaLabel, roomIdx, areaIdx, onPatchArea }: AreaGroupHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rw-area-header">
      <span className="rw-area-room">{roomName}</span>
      <span className="rw-area-sep">›</span>
      <input
        ref={inputRef}
        className="rw-area-label-input"
        type="text"
        defaultValue={areaLabel}
        aria-label={`Area label for ${roomName} › ${areaLabel}`}
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

// ── Run row ────────────────────────────────────────────────────────────────────

interface RunRowProps {
  row:                WorkbenchRow;
  excluded:           boolean;
  note:               string;
  onPatchRun:         (roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => void;
  onToggleExclude:    (runId: string) => void;
  onSetNote:          (runId: string, note: string) => void;
}

function RunRow({ row, excluded, note, onPatchRun, onToggleExclude, onSetNote }: RunRowProps) {
  const { roomIdx, areaIdx, runIdx, run, link } = row;

  const isCounter = (run.pieceType ?? "counter") === "counter";
  const rowCls = [
    "rw-run-row",
    excluded ? "rw-run-row--excluded" : "",
    !excluded && link?.verdict === "unsupported" ? "rw-run-row--error" : "",
    !excluded && (link?.verdict === "changed" || link?.conflicting) ? "rw-run-row--warn" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rowCls} role="row">
      {/* Label */}
      <div className="rw-cell rw-cell--label" role="cell">
        <input
          className="rw-label-input"
          type="text"
          defaultValue={run.label}
          disabled={excluded}
          aria-label="Run label"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== run.label) onPatchRun(roomIdx, areaIdx, runIdx, { label: v });
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <span className="rw-piece-type">{run.pieceType ?? "counter"}</span>
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

      {/* Evidence status */}
      <div className="rw-cell rw-cell--status" role="cell">
        <EvidenceBadge link={link} excluded={excluded} />
        {!excluded && <EvidenceHint link={link} />}
      </div>

      {/* Source pages */}
      <div className="rw-cell rw-cell--pages" role="cell">
        {run.sourcePages?.length ? `p.${run.sourcePages.join(",")}` : "—"}
      </div>

      {/* Include/exclude toggle */}
      <div className="rw-cell rw-cell--toggle" role="cell">
        <button
          type="button"
          className={`rw-exclude-btn${excluded ? " rw-exclude-btn--excluded" : ""}`}
          onClick={() => onToggleExclude(run.id)}
          title={excluded ? "Re-include this run in the total" : "Exclude this run from the total"}
          aria-pressed={excluded}
        >
          {excluded ? "excluded" : "include"}
        </button>
      </div>

      {/* Review note */}
      <div className="rw-cell rw-cell--note" role="cell">
        <input
          className="rw-note-input"
          type="text"
          value={note}
          placeholder="reviewer note…"
          aria-label="Reviewer note"
          onChange={(e) => onSetNote(run.id, e.target.value)}
        />
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function TakeoffReviewWorkbench({
  editDraft,
  dimensionEvidence,
  excludedRunIds,
  reviewNotes,
  evidenceReviewState,
  onPatchRun,
  onPatchArea,
  onToggleExcludeRun,
  onSetReviewNote,
  onMarkEvidenceReviewed,
}: TakeoffReviewWorkbenchProps) {

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
    for (const row of rowsWithLinks) {
      const key = `${row.roomIdx}:${row.areaIdx}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          roomIdx:   row.roomIdx,
          areaIdx:   row.areaIdx,
          roomName:  row.roomName,
          areaLabel: row.areaLabel,
          rows:      [],
        });
      }
      map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  }, [rowsWithLinks]);

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

  // ── No evidence / no runs guard ───────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div className="rw-panel lab-card">
        <p className="rw-empty">No runs found in the current draft.</p>
      </div>
    );
  }

  return (
    <div className="rw-panel lab-card">

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      <div className="rw-summary-bar">
        <span className="rw-summary-item">
          {rows.length} run{rows.length !== 1 ? "s" : ""} total
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
          <span role="columnheader" className="rw-cell rw-cell--label">Run label</span>
          <span role="columnheader" className="rw-cell rw-cell--dim">Length</span>
          <span role="columnheader" className="rw-cell rw-cell--dim">Depth</span>
          <span role="columnheader" className="rw-cell rw-cell--status">Evidence</span>
          <span role="columnheader" className="rw-cell rw-cell--pages">Pages</span>
          <span role="columnheader" className="rw-cell rw-cell--toggle">Status</span>
          <span role="columnheader" className="rw-cell rw-cell--note">Reviewer note</span>
        </div>

        {/* Rows grouped by area */}
        {groups.map((group) => (
          <React.Fragment key={group.key}>
            <AreaGroupHeader
              roomName={group.roomName}
              areaLabel={group.areaLabel}
              roomIdx={group.roomIdx}
              areaIdx={group.areaIdx}
              onPatchArea={onPatchArea}
            />
            {group.rows.map((row) => (
              <RunRow
                key={row.run.id}
                row={row}
                excluded={excludedRunIds.has(row.run.id)}
                note={reviewNotes[row.run.id] ?? ""}
                onPatchRun={onPatchRun}
                onToggleExclude={onToggleExcludeRun}
                onSetNote={onSetReviewNote}
              />
            ))}
          </React.Fragment>
        ))}
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
          Evidence trace is only available for AI draft runs. Dimension editing is still active.
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
