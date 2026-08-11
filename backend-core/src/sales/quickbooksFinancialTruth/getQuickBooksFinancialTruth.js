/**
 * Orchestrates QuickBooks Financial Truth for Sales Dashboard (fail-soft).
 *
 * Preferred production path: prepared Supabase facts from the Windows ODBC worker.
 * Does not connect to QuickBooks from Vercel/backend-core.
 */

import {
  emptyQuickBooksFinancialTruth,
  OPEN_AR_BASIS_AS_OF_REFRESH,
  QB_FINANCIAL_TRUTH_STATUSES
} from "./contract.js";
import { readQuickBooksFinancialTruthConfig } from "./config.js";
import { createFixtureQuickBooksFinancialTruthProvider } from "./fixtureProvider.js";
import { getPreparedQuickBooksFinancialTruth } from "./preparedFactsProvider.js";
import { sanitizeErrorMessage, sanitizeFinancialTruthDiagnostics } from "./sanitize.js";

/**
 * @param {{
 *   startDate?: string|null,
 *   endDate?: string|null,
 *   organizationId?: string|null,
 *   supabase?: import('@supabase/supabase-js').SupabaseClient|null,
 *   env?: NodeJS.ProcessEnv,
 *   provider?: { getQuickBooksFinancialTruth: Function }|null
 * }} [params]
 */
export async function getQuickBooksFinancialTruth(params = {}) {
  const startDate = params.startDate ?? null;
  const endDate = params.endDate ?? null;
  const env = params.env || process.env;
  const config = readQuickBooksFinancialTruthConfig(env);

  if (!config.enabled) {
    return emptyQuickBooksFinancialTruth({
      status: QB_FINANCIAL_TRUTH_STATUSES.DISABLED,
      refreshed_at: new Date().toISOString(),
      date_range: { start_date: startDate, end_date: endDate },
      warnings: [
        "QuickBooks Financial Truth is disabled (QB_FINANCIAL_TRUTH_ENABLED is not set)."
      ],
      diagnostics: sanitizeFinancialTruthDiagnostics({
        reason: "feature_flag_off",
        config: config.summary,
        open_ar_basis: OPEN_AR_BASIS_AS_OF_REFRESH,
        transport: "windows_odbc_worker_prepared_facts"
      })
    });
  }

  if (params.provider) {
    const row = await params.provider.getQuickBooksFinancialTruth({
      startDate,
      endDate,
      organizationId: params.organizationId
    });
    return finalizePublicRow(row, startDate, endDate);
  }

  if (config.providerName === "fixture") {
    const provider = createFixtureQuickBooksFinancialTruthProvider();
    const row = await provider.getQuickBooksFinancialTruth({ startDate, endDate });
    return finalizePublicRow(row, startDate, endDate);
  }

  if (params.supabase && params.organizationId) {
    const row = await getPreparedQuickBooksFinancialTruth({
      supabase: params.supabase,
      organizationId: params.organizationId,
      startDate,
      endDate,
      env
    });
    return finalizePublicRow(row, startDate, endDate);
  }

  return emptyQuickBooksFinancialTruth({
    status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
    refreshed_at: new Date().toISOString(),
    date_range: { start_date: startDate, end_date: endDate },
    warnings: [
      "QuickBooks Financial Truth is enabled but prepared-facts context is missing (organization or database client)."
    ],
    diagnostics: sanitizeFinancialTruthDiagnostics({
      reason: "missing_prepared_facts_context",
      config: config.summary,
      open_ar_basis: OPEN_AR_BASIS_AS_OF_REFRESH,
      next_actions: [
        "Apply eliteos_sales_quickbooks_financial_truth_v1.sql in Supabase.",
        "Run the Windows ODBC worker against DSN slabOS_QuickBooks_Local_RO.",
        "Set QB_SALES_SYNC_INGEST_TOKEN and worker ingest URL/token env vars."
      ]
    })
  });
}

/**
 * Fail-soft wrapper: never throws into Sales dashboard handlers.
 * @param {Parameters<typeof getQuickBooksFinancialTruth>[0]} [params]
 */
export async function getQuickBooksFinancialTruthSafe(params = {}) {
  try {
    return await getQuickBooksFinancialTruth(params);
  } catch (err) {
    const startDate = params.startDate ?? null;
    const endDate = params.endDate ?? null;
    return emptyQuickBooksFinancialTruth({
      status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
      refreshed_at: new Date().toISOString(),
      date_range: { start_date: startDate, end_date: endDate },
      warnings: [sanitizeErrorMessage(err?.message ?? err)],
      diagnostics: sanitizeFinancialTruthDiagnostics({
        reason: "provider_exception",
        open_ar_basis: OPEN_AR_BASIS_AS_OF_REFRESH
      })
    });
  }
}

function finalizePublicRow(row, startDate, endDate) {
  const out = emptyQuickBooksFinancialTruth({
    ...row,
    date_range: {
      start_date: row?.date_range?.start_date ?? startDate,
      end_date: row?.date_range?.end_date ?? endDate
    },
    diagnostics: sanitizeFinancialTruthDiagnostics(row?.diagnostics || {})
  });
  if (out.diagnostics && typeof out.diagnostics === "object") {
    out.diagnostics.label_sales_orders = "Sales Orders $";
  }
  out.warnings = Array.isArray(out.warnings)
    ? out.warnings.map((w) => sanitizeErrorMessage(w)).filter(Boolean)
    : [];
  return out;
}
