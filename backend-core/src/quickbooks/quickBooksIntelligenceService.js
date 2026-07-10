/**
 * quickBooksIntelligenceService — Phase 4B/4F/4G executive intelligence snapshot.
 *
 * Prefers Phase 4G DB-side aggregates (full_aggregate). Falls back to Phase 4F
 * sample-limited in-memory aggregates only when the RPC is missing/unavailable.
 * Aggregate statement timeouts (57014) do NOT fall back to sample_preview.
 *
 * Never returns raw_payload. No AI. No QuickBooks writeback. Backend-only.
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import { flattenInsightList } from "./quickBooksIntelligenceInsights.js";
import {
  createQuickBooksIntelligenceAggregateRepository,
  isMissingAggregateRpcError,
  shapeFullAggregateSnapshot,
} from "./quickBooksIntelligenceAggregateRepository.js";
import { buildPeriodScopedIntelligence } from "./quickBooksIntelligencePeriodAggregates.js";
import { resolveIntelligencePeriod } from "./quickBooksIntelligencePeriod.js";
import { buildSalesRepSummary } from "./quickBooksIntelligenceRead.js";

export { flattenInsightList };

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function shouldFallbackToSample(err) {
  if (!err || typeof err !== "object") return false;
  if (/** @type {{ aggregateTimeout?: boolean }} */ (err).aggregateTimeout === true) return false;
  const code = String(/** @type {{ code?: unknown }} */ (err).code ?? "");
  if (code === "57014") return false;
  if (/** @type {{ missingRpc?: boolean }} */ (err).missingRpc) return true;
  return isMissingAggregateRpcError(err);
}

/**
 * @param {string} attemptedMode
 * @param {{
 *   aggregateAttempted?: boolean,
 *   aggregateAvailable?: boolean|null,
 *   fallbackUsed?: boolean,
 *   fallbackReason?: string|null,
 * }} [extra]
 */
function sampleDiagnostics(attemptedMode, extra = {}) {
  return {
    attempted_mode: attemptedMode,
    mode: "sample_preview",
    aggregate_attempted: extra.aggregateAttempted === true,
    aggregate_available: extra.aggregateAvailable ?? null,
    fallback_used: extra.fallbackUsed === true,
    fallback_reason: extra.fallbackReason ?? null,
  };
}

/**
 * Ensure aggregate failures carry safe diagnostic fields for the API mapper.
 *
 * @param {unknown} err
 * @param {string} attemptedMode
 * @returns {Error}
 */
function annotateAggregateFailure(err, attemptedMode) {
  const base =
    err instanceof Error
      ? err
      : new Error("QuickBooks intelligence aggregate query failed");
  const e = /** @type {Error & Record<string, unknown>} */ (base);
  const code = e.code != null ? String(e.code) : null;
  const timedOut =
    e.aggregateTimeout === true ||
    code === "57014" ||
    String(e.message ?? "")
      .toLowerCase()
      .includes("statement timeout");

  e.attempted_mode = attemptedMode;
  e.mode = "full_aggregate";
  e.aggregate_attempted = true;
  e.aggregate_available = e.missingRpc === true ? false : true;
  e.fallback_used = false;
  e.fallback_reason = e.missingRpc === true ? "aggregate_rpc_unavailable" : null;
  if (timedOut) {
    e.aggregateTimeout = true;
    e.code = "57014";
    e.message = "QuickBooks full aggregate timed out";
  }
  return e;
}

/**
 * Tag sample_preview staging load failures (especially 57014).
 *
 * @param {unknown} err
 * @param {ReturnType<typeof sampleDiagnostics>} diag
 * @returns {Error}
 */
function annotateSampleFailure(err, diag) {
  const base =
    err instanceof Error
      ? err
      : new Error("QuickBooks intelligence sample preview failed");
  const e = /** @type {Error & Record<string, unknown>} */ (base);
  const code = e.code != null ? String(e.code) : null;
  const timedOut =
    code === "57014" ||
    String(e.message ?? "")
      .toLowerCase()
      .includes("statement timeout");

  e.attempted_mode = diag.attempted_mode;
  e.mode = "sample_preview";
  e.aggregate_attempted = diag.aggregate_attempted;
  e.aggregate_available = diag.aggregate_available;
  e.fallback_used = diag.fallback_used;
  e.fallback_reason = diag.fallback_reason;
  if (timedOut) {
    e.code = "57014";
    e.message = "QuickBooks sample_preview timed out while reading staging data";
  }
  return e;
}

/**
 * Build an executive intelligence snapshot for one organization.
 *
 * @param {{
 *   loadOrgCurrentDataset?: (organizationId: string, opts?: object) => Promise<object>,
 *   loadExecutiveAggregate?: (organizationId: string, period: object, opts?: object) => Promise<object>,
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
 *   mode?: "auto"|"full_aggregate"|"sample_preview",
 *   preferAggregate?: boolean,
 *   getSupabase?: () => import("@supabase/supabase-js").SupabaseClient,
 * }} [opts]
 */
