import { sortRootSeatIds } from "./displayLabels";
import type { ChartData, NodePosition } from "./chartTypes";
import { childrenOf, ensureLayout, rootSeatIds } from "./chartUtils";

const NODE_W = 220;
const NODE_H = 118;
const GAP_X = 48;
const GAP_Y = 100;

/**
 * Top-down tree layout from direct reporting lines (manager → reports).
 * Does not modify relationships — only returns positions.
 */
export function computeAutoLayout(chart: ChartData): Record<string, NodePosition> {
  const { seats, relationships } = chart;
  if (!seats.length) return {};

  const roots = sortRootSeatIds(rootSeatIds(seats, relationships), seats);
  const positions: Record<string, NodePosition> = {};
  const subtreeWidth = new Map<string, number>();

  function widthOf(seatId: string): number {
    if (subtreeWidth.has(seatId)) return subtreeWidth.get(seatId)!;
    const kids = childrenOf(seatId, seats, relationships);
    if (!kids.length) {
      subtreeWidth.set(seatId, NODE_W);
      return NODE_W;
    }
    let w = 0;
    for (const k of kids) w += widthOf(k.id) + GAP_X;
    w = Math.max(NODE_W, w - GAP_X);
    subtreeWidth.set(seatId, w);
    return w;
  }

  function place(seatId: string, left: number, depth: number): number {
    const w = widthOf(seatId);
    const x = left + w / 2 - NODE_W / 2;
    const y = depth * (NODE_H + GAP_Y);
    positions[seatId] = { x, y };

    const kids = childrenOf(seatId, seats, relationships);
    let cursor = left;
    for (const k of kids) {
      const kw = widthOf(k.id);
      place(k.id, cursor, depth + 1);
      cursor += kw + GAP_X;
    }
    return w;
  }

  let xCursor = 0;
  for (const rid of roots) {
    const w = widthOf(rid);
    place(rid, xCursor, 0);
    xCursor += w + GAP_X * 2;
  }

  // Seats not reached by tree (e.g. only advisory links) — place in a row below
  const placed = new Set(Object.keys(positions));
  const orphans = seats.filter((s) => !placed.has(s.id));
  let ox = 0;
  const maxY =
    Object.values(positions).reduce((m, p) => Math.max(m, p.y), 0) + NODE_H + GAP_Y;
  for (const s of orphans) {
    positions[s.id] = { x: ox, y: maxY };
    ox += NODE_W + GAP_X;
  }

  return positions;
}

export function applyAutoLayout(chart: ChartData): ChartData {
  const positions = computeAutoLayout(chart);
  return {
    ...chart,
    layout: { nodePositions: positions }
  };
}

export function clearManualLayout(chart: ChartData): ChartData {
  return {
    ...chart,
    layout: { nodePositions: {} }
  };
}

export function resolveNodePosition(
  seatId: string,
  chart: ChartData,
  autoPositions: Record<string, NodePosition>
): NodePosition {
  const saved = ensureLayout(chart).nodePositions[seatId];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
  return autoPositions[seatId] ?? { x: 0, y: 0 };
}
