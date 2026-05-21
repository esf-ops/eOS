import type { ChartData, Seat } from "./chartTypes";
import { isStructuralSeat, seatMap } from "./chartUtils";
import { outlineSeatLabel } from "./orgChartOutline";
import { sortDirectChildrenForPrint } from "./printSectionLayout";

export type PanelSize = "wide" | "narrow";

export type OrderedSection = {
  id: string;
  seat: Seat;
  size: PanelSize;
};

const SECTION_PRIORITY: { pattern: RegExp; size: PanelSize }[] = [
  { pattern: /sales|revenue|go-to-market/i, size: "wide" },
  { pattern: /production|operations|install|shop/i, size: "wide" },
  { pattern: /finance|administration|accounting/i, size: "narrow" },
  { pattern: /partner/i, size: "narrow" },
  { pattern: /safety|compliance/i, size: "narrow" },
  { pattern: /advisory/i, size: "narrow" }
];

function panelLabel(seat: Seat): string {
  return outlineSeatLabel(seat);
}

function panelSize(seat: Seat): PanelSize {
  const label = panelLabel(seat).toLowerCase();
  for (const rule of SECTION_PRIORITY) {
    if (rule.pattern.test(label)) return rule.size;
  }
  return "narrow";
}

/** Order sections for one-page grid: Sales, Production, Finance, Partners, Safety, then rest. */
export function orderSectionsForOnePage(sectionIds: string[], seats: Seat[]): OrderedSection[] {
  const sm = seatMap(seats);
  const items = sectionIds
    .map((id) => {
      const seat = sm.get(id);
      if (!seat) return null;
      return { id, seat, size: panelSize(seat), rank: 99 };
    })
    .filter(Boolean) as (OrderedSection & { rank: number })[];

  for (const item of items) {
    const label = panelLabel(item.seat).toLowerCase();
    for (let i = 0; i < SECTION_PRIORITY.length; i++) {
      if (SECTION_PRIORITY[i].pattern.test(label)) {
        item.rank = i;
        break;
      }
    }
  }

  items.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return panelLabel(a.seat).localeCompare(panelLabel(b.seat));
  });

  return items.map(({ id, seat, size }) => ({ id, seat, size }));
}

function sectionName(seat: Seat): string {
  return panelLabel(seat).toLowerCase();
}

/** Drop advisory-only panels; fold Customer Service into Production for the 5-panel grid. */
export function resolveOnePageSectionIds(sectionIds: string[], seats: Seat[]): {
  panelIds: string[];
  customerServiceSectionId: string | null;
} {
  const sm = seatMap(seats);
  let productionId: string | null = null;
  let customerServiceSectionId: string | null = null;
  const panelIds: string[] = [];

  for (const id of sectionIds) {
    const seat = sm.get(id);
    if (!seat) continue;
    const name = sectionName(seat);
    if (/advisory|secondary context/i.test(name)) continue;
    if (/customer service/i.test(name)) {
      customerServiceSectionId = id;
      continue;
    }
    if (/production|operations|install.*shop/i.test(name)) productionId = id;
    panelIds.push(id);
  }

  if (customerServiceSectionId && !productionId) {
    panelIds.push(customerServiceSectionId);
    customerServiceSectionId = null;
  }

  return { panelIds, customerServiceSectionId };
}

function appendCustomerServiceLines(lines: CompactLine[], csSectionId: string | null, chart: ChartData): CompactLine[] {
  if (!csSectionId) return lines;
  const sm = seatMap(chart.seats);
  const cs = sm.get(csSectionId);
  if (!cs) return lines;
  const childIds = sortDirectChildrenForPrint(csSectionId, chart);
  const childSeats = childIds.map((id) => sm.get(id)).filter(Boolean) as Seat[];
  if (!childSeats.length) {
    return [...lines, { key: csSectionId, text: formatCompactPersonLine(cs) }];
  }
  for (const child of childSeats) {
    const grandIds = sortDirectChildrenForPrint(child.id, chart);
    const grand = grandIds.map((id) => sm.get(id)).filter(Boolean) as Seat[];
    if (isStructuralSeat(child) || grand.length > 0) {
      lines.push({ key: child.id, text: formatGroupCompactLine(child, grand) });
    } else {
      lines.push({ key: child.id, text: formatCompactPersonLine(child) });
    }
  }
  return lines;
}

export function formatCompactPersonLine(seat: Seat): string {
  return outlineSeatLabel(seat);
}

/** Child fragment inside a group line: "Name, Title" or role label for open seats. */
export function formatCompactChildPart(seat: Seat): string {
  const name = String(seat.personName ?? "").trim();
  const title = String(seat.title ?? "").trim();
  if (name && title && name !== title) return `${name}, ${title}`;
  if (name) return name;
  return title || outlineSeatLabel(seat);
}

