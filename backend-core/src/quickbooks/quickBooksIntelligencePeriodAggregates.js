/**
 * quickBooksIntelligencePeriodAggregates — Phase 4F date-scoped aggregates.
 *
 * Filters sanitized facts by txn_date (or due_date for AR) and builds
 * leadership-friendly period summaries. Never includes raw_payload or PII.
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import {
  buildCustomerRevenueSummary,
  buildEstimateSalesOrderInvoiceFlow,
  buildInvoiceAgingSummary,
  buildPaymentHistorySummary,
} from "./quickBooksIntelligenceRead.js";
import { buildAllQuickBooksInsights, flattenInsightList } from "./quickBooksIntelligenceInsights.js";
import {
  isDateInInclusiveRange,
  listMonthsInRange,
  resolveIntelligencePeriod,
} from "./quickBooksIntelligencePeriod.js";

// Re-export money helper locally (Read does not export moneyOrZero).
function moneyOrZero(n) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Default priority insight cap for executive UI. */
export const QB_INTEL_PRIORITY_INSIGHT_LIMIT = 10;

/** Max items shown per insight group. */
export const QB_INTEL_INSIGHT_GROUP_ITEM_LIMIT = 3;

/** Max rows in top customer / leakage lists. */
export const QB_INTEL_TOP_LIST_LIMIT = 10;

/**
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {{ date_from: string, date_to: string }} period
 */
export function filterDatasetByTxnPeriod(dataset, period) {
  const { date_from, date_to } = period;
  return {
    ...dataset,
    invoices: (dataset.invoices ?? []).filter((r) =>
      isDateInInclusiveRange(r.txn_date, date_from, date_to),
    ),
    payments: (dataset.payments ?? []).filter((r) =>
      isDateInInclusiveRange(r.txn_date, date_from, date_to),
    ),
    estimates: (dataset.estimates ?? []).filter((r) =>
      isDateInInclusiveRange(r.txn_date, date_from, date_to),
    ),
    salesOrders: (dataset.salesOrders ?? []).filter((r) =>
      isDateInInclusiveRange(r.txn_date, date_from, date_to),
    ),
  };
}

/**
 * @param {Array<{ txn_date?: string|null, total_amount?: number|null, [k: string]: unknown }>} rows
 * @param {"newest"|"amount_desc"|"risk_desc"} sort
 * @param {(row: object) => number} [riskScore]
 */
export function sortTxnRows(rows, sort, riskScore) {
  const list = [...rows];
  if (sort === "newest") {
    list.sort(
      (a, b) =>
        String(b.txn_date ?? "").localeCompare(String(a.txn_date ?? "")) ||
        moneyOrZero(b.total_amount) - moneyOrZero(a.total_amount),
    );
  } else if (sort === "risk_desc" && typeof riskScore === "function") {
    list.sort(
      (a, b) =>
        riskScore(b) - riskScore(a) ||
        moneyOrZero(b.total_amount ?? b.balance_remaining) -
          moneyOrZero(a.total_amount ?? a.balance_remaining),
    );
  } else {
    list.sort(
      (a, b) =>
        moneyOrZero(b.total_amount ?? b.billed_total ?? b.payment_total ?? b.balance_remaining) -
          moneyOrZero(a.total_amount ?? a.billed_total ?? a.payment_total ?? a.balance_remaining) ||
        String(a.qb_customer_list_id ?? a.qb_txn_id ?? "").localeCompare(
          String(b.qb_customer_list_id ?? b.qb_txn_id ?? ""),
        ),
    );
  }
  return list;
}

/**
 * Month-by-month trend within the selected period.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} periodDataset
 * @param {{ date_from: string, date_to: string }} period
 */
