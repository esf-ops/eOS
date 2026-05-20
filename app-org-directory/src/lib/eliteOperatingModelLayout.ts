import type { ChartData, NodePosition } from "./chartTypes";
import { childrenOf } from "./chartUtils";
import { computeAutoLayout } from "./chartLayout";

/** Collect seat id and all direct-report descendants. */
function subtreeSeatIds(rootId: string, chart: ChartData): string[] {
  const out: string[] = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of childrenOf(id, chart.seats, chart.relationships)) {
      out.push(child.id);
      queue.push(child.id);
    }
  }
  return out;
}

function shiftIds(positions: Record<string, NodePosition>, ids: string[], dx: number, dy: number): void {
  for (const id of ids) {
    const p = positions[id];
    if (p) positions[id] = { x: p.x + dx, y: p.y + dy };
  }
}

/**
 * Post-process auto-layout for the operating model:
 * Eric centered, advisory branch left, operating leadership as main center column.
 */
export function layoutOperatingModelPositions(chart: ChartData): Record<string, NodePosition> {
  const positions = { ...computeAutoLayout(chart) };
  const ericId = "seat_eom_eric";
  const advisoryId = "seat_eom_advisory";
  const opsId = "seat_eom_ops";

  const ericPos = positions[ericId];
  if (!ericPos) return positions;

  const targetEricX = 1200;
  const dxEric = targetEricX - ericPos.x;
  for (const id of Object.keys(positions)) {
    const p = positions[id];
    positions[id] = { x: p.x + dxEric, y: p.y };
  }

  shiftIds(positions, subtreeSeatIds(advisoryId, chart), -620, 40);
  shiftIds(positions, subtreeSeatIds(opsId, chart), 80, 0);

  const bucketIds = chart.seats
    .filter((s) => s.id.startsWith("seat_eom_bucket_"))
    .map((s) => s.id);
  const row1 = bucketIds.slice(0, 5);
  const row2 = bucketIds.slice(5);
  const bucketY = (positions[opsId]?.y ?? 0) + 220;
  const startX = (positions[opsId]?.x ?? 0) - 1100;
  const colW = 260;
  row1.forEach((id, i) => {
    positions[id] = { x: startX + i * colW, y: bucketY };
    const kids = childrenOf(id, chart.seats, chart.relationships);
    let ky = bucketY + 130;
    kids.forEach((k, ki) => {
      positions[k.id] = { x: startX + i * colW + (ki % 2) * 28, y: ky };
      ky += 118;
    });
  });
  const row2Y = bucketY + 420;
  row2.forEach((id, i) => {
    positions[id] = { x: startX + i * colW, y: row2Y };
    const kids = childrenOf(id, chart.seats, chart.relationships);
    let ky = row2Y + 130;
    kids.forEach((k, ki) => {
      positions[k.id] = { x: startX + i * colW + (ki % 2) * 28, y: ky };
      ky += 118;
    });
  });

  return positions;
}
