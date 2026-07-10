/**
 * quickBooksIntelligenceAggregateRepository — Phase 4G DB-side aggregate reads.
 *
 * Calls qb_intelligence_executive_aggregate via an injected Supabase client.
 * Never returns raw_payload. No AI. No connector dependency.
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";

export const QB_INTELLIGENCE_AGGREGATE_RPC = "qb_intelligence_executive_aggregate";

export const QB_INTELLIGENCE_AGGREGATE_TOP_N_DEFAULT = 10;
export const QB_INTELLIGENCE_AGGREGATE_TOP_N_MAX = 25;

/**
 * Detect PostgREST / Postgres "function missing" style errors for fallback.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMissingAggregateRpcError(err) {
  if (!err || typeof err !== "object") return false;
  const code = String(/** @type {{ code?: unknown }} */ (err).code ?? "");
  const message = String(/** @type {{ message?: unknown }} */ (err).message ?? "").toLowerCase();
  const details = String(/** @type {{ details?: unknown }} */ (err).details ?? "").toLowerCase();
  const hint = String(/** @type {{ hint?: unknown }} */ (err).hint ?? "").toLowerCase();
  const blob = `${message} ${details} ${hint}`;

  if (code === "PGRST202" || code === "42883") return true;
  if (blob.includes("could not find the function")) return true;
  if (blob.includes("function public.qb_intelligence_executive_aggregate") && blob.includes("does not exist")) {
    return true;
  }
  if (blob.includes("qb_intelligence_executive_aggregate") && blob.includes("not find")) return true;
  if (blob.includes("schema cache") && blob.includes("qb_intelligence_executive_aggregate")) return true;
  return false;
}

/**
 * Detect Postgres statement timeout (57014) on aggregate path.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAggregateTimeoutError(err) {
  if (!err || typeof err !== "object") return false;
  if (/** @type {{ aggregateTimeout?: boolean }} */ (err).aggregateTimeout === true) return true;
  const code = String(/** @type {{ code?: unknown }} */ (err).code ?? "");
  if (code === "57014") return true;
  const message = String(/** @type {{ message?: unknown }} */ (err).message ?? "").toLowerCase();
  return message.includes("statement timeout") || message.includes("canceling statement due to statement timeout");
}

/**
 * @param {unknown} err
 * @returns {Error & {
 *   code?: string,
 *   missingRpc?: boolean,
 *   aggregateTimeout?: boolean,
 *   mode?: string,
 *   aggregate_attempted?: boolean,
 *   aggregate_available?: boolean,
 *   fallback_used?: boolean,
 *   fallback_reason?: string|null,
 * }}
 */
export function sanitizeAggregateRepositoryError(err) {
  const missing = isMissingAggregateRpcError(err);
  const timedOut = !missing && isAggregateTimeoutError(err);
  const code =
    err && typeof err === "object" && "code" in err && err.code != null
      ? String(err.code)
      : missing
        ? "PGRST202"
        : timedOut
          ? "57014"
          : "QB_AGGREGATE_ERROR";

  const e = /** @type {Error & {
    code?: string,
    missingRpc?: boolean,
    aggregateTimeout?: boolean,
    mode?: string,
    aggregate_attempted?: boolean,
    aggregate_available?: boolean,
    fallback_used?: boolean,
    fallback_reason?: string|null,
  }} */ (
    new Error(
      missing
        ? "QuickBooks intelligence aggregate RPC is not installed"
        : timedOut
          ? "QuickBooks full aggregate timed out"
          : "QuickBooks intelligence aggregate query failed",
    )
  );
  e.code = code;
  e.missingRpc = missing;
  e.aggregateTimeout = timedOut;
  e.mode = "full_aggregate";
  e.aggregate_attempted = true;
  e.aggregate_available = !missing;
  e.fallback_used = false;
  e.fallback_reason = missing ? "aggregate_rpc_unavailable" : null;
  return e;
}

/**
 * Build priority insight groups from aggregate top lists (no row dump).
 *
 * @param {object} aggregate
 * @param {number} [limit]
 */
