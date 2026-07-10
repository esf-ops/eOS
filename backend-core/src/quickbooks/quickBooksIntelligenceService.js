/**
 * quickBooksIntelligenceService — Phase 4B executive intelligence snapshot.
 *
 * Loads org-scoped staging facts via an injected intelligence repository
 * (typically createQuickBooksIntelligenceSupabaseRepository) and runs Phase 4A
 * read models + deterministic insights.
 *
 * Never returns raw_payload. No AI. No QuickBooks writeback. Backend-only.
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import { buildAllQuickBooksReadModels } from "./quickBooksIntelligenceRead.js";
import { buildAllQuickBooksInsights } from "./quickBooksIntelligenceInsights.js";

/**
 * Flatten deterministic insights into a single ranked list for executive views.
 *
 * @param {ReturnType<typeof buildAllQuickBooksInsights>} insights
 * @returns {Array<{
 *   insight: string,
 *   severity: string,
 *   qb_customer_list_id?: string|null,
 *   qb_txn_id?: string|null,
 *   summary: string,
 *   detail: object,
 * }>}
 */
export function flattenInsightList(insights) {
  /** @type {Array<{
   *   insight: string,
   *   severity: string,
   *   qb_customer_list_id?: string|null,
   *   qb_txn_id?: string|null,
   *   summary: string,
   *   detail: object,
   * }>} */
  const list = [];

  for (const item of insights.overdue_ar_risks?.items ?? []) {
    list.push({
      insight: "overdue_ar_risks",
      severity: item.severity,
      qb_customer_list_id: item.qb_customer_list_id,
      qb_txn_id: item.qb_txn_id,
      summary: `overdue_ar days=${item.days_overdue}`,
      detail: item,
    });
  }
  for (const item of insights.slow_paying_customers?.items ?? []) {
    list.push({
      insight: "slow_paying_customers",
      severity: "medium",
      qb_customer_list_id: item.qb_customer_list_id,
      summary: `slow_paying reason=${item.reason}`,
      detail: item,
    });
  }
  for (const item of insights.high_value_customers?.items ?? []) {
    list.push({
      insight: "high_value_customers",
      severity: "info",
      qb_customer_list_id: item.qb_customer_list_id,
      summary: `high_value rank=${item.rank}`,
      detail: item,
    });
  }
  for (const item of insights.dormant_customers?.items ?? []) {
    list.push({
      insight: "dormant_customers",
      severity: "low",
      qb_customer_list_id: item.qb_customer_list_id,
      summary: `dormant days_since=${item.days_since_activity ?? "unknown"}`,
      detail: item,
    });
  }
  for (const item of insights.estimate_to_invoice_leakage?.items ?? []) {
    list.push({
      insight: "estimate_to_invoice_leakage",
      severity: "medium",
      qb_customer_list_id: item.qb_customer_list_id,
      qb_txn_id: item.qb_txn_id,
      summary: `estimate_leakage reason=${item.reason}`,
      detail: item,
    });
  }
  for (const item of insights.unpaid_invoice_risk?.items ?? []) {
    list.push({
      insight: "unpaid_invoice_risk",
      severity: item.is_overdue ? "high" : "medium",
      qb_customer_list_id: item.qb_customer_list_id,
      qb_txn_id: item.qb_txn_id,
      summary: `unpaid_risk score=${item.risk_score}`,
      detail: item,
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2, info: 3 };
  list.sort(
    (a, b) =>
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
      a.insight.localeCompare(b.insight) ||
      String(a.qb_txn_id ?? "").localeCompare(String(b.qb_txn_id ?? "")) ||
      String(a.qb_customer_list_id ?? "").localeCompare(String(b.qb_customer_list_id ?? "")),
  );

  return list;
}

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
 * }} [opts]
 */
export async function loadExecutiveIntelligenceSnapshot(repository, organizationId, opts = {}) {
  if (!repository || typeof repository.loadOrgCurrentDataset !== "function") {
    throw new Error("loadExecutiveIntelligenceSnapshot: repository.loadOrgCurrentDataset is required");
  }
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw new Error("organizationId is required");
  }

  const datasetWithMeta = await repository.loadOrgCurrentDataset(organizationId, {
    asOfDate: opts.asOfDate,
    pageSize: opts.pageSize,
    maxRows: opts.maxRows,
    includeInvoiceLines: opts.includeInvoiceLines === true,
  });

  const {
    load_meta: loadMeta,
    invoiceLines,
    ...dataset
  } = datasetWithMeta;

  const readModels = buildAllQuickBooksReadModels(dataset);
  const insights = buildAllQuickBooksInsights(dataset, opts.insightOpts ?? {});
  const insightListLimit =
    opts.insightListLimit == null
      ? 100
      : Math.max(1, Math.floor(Number(opts.insightListLimit) || 100));
  const insightList = flattenInsightList(insights).slice(0, insightListLimit);

  const snapshot = {
    organization_id: organizationId,
    as_of_date: dataset.asOfDate,
    generated_at: new Date().toISOString(),
    load_meta: {
      ...(loadMeta ?? {}),
      invoice_line_fact_count: Array.isArray(invoiceLines) ? invoiceLines.length : 0,
    },
    ar_summary: readModels.invoice_aging,
    revenue_summary: readModels.customer_revenue,
    payment_summary: readModels.payment_history,
    estimate_sales_order_invoice_flow: readModels.estimate_sales_order_invoice_flow,
    sales_rep_summary: readModels.sales_rep_summary,
    customer_activity_trend: readModels.customer_activity_trend,
    insights,
    insight_list: insightList,
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
