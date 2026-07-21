/**
 * Customer-safe Digital Estimate print document.
 * Reuses shared ESF estimate document branding/CSS (cep-* classes) from app-quote.
 * Amounts come only from the saved Estimate DTO — never recalculated here.
 */
import type { DigitalEstimatePrintModel } from "./customerPrintAdapter";
import { printMoneyLabel } from "./customerPrintAdapter";
import { CUSTOMER_ESTIMATE_DOCUMENT_LOGO_SRC } from "@quote-lib/customerEstimate/documentLogo";
import {
  CUSTOMER_ESTIMATE_BRANCH_LOCATIONS,
  CUSTOMER_ESTIMATE_TERMS_ITEMS,
  CUSTOMER_ESTIMATE_WEBSITE,
} from "@quote-lib/customerEstimate/documentConstants";

export function DigitalEstimatePrintDocument({ model }: { model: DigitalEstimatePrintModel }) {
  return (
    <div className="customer-estimate-print de-customer-print" data-testid="de-print-document">
      <header className="cep-header">
        <img
          className="cep-logo"
          src={CUSTOMER_ESTIMATE_DOCUMENT_LOGO_SRC}
          alt="Elite Stone Fabrication"
        />
        <div className="cep-header-text">
          <h1 className="cep-title">Elite Stone Fabrication Estimate</h1>
          <p className="cep-date">{model.estimateDate}</p>
        </div>
      </header>

      <section className="cep-section cep-overview">
        <h2 className="cep-h2">Project overview</h2>
        <dl className="cep-overview-grid">
          <div className="cep-overview-item">
            <dt>Estimate date</dt>
            <dd>{model.estimateDate}</dd>
          </div>
          {model.quoteNumber ? (
            <div className="cep-overview-item">
              <dt>Quote / estimate ref.</dt>
              <dd>{model.quoteNumber}</dd>
            </div>
          ) : null}
          {model.revisionLabel ? (
            <div className="cep-overview-item">
              <dt>Revision</dt>
              <dd>{model.revisionLabel}</dd>
            </div>
          ) : null}
          <div className="cep-overview-item">
            <dt>Customer</dt>
            <dd>{model.customerName || "—"}</dd>
          </div>
          <div className="cep-overview-item cep-overview-span-2">
            <dt>Project</dt>
            <dd>{model.projectName || "—"}</dd>
          </div>
          <div className="cep-overview-item cep-overview-span-3">
            <dt>Project address</dt>
            <dd>{model.projectAddress || "—"}</dd>
          </div>
          {model.pricingValidThrough ? (
            <div className="cep-overview-item">
              <dt>Pricing valid through</dt>
              <dd>{model.pricingValidThrough}</dd>
            </div>
          ) : null}
          <div className="cep-overview-item">
            <dt>Status</dt>
            <dd>{model.statusLabel}</dd>
          </div>
        </dl>
      </section>

      {model.rooms.map((room) => (
        <section
          key={room.roomName}
          className="cep-section de-print-room"
          data-testid="de-print-room"
        >
          <h2 className="cep-h2">{room.roomName}</h2>

          {room.selections.length ? (
            <div className="de-print-selections">
              <h3 className="cep-h3">Selections</h3>
              <ul className="de-print-selection-list">
                {room.selections.map((sel) => (
                  <li key={`${room.roomName}-${sel.label}`}>
                    <strong>{sel.label}:</strong> {sel.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <table className="cep-table cep-table-compact cep-table-amounts">
            <tbody>
              {room.countertopAmount != null ? (
                <tr>
                  <td>Countertop</td>
                  <td className="cep-amt">{printMoneyLabel(room.countertopAmount)}</td>
                </tr>
              ) : null}
              {room.backsplashAmount != null ? (
                <tr>
                  <td>Backsplash</td>
                  <td className="cep-amt">{printMoneyLabel(room.backsplashAmount)}</td>
                </tr>
              ) : null}
              {room.addOnsAmount != null ? (
                <tr>
                  <td>Add-ons</td>
                  <td className="cep-amt">{printMoneyLabel(room.addOnsAmount)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {room.addOnLines.length ? (
            <div className="de-print-addon-detail">
              <h3 className="cep-h3">Add-on detail</h3>
              <ul className="de-print-selection-list">
                {room.addOnLines.map((line, i) => (
                  <li key={`${room.roomName}-addon-${i}`}>
                    {line.label}
                    {line.amount != null ? ` — ${printMoneyLabel(line.amount)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <table className="cep-table cep-table-compact cep-table-amounts">
            <tbody>
              <tr className="cep-summary-total-row">
                <td>
                  <strong>Room total</strong>
                </td>
                <td className="cep-amt">
                  <strong>{printMoneyLabel(room.roomTotal)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}

      <section className="cep-section" data-testid="de-print-project">
        <h2 className="cep-h2">Project charges</h2>
        <table className="cep-table cep-table-compact cep-table-amounts">
          <tbody>
            {model.projectLines.map((line, i) => (
              <tr key={`project-${i}`}>
                <td>{line.label}</td>
                <td className="cep-amt">{printMoneyLabel(line.amount)}</td>
              </tr>
            ))}
            <tr className="cep-summary-total-row">
              <td>
                <strong>Your estimate</strong>
              </td>
              <td className="cep-amt cep-summary-total-value">
                <strong data-testid="de-print-total">{model.estimateTotalLabel}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {model.projectNote ? (
        <section className="cep-section">
          <h2 className="cep-h2">Project note</h2>
          <p className="cep-muted">{model.projectNote}</p>
        </section>
      ) : null}

      <section className="cep-section">
        <p className="cep-muted">{model.reviewNotice}</p>
        <p className="cep-muted">{model.disclaimer}</p>
      </section>

      <section className="cep-section cep-terms">
        <h2 className="cep-h2">Terms</h2>
        <ul className="cep-terms-list">
          {CUSTOMER_ESTIMATE_TERMS_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="cep-branches">
          {CUSTOMER_ESTIMATE_BRANCH_LOCATIONS.map((b) => (
            <div key={b.city} className="cep-branch">
              <strong>{b.city}</strong>
              {b.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ))}
        </div>
        <p className="cep-muted">{CUSTOMER_ESTIMATE_WEBSITE}</p>
      </section>
    </div>
  );
}
