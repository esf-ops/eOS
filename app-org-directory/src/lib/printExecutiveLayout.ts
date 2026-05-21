import type { ChartData, Seat } from "./chartTypes";
import { displayName, isPersonSeat, isStructuralSeat, seatMap } from "./chartUtils";
import {
  additionalPanelRootIds,
  sectionPanelIds,
  selectPrintOwnerId,
  sortDirectChildrenForPrint
} from "./printSectionLayout";
import { formatCompactChildPart, resolveOnePageSectionIds } from "./printOnePageCompact";

export type PrintPersonRow = {
  key: string;
  name: string;
  title?: string;
  nested?: PrintPersonRow[];
};

export type PrintOpsRow = {
  key: string;
  label: string;
  value: string;
};

export type SalesPeerColumn = {
  peerId: string;
  leader: PrintPersonRow;
  reports: PrintPersonRow[];
};

export type ExecutivePrintModel = {
  owner: PrintPersonRow;
  sales: { title: string; columns: SalesPeerColumn[] };
  production: { title: string; leader: PrintPersonRow; opsRows: PrintOpsRow[] };
  governance: {
    finance: { title: string; rows: PrintOpsRow[] };
    partners: { title: string; people: PrintPersonRow[] };
    safety: { title: string; people: PrintPersonRow[] };
  };
};

function personName(seat: Seat): string {
  const name = String(seat.personName ?? "").trim();
  if (name) return name;
  if (seat.status === "open") return "Open role";
  if (seat.status === "future") return "Future role";
  return displayName(seat);
}

function personTitle(seat: Seat): string | undefined {
  const title = String(seat.title ?? "").trim();
  const name = String(seat.personName ?? "").trim();
  if (!title || title === name) return undefined;
  if (seat.status === "open" || seat.status === "future") return undefined;
  return title;
}

export function toPersonRow(seat: Seat): PrintPersonRow {
  return {
    key: seat.id,
    name: personName(seat),
    title: personTitle(seat)
  };
}

function findSectionId(chart: ChartData, ownerId: string, pattern: RegExp): string | null {
  const sm = seatMap(chart.seats);
  const raw = [
    ...sectionPanelIds(chart, ownerId),
    ...additionalPanelRootIds(chart, ownerId).filter((id) => !sectionPanelIds(chart, ownerId).includes(id))
  ];
  const { panelIds } = resolveOnePageSectionIds(raw, chart.seats);
  for (const id of panelIds) {
    const seat = sm.get(id);
    if (seat && pattern.test(displayName(seat).toLowerCase())) return id;
  }
  return null;
}

function buildReportTree(seatId: string, chart: ChartData, visited: Set<string>): PrintPersonRow {
  const sm = seatMap(chart.seats);
  const seat = sm.get(seatId);
  if (!seat) return { key: seatId, name: "—" };
  const row = toPersonRow(seat);
  if (visited.has(seatId)) return row;
  const next = new Set(visited);
  next.add(seatId);
  const childIds = sortDirectChildrenForPrint(seatId, chart).filter((id) => {
    const c = sm.get(id);
    return c && isPersonSeat(c);
  });
  if (childIds.length) {
    row.nested = childIds.map((id) => buildReportTree(id, chart, next));
  }
  return row;
}

function buildSalesColumns(sectionId: string, chart: ChartData): SalesPeerColumn[] {
  const sm = seatMap(chart.seats);
  const peerIds = sortDirectChildrenForPrint(sectionId, chart).filter((id) => {
    const s = sm.get(id);
    return s && isPersonSeat(s);
  });
  return peerIds.map((peerId) => {
    const peer = sm.get(peerId)!;
    const reportIds = sortDirectChildrenForPrint(peerId, chart);
    const reports = reportIds.map((id) => buildReportTree(id, chart, new Set([sectionId, peerId])));
    return { peerId, leader: toPersonRow(peer), reports };
  });
}

function opsRowFromGroup(group: Seat, chart: ChartData): PrintOpsRow {
  const childIds = sortDirectChildrenForPrint(group.id, chart);
  const sm = seatMap(chart.seats);
  const children = childIds.map((id) => sm.get(id)).filter(Boolean) as Seat[];
  const label = displayName(group);
  const value = children.map(formatCompactChildPart).join(" · ");
  return { key: group.id, label, value: value || label };
}