export async function loadExecutiveIntelligenceSnapshot(repository, organizationId, opts = {}) {
  if (!repository || typeof repository !== "object") {
    throw new Error("loadExecutiveIntelligenceSnapshot: repository is required");
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

  const modeRaw = String(opts.mode ?? "auto").trim().toLowerCase();
  const attemptedMode =
    modeRaw === "full_aggregate" || modeRaw === "sample_preview" || modeRaw === "auto"
      ? modeRaw
      : "auto";
  const preferAggregate =
    opts.preferAggregate !== false && attemptedMode !== "sample_preview";

  let aggregateLoader = null;
  if (typeof repository.loadExecutiveAggregate === "function") {
    aggregateLoader = repository.loadExecutiveAggregate.bind(repository);
  } else if (preferAggregate && typeof opts.getSupabase === "function") {
    const aggRepo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: opts.getSupabase,
    });
    aggregateLoader = aggRepo.loadExecutiveAggregate.bind(aggRepo);
  }

  /** @type {ReturnType<typeof sampleDiagnostics>|null} */
  let fallbackDiag = null;

  if (preferAggregate && aggregateLoader) {
    try {
      const aggregate = await aggregateLoader(organizationId, period, { topN: 10 });
      const snapshot = shapeFullAggregateSnapshot(aggregate, period, organizationId, {
        attempted_mode: attemptedMode,
      });
      assertNoRawPayload(snapshot, "executive_intelligence_snapshot");
      return snapshot;
    } catch (err) {
      if (attemptedMode === "full_aggregate" || !shouldFallbackToSample(err)) {
        throw annotateAggregateFailure(err, attemptedMode);
      }
      fallbackDiag = sampleDiagnostics(attemptedMode, {
        aggregateAttempted: true,
        aggregateAvailable: false,
        fallbackUsed: true,
        fallbackReason: "aggregate_rpc_unavailable",
      });
    }
  } else if (attemptedMode === "sample_preview") {
    fallbackDiag = sampleDiagnostics(attemptedMode, {
      aggregateAttempted: false,
      aggregateAvailable: null,
      fallbackUsed: false,
      fallbackReason: null,
    });
  }

  if (typeof repository.loadOrgCurrentDataset !== "function") {
    throw new Error(
      "loadExecutiveIntelligenceSnapshot: sample fallback requires repository.loadOrgCurrentDataset",
    );
  }

  const diagForSample =
    fallbackDiag ??
    sampleDiagnostics(attemptedMode, {
      aggregateAttempted: false,
      aggregateAvailable: null,
      fallbackUsed: false,
      fallbackReason: null,
    });

  let datasetWithMeta;
  try {
    datasetWithMeta = await repository.loadOrgCurrentDataset(organizationId, {
      asOfDate: period.as_of,
      pageSize: opts.pageSize,
      maxRows: opts.maxRows,
      includeInvoiceLines: opts.includeInvoiceLines === true,
    });
  } catch (err) {
    throw annotateSampleFailure(err, diagForSample);
  }

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

  const diag = diagForSample;

  const snapshot = {
    organization_id: organizationId,
    as_of_date: period.as_of,
    generated_at: new Date().toISOString(),
    ...diag,
    is_sample_limited: true,
    load_meta: {
      ...(loadMeta ?? {}),
      ...diag,
      invoice_line_fact_count: Array.isArray(invoiceLines) ? invoiceLines.length : 0,
      period: {
        ...periodScoped.period,
        is_sample_limited: true,
      },
      aggregate_fallback_reason: diag.fallback_reason,
    },
    period: {
      ...periodScoped.period,
      is_sample_limited: true,
    },
    invoice_summary: periodScoped.invoice_summary,
    payment_summary_period: periodScoped.payment_summary_period,
    estimate_summary: periodScoped.estimate_summary,
    sales_order_summary: periodScoped.sales_order_summary,
    monthly_trend: periodScoped.monthly_trend,
    top_lists: periodScoped.top_lists,
    insight_groups: periodScoped.insight_groups,
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
 * @param {object} repository
 * @param {{ getSupabase?: () => import("@supabase/supabase-js").SupabaseClient }} [deps]
 */
export function createQuickBooksIntelligenceService(repository, deps = {}) {
  return {
    repository,
    /**
     * @param {string} organizationId
     * @param {object} [opts]
     */
    loadExecutiveSnapshot(organizationId, opts = {}) {
      return loadExecutiveIntelligenceSnapshot(repository, organizationId, {
        ...opts,
        getSupabase: opts.getSupabase ?? deps.getSupabase,
      });
    },
  };
}
