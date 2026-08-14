import assert from "node:assert/strict";

function metricDisplayValue(metric) {
  if (!metric || metric.value == null || metric.state === "unavailable") return "unavailable";
  if (metric.value === 0) return "zero";
  return "value";
}

function formatMoney(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `(${formatted})` : formatted;
}

assert.equal(metricDisplayValue({ value: null, state: "unavailable" }), "unavailable");
assert.equal(metricDisplayValue({ value: 0, state: "available" }), "zero");
assert.equal(metricDisplayValue({ value: 12, state: "available" }), "value");
assert.equal(formatMoney(null), "—");
assert.equal(formatMoney(-1500), "($1,500.00)");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatYmdUtc(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function formatPeriodRange(start, end) {
  const a = formatYmdUtc(start);
  const b = formatYmdUtc(end);
  if (!a || !b) return null;
  const startYear = String(start).slice(0, 4);
  const endYear = String(end).slice(0, 4);
  if (startYear === endYear) {
    const [, m, d] = String(start).split("-").map(Number);
    return `${MONTHS[m - 1]} ${d} – ${formatYmdUtc(end)}`;
  }
  return `${a} – ${b}`;
}
function formatPeriodCaption(opts) {
  if (!opts) return null;
  const range = formatPeriodRange(opts.period_start, opts.period_end);
  if (!range) return null;
  const preset = String(opts.preset || "").toLowerCase();
  if (opts.is_derived || preset === "ytd" || preset === "prior_ytd") return `YTD · ${range}`;
  return range;
}
const CASH_EVENT_ROLE_LABELS = {
  customer_receipt: "Customer receipts",
  bank_deposit: "Bank deposits",
  bank_disbursement: "Checks / disbursements",
  transfer: "Transfers",
};
function cashEventRoleLabel(role) {
  return CASH_EVENT_ROLE_LABELS[role] || String(role || "").replace(/_/g, " ");
}
const AR_AGING_BUCKETS = [
  { key: "current", label: "Current" },
  { key: "days_1_30", label: "1–30" },
  { key: "days_31_60", label: "31–60" },
  { key: "days_61_90", label: "61–90" },
  { key: "days_90_plus", label: "90+" },
  { key: "unknown", label: "Unknown", omitIfZero: true },
];
function agingRowsFromBuckets(buckets) {
  if (!buckets || typeof buckets !== "object") return [];
  return AR_AGING_BUCKETS.filter((b) => Object.prototype.hasOwnProperty.call(buckets, b.key))
    .filter((b) => !b.omitIfZero || Number(buckets[b.key]) !== 0)
    .map((b) => ({ key: b.key, label: b.label, amount: buckets[b.key] ?? null }));
}

assert.equal(formatPeriodCaption({ period_start: "2026-01-01", period_end: "2026-08-14", is_derived: true }), "YTD · Jan 1 – Aug 14, 2026");
assert.equal(formatPeriodCaption({ period_start: "2026-08-01", period_end: "2026-08-14", preset: "current_month" }), "Aug 1 – Aug 14, 2026");
assert.equal(cashEventRoleLabel("customer_receipt"), "Customer receipts");
assert.equal(cashEventRoleLabel("bank_disbursement"), "Checks / disbursements");
assert.equal(cashEventRoleLabel("bank_deposit"), "Bank deposits");
assert.deepEqual(
  agingRowsFromBuckets({ current: 10, days_1_30: 0, days_31_60: 2, days_61_90: 0, days_90_plus: 4, unknown: 0 }).map((r) => r.key),
  ["current", "days_1_30", "days_31_60", "days_61_90", "days_90_plus"]
);
assert.deepEqual(
  agingRowsFromBuckets({ current: 1, unknown: 5 }).map((r) => r.key),
  ["current", "unknown"]
);

const fixture = {
  metrics: {
    revenue: { value: null, state: "unavailable" },
    open_ar: { value: 0, state: "available" },
  },
};
assert.equal(metricDisplayValue(fixture.metrics.revenue), "unavailable");
assert.notEqual(fixture.metrics.revenue.value, 0);
assert.equal(metricDisplayValue(fixture.metrics.open_ar), "zero");

console.log("financeViewModel.test.mjs: ok");
