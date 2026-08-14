import { useMemo, useState } from "react";
import {
  agingOver60,
  buildApInsights,
  buildArInsights,
  buildPnlInsights,
  concentrationShare,
  periodMonthLabel,
} from "../lib/financeInsights.mjs";
import {
  agingRowsFromBuckets,
  cashEventRoleLabel,
  formatMoney,
  formatPct,
  formatPeriodCaption,
  formatYmdUtc,
  statusLabel,
  type FinanceMetric,
  type FinanceTab,
} from "../lib/financeViewModel";
import FinanceDrilldown from "./FinanceDrilldown";

export type FinanceDrilldownKind =
  | "revenue"
  | "gross_profit"
  | "gross_margin"
  | "net_income"
  | "ar"
  | "ap"
  | "cash"
  | "balance_sheet";

export type DrilldownData = {
  ytd?: Record<string, unknown>;
  monthly?: Array<Record<string, unknown>>;
  current?: Record<string, unknown>;
  previous?: Record<string, unknown>;
  ar?: Record<string, unknown>;
  ap?: Record<string, unknown>;
  cash?: Record<string, unknown>;
  bs?: Record<string, unknown>;
};

type Props = {
  kind: FinanceDrilldownKind;
  overview: Record<string, unknown>;
  data: DrilldownData | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onNavigate: (tab: FinanceTab) => void;
};

type Headline = {
  revenue?: number | null;
  cogs?: number | null;
  gross_profit?: number | null;
  gross_margin_pct?: number | null;
  net_income?: number | null;
};

type PeriodReport = Record<string, unknown> & {
  headline?: Headline;
  period_start?: string;
  period_end?: string;
};

function metric(overview: Record<string, unknown>, key: string): FinanceMetric | null {
  return ((overview.metrics as Record<string, FinanceMetric> | undefined)?.[key] || null);
}

function reportHeadline(report: Record<string, unknown> | undefined): Headline {
  return (report?.headline || {}) as Headline;
}

function drilldownPeriod(overview: Record<string, unknown>): string | null {
  const period = overview.ytd_period as {
    period_start?: string;
    period_end?: string;
    is_derived?: boolean;
    preset?: string;
  } | null;
  return formatPeriodCaption(period);
}

