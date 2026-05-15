import React from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import type { InternalEstimateGroupComparisonRow } from "@quote-lib/prototypeQuoteMath";
import type { MeasuredRoom } from "@quote-lib/quoteTypes";

export function roundCustomerDisplay(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

export type CustomerLineItem = {
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
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
  primaryGroup: string;
  primaryColorLabel: string;
  colorTbd: boolean;
  measuredRooms: MeasuredRoom[];
  counterSf: number;
  splashFhbSf: number;
  totalSf: number;
  visibleLineItems: CustomerLineItem[];
  materialSubtotalExact: number;
  estimateTotalExact: number;
  comparisonRows: InternalEstimateGroupComparisonRow[];
  estimateDate: string;
};

export default function CustomerEstimatePrint(props: CustomerEstimatePrintProps) {
  const materialRounded = roundCustomerDisplay(props.materialSubtotalExact);
  const finalRounded = roundCustomerDisplay(props.estimateTotalExact);

  const addrLine = [props.projectAddress, props.city, props.state].filter(Boolean).join(", ");

  return (
    <div className="customer-estimate-print" aria-hidden="true">
      <header className="cep-header">
        <img className="cep-logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
        <div className="cep-header-text">
          <h1 className="cep-title">Stone Countertop Estimate</h1>
          <p className="cep-date">Date: {props.estimateDate}</p>
        </div>
      </header>

      <section className="cep-block">
        <h2 className="cep-h2">Project</h2>
        <table className="cep-meta">
          <tbody>
            <tr>
              <th scope="row">Account</th>
              <td>{props.accountName || "—"}</td>
            </tr>
            <tr>
              <th scope="row">Customer</th>
              <td>{props.customerName || "—"}</td>
            </tr>
            <tr>
              <th scope="row">Job name</th>
              <td>{props.projectName || "—"}</td>
            </tr>
            <tr>
              <th scope="row">Project address</th>
              <td>{addrLine || "—"}</td>
            </tr>
            <tr>
              <th scope="row">Branch</th>
              <td>{props.branch || "—"}</td>
            </tr>
            <tr>
              <th scope="row">Salesperson</th>
              <td>{props.salesRep || "—"}</td>
            </tr>
            <tr>
              <th scope="row">Prepared by</th>
              <td>{props.preparedBy || "—"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="cep-block">
        <h2 className="cep-h2">Scope summary</h2>
        <p className="cep-lead">
          Primary material: <strong>{props.primaryGroup}</strong>
          {props.colorTbd ? (
            <> · <em>Color selection TBD</em></>
          ) : props.primaryColorLabel ? (
            <> · {props.primaryColorLabel}</>
          ) : null}
        </p>
        <table className="cep-table">
          <thead>
            <tr>
              <th>Room / area</th>
              <th>Material group</th>
              <th>Countertop sf</th>
              <th>Backsplash + FHB sf</th>
              <th>Total sf</th>
            </tr>
          </thead>
          <tbody>
            {props.measuredRooms.length ? (
              props.measuredRooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.group}</td>
                  <td>{r.type === "Vanity" ? "—" : r.counter.toFixed(2)}</td>
                  <td>{r.type === "Vanity" ? "—" : (r.splash + r.fhb).toFixed(2)}</td>
                  <td>{r.type === "Vanity" ? "Vanity program" : r.totalSf.toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>Measurements entered on estimate</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2} scope="row">
                Totals
              </th>
              <td>{props.counterSf.toFixed(2)}</td>
              <td>{props.splashFhbSf.toFixed(2)}</td>
              <td>{props.totalSf.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        {props.measuredRooms.some((r) => r.details.length) ? (
          <div className="cep-measure-notes">
            <p className="cep-h3">Dimensions &amp; notes</p>
            <ul>
              {props.measuredRooms.flatMap((r) =>
                r.details.map((d, i) => (
                  <li key={`${r.id}-${i}`}>
                    <strong>{r.name}:</strong> {d}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </section>

      {(props.visibleLineItems.length > 0 || materialRounded > 0) && (
        <section className="cep-block">
          <h2 className="cep-h2">Estimate detail</h2>
          <table className="cep-table cep-table-amounts">
            <tbody>
              <tr>
                <td>Countertop &amp; backsplash material (selected group)</td>
                <td className="cep-amt">${materialRounded.toLocaleString()}</td>
              </tr>
              {props.visibleLineItems.map((ln) => (
                <tr key={`${ln.name}-${ln.roomName}-${ln.lineTotal}`}>
                  <td>
                    {ln.name}
                    {ln.description ? ` — ${ln.description}` : ""}
                    {ln.roomName ? ` (${ln.roomName})` : ""}
                    {ln.qty !== 1 ? ` × ${ln.qty}` : ""}
                  </td>
                  <td className="cep-amt">${roundCustomerDisplay(ln.lineTotal).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cep-round-note">Section amounts rounded up to the nearest $10 for customer display.</p>
        </section>
      )}

      {props.comparisonRows.length > 0 ? (
        <section className="cep-block">
          <h2 className="cep-h2">Material group options</h2>
          <p className="cep-lead">Alternate price groups for your review (same scope; material rates vary by group).</p>
          <table className="cep-table cep-table-amounts">
            <thead>
              <tr>
                <th>Group</th>
                <th>Countertop material</th>
                <th>Backsplash material</th>
                <th>Material subtotal</th>
                <th>Estimated total</th>
              </tr>
            </thead>
            <tbody>
              {props.comparisonRows.map((row) => (
                <tr key={row.group}>
                  <td>{row.group}</td>
                  <td>${roundCustomerDisplay(row.materialCounter).toLocaleString()}</td>
                  <td>${roundCustomerDisplay(row.materialSplashFhb).toLocaleString()}</td>
                  <td>${roundCustomerDisplay(row.materialTotal).toLocaleString()}</td>
                  <td className="cep-amt">${roundCustomerDisplay(row.fullTotal).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="cep-block cep-total-block">
        <p className="cep-total-label">Estimated project total</p>
        <p className="cep-total-value">${finalRounded.toLocaleString()}</p>
        <p className="cep-round-note">Final total rounded up to the nearest $10. This is an estimate, not a binding contract.</p>
      </section>

      <section className="cep-block cep-terms">
        <h2 className="cep-h2">Terms &amp; conditions</h2>
        <ul>
          <li>Estimate is valid for 30 days from the date shown unless otherwise noted.</li>
          <li>Final pricing may change after field measure, material selection, and plan review.</li>
          <li>Payment terms and schedule will be confirmed in your signed agreement.</li>
          <li>Elite Stone Fabrication is not responsible for delays caused by site readiness or third-party trades.</li>
        </ul>
      </section>

      <section className="cep-block cep-signature">
        <div className="cep-sig-line">
          <span>Customer signature</span>
          <span className="cep-sig-blank" />
          <span>Date</span>
          <span className="cep-sig-blank cep-sig-date" />
        </div>
        <div className="cep-sig-line">
          <span>Elite Stone Fabrication</span>
          <span className="cep-sig-blank" />
          <span>Date</span>
          <span className="cep-sig-blank cep-sig-date" />
        </div>
      </section>

      <footer className="cep-footer">
        Elite Stone Fabrication · eliteOS · Thank you for the opportunity to quote your project.
      </footer>
    </div>
  );
}
