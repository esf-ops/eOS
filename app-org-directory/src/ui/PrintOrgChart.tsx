import type { CSSProperties } from "react";
import type { ChartData, Department, Relationship, Seat } from "../lib/chartTypes";
import {
  formatBranchLabel,
  formatSecondaryRelationshipLine,
  seatStatusLabel,
  sortRootSeatIds
} from "../lib/displayLabels";
import { childrenOf, deptMap, displayName, normalizeChartData, nonDirectRelationships, rootSeatIds, seatMap } from "../lib/chartUtils";

function PrintSeatCard({ seat, dept }: { seat: Seat; dept?: Department }) {
  const branch = formatBranchLabel(seat.branch);
  const showStatus = seat.status !== "filled";
  return (
    <div
      className={`od-print-node od-print-node-${seat.status}`}
      style={dept?.color ? ({ borderTopColor: dept.color } as CSSProperties) : undefined}
    >
      <div className="od-print-node-name">{displayName(seat)}</div>
      <div className="od-print-node-title">{seat.title}</div>
      <div className="od-print-node-meta">
        {dept ? <span>{dept.name}</span> : null}
        {branch ? <span>{branch}</span> : null}
        {showStatus ? <span>{seatStatusLabel(seat.status)}</span> : null}
      </div>
    </div>
  );
}

function PrintTreeBranch({
  seatId,
  seats,
  relationships,
  departments
}: {
  seatId: string;
  seats: Seat[];
  relationships: Relationship[];
  departments: Department[];
}) {
  const sm = seatMap(seats);
  const dm = deptMap(departments);
  const seat = sm.get(seatId);
  if (!seat) return null;
  const kids = childrenOf(seatId, seats, relationships);
  return (
    <li>
      <PrintSeatCard seat={seat} dept={seat.departmentId ? dm.get(seat.departmentId) : undefined} />
      {kids.length > 0 ? (
        <ul>
          {kids.map((c) => (
            <PrintTreeBranch key={c.id} seatId={c.id} seats={seats} relationships={relationships} departments={departments} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type Props = {
  chartData: ChartData;
};

/** Print-safe static org tree from canonical chart_data (no React Flow transforms). */
export default function PrintOrgChart({ chartData }: Props) {
  const chart = normalizeChartData(chartData);
  const { seats, relationships, departments } = chart;
  const sm = seatMap(seats);
  const roots = sortRootSeatIds(rootSeatIds(seats, relationships), seats);
  const secondary = nonDirectRelationships(relationships);

  return (
    <div className="od-print-chart-body">
      <div className="od-print-tree-wrap">
        <ul className="od-print-tree">
          {roots.map((rid) => (
            <PrintTreeBranch key={rid} seatId={rid} seats={seats} relationships={relationships} departments={departments} />
          ))}
        </ul>
      </div>
      {secondary.length > 0 ? (
        <div className="od-print-secondary">
          <h2>Advisory / Cross-functional Relationships</h2>
          <ul>
            {secondary.map((r) => {
              const from = sm.get(r.fromSeatId);
              const to = sm.get(r.toSeatId);
              if (!from || !to) return null;
              return (
                <li key={r.id}>
                  {formatSecondaryRelationshipLine(displayName(from), displayName(to), r.type, r.label)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