/** Compact ops rows from direct reports under the production leader (e.g. George → Shop, Install, …). */
function buildLeaderOpsRows(leaderSeatId: string, chart: ChartData): PrintOpsRow[] {
  const sm = seatMap(chart.seats);
  const rows: PrintOpsRow[] = [];
  const childIds = sortDirectChildrenForPrint(leaderSeatId, chart);

  for (const cid of childIds) {
    const child = sm.get(cid);
    if (!child) continue;
    if (isStructuralSeat(child)) {
      rows.push(opsRowFromGroup(child, chart));
      continue;
    }
    const grandIds = sortDirectChildrenForPrint(cid, chart);
    const grand = grandIds.map((id) => sm.get(id)).filter(Boolean) as Seat[];
    if (grand.length > 0) {
      const head = formatCompactChildPart(child);
      const team = grand.map(formatCompactChildPart).join(" · ");
      rows.push({
        key: cid,
        label: displayName(child),
        value: team ? `${head} · ${team}` : head
      });
    } else {
      rows.push({
        key: cid,
        label: "",
        value: formatCompactChildPart(child)
      });
    }
  }
  return rows;
}

function leaderAlreadyHasCustomerService(leaderSeatId: string, chart: ChartData): boolean {
  const sm = seatMap(chart.seats);
  return sortDirectChildrenForPrint(leaderSeatId, chart).some((id) => {
    const seat = sm.get(id);
    return seat && /customer service/i.test(displayName(seat).toLowerCase());
  });
}

function appendCustomerServiceOpsRows(
  opsRows: PrintOpsRow[],
  customerServiceSectionId: string | null,
  chart: ChartData,
  leaderSeatId: string | null
): void {
  if (!customerServiceSectionId) return;
  if (leaderSeatId && leaderAlreadyHasCustomerService(leaderSeatId, chart)) return;

  const sm = seatMap(chart.seats);
  const csChildIds = sortDirectChildrenForPrint(customerServiceSectionId, chart);
  for (const cid of csChildIds) {
    const child = sm.get(cid);
    if (!child) continue;
    if (isStructuralSeat(child)) {
      opsRows.push(opsRowFromGroup(child, chart));
    } else {
      opsRows.push({
        key: cid,
        label: "Customer Service",
        value: formatCompactChildPart(child)
      });
    }
  }
}

function buildProductionPanel(
  sectionId: string,
  chart: ChartData,
  customerServiceSectionId: string | null
): { title: string; leader: PrintPersonRow; opsRows: PrintOpsRow[] } {
  const sm = seatMap(chart.seats);
  const section = sm.get(sectionId)!;
  const childIds = sortDirectChildrenForPrint(sectionId, chart);
  const childSeats = childIds.map((id) => sm.get(id)).filter(Boolean) as Seat[];
  const persons = childSeats.filter((c) => isPersonSeat(c));
  const structs = childSeats.filter((c) => isStructuralSeat(c));
  const leaderSeat = persons[0] ?? null;
  const leader = leaderSeat ? toPersonRow(leaderSeat) : { key: sectionId, name: displayName(section) };
  const opsRows: PrintOpsRow[] = structs.map((g) => opsRowFromGroup(g, chart));

  if (leaderSeat) {
    opsRows.push(...buildLeaderOpsRows(leaderSeat.id, chart));
  }

  appendCustomerServiceOpsRows(opsRows, customerServiceSectionId, chart, leaderSeat?.id ?? null);

  for (const p of persons.slice(1)) {
    const row = toPersonRow(p);
    opsRows.push({ key: p.id, label: "", value: row.title ? `${row.name} — ${row.title}` : row.name });
  }

  return { title: displayName(section), leader, opsRows };
}

function buildFinanceRows(sectionId: string, chart: ChartData): PrintOpsRow[] {
  const sm = seatMap(chart.seats);
  const rows: PrintOpsRow[] = [];
  const childIds = sortDirectChildrenForPrint(sectionId, chart);
  for (const cid of childIds) {
    const seat = sm.get(cid);
    if (!seat) continue;
    if (isStructuralSeat(seat)) {
      rows.push(opsRowFromGroup(seat, chart));
    } else {
      const row = toPersonRow(seat);
      rows.push({
        key: seat.id,
        label: "",
        value: row.title ? `${row.name} — ${row.title}` : row.name
      });
    }
  }
  return rows;
}