/** "Shop — Truman Krob, Shop Manager" or "Install — Truck A · Truck B · …" */
export function formatGroupCompactLine(group: Seat, childSeats: Seat[]): string {
  const head = panelLabel(group);
  if (!childSeats.length) return head;
  const parts = childSeats.map(formatCompactChildPart);
  return `${head} — ${parts.join(" · ")}`;
}

export type CompactLine = { key: string; text: string };

type PanelRenderMode = "peer-columns" | "leader-compact" | "compact-list";

function classifyPanel(section: Seat, childSeats: Seat[]): PanelRenderMode {
  const label = panelLabel(section).toLowerCase();
  const persons = childSeats.filter((c) => !isStructuralSeat(c));
  const structs = childSeats.filter((c) => isStructuralSeat(c));

  if (/partner/i.test(label) && persons.length >= 2 && structs.length === 0) return "compact-list";
  if (/safety|compliance/i.test(label) && persons.length <= 2 && structs.length === 0) return "compact-list";
  if (persons.length >= 2 && structs.length === 0) return "peer-columns";
  return "leader-compact";
}

function linesForSeat(seatId: string, chart: ChartData, visited: Set<string>): CompactLine[] {
  if (visited.has(seatId)) return [];
  const sm = seatMap(chart.seats);
  const seat = sm.get(seatId);
  if (!seat) return [];

  const childIds = sortDirectChildrenForPrint(seatId, chart);
  if (!childIds.length) {
    return [{ key: seatId, text: formatCompactPersonLine(seat) }];
  }

  const nextVisited = new Set(visited);
  nextVisited.add(seatId);
  const out: CompactLine[] = [];

  for (const cid of childIds) {
    const child = sm.get(cid);
    if (!child) continue;
    const grandIds = sortDirectChildrenForPrint(cid, chart);
    const grand = grandIds.map((id) => sm.get(id)).filter(Boolean) as Seat[];

    if (isStructuralSeat(child) || grand.length > 0) {
      if (grand.length > 0) {
        out.push({ key: cid, text: formatGroupCompactLine(child, grand) });
      } else {
        out.push({ key: cid, text: formatCompactPersonLine(child) });
      }
    } else {
      out.push({ key: cid, text: formatCompactPersonLine(child) });
    }
  }
  return out;
}

export type PeerColumn = {
  peerId: string;
  peer: Seat;
  lines: CompactLine[];
};

export type PanelContent =
  | { mode: "peer-columns"; title: string; columns: PeerColumn[] }
  | { mode: "leader-compact"; title: string; leader: Seat | null; lines: CompactLine[] }
  | { mode: "compact-list"; title: string; lines: CompactLine[] };

export function buildPanelContent(
  sectionId: string,
  chart: ChartData,
  options?: { customerServiceSectionId?: string | null }
): PanelContent | null {
  const sm = seatMap(chart.seats);
  const section = sm.get(sectionId);
  if (!section) return null;

  const childIds = sortDirectChildrenForPrint(sectionId, chart);
  const childSeats = childIds.map((id) => sm.get(id)).filter(Boolean) as Seat[];
  const title = panelLabel(section);
  const mode = classifyPanel(section, childSeats);

  if (mode === "peer-columns") {
    const columns: PeerColumn[] = childSeats.map((peer) => ({
      peerId: peer.id,
      peer,
      lines: linesForSeat(peer.id, chart, new Set([sectionId]))
    }));
    return { mode, title, columns };
  }

  if (mode === "compact-list") {
    const lines: CompactLine[] = childSeats.map((c) => ({
      key: c.id,
      text: formatCompactPersonLine(c)
    }));
    return { mode, title, lines };
  }

  const persons = childSeats.filter((c) => !isStructuralSeat(c));
  const structs = childSeats.filter((c) => isStructuralSeat(c));
  const leader = persons[0] ?? null;
  const lines: CompactLine[] = [];

  if (leader) {
    const leaderChildLines = linesForSeat(leader.id, chart, new Set([sectionId]));
    if (leaderChildLines.length) {
      lines.push({ key: `${leader.id}-head`, text: formatCompactPersonLine(leader) });
      lines.push(...leaderChildLines);
    } else {
      lines.push({ key: leader.id, text: formatCompactPersonLine(leader) });
    }
  }

  for (const s of structs) {
    const kids = sortDirectChildrenForPrint(s.id, chart)
      .map((id) => sm.get(id))
      .filter(Boolean) as Seat[];
    lines.push({ key: s.id, text: formatGroupCompactLine(s, kids) });
  }

  for (const p of persons.slice(1)) {
    lines.push({ key: p.id, text: formatCompactPersonLine(p) });
  }

  if (/production|operations/i.test(title.toLowerCase()) && options?.customerServiceSectionId) {
    appendCustomerServiceLines(lines, options.customerServiceSectionId, chart);
  }

  return { mode: "leader-compact", title, leader, lines };
}
