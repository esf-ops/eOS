/**
 * quickBooksIntelligenceInsights — Phase 4A deterministic insight functions.
 *
 * Pure, rule-based signals over sanitized facts / read models.
 * No AI. Opaque IDs only. No raw_payload, names, addresses, or memos.
 */

import {
  buildCustomerRevenueSummary,
  buildPaymentHistorySummary,
  daysBetween,
  invoiceHasOpenBalance,
} from "./quickBooksIntelligenceRead.js";

/**
 * @param {number|null|undefined} n
 * @returns {number}
 */
function moneyOrZero(n) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Overdue AR risks: open invoices past due date.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {{ minBalance?: number, limit?: number }} [opts]
 */
export function insightOverdueArRisks(dataset, opts = {}) {
  const minBalance = opts.minBalance ?? 0.01;
  const limit = opts.limit ?? 50;

  /** @type {Array<{
   *   qb_txn_id: string,
   *   qb_customer_list_id: string|null,
   *   balance_remaining: number,
   *   days_overdue: number,
   *   due_date: string|null,
   *   txn_date: string|null,
   *   severity: "low"|"medium"|"high",
   * }>} */
  const risks = [];

  for (const inv of dataset.invoices) {
    if (!invoiceHasOpenBalance(inv)) continue;
    const bal = moneyOrZero(inv.balance_remaining);
    if (bal < minBalance) continue;
    const due = inv.due_date ?? inv.txn_date;
    const daysOverdue = daysBetween(due, dataset.asOfDate);
    if (daysOverdue == null || daysOverdue <= 0) continue;

    let severity = "low";
    if (daysOverdue > 90 || bal >= 10_000) severity = "high";
    else if (daysOverdue > 30 || bal >= 2_500) severity = "medium";

    risks.push({
      qb_txn_id: inv.qb_txn_id,
      qb_customer_list_id: inv.qb_customer_list_id,
      balance_remaining: bal,
      days_overdue: daysOverdue,
      due_date: inv.due_date,
      txn_date: inv.txn_date,
      severity,
    });
  }

  risks.sort(
    (a, b) =>
      b.balance_remaining - a.balance_remaining ||
      b.days_overdue - a.days_overdue ||
      a.qb_txn_id.localeCompare(b.qb_txn_id),
  );

  return {
    insight: "overdue_ar_risks",
    asOfDate: dataset.asOfDate,
    count: risks.length,
    balance_total: risks.reduce((s, r) => s + r.balance_remaining, 0),
    items: risks.slice(0, limit),
  };
}

/**
 * Slow-paying customers: high average days-to-pay and/or material overdue AR.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {{ minAvgDaysToPay?: number, minOpenBalance?: number, limit?: number }} [opts]
 */
export function insightSlowPayingCustomers(dataset, opts = {}) {
  const minAvgDaysToPay = opts.minAvgDaysToPay ?? 45;
  const minOpenBalance = opts.minOpenBalance ?? 0;
  const limit = opts.limit ?? 50;

  const payments = buildPaymentHistorySummary(dataset);
  const revenue = buildCustomerRevenueSummary(dataset);
  /** @type {Map<string, typeof revenue.customers[0]>} */
  const revById = new Map(revenue.customers.map((c) => [c.qb_customer_list_id, c]));

  /** @type {Array<{
   *   qb_customer_list_id: string,
   *   avg_days_to_pay: number|null,
   *   open_balance_total: number,
   *   payment_count: number,
   *   reason: string,
   * }>} */
  const items = [];

  for (const pay of payments.customers) {
    const rev = revById.get(pay.qb_customer_list_id);
    const openBal = rev?.open_balance_total ?? 0;
    const avg = pay.avg_days_to_pay;
    if (avg == null || avg < minAvgDaysToPay) continue;
    if (minOpenBalance > 0 && openBal < minOpenBalance) continue;

    items.push({
      qb_customer_list_id: pay.qb_customer_list_id,
      avg_days_to_pay: avg,
      open_balance_total: openBal,
      payment_count: pay.payment_count,
      reason: "high_avg_days_to_pay",
    });
  }

  // Customers with overdue open AR but no usable days-to-pay sample.
  for (const rev of revenue.customers) {
    if (items.some((i) => i.qb_customer_list_id === rev.qb_customer_list_id)) continue;
    if (rev.open_balance_total < Math.max(minOpenBalance, 0.01)) continue;
    const hasOverdue = dataset.invoices.some((inv) => {
      if (inv.qb_customer_list_id !== rev.qb_customer_list_id) return false;
      if (!invoiceHasOpenBalance(inv)) return false;
      const due = inv.due_date ?? inv.txn_date;
      const d = daysBetween(due, dataset.asOfDate);
      return d != null && d > 0;
    });
    if (!hasOverdue) continue;
    items.push({
      qb_customer_list_id: rev.qb_customer_list_id,
      avg_days_to_pay: null,
      open_balance_total: rev.open_balance_total,
      payment_count: 0,
      reason: "overdue_open_balance_no_pay_sample",
    });
  }

  items.sort(
    (a, b) =>
      (b.avg_days_to_pay ?? 0) - (a.avg_days_to_pay ?? 0) ||
      b.open_balance_total - a.open_balance_total ||
      a.qb_customer_list_id.localeCompare(b.qb_customer_list_id),
  );

  return {
    insight: "slow_paying_customers",
    asOfDate: dataset.asOfDate,
    count: items.length,
    items: items.slice(0, limit),
  };
}