export function buildAggregatePriorityInsights(aggregate, limit = 10) {
  /** @type {Array<{
   *   insight: string,
   *   severity: string,
   *   qb_customer_list_id?: string|null,
   *   qb_txn_id?: string|null,
   *   summary: string,
   *   detail: object,
   * }>} */
  const list = [];

  for (const row of aggregate?.top_lists?.top_open_ar_customers ?? []) {
    list.push({
      insight: "unpaid_invoice_risk",
      severity: "high",
      qb_customer_list_id: row.qb_customer_list_id ?? null,
      summary: `open_ar balance=${row.open_balance_total ?? 0}`,
      detail: row,
    });
  }
  for (const row of aggregate?.top_lists?.top_estimate_leakage ?? []) {
    list.push({
      insight: "estimate_to_invoice_leakage",
      severity: "medium",
      qb_customer_list_id: row.qb_customer_list_id ?? null,
      qb_txn_id: row.qb_txn_id ?? null,
      summary: `estimate_leakage reason=${row.reason ?? "unlinked_estimate"}`,
      detail: row,
    });
  }
  for (const row of aggregate?.top_lists?.top_customers_by_revenue ?? []) {
    list.push({
      insight: "high_value_customers",
      severity: "info",
      qb_customer_list_id: row.qb_customer_list_id ?? null,
      summary: `high_value rank=${row.rank ?? "?"}`,
      detail: row,
    });
  }

  const priority = list.slice(0, limit);
  /** @type {Map<string, { insight: string, count: number, items: object[] }>} */
  const groups = new Map();
  for (const item of list) {
    const key = item.insight;
    let g = groups.get(key);
    if (!g) {
      g = { insight: key, count: 0, items: [] };
      groups.set(key, g);
    }
    g.count += 1;
    if (g.items.length < 3) g.items.push(item);
  }

  return {
    insight_list: priority,
    insight_groups: [...groups.values()].sort(
      (a, b) => b.count - a.count || a.insight.localeCompare(b.insight),
    ),
    insights: {
      overdue_ar_risks: { insight: "overdue_ar_risks", count: 0, items: [] },
      slow_paying_customers: { insight: "slow_paying_customers", count: 0, items: [] },
      high_value_customers: {
        insight: "high_value_customers",
        count: (aggregate?.top_lists?.top_customers_by_revenue ?? []).length,
        items: [],
      },
      dormant_customers: { insight: "dormant_customers", count: 0, items: [] },
      estimate_to_invoice_leakage: {
        insight: "estimate_to_invoice_leakage",
        count: (aggregate?.top_lists?.top_estimate_leakage ?? []).length,
        items: [],
      },
      unpaid_invoice_risk: {
        insight: "unpaid_invoice_risk",
        count: (aggregate?.top_lists?.top_open_ar_customers ?? []).length,
        items: [],
      },
    },
  };
}

/**
 * Shape RPC JSON into the executive snapshot contract.
 *
 * @param {object} aggregate
 * @param {object} period
 * @param {string} organizationId
 */
