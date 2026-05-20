import type { ChartData, Relationship, Seat } from "./chartTypes";
import { humanRelationshipNote, printRelationshipTypeLabel, sortRootSeatIds } from "./displayLabels";
import {
  directManagerId,
  displayName,
  isStructuralSeat,
  nonDirectRelationships,
  rootSeatIds,
  seatMap
} from "./chartUtils";

/** Primary root for print (Owner / Eric first). */
export function selectPrintRootId(chart: ChartData): string | null {
  const roots = sortRootSeatIds(rootSeatIds(chart.seats, chart.relationships), chart.seats);
  return roots[0] ?? null;
}

/** Additional top-level trees when the chart has multiple roots. */
export function otherPrintRootIds(chart: ChartData, primaryRootId: string | null): string[] {
  const roots = sortRootSeatIds(rootSeatIds(chart.seats, chart.relationships), chart.seats);
  return roots.filter((id) => id !== primaryRootId);
}

/** Person names that appear on more than one seat (for dual-context print labels). */
export function duplicatePersonNames(seats: Seat[]): Set<string> {
  const counts = new Map<string, number>();
  for (const s of seats) {
    if (isStructuralSeat(s)) continue;
    const key = String(s.personName ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [k, c] of counts) {
    if (c > 1) dupes.add(k);
  }
  return dupes;
}

/** Leadership-facing card title; clarifies operating vs advisory when names repeat. */
export function printSeatHeading(seat: Seat, duplicateNames: Set<string>): string {
  if (isStructuralSeat(seat)) return displayName(seat);
  const name = String(seat.personName ?? "").trim() || displayName(seat);
  const key = String(seat.personName ?? "")
    .trim()
    .toLowerCase();
  if (!key || !duplicateNames.has(key)) return name;
  if (seat.status === "advisor") return `${name} — Partner / Advisor Context`;
  return `${name} — Operating Role`;
}

/**
 * Secondary relationships for print: dedupe and drop lines already shown in the direct tree.
 */
export function filterPrintSecondaryRelationships(chart: ChartData): Relationship[] {
  const { relationships, seats } = chart;
  const seen = new Set<string>();
  const out: Relationship[] = [];

  for (const r of nonDirectRelationships(relationships)) {
    const labelNorm = String(r.label ?? "")
      .trim()
      .toLowerCase();
    const [a, b] = [r.fromSeatId, r.toSeatId].sort();
    const key = `${a}|${b}|${r.type}|${labelNorm}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const samePairDirect = relationships.some(
      (x) => x.type === "direct" && x.fromSeatId === r.fromSeatId && x.toSeatId === r.toSeatId
    );
    if (samePairDirect) continue;

    const directMgr = directManagerId(r.fromSeatId, relationships);
    if (directMgr === r.toSeatId && (r.type === "advisory" || r.type === "partner_context")) continue;

    const toSeat = seats.find((s) => s.id === r.toSeatId);
    if (toSeat && isStructuralSeat(toSeat) && directMgr === r.toSeatId) continue;

    out.push(r);
  }
  return out;
}

export function formatPrintContextRelationshipLine(
  from: Seat,
  to: Seat,
  type: Relationship["type"],
  label: string | undefined,
  duplicateNames: Set<string>
): string {
  const fromLabel = printSeatHeading(from, duplicateNames);
  const toLabel = printSeatHeading(to, duplicateNames);
  const rel = printRelationshipTypeLabel(type);
  const note = humanRelationshipNote(label);
  if (note) return `${fromLabel} → ${toLabel} (${rel}: ${note})`;
  return `${fromLabel} → ${toLabel} (${rel})`;
}

/** Sort children for print: structural groups, then filled roles, then open/future. */
export function sortPrintChildren(seatIds: string[], seats: Seat[]): string[] {
  const sm = seatMap(seats);
  const rank = (id: string) => {
    const s = sm.get(id);
    if (!s) return 5;
    if (isStructuralSeat(s)) return 0;
    if (s.status === "filled") return 1;
    if (s.status === "advisor") return 2;
    if (s.status === "open") return 3;
    if (s.status === "future") return 4;
    return 5;
  };
  return [...seatIds].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const sa = sm.get(a);
    const sb = sm.get(b);
    return String(sa?.title ?? "").localeCompare(String(sb?.title ?? ""));
  });
}
