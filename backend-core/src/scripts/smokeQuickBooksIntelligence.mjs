#!/usr/bin/env node
/**
 * smokeQuickBooksIntelligence — Phase 4C safe live smoke for QuickBooks intelligence.
 *
 * Connects ONLY when a human runs this script with env already set. Uses a conservative
 * maxRows so large staging tables do not fully load. Prints safe counts / section names /
 * booleans only — never names, addresses, memos, invoice numbers, amounts, raw_payload,
 * or secret values.
 *
 * Usage:
 *   QB_IMPORT_ORGANIZATION_ID=<org-uuid> \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node backend-core/src/scripts/smokeQuickBooksIntelligence.mjs
 *
 * Optional:
 *   QB_INTELLIGENCE_SMOKE_MAX_ROWS=50   (default 50, max 500)
 *   QB_INTELLIGENCE_SMOKE_PAGE_SIZE=50  (default 50)
 *   QB_INTELLIGENCE_SMOKE_AS_OF=YYYY-MM-DD
 *
 * Exit codes: 0 = smoke ok, 1 = missing env / failure.
 */

import process from "node:process";

import { createQuickBooksIntelligenceSupabaseRepository as defaultCreateRepository } from "../quickbooks/quickBooksIntelligenceSupabaseRepository.js";
import { loadExecutiveIntelligenceSnapshot as defaultLoadSnapshot } from "../quickbooks/quickBooksIntelligenceService.js";
import { assertNoRawPayload } from "../quickbooks/quickBooksIntelligenceFacts.js";

export const REQUIRED_ENV = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "QB_IMPORT_ORGANIZATION_ID",
]);

export const SMOKE_DEFAULT_MAX_ROWS = 50;
export const SMOKE_DEFAULT_PAGE_SIZE = 50;
export const SMOKE_MAX_ROWS_CEILING = 500;

/**
 * @param {string|undefined} raw
 * @param {number} fallback
 * @param {number} ceiling
 * @returns {number}
 */
export function parsePositiveIntEnv(raw, fallback, ceiling) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(ceiling, n);
}

/**
 * Format smoke output: section presence + counts only. Never amounts or PII.
 *
 * @param {object} snapshot
 * @param {{
 *   organizationId: string,
 *   maxRows: number,
 *   pageSize: number,
 *   asOfDate: string|null,
 * }} ctx
 * @returns {string[]}
 */
export function formatSmokeResultLines(snapshot, ctx) {
  const loadMeta = snapshot?.load_meta ?? {};
  const counts = loadMeta.staging_row_counts ?? {};
  const insights = snapshot?.insights ?? {};

  const sectionPresent = (key) => Boolean(snapshot?.[key]);

  const lines = [
    "EliteOS QuickBooks intelligence smoke (backend-core, service-role)",
    `Organization: ${ctx.organizationId}`,
    `As of: ${ctx.asOfDate ?? snapshot?.as_of_date ?? "(default)"}`,
    `max_rows: ${ctx.maxRows}`,
    `page_size: ${ctx.pageSize}`,
    `generated_at_present: ${Boolean(snapshot?.generated_at)}`,
    "",
    "Sections present:",
    `  ar_summary: ${sectionPresent("ar_summary")}`,
    `  revenue_summary: ${sectionPresent("revenue_summary")}`,
    `  payment_summary: ${sectionPresent("payment_summary")}`,
    `  estimate_sales_order_invoice_flow: ${sectionPresent("estimate_sales_order_invoice_flow")}`,
    `  sales_rep_summary: ${sectionPresent("sales_rep_summary")}`,
    `  customer_activity_trend: ${sectionPresent("customer_activity_trend")}`,
    `  insights: ${sectionPresent("insights")}`,
    `  insight_list: ${Array.isArray(snapshot?.insight_list)}`,
    "",
    "Safe counts:",
    `  staging_customers: ${counts.customers ?? 0}`,
    `  staging_invoices: ${counts.invoices ?? 0}`,
    `  staging_payments: ${counts.payments ?? 0}`,
    `  staging_estimates: ${counts.estimates ?? 0}`,
    `  staging_sales_orders: ${counts.sales_orders ?? 0}`,
    `  staging_sales_reps: ${counts.sales_reps ?? 0}`,
    `  staging_invoice_lines: ${counts.invoice_lines ?? 0}`,
    `  ar_open_invoice_count: ${snapshot?.ar_summary?.open_invoice_count ?? 0}`,
    `  ar_overdue_invoice_count: ${snapshot?.ar_summary?.overdue_invoice_count ?? 0}`,
    `  revenue_customer_count: ${snapshot?.revenue_summary?.totals?.customer_count ?? 0}`,
    `  payment_customer_count: ${snapshot?.payment_summary?.totals?.customer_count ?? 0}`,
    `  payment_count: ${snapshot?.payment_summary?.totals?.payment_count ?? 0}`,
    `  estimate_count: ${snapshot?.estimate_sales_order_invoice_flow?.estimates?.count ?? 0}`,
    `  sales_order_count: ${snapshot?.estimate_sales_order_invoice_flow?.sales_orders?.count ?? 0}`,
    `  invoice_count: ${snapshot?.estimate_sales_order_invoice_flow?.invoices?.count ?? 0}`,
    `  sales_rep_count: ${snapshot?.sales_rep_summary?.sales_reps?.length ?? 0}`,
    `  activity_month_count: ${snapshot?.customer_activity_trend?.months?.length ?? 0}`,
    `  insight_list_count: ${snapshot?.insight_list?.length ?? 0}`,
    "",
    "Insight keys present:",
  ];

  for (const key of [
    "overdue_ar_risks",
    "slow_paying_customers",
    "high_value_customers",
    "dormant_customers",
    "estimate_to_invoice_leakage",
    "unpaid_invoice_risk",
  ]) {
    const block = insights[key];
    lines.push(`  ${key}: ${Boolean(block)} count=${block?.count ?? 0}`);
  }

  lines.push("", "Result: OK");
  return lines;
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   getSupabase?: () => unknown,
 *   createRepository?: typeof defaultCreateRepository,
 *   loadExecutiveSnapshot?: typeof defaultLoadSnapshot,
 *   createClient?: (url: string, key: string, opts?: object) => unknown,
 * }} [deps]
 * @returns {Promise<{ exitCode: number, lines: string[], snapshot: object|null }>}
 */
