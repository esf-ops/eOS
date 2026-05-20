import type { ChartData, Department, Relationship, Seat } from "./chartTypes";

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyChartData(): ChartData {
  return { departments: [], seats: [], relationships: [] };
}

export function deptMap(departments: Department[]): Map<string, Department> {
  return new Map(departments.map((d) => [d.id, d]));
}

export function seatMap(seats: Seat[]): Map<string, Seat> {
  return new Map(seats.map((s) => [s.id, s]));
}

/** fromSeatId reports to toSeatId (manager). */
export function directManagerId(seatId: string, relationships: Relationship[]): string | null {
  const rel = relationships.find((r) => r.fromSeatId === seatId && r.type === "direct");
  return rel?.toSeatId ?? null;
}

export function setDirectManager(
  seatId: string,
  managerId: string | null,
  relationships: Relationship[]
): Relationship[] {
  const rest = relationships.filter((r) => !(r.fromSeatId === seatId && r.type === "direct"));
  if (!managerId) return rest;
  return [...rest, { id: newId("rel"), fromSeatId: seatId, toSeatId: managerId, type: "direct", label: "" }];
}

export function rootSeatIds(seats: Seat[], relationships: Relationship[]): string[] {
  const seatIds = new Set(seats.map((s) => s.id));
  const hasManager = new Set<string>();
  for (const r of relationships) {
    if (r.type !== "direct") continue;
    if (seatIds.has(r.fromSeatId) && seatIds.has(r.toSeatId)) hasManager.add(r.fromSeatId);
  }
  const roots = seats.filter((s) => !hasManager.has(s.id)).map((s) => s.id);
  if (roots.length) return roots;
  return seats.length ? [seats[0].id] : [];
}

export function childrenOf(managerId: string, seats: Seat[], relationships: Relationship[]): Seat[] {
  const childIds = relationships
    .filter((r) => r.type === "direct" && r.toSeatId === managerId)
    .map((r) => r.fromSeatId);
  const byId = seatMap(seats);
  return childIds.map((id) => byId.get(id)).filter(Boolean) as Seat[];
}

export function nonDirectRelationships(relationships: Relationship[]): Relationship[] {
  return relationships.filter((r) => r.type !== "direct");
}

export function displayName(seat: Seat): string {
  const n = String(seat.personName || "").trim();
  if (n) return n;
  if (seat.status === "open") return "Open Seat";
  if (seat.status === "future") return "Future Seat";
  if (seat.status === "advisor") return "Advisor Seat";
  return "Unnamed";
}
