/**
 * quickBooksIntelligenceApi — Phase 4C admin API for QuickBooks executive intelligence.
 *
 * Mounts GET /api/admin/quickbooks/intelligence/executive behind auth + admin role +
 * system_admin head access (same stack as Moraware Admin). Calls Phase 4B
 * loadExecutiveIntelligenceSnapshot. Never returns raw_payload.
 *
 * Backend-only. No QuickBooks writeback. No connector dependency.
 */

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import { createQuickBooksIntelligenceSupabaseRepository } from "./quickBooksIntelligenceSupabaseRepository.js";
import { loadExecutiveIntelligenceSnapshot } from "./quickBooksIntelligenceService.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Server-side ceiling for optional max_rows query (smoke/testing). */
export const QB_INTELLIGENCE_API_MAX_ROWS_CEILING = 5000;

/** Default insight list cap for API responses. */
export const QB_INTELLIGENCE_API_INSIGHT_LIST_LIMIT = 100;

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
 * Parse optional intelligence query params (safe defaults).
 *
 * @param {object} [query]
 * @returns {{
 *   asOfDate: string|null,
 *   pageSize: number|null,
 *   maxRows: number|null,
 *   includeInvoiceLines: boolean,
 *   insightListLimit: number,
 * }}
 */
export function parseIntelligenceQuery(query = {}) {
  const asOfRaw = String(query.as_of_date ?? "").trim();
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : null;

  const pageSizeRaw = Number(query.page_size);
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : null;

  const maxRowsRaw = Number(query.max_rows);
  let maxRows = null;
  if (Number.isFinite(maxRowsRaw) && maxRowsRaw > 0) {
    maxRows = Math.min(QB_INTELLIGENCE_API_MAX_ROWS_CEILING, Math.floor(maxRowsRaw));
  }

  const includeInvoiceLines =
    query.include_invoice_lines === "1" ||
    query.include_invoice_lines === "true" ||
    query.include_invoice_lines === true;

  const insightLimitRaw = Number(query.insight_list_limit);
  const insightListLimit =
    Number.isFinite(insightLimitRaw) && insightLimitRaw > 0
      ? Math.min(500, Math.floor(insightLimitRaw))
      : QB_INTELLIGENCE_API_INSIGHT_LIST_LIMIT;

  return { asOfDate, pageSize, maxRows, includeInvoiceLines, insightListLimit };
}

/**
 * Shape a Phase 4B snapshot into the Phase 4C API response contract.
 *
 * @param {object} snapshot
 * @param {{ maxRows?: number|null, pageSize?: number|null }} [requestMeta]
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

  const body = {
    ok: true,
    organization_id: snapshot.organization_id,
    generated_at: snapshot.generated_at,
    as_of_date: snapshot.as_of_date,
    metadata: {
      organization_id: snapshot.organization_id,
      generated_at: snapshot.generated_at,
      as_of_date: snapshot.as_of_date,
      page_size: pageSize,
      max_rows: maxRows,
      include_invoice_lines: Boolean(snapshot.load_meta?.include_invoice_lines),
      staging_row_counts: snapshot.load_meta?.staging_row_counts ?? null,
      insight_list_count: Array.isArray(snapshot.insight_list) ? snapshot.insight_list.length : 0,
    },
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
          ...(parsed.pageSize != null ? { pageSize: parsed.pageSize } : {}),
        });

        const snapshot = await loadSnapshot(repository, organizationId, {
          asOfDate: parsed.asOfDate,
          pageSize: parsed.pageSize ?? undefined,
          maxRows: parsed.maxRows,
          includeInvoiceLines: parsed.includeInvoiceLines,
          insightListLimit: parsed.insightListLimit,
        });

        const body = buildQuickBooksIntelligenceApiResponse(snapshot, {
          maxRows: parsed.maxRows,
          pageSize: parsed.pageSize ?? snapshot.load_meta?.page_size ?? null,
        });

        return res.status(200).json(body);
      } catch (err) {
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : null;
        // Safe message only — never echo raw DB text / PII.
        return res.status(500).json({
          ok: false,
          error: "QuickBooks intelligence snapshot failed",
          ...(code ? { code } : {}),
        });
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
    requireRole(["admin"]),
    requireHeadAccess("system_admin", { getSupabase }),
  ];
  const handlers = createQuickBooksIntelligenceHandlers(deps);

  app.get("/api/admin/quickbooks/intelligence/executive", ...stack, (req, res) =>
    handlers.getExecutiveSnapshot(req, res),
  );
}
