import React from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
import type { InternalEstimateGroupComparisonRow, SelectedMaterialBreakdown } from "@quote-lib/prototypeQuoteMath";
import type { MeasuredRoom } from "@quote-lib/quoteTypes";
import type { CustomerEstimateDisplayModel } from "./lib/customerEstimateDisplayModel";

export type CustomerLineItem = {
  lineKey?: string;
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  roomName: string;
};

export type CustomerRoomAddonLine = {
  label: string;
  total: number;
  roomName: string;
};

export type CustomerEstimatePrintProps = {
  accountName: string;
  customerName: string;
  projectName: string;
  projectAddress: string;
  city: string;
  state: string;
  branch: string;
  salesRep: string;
  preparedBy: string;
  quoteNumber?: string | null;
  primaryGroup: string;
  primaryColorLabel: string;
  colorTbd: boolean;
  measuredRooms: MeasuredRoom[];
  selectedBreakdown: SelectedMaterialBreakdown;
  visibleLineItems: CustomerLineItem[];
  visibleRoomAddons: CustomerRoomAddonLine[];
  internalMaterialFoldDollars: number;
  estimateTotalExact: number;
  /** Customer-facing display model — all PDF dollar rows and scope blocks. */
  customerDisplay: CustomerEstimateDisplayModel;
  comparisonRows: InternalEstimateGroupComparisonRow[];
  estimateDate: string;
};

function formatSf(n: number): string {
  return Number(n).toFixed(2);
}

/** Format a pre-rounded customer display dollar amount (no re-rounding). */
function formatDisplayDollars(displayAmount: number): string {
  return `$${Math.max(0, Math.round(displayAmount)).toLocaleString()}`;
}

const BRANCH_LOCATIONS = [
  {
    city: "Lisbon, IA",
    lines: ["200 Kraiburg Blvd", "Lisbon, IA 52253", "319-455-4200"]
  },
  {
    city: "Iowa City, IA",
    lines: ["3 Escort Lane, Suite B", "Iowa City, IA 52240", "319-455-4200"]
  },
  {
    city: "Dyersville, IA",
    lines: ["819 9th Street SE, Suite A", "Dyersville, IA 52040", "319-640-3710"]
  }
] as const;