export function buildPeriodMonthlyTrend(periodDataset, period) {
  /** @type {Map<string, {
   *   month: string,
   *   invoice_count: number,
   *   invoice_total: number,
   *   payment_count: number,
   *   payment_total: number,
   *   estimate_count: number,
   *   estimate_total: number,
   * }>} */
  const byMonth = new Map();
  for (const month of listMonthsInRange(period.date_from, period.date_to)) {
    byMonth.set(month, {
      month,
      invoice_count: 0,
      invoice_total: 0,
      payment_count: 0,
      payment_total: 0,
      estimate_count: 0,
      estimate_total: 0,
    });
  }

  for (const inv of periodDataset.invoices ?? []) {
    const m = typeof inv.txn_date === "string" ? inv.txn_date.slice(0, 7) : null;
    if (!m || !byMonth.has(m)) continue;
    const row = byMonth.get(m);
    row.invoice_count += 1;
    row.invoice_total += moneyOrZero(inv.total_amount);
  }
  for (const pay of periodDataset.payments ?? []) {
    const m = typeof pay.txn_date === "string" ? pay.txn_date.slice(0, 7) : null;
    if (!m || !byMonth.has(m)) continue;
    const row = byMonth.get(m);
    row.payment_count += 1;
    row.payment_total += moneyOrZero(pay.total_amount);
  }
  for (const est of periodDataset.estimates ?? []) {
    const m = typeof est.txn_date === "string" ? est.txn_date.slice(0, 7) : null;
    if (!m || !byMonth.has(m)) continue;
    const row = byMonth.get(m);
    row.estimate_count += 1;
    row.estimate_total += moneyOrZero(est.total_amount);
  }

  return [...byMonth.values()];
}

/**
 * Group flattened insights by type and cap noise.
 *
 * @param {ReturnType<typeof flattenInsightList>} insightList
 * @param {number} [priorityLimit]
 * @param {number} [perGroupLimit]
 */
export function groupAndCapInsights(
  insightList,
  priorityLimit = QB_INTEL_PRIORITY_INSIGHT_LIMIT,
  perGroupLimit = QB_INTEL_INSIGHT_GROUP_ITEM_LIMIT,
) {
  const priority = insightList.slice(0, priorityLimit);
  /** @type {Map<string, { insight: string, count: number, items: object[] }>} */
  const groups = new Map();
  for (const item of insightList) {
    const key = String(item.insight ?? "unknown");
    let g = groups.get(key);
    if (!g) {
      g = { insight: key, count: 0, items: [] };
      groups.set(key, g);
    }
    g.count += 1;
    if (g.items.length < perGroupLimit) g.items.push(item);
  }
  const insight_groups = [...groups.values()].sort((a, b) => b.count - a.count || a.insight.localeCompare(b.insight));
  return { priority_insights: priority, insight_groups };
}

/**
 * Build period-scoped executive aggregates from a sanitized dataset.
 *
 * AR aging uses the full (sample) dataset as of `period.as_of`.
 * Revenue / cash / estimates / SO / trend use txn_date within [date_from, date_to].
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {ReturnType<typeof resolveIntelligencePeriod>} period
 * @param {{
 *   isPartial?: boolean,
 *   maxRows?: number|null,
 *   pageSize?: number|null,
 *   insightListLimit?: number,
 *   insightOpts?: object,
 *   topListLimit?: number,
 * }} [opts]
 */
