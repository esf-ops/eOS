/**
 * quickBooksIntelligenceAggregateRepository — Phase 4G.3 DB-side aggregate reads.
 *
 * Calls parallel section RPCs that read denormalized intel_* columns only.
 * Does NOT fall back to the slow v1/v2 raw_payload orchestrator.
 * Missing section RPCs surface a clear diagnostic (service may sample-fallback).
 *
 * Never returns raw_payload. No AI. No connector dependency.
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";

/** @deprecated Orchestrator retained in SQL for smoke only — backend does not call it. */
export const QB_INTELLIGENCE_AGGREGATE_RPC = "qb_intelligence_executive_aggregate";

export const QB_INTELLIGENCE_AGGREGATE_TOP_N_DEFAULT = 10;
export const QB_INTELLIGENCE_AGGREGATE_TOP_N_MAX = 25;

/** Section RPCs (Phase 4G.2/4G.3). */
export const QB_INTELLIGENCE_SECTION_RPCS = Object.freeze({
  staging_counts: "qb_intelligence_staging_counts",
  invoice_summary: "qb_intelligence_invoice_summary",
  payment_summary: "qb_intelligence_payment_summary",
  estimate_summary: "qb_intelligence_estimate_summary",
  sales_order_summary: "qb_intelligence_sales_order_summary",
  ar_aging: "qb_intelligence_ar_aging",
  monthly_trend: "qb_intelligence_monthly_trend",
  top_customers: "qb_intelligence_top_customers",
  top_open_ar: "qb_intelligence_top_open_ar",
  top_payment_customers: "qb_intelligence_top_payment_customers",
  top_estimate_leakage: "qb_intelligence_top_estimate_leakage",
});

/** Chunked backfill RPCs (Phase 4G.3). */
export const QB_INTELLIGENCE_BACKFILL_RPCS = Object.freeze({
  invoices: "qb_intelligence_backfill_invoices",
  payments: "qb_intelligence_backfill_payments",
  estimates: "qb_intelligence_backfill_estimates",
  sales_orders: "qb_intelligence_backfill_sales_orders",
});

