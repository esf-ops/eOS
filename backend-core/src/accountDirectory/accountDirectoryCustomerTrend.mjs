/**
 * Customer-level monthly series from prepared Sales QuickBooks transactions.
 * Exact qb_root_customer_list_id linkage only. Never interpolates A/R history.
 */

const SERIES_TYPES = Object.freeze({
  invoice: "invoiced",
  payment: "collected",
  sales_order: "sales_orders",
  estimate: "quoted"
});

export const TREND_PERIODS = Object.freeze(["trailing_12", "ytd", "2025", "2026"]);

function toYmd(value) {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function emptyMonthPoint(month) {
  return {
    month,
    invoiced: 0,
    collected: 0,
    sales_orders: 0,
    quoted: 0,
    invoice_count: 0,
    payment_count: 0,
    sales_order_count: 0,
    quote_count: 0
  };
}

/**
 * @param {string} period
 * @param {string|null} asOfDate
 * @param {string|null} coverageStart
 * @param {string|null} coverageEnd
 */
export function resolveCustomerTrendWindow(period, asOfDate, coverageStart, coverageEnd) {
  const asOf = toYmd(asOfDate);
  const covStart = toYmd(coverageStart);
  const covEnd = toYmd(coverageEnd) || asOf;
  const requested = String(period || "trailing_12").trim();
  const key = TREND_PERIODS.includes(requested) ? requested : "trailing_12";

  if (!asOf && !covEnd) {
    return {
      ok: false,
      period: key,
      start: null,
      end: null,
      notes: "Customer trend is unavailable until QuickBooks coverage dates are known."
    };
  }

  const end = covEnd || asOf;
  let start = null;
  if (key === "ytd") {
    start = `${String(end).slice(0, 4)}-01-01`;
  } else if (key === "2025") {
    start = "2025-01-01";
  } else if (key === "2026") {
    start = "2026-01-01";
  } else {
    const d = new Date(`${end}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() - 11);
    start = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }

  let windowEnd = end;
  if (key === "2025") windowEnd = "2025-12-31";
  if (key === "2026") windowEnd = "2026-12-31";

  const clippedStart = covStart && start < covStart ? covStart : start;
  const clippedEnd = windowEnd > end ? end : windowEnd;

  if (!clippedStart || !clippedEnd || clippedStart > clippedEnd) {
    return {
      ok: false,
      period: key,
      start: clippedStart,
      end: clippedEnd,
      notes: "No activity is available for this period yet."
    };
  }

  const notes = [];
  if (covStart && start < covStart) {
    notes.push(`Coverage begins ${covStart}; earlier months are omitted.`);
  }
  if (key === "2025" && end < "2025-01-01") {
    return {
      ok: false,
      period: key,
      start: clippedStart,
      end: clippedEnd,
      notes: "2025 is outside stored QuickBooks coverage."
    };
  }
  if (key === "2026" && end < "2026-01-01") {
    return {
      ok: false,
      period: key,
      start: clippedStart,
      end: clippedEnd,
      notes: "2026 is outside stored QuickBooks coverage."
    };
  }

  return {
    ok: true,
    period: key,
    start: clippedStart.slice(0, 7) + "-01",
    end: clippedEnd,
    notes: notes.join(" ") || null
  };
}

export function monthKeysInclusive(startYmd, endYmd) {
  const start = toYmd(startYmd);
  const end = toYmd(endYmd);
  if (!start || !end) return [];
  const keys = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endY = Number(end.slice(0, 4));
  const endM = Number(end.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

/**
 * @param {Array<{ transaction_type?: string, transaction_date?: string, amount?: unknown }>} rows
 * @param {string[]} monthKeys
 */
export function buildCustomerMonthlyPoints(rows, monthKeys) {
  /** @type {Map<string, ReturnType<typeof emptyMonthPoint>>} */
  const byMonth = new Map(monthKeys.map((month) => [month, emptyMonthPoint(month)]));
  for (const row of rows || []) {
    const date = toYmd(row.transaction_date);
    if (!date) continue;
    const month = date.slice(0, 7);
    const point = byMonth.get(month);
    if (!point) continue;
    const series = SERIES_TYPES[row.transaction_type];
    const amount = toMoney(row.amount);
    if (!series || amount == null) continue;
    point[series] = Math.round((Number(point[series]) + amount) * 100) / 100;
    if (row.transaction_type === "invoice") point.invoice_count += 1;
    if (row.transaction_type === "payment") point.payment_count += 1;
    if (row.transaction_type === "sales_order") point.sales_order_count += 1;
    if (row.transaction_type === "estimate") point.quote_count += 1;
  }
  return monthKeys.map((month) => byMonth.get(month));
}

export function mapOpenInvoiceRow(row, asOfDate) {
  const due = toYmd(row?.due_date);
  const asOf = toYmd(asOfDate);
  let daysOverdue = null;
  let status = "open";
  if (!due || !asOf) status = "unknown_due";
  else if (due >= asOf) status = "current";
  else {
    status = "overdue";
    const t0 = Date.parse(`${due}T00:00:00.000Z`);
    const t1 = Date.parse(`${asOf}T00:00:00.000Z`);
    daysOverdue = Math.max(0, Math.floor((t1 - t0) / 86400000));
  }
  return {
    invoice_date: toYmd(row?.invoice_date),
    due_date: due,
    reference_number: row?.reference_number ? String(row.reference_number) : null,
    original_amount: toMoney(row?.original_amount),
    open_amount: toMoney(row?.balance),
    days_overdue: daysOverdue,
    status,
    customer_name: row?.customer_name ? String(row.customer_name) : null
  };
}
