import type { ChartData, Seat } from "./chartTypes";
import { ensureLayout } from "./chartUtils";
import { childrenOf, displayName, isStructuralSeat, rootSeatIds } from "./chartUtils";
import { sortRootSeatIds } from "./displayLabels";
import { sortPrintChildren } from "./printLayout";

/** Owner / top node for executive print (Eric / Owner first). */
export function selectPrintOwnerId(chart: ChartData): string | null {
  return sortRootSeatIds(rootSeatIds(chart.seats, chart.relationships), chart.seats)[0] ?? null;
}

/** Major section panels: direct reports to the owner. */
export function sectionPanelIds(chart: ChartData, ownerId: string | null): string[] {
  if (!ownerId) return [];
  return sortDirectChildrenForPrint(ownerId, chart);
}

/** Other top-level trees not under the primary owner. */
export function additionalPanelRootIds(chart: ChartData, ownerId: string | null): string[] {
  const roots = sortRootSeatIds(rootSeatIds(chart.seats, chart.relationships), chart.seats);
  return roots.filter((id) => id !== ownerId);
}

/** Direct children sorted for print (layout left-to-right, then role/name). */
export function sortDirectChildrenForPrint(parentId: string, chart: ChartData): string[] {
  const childIds = childrenOf(parentId, chart.seats, chart.relationships).map((c) => c.id);
  const positions = ensureLayout(chart).nodePositions;
  const ranked = sortPrintChildren(childIds, chart.seats);
  return [...ranked].sort((a, b) => {
    const pa = positions[a];
    const pb = positions[b];
    if (pa && pb) {
      if (pa.y !== pb.y) return pa.y - pb.y;
      if (pa.x !== pb.x) return pa.x - pb.x;
    }
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;
    return 0;
  });
}

/** Wider grid span for panels with multiple peer leaders or key departments. */
export function printPanelSpanClass(sectionSeat: Seat, peerCount: number): string {
  const label = displayName(sectionSeat).toLowerCase();
  if (peerCount >= 2) return "od-print-panel--wide";
  if (/sales|production|revenue|operations|install|shop/.test(label)) return "od-print-panel--wide";
  return "";
}

export function isOwnerSeat(seat: Seat): boolean {
  if (isStructuralSeat(seat)) return false;
  const title = String(seat.title ?? "").toLowerCase();
  return title.includes("owner");
}
