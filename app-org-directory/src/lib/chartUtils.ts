import type { ChartData, ChartLayout, Department, Relationship, RelationshipType, Seat } from "./chartTypes";

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyChartData(): ChartData {
  return { departments: [], seats: [], relationships: [], layout: { nodePositions: {} } };
}

export function ensureLayout(data: ChartData): ChartLayout {
  const pos = data.layout?.nodePositions;
  if (pos && typeof pos === "object") return { nodePositions: { ...pos } };
  return { nodePositions: {} };
}

/** Merge persisted chart JSON with safe defaults (including layout). */
export function normalizeChartData(input: ChartData | null | undefined): ChartData {
  const raw = input ?? emptyChartData();
  const departments = Array.isArray(raw.departments) ? [...raw.departments] : [];
  const seats = Array.isArray(raw.seats) ? [...raw.seats] : [];
  const relationships = Array.isArray(raw.relationships) ? [...raw.relationships] : [];
  const layout = ensureLayout(raw);
  return { departments, seats, relationships, layout };
}

export function isChartEmpty(data: ChartData | null | undefined): boolean {
  if (!data) return true;
  return (data.seats?.length ?? 0) === 0 && (data.departments?.length ?? 0) === 0;
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

export function directRelationshipForSeat(seatId: string, relationships: Relationship[]): Relationship | null {
  return relationships.find((r) => r.fromSeatId === seatId && r.type === "direct") ?? null;
}

export function setDirectManager(
  seatId: string,
  managerId: string | null,
  relationships: Relationship[]
): Relationship[] {
  const rest = relationships.filter((r) => !(r.fromSeatId === seatId && r.type === "direct"));
  if (!managerId || managerId === seatId) return rest;
  if (hasDuplicateDirectPair(rest, seatId, managerId)) return rest;
  return [...rest, { id: newId("rel"), fromSeatId: seatId, toSeatId: managerId, type: "direct", label: "" }];
}

export function setDirectRelationshipType(
  seatId: string,
  type: RelationshipType,
  relationships: Relationship[]
): Relationship[] {
  return relationships.map((r) => (r.fromSeatId === seatId && r.type === "direct" ? { ...r, type } : r));
}

/** React Flow connect: source = manager, target = report. */
export function connectManagerToReport(
  managerSeatId: string,
  reportSeatId: string,
  relationships: Relationship[],
  relType: RelationshipType = "direct"
): Relationship[] {
  if (!managerSeatId || !reportSeatId || managerSeatId === reportSeatId) return relationships;
  if (relType === "direct") {
    return setDirectManager(reportSeatId, managerSeatId, relationships);
  }
  if (hasDuplicateRelationship(relationships, reportSeatId, managerSeatId, relType)) return relationships;
  const rest = relationships.filter(
    (r) => !(r.fromSeatId === reportSeatId && r.toSeatId === managerSeatId && r.type === relType)
  );
  return [
    ...rest,
    { id: newId("rel"), fromSeatId: reportSeatId, toSeatId: managerSeatId, type: relType, label: "" }
  ];
}

export function removeRelationshipById(relationshipId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((r) => r.id !== relationshipId);
}

export function removeRelationshipsForSeat(seatId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((r) => r.fromSeatId !== seatId && r.toSeatId !== seatId);
}

function hasDuplicateDirectPair(relationships: Relationship[], reportId: string, managerId: string): boolean {
  return relationships.some(
    (r) => r.type === "direct" && r.fromSeatId === reportId && r.toSeatId === managerId
  );
}

function hasDuplicateRelationship(
  relationships: Relationship[],
  fromSeatId: string,
  toSeatId: string,
  type: RelationshipType
): boolean {
  return relationships.some(
    (r) => r.fromSeatId === fromSeatId && r.toSeatId === toSeatId && r.type === type
  );
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

export function isStructuralSeat(seat: Pick<Seat, "status">): boolean {
  return seat.status === "structural";
}

export function isPersonSeat(seat: Pick<Seat, "status">): boolean {
  return !isStructuralSeat(seat);
}

/** Deduplicate advisory/dotted/partner lines for summaries. */
export function dedupeSecondaryRelationships(relationships: Relationship[]): Relationship[] {
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
    out.push(r);
  }
  return out;
}

export function displayName(seat: Seat): string {
  if (isStructuralSeat(seat)) {
    const title = String(seat.title || "").trim();
    return title || "Group";
  }
  const n = String(seat.personName || "").trim();
  if (n) return n;
  if (seat.status === "open") return "Open role";
  if (seat.status === "future") return "Future role";
  if (seat.status === "advisor") return seat.title?.trim() || "Advisor";
  return seat.title?.trim() || "Unnamed";
}

export function seatListLabel(seat: Seat): string {
  if (isStructuralSeat(seat)) return displayName(seat);
  const name = displayName(seat);
  const title = String(seat.title || "").trim();
  if (title && name !== title) return `${name} — ${title}`;
  return name;
}

export function pruneLayoutForSeats(layout: ChartLayout, seatIds: Set<string>): ChartLayout {
  const nodePositions: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(layout.nodePositions)) {
    if (seatIds.has(id) && pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      nodePositions[id] = { x: pos.x, y: pos.y };
    }
  }
  return { nodePositions };
}
