/**
 * Account Directory Financial Intelligence — Slice A (read-only).
 *
 * Joins prepared Sales QuickBooks facts ONLY through active
 * account_directory_external_links where external_system = quickbooks_desktop.
 * external_id is the canonical QB ROOT Customer ListID.
 *
 * Never joins by customer_name / fuzzy / aliases.
 * Never writes AD identity or external links.
 * Never returns QB ListIDs / external_ids to the browser.
 */

import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import { scrubAccount360Payload as scrubFinancialIds } from "./accountDirectoryStaffSafeFinancials.mjs";
import { loadCustomerHistoryBundle } from "./accountDirectoryCustomerHistory.mjs";

export { scrubFinancialIds };
import {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  roleHasCapability
} from "./accountDirectoryAuth.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";
import {
  loadLatestSuccessfulQbSyncRun,
  PREPARED_FACTS_PAGE_SIZE,
  readStaleAfterSeconds
} from "../sales/quickbooksFinancialTruth/preparedFactsProvider.js";
import {
  buildCustomerMonthlyPoints,
  mapOpenInvoiceRow,
  monthKeysInclusive,
  resolveCustomerTrendWindow
} from "./accountDirectoryCustomerTrend.mjs";

export const AD_FINANCIALS_PAGE_SIZE = PREPARED_FACTS_PAGE_SIZE;
export const AD_FINANCIALS_RECENT_LIMIT = 20;

export const DEFAULT_HISTORY_STALE_AFTER_SECONDS = 26 * 60 * 60;

export function readHistoryStaleAfterSeconds(env = process.env) {
  const n = Number.parseInt(String(env.QB_FINANCE_HISTORY_STALE_AFTER_SECONDS ?? ""), 10);
  if (Number.isFinite(n) && n >= 60) return n;
  return DEFAULT_HISTORY_STALE_AFTER_SECONDS;
}

export function buildSourceFreshness({
  label,
  refreshedAt,
  asOfDate,
  now,
  staleAfterSeconds
}) {
  const completed = refreshedAt ? new Date(refreshedAt) : null;
  const ageSeconds =
    completed && Number.isFinite(completed.getTime())
      ? Math.max(0, Math.floor((now.getTime() - completed.getTime()) / 1000))
      : null;
  const isStale = ageSeconds != null ? ageSeconds > staleAfterSeconds : false;
  const hoursAgo = ageSeconds != null ? Math.max(1, Math.round(ageSeconds / 3600)) : null;
  return {
    label,
    refreshedAt: completed && Number.isFinite(completed.getTime()) ? completed.toISOString() : null,
    asOfDate: asOfDate || null,
    ageSeconds,
    hoursAgo,
    staleAfterSeconds,
    isStale
  };
}


/**
 * @param {unknown} value
 * @returns {number|null}
 */
function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function toYmd(value) {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * @param {string} asOfYmd
 */
export function ytdStartForAsOf(asOfYmd) {
  const y = String(asOfYmd || "").slice(0, 4);
  if (!/^\d{4}$/.test(y)) return null;
  return `${y}-01-01`;
}

/**
 * @param {string|null} fromDate
 * @param {string|null} toDate
 * @returns {number|null}
 */
export function daysBetweenYmd(fromDate, toDate) {
  const a = toYmd(fromDate);
  const b = toYmd(toDate);
  if (!a || !b) return null;
  const t0 = Date.parse(`${a}T00:00:00.000Z`);
  const t1 = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.max(0, Math.floor((t1 - t0) / 86400000));
}

function emptyAgingBucket() {
  return { balance: 0, count: 0 };
}

/**
 * Classify one open invoice by QuickBooks DueDate vs asOfDate.
 * Never infers due date from invoice Date or Terms.
 *
 * @param {string|null|undefined} dueDate
 * @param {string|null|undefined} asOfDate
 * @returns {{ bucket: 'current'|'1_30'|'31_60'|'61_90'|'90_plus'|'unknown', daysOverdue: number|null }}
 */
export function classifyArAgingBucket(dueDate, asOfDate) {
  const due = toYmd(dueDate);
  const asOf = toYmd(asOfDate);
  if (!due || !asOf) {
    return { bucket: "unknown", daysOverdue: null };
  }
  if (due >= asOf) {
    return { bucket: "current", daysOverdue: 0 };
  }
  const daysOverdue = daysBetweenYmd(due, asOf);
  if (daysOverdue == null) return { bucket: "unknown", daysOverdue: null };
  if (daysOverdue <= 30) return { bucket: "1_30", daysOverdue };
  if (daysOverdue <= 60) return { bucket: "31_60", daysOverdue };
  if (daysOverdue <= 90) return { bucket: "61_90", daysOverdue };
  return { bucket: "90_plus", daysOverdue };
}

/**
 * @param {Array<{ balance?: unknown, due_date?: unknown, invoice_date?: unknown, reference_number?: unknown, original_amount?: unknown, customer_name?: unknown }>} rows
 * @param {string|null} asOfDate
 */
function formatUsdCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0";
  const fraction = Math.abs(n % 1) > 0.0005 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fraction,
    maximumFractionDigits: 2
  }).format(n);
}

