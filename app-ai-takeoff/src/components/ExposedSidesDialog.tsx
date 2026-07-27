/**
 * Viewport-centered exposed-sides dialog (portal to document.body).
 * Confirm updates local draft only — never POSTs corrections.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PIECE_TOPOLOGIES,
  buildFinishedEdgeFromExposedSides,
  calculateExposedEdgeInches,
  defaultExposedSidesForTopology,
  formatExposedSidesSummary,
  mapLegacyExposedSides,
  suggestPieceTopology
} from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

export type ExposedSidesDialogProps = {
  open: boolean;
  row: {
    runId: string;
    roomName?: string;
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
  } | null;
  triggerId: string | null;
  onConfirm: (finishedEdge: Record<string, unknown>) => void;
  onCancel: () => void;
};

function sidesFromRow(row: NonNullable<ExposedSidesDialogProps["row"]>) {
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

export default function ExposedSidesDialog({
  open,
  row,
  triggerId,
  onConfirm,
  onCancel
}: ExposedSidesDialogProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const suggestedTopology = row
    ? suggestPieceTopology({ label: row.pieceName, name: row.pieceName })
    : PIECE_TOPOLOGIES.CUSTOM;

  const [topology, setTopology] = useState(PIECE_TOPOLOGIES.CUSTOM);
  const [attachedSide, setAttachedSide] = useState("left");
  const [sides, setSides] = useState({
    front: false,
    back: false,
    left: false,
    right: false
  });

  useEffect(() => {
    if (!open || !row) return;
    setTopology(row.pieceTopology || suggestedTopology || PIECE_TOPOLOGIES.CUSTOM);
    setAttachedSide(String(row.attachedSide || "") || "left");
    setSides(sidesFromRow(row));
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, row?.runId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const calc = useMemo(() => {
    if (!row) return { totalLf: 0, totalInches: 0 };
    return calculateExposedEdgeInches(
      { lengthIn: row.lengthIn, depthIn: row.depthIn, quantity: row.quantity },
      sides
    );
  }, [row, sides]);

  if (!open || !row || typeof document === "undefined") return null;

  const lengthIn = Number(row.lengthIn) || 0;
  const depthIn = Number(row.depthIn) || 0;
  const summary = formatExposedSidesSummary(sides, calc.totalLf);

  function applyTopology(nextTopology: string, nextAttached = attachedSide) {
    setTopology(nextTopology);
    if (nextTopology === PIECE_TOPOLOGIES.CUSTOM) return;
    setSides(
      defaultExposedSidesForTopology(nextTopology, {
        attachedSide: nextTopology === PIECE_TOPOLOGIES.PENINSULA ? nextAttached : null
      })
    );
  }

  function handleConfirm() {
    const payload = buildFinishedEdgeFromExposedSides({
      lengthIn: row.lengthIn,
      depthIn: row.depthIn,
      quantity: row.quantity,
      exposedSides: sides,
      topology,
      attachedSide: topology === PIECE_TOPOLOGIES.PENINSULA ? attachedSide : null,
      confirm: true
    });
    onConfirm(payload);
  }

  return createPortal(
    <div
      className="ctr-edge-dialog-backdrop"
      role="presentation"
      data-testid="ctr-exposed-edges-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="ctr-edge-dialog"
        id="ctr-exposed-edges-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="ctr-exposed-edges-dialog"
        data-portal-root="document.body"
      >
        <header className="ctr-edge-dialog-head">
          <h2 id={titleId}>Set exposed sides</h2>
          <p className="ctr-muted" data-testid="ctr-edge-dialog-context">
            {row.roomName ? `${row.roomName} · ` : ""}
            {row.pieceName} · {lengthIn}″ × {depthIn}″ · qty {row.quantity}
          </p>
        </header>
        <div className="ctr-edge-dialog-body">
          <p className="ctr-muted" style={{ margin: "0 0 0.75rem", fontSize: 13 }}>
            Mark the physical sides that will be exposed. The edge profile is selected later in
            Pricing Setup. Backsplash is separate from countertop exposed edges.
          </p>

          <label className="ctr-field" htmlFor={`${baseId}-topology`}>
            <span className="ctr-muted" style={{ fontSize: 12 }}>
              Piece type
            </span>
            <select
              ref={firstFieldRef}
              id={`${baseId}-topology`}
              name={`exposed-topology-${row.runId}`}
              value={topology}
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
            <label className="ctr-field" htmlFor={`${baseId}-attached`}>
              <span className="ctr-muted" style={{ fontSize: 12 }}>
                Attached side
              </span>
              <select
                id={`${baseId}-attached`}
                name={`exposed-attached-${row.runId}`}
                value={attachedSide}
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

          <div className="ctr-exposed-sides-grid" style={{ display: "grid", gap: 6, margin: "10px 0" }}>
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
                <label key={key} className="ctr-bs-toggle" htmlFor={id}>
                  <input
                    id={id}
                    name={`exposed-side-${row.runId}-${key}`}
                    type="checkbox"
                    checked={sides[key] === true}
                    data-testid={`ctr-edge-${key}-exposed`}
                    onChange={(e) =>
                      setSides((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                  />
                  <span className="ctr-bs-toggle-label">
                    {label} — {inches} inches
                  </span>
                </label>
              );
            })}
          </div>

          <p className="ctr-muted" data-testid="ctr-exposed-lf-preview" style={{ margin: "0 0 12px" }}>
            {summary}
            {calc.totalInches <= 0 ? " · Review: no sides selected" : ""}
          </p>
        </div>
        <footer className="ctr-edge-dialog-actions">
          <button
            type="button"
            className="ctr-btn-secondary"
            data-testid="ctr-cancel-exposed-edges"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ctr-btn-primary"
            data-testid="ctr-confirm-exposed-edges"
            onClick={handleConfirm}
          >
            Confirm exposed edges
          </button>
        </footer>
        {triggerId ? (
          <span className="ctr-sr-only" data-dialog-for-trigger={triggerId} />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