/**
 * High-value customers by billed total.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {{ topN?: number, minBilledTotal?: number }} [opts]
 */
export function insightHighValueCustomers(dataset, opts = {}) {
  const topN = opts.topN ?? 25;
  const minBilledTotal = opts.minBilledTotal ?? 0;
  const revenue = buildCustomerRevenueSummary(dataset);
  const items = revenue.customers
    .filter((c) => c.billed_total >= minBilledTotal)
    .slice(0, topN)
    .map((c, index) => ({
      rank: index + 1,
      qb_customer_list_id: c.qb_customer_list_id,
      billed_total: c.billed_total,
      open_balance_total: c.open_balance_total,
      invoice_count: c.invoice_count,
      last_invoice_date: c.last_invoice_date,
    }));

  return {
    insight: "high_value_customers",
    asOfDate: dataset.asOfDate,
    count: items.length,
    billed_total: items.reduce((s, i) => s + i.billed_total, 0),
    items,
  };
}

/**
 * Dormant customers: known customers with no invoice/payment activity within lookbackDays.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {{ lookbackDays?: number, limit?: number }} [opts]
 */
export function insightDormantCustomers(dataset, opts = {}) {
  const lookbackDays = opts.lookbackDays ?? 90;
  const limit = opts.limit ?? 50;
  const asOfMs = Date.parse(`${dataset.asOfDate}T00:00:00.000Z`);
  const cutoffMs = asOfMs - lookbackDays * 86_400_000;
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

  /** @type {Map<string, string|null>} last activity date */
  const lastActivity = new Map();

  for (const c of dataset.customers) {
    lastActivity.set(c.qb_list_id, null);
  }

  function touch(customerId, dateStr) {
    if (!customerId || !dateStr) return;
    if (!lastActivity.has(customerId)) lastActivity.set(customerId, null);
    const prev = lastActivity.get(customerId);
    if (!prev || dateStr > prev) lastActivity.set(customerId, dateStr);
  }

  for (const inv of dataset.invoices) touch(inv.qb_customer_list_id, inv.txn_date);
  for (const pay of dataset.payments) touch(pay.qb_customer_list_id, pay.txn_date);

  /** @type {Array<{
   *   qb_customer_list_id: string,
   *   last_activity_date: string|null,
   *   days_since_activity: number|null,
   * }>} */
  const items = [];

  for (const [customerId, lastDate] of lastActivity) {
    if (lastDate && lastDate >= cutoffDate) continue;
    const daysSince = lastDate ? daysBetween(lastDate, dataset.asOfDate) : null;
    items.push({
      qb_customer_list_id: customerId,
      last_activity_date: lastDate,
      days_since_activity: daysSince,
    });
  }

  items.sort((a, b) => {
    if (a.last_activity_date == null && b.last_activity_date != null) return -1;
    if (a.last_activity_date != null && b.last_activity_date == null) return 1;
    if (a.last_activity_date == null && b.last_activity_date == null) {
      return a.qb_customer_list_id.localeCompare(b.qb_customer_list_id);
    }
    return (
      (b.days_since_activity ?? 0) - (a.days_since_activity ?? 0) ||
      a.qb_customer_list_id.localeCompare(b.qb_customer_list_id)
    );
  });

  return {
    insight: "dormant_customers",
    asOfDate: dataset.asOfDate,
    lookback_days: lookbackDays,
    cutoff_date: cutoffDate,
    count: items.length,
    items: items.slice(0, limit),
  };
}

/**
 * Estimate-to-invoice leakage: estimates not linked/fully invoiced.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {{ minAmount?: number, limit?: number, olderThanDays?: number }} [opts]
 */
