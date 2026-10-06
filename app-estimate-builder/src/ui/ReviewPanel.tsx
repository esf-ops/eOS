import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiGetBlob, apiPost } from "../lib/api";
import { groupItemsByRoom } from "../lib/estimateDocument";
import type { EstimateDocument, EstimatePricing, PricedItem, ProposalPreview, SavedPrint, SaveResult } from "../lib/estimateTypes";
import type { SavedRef } from "./EstimateBuilder";
import { itemFallbackLabel } from "./RoomSection";
import { formatMoney, formatQty } from "./format";

const FINAL_STATUSES = [
  { value: "draft", label: "Keep as draft" },
  { value: "testing_review", label: "Ready for internal review" },
  { value: "sent", label: "Sent to customer" }
];

type ProposalState = { html: string; total: number | null; filename: string; fromSaved: boolean; error: string; loading: boolean };

export default function ReviewPanel({
  token,
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
  token: string;
  doc: EstimateDocument;
  pricing: EstimatePricing | null;
  pricingPending: boolean;
  saved: SavedRef | null;
  /** What Brain persisted; null when there are unsaved changes. */
  savedPrint: SavedPrint | null;
  saving: boolean;
  canSave: boolean;
  onClose: () => void;
  onEditItem: (id: string) => void;
  onFinalize: (status: string) => Promise<SaveResult | null>;
}) {
  const [tab, setTab] = useState<"internal" | "proposal">("internal");
  const [status, setStatus] = useState(saved?.status && saved.status !== "draft" ? saved.status : "testing_review");
  const [proposal, setProposal] = useState<ProposalState>({ html: "", total: null, filename: "", fromSaved: false, error: "", loading: false });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const pricedById = useMemo(() => new Map((pricing?.items ?? []).map((p) => [p.itemId, p])), [pricing]);
  const groups = useMemo(() => groupItemsByRoom(doc), [doc]);
  const blockers = pricing?.readiness.blockers ?? [];
  const needsReady = status !== "draft";
  const savedProposalReady = Boolean(saved && savedPrint?.has_proposal);

  // Saved + clean → the stored proposal snapshot; otherwise a live preview of the open document.
  useEffect(() => {
    if (tab !== "proposal") return;
    let cancelled = false;
    setProposal((p) => ({ ...p, loading: true, error: "" }));
    const load = savedProposalReady
      ? apiGet<ProposalPreview>(`/api/estimate-builder/quotes/${encodeURIComponent(saved!.quoteId)}/proposal?format=html`, token)
      : apiPost<ProposalPreview>("/api/estimate-builder/proposal/preview", token, { document: doc, quoteNumber: saved?.quoteNumber ?? "" });
    load
      .then((r) => !cancelled && setProposal({ html: r.html, total: r.total, filename: r.filename, fromSaved: savedProposalReady, error: "", loading: false }))
      .catch((e) => !cancelled && setProposal((p) => ({ ...p, loading: false, error: e instanceof ApiError ? e.message : String(e) })));
    return () => {
      cancelled = true;
    };
    // Re-render the preview when Brain re-prices the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, savedProposalReady, saved?.quoteId, pricing, token]);

  const downloadPdf = async () => {
    if (!saved || !savedProposalReady) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await apiGetBlob(`/api/estimate-builder/quotes/${encodeURIComponent(saved.quoteId)}/proposal?format=pdf`, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = savedPrint?.proposal_filename || "Elite Stone Fabrication Proposal.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  const pdfTitle = !saved
    ? "Save the estimate first — the PDF is generated from the saved quote"
    : !savedPrint
      ? "Save your changes first — the PDF matches the saved quote"
      : !savedPrint.has_proposal
        ? "Save once more to generate the proposal for this quote"
        : "Download the proposal PDF to attach to an email";

  return (
    <div className="eb-review" role="dialog" aria-modal="true" aria-label="Review estimate">
      <div className="eb-review-bar">
        <button type="button" className="eb-btn" onClick={onClose}>
          ← Back to builder
        </button>
        <div className="eb-segmented" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "internal"} className={tab === "internal" ? "is-active" : ""} onClick={() => setTab("internal")}>
            Internal review
          </button>
          <button type="button" role="tab" aria-selected={tab === "proposal"} className={tab === "proposal" ? "is-active" : ""} onClick={() => setTab("proposal")}>
            Proposal
          </button>
        </div>
        <span className="eb-spacer" />
        {pricingPending ? <span className="eb-muted eb-small">Pricing…</span> : null}
        <button type="button" className="eb-btn" onClick={() => void downloadPdf()} disabled={!savedProposalReady || downloading} title={pdfTitle}>
          {downloading ? "Preparing PDF…" : "Download PDF"}
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

      <div className="eb-review-body">
        {downloadError ? <div className="eb-banner eb-banner-danger">PDF download failed: {downloadError}</div> : null}
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
                  <th className="num">Before tax</th>
                  <th className="num">Use tax</th>
                  <th className="num">Line ($5)</th>
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
                    <td colSpan={5}>Items before tax</td>
                    <td className="num">{formatMoney(pricing.totals.subtotal)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={5}>Use tax ({pricing.totals.useTax.percent}% on countertop &amp; backsplash material, included in lines)</td>
                    <td className="num">{formatMoney(pricing.totals.useTax.amount)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={5}>Rounding (each line up to the next $5)</td>
                    <td className="num">{formatMoney(pricing.totals.roundingAdjustment)}</td>
                    <td />
                  </tr>
                  <tr className="eb-review-grand">
                    <td colSpan={5}>Total (matches the proposal)</td>
                    <td className="num">{formatMoney(pricing.totals.total)}</td>
                    <td />
                  </tr>
                  {pricing.totals.options?.count ? (
                    <tr>
                      <td colSpan={5}>Options listed on the proposal, not included in the total ({pricing.totals.options.count})</td>
                      <td className="num">{formatMoney(pricing.totals.options.total)}</td>
                      <td />
                    </tr>
                  ) : null}
                </tfoot>
              ) : null}
            </table>
          </div>
        ) : (
          <div className="eb-proposal">
            <p className="eb-muted eb-small">
              {proposal.loading
                  ? "Rendering proposal…"
                  : proposal.error
                    ? `Proposal unavailable: ${proposal.error}`
                    : proposal.fromSaved
                      ? `Saved version${saved ? ` · ${saved.quoteNumber}` : ""} · ${proposal.filename}`
                      : "Preview of unsaved changes — save to lock this version and enable Download PDF."}
            </p>
            {proposal.html ? <iframe className="eb-proposal-frame" title="Proposal preview" srcDoc={proposal.html} sandbox="" /> : null}
          </div>
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
  const roomTotal = items.reduce((s, it) => s + (it.optional ? 0 : pricedById.get(it.id)?.amount ?? 0), 0);
  return (
    <>
      <tr className="eb-review-room">
        <td colSpan={5}>{title}</td>
        <td className="num">{formatMoney(roomTotal)}</td>
        <td />
      </tr>
      {items.map((it) => {
        if (it.itemType === "note") {
          return (
            <tr key={it.id} className="eb-review-note">
              <td colSpan={7}>{it.inputs.text}</td>
            </tr>
          );
        }
        const p = pricedById.get(it.id);
        const priced = p?.status === "priced";
        return (
          <tr key={it.id} className={!priced ? "is-incomplete" : undefined}>
            <td>
              <button type="button" className="eb-link" onClick={() => onEditItem(it.id)}>
                {it.label || p?.description || itemFallbackLabel(it)}
              </button>
              {it.optional ? <span className="eb-tag eb-tag-option">Option · not in total</span> : null}
            </td>
            <td className="num">{p?.quantity != null ? formatQty(p.quantity, p.unit) : "—"}</td>
            <td className="num">{p?.rate != null ? formatMoney(p.rate) : "—"}</td>
            <td className="num">{priced ? formatMoney(p!.exactAmount) : "—"}</td>
            <td className="num">{priced && p!.useTaxAmount ? formatMoney(p!.useTaxAmount) : "—"}</td>
            <td className="num">{priced ? formatMoney(p!.amount) : "—"}</td>
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
