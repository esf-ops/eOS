/**
 * quickBooksIntelligenceApi — Phase 4C/4D admin API for QuickBooks executive intelligence.
 *
 * Mounts GET /api/admin/quickbooks/intelligence/executive behind auth + allowed finance
 * roles + quickbooks_intelligence head access. Calls Phase 4B
 * loadExecutiveIntelligenceSnapshot. Never returns raw_payload.
 *
 * Backend-only. No QuickBooks writeback. No connector dependency.
 * System Admin assigns head access; it does not host this UI (standalone head).
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import { createQuickBooksIntelligenceSupabaseRepository } from "./quickBooksIntelligenceSupabaseRepository.js";
import { loadExecutiveIntelligenceSnapshot } from "./quickBooksIntelligenceService.js";
import { resolveIntelligencePeriod } from "./quickBooksIntelligencePeriod.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Roles allowed to call QuickBooks Intelligence APIs (still require head access). */
export const QB_INTELLIGENCE_ALLOWED_ROLES = Object.freeze([
  "admin",
  "super_admin",
  "executive",
  "finance",
  "accounting",
]);

/** Head slug for requireHeadAccess / launcher / user_head_access. */
export const QB_INTELLIGENCE_HEAD_SLUG = "quickbooks_intelligence";

/**
 * Default max_rows when the client omits the param.
 * Bounded executive preview — full-org loads timed out (Postgres 57014) in production.
 * Phase 4G should replace in-memory staging loads with scalable aggregate queries.
 */
export const QB_INTELLIGENCE_API_DEFAULT_MAX_ROWS = 500;

/** Default page_size when the client omits the param. */
export const QB_INTELLIGENCE_API_DEFAULT_PAGE_SIZE = 100;

/** Hard ceiling for max_rows (clients cannot request more). */
export const QB_INTELLIGENCE_API_MAX_ROWS_CEILING = 2000;

/** Hard ceiling for page_size. */
export const QB_INTELLIGENCE_API_PAGE_SIZE_CEILING = 500;

/** Suggested smaller sample after a statement timeout (57014). */
export const QB_INTELLIGENCE_TIMEOUT_RECOMMENDED_MAX_ROWS = 50;

/** Suggested smaller page size after a statement timeout (57014). */
export const QB_INTELLIGENCE_TIMEOUT_RECOMMENDED_PAGE_SIZE = 50;

/** Default priority insight list cap (Phase 4F noise reduction). */
export const QB_INTELLIGENCE_API_INSIGHT_LIST_LIMIT = 10;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

/**
 * Resolve organization_id from query, user profile, or QB_IMPORT_ORGANIZATION_ID.
 *
 * @param {{ query?: object, user?: object }} req
 * @param {Record<string, string|undefined>} [env]
 * @returns {string}
 */
export function resolveQuickBooksOrganizationId(req, env = process.env) {
  const queryOrg = String(req?.query?.organization_id ?? "").trim();
  if (isUuid(queryOrg)) return queryOrg;
  const userOrg = String(req?.user?.organization_id ?? "").trim();
  if (isUuid(userOrg)) return userOrg;
  const envOrg = String(env.QB_IMPORT_ORGANIZATION_ID ?? "").trim();
  if (isUuid(envOrg)) return envOrg;
  return "";
}

/**
 * Parse intelligence query params with safe bounded defaults + Phase 4F period.
 * Omitted max_rows / page_size are never unlimited (production timeout hotfix).
 * Default period is current year-to-date.
 *
 * @param {object} [query]
 * @param {Date} [now]
 */