export function formatOverdueCollectionReason({ overdueInvoiceCount, overdueBalance, maxDaysOverdue }) {
  const count = Number(overdueInvoiceCount) || 0;
  const invoiceWord = count === 1 ? "invoice" : "invoices";
  const verb = count === 1 ? "is" : "are";
  const days =
    maxDaysOverdue == null
      ? "an unknown number of days"
      : `${maxDaysOverdue} day${maxDaysOverdue === 1 ? "" : "s"}`;
  return `${count} ${invoiceWord} totaling ${formatUsdCompact(overdueBalance)} ${verb} overdue; oldest is ${days} past due.`;
}

export function buildOpenArAging(rows, asOfDate) {
  const aging = {
    current: emptyAgingBucket(),
    days1to30: emptyAgingBucket(),
    days31to60: emptyAgingBucket(),
    days61to90: emptyAgingBucket(),
    days90Plus: emptyAgingBucket(),
    unknown: emptyAgingBucket()
  };
  const keyFor = {
    current: "current",
    "1_30": "days1to30",
    "31_60": "days31to60",
    "61_90": "days61to90",
    "90_plus": "days90Plus",
    unknown: "unknown"
  };

  let overdueBalance = 0;
  let overdueInvoiceCount = 0;
  /** @type {object|null} */
  let oldestOverdueInvoice = null;
  let maxDaysOverdue = null;
  let knownDueCount = 0;
  let unknownDueCount = 0;

  for (const row of rows || []) {
    const bal = Number(row.balance);
    if (!Number.isFinite(bal) || bal <= 0) continue;
    const { bucket, daysOverdue } = classifyArAgingBucket(row.due_date, asOfDate);
    const key = keyFor[bucket];
    aging[key].balance = Math.round((aging[key].balance + bal) * 100) / 100;
    aging[key].count += 1;

    if (bucket === "unknown") {
      unknownDueCount += 1;
    } else {
      knownDueCount += 1;
    }

    if (bucket !== "current" && bucket !== "unknown") {
      overdueBalance = Math.round((overdueBalance + bal) * 100) / 100;
      overdueInvoiceCount += 1;
      if (daysOverdue != null && (maxDaysOverdue == null || daysOverdue > maxDaysOverdue)) {
        maxDaysOverdue = daysOverdue;
        oldestOverdueInvoice = {
          date: toYmd(row.invoice_date),
          dueDate: toYmd(row.due_date),
          referenceNumber: row.reference_number ? String(row.reference_number) : null,
          originalAmount: toMoney(row.original_amount),
          balance: toMoney(bal),
          customerName: row.customer_name ? String(row.customer_name) : null,
          daysOverdue
        };
      }
    }
  }

  /** @type {{ code: string, label: string, reason: string }} */
  let collectionAttention;
  if ((rows || []).length === 0) {
    collectionAttention = {
      code: "current",
      label: "Current",
      reason: "No open invoice balances."
    };
  } else if (knownDueCount === 0) {
    collectionAttention = {
      code: "unknown",
      label: "Unknown",
      reason: "Open A/R exists, but invoice due dates are missing so overdue aging cannot be confirmed."
    };
  } else if (overdueInvoiceCount === 0) {
    collectionAttention = {
      code: "current",
      label: "Current",
      reason: "Open invoices exist, and none are past due."
    };
  } else {
    const overdueReason = formatOverdueCollectionReason({
      overdueInvoiceCount,
      overdueBalance,
      maxDaysOverdue
    });
    if (maxDaysOverdue != null && maxDaysOverdue <= 30) {
      collectionAttention = { code: "watch", label: "Watch", reason: overdueReason };
    } else if (maxDaysOverdue != null && maxDaysOverdue <= 60) {
      collectionAttention = { code: "attention", label: "Attention", reason: overdueReason };
    } else {
      collectionAttention = { code: "priority", label: "Priority", reason: overdueReason };
    }
  }

  return {
    aging,
    overdueBalance,
    overdueInvoiceCount,
    oldestOverdueInvoice,
    collectionAttention,
    knownDueCount,
    unknownDueCount
  };
}

