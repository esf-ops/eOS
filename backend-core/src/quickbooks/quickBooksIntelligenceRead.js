/**
 * quickBooksIntelligenceRead — Phase 4A safe aggregate read models.
 *
 * All outputs use opaque QuickBooks IDs only (qb_list_id / qb_txn_id).
 * Never includes raw_payload, names, addresses, memos, or RefNumber.
 * No AI. No writeback. Backend-core only.
 */

/**
 * @param {string|null|undefined} dateStr YYYY-MM-DD
 * @returns {number|null} UTC midnight ms
 */
export function parseIsoDateUtc(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const t = Date.parse(`${dateStr}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Whole calendar days between two YYYY-MM-DD dates (b - a).
 *
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {number|null}
 */
export function daysBetween(a, b) {
  const ta = parseIsoDateUtc(a);
  const tb = parseIsoDateUtc(b);
  if (ta == null || tb == null) return null;
  return Math.round((tb - ta) / 86_400_000);
}

/**
 * @param {number|null|undefined} n
 * @returns {number}
 */
function moneyOrZero(n) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * @param {import("./quickBooksIntelligenceFacts.js").QbInvoiceFact} inv
 * @returns {boolean}
 */
export function invoiceHasOpenBalance(inv) {
  if (inv.is_paid === true) return false;
  const bal = inv.balance_remaining;
  if (typeof bal === "number" && Number.isFinite(bal)) return bal > 0;
  if (inv.is_paid === false) return true;
  return false;
}

/**
 * Aging bucket for an open invoice relative to asOfDate.
 *
 * @param {import("./quickBooksIntelligenceFacts.js").QbInvoiceFact} inv
 * @param {string} asOfDate
 * @returns {"current"|"1_30"|"31_60"|"61_90"|"90_plus"|"unknown"}
 */
export function invoiceAgingBucket(inv, asOfDate) {
  if (!invoiceHasOpenBalance(inv)) return "current";
  const due = inv.due_date ?? inv.txn_date;
  const overdueDays = daysBetween(due, asOfDate);
  if (overdueDays == null) return "unknown";
  if (overdueDays <= 0) return "current";
  if (overdueDays <= 30) return "1_30";
  if (overdueDays <= 60) return "31_60";
  if (overdueDays <= 90) return "61_90";
  return "90_plus";
}

/**
 * Customer revenue summary: billed totals and open AR by opaque customer id.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 * @returns {{
 *   asOfDate: string,
 *   customers: Array<{
 *     qb_customer_list_id: string,
 *     invoice_count: number,
 *     billed_total: number,
 *     open_balance_total: number,
 *     paid_invoice_count: number,
 *     open_invoice_count: number,
 *     last_invoice_date: string|null,
 *   }>,
 *   totals: { customer_count: number, billed_total: number, open_balance_total: number },
 * }}
 */
export function buildCustomerRevenueSummary(dataset) {
  /** @type {Map<string, {
   *   qb_customer_list_id: string,
   *   invoice_count: number,
   *   billed_total: number,
   *   open_balance_total: number,
   *   paid_invoice_count: number,
   *   open_invoice_count: number,
   *   last_invoice_date: string|null,
   * }>} */
  const byCustomer = new Map();

  for (const inv of dataset.invoices) {
    const custId = inv.qb_customer_list_id;
    if (!custId) continue;
    let row = byCustomer.get(custId);
    if (!row) {
      row = {
        qb_customer_list_id: custId,
        invoice_count: 0,
        billed_total: 0,
        open_balance_total: 0,
        paid_invoice_count: 0,
        open_invoice_count: 0,
        last_invoice_date: null,
      };
      byCustomer.set(custId, row);
    }
    row.invoice_count += 1;
    row.billed_total += moneyOrZero(inv.total_amount);
    if (invoiceHasOpenBalance(inv)) {
      row.open_invoice_count += 1;
      row.open_balance_total += moneyOrZero(inv.balance_remaining);
    } else if (inv.is_paid === true || moneyOrZero(inv.balance_remaining) === 0) {
      row.paid_invoice_count += 1;
    }
    if (inv.txn_date && (!row.last_invoice_date || inv.txn_date > row.last_invoice_date)) {
      row.last_invoice_date = inv.txn_date;
    }
  }

  const customers = [...byCustomer.values()].sort(
    (a, b) => b.billed_total - a.billed_total || a.qb_customer_list_id.localeCompare(b.qb_customer_list_id),
  );

  return {
    asOfDate: dataset.asOfDate,
    customers,
    totals: {
      customer_count: customers.length,
      billed_total: customers.reduce((s, c) => s + c.billed_total, 0),
      open_balance_total: customers.reduce((s, c) => s + c.open_balance_total, 0),
    },
  };
}

/**
 * Invoice aging / AR summary.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 */
export function buildInvoiceAgingSummary(dataset) {
  const buckets = {
    current: { invoice_count: 0, balance_total: 0 },
    "1_30": { invoice_count: 0, balance_total: 0 },
    "31_60": { invoice_count: 0, balance_total: 0 },
    "61_90": { invoice_count: 0, balance_total: 0 },
    "90_plus": { invoice_count: 0, balance_total: 0 },
    unknown: { invoice_count: 0, balance_total: 0 },
  };

  let openInvoiceCount = 0;
  let openBalanceTotal = 0;
  let overdueInvoiceCount = 0;
  let overdueBalanceTotal = 0;

  for (const inv of dataset.invoices) {
    if (!invoiceHasOpenBalance(inv)) continue;
    const bal = moneyOrZero(inv.balance_remaining);
    openInvoiceCount += 1;
    openBalanceTotal += bal;
    const bucket = invoiceAgingBucket(inv, dataset.asOfDate);
    buckets[bucket].invoice_count += 1;
    buckets[bucket].balance_total += bal;
    if (bucket !== "current" && bucket !== "unknown") {
      overdueInvoiceCount += 1;
      overdueBalanceTotal += bal;
    }
  }

  return {
    asOfDate: dataset.asOfDate,
    open_invoice_count: openInvoiceCount,
    open_balance_total: openBalanceTotal,
    overdue_invoice_count: overdueInvoiceCount,
    overdue_balance_total: overdueBalanceTotal,
    buckets,
  };
}

/**
 * Payment history summary by opaque customer id.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 */
export function buildPaymentHistorySummary(dataset) {
  /** @type {Map<string, {
   *   qb_customer_list_id: string,
   *   payment_count: number,
   *   payment_total: number,
   *   last_payment_date: string|null,
   * }>} */
  const byCustomer = new Map();
  /** @type {Map<string, number[]>} */
  const daysSamplesByCustomer = new Map();

  /** @type {Map<string, import("./quickBooksIntelligenceFacts.js").QbInvoiceFact>} */
  const invoicesByTxn = new Map();
  for (const inv of dataset.invoices) {
    invoicesByTxn.set(inv.qb_txn_id, inv);
  }

  for (const pay of dataset.payments) {
    const custId = pay.qb_customer_list_id;
    if (!custId) continue;
    let row = byCustomer.get(custId);
    if (!row) {
      row = {
        qb_customer_list_id: custId,
        payment_count: 0,
        payment_total: 0,
        last_payment_date: null,
      };
      byCustomer.set(custId, row);
      daysSamplesByCustomer.set(custId, []);
    }
    row.payment_count += 1;
    row.payment_total += moneyOrZero(pay.total_amount);
    if (pay.txn_date && (!row.last_payment_date || pay.txn_date > row.last_payment_date)) {
      row.last_payment_date = pay.txn_date;
    }

    const samples = daysSamplesByCustomer.get(custId);
    for (const link of pay.linked_txns) {
      if (link.txn_type && link.txn_type !== "Invoice") continue;
      const inv = invoicesByTxn.get(link.qb_txn_id);
      if (!inv?.txn_date || !pay.txn_date) continue;
      const d = daysBetween(inv.txn_date, pay.txn_date);
      if (d != null && d >= 0) samples.push(d);
    }
  }

  const customers = [...byCustomer.values()].map((row) => {
    const samples = daysSamplesByCustomer.get(row.qb_customer_list_id) ?? [];
    const avg =
      samples.length > 0
        ? Math.round((samples.reduce((s, n) => s + n, 0) / samples.length) * 10) / 10
        : null;
    return {
      qb_customer_list_id: row.qb_customer_list_id,
      payment_count: row.payment_count,
      payment_total: row.payment_total,
      last_payment_date: row.last_payment_date,
      avg_days_to_pay: avg,
    };
  }).sort(
    (a, b) => b.payment_total - a.payment_total || a.qb_customer_list_id.localeCompare(b.qb_customer_list_id),
  );

  return {
    asOfDate: dataset.asOfDate,
    customers,
    totals: {
      customer_count: customers.length,
      payment_count: customers.reduce((s, c) => s + c.payment_count, 0),
      payment_total: customers.reduce((s, c) => s + c.payment_total, 0),
    },
  };
}

/**
 * Estimate → sales-order → invoice flow summary.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 */
export function buildEstimateSalesOrderInvoiceFlow(dataset) {
  const invoiceTxnIds = new Set(dataset.invoices.map((i) => i.qb_txn_id));

  let estimatesLinkedToInvoice = 0;
  let estimatesFullyInvoiced = 0;
  let estimateTotal = 0;
  let estimateLinkedAmount = 0;

  for (const est of dataset.estimates) {
    estimateTotal += moneyOrZero(est.total_amount);
    const linkedInvoice = est.linked_txns.some(
      (l) => (!l.txn_type || l.txn_type === "Invoice") && invoiceTxnIds.has(l.qb_txn_id),
    );
    if (est.is_fully_invoiced === true || linkedInvoice) {
      estimatesLinkedToInvoice += 1;
      estimateLinkedAmount += moneyOrZero(est.total_amount);
    }
    if (est.is_fully_invoiced === true) estimatesFullyInvoiced += 1;
  }

  let salesOrdersLinkedToInvoice = 0;
  let salesOrderTotal = 0;
  let salesOrderLinkedAmount = 0;

  for (const so of dataset.salesOrders) {
    salesOrderTotal += moneyOrZero(so.total_amount);
    const linkedInvoice = so.linked_txns.some(
      (l) => (!l.txn_type || l.txn_type === "Invoice") && invoiceTxnIds.has(l.qb_txn_id),
    );
    if (so.is_fully_invoiced === true || linkedInvoice) {
      salesOrdersLinkedToInvoice += 1;
      salesOrderLinkedAmount += moneyOrZero(so.total_amount);
    }
  }

  const invoiceTotal = dataset.invoices.reduce((s, i) => s + moneyOrZero(i.total_amount), 0);

  return {
    asOfDate: dataset.asOfDate,
    estimates: {
      count: dataset.estimates.length,
      total_amount: estimateTotal,
      linked_to_invoice_count: estimatesLinkedToInvoice,
      fully_invoiced_count: estimatesFullyInvoiced,
      linked_amount: estimateLinkedAmount,
      unlinked_count: dataset.estimates.length - estimatesLinkedToInvoice,
      unlinked_amount: estimateTotal - estimateLinkedAmount,
    },
    sales_orders: {
      count: dataset.salesOrders.length,
      total_amount: salesOrderTotal,
      linked_to_invoice_count: salesOrdersLinkedToInvoice,
      linked_amount: salesOrderLinkedAmount,
      unlinked_count: dataset.salesOrders.length - salesOrdersLinkedToInvoice,
      unlinked_amount: salesOrderTotal - salesOrderLinkedAmount,
    },
    invoices: {
      count: dataset.invoices.length,
      total_amount: invoiceTotal,
    },
  };
}

/**
 * Sales rep summary where SalesRepRef is present on invoices.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 */
export function buildSalesRepSummary(dataset) {
  /** @type {Map<string, {
   *   qb_sales_rep_list_id: string,
   *   invoice_count: number,
   *   billed_total: number,
   *   open_balance_total: number,
   *   customer_ids: Set<string>,
   * }>} */
  const byRep = new Map();
  let unassignedInvoiceCount = 0;
  let unassignedBilledTotal = 0;

  for (const inv of dataset.invoices) {
    const repId = inv.qb_sales_rep_list_id;
    if (!repId) {
      unassignedInvoiceCount += 1;
      unassignedBilledTotal += moneyOrZero(inv.total_amount);
      continue;
    }
    let row = byRep.get(repId);
    if (!row) {
      row = {
        qb_sales_rep_list_id: repId,
        invoice_count: 0,
        billed_total: 0,
        open_balance_total: 0,
        customer_ids: new Set(),
      };
      byRep.set(repId, row);
    }
    row.invoice_count += 1;
    row.billed_total += moneyOrZero(inv.total_amount);
    if (invoiceHasOpenBalance(inv)) {
      row.open_balance_total += moneyOrZero(inv.balance_remaining);
    }
    if (inv.qb_customer_list_id) row.customer_ids.add(inv.qb_customer_list_id);
  }

  const knownRepIds = new Set(dataset.salesReps.map((r) => r.qb_list_id));

  const sales_reps = [...byRep.values()]
    .map((row) => ({
      qb_sales_rep_list_id: row.qb_sales_rep_list_id,
      known_in_sales_reps: knownRepIds.has(row.qb_sales_rep_list_id),
      invoice_count: row.invoice_count,
      billed_total: row.billed_total,
      open_balance_total: row.open_balance_total,
      customer_count: row.customer_ids.size,
    }))
    .sort(
      (a, b) => b.billed_total - a.billed_total || a.qb_sales_rep_list_id.localeCompare(b.qb_sales_rep_list_id),
    );

  return {
    asOfDate: dataset.asOfDate,
    sales_reps,
    unassigned: {
      invoice_count: unassignedInvoiceCount,
      billed_total: unassignedBilledTotal,
    },
  };
}

/**
 * Customer activity trend by calendar month (invoice + payment activity).
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 */
export function buildCustomerActivityTrend(dataset) {
  /** @type {Map<string, {
   *   month: string,
   *   invoice_count: number,
   *   invoice_total: number,
   *   payment_count: number,
   *   payment_total: number,
   *   active_customer_ids: Set<string>,
   * }>} */
  const byMonth = new Map();

  function ensureMonth(month) {
    let row = byMonth.get(month);
    if (!row) {
      row = {
        month,
        invoice_count: 0,
        invoice_total: 0,
        payment_count: 0,
        payment_total: 0,
        active_customer_ids: new Set(),
      };
      byMonth.set(month, row);
    }
    return row;
  }

  for (const inv of dataset.invoices) {
    if (!inv.txn_date || inv.txn_date.length < 7) continue;
    const month = inv.txn_date.slice(0, 7);
    const row = ensureMonth(month);
    row.invoice_count += 1;
    row.invoice_total += moneyOrZero(inv.total_amount);
    if (inv.qb_customer_list_id) row.active_customer_ids.add(inv.qb_customer_list_id);
  }

  for (const pay of dataset.payments) {
    if (!pay.txn_date || pay.txn_date.length < 7) continue;
    const month = pay.txn_date.slice(0, 7);
    const row = ensureMonth(month);
    row.payment_count += 1;
    row.payment_total += moneyOrZero(pay.total_amount);
    if (pay.qb_customer_list_id) row.active_customer_ids.add(pay.qb_customer_list_id);
  }

  const months = [...byMonth.values()]
    .map((row) => ({
      month: row.month,
      invoice_count: row.invoice_count,
      invoice_total: row.invoice_total,
      payment_count: row.payment_count,
      payment_total: row.payment_total,
      active_customer_count: row.active_customer_ids.size,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    asOfDate: dataset.asOfDate,
    months,
  };
}

/**
 * Convenience: all Phase 4A read models from one dataset.
 *
 * @param {import("./quickBooksIntelligenceDataset.js").QbIntelligenceDataset} dataset
 */
export function buildAllQuickBooksReadModels(dataset) {
  return {
    customer_revenue: buildCustomerRevenueSummary(dataset),
    invoice_aging: buildInvoiceAgingSummary(dataset),
    payment_history: buildPaymentHistorySummary(dataset),
    estimate_sales_order_invoice_flow: buildEstimateSalesOrderInvoiceFlow(dataset),
    sales_rep_summary: buildSalesRepSummary(dataset),
    customer_activity_trend: buildCustomerActivityTrend(dataset),
  };
}
