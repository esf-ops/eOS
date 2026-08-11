import React from "react";

export type QuickBooksFinancialTruthPayload = {
  status?: "ok" | "unavailable" | "disabled" | string;
  source?: string;
  refreshed_at?: string | null;
  date_range?: { start_date?: string | null; end_date?: string | null };
  estimates?: { count?: number | null; amount?: number | null };
  sales_orders?: { count?: number | null; amount?: number | null };
  invoices?: { count?: number | null; amount?: number | null };
  payments?: { count?: number | null; amount?: number | null };
  open_ar?: {
    invoice_count?: number | null;
    amount?: number | null;
    basis?: string | null;
    basis_note?: string | null;
  };
  warnings?: string[];
};

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `$${Math.round(Number(value)).toLocaleString()}`;
}

function statusLabel(status: string | undefined): string {
  if (status === "ok") return "Connected";
  if (status === "disabled") return "Disabled";
  return "Unavailable";
}

type Props = {
  truth?: QuickBooksFinancialTruthPayload | null;
};

/**
 * Additive QuickBooks Financial Truth — Beta strip.
 * Does not alter Moraware KPI calculations.
 */
export default function QuickBooksFinancialTruthBeta({ truth }: Props) {
  if (!truth) return null;

  const connected = truth.status === "ok";
  const warning = Array.isArray(truth.warnings) && truth.warnings.length > 0 ? truth.warnings[0] : null;
  const rangeStart = truth.date_range?.start_date || "—";
  const rangeEnd = truth.date_range?.end_date || "—";
  const refreshed = truth.refreshed_at ? new Date(truth.refreshed_at).toLocaleString() : "—";

  const cards = [
    { id: "quoted", label: "Quoted $", amount: truth.estimates?.amount },
    { id: "sales_orders", label: "Sales Orders $", amount: truth.sales_orders?.amount },
    { id: "invoiced", label: "Invoiced $", amount: truth.invoices?.amount },
    { id: "collected", label: "Collected $", amount: truth.payments?.amount },
    { id: "open_ar", label: "Open A/R", amount: truth.open_ar?.amount }
  ];

  return (
    <section className="qb-truth-beta" aria-label="QuickBooks Financial Truth Beta">
      <div className="qb-truth-beta__head">
        <div>
          <p className="qb-truth-beta__eyebrow">QuickBooks Financial Truth — Beta</p>
          <p className="qb-truth-beta__meta">
            Source: QuickBooks Desktop · Range: {rangeStart} → {rangeEnd} · Last refreshed: {refreshed}
          </p>
        </div>
        <span className={`qb-truth-beta__status qb-truth-beta__status--${connected ? "ok" : "off"}`}>
          {statusLabel(truth.status)}
        </span>
      </div>

      {!connected ? (
        <p className="qb-truth-beta__warning" role="status">
          {warning || "QuickBooks financial totals are unavailable. Moraware Sales KPIs are unchanged."}
        </p>
      ) : (
        <div className="qb-truth-beta__cards">
          {cards.map((card) => (
            <article key={card.id} className="qb-truth-beta__card">
              <span>{card.label}</span>
              <strong>{money(card.amount)}</strong>
            </article>
          ))}
        </div>
      )}

      {connected && truth.open_ar?.basis_note ? (
        <p className="qb-truth-beta__note">{truth.open_ar.basis_note}</p>
      ) : null}
    </section>
  );
}