function SupportingMetric({
  label,
  value,
  format = "money",
  tone,
}: {
  label: string;
  value: number | null | undefined;
  format?: "money" | "pct" | "text";
  tone?: "negative" | "positive";
}) {
  const available = value != null && Number.isFinite(Number(value));
  return (
    <div className={`fin-drilldown-metric${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>
        {!available ? "Unavailable" : format === "pct" ? formatPct(value) : formatMoney(value)}
      </strong>
    </div>
  );
}

function InsightList({ insights }: { insights: string[] }) {
  if (!insights.length) return null;
  return (
    <section className="fin-insight-block" aria-label="Deterministic insights">
      <p className="fin-kicker">What the facts say</p>
      <div>
        {insights.map((insight, index) => (
          <p key={insight}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {insight}
          </p>
        ))}
      </div>
    </section>
  );
}

function MonthlyContribution({
  reports,
  valueKey,
  label,
  format = "money",
}: {
  reports: Array<Record<string, unknown>>;
  valueKey: keyof Headline;
  label: string;
  format?: "money" | "pct";
}) {
  const points = reports
    .map((report) => {
      const headline = reportHeadline(report);
      const value = Number(headline[valueKey]);
      return {
        label: periodMonthLabel(report.period_start),
        value: Number.isFinite(value) ? value : null,
      };
    })
    .filter((point) => point.label && point.value != null);
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((point) => Math.abs(point.value || 0)));
  return (
    <section className="fin-drilldown-section">
      <div className="fin-drilldown-section-title">
        <span>01</span>
        <div>
          <p className="fin-kicker">Monthly contribution</p>
          <h3>{label}</h3>
        </div>
      </div>
      <div className="fin-modal-bars" aria-label={`${label} by month`}>
        {points.map((point, index) => {
          const negative = Number(point.value) < 0;
          return (
            <div className={`fin-modal-bar-item${negative ? " is-negative" : ""}`} key={`${point.label}-${index}`}>
              <div className="fin-modal-bar-track">
                <i style={{ height: `${Math.max(7, (Math.abs(Number(point.value)) / max) * 100)}%` }} />
              </div>
              <strong>{format === "pct" ? formatPct(point.value) : formatMoney(point.value)}</strong>
              <span>{point.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DeeperLink({ label, tab, onNavigate }: { label: string; tab: FinanceTab; onNavigate: (tab: FinanceTab) => void }) {
  return (
    <button className="fin-drilldown-next" type="button" onClick={() => onNavigate(tab)}>
      <span>Continue exploring</span>
      <strong>{label}</strong>
      <i aria-hidden="true">→</i>
    </button>
  );
}

function LoadingBody({ error }: { error: string }) {
  return (
    <div className={`fin-drilldown-loading${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
      <span />
      <p>{error || "Loading governed supporting facts…"}</p>
    </div>
  );
}

function PnlDrilldown({
  kind,
  overview,
  data,
  onClose,
  onNavigate,
}: {
  kind: Extract<FinanceDrilldownKind, "revenue" | "gross_profit" | "gross_margin" | "net_income">;
  overview: Record<string, unknown>;
  data: DrilldownData;
  onClose: () => void;
  onNavigate: (tab: FinanceTab) => void;
}) {
  const ytd = data.ytd as PeriodReport | undefined;
  const current = data.current as PeriodReport | undefined;
  const previous = data.previous as PeriodReport | undefined;
  const ytdHeadline = reportHeadline(ytd);
  const currentHeadline = reportHeadline(current);
  const previousHeadline = reportHeadline(previous);
  const specs = {
    revenue: {
      index: "01",
      kicker: "Income / Accrual",
      title: "Revenue, month by month.",
      metricKey: "revenue",
      value: metric(overview, "revenue")?.value,
      label: "YTD Revenue",
      chartKey: "revenue" as keyof Headline,
      chartLabel: "Revenue contribution to YTD",
      lead: "Revenue is the sum of contiguous monthly QuickBooks Accrual P&L report facts for the period shown.",
    },
    gross_profit: {
      index: "02",
      kicker: "Contribution / Accrual",
      title: "Gross profit, in context.",
      metricKey: "gross_profit",
      value: metric(overview, "gross_profit")?.value,
      label: "YTD Gross Profit",
      chartKey: "gross_profit" as keyof Headline,
      chartLabel: "Gross profit contribution to YTD",
      lead: "Gross profit pairs governed Revenue and COGS from the same stored QuickBooks report windows.",
    },
    gross_margin: {
      index: "03",
      kicker: "Margin / Accrual",
      title: "The shape of margin.",
      metricKey: "gross_margin_pct",
      value: metric(overview, "gross_margin_pct")?.value,
      label: "YTD Gross Margin",
      chartKey: "gross_margin_pct" as keyof Headline,
      chartLabel: "Monthly gross margin",
      lead: "Gross margin is Gross Profit divided by Revenue for each governed accounting period.",
    },
    net_income: {
      index: "04",
      kicker: "Result / Accrual",
      title: "Net income, across the year.",
      metricKey: "net_income",
      value: metric(overview, "net_income")?.value,
      label: "YTD Net Income",
      chartKey: "net_income" as keyof Headline,
      chartLabel: "Net income contribution to YTD",
      lead: "Positive and negative months remain visible without applying a qualitative health judgment.",
    },
  }[kind];
  const isPct = kind === "gross_margin";
  const allInsights = buildPnlInsights(current, previous);
  const insights =
    kind === "revenue"
      ? allInsights.filter((insight) => insight.includes("revenue"))
      : kind === "net_income"
        ? allInsights.filter((insight) => insight.includes("net income"))
        : allInsights.filter((insight) => insight.includes("gross margin"));

  return (
    <FinanceDrilldown
      index={specs.index}
      kicker={specs.kicker}
      title={specs.title}
      period={drilldownPeriod(overview)}
      value={isPct ? formatPct(specs.value) : formatMoney(specs.value)}
      valueLabel={specs.label}
      lead={specs.lead}
      onClose={onClose}
    >
      <div className="fin-drilldown-metric-grid pnl">
        {kind !== "revenue" ? <SupportingMetric label="YTD Revenue" value={ytdHeadline.revenue} /> : null}
        {kind === "gross_profit" || kind === "gross_margin" ? (
          <>
            <SupportingMetric label="YTD COGS" value={ytdHeadline.cogs} />
            <SupportingMetric label="YTD Gross Profit" value={ytdHeadline.gross_profit} />
            <SupportingMetric label="YTD Gross Margin" value={ytdHeadline.gross_margin_pct} format="pct" />
          </>
        ) : null}
        <SupportingMetric
          label={`${periodMonthLabel(current?.period_start) || "Current month"} ${isPct ? "margin" : specs.label.replace("YTD ", "")}`}
          value={currentHeadline[specs.chartKey]}
          format={isPct ? "pct" : "money"}
          tone={Number(currentHeadline[specs.chartKey]) < 0 ? "negative" : undefined}
        />
        <SupportingMetric
          label={`${periodMonthLabel(previous?.period_start) || "Previous month"} ${isPct ? "margin" : specs.label.replace("YTD ", "")}`}
          value={previousHeadline[specs.chartKey]}
          format={isPct ? "pct" : "money"}
          tone={Number(previousHeadline[specs.chartKey]) < 0 ? "negative" : undefined}
        />
      </div>
      <MonthlyContribution
        reports={data.monthly || []}
        valueKey={specs.chartKey}
        label={specs.chartLabel}
        format={isPct ? "pct" : "money"}
      />
      <InsightList insights={insights} />
      <DeeperLink label="View full P&L" tab="pnl" onNavigate={onNavigate} />
    </FinanceDrilldown>
  );
}

function ArDrilldown({
  overview,
  data,
  onClose,
  onNavigate,
}: {
  overview: Record<string, unknown>;
  data: DrilldownData;
  onClose: () => void;
  onNavigate: (tab: FinanceTab) => void;
}) {
  const ar = data.ar || {};
  const total = (ar.total || {}) as FinanceMetric;
  const overdue = (ar.overdue || {}) as FinanceMetric;
  const aging = (ar.aging || {}) as {
    state?: string;
    due_date_coverage?: number;
    buckets?: Record<string, number | null>;
  };
  const customers = (ar.customers || []) as Array<{
    customer_name: string;
    open_amount: number;
    overdue_amount: number;
    invoice_count: number;
  }>;
  const invoices = (ar.invoices || []) as Array<{
    customer_name: string;
    reference_number?: string;
    due_date?: string;
    open_amount?: number;
  }>;
  const payments = ((ar.recent_payments as { items?: Array<Record<string, unknown>> } | undefined)?.items || []);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const selectedInvoices = invoices.filter((invoice) => invoice.customer_name === selectedCustomer);
  const concentration = concentrationShare(customers, total.value, 5);
  const over60 = aging.state === "available" ? agingOver60(aging.buckets) : null;

  return (
    <FinanceDrilldown
      index="05"
      kicker="Receivables / DueDate"
      title="Receivables, by exposure."
      period={formatYmdUtc(String(ar.as_of || ""))}
      value={formatMoney(total.value)}
      valueLabel="Open A/R"
      lead="Aging is governed by invoice DueDate. Customer concentration is calculated from the open receivable balances shown here."
      onClose={onClose}
    >
      <div className="fin-drilldown-metric-grid">
        <SupportingMetric label="Overdue A/R" value={overdue.value} />
        <SupportingMetric label="More than 60 days" value={over60} />
        <SupportingMetric label="Top five concentration" value={concentration} format="pct" />
        <SupportingMetric label="DueDate coverage" value={aging.due_date_coverage == null ? null : aging.due_date_coverage * 100} format="pct" />
      </div>
      {aging.state === "available" ? (
        <section className="fin-drilldown-section">
          <div className="fin-drilldown-section-title">
            <span>01</span>
            <div>
              <p className="fin-kicker">Aging composition</p>
              <h3>Where open receivables sit</h3>
            </div>
          </div>
          <div className="fin-aging-composition">
            {agingRowsFromBuckets(aging.buckets).map((row) => (
              <div key={row.key}>
                <span>{row.label}</span>
                <strong>{formatMoney(row.amount)}</strong>
                <i
                  style={{
                    width: `${total.value && row.amount != null ? Math.max(1, (row.amount / total.value) * 100) : 0}%`,
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="fin-drilldown-section">
        <div className="fin-drilldown-section-title">
          <span>02</span>
          <div>
            <p className="fin-kicker">Largest exposures</p>
            <h3>Customer balances</h3>
          </div>
        </div>
        <div className="fin-exposure-list">
          {customers.slice(0, 8).map((customer, index) => (
            <button
              type="button"
              key={customer.customer_name}
              className={selectedCustomer === customer.customer_name ? "is-active" : ""}
              aria-pressed={selectedCustomer === customer.customer_name}
              onClick={() => setSelectedCustomer((current) => current === customer.customer_name ? null : customer.customer_name)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{customer.customer_name}</strong>
              <b>{formatMoney(customer.open_amount)}</b>
              <small>{customer.invoice_count} {customer.invoice_count === 1 ? "invoice" : "invoices"} · {formatMoney(customer.overdue_amount)} overdue</small>
            </button>
          ))}
        </div>
        {selectedCustomer ? (
          <div className="fin-exposure-detail" aria-live="polite">
            <p className="fin-kicker">{selectedCustomer}</p>
            {selectedInvoices.length ? (
              selectedInvoices.slice(0, 6).map((invoice) => (
                <div key={`${invoice.reference_number}-${invoice.due_date}`}>
                  <span>{invoice.reference_number || "No reference"} · due {invoice.due_date || "unavailable"}</span>
                  <strong>{formatMoney(invoice.open_amount)}</strong>
                </div>
              ))
            ) : (
              <p>Invoice-level rows are not included in the current safe preview.</p>
            )}
          </div>
        ) : null}
      </section>
      {payments.length ? (
        <section className="fin-drilldown-section">
          <div className="fin-drilldown-section-title">
            <span>03</span>
            <div>
              <p className="fin-kicker">Recent activity</p>
              <h3>Applied payments</h3>
            </div>
          </div>
          <div className="fin-compact-list">
            {payments.slice(0, 5).map((payment, index) => (
              <div key={`${payment.payment_date}-${index}`}>
                <span>{String(payment.customer_name || "Customer")} · {String(payment.payment_date || "Date unavailable")}</span>
                <strong>{formatMoney(Number(payment.applied_amount))}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <InsightList insights={buildArInsights(ar)} />
      <DeeperLink label="View full receivables" tab="ar" onNavigate={onNavigate} />
    </FinanceDrilldown>
  );
}

function ApDrilldown({
  data,
  onClose,
  onNavigate,
}: {
  data: DrilldownData;
  onClose: () => void;
  onNavigate: (tab: FinanceTab) => void;
}) {
  const ap = data.ap || {};
  const total = (ap.total || {}) as FinanceMetric;
  const overdue = (ap.overdue || {}) as FinanceMetric;
  const due = (ap.due || {}) as FinanceMetric;
  const aging = (ap.aging || {}) as {
    state?: string;
    due_date_coverage?: number;
    buckets?: Record<string, number | null>;
  };
  const vendors = (ap.vendors || []) as Array<{
    vendor_name: string;
    open_amount: number;
    overdue_amount: number;
  }>;
  const bills = (ap.bills || []) as Array<{
    vendor_name: string;
    reference_number?: string;
    due_date?: string;
    open_amount?: number;
    is_paid?: boolean;
  }>;
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const selectedBills = bills.filter((bill) => bill.vendor_name === selectedVendor);
  return (
    <FinanceDrilldown
      index="06"
      kicker="Payables / DueDate"
      title="Payables, by exposure."
      period={formatYmdUtc(String(ap.as_of || ""))}
      value={formatMoney(total.value)}
      valueLabel="Open A/P"
      lead="Vendor concentration and bill state are shown from governed A/P facts, without payment recommendations."
      onClose={onClose}
    >
      <div className="fin-drilldown-metric-grid">
        <SupportingMetric label="Past due" value={overdue.value} />
        <SupportingMetric label="Due within 7 days" value={due.value} />
        <SupportingMetric label="Top five concentration" value={concentrationShare(vendors, total.value, 5)} format="pct" />
        <SupportingMetric label="DueDate coverage" value={aging.due_date_coverage == null ? null : aging.due_date_coverage * 100} format="pct" />
      </div>
      {aging.state === "available" ? (
        <section className="fin-drilldown-section">
          <div className="fin-drilldown-section-title">
            <span>01</span>
            <div>
              <p className="fin-kicker">Aging composition</p>
              <h3>Where open payables sit</h3>
            </div>
          </div>
          <div className="fin-aging-composition">
            {agingRowsFromBuckets(aging.buckets).map((row) => (
              <div key={row.key}>
                <span>{row.label}</span>
                <strong>{formatMoney(row.amount)}</strong>
                <i style={{ width: `${total.value && row.amount != null ? Math.max(1, (row.amount / total.value) * 100) : 0}%` }} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="fin-drilldown-section">
        <div className="fin-drilldown-section-title">
          <span>02</span>
          <div>
            <p className="fin-kicker">Largest exposures</p>
            <h3>Vendor balances</h3>
          </div>
        </div>
        <div className="fin-exposure-list">
          {vendors.slice(0, 8).map((vendor, index) => (
            <button
              type="button"
              key={vendor.vendor_name}
              className={selectedVendor === vendor.vendor_name ? "is-active" : ""}
              aria-pressed={selectedVendor === vendor.vendor_name}
              onClick={() => setSelectedVendor((current) => current === vendor.vendor_name ? null : vendor.vendor_name)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{vendor.vendor_name}</strong>
              <b>{formatMoney(vendor.open_amount)}</b>
              <small>{formatMoney(vendor.overdue_amount)} overdue</small>
            </button>
          ))}
        </div>
        {selectedVendor ? (
          <div className="fin-exposure-detail" aria-live="polite">
            <p className="fin-kicker">{selectedVendor}</p>
            {selectedBills.length ? selectedBills.slice(0, 6).map((bill, index) => (
              <div key={`${bill.reference_number}-${index}`}>
                <span>{bill.reference_number || "No reference"} · due {bill.due_date || "unavailable"} · {bill.is_paid ? "Paid" : "Open"}</span>
                <strong>{formatMoney(bill.open_amount)}</strong>
              </div>
            )) : <p>Bill-level rows are not included in the current safe preview.</p>}
          </div>
        ) : null}
      </section>
      <InsightList insights={buildApInsights(ap)} />
      <DeeperLink label="View full payables" tab="ap" onNavigate={onNavigate} />
    </FinanceDrilldown>
  );
}

function CashDrilldown({
  data,
  onClose,
  onNavigate,
}: {
  data: DrilldownData;
  onClose: () => void;
  onNavigate: (tab: FinanceTab) => void;
}) {
  const cash = data.cash || {};
  const position = (cash.position || {}) as FinanceMetric;
  const roles = (cash.by_event_role || []) as Array<{ event_role: string; amount: number | null; count: number }>;
  const checks = (cash.recent_checks || []) as Array<{
    payee_name?: string;
    txn_date?: string;
    reference_number?: string;
    amount?: number | null;
  }>;
  return (
    <FinanceDrilldown
      index="07"
      kicker="Accounting cash / QuickBooks"
      title="Cash roles, kept distinct."
      value={formatMoney(position.value)}
      valueLabel="QuickBooks accounting cash"
      lead="Accounting cash is the sum of Bank-type QuickBooks account balances. It is not a real-time bank-feed balance."
      onClose={onClose}
    >
      <div className="fin-cash-warning">
        <span>Do not add</span>
        <strong>Customer receipts + bank deposits</strong>
        <p>{String((cash.anti_double_count as { notes?: string } | undefined)?.notes || "")}</p>
      </div>
      <div className="fin-drilldown-metric-grid cash">
        {roles
          .filter((role) => ["customer_receipt", "bank_deposit", "bank_disbursement", "transfer"].includes(role.event_role))
          .map((role) => (
            <div className="fin-drilldown-metric" key={role.event_role}>
              <span>{cashEventRoleLabel(role.event_role)}</span>
              <strong>{formatMoney(role.amount)}</strong>
              <small>{role.count} events</small>
            </div>
          ))}
      </div>
      {checks.length ? (
        <section className="fin-drilldown-section">
          <div className="fin-drilldown-section-title">
            <span>01</span>
            <div>
              <p className="fin-kicker">Recent checks</p>
              <h3>Safely available disbursement detail</h3>
            </div>
          </div>
          <div className="fin-compact-list">
            {checks.slice(0, 8).map((check, index) => (
              <div key={`${check.reference_number}-${index}`}>
                <span>{check.payee_name || "Payee unavailable"} · {check.txn_date || "Date unavailable"} · {check.reference_number || "No ref"}</span>
                <strong>{formatMoney(check.amount)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <DeeperLink label="View Cash" tab="cash" onNavigate={onNavigate} />
    </FinanceDrilldown>
  );
}

function BalanceSheetDrilldown({
  data,
  onClose,
  onNavigate,
}: {
  data: DrilldownData;
  onClose: () => void;
  onNavigate: (tab: FinanceTab) => void;
}) {
  const bs = data.bs || {};
  const totals = (bs.totals || {}) as {
    total_assets?: number | null;
    total_liabilities_and_equity?: number | null;
  };
  const identity = (bs.identity || {}) as {
    status?: string;
    delta?: number | null;
    tolerance_abs?: number | null;
  };
  const snapshot = (bs.snapshot || {}) as { as_of_date?: string; report_basis?: string };
  const opening = (bs.opening || {}) as { as_of_date?: string };
  return (
    <FinanceDrilldown
      index="08"
      kicker="Statement trust / Accrual"
      title="The statement balances."
      period={formatYmdUtc(snapshot.as_of_date)}
      value={statusLabel(identity.status)}
      valueLabel="Balance Sheet identity"
      lead="Assets and Liabilities + Equity come from the same stored QuickBooks Accrual statement snapshot."
      onClose={onClose}
    >
      <section className="fin-trust-equation" aria-label="Balance Sheet identity">
        <div>
          <span>Assets</span>
          <strong>{formatMoney(totals.total_assets)}</strong>
        </div>
        <i aria-hidden="true">=</i>
        <div>
          <span>Liabilities + Equity</span>
          <strong>{formatMoney(totals.total_liabilities_and_equity)}</strong>
        </div>
      </section>
      <div className="fin-trust-result">
        <div>
          <span>Difference</span>
          <strong>{formatMoney(identity.delta)}</strong>
        </div>
        <div>
          <span>Result</span>
          <strong className={identity.status === "pass" ? "is-pass" : ""}>{statusLabel(identity.status)}</strong>
        </div>
      </div>
      <div className="fin-drilldown-metric-grid">
        <div className="fin-drilldown-metric">
          <span>Statement date</span>
          <strong>{formatYmdUtc(snapshot.as_of_date) || "Unavailable"}</strong>
        </div>
        <div className="fin-drilldown-metric">
          <span>Report basis</span>
          <strong>{String(snapshot.report_basis || bs.report_basis || "Accrual")}</strong>
        </div>
        <div className="fin-drilldown-metric">
          <span>Opening reference</span>
          <strong>{formatYmdUtc(opening.as_of_date) || "Unavailable"}</strong>
        </div>
        <SupportingMetric label="Reconciliation tolerance" value={identity.tolerance_abs} />
      </div>
      <DeeperLink label="View full Balance Sheet" tab="balance-sheet" onNavigate={onNavigate} />
    </FinanceDrilldown>
  );
}

export default function FinanceDrilldownContent({
  kind,
  overview,
  data,
  loading,
  error,
  onClose,
  onNavigate,
}: Props) {
  const fallbackMetric = useMemo(() => {
    const key = kind === "gross_margin" ? "gross_margin_pct" : kind === "cash" ? "cash" : kind === "ar" ? "open_ar" : kind === "ap" ? "open_ap" : kind;
    return metric(overview, key);
  }, [kind, overview]);
  const fallbackLabel = kind === "balance_sheet" ? "Balance Sheet identity" : fallbackMetric?.label || "Finance detail";
  if (loading || error || !data) {
    return (
      <FinanceDrilldown
        index="—"
        kicker="Governed Finance detail"
        title={fallbackLabel}
        period={formatPeriodCaption(fallbackMetric)}
        value={fallbackMetric?.key?.includes("pct") ? formatPct(fallbackMetric.value) : formatMoney(fallbackMetric?.value)}
        valueLabel="Selected fact"
        onClose={onClose}
      >
        <LoadingBody error={error} />
      </FinanceDrilldown>
    );
  }
  if (kind === "revenue" || kind === "gross_profit" || kind === "gross_margin" || kind === "net_income") {
    return <PnlDrilldown kind={kind} overview={overview} data={data} onClose={onClose} onNavigate={onNavigate} />;
  }
  if (kind === "ar") return <ArDrilldown overview={overview} data={data} onClose={onClose} onNavigate={onNavigate} />;
  if (kind === "ap") return <ApDrilldown data={data} onClose={onClose} onNavigate={onNavigate} />;
  if (kind === "cash") return <CashDrilldown data={data} onClose={onClose} onNavigate={onNavigate} />;
  return <BalanceSheetDrilldown data={data} onClose={onClose} onNavigate={onNavigate} />;
}
