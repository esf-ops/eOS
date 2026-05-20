import type { CSSProperties } from "react";
import type { ChartData, Department, Seat } from "../lib/chartTypes";
import { formatBranchLabel, seatStatusLabel } from "../lib/displayLabels";
import { deptMap, isStructuralSeat, normalizeChartData, seatMap } from "../lib/chartUtils";
import { outlineSeatLabel } from "../lib/orgChartOutline";
import {
  duplicatePersonNames,
  filterPrintSecondaryRelationships,
  formatPrintContextRelationshipLine
} from "../lib/printLayout";
import {
  additionalPanelRootIds,
  isOwnerSeat,
  printPanelSpanClass,
  sectionPanelIds,
  selectPrintOwnerId,
  sortDirectChildrenForPrint
} from "../lib/printSectionLayout";

function PrintMiniCard({
  seat,
  dept,
  variant = "default"
}: {
  seat: Seat;
  dept?: Department;
  variant?: "owner" | "peer" | "sub" | "default";
}) {
  const structural = isStructuralSeat(seat);
  const branch = formatBranchLabel(seat.branch);
  const showStatus = !structural && seat.status !== "filled";
  const title = String(seat.title ?? "").trim();
  const heading = outlineSeatLabel(seat);
  const showRole = !structural && title && heading !== title;

  const metaParts: string[] = [];
  if (dept?.name && variant !== "owner") metaParts.push(dept.name);
  if (branch) metaParts.push(branch);
  if (showStatus) metaParts.push(seatStatusLabel(seat.status));

  return (
    <div
      className={`od-print-mini od-print-mini-${variant} od-print-mini-${seat.status}${structural ? " od-print-mini-structural" : ""}`}
      style={dept?.color ? ({ borderTopColor: dept.color } as CSSProperties) : undefined}
    >
      {structural && variant !== "owner" ? <span className="od-print-mini-kind">Group</span> : null}
      <div className="od-print-mini-name">{heading}</div>
      {showRole ? <div className="od-print-mini-title">{title}</div> : null}
      {metaParts.length > 0 ? <div className="od-print-mini-meta">{metaParts.join(" · ")}</div> : null}
    </div>
  );
}

/** Descendants below a peer leader — always vertical (no peer columns at deeper levels). */
function PrintVerticalSubtree({
  parentId,
  chart,
  departments,
  visited
}: {
  parentId: string;
  chart: ChartData;
  departments: Department[];
  visited: Set<string>;
}) {
  if (visited.has(parentId)) return null;
  const nextVisited = new Set(visited);
  nextVisited.add(parentId);
  const dm = deptMap(departments);
  const sm = seatMap(chart.seats);
  const childIds = sortDirectChildrenForPrint(parentId, chart);
  if (!childIds.length) return null;

  return (
    <div className="od-print-subtree">
      {childIds.map((cid) => {
        const seat = sm.get(cid);
        if (!seat) return null;
        return (
          <div key={cid} className="od-print-sub-item">
            <PrintMiniCard seat={seat} dept={seat.departmentId ? dm.get(seat.departmentId) : undefined} variant="sub" />
            <PrintVerticalSubtree parentId={cid} chart={chart} departments={departments} visited={nextVisited} />
          </div>
        );
      })}
    </div>
  );
}

/** One major department / group panel with peer leaders in columns. */
function PrintSectionPanel({
  sectionId,
  chart,
  departments
}: {
  sectionId: string;
  chart: ChartData;
  departments: Department[];
}) {
  const sm = seatMap(chart.seats);
  const dm = deptMap(departments);
  const section = sm.get(sectionId);
  if (!section) return null;

  const peerIds = sortDirectChildrenForPrint(sectionId, chart);
  const spanClass = printPanelSpanClass(section, peerIds.length);
  const panelTitle = outlineSeatLabel(section);

  return (
    <section className={`od-print-panel ${spanClass}`.trim()}>
      <h3 className="od-print-panel-title">{panelTitle}</h3>
      {peerIds.length === 0 ? (
        <PrintMiniCard
          seat={section}
          dept={section.departmentId ? dm.get(section.departmentId) : undefined}
          variant="peer"
        />
      ) : (
        <div
          className="od-print-panel-peers"
          style={{ gridTemplateColumns: `repeat(${Math.min(peerIds.length, 4)}, minmax(0, 1fr))` }}
        >
          {peerIds.map((peerId) => {
            const peer = sm.get(peerId);
            if (!peer) return null;
            return (
              <div key={peerId} className="od-print-peer-col">
                <PrintMiniCard
                  seat={peer}
                  dept={peer.departmentId ? dm.get(peer.departmentId) : undefined}
                  variant="peer"
                />
                <PrintVerticalSubtree
                  parentId={peerId}
                  chart={chart}
                  departments={departments}
                  visited={new Set([sectionId])}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type Props = {
  chartData: ChartData;
};

/**
 * Executive one-page print: owner on top, major groups as horizontal panels,
 * peer leaders side-by-side within each panel (siblings never stacked as a vertical chain).
 */
export default function PrintOrgChart({ chartData }: Props) {
  const chart = normalizeChartData(chartData);
  const { seats, relationships, departments } = chart;
  const sm = seatMap(seats);
  const duplicateNames = duplicatePersonNames(seats);
  const ownerId = selectPrintOwnerId(chart);
  const owner = ownerId ? sm.get(ownerId) : null;
  const sectionIds = sectionPanelIds(chart, ownerId);
  const extraPanelRoots = additionalPanelRootIds(chart, ownerId);
  const secondary = filterPrintSecondaryRelationships(chart);

  const showOwnerRow = owner && (isOwnerSeat(owner) || isStructuralSeat(owner) || sectionIds.length > 0);

  return (
    <div className="od-print-executive">
      {showOwnerRow && owner ? (
        <div className="od-print-owner-row">
          <PrintMiniCard
            seat={owner}
            dept={owner.departmentId ? deptMap(departments).get(owner.departmentId) : undefined}
            variant="owner"
          />
        </div>
      ) : null}

      <div className="od-print-panels-grid">
        {sectionIds.map((sid) => (
          <PrintSectionPanel key={sid} sectionId={sid} chart={chart} departments={departments} />
        ))}
        {extraPanelRoots.map((rid) => (
          <PrintSectionPanel key={rid} sectionId={rid} chart={chart} departments={departments} />
        ))}
      </div>

      {secondary.length > 0 ? (
        <div className="od-print-secondary od-print-secondary-compact">
          <h2 className="od-print-section-title">Advisory / Partner Context</h2>
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
