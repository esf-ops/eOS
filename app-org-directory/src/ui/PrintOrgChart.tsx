import type { CSSProperties } from "react";
import type { ChartData, Department, Relationship, Seat } from "../lib/chartTypes";
import { formatBranchLabel, seatStatusLabel } from "../lib/displayLabels";
import { childrenOf, deptMap, isStructuralSeat, normalizeChartData, seatMap } from "../lib/chartUtils";
import {
  duplicatePersonNames,
  filterPrintSecondaryRelationships,
  formatPrintContextRelationshipLine,
  otherPrintRootIds,
  printSeatHeading,
  selectPrintRootId,
  sortPrintChildren
} from "../lib/printLayout";

function PrintSeatCard({
  seat,
  dept,
  duplicateNames
}: {
  seat: Seat;
  dept?: Department;
  duplicateNames: Set<string>;
}) {
  const structural = isStructuralSeat(seat);
  const branch = formatBranchLabel(seat.branch);
  const showStatus = !structural && seat.status !== "filled";
  const title = String(seat.title ?? "").trim();
  const heading = printSeatHeading(seat, duplicateNames);
  const showRole = title && (structural || heading !== title);

  const metaParts: string[] = [];
  if (dept?.name) metaParts.push(dept.name);
  if (branch) metaParts.push(branch);
  if (showStatus) metaParts.push(seatStatusLabel(seat.status));

  return (
    <div
      className={`od-print-node od-print-node-${seat.status}${structural ? " od-print-node-structural" : ""}`}
      style={dept?.color ? ({ borderTopColor: dept.color } as CSSProperties) : undefined}
    >
      {structural ? <div className="od-print-node-kind">Group</div> : null}
      <div className="od-print-node-name">{heading}</div>
      {showRole ? <div className="od-print-node-title">{title}</div> : null}
      {metaParts.length > 0 ? <div className="od-print-node-meta">{metaParts.join(" · ")}</div> : null}
    </div>
  );
}

function PrintTreeBranch({
  seatId,
  seats,
  relationships,
  departments,
  duplicateNames
}: {
  seatId: string;
  seats: Seat[];
  relationships: Relationship[];
  departments: Department[];
  duplicateNames: Set<string>;
}) {
  const sm = seatMap(seats);
  const dm = deptMap(departments);
  const seat = sm.get(seatId);
  if (!seat) return null;
  const childSeats = childrenOf(seatId, seats, relationships);
  const kids = sortPrintChildren(
    childSeats.map((c) => c.id),
    seats
  );
  return (
    <li>
      <PrintSeatCard seat={seat} dept={seat.departmentId ? dm.get(seat.departmentId) : undefined} duplicateNames={duplicateNames} />
      {kids.length > 0 ? (
        <ul>
          {kids.map((cid) => (
            <PrintTreeBranch
              key={cid}
              seatId={cid}
              seats={seats}
              relationships={relationships}
              departments={departments}
              duplicateNames={duplicateNames}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type Props = {
  chartData: ChartData;
};

/** Print-safe static org tree from canonical chart_data (direct hierarchy only). */
export default function PrintOrgChart({ chartData }: Props) {
  const chart = normalizeChartData(chartData);
  const { seats, relationships, departments } = chart;
  const sm = seatMap(seats);
  const duplicateNames = duplicatePersonNames(seats);
  const primaryRoot = selectPrintRootId(chart);
  const extraRoots = otherPrintRootIds(chart, primaryRoot);
  const secondary = filterPrintSecondaryRelationships(chart);

  return (
    <div className="od-print-chart-body">
      <div className="od-print-main-hierarchy">
        <div className="od-print-tree-scaler">
          {primaryRoot ? (
            <ul className="od-print-tree od-print-tree-primary">
              <PrintTreeBranch
                seatId={primaryRoot}
                seats={seats}
                relationships={relationships}
                departments={departments}
                duplicateNames={duplicateNames}
              />
            </ul>
          ) : null}
        </div>
      </div>

      {extraRoots.length > 0 ? (
        <div className="od-print-extra-roots">
          <h2 className="od-print-section-title">Additional top-level structure</h2>
          <div className="od-print-tree-scaler od-print-tree-scaler--compact">
            <ul className="od-print-tree">
              {extraRoots.map((rid) => (
                <PrintTreeBranch
                  key={rid}
                  seatId={rid}
                  seats={seats}
                  relationships={relationships}
                  departments={departments}
                  duplicateNames={duplicateNames}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {secondary.length > 0 ? (
        <div className="od-print-secondary">
          <h2 className="od-print-section-title">Advisory / Partner Context</h2>
          <p className="od-print-secondary-help">
            Advisory relationships are shown for context and do not necessarily represent direct reporting.
          </p>
          <ul className="od-print-context-list">
            {secondary.map((r) => {
              const from = sm.get(r.fromSeatId);
              const to = sm.get(r.toSeatId);
              if (!from || !to) return null;
              return (
                <li key={r.id}>
                  {formatPrintContextRelationshipLine(from, to, r.type, r.label, duplicateNames)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
