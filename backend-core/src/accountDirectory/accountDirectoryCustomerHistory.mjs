/**
 * Account 360 historical customer sales — staff-safe commercial activity.
 *
 * Preferred source: qb_finance_transaction_index (Estimate / SalesOrder /
 * Invoice / ReceivePayment headers) joined only through exact QuickBooks root
 * ListIDs → ad_qb_customer_facts descendant ListIDs (entity_id).
 *
 * Fallback: sales_quickbooks_financial_transactions via qb_root_customer_list_id
 * when the Finance index is missing. Never fuzzy-join by name.
 *
 * Current open A/R remains sales_quickbooks_open_ar_current (snapshot).
 */

import { QB_FINANCE_HISTORICAL_START } from "../finance/quickbooksFinanceFoundation/constants.js";
import {
  PREPARED_FACTS_PAGE_SIZE,
  readStaleAfterSeconds
} from "../sales/quickbooksFinancialTruth/preparedFactsProvider.js";
import {
  buildCustomerMonthlyPoints,
  monthKeysInclusive
} from "./accountDirectoryCustomerTrend.mjs";

export const AD_HISTORY_TXN_PAGE_DEFAULT = 25;
export const AD_HISTORY_TXN_PAGE_MAX = 50;
export const AD_HISTORY_TIMELINE_CAP = 200;
export const AD_CUSTOMER_LIST_ID_CHUNK = 100;
export const AD_CUSTOMER_LIST_ID_MAX = 2000;

export const FINANCE_COMMERCIAL_TYPES = Object.freeze({
  Estimate: "estimate",
  SalesOrder: "sales_order",
  Invoice: "invoice",
  ReceivePayment: "payment"
});

export const SALES_COMMERCIAL_TYPES = Object.freeze(["estimate", "sales_order", "invoice", "payment"]);

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

function isMissingRelation(err) {
  const msg = String(err?.message ?? err ?? "");
  return /relation .* does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(msg);
}