export function buildPeriodScopedIntelligence(dataset, period, opts = {}) {
  const asOfDataset = { ...dataset, asOfDate: period.as_of };
  const periodDataset = {
    ...filterDatasetByTxnPeriod(dataset, period),
    asOfDate: period.as_of,
  };

  const revenue = buildCustomerRevenueSummary(periodDataset);
  const payments = buildPaymentHistorySummary(periodDataset);
  const flow = buildEstimateSalesOrderInvoiceFlow(periodDataset);
  const ar = buildInvoiceAgingSummary(asOfDataset);
  const monthly = buildPeriodMonthlyTrend(periodDataset, period);

  const topLimit = opts.topListLimit ?? QB_INTEL_TOP_LIST_LIMIT;
  const sort = period.sort;

  const topRevenueCustomers = sortTxnRows(revenue.customers, sort === "newest" ? "amount_desc" : sort)
    .slice(0, topLimit)
    .map((c, i) => ({
      rank: i + 1,
      qb_customer_list_id: c.qb_customer_list_id,
      invoice_count: c.invoice_count,
      billed_total: c.billed_total,
      open_balance_total: c.open_balance_total,
      last_invoice_date: c.last_invoice_date,
    }));

  const openArCustomers = sortTxnRows(
    revenue.customers.filter((c) => moneyOrZero(c.open_balance_total) > 0),
    sort === "newest" ? "risk_desc" : sort,
    (row) => moneyOrZero(row.open_balance_total),
  )
    .slice(0, topLimit)
    .map((c, i) => ({
      rank: i + 1,
      qb_customer_list_id: c.qb_customer_list_id,
      open_balance_total: c.open_balance_total,
      open_invoice_count: c.open_invoice_count,
      billed_total: c.billed_total,
    }));

  // Open AR from full as-of dataset (not period-filtered revenue).
  const asOfRevenue = buildCustomerRevenueSummary(asOfDataset);
  const topOpenArCustomers = sortTxnRows(
    asOfRevenue.customers.filter((c) => moneyOrZero(c.open_balance_total) > 0),
    "risk_desc",
    (row) => moneyOrZero(row.open_balance_total),
  )
    .slice(0, topLimit)
    .map((c, i) => ({
      rank: i + 1,
      qb_customer_list_id: c.qb_customer_list_id,
      open_balance_total: c.open_balance_total,
      open_invoice_count: c.open_invoice_count,
    }));

  const topPaymentCustomers = sortTxnRows(
    payments.customers,
    sort === "newest" ? "amount_desc" : sort === "risk_desc" ? "amount_desc" : sort,
  )
    .slice(0, topLimit)
    .map((c, i) => ({
      rank: i + 1,
      qb_customer_list_id: c.qb_customer_list_id,
      payment_count: c.payment_count,
      payment_total: c.payment_total,
      avg_days_to_pay: c.avg_days_to_pay,
      last_payment_date: c.last_payment_date,
    }));

  const insightLimit = opts.insightListLimit ?? QB_INTEL_PRIORITY_INSIGHT_LIMIT;
  const insights = buildAllQuickBooksInsights(periodDataset, {
    ...(opts.insightOpts ?? {}),
    overdueArRisks: { limit: 15, ...(opts.insightOpts?.overdueArRisks ?? {}) },
    estimateToInvoiceLeakage: { limit: 15, ...(opts.insightOpts?.estimateToInvoiceLeakage ?? {}) },
    unpaidInvoiceRisk: { limit: 15, ...(opts.insightOpts?.unpaidInvoiceRisk ?? {}) },
    highValueCustomers: { topN: 10, ...(opts.insightOpts?.highValueCustomers ?? {}) },
    slowPayingCustomers: { limit: 10, ...(opts.insightOpts?.slowPayingCustomers ?? {}) },
    dormantCustomers: { limit: 10, ...(opts.insightOpts?.dormantCustomers ?? {}) },
  });
  // AR risk insights should use as-of open invoices.
  const arInsights = buildAllQuickBooksInsights(asOfDataset, {
    overdueArRisks: { limit: 15 },
    unpaidInvoiceRisk: { limit: 15 },
    slowPayingCustomers: { limit: 10 },
    highValueCustomers: { topN: 1 },
    dormantCustomers: { limit: 1 },
    estimateToInvoiceLeakage: { limit: 0 },
  });
  insights.overdue_ar_risks = arInsights.overdue_ar_risks;
  insights.unpaid_invoice_risk = arInsights.unpaid_invoice_risk;

  const flat = flattenInsightList(insights);
  const { priority_insights, insight_groups } = groupAndCapInsights(flat, insightLimit);

  const leakageItems = sortTxnRows(
    (insights.estimate_to_invoice_leakage?.items ?? []).map((item) => ({
      ...item,
      total_amount: item.total_amount,
    })),
    sort === "newest" ? "newest" : "amount_desc",
  ).slice(0, topLimit);

  const estimateCount = flow.estimates.count;
  const linkedCount = flow.estimates.linked_to_invoice_count;
  const conversionRate =
    estimateCount > 0 ? Math.round((linkedCount / estimateCount) * 1000) / 10 : null;

  const period_meta = {
    preset: period.preset,
    date_from: period.date_from,
    date_to: period.date_to,
    as_of: period.as_of,
    sort: period.sort,
    year: period.year,
    is_partial: opts.isPartial === true,
    max_rows: opts.maxRows ?? null,
    page_size: opts.pageSize ?? null,
  };

  const invoice_summary = {
    invoice_count: flow.invoices.count,
    billed_total: flow.invoices.total_amount,
    open_total: revenue.totals.open_balance_total,
    customer_count: revenue.totals.customer_count,
  };

  const payment_summary_period = {
    payment_count: payments.totals.payment_count,
    collected_total: payments.totals.payment_total,
    customer_count: payments.totals.customer_count,
  };

  const estimate_summary = {
    estimate_count: estimateCount,
    estimate_total: flow.estimates.total_amount,
    linked_count: linkedCount,
    unlinked_count: flow.estimates.unlinked_count,
    conversion_rate: conversionRate,
  };

  const sales_order_summary = {
    sales_order_count: flow.sales_orders.count,
    sales_order_total: flow.sales_orders.total_amount,
    linked_count: flow.sales_orders.linked_to_invoice_count,
    unlinked_count: flow.sales_orders.unlinked_count,
  };

  const result = {
    period: period_meta,
    invoice_summary,
    payment_summary_period,
    estimate_summary,
    sales_order_summary,
    ar_summary: ar,
    monthly_trend: monthly,
    top_lists: {
      top_customers_by_revenue: topRevenueCustomers,
      top_open_ar_customers: topOpenArCustomers,
      top_estimate_leakage: leakageItems.map((item, i) => ({
        rank: i + 1,
        qb_txn_id: item.qb_txn_id ?? null,
        qb_customer_list_id: item.qb_customer_list_id ?? null,
        total_amount: moneyOrZero(item.total_amount),
        txn_date: item.txn_date ?? null,
        days_since_estimate: item.days_since_estimate ?? null,
        reason: item.reason ?? null,
      })),
      top_payment_customers: topPaymentCustomers,
    },
    // Backward-compatible aliases used by Phase 4D UI (period-scoped where applicable).
    revenue_summary: {
      ...revenue,
      customers: topRevenueCustomers,
    },
    payment_summary: {
      ...payments,
      customers: topPaymentCustomers,
    },
    estimate_sales_order_invoice_flow: flow,
    customer_activity_trend: {
      asOfDate: period.as_of,
      months: monthly.map((m) => ({
        month: m.month,
        invoice_count: m.invoice_count,
        payment_count: m.payment_count,
        invoice_total: m.invoice_total,
        payment_total: m.payment_total,
        estimate_count: m.estimate_count,
        estimate_total: m.estimate_total,
        active_customer_count: null,
      })),
    },
    insights,
    insight_list: priority_insights,
    insight_groups,
    open_ar_period_customers: openArCustomers,
  };

  assertNoRawPayload(result, "period_scoped_intelligence");
  return result;
}

/**
 * Convenience: resolve period from opts then build aggregates.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {object} [opts]
 * @param {Date} [now]
 */
export function buildPeriodScopedIntelligenceFromOpts(dataset, opts = {}, now = new Date()) {
  const period = resolveIntelligencePeriod(
    {
      preset: opts.preset,
      year: opts.year,
      date_from: opts.dateFrom ?? opts.date_from,
      date_to: opts.dateTo ?? opts.date_to,
      as_of_date: opts.asOfDate ?? opts.as_of_date,
      sort: opts.sort,
    },
    now,
  );
  return {
    period,
    aggregates: buildPeriodScopedIntelligence(dataset, period, {
      isPartial: opts.isPartial,
      maxRows: opts.maxRows,
      pageSize: opts.pageSize,
      insightListLimit: opts.insightListLimit,
      insightOpts: opts.insightOpts,
      topListLimit: opts.topListLimit,
    }),
  };
}
