import type { ChartData, Seat } from "../lib/chartTypes";
import { APP_TITLE, PRINT_SUBTITLE } from "../lib/displayLabels";
import { isStructuralSeat, normalizeChartData, seatMap } from "../lib/chartUtils";
import { outlineSeatLabel } from "../lib/orgChartOutline";
import {
  additionalPanelRootIds,
  isOwnerSeat,
  sectionPanelIds,
  selectPrintOwnerId
} from "../lib/printSectionLayout";
import {
  buildPanelContent,
  orderSectionsForOnePage,
  resolveOnePageSectionIds,
  type PanelContent,
  type PeerColumn
} from "../lib/printOnePageCompact";

const PRINT_FOOTER = "Generated from eliteOS Org Directory";

function PrintPeerColumn({ column }: { column: PeerColumn }) {
  const { peer, lines } = column;
  return (
    <div className="od-print-1p-peer-col">
      <div className="od-print-1p-peer-head">{outlineSeatLabel(peer)}</div>
      {lines.length > 0 ? (
        <ul className="od-print-1p-lines">
          {lines.map((ln) => (
            <li key={ln.key}>{ln.text}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PrintPanelBody({ content }: { content: PanelContent }) {
  if (content.mode === "peer-columns") {
    return (
      <div
        className="od-print-1p-peers"
        style={{ gridTemplateColumns: `repeat(${Math.min(content.columns.length, 2)}, minmax(0, 1fr))` }}
      >
        {content.columns.map((col) => (
          <PrintPeerColumn key={col.peerId} column={col} />
        ))}
      </div>
    );
  }

  const lines = content.mode === "compact-list" ? content.lines : content.lines;
  return (
    <ul className="od-print-1p-lines od-print-1p-lines-tight">
      {lines.map((ln) => (
        <li key={ln.key}>{ln.text}</li>
      ))}
    </ul>
  );
}

function PrintPanel({
  sectionId,
  chart,
  size,
  customerServiceSectionId
}: {
  sectionId: string;
  chart: ChartData;
  size: "wide" | "narrow";
  customerServiceSectionId: string | null;
}) {
  const content = buildPanelContent(sectionId, chart, { customerServiceSectionId });
  if (!content) return null;
  return (
    <section className={`od-print-1p-panel od-print-1p-panel--${size}`}>
      <h3 className="od-print-1p-panel-title">{content.title}</h3>
      <PrintPanelBody content={content} />
    </section>
  );
}

type Props = {
  chartData: ChartData;
};

/**
 * Fixed one-page executive print sheet — does not flow across browser pages.
 * Peer leaders render in columns; deeper structure uses compact text rows.
 */
export default function PrintOrgChart({ chartData }: Props) {
  const chart = normalizeChartData(chartData);
  const ownerId = selectPrintOwnerId(chart);
  const owner = ownerId ? seatMap(chart.seats).get(ownerId) : null;
  const rawSectionIds = [
    ...sectionPanelIds(chart, ownerId),
    ...additionalPanelRootIds(chart, ownerId).filter((id) => !sectionPanelIds(chart, ownerId).includes(id))
  ];
  const { panelIds, customerServiceSectionId } = resolveOnePageSectionIds(rawSectionIds, chart.seats);
  const ordered = orderSectionsForOnePage(panelIds, chart.seats);

  return (
    <div className="od-print-one-page-sheet" aria-label="One-page org chart print">
      <header className="od-print-one-page-header">
        <h1>{APP_TITLE}</h1>
        <p>{PRINT_SUBTITLE}</p>
      </header>

      {owner ? <div className="od-print-one-page-owner">{outlineSeatLabel(owner)}</div> : null}

      <div className="od-print-one-page-grid">
        {ordered.map(({ id, size }) => (
          <PrintPanel
            key={id}
            sectionId={id}
            chart={chart}
            size={size}
            customerServiceSectionId={customerServiceSectionId}
          />
        ))}
      </div>

      <footer className="od-print-one-page-footer">{PRINT_FOOTER}</footer>
    </div>
  );
}
