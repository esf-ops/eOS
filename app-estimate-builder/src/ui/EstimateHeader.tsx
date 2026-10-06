import { useState } from "react";
import type { DocAction } from "../lib/estimateDocument";
import type { EstimateDocument, EstimateHeader as Header, EstimatingDirectory, QbCustomer } from "../lib/estimateTypes";
import AccountPicker from "./AccountPicker";
import type { SavedRef } from "./EstimateBuilder";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  testing_review: "In review",
  sent: "Sent",
  follow_up: "Follow up",
  revised: "Revised",
  sold: "Sold",
  lost: "Lost"
};

export default function EstimateHeader({
  doc,
  dispatch,
  saved,
  dirty,
  onNew,
  onOpen,
  onDuplicate,
  directory,
  searchCustomers
}: {
  doc: EstimateDocument;
  dispatch: (a: DocAction) => void;
  saved: SavedRef | null;
  dirty: boolean;
  onNew: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  directory: EstimatingDirectory | null;
  searchCustomers: (q: string, signal: AbortSignal) => Promise<QbCustomer[]>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const h = doc.header;
  const set = (patch: Partial<Header>) => dispatch({ type: "set_header", patch });
  const useDirectory = Boolean(directory?.configured);
  const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const branchCode = h.branchCode || (useDirectory ? directory!.branches.find((b) => sameLabel(b.label, h.branch))?.code ?? "" : "");
  const repCode = h.salesRepCode || (useDirectory ? directory!.salesReps.find((r) => sameLabel(r.name, h.salesRep))?.code ?? "" : "");
  const missing = useDirectory ? [!h.qbCustomerListId && "account", !branchCode && "branch", !repCode && "sales rep"].filter(Boolean) as string[] : [];
  const pickAccount = (c: QbCustomer) =>
    set({ accountName: c.fullName, qbCustomerListId: c.listId, ...(h.customerName.trim() ? {} : { customerName: c.fullName }) });

  return (
    <header className="eb-header">
      <div className="eb-header-main">
        <label className="eb-hfield eb-hfield-lg">
          <span>Customer</span>
          <input value={h.customerName} placeholder="Customer or builder" onChange={(e) => set({ customerName: e.target.value })} />
        </label>
        <label className="eb-hfield eb-hfield-lg">
          <span>Project</span>
          <input value={h.projectName} placeholder="Project / job name" onChange={(e) => set({ projectName: e.target.value })} />
        </label>
        <label className="eb-hfield eb-hfield-xl">
          <span>Address</span>
          <input value={h.projectAddress} placeholder="Street address" onChange={(e) => set({ projectAddress: e.target.value })} />
        </label>
        <div className="eb-hfield">
          <span>Pricing</span>
          <div className="eb-segmented" role="radiogroup" aria-label="Pricing channel">
            {(["direct", "wholesale"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                role="radio"
                aria-checked={doc.pricingChannel === ch}
                className={doc.pricingChannel === ch ? "is-active" : ""}
                onClick={() => dispatch({ type: "set_channel", channel: ch })}
              >
                {ch === "direct" ? "Direct" : "Wholesale"}
              </button>
            ))}
          </div>
        </div>
        <div className="eb-hfield eb-header-status">
          <span>Status</span>
          <div className="eb-status-line">
            <span className={`eb-status eb-status-${saved?.status ?? "new"}`}>
              {saved ? STATUS_LABELS[saved.status] ?? saved.status : "Not saved"}
            </span>
            {saved ? (
              <span className="eb-quote-num">
                {saved.quoteNumber}
                {saved.revisionLabel ? ` · ${saved.revisionLabel}` : ""}
              </span>
            ) : null}
            {dirty && saved ? <span className="eb-dirty" title="Unsaved changes" aria-label="Unsaved changes" /> : null}
          </div>
        </div>
        <div className="eb-header-tools">
          <button
            type="button"
            className="eb-btn"
            onClick={() => setDetailsOpen(true)}
            title={missing.length ? `For QuickBooks, choose the ${listJoin(missing)}` : undefined}
          >
            Details
            {missing.length ? <span className="eb-details-badge" aria-label={`${missing.length} QuickBooks fields missing`}>{missing.length}</span> : null}
          </button>
          <HeaderMenu onNew={onNew} onOpen={onOpen} onDuplicate={onDuplicate} />
        </div>
      </div>

      {detailsOpen ? (
        <div className="eb-overlay eb-overlay-drawer" onClick={() => setDetailsOpen(false)}>
          <aside className="eb-drawer" role="dialog" aria-modal="true" aria-label="Estimate details" onClick={(e) => e.stopPropagation()}>
            <div className="eb-drawer-head">
              <h2>Estimate details</h2>
              <button type="button" className="eb-icon-btn" onClick={() => setDetailsOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="eb-drawer-body">
              {useDirectory ? (
                <p className={`eb-qb-status ${missing.length ? "" : "is-ready"}`}>
                  {missing.length
                    ? `To line up with QuickBooks, choose the ${listJoin(missing)}.`
                    : "Account, branch and sales rep are linked to QuickBooks."}
                </p>
              ) : null}
              <fieldset className="eb-fieldset">
                <legend>Customer</legend>
                {useDirectory ? (
                  <AccountPicker
                    value={h.accountName}
                    linked={Boolean(h.qbCustomerListId)}
                    onType={(text) => set({ accountName: text, qbCustomerListId: "" })}
                    onPick={pickAccount}
                    search={searchCustomers}
                  />
                ) : (
                  <Field label="Account" value={h.accountName} onChange={(v) => set({ accountName: v })} />
                )}
                <Field label="Customer name" value={h.customerName} onChange={(v) => set({ customerName: v })} />
                <div className="eb-grid-2">
                  <Field label="Email" type="email" value={h.customerEmail} onChange={(v) => set({ customerEmail: v })} />
                  <Field label="Phone" type="tel" value={h.customerPhone} onChange={(v) => set({ customerPhone: v })} />
                </div>
                <label className="eb-field">
                  <span>Bill-to address (proposal &ldquo;Quote For&rdquo; box — defaults to the project address)</span>
                  <textarea rows={2} value={h.billToAddress} onChange={(e) => set({ billToAddress: e.target.value })} />
                </label>
              </fieldset>
              <fieldset className="eb-fieldset">
                <legend>Project</legend>
                <Field label="Project name" value={h.projectName} onChange={(v) => set({ projectName: v })} />
                <Field label="Address" value={h.projectAddress} onChange={(v) => set({ projectAddress: v })} />
                <div className="eb-grid-3">
                  <Field label="City" value={h.city} onChange={(v) => set({ city: v })} />
                  <Field label="State" value={h.state} onChange={(v) => set({ state: v })} />
                  <Field label="ZIP" value={h.zip} onChange={(v) => set({ zip: v })} />
                </div>
                <div className="eb-grid-2">
                  <Field label="County" value={h.county} onChange={(v) => set({ county: v })} />
                  <Field label="P.O. No." value={h.poNumber} onChange={(v) => set({ poNumber: v })} />
                </div>
              </fieldset>
              <fieldset className="eb-fieldset">
                <legend>Elite</legend>
                {useDirectory ? (
                  <div className="eb-grid-2">
                    <label className="eb-field">
                      <span>Branch</span>
                      <select
                        value={branchCode}
                        onChange={(e) => {
                          const b = directory!.branches.find((x) => x.code === e.target.value);
                          set({ branchCode: b?.code ?? "", branch: b?.label ?? "" });
                        }}
                      >
                        <option value="">Choose a branch…</option>
                        {directory!.branches.map((b) => (
                          <option key={b.code} value={b.code} disabled={b.quickbooks.status !== "linked" && b.code !== branchCode}>
                            {b.label}
                            {b.quickbooks.status !== "linked" ? " (no QuickBooks class)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="eb-field">
                      <span>Sales rep</span>
                      <select
                        value={repCode}
                        onChange={(e) => {
                          const r = directory!.salesReps.find((x) => x.code === e.target.value);
                          set({ salesRepCode: r?.code ?? "", salesRep: r?.name ?? "" });
                        }}
                      >
                        <option value="">Choose a sales rep…</option>
                        {directory!.salesReps.map((r) => (
                          <option key={r.code} value={r.code} disabled={r.quickbooks.status !== "linked" && r.code !== repCode}>
                            {r.name}
                            {r.quickbooks.initials ? ` (${r.quickbooks.initials})` : ""}
                            {r.quickbooks.status !== "linked" ? " — not in QuickBooks" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="eb-grid-2">
                    <Field label="Branch" value={h.branch} onChange={(v) => set({ branch: v })} />
                    <Field label="Sales rep" value={h.salesRep} onChange={(v) => set({ salesRep: v })} />
                  </div>
                )}
                <Field label="Prepared by (shown on the customer PDF)" value={h.preparedBy} onChange={(v) => set({ preparedBy: v })} />
              </fieldset>
              <fieldset className="eb-fieldset">
                <legend>Notes</legend>
                <Field
                  label="Customer message (bottom of the proposal, e.g. “Final bill — due on receipt. Thank you for your business!”)"
                  value={h.customerMessage}
                  onChange={(v) => set({ customerMessage: v })}
                />
                <label className="eb-field">
                  <span>Customer-facing notes (below the proposal total)</span>
                  <textarea rows={3} value={h.customerNotes} onChange={(e) => set({ customerNotes: e.target.value })} />
                </label>
                <label className="eb-field">
                  <span>Internal notes (never shown to the customer)</span>
                  <textarea rows={3} value={h.internalNotes} onChange={(e) => set({ internalNotes: e.target.value })} />
                </label>
              </fieldset>
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  );
}

function listJoin(parts: string[]): string {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="eb-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function HeaderMenu({ onNew, onOpen, onDuplicate }: { onNew: () => void; onOpen: () => void; onDuplicate: () => void }) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="eb-menu-wrap">
      <button type="button" className="eb-icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Estimate actions" onClick={() => setOpen((o) => !o)}>
        •••
      </button>
      {open ? (
        <>
          <div className="eb-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="eb-menu" role="menu">
            <button type="button" role="menuitem" onClick={run(onNew)}>
              New estimate
            </button>
            <button type="button" role="menuitem" onClick={run(onOpen)}>
              Open saved estimate…
            </button>
            <button type="button" role="menuitem" onClick={run(onDuplicate)}>
              Duplicate estimate
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
