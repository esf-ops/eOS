import React from "react";
import { roundCustomerDisplay } from "../customerDisplayRounding";
import { CUSTOMER_ESTIMATE_DOCUMENT_LOGO_SRC } from "./documentLogo";
import { CUSTOMER_ESTIMATE_BRANCH_LOCATIONS, CUSTOMER_ESTIMATE_TERMS_ITEMS, CUSTOMER_ESTIMATE_WEBSITE } from "./documentConstants";
import type { CustomerEstimateDocumentProps } from "./documentProps";
import { formatDisplayAmount, formatDisplayDollars } from "./formatters";
import { formatVanityCustomerPrintSubline } from "./vanityPrintSubline";

/**
 * Shared customer-facing estimate document renderer.
 * Used by Internal Estimate browser print and quote delivery email PDF HTML.
 */
export default function CustomerEstimateDocument(props: CustomerEstimateDocumentProps) {
  const quoteRef = props.quoteNumber?.trim();
  if (!quoteRef) return null;

  const addrLine = [props.projectAddress, props.city, props.state].filter(Boolean).join(", ");
  const display = props.customerDisplay;

  return (
    <div className="customer-estimate-print" aria-hidden="true">
      <header className="cep-header">
        <img className="cep-logo" src={CUSTOMER_ESTIMATE_DOCUMENT_LOGO_SRC} alt="Elite Stone Fabrication" />
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
            <dd>{quoteRef}</dd>
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
        </dl>
      </section>

      <section className="cep-section cep-estimate-summary">
        <h2 className="cep-h2">Estimate summary</h2>
        <table className="cep-table cep-table-compact cep-table-amounts cep-summary-table">
          <tbody>
            {display.estimateSummaryRows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className="cep-amt">{formatDisplayAmount(row.displayAmount)}</td>
              </tr>
            ))}
            <tr className="cep-summary-total-row">
              <td>
                <strong>Estimated project total</strong>
              </td>
              <td className="cep-amt cep-summary-total-value">
                <strong>{formatDisplayAmount(display.finalRounded)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="cep-muted cep-round-note">Estimate only — not a contract.</p>
      </section>

      {display.showRoomBreakdown ? (
        <section className="cep-section cep-room-breakdown cep-section-compact">
          <h2 className="cep-h2">Room / area cost breakdown</h2>
          <p className="cep-muted cep-room-breakdown-lead">
            Estimated cost by room or area so you can compare scope — for example, kitchen now and bath later. Area
            totals reconcile with <strong>Estimated project total</strong> above.
          </p>
          <table className="cep-table cep-table-compact cep-table-amounts cep-room-breakdown-table">
            <thead>
              <tr>
                <th>Room / area</th>
                <th className="cep-num">Material</th>
                <th className="cep-num">Add-ons</th>
                <th className="cep-num">Area total</th>
              </tr>
            </thead>
            <tbody>
              {display.roomAreaPrintRows.map((displayRow) => (
                <React.Fragment key={displayRow.roomId}>
                  <tr className="cep-room-breakdown-main-row">
                    <td>
                      <strong>{displayRow.displayName}</strong>
                      {displayRow.isVanity ? (
                        <span className="cep-muted-inline">
                          {" "}
                          ·{" "}
                          {displayRow.vanityProgramLabel ? `${displayRow.vanityProgramLabel} · ` : ""}
                          {formatVanityCustomerPrintSubline({
                            materialGroup: displayRow.materialGroup,
                            colorLabel: displayRow.colorLabel,
                            projectColorTbd: props.colorTbd
                          })}
                        </span>
                      ) : (
                        <span className="cep-muted-inline">
                          {" "}
                          · {displayRow.materialGroup}
                          {displayRow.colorLabel ? ` · ${displayRow.colorLabel}` : props.colorTbd ? " · Color TBD" : ""}
                        </span>
                      )}
                    </td>
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
                      <td colSpan={4} className="cep-room-includes">
                        Includes: {displayRow.addonLines.map((a) => a.label).join(", ")}
                      </td>
                    </tr>
                  ) : null}
                  {displayRow.customerCustomLines.map((c, cIdx) => (
                    <tr
                      key={c.lineKey || `${displayRow.roomId}-custom-${cIdx}-${c.amountExact}`}
                      className="cep-room-breakdown-detail-row"
                    >
                      <td colSpan={3} className="cep-room-custom-line">
                        {c.name}
                      </td>
                      <td className="cep-num cep-amt">{formatDisplayAmount(roundCustomerDisplay(c.amountExact))}</td>
                    </tr>
                  ))}
                  {displayRow.customerNoteLines.length > 0 ? (
                    <tr className="cep-room-breakdown-detail-row cep-room-note-row">
                      <td colSpan={4} className="cep-room-note">
                        {displayRow.customerNoteLines.join(" ")}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
            {display.unassignedExact !== 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    {display.unassignedExact < 0
                      ? "Project discount / credit"
                      : "Other project items (see Estimate summary)"}
                  </td>
                  <td className="cep-num cep-amt">{formatDisplayAmount(display.unassignedDisplayTotal)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </section>
      ) : null}

      {display.roomComparisonTable ? (
        <section className="cep-section cep-section-compact cep-comparison cep-comparison-print">
          <h2 className="cep-h2 cep-h2-muted">
            {display.roomComparisonTable.isPerRoomMode
              ? "Optional material comparison by room"
              : "Optional material group comparison"}
          </h2>
          <p className="cep-muted cep-comparison-note">
            {display.roomComparisonTable.isPerRoomMode
              ? "Illustrative only — alternate material tier pricing for the rooms shown. Other rooms use the selected material above."
              : "Illustrative only — shows estimated area totals at alternate material tiers with the same scope and add-ons."}
          </p>
          {display.roomComparisonTable.roomBlocks.map((roomBlock) => (
            <div key={roomBlock.roomId} className="cep-comparison-room-block">
              <h3 className="cep-h3">{roomBlock.roomDisplayName}</h3>
              {roomBlock.groupBlocks.map((groupBlock) => (
                <div key={`${roomBlock.roomId}-${groupBlock.group}`} className="cep-comparison-group-block">
                  <p className="cep-comparison-group-heading">
                    <strong>{groupBlock.group}</strong>
                    {groupBlock.colorLabel ? (
                      <span className="cep-muted-inline"> · {groupBlock.colorLabel}</span>
                    ) : null}
                  </p>
                  <table className="cep-table cep-table-compact cep-table-amounts cep-comparison-detail-table">
                    <tbody>
                      {groupBlock.countertopDisplay > 0 ? (
                        <tr>
                          <td>Countertop material</td>
                          <td className="cep-num cep-amt">
                            {formatDisplayDollars(groupBlock.countertopDisplay)}
                          </td>
                        </tr>
                      ) : null}
                      {groupBlock.backsplashDisplay > 0 ? (
                        <tr>
                          <td>4-inch backsplash material</td>
                          <td className="cep-num cep-amt">
                            {formatDisplayDollars(groupBlock.backsplashDisplay)}
                          </td>
                        </tr>
                      ) : null}
                      {groupBlock.fhbDisplay > 0 ? (
                        <tr>
                          <td>Full-height backsplash material</td>
                          <td className="cep-num cep-amt">
                            {formatDisplayDollars(groupBlock.fhbDisplay)}
                          </td>
                        </tr>
                      ) : null}
                      {groupBlock.extraLines?.length
                        ? groupBlock.extraLines.map((line) => (
                            <tr key={`${groupBlock.group}-${line.key}`}>
                              <td>{line.label}</td>
                              <td className="cep-num cep-amt">
                                {formatDisplayDollars(line.displayAmount)}
                              </td>
                            </tr>
                          ))
                        : groupBlock.addonsDisplay > 0 ? (
                            <tr>
                              <td>Add-ons / fixtures</td>
                              <td className="cep-num cep-amt">
                                {formatDisplayDollars(groupBlock.addonsDisplay)}
                              </td>
                            </tr>
                          ) : null}
                      <tr className="cep-comparison-room-total-row">
                        <td><strong>Room total</strong></td>
                        <td className="cep-num cep-amt">
                          <strong>{formatDisplayDollars(groupBlock.roomTotalDisplay)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
          <div className="cep-comparison-project-totals">
            <p className="cep-comparison-project-totals-label">
              <strong>
                {display.roomComparisonTable.isPerRoomMode ? "Subtotal (shown rooms)" : "Estimated project total"}
              </strong>
            </p>
            {display.roomComparisonTable.selectedGroups.map((g) => (
              <p key={g.group} className="cep-comparison-project-total-line">
                {g.group}
                {g.colorLabel ? ` · ${g.colorLabel}` : ""}:{" "}
                <strong>
                  {formatDisplayDollars(display.roomComparisonTable!.projectDisplayTotals[g.group] ?? 0)}
                </strong>
              </p>
            ))}
          </div>
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
              {CUSTOMER_ESTIMATE_TERMS_ITEMS.map((term) => (
                <li key={term}>{term}</li>
              ))}
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
          {CUSTOMER_ESTIMATE_BRANCH_LOCATIONS.map((b) => (
            <address key={b.city} className="cep-branch">
              <strong>{b.city}</strong>
              {b.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          ))}
        </div>

        <p className="cep-website">{CUSTOMER_ESTIMATE_WEBSITE}</p>
      </footer>
    </div>
  );
}