export async function runSmokeCli(deps = {}) {
  const env = deps.env ?? process.env;

  const missing = REQUIRED_ENV.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length > 0) {
    return {
      exitCode: 1,
      lines: [`Missing required env: ${missing.join(", ")}`],
      snapshot: null,
    };
  }

  const organizationId = String(env.QB_IMPORT_ORGANIZATION_ID).trim();
  const maxRows = parsePositiveIntEnv(
    env.QB_INTELLIGENCE_SMOKE_MAX_ROWS,
    SMOKE_DEFAULT_MAX_ROWS,
    SMOKE_MAX_ROWS_CEILING,
  );
  const pageSize = parsePositiveIntEnv(
    env.QB_INTELLIGENCE_SMOKE_PAGE_SIZE,
    SMOKE_DEFAULT_PAGE_SIZE,
    SMOKE_MAX_ROWS_CEILING,
  );
  const asOfRaw = String(env.QB_INTELLIGENCE_SMOKE_AS_OF ?? "").trim();
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : null;

  try {
    let getSupabase = deps.getSupabase;
    if (typeof getSupabase !== "function") {
      const createClient =
        deps.createClient ??
        (await import("@supabase/supabase-js")).createClient;
      const url = String(env.SUPABASE_URL).trim();
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      getSupabase = () => client;
    }

    const createRepository = deps.createRepository ?? defaultCreateRepository;
    const loadSnapshot = deps.loadExecutiveSnapshot ?? defaultLoadSnapshot;
    const repository = createRepository({ getSupabase, pageSize });

    const snapshot = await loadSnapshot(repository, organizationId, {
      asOfDate,
      pageSize,
      maxRows,
      includeInvoiceLines: false,
      insightListLimit: 25,
    });

    assertNoRawPayload(snapshot, "smoke_snapshot");
    const lines = formatSmokeResultLines(snapshot, {
      organizationId,
      maxRows,
      pageSize,
      asOfDate,
    });

    // Defense: never allow secret/PII sentinels into printed lines.
    const joined = lines.join("\n");
    if (
      joined.includes(String(env.SUPABASE_SERVICE_ROLE_KEY)) ||
      joined.includes("raw_payload") ||
      /SENTINEL_/i.test(joined)
    ) {
      return {
        exitCode: 1,
        lines: ["Smoke output failed safety check (refusing to print)."],
        snapshot: null,
      };
    }

    return { exitCode: 0, lines, snapshot };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String(err.code) : null;
    return {
      exitCode: 1,
      lines: [
        "QuickBooks intelligence smoke failed",
        ...(code ? [`code: ${code}`] : []),
      ],
      snapshot: null,
    };
  }
}

async function main() {
  const { exitCode, lines } = await runSmokeCli();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("smokeQuickBooksIntelligence.mjs") ||
    process.argv[1].includes("smokeQuickBooksIntelligence"));

if (isDirectRun) {
  main();
}