/**
 * Resolve staff-safe payment terms for linked root(s).
 * @param {string[]} termsCandidates
 * @returns {{ paymentTerms: string|null, warning: string|null }}
 */
export function resolvePaymentTermsLabel(termsCandidates) {
  const unique = [
    ...new Set(
      (termsCandidates || [])
        .map((t) => String(t ?? "").trim())
        .filter(Boolean)
    )
  ];
  if (unique.length === 0) return { paymentTerms: null, warning: null };
  if (unique.length === 1) return { paymentTerms: unique[0], warning: null };
  return {
    paymentTerms: "Multiple",
    warning: "Linked QuickBooks customer records have different payment terms."
  };
}

/**
 * Empty / fail-soft profile — amounts null (never fake $0).
 * @param {Partial<object>} [overrides]
 */
export function emptyFinancialsProfile(overrides = {}) {
  return {
    status: "unavailable",
    linked: false,
    asOfDate: null,
    refreshedAt: null,
    warnings: [],
    summary: {
      openAr: null,
      openInvoiceCount: null,
      invoicedYtd: null,
      collectedYtd: null,
      salesOrdersYtd: null,
      quotedYtd: null
    },
    lastInvoice: null,
    lastPayment: null,
    daysSinceLastPayment: null,
    oldestOpenInvoice: null,
    oldestOverdueInvoice: null,
    paymentTerms: null,
    overdueBalance: null,
    overdueInvoiceCount: null,
    aging: null,
    collectionAttention: null,
    recentActivity: [],
    openInvoices: { status: "unavailable", items: [], pagination: { page: 1, limit: 50, has_more: false } },
    monthlyTrend: { status: "unavailable", period: "trailing_12", points: [], notes: null },
    customerHistory: null,
    coverage: {
      workerCoverageStartDate: null,
      workerCoverageEndDate: null,
      latestSyncStatus: null
    },
    ...overrides
  };
}

/**
 * Active quickbooks_desktop root ListIDs for an account (exact links only).
 * @param {Array<{ isActive?: boolean, externalSystem?: string, external_system?: string, externalId?: string, external_id?: string }>} links
 * @returns {string[]}
 */
