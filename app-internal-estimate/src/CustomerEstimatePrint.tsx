import React from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import type {
  InternalEstimateGroupComparisonRow,
  SelectedMaterialBreakdown,
  SelectedMaterialScopeLine
} from "@quote-lib/prototypeQuoteMath";
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

function formatMoney(amount: number): string {
  return `$${roundCustomerDisplay(amount).toLocaleString()}`;
}

type RoomMaterialRow = {
  roomName: string;
  countertopSf: number;
  backsplashSf: number;
};

/** Roll piece-level scope lines up to one row per room for customer print. */
function aggregateLinesByRoom(lines: SelectedMaterialScopeLine[]): RoomMaterialRow[] {
  const byRoom = new Map<string, RoomMaterialRow>();
  for (const ln of lines) {
    const key = ln.roomName.trim() || "Room";
    const row = byRoom.get(key) ?? { roomName: key, countertopSf: 0, backsplashSf: 0 };
    row.countertopSf += ln.countertopSf;
    row.backsplashSf += ln.backsplashSf + ln.fhbSf;
    byRoom.set(key, row);
  }
  return [...byRoom.values()].map((r) => ({
    roomName: r.roomName,
    countertopSf: Math.round(r.countertopSf * 100) / 100,
    backsplashSf: Math.round(r.backsplashSf * 100) / 100
  }));
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
  const finalRounded = roundCustomerDisplay(props.estimateTotalExact);
  const addrLine = [props.projectAddress, props.city, props.state].filter(Boolean).join(", ");
  const { selectedBreakdown: bd } = props;

  const vanityRooms = props.measuredRooms.filter((r) => r.type === "Vanity" && r.selected > 0);
  const scopeRooms = props.measuredRooms.filter((r) => r.type !== "Vanity");

  const vanityMaterialExact = vanityRooms.reduce((s, v) => s + (Number(v.selected) || 0), 0);
  const countertopMaterialExact = bd.totals.countertopMaterial + vanityMaterialExact;
  const backsplashMaterialExact = bd.totals.backsplashMaterial;
  const addonsExact = props.visibleRoomAddons.reduce((s, a) => s + (Number(a.total) || 0), 0);
  const hasAddons = props.visibleRoomAddons.length > 0 && addonsExact !== 0;
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
            <tr>
              <td>Countertop material</td>
              <td className="cep-amt">{formatMoney(countertopMaterialExact)}</td>
            </tr>
            <tr>
              <td>Backsplash material</td>
              <td className="cep-amt">{formatMoney(backsplashMaterialExact)}</td>
            </tr>
            {hasAddons ? (
              <tr>
                <td>Add-ons / fixtures</td>
                <td className="cep-amt">{formatMoney(addonsExact)}</td>
              </tr>
            ) : null}
            {props.visibleLineItems.map((ln) => (
              <tr key={`${ln.name}-${ln.roomName}-${ln.lineTotal}`}>
                <td>
                  {ln.name}
                  {ln.description ? ` — ${ln.description}` : ""}
                  {ln.roomName ? ` (${ln.roomName})` : ""}
                  {ln.qty !== 1 ? ` × ${ln.qty}` : ""}
                </td>
                <td className="cep-amt">{formatMoney(ln.lineTotal)}</td>
              </tr>
            ))}
            <tr className="cep-summary-total-row">
              <td>
                <strong>Estimated project total</strong>
              </td>
              <td className="cep-amt cep-summary-total-value">
                <strong>${finalRounded.toLocaleString()}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="cep-muted cep-round-note">Displayed amounts round up to the nearest $10. Estimate only — not a contract.</p>
      </section>

      {hasAddons ? (
        <section className="cep-section cep-section-compact">
          <h2 className="cep-h2">Add-ons / fixtures</h2>
          <table className="cep-table cep-table-compact cep-table-amounts">
            <tbody>
              {props.visibleRoomAddons.map((a) => (
                <tr key={`${a.roomName}-${a.label}`}>
                  <td>
                    {a.label}
                    {a.roomName ? <span className="cep-addon-room"> · {a.roomName}</span> : null}
                  </td>
                  <td className="cep-amt">{formatMoney(a.total)}</td>
                </tr>
              ))}
              <tr className="cep-subtotal-row">
                <td>
                  <strong>Subtotal</strong>
                </td>
                <td className="cep-amt">
                  <strong>{formatMoney(addonsExact)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="cep-section cep-breakdown cep-section-compact">
        <h2 className="cep-h2">Quoted material breakdown</h2>
        <p className="cep-muted">
          Square footage and material subtotal by price group and room
          {props.colorTbd ? " · some colors TBD" : ""}.
        </p>

        {bd.groups.map((block) => {
          const roomRows = aggregateLinesByRoom(block.lines);
          return (
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
                  {roomRows.map((row) => (
                    <tr key={`${block.group}-${row.roomName}`}>
                      <td>{row.roomName}</td>
                      <td className="cep-num">{row.countertopSf > 0 ? formatSf(row.countertopSf) : "—"}</td>
                      <td className="cep-num">{row.backsplashSf > 0 ? formatSf(row.backsplashSf) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="cep-material-dollar-row">
                    <td>
                      <strong>Material subtotal</strong>
                      <span className="cep-muted-inline">
                        {" "}
                        · {formatSf(block.countertopSf)} counter sf · {formatSf(block.backsplashSf + block.fhbSf)} backsplash sf
                      </span>
                    </td>
                    <td colSpan={2} className="cep-num cep-amt">
                      {formatMoney(block.materialSubtotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}

        {vanityRooms.map((v) => (
          <div key={v.id} className="cep-material-group">
            <h3 className="cep-h3">{v.group} · Vanity program</h3>
            <p className="cep-muted">
              <strong>{v.name}</strong> — {formatMoney(v.selected)}
            </p>
          </div>
        ))}
      </section>

      {props.comparisonRows.length > 0 ? (
        <section className="cep-section cep-comparison">
          <h2 className="cep-h2 cep-h2-muted">Optional material group comparisons</h2>
          <p className="cep-muted cep-comparison-note">
            What if all quoted countertop and backsplash material were priced at this group? Not your selected mixed-material
            quote.
          </p>
          <table className="cep-table cep-table-compact cep-table-amounts cep-comparison-table">
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
                  <td>{row.group}</td>
                  <td className="cep-num">{formatMoney(row.materialCounter)}</td>
                  <td className="cep-num">{formatMoney(row.materialSplashFhb)}</td>
                  <td className="cep-num">{formatMoney(row.materialTotal)}</td>
                  <td className="cep-num cep-amt">{formatMoney(row.fullTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <footer className="cep-closing">
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
