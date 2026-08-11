/**
 * Read prepared QuickBooks Sales facts from Supabase for Financial Truth Beta.
 */

import {
  emptyQuickBooksFinancialTruth,
  OPEN_AR_BASIS_AS_OF_REFRESH,
  QB_FINANCIAL_TRUTH_STATUSES
} from "./contract.js";
import { sanitizeFinancialTruthDiagnostics } from "./sanitize.js";

export const QB_FINANCIAL_TRUTH_SOURCE_ODBC = "quickbooks_desktop_odbc";

/** Default: 4 hours (sync cadence target is ~15 minutes). */
export const DEFAULT_STALE_AFTER_SECONDS = 4 * 60 * 60;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readStaleAfterSeconds(env = process.env) {
  const n = Number.parseInt(String(env.QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS ?? ""), 10);
  if (Number.isFinite(n) && n >= 60) return n;
  return DEFAULT_STALE_AFTER_SECONDS;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 */
export async function loadLatestSuccessfulQbSyncRun(supabase, organizationId) {
  const { data, error } = await supabase
    .from("sales_quickbooks_sync_runs")
    .select(
      "id, status, completed_at, started_at, worker_version, company_name, coverage_start_date, coverage_end_date, estimates_count, sales_orders_count, invoices_count, payments_count, open_ar_count, warnings, error_summary"
    )
    .eq("organization_id", organizationId)
    .in("status", ["success", "partial"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, startDate: string|null, endDate: string|null, transactionType: string }} args
 */
export async function sumTransactionsInRange(supabase, { organizationId, startDate, endDate, transactionType }) {
  let q = supabase
    .from("sales_quickbooks_financial_transactions")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("transaction_type", transactionType);
  if (startDate) q = q.gte("transaction_date", startDate);
  if (endDate) q = q.lte("transaction_date", endDate);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data || [];
  let amount = 0;
  for (const row of rows) {
    const n = Number(row.amount);
    if (Number.isFinite(n)) amount += n;
  }
  return { count: rows.length, amount: Math.round(amount * 100) / 100 };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 */
export async function sumCurrentOpenAr(supabase, organizationId) {
  const { data, error } = await supabase
    .from("sales_quickbooks_open_ar_current")
    .select("balance")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  const rows = data || [];
  let amount = 0;
  for (const row of rows) {
    const n = Number(row.balance);
    if (Number.isFinite(n) && n > 0) amount += n;
  }
  return { invoice_count: rows.length, amount: Math.round(amount * 100) / 100 };
}

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   organizationId: string,
 *   startDate?: string|null,
 *   endDate?: string|null,
 *   env?: NodeJS.ProcessEnv,
 *   now?: Date
 * }} params
 */
export async function getPreparedQuickBooksFinancialTruth(params) {
  const {
    supabase,
    organizationId,
    startDate = null,
    endDate = null,
    env = process.env,
    now = new Date()
  } = params;

  if (!organizationId) {
    return emptyQuickBooksFinancialTruth({
      status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
      source: QB_FINANCIAL_TRUTH_SOURCE_ODBC,
      refreshed_at: now.toISOString(),
      date_range: { start_date: startDate, end_date: endDate },
      warnings: ["QuickBooks financial truth requires organization context."],
      diagnostics: { reason: "missing_organization_id" }
    });
  }

  let latest;
  try {
    latest = await loadLatestSuccessfulQbSyncRun(supabase, organizationId);
  } catch (err) {
    const msg = String(err?.message ?? err);
    const missingTable = /relation .* does not exist|Could not find the table/i.test(msg);
    return emptyQuickBooksFinancialTruth({
      status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
      source: QB_FINANCIAL_TRUTH_SOURCE_ODBC,
      refreshed_at: now.toISOString(),
      date_range: { start_date: startDate, end_date: endDate },
      warnings: [
        missingTable
          ? "QuickBooks prepared facts tables are not installed yet."
          : "QuickBooks sync health query failed."
      ],
      diagnostics: sanitizeFinancialTruthDiagnostics({
        reason: missingTable ? "tables_missing" : "sync_health_query_failed",
        source: QB_FINANCIAL_TRUTH_SOURCE_ODBC
      })
    });
  }

  if (!latest?.completed_at) {
    return emptyQuickBooksFinancialTruth({
      status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
      source: QB_FINANCIAL_TRUTH_SOURCE_ODBC,
      refreshed_at: now.toISOString(),
      date_range: { start_date: startDate, end_date: endDate },
      warnings: ["No successful QuickBooks ODBC sync has completed yet."],
      diagnostics: sanitizeFinancialTruthDiagnostics({
        reason: "no_successful_sync",
        source: QB_FINANCIAL_TRUTH_SOURCE_ODBC
      })
    });
  }

  const completedAt = new Date(latest.completed_at);
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 1000));
  const staleAfter = readStaleAfterSeconds(env);
  const isStale = ageSeconds > staleAfter;

  let estimates;
  let salesOrders;
  let invoices;
  let payments;
  let openAr;
  try {
    [estimates, salesOrders, invoices, payments, openAr] = await Promise.all([
      sumTransactionsInRange(supabase, {
        organizationId,
        startDate,
        endDate,
        transactionType: "estimate"
      }),
      sumTransactionsInRange(supabase, {
        organizationId,
        startDate,
        endDate,
        transactionType: "sales_order"
      }),
      sumTransactionsInRange(supabase, {
        organizationId,
        startDate,
        endDate,
        transactionType: "invoice"
      }),
      sumTransactionsInRange(supabase, {
        organizationId,
        startDate,
        endDate,
        transactionType: "payment"
      }),
      sumCurrentOpenAr(supabase, organizationId)
    ]);
  } catch (err) {
    return emptyQuickBooksFinancialTruth({
      status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
      source: QB_FINANCIAL_TRUTH_SOURCE_ODBC,
      refreshed_at: completedAt.toISOString(),
      date_range: { start_date: startDate, end_date: endDate },
      warnings: ["QuickBooks prepared facts query failed."],
      diagnostics: sanitizeFinancialTruthDiagnostics({
        reason: "prepared_facts_query_failed",
        source: QB_FINANCIAL_TRUTH_SOURCE_ODBC
      })
    });
  }

  const status = isStale ? QB_FINANCIAL_TRUTH_STATUSES.STALE : QB_FINANCIAL_TRUTH_STATUSES.OK;
  const warnings = [];
  if (isStale) {
    warnings.push(
      `QuickBooks sync is stale (last success ${ageSeconds}s ago; threshold ${staleAfter}s). Totals still reflect prepared facts.`
    );
  }
  if (latest.status === "partial") {
    warnings.push("Latest QuickBooks sync completed with partial status.");
  }
  if (Array.isArray(latest.warnings)) {
    for (const w of latest.warnings.slice(0, 3)) {
      if (w) warnings.push(String(w).slice(0, 200));
    }
  }

  return emptyQuickBooksFinancialTruth({
    status,
    source: QB_FINANCIAL_TRUTH_SOURCE_ODBC,
    refreshed_at: completedAt.toISOString(),
    date_range: { start_date: startDate, end_date: endDate },
    estimates: { count: estimates.count, amount: estimates.amount },
    sales_orders: { count: salesOrders.count, amount: salesOrders.amount },
    invoices: { count: invoices.count, amount: invoices.amount },
    payments: { count: payments.count, amount: payments.amount },
    open_ar: {
      invoice_count: openAr.invoice_count,
      amount: openAr.amount,
      basis: OPEN_AR_BASIS_AS_OF_REFRESH,
      basis_note:
        "Open A/R is the sum of current unpaid QuickBooks invoice balances as of the latest worker refresh (not historical as-of the selected end date)."
    },
    warnings,
    diagnostics: sanitizeFinancialTruthDiagnostics({
      reason: isStale ? "stale_sync" : "prepared_facts_ok",
      source: QB_FINANCIAL_TRUTH_SOURCE_ODBC,
      last_success_at: completedAt.toISOString(),
      age_seconds: ageSeconds,
      stale_after_seconds: staleAfter,
      coverage_start_date: latest.coverage_start_date || null,
      coverage_end_date: latest.coverage_end_date || null,
      worker_version: latest.worker_version || null,
      company_name: latest.company_name || null,
      label_sales_orders: "Sales Orders $"
    })
  });
}