export function parseIntelligenceQuery(query = {}, now = new Date()) {
  const asOfRaw = String(query.as_of_date ?? "").trim();
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : null;

  const pageSizeRaw = Number(query.page_size);
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(QB_INTELLIGENCE_API_PAGE_SIZE_CEILING, Math.floor(pageSizeRaw))
      : QB_INTELLIGENCE_API_DEFAULT_PAGE_SIZE;

  const maxRowsRaw = Number(query.max_rows);
  const maxRows =
    Number.isFinite(maxRowsRaw) && maxRowsRaw > 0
      ? Math.min(QB_INTELLIGENCE_API_MAX_ROWS_CEILING, Math.floor(maxRowsRaw))
      : QB_INTELLIGENCE_API_DEFAULT_MAX_ROWS;

  const includeInvoiceLines =
    query.include_invoice_lines === "1" ||
    query.include_invoice_lines === "true" ||
    query.include_invoice_lines === true;

  const insightLimitRaw = Number(query.insight_list_limit);
  const insightListLimit =
    Number.isFinite(insightLimitRaw) && insightLimitRaw > 0
      ? Math.min(100, Math.floor(insightLimitRaw))
      : QB_INTELLIGENCE_API_INSIGHT_LIST_LIMIT;

  const period = resolveIntelligencePeriod(
    {
      preset: query.preset,
      year: query.year,
      date_from: query.date_from,
      date_to: query.date_to,
      as_of_date: asOfDate,
      sort: query.sort,
    },
    now,
  );

  return {
    asOfDate: period.as_of,
    pageSize,
    maxRows,
    includeInvoiceLines,
    insightListLimit,
    preset: period.preset,
    year: period.year,
    dateFrom: period.date_from,
    dateTo: period.date_to,
    sort: period.sort,
    period,
  };
}

/**
 * Map loader/repository errors to a safe API response (no DB text / PII).
 *
 * @param {unknown} err
 * @returns {{ status: number, body: Record<string, unknown> }}
 */