export function shapeFullAggregateSnapshot(aggregate, period, organizationId, diagnostics = {}) {
  const insightBits = buildAggregatePriorityInsights(aggregate, 10);
  const diag = {
    attempted_mode: diagnostics.attempted_mode ?? "auto",
    mode: "full_aggregate",
    aggregate_attempted: true,
    aggregate_available: true,
    fallback_used: false,
    fallback_reason: null,
  };
  const snapshot = {
    organization_id: organizationId,
    as_of_date: aggregate.as_of_date ?? period.as_of,
    generated_at: new Date().toISOString(),
    mode: "full_aggregate",
    is_sample_limited: false,
    ...diag,
    load_meta: {
      mode: "full_aggregate",
      is_sample_limited: false,
      staging_row_counts: aggregate.staging_row_counts ?? null,
      page_size: null,
      max_rows: null,
      include_invoice_lines: false,
      ...diag,
      period: {
        ...period,
        is_partial: false,
        is_sample_limited: false,
        max_rows: null,
        page_size: null,
      },
    },
    period: {
      ...period,
      is_partial: false,
      is_sample_limited: false,
      max_rows: null,
      page_size: null,
    },
    invoice_summary: aggregate.invoice_summary ?? null,
    payment_summary_period: aggregate.payment_summary_period ?? null,
    estimate_summary: aggregate.estimate_summary ?? null,
    sales_order_summary: aggregate.sales_order_summary ?? null,
    monthly_trend: aggregate.monthly_trend ?? [],
    top_lists: aggregate.top_lists ?? {
      top_customers_by_revenue: [],
      top_open_ar_customers: [],
      top_payment_customers: [],
      top_estimate_leakage: [],
    },
    insight_groups: insightBits.insight_groups,
    ar_summary: aggregate.ar_summary ?? null,
    revenue_summary: {
      asOfDate: aggregate.as_of_date ?? period.as_of,
      customers: aggregate.top_lists?.top_customers_by_revenue ?? [],
      totals: {
        customer_count: aggregate.invoice_summary?.customer_count ?? 0,
        billed_total: aggregate.invoice_summary?.billed_total ?? 0,
        open_balance_total: aggregate.invoice_summary?.open_total ?? 0,
      },
    },
    payment_summary: {
      asOfDate: aggregate.as_of_date ?? period.as_of,
      customers: aggregate.top_lists?.top_payment_customers ?? [],
      totals: {
        customer_count: aggregate.payment_summary_period?.customer_count ?? 0,
        payment_count: aggregate.payment_summary_period?.payment_count ?? 0,
        payment_total: aggregate.payment_summary_period?.collected_total ?? 0,
      },
    },
    estimate_sales_order_invoice_flow: {
      asOfDate: aggregate.as_of_date ?? period.as_of,
      estimates: {
        count: aggregate.estimate_summary?.estimate_count ?? 0,
        total_amount: aggregate.estimate_summary?.estimate_total ?? 0,
        linked_to_invoice_count: aggregate.estimate_summary?.linked_count ?? 0,
        unlinked_count: aggregate.estimate_summary?.unlinked_count ?? 0,
      },
      sales_orders: {
        count: aggregate.sales_order_summary?.sales_order_count ?? 0,
        total_amount: aggregate.sales_order_summary?.sales_order_total ?? 0,
        linked_to_invoice_count: aggregate.sales_order_summary?.linked_count ?? 0,
        unlinked_count: aggregate.sales_order_summary?.unlinked_count ?? 0,
      },
      invoices: {
        count: aggregate.invoice_summary?.invoice_count ?? 0,
        total_amount: aggregate.invoice_summary?.billed_total ?? 0,
      },
    },
    sales_rep_summary: { asOfDate: aggregate.as_of_date ?? period.as_of, sales_reps: [], unassigned: { invoice_count: 0 } },
    customer_activity_trend: {
      asOfDate: aggregate.as_of_date ?? period.as_of,
      months: aggregate.monthly_trend ?? [],
    },
    insights: insightBits.insights,
    insight_list: insightBits.insight_list,
  };

  assertNoRawPayload(snapshot, "full_aggregate_executive_snapshot");
  return snapshot;
}

/**
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   rpcName?: string,
 * }} deps
 */
export function createQuickBooksIntelligenceAggregateRepository(deps) {
  if (!deps || typeof deps.getSupabase !== "function") {
    throw new Error("createQuickBooksIntelligenceAggregateRepository: getSupabase is required");
  }
  const rpcName = deps.rpcName || QB_INTELLIGENCE_AGGREGATE_RPC;

  return {
    /**
     * @param {string} organizationId
     * @param {{
     *   date_from: string,
     *   date_to: string,
     *   as_of: string,
     *   sort?: string,
     * }} period
     * @param {{ topN?: number }} [opts]
     */
    async loadExecutiveAggregate(organizationId, period, opts = {}) {
      const topNRaw = Number(opts.topN ?? QB_INTELLIGENCE_AGGREGATE_TOP_N_DEFAULT);
      const topN = Math.min(
        QB_INTELLIGENCE_AGGREGATE_TOP_N_MAX,
        Math.max(1, Number.isFinite(topNRaw) ? Math.floor(topNRaw) : QB_INTELLIGENCE_AGGREGATE_TOP_N_DEFAULT),
      );

      const supabase = deps.getSupabase();
      const { data, error } = await supabase.rpc(rpcName, {
        p_organization_id: organizationId,
        p_date_from: period.date_from,
        p_date_to: period.date_to,
        p_as_of: period.as_of,
        p_sort: period.sort ?? "risk_desc",
        p_top_n: topN,
      });

      if (error) {
        throw sanitizeAggregateRepositoryError(error);
      }
      if (!data || typeof data !== "object") {
        throw sanitizeAggregateRepositoryError(new Error("empty aggregate payload"));
      }

      assertNoRawPayload(data, "qb_intelligence_executive_aggregate_rpc");
      return data;
    },
  };
}