export default function CustomerEstimatePrint(props: CustomerEstimatePrintProps) {
  const addrLine = [props.projectAddress, props.city, props.state].filter(Boolean).join(", ");
  const { selectedBreakdown: bd } = props;
  const display = props.customerDisplay;

  const scopeRooms = props.measuredRooms.filter((r) => r.type !== "Vanity");
  const measuredById = new Map(props.measuredRooms.map((m) => [m.id, m]));

  return (
    <div className="customer-estimate-print" aria-hidden="true">
      <header className="cep-header">
        <img className="cep-logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
        <div className="cep-header-text">
          <h1 className="cep-title">Elite Stone Fabrication Estimate</h1>
          <p className="cep-date">{props.estimateDate}</p>
        </div>
      </header>

      <section className="cep-section cep-overview">
        <h2 className="cep-h2">Project overview</h2>
        <dl className="cep-overview-grid">
          <div className="cep-overview-item">
            <dt>Estimate date</dt>
            <dd>{props.estimateDate}</dd>
          </div>
          <div className="cep-overview-item">
            <dt>Quote / estimate ref.</dt>
            <dd>{props.quoteNumber?.trim() || "—"}</dd>
          </div>
          <div className="cep-overview-item">
            <dt>Customer</dt>
            <dd>{props.customerName || "—"}</dd>
          </div>
          <div className="cep-overview-item">
            <dt>Account</dt>
            <dd>{props.accountName || "—"}</dd>
          </div>
          <div className="cep-overview-item cep-overview-span-2">
            <dt>Project / Elite job name</dt>
            <dd>{props.projectName || "—"}</dd>
          </div>
          <div className="cep-overview-item cep-overview-span-3">
            <dt>Project address</dt>
            <dd>{addrLine || "—"}</dd>
          </div>
          <div className="cep-overview-item">
            <dt>Branch</dt>
            <dd>{props.branch || "—"}</dd>
          </div>
          <div className="cep-overview-item">
            <dt>Salesperson</dt>
            <dd>{props.salesRep || "—"}</dd>
          </div>
          <div className="cep-overview-item">
            <dt>Prepared by</dt>
            <dd>{props.preparedBy || "—"}</dd>
          </div>
        </dl>
      </section>

      {scopeRooms.length > 0 ? (
        <section className="cep-section">
          <h2 className="cep-h2">Scope summary</h2>
          <table className="cep-table cep-table-compact">
            <thead>
              <tr>
                <th>Room / area</th>
                <th>Material group</th>
                <th className="cep-num">Counter sf</th>
                <th className="cep-num">Backsplash + FHB sf</th>
              </tr>
            </thead>
            <tbody>
              {scopeRooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.group}</td>
                  <td className="cep-num">{formatSf(r.counter)}</td>
                  <td className="cep-num">{formatSf(r.splash + r.fhb)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Project totals</th>
                <td className="cep-num">{formatSf(bd.totals.countertopSf)}</td>
                <td className="cep-num">{formatSf(bd.totals.backsplashSf + bd.totals.fhbSf)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      ) : null}

      <section className="cep-section cep-estimate-summary">
        <h2 className="cep-h2">Estimate summary</h2>
        <table className="cep-table cep-table-compact cep-table-amounts cep-summary-table">
          <tbody>
            {display.estimateSummaryRows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className="cep-amt">{formatDisplayDollars(row.displayAmount)}</td>
              </tr>
            ))}
            <tr className="cep-summary-total-row">
              <td>
                <strong>Estimated project total</strong>
              </td>
              <td className="cep-amt cep-summary-total-value">
                <strong>{formatDisplayDollars(display.finalRounded)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="cep-muted cep-round-note">
          Each line rounds up to the nearest $10; <strong>Estimated project total</strong> is the sum of the rounded
          lines. Estimate only — not a contract.
        </p>
      </section>

      {display.showRoomBreakdown ? (
        <section className="cep-section cep-room-breakdown cep-section-compact">
          <h2 className="cep-h2">Room / area cost breakdown</h2>
          <p className="cep-muted cep-room-breakdown-lead">
            Estimated cost by room or area so you can compare scope — for example, kitchen now and bath later. Amounts
            round to the nearest $10 and reconcile with <strong>Estimated project total</strong> above. Use tax and
            material selections are included in each area&apos;s material amount (not shown as separate tax lines).
          </p>
          <table className="cep-table cep-table-compact cep-table-amounts cep-room-breakdown-table">
            <thead>
              <tr>
                <th>Room / area</th>
                <th className="cep-num">Total sf</th>
                <th className="cep-num">Material</th>
                <th className="cep-num">Add-ons</th>
                <th className="cep-num">Area total</th>
              </tr>
            </thead>
            <tbody>
              {display.roomAreaPrintRows.map((displayRow) => {
                const measured = measuredById.get(displayRow.roomId);
                return (
                  <React.Fragment key={displayRow.roomId}>
                    <tr className="cep-room-breakdown-main-row">
                      <td>
                        <strong>{displayRow.displayName}</strong>
                        {displayRow.isVanity ? (
                          <span className="cep-muted-inline">
                            {" "}
                            · Vanity program
                            {measured?.vanityProgram?.label ? ` · ${measured.vanityProgram.label}` : ""}
                          </span>
                        ) : (
                          <span className="cep-muted-inline">
                            {" "}
                            · {displayRow.materialGroup}
                            {displayRow.colorLabel ? ` · ${displayRow.colorLabel}` : props.colorTbd ? " · Color TBD" : ""}
                          </span>
                        )}
                      </td>
                      <td className="cep-num">{formatSf(displayRow.totalSqft)}</td>
                      <td className="cep-num cep-amt">{formatDisplayDollars(displayRow.displayedMaterial)}</td>
                      <td className="cep-num cep-amt">
                        {displayRow.displayedAddOns > 0 ? formatDisplayDollars(displayRow.displayedAddOns) : "—"}
                      </td>
                      <td className="cep-num cep-amt">
                        <strong>{formatDisplayDollars(displayRow.displayedAreaTotal)}</strong>
                      </td>
                    </tr>
                    {displayRow.addonLines.length > 0 ? (
                      <tr className="cep-room-breakdown-detail-row">
                        <td colSpan={5}>
                          <ul className="cep-room-addon-list">
                            {displayRow.addonLines.map((a) => (
                              <li key={`${displayRow.roomId}-${a.label}`}>
                                {a.label}
                                {a.displayedAmount > 0
                                  ? ` — ${formatDisplayDollars(a.displayedAmount)}`
                                  : null}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                    {displayRow.customerCustomLines.map((c, cIdx) => (
                      <tr
                        key={c.lineKey || `${displayRow.roomId}-custom-${cIdx}-${c.amountExact}`}
                        className="cep-room-breakdown-detail-row"
                      >
                        <td colSpan={4} className="cep-room-custom-line">
                          {c.name}
                        </td>
                        <td className="cep-num cep-amt">{formatDisplayDollars(roundCustomerDisplay(c.amountExact))}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {display.unassignedExact > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={4}>Other project items (see Estimate summary)</td>
                  <td className="cep-num cep-amt">{formatDisplayDollars(display.unassignedDisplayTotal)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </section>
      ) : null}

      {display.hasAddonOrFixtureDetail ? (
        <section className="cep-section cep-section-compact">
          <h2 className="cep-h2">Add-ons / fixtures</h2>
          <table className="cep-table cep-table-compact cep-table-amounts">
            <tbody>
              {display.addonDetailLines.map((a, idx) => (
                <tr key={`catalog-${idx}-${a.roomName}-${a.label}-${a.amountExact}`}>
                  <td>
                    {a.label}
                    {a.roomName ? <span className="cep-addon-room"> · {a.roomName}</span> : null}
                  </td>
                  <td className="cep-amt">{formatDisplayDollars(a.displayAmount)}</td>
                </tr>
              ))}
              {display.customerFixtureDetailLines.map((a, idx) => (
                <tr key={`fixture-${idx}-${a.roomName}-${a.label}-${a.amountExact}`}>
                  <td>
                    {a.label}
                    {a.roomName ? <span className="cep-addon-room"> · {a.roomName}</span> : null}
                  </td>
                  <td className="cep-amt">{formatDisplayDollars(a.displayAmount)}</td>
                </tr>
              ))}
              <tr className="cep-subtotal-row">
                <td>
                  <strong>Subtotal</strong>
                </td>
                <td className="cep-amt">
                  <strong>
                    {formatDisplayDollars(
                      display.summaryAddonsDisplay +
                        display.customerFixtureDetailLines.reduce((s, l) => s + l.displayAmount, 0)
                    )}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="cep-section cep-breakdown cep-section-compact">
        <h2 className="cep-h2">Quoted material breakdown</h2>
        <p className="cep-muted">
          Square footage by selected price group and room — scope reference, not a second project total. Dollar
          authority for scope decisions is <strong>Room / area cost breakdown</strong> and{" "}
          <strong>Estimate summary</strong> above.
          {props.colorTbd ? " Some colors TBD." : ""}
        </p>

        {display.materialScopeGroups.map((block) => (
          <div key={block.group} className="cep-material-group">
            <h3 className="cep-h3">
              {block.group}
              {block.colorLabel ? ` · ${block.colorLabel}` : ""}
            </h3>
            <table className="cep-table cep-table-compact cep-table-scope">
              <thead>
                <tr>
                  <th>Room / area</th>
                  <th className="cep-num">Counter sf</th>
                  <th className="cep-num">Backsplash sf</th>
                </tr>
              </thead>
              <tbody>
                {block.roomRows.map((row) => (
                  <tr key={`${block.group}-${row.roomName}`}>
                    <td>{row.roomName}</td>
                    <td className="cep-num">{row.countertopSf > 0 ? formatSf(row.countertopSf) : "—"}</td>
                    <td className="cep-num">{row.backsplashSf > 0 ? formatSf(row.backsplashSf) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="cep-material-scope-foot">
                  <td colSpan={3}>
                    <strong>Scope in this group</strong>
                    <span className="cep-muted-inline">
                      {" "}
                      · {formatSf(block.countertopSf)} counter sf · {formatSf(block.backsplashFhbSf)} backsplash /
                      full-height sf
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}

        {display.vanityScopeNotes.map((v) => (
          <div key={v.roomId} className="cep-material-group">
            <h3 className="cep-h3">
              {v.materialGroup} · Vanity program
            </h3>
            <p className="cep-muted">
              <strong>{v.roomName}</strong>
              {v.programLabel ? ` · ${v.programLabel}` : ""} — {v.note}
            </p>
          </div>
        ))}
      </section>

      {props.comparisonRows.length > 0 ? (
        <section className="cep-section cep-section-compact cep-comparison cep-comparison-print">
          <h2 className="cep-h2 cep-h2-muted">Optional material group comparisons</h2>
          <p className="cep-muted cep-comparison-note">
            Illustrative only — full scope at one tier; not your selected mixed-material quote.
          </p>
          <table className="cep-table cep-table-compact cep-table-amounts cep-comparison-table cep-comparison-table-print">
            <thead>
              <tr>
                <th>Group</th>
                <th className="cep-num">Counter</th>
                <th className="cep-num">Backsplash</th>
                <th className="cep-num">Material</th>
                <th className="cep-num">Est. total</th>
              </tr>
            </thead>
            <tbody>
              {props.comparisonRows.map((row) => (
                <tr key={row.group}>
                  <td>
                    {row.group}
                    {row.comparisonColorLabel ? (
                      <span className="cep-muted-inline"> · {row.comparisonColorLabel}</span>
                    ) : null}
                  </td>
                  <td className="cep-num">{formatDisplayDollars(row.materialCounter)}</td>
                  <td className="cep-num">{formatDisplayDollars(row.materialSplashFhb)}</td>
                  <td className="cep-num">{formatDisplayDollars(row.materialTotal)}</td>
                  <td className="cep-num cep-amt">{formatDisplayDollars(row.fullTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {display.customerFacingNoteLines.length > 0 ? (
        <section className="cep-section cep-section-compact cep-project-notes">
          <h2 className="cep-h2">Project Notes</h2>
          <ul className="cep-project-notes-list">
            {display.customerFacingNoteLines.map((line, idx) => (
              <li key={`note-${idx}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="cep-closing">
        <div className="cep-footer-terms-sig">
          <div className="cep-terms-box">
            <h2 className="cep-terms-title">Terms &amp; conditions</h2>
            <ul className="cep-terms-list">
              <li>This estimate is valid for 30 days from the date shown unless otherwise noted in writing.</li>
              <li>Final pricing may change after field measure, material selection, template, and plan review.</li>
              <li>Payment terms, deposits, and schedule are confirmed in the signed customer agreement.</li>
              <li>Natural stone and quartz may vary in color, veining, and pattern; samples are representative only.</li>
            </ul>
          </div>

          <div className="cep-signature-block">
            <div className="cep-sig-line-inline">
              <span className="cep-sig-role">Customer signature</span>
              <span className="cep-sig-under cep-sig-under-main" aria-hidden="true" />
              <span className="cep-sig-role cep-sig-role-date">Date</span>
              <span className="cep-sig-under cep-sig-under-date" aria-hidden="true" />
            </div>
            <div className="cep-sig-line-inline">
              <span className="cep-sig-role">Elite Stone representative</span>
              <span className="cep-sig-under cep-sig-under-main" aria-hidden="true" />
              <span className="cep-sig-role cep-sig-role-date">Date</span>
              <span className="cep-sig-under cep-sig-under-date" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="cep-branches">
          {BRANCH_LOCATIONS.map((b) => (
            <address key={b.city} className="cep-branch">
              <strong>{b.city}</strong>
              {b.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          ))}
        </div>

        <p className="cep-website">www.elitestonefabrication.com</p>
      </footer>
    </div>
  );
}
