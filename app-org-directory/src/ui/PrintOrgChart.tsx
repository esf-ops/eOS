import type { ChartData } from "../lib/chartTypes";
import { APP_TITLE, PRINT_SUBTITLE } from "../lib/displayLabels";
import { normalizeChartData, seatMap } from "../lib/chartUtils";
import { outlineSeatLabel } from "../lib/orgChartOutline";
import {
  additionalPanelRootIds,
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
import {
  buildExecutivePrintModel,
  type ExecutivePrintModel,
  type PrintOpsRow,
  type PrintPersonRow
} from "../lib/printExecutiveLayout";

const PRINT_FOOTER = "Generated from eliteOS Org Directory";

function PersonLine({ row, variant = "default" }: { row: PrintPersonRow; variant?: "leader" | "default" | "nested" }) {
  const cls =
    variant === "leader"
      ? "od-print-exec-peer-leader"
      : variant === "nested"
        ? "od-print-exec-person od-print-exec-person--nested"
        : "od-print-exec-person";
  return (
    <div className={cls}>
      <span className="od-print-exec-person-name">{row.name}</span>
      {row.title ? <span className="od-print-exec-person-title"> — {row.title}</span> : null}
    </div>
  );
}

function ReportBlock({ row }: { row: PrintPersonRow }) {
  if (row.nested?.length) {
    return (
      <div className="od-print-exec-branch">
        <PersonLine row={row} />
        <div className="od-print-exec-branch-team">
          {row.nested.map((n) => (
            <PersonLine key={n.key} row={n} variant="nested" />
          ))}
        </div>
      </div>
    );
  }
  return <PersonLine row={row} />;
}

function OpsRow({ row }: { row: PrintOpsRow }) {
  if (!row.label) {
    return (
      <div className="od-print-exec-op-row od-print-exec-op-row--solo">
        <span className="od-print-exec-op-value">{row.value}</span>
      </div>
    );
  }
  return (
    <div className="od-print-exec-op-row">
      <span className="od-print-exec-op-label">{row.label}</span>
      <span className="od-print-exec-op-sep">—</span>
      <span className="od-print-exec-op-value">{row.value}</span>
    </div>
  );
}

function ExecutiveThreeColumnSheet({ model }: { model: ExecutivePrintModel }) {
  const { owner, sales, production, governance } = model;

  return (
    <div className="od-print-one-page-sheet od-print-exec-sheet" aria-label="Executive org chart print">
      <header className="od-print-one-page-header">
        <h1>{APP_TITLE}</h1>
        <p>{PRINT_SUBTITLE}</p>
      </header>

      <div className="od-print-exec-owner-wrap">
        <div className="od-print-exec-owner-card">
          <div className="od-print-exec-owner-name">{owner.name}</div>
          {owner.title ? <div className="od-print-exec-owner-title">{owner.title}</div> : null}
        </div>
      </div>

      <div className="od-print-exec-body">
        <section className="od-print-exec-panel od-print-exec-panel--sales">
          <h2 className="od-print-exec-panel-title">{sales.title}</h2>
          <div className="od-print-exec-peers">
            {sales.columns.map((col) => (
              <div key={col.peerId} className="od-print-exec-peer">
                <PersonLine row={col.leader} variant="leader" />
                <div className="od-print-exec-peer-team">
                  {col.reports.map((r) => (
                    <ReportBlock key={r.key} row={r} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="od-print-exec-panel od-print-exec-panel--production">
          <h2 className="od-print-exec-panel-title">{production.title}</h2>
          <PersonLine row={production.leader} variant="leader" />
          <div className="od-print-exec-ops">
            {production.opsRows.map((row) => (
              <OpsRow key={row.key} row={row} />
            ))}
          </div>
        </section>

        <div className="od-print-exec-col-gov">
          {governance.finance.rows.length > 0 ? (
            <section className="od-print-exec-panel od-print-exec-panel--gov od-print-exec-panel--finance">
              <h2 className="od-print-exec-panel-title">{governance.finance.title}</h2>
              <div className="od-print-exec-ops od-print-exec-ops--dense">
                {governance.finance.rows.map((row) => (
                  <OpsRow key={row.key} row={row} />
                ))}
              </div>
            </section>
          ) : null}
          {governance.partners.people.length > 0 ? (
            <section className="od-print-exec-panel od-print-exec-panel--gov od-print-exec-panel--partners">
              <h2 className="od-print-exec-panel-title">{governance.partners.title}</h2>
              <div className="od-print-exec-people-stack">
                {governance.partners.people.map((p) => (
                  <PersonLine key={p.key} row={p} />
                ))}
              </div>
            </section>
          ) : null}
          {governance.safety.people.length > 0 ? (
            <section className="od-print-exec-panel od-print-exec-panel--gov od-print-exec-panel--safety">
              <h2 className="od-print-exec-panel-title">{governance.safety.title}</h2>
              <div className="od-print-exec-people-stack">
                {governance.safety.people.map((p) => (
                  <PersonLine key={p.key} row={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <footer className="od-print-one-page-footer">{PRINT_FOOTER}</footer>
    </div>
  );
}

function CompactPeerColumn({ column }: { column: PeerColumn }) {
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

function CompactPanelBody({ content }: { content: PanelContent }) {
  if (content.mode === "peer-columns") {
    return (
      <div
        className="od-print-1p-peers"
        style={{ gridTemplateColumns: `repeat(${Math.min(content.columns.length, 2)}, minmax(0, 1fr))` }}
      >
        {content.columns.map((col) => (
          <CompactPeerColumn key={col.peerId} column={col} />
        ))}
      </div>
    );
  }
  const lines = content.lines;
  return (
    <ul className="od-print-1p-lines od-print-1p-lines-tight">
      {lines.map((ln) => (
        <li key={ln.key}>{ln.text}</li>
      ))}
    </ul>
  );
}

function CompactOnePageFallback({ chart }: { chart: ChartData }) {
  const ownerId = selectPrintOwnerId(chart);
  const owner = ownerId ? seatMap(chart.seats).get(ownerId) : null;
  const rawSectionIds = [
    ...sectionPanelIds(chart, ownerId),
    ...additionalPanelRootIds(chart, ownerId).filter((id) => !sectionPanelIds(chart, ownerId).includes(id))
  ];
  const { panelIds, customerServiceSectionId } = resolveOnePageSectionIds(rawSectionIds, chart.seats);
  const ordered = orderSectionsForOnePage(panelIds, chart.seats);

  return (
    <div className="od-print-one-page-sheet od-print-compact-sheet" aria-label="Compact org chart print">
      <header className="od-print-one-page-header">
        <h1>{APP_TITLE}</h1>
        <p>{PRINT_SUBTITLE}</p>
      </header>
      {owner ? <div className="od-print-one-page-owner">{outlineSeatLabel(owner)}</div> : null}
      <div className="od-print-one-page-grid">
        {ordered.map(({ id, size }) => {
          const content = buildPanelContent(id, chart, { customerServiceSectionId });
          if (!content) return null;
          return (
            <section key={id} className={`od-print-1p-panel od-print-1p-panel--${size}`}>
              <h3 className="od-print-1p-panel-title">{content.title}</h3>
              <CompactPanelBody content={content} />
            </section>
          );
        })}
      </div>
      <footer className="od-print-one-page-footer">{PRINT_FOOTER}</footer>
    </div>
  );
}

type Props = {
  chartData: ChartData;
};

export default function PrintOrgChart({ chartData }: Props) {
  const chart = normalizeChartData(chartData);
  const executiveModel = buildExecutivePrintModel(chart);
  if (executiveModel) {
    return <ExecutiveThreeColumnSheet model={executiveModel} />;
  }
  return <CompactOnePageFallback chart={chart} />;
}