function uniqueIds(ids) {
  return [...new Set((ids || []).map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function emptyFamily() {
  return { count: 0, amount: 0 };
}

function addToFamily(family, amount) {
  const n = Number(amount);
  family.count += 1;
  if (Number.isFinite(n)) family.amount = Math.round((family.amount + n) * 100) / 100;
}

export function formatMonthYear(ymd) {
  const d = toYmd(ymd);
  if (!d) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

export function formatAvailableHistoryCopy(coverage) {
  const start = formatMonthYear(coverage?.startDate);
  const endLabel = toYmd(coverage?.endDate);
  if (!start || !endLabel) return "Available history dates are not proven yet.";
  const end = formatMonthYear(endLabel);
  return `History available from ${start} through ${end}.`;
}

export function shiftYmdByYears(ymd, years) {
  const d = toYmd(ymd);
  if (!d) return null;
  const y = Number(d.slice(0, 4)) + years;
  if (!Number.isFinite(y)) return null;
  const rest = d.slice(4);
  if (rest === "-02-29") {
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return leap ? `${y}-02-29` : `${y}-02-28`;
  }
  return `${y}${rest}`;
}

/**
 * Equivalent YTD vs prior-year window. Requires full prior window inside coverage.
 * @param {string|null} asOfYmd
 * @param {string|null} coverageStart
 * @param {string|null} coverageEnd
 */
export function resolveEquivalentYoyWindow(asOfYmd, coverageStart, coverageEnd) {
  const asOf = toYmd(asOfYmd);
  const covStart = toYmd(coverageStart);
  const covEnd = toYmd(coverageEnd) || asOf;
  if (!asOf || !covStart || !covEnd) {
    return { comparable: false, current: null, prior: null, reason: "Coverage dates are unknown." };
  }
  const year = asOf.slice(0, 4);
  const current = { start: `${year}-01-01`, end: asOf };
  const prior = {
    start: shiftYmdByYears(current.start, -1),
    end: shiftYmdByYears(current.end, -1)
  };
  if (!prior.start || !prior.end) {
    return { comparable: false, current, prior: null, reason: "No comparable prior-year period is available." };
  }
  if (prior.start < covStart || prior.end < covStart) {
    return {
      comparable: false,
      current,
      prior,
      reason: "No comparable prior-year period is available."
    };
  }
  if (current.end > covEnd) current.end = covEnd;
  return { comparable: true, current, prior, reason: null };
}

export function describeAmountChange(label, currentAmount, priorAmount, comparable) {
  if (!comparable) {
    return { status: "unavailable", percent: null, text: "No comparable prior-year period is available." };
  }
  const current = Number(currentAmount) || 0;
  const prior = Number(priorAmount) || 0;
  if (prior === 0 && current === 0) {
    return {
      status: "flat",
      percent: 0,
      text: `${label} were unchanged versus the equivalent period last year.`
    };
  }
  if (prior === 0) {
    return {
      status: "unavailable_rate",
      percent: null,
      text: `${label} have activity this year; the equivalent period last year had none.`
    };
  }
  const percent = Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
  const abs = Math.abs(percent);
  if (percent > 0) {
    return {
      status: "up",
      percent,
      text: `${label} are ${abs}% higher than the equivalent period last year.`
    };
  }
  if (percent < 0) {
    return {
      status: "down",
      percent,
      text: `${label} are ${abs}% lower than the equivalent period last year.`
    };
  }
  return {
    status: "flat",
    percent: 0,
    text: `${label} were unchanged versus the equivalent period last year.`
  };
}

export function sumRowsByFamily(rows, startDate, endDate) {
  const start = toYmd(startDate);
  const end = toYmd(endDate);
  const out = {
    estimates: emptyFamily(),
    salesOrders: emptyFamily(),
    invoices: emptyFamily(),
    payments: emptyFamily()
  };
  for (const row of rows || []) {
    const date = toYmd(row.date || row.transaction_date);
    if (!date) continue;
    if (start && date < start) continue;
    if (end && date > end) continue;
    const type = String(row.type || row.transaction_type || "");
    const amount = row.amount;
    if (type === "estimate") addToFamily(out.estimates, amount);
    else if (type === "sales_order") addToFamily(out.salesOrders, amount);
    else if (type === "invoice") addToFamily(out.invoices, amount);
    else if (type === "payment") addToFamily(out.payments, amount);
  }
  return out;
}

function familyMinMax(rows) {
  /** @type {Record<string, { startDate: string|null, endDate: string|null }>} */
  const out = {
    estimates: { startDate: null, endDate: null },
    salesOrders: { startDate: null, endDate: null },
    invoices: { startDate: null, endDate: null },
    payments: { startDate: null, endDate: null }
  };
  const bucket = {
    estimate: "estimates",
    sales_order: "salesOrders",
    invoice: "invoices",
    payment: "payments"
  };
  for (const row of rows || []) {
    const key = bucket[String(row.type || row.transaction_type || "")];
    const date = toYmd(row.date || row.transaction_date);
    if (!key || !date) continue;
    if (!out[key].startDate || date < out[key].startDate) out[key].startDate = date;
    if (!out[key].endDate || date > out[key].endDate) out[key].endDate = date;
  }
  return out;
}

function latestOfType(rows, type) {
  let best = null;
  for (const row of rows || []) {
    if (String(row.type || row.transaction_type) !== type) continue;
    const date = toYmd(row.date || row.transaction_date);
    if (!date) continue;
    if (!best || date > best.date) {
      best = {
        date,
        referenceNumber: row.referenceNumber || row.reference_number || null,
        amount: toMoney(row.amount),
        customerName: row.customerName || row.customer_name || null
      };
    }
  }
  return best;
}

/**
 * Exact descendant ListIDs for linked roots. Never uses names.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @param {string[]} rootListIds
 */
export async function loadExactLinkedCustomerListIds(supabase, organizationId, rootListIds) {
  const roots = uniqueIds(rootListIds);
  if (!roots.length) return { listIds: [], factsUnavailable: false };
  const ids = new Set(roots);
  let frontier = [...roots];
  try {
    while (frontier.length && ids.size < AD_CUSTOMER_LIST_ID_MAX) {
      /** @type {string[]} */
      const next = [];
      for (let i = 0; i < frontier.length; i += AD_CUSTOMER_LIST_ID_CHUNK) {
        const slice = frontier.slice(i, i + AD_CUSTOMER_LIST_ID_CHUNK);
        const { data, error } = await supabase
          .from("ad_qb_customer_facts")
          .select("qb_list_id")
          .eq("organization_id", organizationId)
          .in("parent_list_id", slice);
        if (error) {
          if (isMissingRelation(error) || /unexpected table/i.test(String(error.message || ""))) {
            return { listIds: roots, factsUnavailable: true };
          }
          throw error;
        }
        for (const row of data || []) {
          const id = String(row.qb_list_id ?? "").trim();
          if (!id || ids.has(id)) continue;
          ids.add(id);
          next.push(id);
          if (ids.size >= AD_CUSTOMER_LIST_ID_MAX) break;
        }
      }
      frontier = next;
    }
    return { listIds: [...ids], factsUnavailable: false };
  } catch (err) {
    if (isMissingRelation(err) || /unexpected table/i.test(String(err?.message || ""))) {
      return { listIds: roots, factsUnavailable: true };
    }
    throw err;
  }
}

async function loadLatestAccountingSync(supabase, organizationId) {
  const { data, error } = await supabase
    .from("qb_finance_sync_runs")
    .select("status, completed_at, coverage_start_date, coverage_end_date, domain")
    .eq("organization_id", organizationId)
    .eq("domain", "accounting")
    .in("status", ["success", "partial"])
    .order("completed_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data || [])[0] || null;
}

async function pageFinanceCommercial(supabase, { organizationId, listIds, startDate, endDate, limit }) {
  const types = Object.keys(FINANCE_COMMERCIAL_TYPES);
  const pageSize = PREPARED_FACTS_PAGE_SIZE;
  const all = [];
  for (let i = 0; i < listIds.length; i += AD_CUSTOMER_LIST_ID_CHUNK) {
    const chunk = listIds.slice(i, i + AD_CUSTOMER_LIST_ID_CHUNK);
    let from = 0;
    for (;;) {
      let q = supabase
        .from("qb_finance_transaction_index")
        .select("txn_type, txn_date, reference_number, amount, entity_name, txn_line_id")
        .eq("organization_id", organizationId)
        .in("entity_id", chunk)
        .in("txn_type", types);
      if (startDate) q = q.gte("txn_date", startDate);
      if (endDate) q = q.lte("txn_date", endDate);
      q = q.order("txn_date", { ascending: false }).order("reference_number", { ascending: false }).range(from, from + pageSize - 1);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      for (const row of rows) {
        if (String(row.txn_line_id ?? "") !== "") continue;
        const type = FINANCE_COMMERCIAL_TYPES[String(row.txn_type || "")];
        if (!type) continue;
        all.push({
          type,
          date: toYmd(row.txn_date),
          amount: toMoney(row.amount),
          referenceNumber: row.reference_number ? String(row.reference_number) : null,
          customerName: row.entity_name ? String(row.entity_name) : null
        });
        if (limit && all.length >= limit) return all.slice(0, limit);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  }
  return all;
}

async function pageSalesCommercial(supabase, { organizationId, rootListIds, startDate, endDate, limit }) {
  const pageSize = PREPARED_FACTS_PAGE_SIZE;
  const all = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from("sales_quickbooks_financial_transactions")
      .select("transaction_type, transaction_date, reference_number, amount, customer_name")
      .eq("organization_id", organizationId)
      .in("qb_root_customer_list_id", rootListIds)
      .in("transaction_type", SALES_COMMERCIAL_TYPES);
    if (startDate) q = q.gte("transaction_date", startDate);
    if (endDate) q = q.lte("transaction_date", endDate);
    q = q
      .order("transaction_date", { ascending: false })
      .order("reference_number", { ascending: false })
      .range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      all.push({
        type: row.transaction_type,
        date: toYmd(row.transaction_date),
        amount: toMoney(row.amount),
        referenceNumber: row.reference_number ? String(row.reference_number) : null,
        customerName: row.customer_name ? String(row.customer_name) : null
      });
      if (limit && all.length >= limit) return all.slice(0, limit);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * @param {object} args
 */
export async function loadStaffSafeCustomerTransactions(args) {
  const {
    supabase,
    organizationId,
    rootListIds,
    env = process.env,
    now = new Date(),
    startDate = null,
    endDate = null,
    limit = null
  } = args;
  const roots = uniqueIds(rootListIds);
  if (!roots.length) {
    return { source: null, rows: [], coverageStart: null, coverageEnd: null, freshness: null };
  }

  const { listIds, factsUnavailable } = await loadExactLinkedCustomerListIds(
    supabase,
    organizationId,
    roots
  );

  try {
    const run = await loadLatestAccountingSync(supabase, organizationId);
    const rows = await pageFinanceCommercial(supabase, {
      organizationId,
      listIds,
      startDate,
      endDate,
      limit
    });
    if (run) {
      const asOf =
        toYmd(run.coverage_end_date) ||
        toYmd(run.completed_at) ||
        toYmd(String(now.toISOString()).slice(0, 10));
      const completedAt = run.completed_at ? new Date(run.completed_at) : null;
      const ageSeconds = completedAt
        ? Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 1000))
        : null;
      const staleAfter = readStaleAfterSeconds(env);
      return {
        source: "finance_transaction_index",
        rows,
        coverageStart: QB_FINANCE_HISTORICAL_START,
        coverageEnd: asOf,
        factsUnavailable,
        freshness: {
          refreshedAt: completedAt ? completedAt.toISOString() : null,
          isStale: ageSeconds != null ? ageSeconds > staleAfter : false,
          ageSeconds,
          latestSyncStatus: run.status || null
        }
      };
    }
  } catch (err) {
    if (!isMissingRelation(err) && !/unexpected table/i.test(String(err?.message || ""))) {
      throw err;
    }
  }

  const rows = await pageSalesCommercial(supabase, {
    organizationId,
    rootListIds: roots,
    startDate,
    endDate,
    limit
  });
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  return {
    source: "sales_quickbooks_financial_transactions",
    rows,
    coverageStart: dates[0] || startDate,
    coverageEnd: dates[dates.length - 1] || endDate,
    factsUnavailable,
    freshness: null
  };
}

export function buildCustomerHistoryModel({
  rows,
  coverageStart,
  coverageEnd,
  asOfDate,
  source,
  freshness
}) {
  const asOf = toYmd(asOfDate) || toYmd(coverageEnd);
  const covStart = toYmd(coverageStart);
  const covEnd = toYmd(coverageEnd) || asOf;
  const yoy = resolveEquivalentYoyWindow(asOf, covStart, covEnd);
  const year = asOf ? asOf.slice(0, 4) : null;
  const ytdStart = year ? `${year}-01-01` : null;
  const available = sumRowsByFamily(rows, covStart, covEnd);
  const ytd = sumRowsByFamily(rows, ytdStart, asOf);
  const current = yoy.current ? sumRowsByFamily(rows, yoy.current.start, yoy.current.end) : ytd;
  const prior = yoy.comparable && yoy.prior ? sumRowsByFamily(rows, yoy.prior.start, yoy.prior.end) : null;
  const monthKeys = monthKeysInclusive(covStart, covEnd);
  const periods = buildCustomerMonthlyPoints(
    (rows || []).map((r) => ({
      transaction_type: r.type,
      transaction_date: r.date,
      amount: r.amount
    })),
    monthKeys
  );

  return {
    source: source === "finance_transaction_index" ? "prepared_quickbooks_history" : "prepared_sales_facts",
    coverage: {
      startDate: covStart,
      endDate: covEnd,
      label: formatAvailableHistoryCopy({ startDate: covStart, endDate: covEnd }),
      provenComplete: false,
      family: familyMinMax(rows),
      freshness
    },
    summary: {
      estimates: available.estimates,
      salesOrders: available.salesOrders,
      invoices: available.invoices,
      payments: available.payments
    },
    ytd: {
      start: ytdStart,
      end: asOf,
      estimates: ytd.estimates,
      salesOrders: ytd.salesOrders,
      invoices: ytd.invoices,
      payments: ytd.payments
    },
    comparable: {
      available: yoy.comparable,
      reason: yoy.reason,
      current: yoy.current,
      prior: yoy.prior,
      currentTotals: current,
      priorTotals: prior,
      change: {
        quotes: describeAmountChange("Quoted dollars", current.estimates.amount, prior?.estimates.amount, yoy.comparable),
        salesOrders: describeAmountChange(
          "Sales order dollars",
          current.salesOrders.amount,
          prior?.salesOrders.amount,
          yoy.comparable
        ),
        invoiced: describeAmountChange("Invoiced dollars", current.invoices.amount, prior?.invoices.amount, yoy.comparable),
        collected: describeAmountChange(
          "Collected dollars",
          current.payments.amount,
          prior?.payments.amount,
          yoy.comparable
        )
      }
    },
    commercialActivity: {
      label: "Commercial activity",
      notes:
        "These are aggregate counts and dollars by transaction type. They are not a job-level conversion funnel.",
      estimates: available.estimates,
      salesOrders: available.salesOrders,
      invoices: available.invoices,
      payments: available.payments
    },
    periods
  };
}

export async function loadCustomerHistoryBundle(args) {
  const loaded = await loadStaffSafeCustomerTransactions(args);
  const asOf = loaded.coverageEnd || toYmd(String(args.now?.toISOString?.() || "").slice(0, 10));
  const history = buildCustomerHistoryModel({
    rows: loaded.rows,
    coverageStart: loaded.coverageStart,
    coverageEnd: loaded.coverageEnd,
    asOfDate: asOf,
    source: loaded.source,
    freshness: loaded.freshness
  });
  return { ...loaded, history, asOf };
}
