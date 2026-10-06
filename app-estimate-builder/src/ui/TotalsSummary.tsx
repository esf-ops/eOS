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
  const useTax = totals?.useTax.amount ?? 0;
  const rounding = totals?.roundingAdjustment ?? 0;
  const options = totals?.options;
  return (
    <div className={`eb-totals${stale ? " is-stale" : ""}`} aria-live="polite">
      <div className="eb-totals-head">
        <span>Estimate total</span>
        <span className="eb-tag">{channel === "direct" ? "Direct" : "Wholesale"}</span>
      </div>
      <dl>
        {useTax > 0 || rounding > 0 ? (
          <div>
            <dt>Items</dt>
            <dd>{formatMoney(totals?.subtotal ?? 0)}</dd>
          </div>
        ) : null}
        {useTax > 0 ? (
          <div>
            <dt title="Added to each countertop and backsplash material line">Use tax ({totals!.useTax.percent}%)</dt>
            <dd>{formatMoney(useTax)}</dd>
          </div>
        ) : null}
        {rounding > 0 ? (
          <div>
            <dt title="Each line is rounded up to the next $5">Rounded up to $5 per line</dt>
            <dd>{formatMoney(rounding)}</dd>
          </div>
        ) : null}
        <div className="eb-totals-grand">
          <dt>Total</dt>
          <dd>{formatMoney(totals?.total ?? 0)}</dd>
        </div>
        {options?.count ? (
          <div className="eb-totals-options">
            <dt title="Priced and shown on the proposal under Options, not added to the total">
              {options.count} option{options.count === 1 ? "" : "s"} · not included
            </dt>
            <dd>{formatMoney(options.total)}</dd>
          </div>
        ) : null}
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
