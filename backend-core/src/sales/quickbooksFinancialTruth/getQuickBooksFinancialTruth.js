/**
 * Orchestrates QuickBooks Financial Truth for Sales Dashboard (fail-soft).
 */

import { createRequire } from "node:module";
import {
  emptyQuickBooksFinancialTruth,
  OPEN_AR_BASIS_AS_OF_REFRESH,
  QB_FINANCIAL_TRUTH_STATUSES
} from "./contract.js";
import { detectSupportedCDataQuickBooksClient, readQuickBooksFinancialTruthConfig } from "./config.js";
import { createFixtureQuickBooksFinancialTruthProvider } from "./fixtureProvider.js";
import { sanitizeErrorMessage, sanitizeFinancialTruthDiagnostics } from "./sanitize.js";

const require = createRequire(import.meta.url);

/**
 * @param {{ startDate?: string|null, endDate?: string|null, env?: NodeJS.ProcessEnv, provider?: { getQuickBooksFinancialTruth: Function }|null }} [params]
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
        deployment_blocker:
          "Production Brain on Vercel has no stable egress IP for Gateway allowlists. Prefer a Windows worker with approved static egress once a supported CData client is installed."
      })
    });
  }

  if (params.provider) {
    const row = await params.provider.getQuickBooksFinancialTruth({ startDate, endDate });
    return finalizePublicRow(row, startDate, endDate);
  }

  if (config.providerName === "fixture") {
    const provider = createFixtureQuickBooksFinancialTruthProvider();
    const row = await provider.getQuickBooksFinancialTruth({ startDate, endDate });
    return finalizePublicRow(row, startDate, endDate);
  }

  const client = detectSupportedCDataQuickBooksClient({
    env,
    requireResolve: (id) => require.resolve(id)
  });

  if (!client.available) {
    return emptyQuickBooksFinancialTruth({
      status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
      refreshed_at: new Date().toISOString(),
      date_range: { start_date: startDate, end_date: endDate },
      warnings: [
        "QuickBooks Financial Truth is unavailable: no supported CData QuickBooks client is installed in this runtime."
      ],
      diagnostics: sanitizeFinancialTruthDiagnostics({
        reason: "missing_supported_cdata_client",
        client_reason: client.reason,
        config: config.summary,
        open_ar_basis: OPEN_AR_BASIS_AS_OF_REFRESH,
        next_actions: [
          "Install a licensed/supported CData QuickBooks client (JDBC/ODBC/ADO.NET or documented Gateway client) into the backend runtime that will call QuickBooks.",
          "Do not use raw HTTP QBXML POST to the Remote Connector root endpoint as production transport (previously observed HTTP 200 with empty body).",
          "Deploy the live reader on a host with an approved stable egress IP allowlisted to the QB Gateway (port 8166). Do not broaden firewall to Any.",
          "Keep slabos_ro read-only; never authorize personal-data fields for this Sales Beta."
        ],
        deployment_blocker:
          "backend-core on Vercel has no stable egress IP; Gateway allowlisting requires a separate worker/bridge with approved static egress."
      })
    });
  }

  // A supported client module resolved, but no production adapter is wired yet.
  return emptyQuickBooksFinancialTruth({
    status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
    refreshed_at: new Date().toISOString(),
    date_range: { start_date: startDate, end_date: endDate },
    warnings: [
      `Supported client detected (${client.clientId}) but no production QuickBooks Financial Truth adapter is wired yet.`
    ],
    diagnostics: sanitizeFinancialTruthDiagnostics({
      reason: "adapter_not_wired",
      supported_client_id: client.clientId,
      config: config.summary,
      open_ar_basis: OPEN_AR_BASIS_AS_OF_REFRESH
    })
  });
}

/**
 * Fail-soft wrapper: never throws into Sales dashboard handlers.
 * @param {{ startDate?: string|null, endDate?: string|null, env?: NodeJS.ProcessEnv, provider?: object|null }} [params]
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
  // Ensure Sales Orders label semantics stay in diagnostics, never "Booked".
  if (out.diagnostics && typeof out.diagnostics === "object") {
    out.diagnostics.label_sales_orders = "Sales Orders $";
  }
  out.warnings = Array.isArray(out.warnings)
    ? out.warnings.map((w) => sanitizeErrorMessage(w)).filter(Boolean)
    : [];
  return out;
}
