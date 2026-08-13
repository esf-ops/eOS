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

export const AD_FINANCIALS_PAGE_SIZE = PREPARED_FACTS_PAGE_SIZE;
export const AD_FINANCIALS_RECENT_LIMIT = 20;

const FORBIDDEN_RESPONSE_KEY =
  /^(qb_customer_list_id|qb_root_customer_list_id|external_id|externalId|list_id|listId|qb_list_id|source_id|source_invoice_id)$/i;

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
    recentActivity: [],
    coverage: {
      workerCoverageStartDate: null,
      workerCoverageEndDate: null,
      latestSyncStatus: null
    },
    ...overrides
  };
}

/**
 * Strip any QB ListID / external id keys from a JSON-safe tree.
 * @param {unknown} value
 */
export function scrubFinancialIds(value) {
  if (Array.isArray(value)) return value.map(scrubFinancialIds);
  if (!value || typeof value !== "object") return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_KEY.test(k)) continue;
    out[k] = scrubFinancialIds(v);
  }
  return out;
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
      .select("balance, invoice_date, reference_number, customer_name, original_amount")
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
    .select("transaction_date, reference_number, amount, customer_name")
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
    customerName: row.customer_name ? String(row.customer_name) : null
  };
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
  const ytdStart = ytdStartForAsOf(asOfDate || String(now.toISOString()).slice(0, 10));
  const ytdEnd = asOfDate;

  const completedAt = new Date(latest.completed_at);
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 1000));
  const staleAfter = readStaleAfterSeconds(env);
  const isStale = ageSeconds > staleAfter;

  try {
    const [quoted, salesOrders, invoiced, collected, openAr, lastInvoice, lastPayment, recentActivity] =
      await Promise.all([
        sumLinkedTransactionsInRange(supabase, {
          organizationId,
          rootListIds,
          transactionType: "estimate",
          startDate: ytdStart,
          endDate: ytdEnd
        }),
        sumLinkedTransactionsInRange(supabase, {
          organizationId,
          rootListIds,
          transactionType: "sales_order",
          startDate: ytdStart,
          endDate: ytdEnd
        }),
        sumLinkedTransactionsInRange(supabase, {
          organizationId,
          rootListIds,
          transactionType: "invoice",
          startDate: ytdStart,
          endDate: ytdEnd
        }),
        sumLinkedTransactionsInRange(supabase, {
          organizationId,
          rootListIds,
          transactionType: "payment",
          startDate: ytdStart,
          endDate: ytdEnd
        }),
        sumLinkedOpenAr(supabase, { organizationId, rootListIds }),
        loadLatestTransaction(supabase, {
          organizationId,
          rootListIds,
          transactionType: "invoice",
          ascending: false
        }),
        loadLatestTransaction(supabase, {
          organizationId,
          rootListIds,
          transactionType: "payment",
          ascending: false
        }),
        loadRecentActivity(supabase, { organizationId, rootListIds })
      ]);

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

    if (isStale) {
      warnings.push(
        `QuickBooks financial data is stale (last success ${ageSeconds}s ago; threshold ${staleAfter}s). Showing last prepared values.`
      );
    }
    if (latest.status === "partial") {
      warnings.push("Latest QuickBooks financial sync completed with partial status.");
    }

    return scrubFinancialIds({
      status: isStale ? "stale" : "ok",
      linked: true,
      asOfDate,
      refreshedAt: completedAt.toISOString(),
      warnings,
      summary: {
        openAr: openAr.amount,
        openInvoiceCount: openAr.invoice_count,
        invoicedYtd: invoiced.amount,
        collectedYtd: collected.amount,
        salesOrdersYtd: salesOrders.amount,
        quotedYtd: quoted.amount
      },
      lastInvoice,
      lastPayment,
      daysSinceLastPayment: daysBetweenYmd(lastPayment?.date ?? null, asOfDate),
      oldestOpenInvoice,
      recentActivity,
      coverage: {
        workerCoverageStartDate: toYmd(latest.coverage_start_date),
        workerCoverageEndDate: toYmd(latest.coverage_end_date),
        latestSyncStatus: latest.status || null
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
