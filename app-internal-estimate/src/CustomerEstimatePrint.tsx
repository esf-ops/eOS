import React from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import type { InternalEstimateGroupComparisonRow, SelectedMaterialBreakdown } from "@quote-lib/prototypeQuoteMath";
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
  /** Internal-only custom $ still in estimate total but not listed as lines. */
  internalOnlyAdjustDollars: number;
  estimateTotalExact: number;
  comparisonRows: InternalEstimateGroupComparisonRow[];
  estimateDate: string;
};

function formatSf(n: number): string {
  return Number(n).toFixed(2);
}

export default function CustomerEstimatePrint(props: CustomerEstimatePrintProps) {
  const finalRounded = roundCustomerDisplay(props.estimateTotalExact);
  const addrLine = [props.projectAddress, props.city, props.state].filter(Boolean).join(", ");
  const { selectedBreakdown: bd } = props;

  const vanityRooms = props.measuredRooms.filter((r) => r.type === "Vanity" && r.selected > 0);
  const scopeRooms = props.measuredRooms.filter((r) => r.type !== "Vanity");

  const vanityMaterialExact = vanityRooms.reduce((s, v) => s + (Number(v.selected) || 0), 0);
  const countertopMaterialExact = bd.totals.countertopMaterial + vanityMaterialExact;
  const backsplashMaterialExact = bd.totals.backsplashMaterial;
  const addonsExact = props.visibleRoomAddons.reduce((s, a) => s + (Number(a.total) || 0), 0);

  return (
    <div className="customer-estimate-print" aria-hidden="true">
      <header className="cep-header cep-header-compact">
        <img className="cep-logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
        <div className="cep-header-text">
          <h1 className="cep-title">Stone Countertop Estimate</h1>
          <p className="cep-date">
            {props.estimateDate}
            {props.quoteNumber ? ` · Ref. ${props.quoteNumber}` : ""}
          </p>
        </div>
      </header>

      <section className="cep-block cep-block-tight">
        <h2 className="cep-h2">Project overview</h2>
        <div className="cep-project-grid">
          <div>
            <span className="cep-k">Account</span>
            <span className="cep-v">{props.accountName || "—"}</span>
          </div>
          <div>
            <span className="cep-k">Customer</span>
            <span className="cep-v">{props.customerName || "—"}</span>
          </div>
          <div>
            <span className="cep-k">Job name</span>
            <span className="cep-v">{props.projectName || "—"}</span>
          </div>
          <div className="cep-span-2">
            <span className="cep-k">Project address</span>
            <span className="cep-v">{addrLine || "—"}</span>
          </div>
          <div>
            <span className="cep-k">Branch</span>
            <span className="cep-v">{props.branch || "—"}</span>
          </div>
          <div>
            <span className="cep-k">Salesperson</span>
            <span className="cep-v">{props.salesRep || "—"}</span>
          </div>
          <div>
            <span className="cep-k">Prepared by</span>
            <span className="cep-v">{props.preparedBy || "—"}</span>
          </div>
        </div>
      </section>

      {scopeRooms.length > 0 ? (
        <section className="cep-block cep-block-tight">
          <h2 className="cep-h2">Scope summary</h2>
          <table className="cep-table cep-table-compact">
            <thead>
              <tr>
                <th>Room / area</th>
                <th>Group</th>
                <th>Counter sf</th>
                <th>Backsplash + FHB sf</th>
              </tr>
            </thead>
            <tbody>
              {scopeRooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.group}</td>
                  <td>{formatSf(r.counter)}</td>
                  <td>{formatSf(r.splash + r.fhb)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Totals</th>
                <td>{formatSf(bd.totals.countertopSf)}</td>
                <td>{formatSf(bd.totals.backsplashSf + bd.totals.fhbSf)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      ) : null}

      <section className="cep-block cep-block-tight cep-breakdown">
        <h2 className="cep-h2">Selected material breakdown</h2>
        <p className="cep-lead cep-lead-tight">
          Actual scope priced by the material group selected for each room or piece
          {props.colorTbd ? " (some colors TBD)" : ""}.
        </p>

        {bd.groups.map((block) => (
          <div key={block.group} className="cep-group-block">
            <h3 className="cep-h3">
              {block.group}
              {block.colorLabel ? ` · ${block.colorLabel}` : ""}
            </h3>
            <ul className="cep-scope-lines">
              {block.lines.map((ln, i) => (
                <li key={`${block.group}-${ln.roomName}-${ln.label}-${i}`}>
                  <strong>{ln.roomName}</strong> — {ln.label}:
                  {ln.countertopSf > 0 ? ` ${formatSf(ln.countertopSf)} countertop sf` : ""}
                  {ln.backsplashSf > 0 ? ` ${formatSf(ln.backsplashSf)} backsplash sf` : ""}
                  {ln.fhbSf > 0 ? ` ${formatSf(ln.fhbSf)} full-height sf` : ""}
                  {ln.colorLabel && ln.colorLabel !== block.colorLabel ? ` (${ln.colorLabel})` : ""}
                </li>
              ))}
            </ul>
            <p className="cep-group-totals">
              Subtotal — Counter: {formatSf(block.countertopSf)} sf · Backsplash/FHB:{" "}
              {formatSf(block.backsplashSf + block.fhbSf)} sf · Material: $
              {roundCustomerDisplay(block.materialSubtotal).toLocaleString()}
            </p>
          </div>
        ))}

        {vanityRooms.map((v) => (
          <div key={v.id} className="cep-group-block">
            <h3 className="cep-h3">{v.group} · Vanity program</h3>
            <ul className="cep-scope-lines">
              <li>
                <strong>{v.name}</strong> — vanity program (flat): ${roundCustomerDisplay(v.selected).toLocaleString()}
              </li>
            </ul>
          </div>
        ))}

        <p className="cep-group-totals cep-grand-material">
          Scope totals — Counter {formatSf(bd.totals.countertopSf)} sf · Backsplash/FHB{" "}
          {formatSf(bd.totals.backsplashSf + bd.totals.fhbSf)} sf
        </p>
      </section>

      <section className="cep-block cep-block-tight cep-estimate-summary">
        <h2 className="cep-h2">Estimate summary</h2>
        <p className="cep-lead cep-lead-tight">
          Selected countertop and backsplash material, room add-ons, and custom items for this quote.
        </p>
        <table className="cep-table cep-table-compact cep-table-amounts cep-summary-table">
          <tbody>
            <tr className="cep-summary-row">
              <td>Countertop material</td>
              <td className="cep-amt">${roundCustomerDisplay(countertopMaterialExact).toLocaleString()}</td>
            </tr>
            <tr className="cep-summary-row">
              <td>Backsplash material</td>
              <td className="cep-amt">${roundCustomerDisplay(backsplashMaterialExact).toLocaleString()}</td>
            </tr>
            {addonsExact > 0 ? (
              <tr className="cep-summary-row">
                <td>Room add-ons / cutouts / sinks</td>
                <td className="cep-amt">${roundCustomerDisplay(addonsExact).toLocaleString()}</td>
              </tr>
            ) : null}
            {props.visibleLineItems.map((ln) => (
              <tr key={`${ln.name}-${ln.roomName}-${ln.lineTotal}`} className="cep-summary-row">
                <td>
                  {ln.name}
                  {ln.description ? ` — ${ln.description}` : ""}
                  {ln.roomName ? ` (${ln.roomName})` : ""}
                  {ln.qty !== 1 ? ` × ${ln.qty}` : ""}
                </td>
                <td className="cep-amt">${roundCustomerDisplay(ln.lineTotal).toLocaleString()}</td>
              </tr>
            ))}
            <tr className="cep-summary-total-row">
              <td>
                <strong>Estimated project total</strong>
              </td>
              <td className="cep-amt">
                <strong>${finalRounded.toLocaleString()}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="cep-round-note">Displayed amounts round up to the nearest $10.</p>
      </section>

      {props.comparisonRows.length > 0 ? (
        <section className="cep-block cep-block-tight cep-comparison">
          <h2 className="cep-h2">Optional all-group comparison</h2>
          <p className="cep-lead cep-lead-tight">
            What if all quoted countertop and backsplash material were priced at this group? This is not your selected
            mixed-material quote.
          </p>
          <table className="cep-table cep-table-compact cep-table-amounts">
            <thead>
              <tr>
                <th>Group</th>
                <th>Counter</th>
                <th>Backsplash</th>
                <th>Material</th>
                <th>Est. total</th>
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

      <section className="cep-total-band">
        <span className="cep-total-band-label">Estimated project total</span>
        <span className="cep-total-band-value">${finalRounded.toLocaleString()}</span>
        <span className="cep-total-band-note">Rounded up to nearest $10 · Estimate only</span>
      </section>

      <section className="cep-block cep-block-tight cep-terms">
        <h2 className="cep-h2">Terms</h2>
        <ul className="cep-terms-list">
          <li>Valid 30 days from date shown unless otherwise noted.</li>
          <li>Final pricing may change after field measure, material selection, and plan review.</li>
          <li>Payment terms confirmed in signed agreement.</li>
        </ul>
      </section>

      <section className="cep-signature cep-signature-compact">
        <div className="cep-sig-line">
          <span>Customer</span>
          <span className="cep-sig-blank" />
          <span>Date</span>
          <span className="cep-sig-blank cep-sig-date" />
        </div>
      </section>

      <footer className="cep-footer">Elite Stone Fabrication · Thank you for the opportunity to quote your project.</footer>
    </div>
  );
}