/** Core sections required for mode=full_aggregate. */
export const QB_INTELLIGENCE_CORE_SECTIONS = Object.freeze([
  "invoice_summary",
  "payment_summary",
  "ar_aging",
]);

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
  if (blob.includes("qb_intelligence_") && (blob.includes("does not exist") || blob.includes("not find"))) {
    return true;
  }
  if (blob.includes("schema cache") && blob.includes("qb_intelligence_")) return true;
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
 *   failed_sections?: string[],
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
    failed_sections?: string[],
  }} */ (
    new Error(
      missing
        ? "QuickBooks intelligence section RPCs are not installed. Apply Phase 4G.3 migration and run backfill."
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
  e.fallback_reason = missing ? "section_rpcs_unavailable" : null;
  if (err && typeof err === "object" && Array.isArray(/** @type {{ failed_sections?: unknown }} */ (err).failed_sections)) {
    e.failed_sections = /** @type {string[]} */ (
      /** @type {{ failed_sections: string[] }} */ (err).failed_sections
    );
  }
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
 * @param {object} [diagnostics]
 */
export function shapeFullAggregateSnapshot(aggregate, period, organizationId, diagnostics = {}) {
  const insightBits = buildAggregatePriorityInsights(aggregate, 10);
  const sectionStatus = aggregate.section_status ?? diagnostics.section_status ?? null;
  const failedSections = Array.isArray(aggregate.failed_sections)
    ? aggregate.failed_sections
    : Array.isArray(diagnostics.failed_sections)
      ? diagnostics.failed_sections
      : [];
  const isSectionPartial =
    aggregate.is_section_partial === true ||
    diagnostics.is_section_partial === true ||
    failedSections.length > 0;
  const diag = {
    attempted_mode: diagnostics.attempted_mode ?? "auto",
    mode: "full_aggregate",
    aggregate_attempted: true,
    aggregate_available: true,
    fallback_used: false,
    fallback_reason: null,
    aggregate_version: aggregate.aggregate_version ?? diagnostics.aggregate_version ?? "v3",
    is_section_partial: isSectionPartial,
    failed_sections: failedSections,
    section_status: sectionStatus,
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
        is_partial: isSectionPartial,
        is_sample_limited: false,
        max_rows: null,
        page_size: null,
      },
    },
    period: {
      ...period,
      is_partial: isSectionPartial,
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
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} rpcName
 * @param {Record<string, unknown>} args
 */
async function callRpc(supabase, rpcName, args) {
  const { data, error } = await supabase.rpc(rpcName, args);
  if (error) throw error;
  return data;
}

/**
 * Classify a settled section result into safe status (no PII / raw DB text).
 *
 * @param {PromiseSettledResult<unknown>} settled
 * @returns {{ ok: boolean, status: "ok"|"missing"|"timeout"|"error", code?: string|null }}
 */
export function classifySectionResult(settled) {
  if (settled.status === "fulfilled") {
    return { ok: true, status: "ok", code: null };
  }
  const err = settled.reason;
  if (isMissingAggregateRpcError(err)) {
    return { ok: false, status: "missing", code: "PGRST202" };
  }
  if (isAggregateTimeoutError(err)) {
    return { ok: false, status: "timeout", code: "57014" };
  }
  const code =
    err && typeof err === "object" && "code" in err && err.code != null
      ? String(err.code)
      : "QB_SECTION_ERROR";
  return { ok: false, status: "error", code };
}

/**
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 * }} deps
 */
export function createQuickBooksIntelligenceAggregateRepository(deps) {
  if (!deps || typeof deps.getSupabase !== "function") {
    throw new Error("createQuickBooksIntelligenceAggregateRepository: getSupabase is required");
  }

  /**
   * Load via parallel section RPCs (Phase 4G.3). No orchestrator fallback.
   *
   * @param {string} organizationId
   * @param {{ date_from: string, date_to: string, as_of: string, sort?: string }} period
   * @param {number} topN
   */
  async function loadViaSectionRpcs(organizationId, period, topN) {
    const supabase = deps.getSupabase();
    const baseArgs = {
      p_organization_id: organizationId,
      p_date_from: period.date_from,
      p_date_to: period.date_to,
    };
    const sort = period.sort ?? "risk_desc";
    const asOf = period.as_of;

    /** @type {Array<{ key: string, rpc: string, args: Record<string, unknown>, core: boolean }>} */
    const jobs = [
      {
        key: "staging_counts",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.staging_counts,
        args: { p_organization_id: organizationId },
        core: false,
      },
      {
        key: "invoice_summary",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.invoice_summary,
        args: { ...baseArgs },
        core: true,
      },
      {
        key: "payment_summary",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.payment_summary,
        args: { ...baseArgs },
        core: true,
      },
      {
        key: "estimate_summary",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.estimate_summary,
        args: { ...baseArgs },
        core: false,
      },
      {
        key: "sales_order_summary",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.sales_order_summary,
        args: { ...baseArgs },
        core: false,
      },
      {
        key: "ar_aging",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.ar_aging,
        args: { p_organization_id: organizationId, p_as_of: asOf },
        core: true,
      },
      {
        key: "monthly_trend",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.monthly_trend,
        args: { ...baseArgs },
        core: false,
      },
      {
        key: "top_customers",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.top_customers,
        args: { ...baseArgs, p_sort: sort, p_top_n: topN },
        core: false,
      },
      {
        key: "top_open_ar",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.top_open_ar,
        args: { p_organization_id: organizationId, p_top_n: topN },
        core: false,
      },
      {
        key: "top_payment_customers",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.top_payment_customers,
        args: { ...baseArgs, p_sort: sort, p_top_n: topN },
        core: false,
      },
      {
        key: "top_estimate_leakage",
        rpc: QB_INTELLIGENCE_SECTION_RPCS.top_estimate_leakage,
        args: {
          ...baseArgs,
          p_as_of: asOf,
          p_sort: sort,
          p_top_n: topN,
        },
        core: false,
      },
    ];

    const settled = await Promise.allSettled(
      jobs.map((job) => callRpc(supabase, job.rpc, job.args)),
    );

    /** @type {Record<string, { ok: boolean, status: string, code?: string|null }>} */
    const sectionStatus = {};
    /** @type {string[]} */
    const failedSections = [];
    /** @type {string[]} */
    const missingSections = [];
    /** @type {Record<string, unknown>} */
    const values = {};

    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      const result = classifySectionResult(settled[i]);
      sectionStatus[job.key] = result;
      if (result.ok) {
        values[job.key] = /** @type {PromiseFulfilledResult<unknown>} */ (settled[i]).value;
      } else {
        failedSections.push(job.key);
        if (result.status === "missing") missingSections.push(job.key);
      }
    }

    // Any missing core section (or all sections missing) → clear diagnostic, no slow orchestrator.
    const coreMissing = QB_INTELLIGENCE_CORE_SECTIONS.filter(
      (k) => sectionStatus[k]?.status === "missing",
    );
    if (missingSections.length === jobs.length || coreMissing.length > 0) {
      const err = sanitizeAggregateRepositoryError({
        code: "PGRST202",
        message: "Could not find the function",
      });
      err.failed_sections = coreMissing.length > 0 ? coreMissing : failedSections;
      throw err;
    }

    const coreFailed = QB_INTELLIGENCE_CORE_SECTIONS.filter((k) => !sectionStatus[k]?.ok);
    if (coreFailed.length > 0) {
      const coreTimedOut = coreFailed.some((k) => sectionStatus[k]?.status === "timeout");
      const err = sanitizeAggregateRepositoryError({
        code: coreTimedOut ? "57014" : "QB_AGGREGATE_ERROR",
        message: coreTimedOut
          ? "QuickBooks full aggregate timed out"
          : "QuickBooks intelligence aggregate query failed",
      });
      err.failed_sections = coreFailed;
      throw err;
    }

    return {
      ok: true,
      mode: "full_aggregate",
      aggregate_version: "v3_sections",
      is_sample_limited: false,
      is_section_partial: failedSections.length > 0,
      failed_sections: failedSections,
      section_status: sectionStatus,
      organization_id: organizationId,
      as_of_date: asOf,
      staging_row_counts: values.staging_counts ?? null,
      invoice_summary: values.invoice_summary ?? null,
      payment_summary_period: values.payment_summary ?? null,
      estimate_summary: values.estimate_summary ?? null,
      sales_order_summary: values.sales_order_summary ?? null,
      ar_summary: values.ar_aging ?? null,
      monthly_trend: values.monthly_trend ?? [],
      top_lists: {
        top_customers_by_revenue: values.top_customers ?? [],
        top_open_ar_customers: values.top_open_ar ?? [],
        top_payment_customers: values.top_payment_customers ?? [],
        top_estimate_leakage: values.top_estimate_leakage ?? [],
      },
    };
  }

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

      try {
        const assembled = await loadViaSectionRpcs(organizationId, period, topN);
        assertNoRawPayload(assembled, "qb_intelligence_section_rpcs");
        return assembled;
      } catch (err) {
        throw sanitizeAggregateRepositoryError(err);
      }
    },
  };
}
