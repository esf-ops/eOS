import type { EstimateTotals, PricingChannel } from "../lib/estimateTypes";
import { formatMoney } from "./format";

export default function TotalsSummary({
  totals,
  savedTotals,
  stale,
  channel
}: {
  totals: EstimateTotals | null;
  savedTotals: EstimateTotals | null;
  stale: boolean;
  channel: PricingChannel;
}) {
  const drift = savedTotals && totals && Math.abs(savedTotals.total - totals.total) >= 0.01;
  return (
    <div className={`eb-totals${stale ? " is-stale" : ""}`} aria-live="polite">
      <div className="eb-totals-head">
        <span>Estimate total</span>
        <span className="eb-tag">{channel === "direct" ? "Direct" : "Wholesale"}</span>
      </div>
      <dl>
        <div>
          <dt>Items before tax</dt>
          <dd>{formatMoney(totals?.subtotal ?? 0)}</dd>
        </div>
        <div>
          <dt title="Added to each countertop and backsplash material line">Use tax{totals ? ` (${totals.useTax.percent}%, in lines)` : ""}</dt>
          <dd>{formatMoney(totals?.useTax.amount ?? 0)}</dd>
        </div>
        <div>
          <dt title="Each line is rounded up to the next $5">Rounding to $5</dt>
          <dd>{formatMoney(totals?.roundingAdjustment ?? 0)}</dd>
        </div>
        <div className="eb-totals-grand">
          <dt>Total</dt>
          <dd>{formatMoney(totals?.total ?? 0)}</dd>
        </div>
      </dl>
      {totals ? (
        <p className="eb-muted eb-small">
          {totals.pricedCount} of {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"} priced
          {totals.noteCount ? ` · ${totals.noteCount} note${totals.noteCount === 1 ? "" : "s"}` : ""}
          {totals.qualifyingKitchenCounterSf ? ` · ${totals.qualifyingKitchenCounterSf} countertop sf` : ""}
        </p>
      ) : null}
      {drift ? <p className="eb-warn-text eb-small">Saved total was {formatMoney(savedTotals!.total)}.</p> : null}
    </div>
  );
}
