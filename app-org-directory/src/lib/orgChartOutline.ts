import { APP_TITLE, humanRelationshipNote, printRelationshipTypeLabel, sortRootSeatIds } from "./displayLabels";
import type { ChartData, Seat } from "./chartTypes";
import { ensureLayout } from "./chartUtils";
import {
  childrenOf,
  displayName,
  isStructuralSeat,
  normalizeChartData,
  rootSeatIds,
  seatMap
} from "./chartUtils";
import { filterPrintSecondaryRelationships, sortPrintChildren } from "./printLayout";

const OUTLINE_FOOTER = "Generated from eliteOS Org Directory";

/** Single line for a seat in the text tree (no raw IDs or status slugs). */
export function outlineSeatLabel(seat: Seat): string {
  if (isStructuralSeat(seat)) {
    return displayName(seat);
  }
  const title = String(seat.title ?? "").trim();
  if (seat.status === "open") {
    return title ? `Open role — ${title}` : "Open role";
  }
  if (seat.status === "future") {
    return title ? `Future role — ${title}` : "Future role";
  }
  const name = String(seat.personName ?? "").trim();
  if (seat.status === "advisor") {
    if (name && title) return `${name} — ${title}`;
    return name || title || "Advisor";
  }
  const display = name || displayName(seat);
  if (title && display !== title) return `${display} — ${title}`;
  return display;
}

function sortOutlineChildIds(chart: ChartData, childIds: string[]): string[] {
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

function appendTree(
  seatId: string,
  chart: ChartData,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  visited: Set<string>,
  lines: string[]
): void {
  const sm = seatMap(chart.seats);
  const seat = sm.get(seatId);
  if (!seat) return;

  const label = outlineSeatLabel(seat);
  if (isRoot) {
    lines.push(label);
  } else {
    const branch = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${label}`);
  }

  if (visited.has(seatId)) return;
  visited.add(seatId);

  const childIds = sortOutlineChildIds(
    chart,
    childrenOf(seatId, chart.seats, chart.relationships).map((c) => c.id)
  );
  const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
  childIds.forEach((cid, i) => {
    appendTree(cid, chart, childPrefix, i === childIds.length - 1, false, visited, lines);
  });
}

function buildSecondarySection(chart: ChartData): string[] {
  const sm = seatMap(chart.seats);
  const secondary = filterPrintSecondaryRelationships(chart);
  if (!secondary.length) return [];

  const lines = ["", "Advisory / Cross-functional Relationships"];
  for (const r of secondary) {
    const from = sm.get(r.fromSeatId);
    const to = sm.get(r.toSeatId);
    if (!from || !to) continue;
    const fromLabel = outlineSeatLabel(from);
    const toLabel = outlineSeatLabel(to);
    const rel = printRelationshipTypeLabel(r.type);
    const note = humanRelationshipNote(r.label);
    if (note) {
      lines.push(`- ${fromLabel} → ${toLabel}: ${rel} (${note})`);
    } else {
      lines.push(`- ${fromLabel} → ${toLabel}: ${rel}`);
    }
  }
  return lines;
}

/** Plain-text org chart outline for copy/download. */
export function buildOrgChartTextOutline(input: ChartData): string {
  const chart = normalizeChartData(input);
  if (!chart.seats.length) {
    return `${APP_TITLE}\n\n(No roles on chart)\n\n${OUTLINE_FOOTER}`;
  }

  const lines: string[] = [APP_TITLE, ""];
  const roots = sortRootSeatIds(rootSeatIds(chart.seats, chart.relationships), chart.seats);

  roots.forEach((rootId, i) => {
    appendTree(rootId, chart, "", true, true, new Set(), lines);
    if (i < roots.length - 1) lines.push("");
  });

  lines.push(...buildSecondarySection(chart));
  lines.push("", OUTLINE_FOOTER);
  return lines.join("\n");
}

/** Markdown org chart outline with fenced tree block. */
export function buildOrgChartMarkdownOutline(input: ChartData): string {
  const chart = normalizeChartData(input);
  if (!chart.seats.length) {
    return `# ${APP_TITLE}\n\n_(No roles on chart)_\n\n---\n\n${OUTLINE_FOOTER}`;
  }

  const treeLines: string[] = [];
  const roots = sortRootSeatIds(rootSeatIds(chart.seats, chart.relationships), chart.seats);
  roots.forEach((rootId, i) => {
    appendTree(rootId, chart, "", true, true, new Set(), treeLines);
    if (i < roots.length - 1) treeLines.push("");
  });

  const parts: string[] = [`# ${APP_TITLE}`, "", "```", ...treeLines, "```"];

  const secondary = filterPrintSecondaryRelationships(chart);
  if (secondary.length) {
    const sm = seatMap(chart.seats);
    parts.push("", "## Advisory / Cross-functional Relationships", "");
    for (const r of secondary) {
      const from = sm.get(r.fromSeatId);
      const to = sm.get(r.toSeatId);
      if (!from || !to) continue;
      const rel = printRelationshipTypeLabel(r.type);
      const note = humanRelationshipNote(r.label);
      const fromLabel = outlineSeatLabel(from);
      const toLabel = outlineSeatLabel(to);
      if (note) {
        parts.push(`- ${fromLabel} → ${toLabel}: ${rel} (${note})`);
      } else {
        parts.push(`- ${fromLabel} → ${toLabel}: ${rel}`);
      }
    }
  }

  parts.push("", "---", "", OUTLINE_FOOTER);
  return parts.join("\n");
}

export const OUTLINE_TXT_FILENAME = "elite-stone-fabrication-org-chart.txt";
export const OUTLINE_MD_FILENAME = "elite-stone-fabrication-org-chart.md";
