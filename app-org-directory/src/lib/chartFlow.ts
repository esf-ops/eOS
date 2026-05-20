import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { ChartData, RelationshipType } from "./chartTypes";
import { computeAutoLayout, resolveNodePosition } from "./chartLayout";
import { deptMap } from "./chartUtils";

export type SeatNodeData = {
  seat: ChartData["seats"][number];
  dept?: ChartData["departments"][number];
  selected?: boolean;
};

function edgeVisual(type: RelationshipType): { stroke: string; strokeDasharray?: string; strokeWidth: number } {
  switch (type) {
    case "dotted":
      return { stroke: "#64748b", strokeDasharray: "6 4", strokeWidth: 1.5 };
    case "advisory":
      return { stroke: "#7c3aed", strokeDasharray: "4 3", strokeWidth: 1.5 };
    case "partner_context":
      return { stroke: "#9333ea", strokeDasharray: "2 2", strokeWidth: 2 };
    default:
      return { stroke: "#334155", strokeWidth: 2 };
  }
}

export function chartToFlow(chart: ChartData, selectedSeatId: string | null): { nodes: Node<SeatNodeData>[]; edges: Edge[] } {
  const dm = deptMap(chart.departments);
  const auto = computeAutoLayout(chart);

  const nodes: Node<SeatNodeData>[] = chart.seats.map((seat) => ({
    id: seat.id,
    type: "seat",
    position: resolveNodePosition(seat.id, chart, auto),
    data: {
      seat,
      dept: seat.departmentId ? dm.get(seat.departmentId) : undefined,
      selected: seat.id === selectedSeatId
    }
  }));

  const edges: Edge[] = chart.relationships.map((r) => {
    const vis = edgeVisual(r.type);
    return {
      id: r.id,
      source: r.toSeatId,
      target: r.fromSeatId,
      label: undefined,
      style: vis,
      markerEnd: { type: MarkerType.ArrowClosed, color: vis.stroke },
      data: { relType: r.type, relLabel: r.label },
      animated: r.type !== "direct"
    };
  });

  return { nodes, edges };
}
