/**
 * Exposed-edge trigger only. The editor is a viewport dialog (ExposedSidesDialog),
 * never an in-cell popover.
 */
import React from "react";

export type ExposedSidesTriggerProps = {
  row: {
    runId: string;
    pieceName: string;
    finishedEdgeApproved?: boolean;
    finishedEdgeTotalIn?: number | null;
    localUnsavedEdge?: boolean;
  };
  triggerId: string;
  dialogId: string;
  open: boolean;
  disabled?: boolean;
  onOpen: () => void;
};

export function formatExposedSidesTriggerText(row: ExposedSidesTriggerProps["row"]) {
  if (row.finishedEdgeTotalIn == null) return "Set edges";
  const lf = `${((Number(row.finishedEdgeTotalIn) || 0) / 12).toFixed(2)} LF`;
  if (row.localUnsavedEdge) return `${lf} · unsaved`;
  if (row.finishedEdgeApproved) return `${lf} ✓`;
  return `${lf} draft`;
}

export default function ExposedSidesTrigger({
  row,
  triggerId,
  dialogId,
  open,
  disabled = false,
  onOpen
}: ExposedSidesTriggerProps) {
  return (
    <button
      type="button"
      id={triggerId}
      className="ctr-cutouts-summary ctr-exposed-edges-trigger"
      data-testid="ctr-exposed-edges-summary"
      aria-expanded={open}
      aria-controls={dialogId}
      aria-haspopup="dialog"
      aria-label={`Set exposed sides for ${row.pieceName}`}
      disabled={disabled}
      onClick={() => onOpen()}
    >
      {formatExposedSidesTriggerText(row)}
    </button>
  );
}