export function mapQuickBooksIntelligenceError(err) {
  const code =
    err && typeof err === "object" && "code" in err && err.code != null
      ? String(err.code)
      : null;

  if (code === "57014") {
    return {
      status: 504,
      body: {
        ok: false,
        error:
          "QuickBooks intelligence snapshot timed out while reading staging data. Retry with a smaller sample.",
        code: "57014",
        recommended: {
          max_rows: QB_INTELLIGENCE_TIMEOUT_RECOMMENDED_MAX_ROWS,
          page_size: QB_INTELLIGENCE_TIMEOUT_RECOMMENDED_PAGE_SIZE,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: "QuickBooks intelligence snapshot failed",
      ...(code ? { code } : {}),
    },
  };
}

/**
 * Shape a Phase 4B/4F snapshot into the API response contract.
 *
 * @param {object} snapshot
 * @param {{ maxRows?: number|null, pageSize?: number|null, period?: object }} [requestMeta]
 */
export function buildQuickBooksIntelligenceApiResponse(snapshot, requestMeta = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("snapshot is required");
  }

  const pageSize =
    requestMeta.pageSize ??
    snapshot.load_meta?.page_size ??
    null;
  const maxRows = requestMeta.maxRows ?? null;
  const period = snapshot.period ?? requestMeta.period ?? null;

  const body = {
    ok: true,
    organization_id: snapshot.organization_id,
    generated_at: snapshot.generated_at,
    as_of_date: snapshot.as_of_date,
    period,
    metadata: {
      organization_id: snapshot.organization_id,
      generated_at: snapshot.generated_at,
      as_of_date: snapshot.as_of_date,
      page_size: pageSize,
      max_rows: maxRows,
      include_invoice_lines: Boolean(snapshot.load_meta?.include_invoice_lines),
      staging_row_counts: snapshot.load_meta?.staging_row_counts ?? null,
      insight_list_count: Array.isArray(snapshot.insight_list) ? snapshot.insight_list.length : 0,
      preset: period?.preset ?? null,
      date_from: period?.date_from ?? null,
      date_to: period?.date_to ?? null,
      sort: period?.sort ?? null,
      is_partial: Boolean(period?.is_partial ?? (maxRows != null && maxRows > 0)),
    },
    invoice_summary: snapshot.invoice_summary ?? null,
    payment_summary_period: snapshot.payment_summary_period ?? null,
    estimate_summary: snapshot.estimate_summary ?? null,
    sales_order_summary: snapshot.sales_order_summary ?? null,
    monthly_trend: snapshot.monthly_trend ?? null,
    top_lists: snapshot.top_lists ?? null,
    insight_groups: snapshot.insight_groups ?? null,
    ar_summary: snapshot.ar_summary,
    revenue_summary: snapshot.revenue_summary,
    payment_summary: snapshot.payment_summary,
    estimate_sales_order_invoice_flow: snapshot.estimate_sales_order_invoice_flow,
    sales_rep_summary: snapshot.sales_rep_summary,
    customer_activity_trend: snapshot.customer_activity_trend,
    insights: snapshot.insights,
    insight_list: snapshot.insight_list,
  };

  assertNoRawPayload(body, "quickbooks_intelligence_api_response");
  return body;
}

/**
 * Create route handlers with injectable snapshot loader (tests never hit Supabase).
 *
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   loadExecutiveSnapshot?: typeof loadExecutiveIntelligenceSnapshot,
 *   createRepository?: typeof createQuickBooksIntelligenceSupabaseRepository,
 *   env?: Record<string, string|undefined>,
 * }} deps
 */
export function createQuickBooksIntelligenceHandlers(deps) {
  if (!deps || typeof deps.getSupabase !== "function") {
    throw new Error("createQuickBooksIntelligenceHandlers: getSupabase is required");
  }

  const loadSnapshot = deps.loadExecutiveSnapshot ?? loadExecutiveIntelligenceSnapshot;
  const createRepository = deps.createRepository ?? createQuickBooksIntelligenceSupabaseRepository;
  const env = deps.env ?? process.env;

  return {
    /**
     * GET executive intelligence snapshot.
     * @param {import("express").Request} req
     * @param {import("express").Response} res
     */
    async getExecutiveSnapshot(req, res) {
      try {
        const organizationId = resolveQuickBooksOrganizationId(req, env);
        if (!organizationId) {
          return res.status(400).json({
            ok: false,
            error:
              "organization_id is required (query param, user profile, or QB_IMPORT_ORGANIZATION_ID).",
          });
        }

        const parsed = parseIntelligenceQuery(req.query ?? {});
        const repository = createRepository({
          getSupabase: deps.getSupabase,
          pageSize: parsed.pageSize,
        });

        const snapshot = await loadSnapshot(repository, organizationId, {
          asOfDate: parsed.asOfDate,
          pageSize: parsed.pageSize,
          maxRows: parsed.maxRows,
          includeInvoiceLines: parsed.includeInvoiceLines,
          insightListLimit: parsed.insightListLimit,
          preset: parsed.preset,
          year: parsed.year,
          dateFrom: parsed.dateFrom,
          dateTo: parsed.dateTo,
          sort: parsed.sort,
        });

        const body = buildQuickBooksIntelligenceApiResponse(snapshot, {
          maxRows: parsed.maxRows,
          pageSize: parsed.pageSize,
          period: snapshot.period ?? parsed.period,
        });

        return res.status(200).json(body);
      } catch (err) {
        // Safe message only — never echo raw DB text / PII.
        const mapped = mapQuickBooksIntelligenceError(err);
        return res.status(mapped.status).json(mapped.body);
      }
    },
  };
}

/**
 * Mount QuickBooks intelligence admin routes.
 *
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireRole: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   loadExecutiveSnapshot?: typeof loadExecutiveIntelligenceSnapshot,
 *   createRepository?: typeof createQuickBooksIntelligenceSupabaseRepository,
 *   env?: Record<string, string|undefined>,
 * }} deps
 */
export function attachQuickBooksIntelligenceRoutes(app, deps) {
  const { requireAuth, requireRole, requireHeadAccess, getSupabase } = deps;
  if (typeof requireAuth !== "function" || typeof requireRole !== "function") {
    throw new Error("attachQuickBooksIntelligenceRoutes: requireAuth and requireRole are required");
  }
  if (typeof requireHeadAccess !== "function" || typeof getSupabase !== "function") {
    throw new Error(
      "attachQuickBooksIntelligenceRoutes: requireHeadAccess and getSupabase are required",
    );
  }

  const stack = [
    requireAuth(),
    requireRole([...QB_INTELLIGENCE_ALLOWED_ROLES]),
    requireHeadAccess(QB_INTELLIGENCE_HEAD_SLUG, { getSupabase }),
  ];
  const handlers = createQuickBooksIntelligenceHandlers(deps);

  app.get("/api/admin/quickbooks/intelligence/executive", ...stack, (req, res) =>
    handlers.getExecutiveSnapshot(req, res),
  );
}
