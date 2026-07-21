export type SideSplashSummaryRow = {
  pieceLabel: string;
  summary: string | null;
};

/** Concise room-card copy; unchanged None rows stay inside the modal only. */
export function summarizeSideSplashSelections(
  pieces: SideSplashSummaryRow[],
): string {
  const selected = (pieces || []).filter(
    (piece) => piece.summary && piece.summary !== "None",
  );
  if (selected.length === 0) return "None selected";
  if (selected.length > 1) return `${selected.length} locations selected`;
  const piece = selected[0];
  const side = piece.summary === "Both" ? "Both sides" : `${piece.summary} side`;
  return `${side} — ${piece.pieceLabel}`;
}
