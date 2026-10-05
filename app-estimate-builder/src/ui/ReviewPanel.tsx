import { useMemo, useState } from "react";
import CustomerEstimateDocument from "@quote-lib/customerEstimate/CustomerEstimateDocument";
import { snapshotToDocumentProps } from "@quote-lib/customerEstimate/documentProps";
import { groupItemsByRoom } from "../lib/estimateDocument";
import type { EstimateDocument, EstimatePricing, PricedItem, SavedPrint, SaveResult } from "../lib/estimateTypes";
import type { SavedRef } from "./EstimateBuilder";
import { itemFallbackLabel } from "./RoomSection";
import { formatMoney, formatQty } from "./format";

const FINAL_STATUSES = [
  { value: "draft", label: "Keep as draft" },
  { value: "testing_review", label: "Ready for internal review" },
  { value: "sent", label: "Sent to customer" }
];

export default function ReviewPanel({
  doc,
  pricing,
  pricingPending,
  saved,
  savedPrint,
  saving,
  canSave,
  onClose,
  onEditItem,
  onFinalize
}: {
  doc: EstimateDocument;
  pricing: EstimatePricing | null;
  pricingPending: boolean;
  saved: SavedRef | null;
  /** Persisted customer snapshot; null when there are unsaved changes. */
  savedPrint: SavedPrint | null;
  saving: boolean;
  canSave: boolean;
  onClose: () => void;
  onEditItem: (id: string) => void;
  onFinalize: (status: string) => Promise<SaveResult | null>;
}) {
  const [tab, setTab] = useState<"internal" | "customer">("internal");
  const [status, setStatus] = useState(saved?.status && saved.status !== "draft" ? saved.status : "testing_review");
  const pricedById = useMemo(() => new Map((pricing?.items ?? []).map((p) => [p.itemId, p])), [pricing]);
  const groups = useMemo(() => groupItemsByRoom(doc), [doc]);
  const fromSaved = Boolean(savedPrint?.customer_print_snapshot);
  const printSource = fromSaved ? savedPrint!.customer_print_snapshot : pricing?.customerPreview;
  const pdfFilename = fromSaved ? savedPrint!.pdf_filename : pricing?.pdfFilename;
  const docProps = useMemo(() => (printSource ? snapshotToDocumentProps(printSource) : null), [printSource]);
  const customerTotal = docProps?.customerDisplay.finalRounded ?? null;
  const blockers = pricing?.readiness.blockers ?? [];
  const needsReady = status !== "draft";

  const print = () => {
    const previous = document.title;
    if (pdfFilename) document.title = pdfFilename.replace(/\.pdf$/i, "");
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <div className="eb-review" role="dialog" aria-modal="true" aria-label="Review estimate">
      <div className="eb-review-bar eb-no-print">
        <button type="button" className="eb-btn" onClick={onClose}>
          ← Back to builder
        </button>
        <div className="eb-segmented" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "internal"} className={tab === "internal" ? "is-active" : ""} onClick={() => setTab("internal")}>
            Internal review
          </button>
          <button type="button" role="tab" aria-selected={tab === "customer"} className={tab === "customer" ? "is-active" : ""} onClick={() => setTab("customer")}>
            Customer estimate
          </button>
        </div>
        <span className="eb-spacer" />
        {pricingPending ? <span className="eb-muted eb-small">Pricing…</span> : null}
        <button type="button" className="eb-btn" onClick={print} disabled={!docProps || (!fromSaved && pricingPending)}>
          Print / save PDF
        </button>
        <select className="eb-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status on save">
          {FINAL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="eb-btn eb-btn-primary"
          disabled={!canSave || saving || pricingPending || (needsReady && blockers.length > 0)}
          onClick={() => void onFinalize(status)}
          title={!canSave ? "Saving needs a signed-in session" : needsReady && blockers.length ? "Resolve the items below first" : undefined}
        >
          {saving ? "Saving…" : "Save to Quote Library"}
        </button>
      </div>

      <div className="eb-review-body eb-no-print">
        {blockers.length ? (
          <div className="eb-banner eb-banner-warn">
            <strong>Before finalizing:</strong>
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="eb-banner eb-banner-ok">Every item is priced. This estimate is ready to finalize.</div>
        )}

        {tab === "internal" ? (
          <div className="eb-review-table-wrap">
            <table className="eb-review-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <ReviewGroup key={g.room?.id ?? "__project"} title={g.room?.name ?? "Project items"} items={g.items} pricedById={pricedById} onEditItem={onEditItem} />
                ))}
              </tbody>
              {pricing ? (
                <tfoot>
                  <tr>
                    <td colSpan={3}>Subtotal</td>
                    <td className="num">{formatMoney(pricing.totals.subtotal)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      Use tax ({pricing.totals.useTax.percent}% on countertop &amp; backsplash material)
                    </td>
                    <td className="num">{formatMoney(pricing.totals.useTax.amount)}</td>
                    <td />
                  </tr>
                  <tr className="eb-review-grand">
                    <td colSpan={3}>Total</td>
                    <td className="num">{formatMoney(pricing.totals.total)}</td>
                    <td />
                  </tr>
                  {customerTotal != null ? (
                    <tr>
                      <td colSpan={3}>Customer estimate total (PDF)</td>
                      <td className="num">{formatMoney(customerTotal)}</td>
                      <td className="eb-muted eb-small">Each customer line rounds up to the next $5, as on Internal Estimate PDFs.</td>
                    </tr>
                  ) : null}
                </tfoot>
              ) : null}
            </table>
          </div>
        ) : null}
      </div>

      <div className={tab === "customer" ? "eb-customer-preview is-visible" : "eb-customer-preview"}>
        {docProps ? (
          <p className="eb-muted eb-small eb-no-print eb-print-source">
            {fromSaved
              ? `Saved version${saved ? ` · ${saved.quoteNumber}${saved.revisionLabel ? ` ${saved.revisionLabel}` : ""}` : ""} · ${pdfFilename ?? ""}`
              : "Preview of unsaved changes — save to lock this version."}
          </p>
        ) : null}
        {docProps ? (
          <CustomerEstimateDocument {...docProps} />
        ) : (
          <p className="eb-muted eb-no-print">Customer preview appears once the estimate is priced.</p>
        )}
      </div>
    </div>
  );
}

