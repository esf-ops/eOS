import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { formatBranchLabel, seatStatusLabel } from "../lib/displayLabels";
import { displayName, isStructuralSeat } from "../lib/chartUtils";
import type { SeatNodeData } from "../lib/chartFlow";

type SeatFlowNode = Node<SeatNodeData, "seat">;

export default function OrgChartSeatNode({ data }: NodeProps<SeatFlowNode>) {
  const seat = data.seat;
  const dept = data.dept;
  const structural = isStructuralSeat(seat);
  const branch = formatBranchLabel(seat.branch);
  const showStatus = !structural && seat.status !== "filled";
  const classes = [
    "od-flow-node",
    data.selected ? "od-flow-node-selected" : "",
    structural ? "od-flow-node-structural" : "",
    seat.status === "open" ? "od-flow-node-open" : "",
    seat.status === "future" ? "od-flow-node-future" : "",
    seat.status === "advisor" ? "od-flow-node-advisor" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={dept?.color ? ({ "--od-dept-color": dept.color } as React.CSSProperties) : undefined}
    >
      <Handle type="target" position={Position.Top} className="od-flow-handle" />
      {structural ? <div className="od-flow-node-kind">Group</div> : null}
      <div className="od-flow-node-name">{displayName(seat)}</div>
      {!structural && seat.title && displayName(seat) !== seat.title ? (
        <div className="od-flow-node-title">{seat.title}</div>
      ) : null}
      <div className="od-flow-node-meta">
        {dept ? <span className="od-tag od-tag-dept">{dept.name}</span> : null}
        {branch ? <span className="od-tag od-tag-loc">{branch}</span> : null}
        {showStatus ? <span className="od-tag od-tag-status">{seatStatusLabel(seat.status)}</span> : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="od-flow-handle" />
    </div>
  );
}
