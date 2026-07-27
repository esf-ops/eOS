/**
 * Local-only exposed-sides editor. Checkbox toggles do not POST.
 * Confirm sends one correction via onConfirm; closes only after backend success.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  PIECE_TOPOLOGIES,
  buildFinishedEdgeFromExposedSides,
  calculateExposedEdgeInches,
  defaultExposedSidesForTopology,
  formatExposedSidesSummary,
  mapLegacyExposedSides,
  suggestPieceTopology
} from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

export type ExposedSidesEditorProps = {
  row: {
    runId: string;
    pieceName: string;
    lengthIn: number;
    depthIn: number;
    quantity: number;
    finishedEdge?: unknown;
    finishedEdgeApproved?: boolean;
    finishedEdgeTotalIn?: number | null;
    frontExposed?: boolean | null;
    backExposed?: boolean | null;
    leftExposed?: boolean | null;
    rightExposed?: boolean | null;
    pieceTopology?: string | null;
    attachedSide?: string | null;
    exposedSides?: {
      front?: boolean;
      back?: boolean;
      left?: boolean;
      right?: boolean;
    } | null;
  };
  disabled?: boolean;
  saving?: boolean;
  staleConflict?: boolean;
  onConfirm: (finishedEdge: Record<string, unknown>) => void | Promise<void>;
  onReviewLatestDraft?: () => void;
};

function sidesFromRow(row: ExposedSidesEditorProps["row"]) {
  return row.exposedSides
    ? {
        front: row.exposedSides.front === true,
        back: row.exposedSides.back === true,
        left: row.exposedSides.left === true,
        right: row.exposedSides.right === true
      }
    : mapLegacyExposedSides({
        finishedEdge: row.finishedEdge,
        frontExposed: row.frontExposed,
        backExposed: row.backExposed,
        leftExposed: row.leftExposed,
        rightExposed: row.rightExposed
      });
}

export default function ExposedSidesEditor({
  row,
  disabled = false,
  saving = false,
  staleConflict = false,
  onConfirm,
  onReviewLatestDraft
}: ExposedSidesEditorProps) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const triggerId = `${baseId}-trigger`;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const suggestedTopology = suggestPieceTopology({
    label: row.pieceName,
    name: row.pieceName
  });
  const [open, setOpen] = useState(false);
  const [topology, setTopology] = useState(
    () => row.pieceTopology || suggestedTopology || PIECE_TOPOLOGIES.CUSTOM
  );
  const [attachedSide, setAttachedSide] = useState<string>(
    () => String(row.attachedSide || "") || "left"
  );
  const [sides, setSides] = useState(() => sidesFromRow(row));
  const [dirty, setDirty] = useState(false);

  function resetFromCanonical() {
    setTopology(row.pieceTopology || suggestedTopology || PIECE_TOPOLOGIES.CUSTOM);
    setAttachedSide(String(row.attachedSide || "") || "left");
    setSides(sidesFromRow(row));
    setDirty(false);
  }

  useEffect(() => {
    // Reset local editor when opening a different piece identity — not on every draft save.
    resetFromCanonical();
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when piece changes
  }, [row.runId]);

  const calc = useMemo(
    () =>
      calculateExposedEdgeInches(
        { lengthIn: row.lengthIn, depthIn: row.depthIn, quantity: row.quantity },
        sides
      ),
    [row.lengthIn, row.depthIn, row.quantity, sides]
  );

  const summary = formatExposedSidesSummary(sides, calc.totalLf);

  function applyTopology(nextTopology: string, nextAttached = attachedSide) {
    setTopology(nextTopology);
    if (nextTopology === PIECE_TOPOLOGIES.CUSTOM) {
      setDirty(true);
      return;
    }
    const defaults = defaultExposedSidesForTopology(nextTopology, {
      attachedSide: nextTopology === PIECE_TOPOLOGIES.PENINSULA ? nextAttached : null
    });
    setSides(defaults);
    setDirty(true);
  }

  function closeWithoutSaving() {
    if (saving) return;
    resetFromCanonical();
    setOpen(false);
    if (detailsRef.current) detailsRef.current.open = false;
    window.requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function handleConfirm() {
    if (saving || disabled) return;
    const payload = buildFinishedEdgeFromExposedSides({
      lengthIn: row.lengthIn,
      depthIn: row.depthIn,
      quantity: row.quantity,
      exposedSides: sides,
      topology,
      attachedSide: topology === PIECE_TOPOLOGIES.PENINSULA ? attachedSide : null,
      confirm: true
    });
    try {
      await onConfirm(payload);
      setDirty(false);
      setOpen(false);
      if (detailsRef.current) detailsRef.current.open = false;
      window.requestAnimationFrame(() => summaryRef.current?.focus());
    } catch {
      // Keep editor open; preserve selections. Parent sets conflict/error UI.
    }
  }

  const lengthIn = Number(row.lengthIn) || 0;
  const depthIn = Number(row.depthIn) || 0;

  return (
    <details
      ref={detailsRef}
      className="ctr-cutouts-pop ctr-exposed-edges-pop"
      data-testid="ctr-exposed-edges"
      open={open}
      onToggle={(e) => {
        const nextOpen = (e.target as HTMLDetailsElement).open;
        if (saving && !nextOpen) {
          // Keep open while a confirm save is in flight.
          if (detailsRef.current) detailsRef.current.open = true;
          setOpen(true);
          return;
        }
        if (!nextOpen && dirty && !saving) {
          resetFromCanonical();
        }
        setOpen(nextOpen);
      }}
    >
      <summary
        ref={summaryRef}
        id={triggerId}
        className="ctr-cutouts-summary"
        data-testid="ctr-exposed-edges-summary"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Set exposed sides for ${row.pieceName}`}
      >
        {row.finishedEdgeApproved
          ? `${((Number(row.finishedEdgeTotalIn) || 0) / 12).toFixed(2)} LF ✓`
          : row.finishedEdgeTotalIn != null
            ? `${((Number(row.finishedEdgeTotalIn) || 0) / 12).toFixed(2)} LF draft`
            : "Set exposed sides"}
      </summary>
      <div
        className="ctr-cutouts-menu ctr-exposed-edges-menu"
        id={panelId}
        role="group"
        aria-label={`Exposed edges for ${row.pieceName}`}
        data-testid="ctr-exposed-edges-editor"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            closeWithoutSaving();
          }
        }}
      >
        <p className="ctr-muted" style={{ margin: "0 0 0.5rem", fontSize: 12 }}>
          Mark the physical sides that will be exposed. The edge profile is selected later in
          Pricing Setup. Backsplash is separate from countertop exposed edges.
        </p>

        <label className="ctr-field" htmlFor={`${baseId}-topology`} style={{ display: "block", marginBottom: 6 }}>
          <span className="ctr-muted" style={{ fontSize: 12 }}>
            Piece type
          </span>
          <select
            id={`${baseId}-topology`}
            name={`exposed-topology-${row.runId}`}
            value={topology}
            disabled={disabled || saving}
            data-testid="ctr-edge-topology"
            onChange={(e) => applyTopology(e.target.value)}
          >
            <option value={PIECE_TOPOLOGIES.WALL_RUN}>Wall / cabinet run</option>
            <option value={PIECE_TOPOLOGIES.ISLAND}>Island</option>
            <option value={PIECE_TOPOLOGIES.PENINSULA}>Peninsula</option>
            <option value={PIECE_TOPOLOGIES.VANITY}>Vanity</option>
            <option value={PIECE_TOPOLOGIES.CUSTOM}>Custom / manual</option>
          </select>
        </label>

        {topology === PIECE_TOPOLOGIES.PENINSULA ? (
          <label
            className="ctr-field"
            htmlFor={`${baseId}-attached`}
            style={{ display: "block", marginBottom: 6 }}
          >
            <span className="ctr-muted" style={{ fontSize: 12 }}>
              Attached side
            </span>
            <select
              id={`${baseId}-attached`}
              name={`exposed-attached-${row.runId}`}
              value={attachedSide}
              disabled={disabled || saving}
              data-testid="ctr-edge-attached-side"
              onChange={(e) => {
                const next = e.target.value;
                setAttachedSide(next);
                applyTopology(PIECE_TOPOLOGIES.PENINSULA, next);
              }}
            >
              <option value="front">Front</option>
              <option value="back">Back</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
        ) : null}

        <div className="ctr-exposed-sides-grid" style={{ display: "grid", gap: 4, marginBottom: 8 }}>
          {(
            [
              ["back", "Back", lengthIn],
              ["left", "Left", depthIn],
              ["right", "Right", depthIn],
              ["front", "Front", lengthIn]
            ] as const
          ).map(([key, label, inches]) => {
            const id = `${baseId}-${key}`;
            return (
              <label key={key} className="ctr-bs-toggle" htmlFor={id} style={{ display: "block" }}>
                <input
                  id={id}
                  name={`exposed-side-${row.runId}-${key}`}
                  type="checkbox"
                  checked={sides[key] === true}
                  disabled={disabled || saving}
                  data-testid={`ctr-edge-${key}-exposed`}
                  onChange={(e) => {
                    setSides((prev) => ({ ...prev, [key]: e.target.checked }));
                    setDirty(true);
                  }}
                />
                <span className="ctr-bs-toggle-label">
                  {label} — {inches} inches
                </span>
              </label>
            );
          })}
        </div>

        <p className="ctr-muted" data-testid="ctr-exposed-lf-preview" style={{ margin: "0 0 8px", fontSize: 12 }}>
          {summary}
          {calc.totalInches <= 0 ? " · Review: no sides selected" : ""}
        </p>

        {staleConflict ? (
          <div className="ctr-error" role="alert" data-testid="ctr-exposed-stale-conflict" style={{ marginBottom: 8 }}>
            The Takeoff draft changed while you were editing.
            {onReviewLatestDraft ? (
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-review-latest-draft"
                style={{ marginLeft: 8 }}
                onClick={() => onReviewLatestDraft()}
              >
                Review latest draft
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="ctr-exposed-edges-actions">
          <button
            type="button"
            className="ctr-btn-secondary"
            data-testid="ctr-confirm-exposed-edges"
            disabled={disabled || saving}
            onClick={() => void handleConfirm()}
          >
            {saving ? "Saving…" : "Confirm exposed edges"}
          </button>
          <button
            type="button"
            className="ctr-btn-secondary"
            data-testid="ctr-cancel-exposed-edges"
            disabled={saving}
            onClick={() => closeWithoutSaving()}
          >
            Cancel
          </button>
          {dirty ? (
            <span className="ctr-muted" style={{ marginLeft: 8, fontSize: 12 }}>
              Unsaved side changes
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