function ReviewGroup({
  title,
  items,
  pricedById,
  onEditItem
}: {
  title: string;
  items: EstimateDocument["items"];
  pricedById: Map<string, PricedItem>;
  onEditItem: (id: string) => void;
}) {
  if (!items.length) return null;
  const roomTotal = items.reduce((s, it) => s + (pricedById.get(it.id)?.amount ?? 0), 0);
  return (
    <>
      <tr className="eb-review-room">
        <td colSpan={3}>{title}</td>
        <td className="num">{formatMoney(roomTotal)}</td>
        <td />
      </tr>
      {items.map((it) => {
        const p = pricedById.get(it.id);
        return (
          <tr key={it.id} className={p?.status !== "priced" ? "is-incomplete" : undefined}>
            <td>
              <button type="button" className="eb-link" onClick={() => onEditItem(it.id)}>
                {p?.description || itemFallbackLabel(it)}
              </button>
            </td>
            <td className="num">{p?.quantity != null ? formatQty(p.quantity, p.unit) : "—"}</td>
            <td className="num">{p?.rate != null ? formatMoney(p.rate) : "—"}</td>
            <td className="num">{p?.status === "priced" ? formatMoney(p.amount) : "—"}</td>
            <td>
              {(p?.warnings ?? []).map((w) => (
                <span key={w.code} className={`eb-warning eb-warning-${w.severity}`}>
                  {w.message}
                </span>
              ))}
            </td>
          </tr>
        );
      })}
    </>
  );
}