export function collectActiveQuickbooksRootListIds(links) {
  const ids = [];
  const seen = new Set();
  for (const link of links || []) {
    if (!link || link.isActive === false) continue;
    const system = String(link.externalSystem || link.external_system || "").trim();
    if (system !== ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM) continue;
    const id = String(link.externalId || link.external_id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   organizationId: string,
 *   rootListIds: string[],
 *   transactionType: string,
 *   startDate?: string|null,
 *   endDate?: string|null
 * }} args
 */
export async function sumLinkedTransactionsInRange(supabase, args) {
  const { organizationId, rootListIds, transactionType, startDate = null, endDate = null } = args;
  const roots = [...new Set((rootListIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!roots.length) return { count: 0, amount: 0 };

  const pageSize = AD_FINANCIALS_PAGE_SIZE;
  let count = 0;
  let amount = 0;
  let from = 0;

  for (;;) {
    let q = supabase
      .from("sales_quickbooks_financial_transactions")
      .select("amount")
      .eq("organization_id", organizationId)
      .eq("transaction_type", transactionType)
      .in("qb_root_customer_list_id", roots);
    if (startDate) q = q.gte("transaction_date", startDate);
    if (endDate) q = q.lte("transaction_date", endDate);
    q = q.order("source_id", { ascending: true }).range(from, from + pageSize - 1);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const n = Number(row.amount);
      if (Number.isFinite(n)) amount += n;
    }
    count += rows.length;
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { count, amount: Math.round(amount * 100) / 100 };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, rootListIds: string[] }} args
 */
export async function sumLinkedOpenAr(supabase, { organizationId, rootListIds }) {
  const roots = [...new Set((rootListIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!roots.length) {
    return { invoice_count: 0, amount: 0, rows: [] };
  }

  const pageSize = AD_FINANCIALS_PAGE_SIZE;
  /** @type {Array<object>} */
  const allRows = [];
  let from = 0;

  for (;;) {
    const q = supabase
      .from("sales_quickbooks_open_ar_current")
      .select("balance, invoice_date, due_date, terms_name, reference_number, customer_name, original_amount")
      .eq("organization_id", organizationId)
      .in("qb_root_customer_list_id", roots)
      .order("source_invoice_id", { ascending: true })
      .range(from, from + pageSize - 1);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const bal = Number(row.balance);
      if (Number.isFinite(bal) && bal > 0) allRows.push(row);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  let amount = 0;
  for (const row of allRows) {
    amount += Number(row.balance);
  }
  return {
    invoice_count: allRows.length,
    amount: Math.round(amount * 100) / 100,
    rows: allRows
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   organizationId: string,
 *   rootListIds: string[],
 *   transactionType: string,
 *   ascending: boolean
 * }} args
 */
async function loadLatestTransaction(supabase, { organizationId, rootListIds, transactionType, ascending }) {
  const roots = [...new Set((rootListIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!roots.length) return null;
  const { data, error } = await supabase
    .from("sales_quickbooks_financial_transactions")
    .select("transaction_date, reference_number, amount, customer_name, terms_name")
    .eq("organization_id", organizationId)
    .eq("transaction_type", transactionType)
    .in("qb_root_customer_list_id", roots)
    .order("transaction_date", { ascending })
    .order("source_id", { ascending })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data || [])[0];
  if (!row) return null;
  return {
    date: toYmd(row.transaction_date),
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    amount: toMoney(row.amount),
    customerName: row.customer_name ? String(row.customer_name) : null,
    termsName: row.terms_name ? String(row.terms_name).trim() : null
  };
}

/**
 * Latest nonblank terms_name per linked root (exact ListID), then reconcile.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, rootListIds: string[], openArRows?: Array<object> }} args
 */
async function resolveLinkedPaymentTerms(supabase, { organizationId, rootListIds, openArRows = [] }) {
  const roots = [...new Set((rootListIds || []).map((id) => String(id).trim()).filter(Boolean))];
  /** @type {string[]} */
  const fromInvoices = [];

  await Promise.all(
    roots.map(async (rootId) => {
      const { data, error } = await supabase
        .from("sales_quickbooks_financial_transactions")
        .select("terms_name, transaction_date, source_id")
        .eq("organization_id", organizationId)
        .eq("transaction_type", "invoice")
        .eq("qb_root_customer_list_id", rootId)
        .order("transaction_date", { ascending: false })
        .order("source_id", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      const hit = (data || []).find((r) => String(r.terms_name ?? "").trim());
      if (hit) fromInvoices.push(String(hit.terms_name).trim());
    })
  );

  let resolved = resolvePaymentTermsLabel(fromInvoices);
  if (resolved.paymentTerms) return resolved;

  const fromOpenAr = (openArRows || [])
    .map((r) => String(r.terms_name ?? "").trim())
    .filter(Boolean);
  return resolvePaymentTermsLabel(fromOpenAr);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, rootListIds: string[], limit?: number }} args
 */
async function loadRecentActivity(supabase, { organizationId, rootListIds, limit = AD_FINANCIALS_RECENT_LIMIT }) {
  const roots = [...new Set((rootListIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!roots.length) return [];
  const { data, error } = await supabase
    .from("sales_quickbooks_financial_transactions")
    .select("transaction_type, transaction_date, reference_number, amount, customer_name")
    .eq("organization_id", organizationId)
    .in("qb_root_customer_list_id", roots)
    .in("transaction_type", ["invoice", "payment", "sales_order", "estimate"])
    .order("transaction_date", { ascending: false })
    .order("source_id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    type: row.transaction_type,
    date: toYmd(row.transaction_date),
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    amount: toMoney(row.amount)
  }));
}

async function loadLinkedTransactionsForTrend(supabase, { organizationId, rootListIds, startDate, endDate }) {
  const roots = [...new Set((rootListIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!roots.length) return [];
  const pageSize = AD_FINANCIALS_PAGE_SIZE;
  const all = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from("sales_quickbooks_financial_transactions")
      .select("transaction_type, transaction_date, amount")
      .eq("organization_id", organizationId)
      .in("qb_root_customer_list_id", roots)
      .in("transaction_type", ["invoice", "payment", "sales_order", "estimate"]);
    if (startDate) q = q.gte("transaction_date", startDate);
    if (endDate) q = q.lte("transaction_date", endDate);
    q = q.order("source_id", { ascending: true }).range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @param {{ getAccount: Function, listExternalLinks: Function }} params.store
 * @param {string} params.organizationId
 * @param {string} params.accountId
 * @param {string|null|undefined} [params.role]
 * @param {NodeJS.ProcessEnv} [params.env]
 * @param {Date} [params.now]
 */
export async function getAccountDirectoryFinancials(params) {
  const {
    supabase,
    store,
    organizationId,
    accountId,
    role = null,
    env = process.env,
    now = new Date()
  } = params;

  if (!roleHasCapability(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
    throw new AccountDirectoryError(
      "forbidden",
      "Permission denied for this Account Directory action.",
      403
    );
  }

  const account = await store.getAccount(organizationId, accountId);
  if (!account) {
    throw new AccountDirectoryError("not_found", "Account not found.", 404);
  }

  const links = await store.listExternalLinks(organizationId, accountId);
  const rootListIds = collectActiveQuickbooksRootListIds(links);

  if (!rootListIds.length) {
    return scrubFinancialIds(
      emptyFinancialsProfile({
        status: "unlinked",
        linked: false,
        warnings: [
          "QuickBooks financials are unavailable until this Account Directory record is linked to QuickBooks."
        ]
      })
    );
  }

  const warnings = [];
  if (rootListIds.length > 1) {
    warnings.push(
      `Financials include ${rootListIds.length} linked QuickBooks customer records.`
    );
  }

  let latest;
  try {
    latest = await loadLatestSuccessfulQbSyncRun(supabase, organizationId);
  } catch (err) {
    const msg = String(err?.message ?? err);
    const missing = /relation .* does not exist|Could not find the table|schema cache/i.test(msg);
    return scrubFinancialIds(
      emptyFinancialsProfile({
        status: "unavailable",
        linked: true,
        warnings: [
          ...warnings,
          missing
            ? "QuickBooks financial prepared facts are not available yet."
            : "QuickBooks financial sync health could not be loaded."
        ]
      })
    );
  }

  if (!latest?.completed_at) {
    return scrubFinancialIds(
      emptyFinancialsProfile({
        status: "unavailable",
        linked: true,
        warnings: [...warnings, "No successful QuickBooks financial sync has completed yet."]
      })
    );
  }

  const asOfDate =
    toYmd(latest.coverage_end_date) || toYmd(String(latest.completed_at).slice(0, 10));

  const completedAt = new Date(latest.completed_at);
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 1000));
  const staleAfter = readStaleAfterSeconds(env);
  const receivablesFresh = buildSourceFreshness({
    label: "Open receivables",
    refreshedAt: completedAt.toISOString(),
    asOfDate,
    now,
    staleAfterSeconds: staleAfter
  });

  try {
    const [openAr, historyBundle] = await Promise.all([
      sumLinkedOpenAr(supabase, { organizationId, rootListIds }),
      loadCustomerHistoryBundle({
        supabase,
        organizationId,
        rootListIds,
        env,
        now
      })
    ]);
    const history = historyBundle.history;
    const historyAsOf = historyBundle.asOf || asOfDate;
    const historyFresh = buildSourceFreshness({
      label: "Commercial history",
      refreshedAt: history?.coverage?.freshness?.refreshedAt || null,
      asOfDate: historyAsOf,
      now,
      staleAfterSeconds: readHistoryStaleAfterSeconds(env)
    });
    const isStale = receivablesFresh.isStale || historyFresh.isStale;

    const ytd = history?.ytd || null;
    const lastInvoiceFromHistory = (historyBundle.rows || []).find((r) => r.type === "invoice") || null;
    const lastPaymentFromHistory = (historyBundle.rows || []).find((r) => r.type === "payment") || null;
    const lastInvoice = lastInvoiceFromHistory
      ? {
          date: lastInvoiceFromHistory.date,
          referenceNumber: lastInvoiceFromHistory.referenceNumber,
          amount: lastInvoiceFromHistory.amount,
          customerName: lastInvoiceFromHistory.customerName
        }
      : await loadLatestTransaction(supabase, {
          organizationId,
          rootListIds,
          transactionType: "invoice",
          ascending: false
        });
    const lastPayment = lastPaymentFromHistory
      ? {
          date: lastPaymentFromHistory.date,
          referenceNumber: lastPaymentFromHistory.referenceNumber,
          amount: lastPaymentFromHistory.amount,
          customerName: lastPaymentFromHistory.customerName
        }
      : await loadLatestTransaction(supabase, {
          organizationId,
          rootListIds,
          transactionType: "payment",
          ascending: false
        });
    const recentActivity = (historyBundle.rows || []).slice(0, AD_FINANCIALS_RECENT_LIMIT).map((row) => ({
      type: row.type,
      date: row.date,
      referenceNumber: row.referenceNumber,
      customerName: row.customerName,
      amount: row.amount
    }));

    const coverageStart = history?.coverage?.startDate || toYmd(latest.coverage_start_date);
    const coverageEnd = history?.coverage?.endDate || toYmd(latest.coverage_end_date) || asOfDate;
    const trendWindow = resolveCustomerTrendWindow("trailing_12", historyAsOf, coverageStart, coverageEnd);
    const trendRows = (historyBundle.rows || []).map((row) => ({
      transaction_type: row.type,
      transaction_date: row.date,
      amount: row.amount
    }));

    /** @type {object|null} */
    let oldestOpenInvoice = null;
    if (openAr.rows.length) {
      let best = null;
      for (const row of openAr.rows) {
        const d = toYmd(row.invoice_date);
        if (!d) continue;
        if (!best || d < best.date) {
          best = {
            date: d,
            referenceNumber: row.reference_number ? String(row.reference_number) : null,
            originalAmount: toMoney(row.original_amount),
            balance: toMoney(row.balance),
            customerName: row.customer_name ? String(row.customer_name) : null,
            ageDays: daysBetweenYmd(d, asOfDate)
          };
        }
      }
      oldestOpenInvoice = best;
    }

    const agingBuilt = buildOpenArAging(openAr.rows, asOfDate);
    if (agingBuilt.unknownDueCount > 0 && agingBuilt.knownDueCount > 0) {
      warnings.push(
        `Some open A/R invoices are missing QuickBooks due dates (${agingBuilt.unknownDueCount}). Aging uses DueDate only.`
      );
    } else if (agingBuilt.unknownDueCount > 0 && openAr.rows.length > 0) {
      warnings.push("Open A/R invoices are missing QuickBooks due dates. Aging cannot be classified.");
    }

    const termsResolved = await resolveLinkedPaymentTerms(supabase, {
      organizationId,
      rootListIds,
      openArRows: openAr.rows
    });
    if (termsResolved.warning) warnings.push(termsResolved.warning);

    if (latest.status === "partial") {
      warnings.push("Latest QuickBooks financial sync completed with partial status.");
    }

    return scrubFinancialIds({
      status: isStale ? "stale" : "ok",
      linked: true,
      asOfDate: historyAsOf || asOfDate,
      refreshedAt: history?.coverage?.freshness?.refreshedAt || completedAt.toISOString(),
      freshness: {
        receivables: receivablesFresh,
        commercialHistory: historyFresh
      },
      warnings,
      summary: {
        openAr: openAr.amount,
        openInvoiceCount: openAr.invoice_count,
        invoicedYtd: ytd?.invoices?.amount ?? 0,
        collectedYtd: ytd?.payments?.amount ?? 0,
        salesOrdersYtd: ytd?.salesOrders?.amount ?? 0,
        quotedYtd: ytd?.estimates?.amount ?? 0
      },
      lastInvoice: lastInvoice
        ? {
            date: lastInvoice.date,
            referenceNumber: lastInvoice.referenceNumber,
            amount: lastInvoice.amount,
            customerName: lastInvoice.customerName
          }
        : null,
      lastPayment: lastPayment
        ? {
            date: lastPayment.date,
            referenceNumber: lastPayment.referenceNumber,
            amount: lastPayment.amount,
            customerName: lastPayment.customerName
          }
        : null,
      daysSinceLastPayment: daysBetweenYmd(lastPayment?.date ?? null, historyAsOf || asOfDate),
      oldestOpenInvoice,
      oldestOverdueInvoice: agingBuilt.oldestOverdueInvoice,
      paymentTerms: termsResolved.paymentTerms,
      overdueBalance: agingBuilt.overdueBalance,
      overdueInvoiceCount: agingBuilt.overdueInvoiceCount,
      aging: agingBuilt.aging,
      collectionAttention: agingBuilt.collectionAttention,
      recentActivity,
      openInvoices: {
        status: "ok",
        pagination: { page: 1, limit: 50, has_more: openAr.rows.length > 50 },
        items: [...openAr.rows]
          .sort((a, b) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || "")))
          .slice(0, 50)
          .map((row) => mapOpenInvoiceRow(row, asOfDate))
      },
      monthlyTrend: trendWindow.ok
        ? {
            status: isStale ? "stale" : "ok",
            period: trendWindow.period,
            start: trendWindow.start,
            end: trendWindow.end,
            notes: trendWindow.notes,
            points: buildCustomerMonthlyPoints(trendRows, monthKeysInclusive(trendWindow.start, trendWindow.end))
          }
        : {
            status: "unavailable",
            period: trendWindow.period,
            start: trendWindow.start,
            end: trendWindow.end,
            notes: trendWindow.notes,
            points: []
          },
      customerHistory: history,
      coverage: {
        workerCoverageStartDate: coverageStart,
        workerCoverageEndDate: coverageEnd,
        latestSyncStatus: latest.status || null,
        historyLabel: history?.coverage?.label || null,
        arIsSnapshot: true,
        receivablesAsOf: asOfDate,
        historyAsOf
      }
    });
  } catch (err) {
    const msg = String(err?.message ?? err);
    return scrubFinancialIds(
      emptyFinancialsProfile({
        status: "unavailable",
        linked: true,
        asOfDate,
        refreshedAt: completedAt.toISOString(),
        warnings: [
          ...warnings,
          /relation .* does not exist|Could not find the table|schema cache|column/i.test(msg)
            ? "QuickBooks financial prepared facts are incomplete or unavailable."
            : "QuickBooks financial facts could not be loaded."
        ],
        coverage: {
          workerCoverageStartDate: toYmd(latest.coverage_start_date),
          workerCoverageEndDate: toYmd(latest.coverage_end_date),
          latestSyncStatus: latest.status || null
        }
      })
    );
  }
}
