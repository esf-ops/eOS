/**
 * Internal accepted-job report (staff only). Not customer-facing.
 * No sold, handoff, QuickBooks invoice, or email actions.
 */
import React from "react";
import type {
  QuoteFlowAcceptedReportPayload,
  QuoteFlowAcceptedReportRoom
} from "../lib/quoteFlowEstimatesApi";

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleString();
}

function money(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return String(n);
}

function deltaMoney(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.005) return "No change";
  const abs = money(Math.abs(n));
  return n > 0 ? `+${abs}` : `−${abs.replace("$", "")}`;
}

type Props = {
  acceptedReport?: QuoteFlowAcceptedReportPayload | null;
};

function RoomCard({ room }: { room: QuoteFlowAcceptedReportRoom }) {
  const pieces = Array.isArray(room.pieces) ? room.pieces : [];
  const counterPieces = pieces.filter((p) => !p.isBacksplash);
  return (
    <div className="qf-accepted__room" data-testid="qf-accepted-room">
      <h4>
        {room.roomName || "Room"}
        {room.roomType ? ` · ${room.roomType}` : ""}
      </h4>
      <dl className="qf-accepted__dl">
        <div>
          <dt>Material / color</dt>
          <dd data-testid="qf-accepted-room-material">{room.material || "—"}</dd>
        </div>
        <div>
          <dt>Price group</dt>
          <dd data-testid="qf-accepted-room-group">{room.priceGroup || "—"}</dd>
        </div>
        <div>
          <dt>Edge profile</dt>
          <dd data-testid="qf-accepted-room-edge">{room.edgeProfile || "—"}</dd>
        </div>
        <div>
          <dt>Countertop SF (raw → rounded)</dt>
          <dd>
            {num(room.countertopMeasuredSf)} → {num(room.countertopRoundedSf)}
          </dd>
        </div>
        <div>
          <dt>Backsplash</dt>
          <dd>
            {room.backsplash?.selected
              ? `Yes · height ${num(room.backsplash.heightIn)}" · ${num(room.backsplash.measuredSf)} → ${num(room.backsplash.roundedSf)} SF`
              : "No"}
          </dd>
        </div>
        <div>
          <dt>Sink</dt>
          <dd data-testid="qf-accepted-room-sink">{room.sink || "—"}</dd>
        </div>
        <div>
          <dt>Sink cutout</dt>
          <dd>
            {room.sinkCutout?.kitchenSinkQty
              ? `${room.sinkCutout.kitchenSinkQty} · ${money(room.sinkCutout.kitchenSinkCharge)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Faucet</dt>
          <dd data-testid="qf-accepted-room-faucet">{room.faucet || "—"}</dd>
        </div>
        <div>
          <dt>Accessories</dt>
          <dd data-testid="qf-accepted-room-accessories">
            {(room.accessories || []).length
              ? (room.accessories || [])
                  .map((a) =>
                    Number(a.quantity) > 1 ? `${a.label} ×${a.quantity}` : a.label
                  )
                  .join(", ")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Specialty</dt>
          <dd>
            {(room.specialty || []).length
              ? (room.specialty || [])
                  .map((s) =>
                    Number(s.quantity) > 1 ? `${s.label} ×${s.quantity}` : s.label
                  )
                  .join(", ")
              : "—"}
          </dd>
        </div>
        {room.customerNote ? (
          <div>
            <dt>Customer note</dt>
            <dd>{room.customerNote}</dd>
          </div>
        ) : null}
        <div>
          <dt>Room subtotal</dt>
          <dd>{money(room.roomSubtotal)}</dd>
        </div>
      </dl>

      {counterPieces.length > 0 ? (
        <div className="qf-accepted__pieces" data-testid="qf-accepted-piece-table">
          <h5>Countertop pieces (per-piece rounding)</h5>
          <table>
            <thead>
              <tr>
                <th>Piece</th>
                <th>L × D</th>
                <th>Qty</th>
                <th>Raw SF</th>
                <th>Rounded SF</th>
                <th>Open edge LF</th>
                <th>Included</th>
              </tr>
            </thead>
            <tbody>
              {counterPieces.map((p, i) => (
                <tr key={p.pieceId || `${p.name}-${i}`}>
                  <td>{p.name || "Piece"}</td>
                  <td>
                    {num(p.lengthIn)} × {num(p.depthIn)}
                  </td>
                  <td>{num(p.quantity)}</td>
                  <td>{num(p.rawSquareFeet)}</td>
                  <td>{num(p.roundedSquareFeet)}</td>
                  <td>{num(p.openEdgeLf)}</td>
                  <td>{p.included === false ? "No" : "Yes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {room.roundingCheck ? (
            <p className="qf-muted">
              Rounded room SF {num(room.roundingCheck.roomCountertopRoundedSf)} = sum of rounded
              pieces {num(room.roundingCheck.sumRoundedIncludedCountertopPieces)}
              {room.roundingCheck.matchesRoomTotal ? " ✓" : " (check calc snapshot)"}
            </p>
          ) : null}
        </div>
      ) : null}

      {(room.internalOnlyLines || []).length > 0 ? (
        <div className="qf-accepted__internal" data-testid="qf-accepted-internal-lines">
          <h5>Internal-only lines</h5>
          <ul>
            {(room.internalOnlyLines || []).map((l, i) => (
              <li key={`${l.label}-${i}`}>
                <span className="qf-accepted__internal-tag">Internal only</span> {l.label}:{" "}
                {money(l.amount)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function OfficialAcceptedReportPanel(props: Props) {
  const payload = props.acceptedReport || null;
  const status = payload?.status || "not_accepted";
  const report = payload?.report || null;
  const header = report?.header || null;
  const invoice = report?.invoicePreparation || null;
  const rooms = Array.isArray(report?.rooms) ? report.rooms : [];

  async function copySummary() {
    if (!header && !invoice) return;
    const text = [
      "Accepted job report (internal)",
      header?.estimateName || "",
      header?.customerName || "",
      `Accepted: ${when(header?.acceptedAt)}`,
      `Accepted total: ${money(header?.acceptedCustomerTotal)}`,
      `Published total: ${money(header?.publishedEstimateTotal)}`,
      `Difference: ${deltaMoney(header?.difference)}`,
      invoice?.suggestedQuickBooksNotes || "",
      "No QuickBooks invoice created."
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <section
      className="qf-accepted"
      data-testid="qf-activity-accepted-report"
    >
      <div className="qf-accepted__head">
        <h3>Accepted job report</h3>
        <p className="qf-muted" data-testid="qf-accepted-purpose">
          Internal report for invoicing and job setup. Not customer-facing.
        </p>
      </div>

      {status === "not_accepted" || !report ? (
        <p className="qf-muted" data-testid="qf-accepted-not-yet">
          Not accepted yet
        </p>
      ) : (
        <>
          <div className="qf-accepted__header-grid" data-testid="qf-accepted-header">
            <div>
              <span className="qf-activity__status-label">Estimate</span>
              <span className="qf-activity__status-value">{header?.estimateName || "—"}</span>
            </div>
            <div>
              <span className="qf-activity__status-label">Customer</span>
              <span className="qf-activity__status-value">
                {header?.customerName || "—"}
                {header?.customerEmail ? ` · ${header.customerEmail}` : ""}
              </span>
            </div>
            <div>
              <span className="qf-activity__status-label">Accepted</span>
              <span className="qf-activity__status-value">{when(header?.acceptedAt)}</span>
            </div>
            <div>
              <span className="qf-activity__status-label">Publication / revision</span>
              <span className="qf-activity__status-value">
                {header?.publicationId || "—"}
                {header?.estimateRevision != null ? ` · R${header.estimateRevision}` : ""}
              </span>
            </div>
            <div>
              <span className="qf-activity__status-label">Accepted customer total</span>
              <span className="qf-activity__status-value">
                {money(header?.acceptedCustomerTotal)}
              </span>
            </div>
            <div>
              <span className="qf-activity__status-label">Published estimate total</span>
              <span className="qf-activity__status-value">
                {money(header?.publishedEstimateTotal)}
              </span>
            </div>
            <div>
              <span className="qf-activity__status-label">Difference</span>
              <span className="qf-activity__status-value">{deltaMoney(header?.difference)}</span>
            </div>
            <div>
              <span className="qf-activity__status-label">Pricing / group</span>
              <span className="qf-activity__status-value">
                {[header?.pricingBasis, header?.priceGroup].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
            <div>
              <span className="qf-activity__status-label">Material summary</span>
              <span className="qf-activity__status-value">{header?.materialSummary || "—"}</span>
            </div>
            <div>
              <span className="qf-activity__status-label">QuickBooks</span>
              <span className="qf-activity__status-value">
                {header?.notice || "Prepared for invoicing — no invoice created"}
              </span>
            </div>
          </div>

          <div className="qf-accepted__actions">
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-accepted-print"
              onClick={() => window.print()}
            >
              Print report
            </button>
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-accepted-copy"
              onClick={() => void copySummary()}
            >
              Copy summary
            </button>
          </div>

          <div data-testid="qf-accepted-rooms">
            <h4>Room breakdown</h4>
            {rooms.length === 0 ? (
              <p className="qf-muted">No rooms on official scope.</p>
            ) : (
              rooms.map((room) => (
                <RoomCard key={room.roomId || room.roomName || "room"} room={room} />
              ))
            )}
          </div>

          {report.projectSquareFeet ? (
            <div className="qf-accepted__sf" data-testid="qf-accepted-project-sf">
              <h4>Project square feet</h4>
              <p>
                Countertop measured {num(report.projectSquareFeet.countertopMeasuredSf)} SF ·
                rounded {num(report.projectSquareFeet.countertopRoundedSf)} SF · backsplash rounded{" "}
                {num(report.projectSquareFeet.backsplashRoundedSf)} SF
              </p>
              <p className="qf-muted">{report.projectSquareFeet.roundingRule}</p>
            </div>
          ) : null}

          {invoice ? (
            <div className="qf-accepted__invoice" data-testid="qf-accepted-invoice-prep">
              <h4>Invoice preparation summary</h4>
              <dl className="qf-accepted__dl">
                <div>
                  <dt>Accepted customer total</dt>
                  <dd>{money(invoice.acceptedCustomerTotal)}</dd>
                </div>
                <div>
                  <dt>Material / countertop</dt>
                  <dd>{money(invoice.materialCountertopTotal)}</dd>
                </div>
                <div>
                  <dt>Backsplash</dt>
                  <dd>{money(invoice.backsplashTotal)}</dd>
                </div>
                <div>
                  <dt>Sink / cutout</dt>
                  <dd>{money(invoice.sinkCutoutTotal)}</dd>
                </div>
                <div>
                  <dt>Faucet / accessories</dt>
                  <dd>{money(invoice.faucetAccessoriesTotal)}</dd>
                </div>
                <div>
                  <dt>Customer-facing custom lines</dt>
                  <dd>{money(invoice.customerFacingCustomLineTotal)}</dd>
                </div>
                <div>
                  <dt>Material use tax</dt>
                  <dd>{money(invoice.materialUseTax)}</dd>
                </div>
                <div>
                  <dt>Internal-only adjustments</dt>
                  <dd>
                    <span className="qf-accepted__internal-tag">Internal only</span>{" "}
                    {money(invoice.internalOnlyAdjustmentsTotal)}
                  </dd>
                </div>
                <div>
                  <dt>Suggested QuickBooks notes</dt>
                  <dd>{invoice.suggestedQuickBooksNotes || "—"}</dd>
                </div>
              </dl>
              <p className="qf-muted" data-testid="qf-accepted-no-qb">
                No QuickBooks invoice has been created. Handoff is not active yet.
              </p>
            </div>
          ) : null}

          {(report.lineItems?.internalOnly || []).length > 0 ? (
            <div data-testid="qf-accepted-project-internal">
              <h4>Project internal-only lines</h4>
              <ul>
                {(report.lineItems?.internalOnly || []).map((l, i) => (
                  <li key={`${l.label}-${i}`}>
                    <span className="qf-accepted__internal-tag">Internal only</span> {l.label}:{" "}
                    {money(l.amount)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