function buildPeopleList(sectionId: string, chart: ChartData): PrintPersonRow[] {
  const sm = seatMap(chart.seats);
  return sortDirectChildrenForPrint(sectionId, chart)
    .map((id) => sm.get(id))
    .filter((s): s is Seat => Boolean(s && isPersonSeat(s)))
    .map(toPersonRow);
}

/** True when chart has Sales (2+ peer leaders), Production, and at least one governance panel. */
export function canUseExecutiveThreeColumnLayout(chart: ChartData): boolean {
  const ownerId = selectPrintOwnerId(chart);
  if (!ownerId) return false;
  const sm = seatMap(chart.seats);
  const owner = sm.get(ownerId);
  if (!owner || !isPersonSeat(owner)) return false;

  const salesId = findSectionId(chart, ownerId, /sales|revenue|go-to-market/i);
  const productionId = findSectionId(chart, ownerId, /production|operations|install.*shop/i);
  if (!salesId || !productionId) return false;

  const salesPeers = sortDirectChildrenForPrint(salesId, chart).filter((id) => {
    const s = sm.get(id);
    return s && isPersonSeat(s);
  });
  if (salesPeers.length < 2) return false;

  const financeId = findSectionId(chart, ownerId, /finance|administration|accounting/i);
  const partnersId = findSectionId(chart, ownerId, /^partners?($|\s|\/|&)|\bpartners\b/i);
  const safetyId = findSectionId(chart, ownerId, /safety|compliance/i);
  return Boolean(financeId || partnersId || safetyId);
}

export function buildExecutivePrintModel(chart: ChartData): ExecutivePrintModel | null {
  if (!canUseExecutiveThreeColumnLayout(chart)) return null;

  const ownerId = selectPrintOwnerId(chart)!;
  const sm = seatMap(chart.seats);
  const owner = sm.get(ownerId)!;

  const raw = [
    ...sectionPanelIds(chart, ownerId),
    ...additionalPanelRootIds(chart, ownerId).filter((id) => !sectionPanelIds(chart, ownerId).includes(id))
  ];
  const { customerServiceSectionId } = resolveOnePageSectionIds(raw, chart.seats);

  const salesId = findSectionId(chart, ownerId, /sales|revenue|go-to-market/i)!;
  const productionId = findSectionId(chart, ownerId, /production|operations|install.*shop/i)!;
  const financeId = findSectionId(chart, ownerId, /finance|administration|accounting/i);
  const partnersId = findSectionId(chart, ownerId, /^partners?($|\s|\/|&)|\bpartners\b/i);
  const safetyId = findSectionId(chart, ownerId, /safety|compliance/i);

  const salesSection = sm.get(salesId)!;
  const productionSection = sm.get(productionId)!;

  const governanceTitle = (id: string | null, fallback: string, pattern: RegExp): string => {
    if (!id) return fallback;
    const seat = sm.get(id);
    if (!seat) return fallback;
    const label = displayName(seat);
    if (pattern.test(label)) return fallback;
    return label;
  };

  return {
    owner: toPersonRow(owner),
    sales: {
      title: displayName(salesSection),
      columns: buildSalesColumns(salesId, chart)
    },
    production: buildProductionPanel(productionId, chart, customerServiceSectionId),
    governance: {
      finance: {
        title: financeId
          ? governanceTitle(financeId, "Finance & Administration", /finance|administration/i)
          : "Finance & Administration",
        rows: financeId ? buildFinanceRows(financeId, chart) : []
      },
      partners: {
        title: partnersId ? displayName(sm.get(partnersId)!) : "Partners",
        people: partnersId ? buildPeopleList(partnersId, chart) : []
      },
      safety: {
        title: safetyId
          ? governanceTitle(safetyId, "Safety & Compliance", /safety|compliance/i)
          : "Safety & Compliance",
        people: safetyId ? buildPeopleList(safetyId, chart) : []
      }
    }
  };
}