export function insightEstimateToInvoiceLeakage(dataset, opts = {}) {
  const minAmount = opts.minAmount ?? 0;
  const limit = opts.limit ?? 50;
  const olderThanDays = opts.olderThanDays ?? 0;
  const invoiceTxnIds = new Set(dataset.invoices.map((i) => i.qb_txn_id));

  /** @type {Array<{
   *   qb_txn_id: string,
   *   qb_customer_list_id: string|null,
   *   total_amount: number,
   *   txn_date: string|null,
   *   days_since_estimate: number|null,
   *   reason: string,
   * }>} */
  const items = [];

  for (const est of dataset.estimates) {
    if (est.is_fully_invoiced === true) continue;
    const linkedInvoice = est.linked_txns.some(
      (l) => (!l.txn_type || l.txn_type === "Invoice") && invoiceTxnIds.has(l.qb_txn_id),
    );
    if (linkedInvoice) continue;
    const amount = moneyOrZero(est.total_amount);
    if (amount < minAmount) continue;
    const daysSince = daysBetween(est.txn_date, dataset.asOfDate);
    if (olderThanDays > 0 && (daysSince == null || daysSince < olderThanDays)) continue;

    items.push({
      qb_txn_id: est.qb_txn_id,
      qb_customer_list_id: est.qb_customer_list_id,
      total_amount: amount,
      txn_date: est.txn_date,
      days_since_estimate: daysSince,
      reason: est.is_active === false ? "inactive_unlinked_estimate" : "unlinked_estimate",
    });
  }

  items.sort(
    (a, b) =>
      b.total_amount - a.total_amount ||
      (b.days_since_estimate ?? 0) - (a.days_since_estimate ?? 0) ||
      a.qb_txn_id.localeCompare(b.qb_txn_id),
  );

  return {
    insight: "estimate_to_invoice_leakage",
    asOfDate: dataset.asOfDate,
    count: items.length,
    amount_total: items.reduce((s, i) => s + i.total_amount, 0),
    items: items.slice(0, limit),
  };
}

/**
 * Unpaid invoice risk: open balances ranked by amount and age.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {{ minBalance?: number, limit?: number }} [opts]
 */
export function insightUnpaidInvoiceRisk(dataset, opts = {}) {
  const minBalance = opts.minBalance ?? 0.01;
  const limit = opts.limit ?? 50;

  /** @type {Array<{
   *   qb_txn_id: string,
   *   qb_customer_list_id: string|null,
   *   balance_remaining: number,
   *   total_amount: number,
   *   days_open: number|null,
   *   is_overdue: boolean,
   *   risk_score: number,
   * }>} */
  const items = [];

  for (const inv of dataset.invoices) {
    if (!invoiceHasOpenBalance(inv)) continue;
    const bal = moneyOrZero(inv.balance_remaining);
    if (bal < minBalance) continue;
    const daysOpen = daysBetween(inv.txn_date, dataset.asOfDate);
    const due = inv.due_date ?? inv.txn_date;
    const daysOverdue = daysBetween(due, dataset.asOfDate);
    const isOverdue = daysOverdue != null && daysOverdue > 0;
    // Deterministic score: balance weight + age weight + overdue boost.
    const riskScore =
      bal +
      (daysOpen != null ? daysOpen * 10 : 0) +
      (isOverdue ? 1_000 + (daysOverdue ?? 0) * 25 : 0);

    items.push({
      qb_txn_id: inv.qb_txn_id,
      qb_customer_list_id: inv.qb_customer_list_id,
      balance_remaining: bal,
      total_amount: moneyOrZero(inv.total_amount),
      days_open: daysOpen,
      is_overdue: isOverdue,
      risk_score: Math.round(riskScore * 100) / 100,
    });
  }

  items.sort(
    (a, b) =>
      b.risk_score - a.risk_score ||
      b.balance_remaining - a.balance_remaining ||
      a.qb_txn_id.localeCompare(b.qb_txn_id),
  );

  return {
    insight: "unpaid_invoice_risk",
    asOfDate: dataset.asOfDate,
    count: items.length,
    balance_total: items.reduce((s, i) => s + i.balance_remaining, 0),
    items: items.slice(0, limit),
  };
}

/**
 * Run all Phase 4A deterministic insights.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @param {object} [opts]
 */
export function buildAllQuickBooksInsights(dataset, opts = {}) {
  return {
    overdue_ar_risks: insightOverdueArRisks(dataset, opts.overdueArRisks),
    slow_paying_customers: insightSlowPayingCustomers(dataset, opts.slowPayingCustomers),
    high_value_customers: insightHighValueCustomers(dataset, opts.highValueCustomers),
    dormant_customers: insightDormantCustomers(dataset, opts.dormantCustomers),
    estimate_to_invoice_leakage: insightEstimateToInvoiceLeakage(
      dataset,
      opts.estimateToInvoiceLeakage,
    ),
    unpaid_invoice_risk: insightUnpaidInvoiceRisk(dataset, opts.unpaidInvoiceRisk),
  };
}
