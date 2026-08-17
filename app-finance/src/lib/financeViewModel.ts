export type MetricState = "available" | "unavailable" | "stale" | "warning";

export type FinanceMetric = {
  key: string;
  label: string;
  value: number | null;
  state: MetricState;
  source?: string | null;
  as_of?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  is_derived?: boolean;
  preset?: string | null;
  notes?: string | null;
};

export type FinanceTab =
  | "overview"
  | "pnl"
  | "balance-sheet"
  | "ar"
  | "ap"
  | "cash"
  | "reconciliation";

export const FINANCE_TABS: { id: FinanceTab; index: string; label: string }[] = [
  { id: "overview", index: "01", label: "Overview" },
  { id: "pnl", index: "02", label: "P&L" },
  { id: "balance-sheet", index: "03", label: "Balance Sheet" },
  { id: "ar", index: "04", label: "A/R" },
  { id: "ap", index: "05", label: "A/P" },
  { id: "cash", index: "06", label: "Cash" },
  { id: "reconciliation", index: "07", label: "Reconciliation" },
];

export function isFinanceTab(value: string): value is FinanceTab {
  return FINANCE_TABS.some((t) => t.id === value);
}

export function metricDisplayValue(metric: FinanceMetric | null | undefined): "unavailable" | "zero" | "value" {
  if (!metric || metric.value == null || metric.state === "unavailable") return "unavailable";
  if (metric.value === 0) return "zero";
  return "value";
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `(${formatted})` : formatted;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function statusLabel(state: string | null | undefined): string {
  const s = String(state || "").toLowerCase();
  if (s === "pass") return "Pass";
  if (s === "available" || s === "success" || s === "fresh") return "Fresh";
  if (s === "fresh_nightly") return "Fresh · nightly";
  if (s === "warn" || s === "warning" || s === "partial") return "Warning";
  if (s === "fail" || s === "failed") return "Fail";
  if (s === "stale") return "Stale";
  if (s === "unavailable" || s === "missing") return "Unavailable";
  return state ? String(state) : "Unknown";
}

export const FINANCE_DOMAIN_DISPLAY_ORDER = [
  "revenue_ar",
  "ap",
  "cash",
  "accounting",
  "master",
] as const;

export function financeDomainLabel(domain: string | null | undefined): string {
  const d = String(domain || "");
  if (d === "revenue_ar") return "Revenue / A/R";
  if (d === "ap") return "A/P";
  if (d === "cash") return "Cash";
  if (d === "accounting") return "Accounting";
  if (d === "master") return "Master";
  return d.replace(/_/g, " ") || "Domain";
}

export function domainPresentationLabel(domain: {
  presentation?: string | null;
  state?: string | null;
  cadence?: string | null;
} | null | undefined): string {
  const presentation = String(domain?.presentation || "").toLowerCase();
  if (presentation === "fresh_nightly") return "Fresh · nightly";
  if (presentation === "fresh") return "Fresh";
  if (presentation === "stale") return "Stale";
  if (presentation === "warning") return "Warning";
  if (presentation === "unavailable") return "Unavailable";
  const state = String(domain?.state || "").toLowerCase();
  if (state === "available" && domain?.cadence === "nightly") return "Fresh · nightly";
  return statusLabel(domain?.state);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatYmdUtc(value: string | null | undefined): string | null {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatPeriodRange(start: string | null | undefined, end: string | null | undefined): string | null {
  const a = formatYmdUtc(start);
  const b = formatYmdUtc(end);
  if (!a || !b) return null;
  const startYear = String(start).slice(0, 4);
  const endYear = String(end).slice(0, 4);
  if (startYear === endYear) {
    const [y, m, d] = String(start).split("-").map(Number);
    return `${MONTHS[m - 1]} ${d} – ${formatYmdUtc(end)}`;
  }
  return `${a} – ${b}`;
}

export function formatPeriodCaption(opts: {
  period_start?: string | null;
  period_end?: string | null;
  is_derived?: boolean;
  preset?: string | null;
} | null | undefined): string | null {
  if (!opts) return null;
  const range = formatPeriodRange(opts.period_start, opts.period_end);
  if (!range) return null;
  const preset = String(opts.preset || "").toLowerCase();
  if (opts.is_derived || preset === "ytd" || preset === "prior_ytd") {
    return `YTD · ${range}`;
  }
  return range;
}

export const CASH_EVENT_ROLE_LABELS: Record<string, string> = {
  customer_receipt: "Customer receipts",
  bank_deposit: "Bank deposits",
  bank_deposit_line: "Bank deposit lines",
  bank_disbursement: "Checks / disbursements",
  transfer: "Transfers",
  undeposited_queue: "Undeposited queue",
};

export function cashEventRoleLabel(role: string | null | undefined): string {
  const key = String(role || "");
  return CASH_EVENT_ROLE_LABELS[key] || key.replace(/_/g, " ");
}

export const AR_AGING_BUCKETS: { key: string; label: string; omitIfZero?: boolean }[] = [
  { key: "current", label: "Current" },
  { key: "days_1_30", label: "1–30" },
  { key: "days_31_60", label: "31–60" },
  { key: "days_61_90", label: "61–90" },
  { key: "days_90_plus", label: "90+" },
  { key: "unknown", label: "Unknown", omitIfZero: true },
];

export function agingRowsFromBuckets(buckets: Record<string, number | null> | null | undefined): {
  key: string;
  label: string;
  amount: number | null;
}[] {
  if (!buckets || typeof buckets !== "object") return [];
  return AR_AGING_BUCKETS.filter((b) => Object.prototype.hasOwnProperty.call(buckets, b.key))
    .filter((b) => !b.omitIfZero || Number(buckets[b.key]) !== 0)
    .map((b) => ({ key: b.key, label: b.label, amount: buckets[b.key] ?? null }));
}
