/**
 * quickBooksIntelligenceService — Phase 4B/4F executive intelligence snapshot.
 *
 * Loads org-scoped staging facts via an injected intelligence repository
 * and builds Phase 4F date-scoped aggregates (+ backward-compatible keys).
 *
 * Never returns raw_payload. No AI. No QuickBooks writeback. Backend-only.
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import { flattenInsightList } from "./quickBooksIntelligenceInsights.js";
import { buildPeriodScopedIntelligence } from "./quickBooksIntelligencePeriodAggregates.js";
import { resolveIntelligencePeriod } from "./quickBooksIntelligencePeriod.js";
import { buildSalesRepSummary } from "./quickBooksIntelligenceRead.js";

export { flattenInsightList };

/**
 * Build an executive intelligence snapshot for one organization.
 *
 * @param {{
 *   loadOrgCurrentDataset: (organizationId: string, opts?: object) => Promise<object>,
 * }} repository
 * @param {string} organizationId
 * @param {{
 *   asOfDate?: string|null,
 *   pageSize?: number,
 *   maxRows?: number|null,
 *   includeInvoiceLines?: boolean,
 *   insightOpts?: object,
 *   insightListLimit?: number,
 *   preset?: string|null,
 *   year?: string|number|null,
 *   dateFrom?: string|null,
 *   dateTo?: string|null,
 *   sort?: string|null,
 *   now?: Date,
 * }} [opts]
 */
export async function loadExecutiveIntelligenceSnapshot(repository, organizationId, opts = {}) {
  if (!repository || typeof repository.loadOrgCurrentDataset !== "function") {
    throw new Error("loadExecutiveIntelligenceSnapshot: repository.loadOrgCurrentDataset is required");
  }
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw new Error("organizationId is required");
  }

  const period = resolveIntelligencePeriod(
    {
      preset: opts.preset,
      year: opts.year,
      date_from: opts.dateFrom,
      date_to: opts.dateTo,
      as_of_date: opts.asOfDate,
      sort: opts.sort,
    },
    opts.now instanceof Date ? opts.now : new Date(),
  );

  const datasetWithMeta = await repository.loadOrgCurrentDataset(organizationId, {
    asOfDate: period.as_of,
    pageSize: opts.pageSize,
    maxRows: opts.maxRows,
    includeInvoiceLines: opts.includeInvoiceLines === true,
  });

  const {
    load_meta: loadMeta,
    invoiceLines,
    ...dataset
  } = datasetWithMeta;

  const isPartial = opts.maxRows != null && Number(opts.maxRows) > 0;
  const insightListLimit =
    opts.insightListLimit == null
      ? 10
      : Math.max(1, Math.floor(Number(opts.insightListLimit) || 10));

  const periodScoped = buildPeriodScopedIntelligence(dataset, period, {
    isPartial,
    maxRows: opts.maxRows ?? null,
    pageSize: opts.pageSize ?? loadMeta?.page_size ?? null,
    insightListLimit,
    insightOpts: opts.insightOpts,
  });

  const salesRepSummary = buildSalesRepSummary({
    ...dataset,
    asOfDate: period.as_of,
    invoices: dataset.invoices.filter((inv) => {
      const d = inv.txn_date;
      return typeof d === "string" && d >= period.date_from && d <= period.date_to;
    }),
  });

  const snapshot = {
    organization_id: organizationId,
    as_of_date: period.as_of,
    generated_at: new Date().toISOString(),
    load_meta: {
      ...(loadMeta ?? {}),
      invoice_line_fact_count: Array.isArray(invoiceLines) ? invoiceLines.length : 0,
      period: periodScoped.period,
    },
    period: periodScoped.period,
    invoice_summary: periodScoped.invoice_summary,
    payment_summary_period: periodScoped.payment_summary_period,
    estimate_summary: periodScoped.estimate_summary,
    sales_order_summary: periodScoped.sales_order_summary,
    monthly_trend: periodScoped.monthly_trend,
    top_lists: periodScoped.top_lists,
    insight_groups: periodScoped.insight_groups,
    // Backward-compatible Phase 4D keys (now period-scoped).
    ar_summary: periodScoped.ar_summary,
    revenue_summary: periodScoped.revenue_summary,
    payment_summary: periodScoped.payment_summary,
    estimate_sales_order_invoice_flow: periodScoped.estimate_sales_order_invoice_flow,
    sales_rep_summary: salesRepSummary,
    customer_activity_trend: periodScoped.customer_activity_trend,
    insights: periodScoped.insights,
    insight_list: periodScoped.insight_list,
  };

  assertNoRawPayload(snapshot, "executive_intelligence_snapshot");
  return snapshot;
}

/**
 * Convenience factory: repository + snapshot helper bound together.
 *
 * @param {ReturnType<import("./quickBooksIntelligenceSupabaseRepository.js").createQuickBooksIntelligenceSupabaseRepository>} repository
 */
export function createQuickBooksIntelligenceService(repository) {
  return {
    repository,
    /**
     * @param {string} organizationId
     * @param {object} [opts]
     */
    loadExecutiveSnapshot(organizationId, opts = {}) {
      return loadExecutiveIntelligenceSnapshot(repository, organizationId, opts);
    },
  };
}
