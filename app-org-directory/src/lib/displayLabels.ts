import type { RelationshipType, SeatStatus } from "./chartTypes";

export const APP_TITLE = "Elite Stone Fabrication Org Chart";

const SEAT_STATUS_LABELS: Record<SeatStatus, string> = {
  filled: "Assigned",
  open: "Open role",
  future: "Future role",
  advisor: "Advisor context",
  structural: "Structural group"
};

const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  direct: "Direct report",
  dotted: "Dotted-line",
  advisory: "Advisory",
  partner_context: "Partner / Advisor"
};

export function seatStatusLabel(status: SeatStatus | string): string {
  const key = String(status ?? "").trim() as SeatStatus;
  return SEAT_STATUS_LABELS[key] ?? status;
}

export function relationshipTypeLabel(type: RelationshipType | string): string {
  const key = String(type ?? "").trim() as RelationshipType;
  return RELATIONSHIP_TYPE_LABELS[key] ?? type;
}

/** Hide generic branch labels on chart cards. */
export function formatBranchLabel(branch: string): string | null {
  const b = String(branch ?? "").trim();
  if (!b) return null;
  if (/^company$/i.test(b)) return null;
  return b;
}

const GENERIC_REL_LABELS = /^(future dotted line|dotted-line|partner_context|direct|advisory)$/i;

export function humanRelationshipNote(label?: string): string | null {
  const extra = String(label ?? "").trim();
  if (!extra || GENERIC_REL_LABELS.test(extra)) return null;
  return extra;
}

export function formatSecondaryRelationshipLine(
  fromName: string,
  toName: string,
  type: RelationshipType | string,
  label?: string
): string {
  const typeLabel = relationshipTypeLabel(type);
  const extra = humanRelationshipNote(label);
  if (extra) return `${fromName} ↔ ${toName} · ${typeLabel} (${extra})`;
  return `${fromName} ↔ ${toName} · ${typeLabel}`;
}

export const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: "direct", label: "Direct report" },
  { value: "dotted", label: "Dotted-line" },
  { value: "advisory", label: "Advisory" },
  { value: "partner_context", label: "Partner / Advisor" }
];

export const SEAT_STATUS_OPTIONS: { value: SeatStatus; label: string }[] = [
  { value: "filled", label: "Assigned" },
  { value: "open", label: "Open role" },
  { value: "future", label: "Future role" },
  { value: "advisor", label: "Advisor context" },
  { value: "structural", label: "Structural group" }
];

export const PERSON_SEAT_STATUS_OPTIONS = SEAT_STATUS_OPTIONS.filter((o) => o.value !== "structural");

/** Prefer Owner / top leadership when multiple tree roots exist. */
export function sortRootSeatIds(seatIds: string[], seats: { id: string; title?: string; personName?: string }[]): string[] {
  const sm = new Map(seats.map((s) => [s.id, s]));
  const score = (id: string) => {
    const s = sm.get(id);
    const title = String(s?.title ?? "").toLowerCase();
    const name = String(s?.personName ?? "").toLowerCase();
    if (title.includes("owner")) return 0;
    if (id === "seat_eric" || name.includes("eric")) return 1;
    if ((s as { status?: string }).status === "structural") return 3;
    if (s && !String(s.personName ?? "").trim()) return 4;
    return 2;
  };
  return [...seatIds].sort((a, b) => score(a) - score(b));
}
