/**
 * Staff Mark Sold + QuickBooks sales order routes for Quote Flow, and the pull
 * protocol for the Windows QuickBooks agent.
 *
 * Staff routes reuse the Studio Sold Review service (privileged, checklist-gated,
 * idempotent). A successful Mark Sold enqueues one durable sales order job when the
 * organization has sales orders configured. Enqueue failure never undoes Mark Sold:
 * the agent poll re-creates any missing job from the sold snapshot.
 *
 * Agent routes authenticate with QB_SALES_ORDER_AGENT_TOKEN and are bound to
 * QB_SALES_ORDER_AGENT_ORGANIZATION_ID on the server; the agent never chooses an org.
 */

import express from "express";

import { constantTimeEqualString } from "../../accountDirectory/qbCustomerEnrichment/syncAuth.js";
import { canMarkStudioEstimateSold, createStudioSoldReviewService } from "../studioSoldReviewService.mjs";
import { studioEstimateQuoteNumber } from "../studioEstimatePublicationAdapter.mjs";
import { createStudioSalesOrderQueue } from "./studioSalesOrderQueue.mjs";
import { createSupabaseSalesOrderJobRepository } from "./supabaseSalesOrderJobRepository.mjs";
import {
  loadSalesOrderIntegrationConfig,
  loadStudioSalesOrderMapping,
  loadStudioSalesOrderSource,
  resolveStudioCustomerJob
} from "./studioSalesOrderSources.mjs";

const jsonParser = express.json({ limit: "64kb" });
const agentJsonParser = express.json({ limit: "2mb" });
const SWEEP_WINDOW_DAYS = 30;
const SWEEP_LIMIT = 200;

function httpError(code, message, statusCode) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

/**
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   env?: NodeJS.ProcessEnv,
 *   repository?: any,
 *   now?: () => Date,
 *   logger?: Pick<Console, "warn"|"error"|"info">
 * }} deps
 */
export function createStudioSalesOrderService(deps) {
  const env = deps.env || process.env;
  const logger = deps.logger || console;
  const db = () => deps.getSupabase();
  const repository = deps.repository || createSupabaseSalesOrderJobRepository({ db: db() });
  const queue = createStudioSalesOrderQueue({
    repository,
    env,
    now: deps.now,
    qbXmlVersion: String(env.QB_SALES_ORDER_QBXML_VERSION || "16.0"),
    loadMapping: (orgId) => loadStudioSalesOrderMapping(db(), orgId),
    resolveCustomerJob: (orgId, sold, override) => resolveStudioCustomerJob(db(), orgId, sold, override),
    loadSource: (orgId, soldSnapshotId) => loadStudioSalesOrderSource(db(), orgId, soldSnapshotId)
  });

  async function enqueueForSoldSnapshot({ organizationId, soldSnapshotId, quoteNumber = null, actorUserId = null }) {
    const config = await loadSalesOrderIntegrationConfig(db(), organizationId);
    if (!config) return { status: "not_configured", job: null };
    const source = await loadStudioSalesOrderSource(db(), organizationId, soldSnapshotId);
    if (!source) throw httpError("sold_snapshot_not_found", "Sold snapshot not found.", 404);
    const { job, created } = await queue.enqueueFromSold({
      organizationId,
      soldSnapshot: source.soldSnapshot,
      acceptance: source.acceptance,
      quoteNumber,
      actorUserId
    });
    return { status: job.status, created, job };
  }

  /** Re-create jobs for recent sold snapshots that have none (crash between Mark Sold and enqueue). */
  async function sweepMissingJobs(organizationId) {
    const config = await loadSalesOrderIntegrationConfig(db(), organizationId);
    if (!config) return { enqueued: 0 };
    const since = new Date(Date.now() - SWEEP_WINDOW_DAYS * 86400_000).toISOString();
    const { data: sold, error } = await db()
      .from("studio_estimate_sold_snapshots")
      .select("id, intake_case_id, studio_estimate_id, estimate_revision")
      .eq("organization_id", organizationId)
      .gte("sold_at", since)
      .order("sold_at", { ascending: false })
      .limit(SWEEP_LIMIT);
    if (error) throw httpError("sales_order_sweep_failed", error.message, 503);
    if (!sold?.length) return { enqueued: 0 };
    const { data: jobs, error: jobsError } = await db()
      .from("studio_qb_sales_order_jobs")
      .select("sold_snapshot_id")
      .eq("organization_id", organizationId)
      .in("sold_snapshot_id", sold.map((s) => s.id));
    if (jobsError) throw httpError("sales_order_sweep_failed", jobsError.message, 503);
    const have = new Set((jobs || []).map((j) => j.sold_snapshot_id));
    let enqueued = 0;
    for (const s of sold) {
      if (have.has(s.id)) continue;
      const quoteNumber = `${studioEstimateQuoteNumber({ intakeCaseId: s.intake_case_id, id: s.studio_estimate_id })}-R${s.estimate_revision}`;
      try {
        await enqueueForSoldSnapshot({ organizationId, soldSnapshotId: s.id, quoteNumber });
        enqueued += 1;
      } catch (e) {
        logger.warn("[qb-sales-order] sweep enqueue failed", { soldSnapshotId: s.id, code: e?.code || e?.message });
      }
    }
    return { enqueued };
  }

  async function statusForEstimate(organizationId, estimateId) {
    const job = repository.getLatestForEstimate ? await repository.getLatestForEstimate(organizationId, estimateId) : null;
    if (job) return queue.getJob(organizationId, job.id);
    const config = await loadSalesOrderIntegrationConfig(db(), organizationId);
    return config ? null : { status: "not_configured" };
  }

  return { queue, repository, enqueueForSoldSnapshot, sweepMissingJobs, statusForEstimate };
}

/**
 * Enqueue after a successful Mark Sold. Never throws: Mark Sold already committed,
 * and the agent-poll sweep re-creates the job if this step is lost.
 */
export async function enqueueSalesOrderAfterMarkSold({
  salesOrderService,
  estimateRepository,
  organizationId,
  estimateId,
  soldSnapshotId,
  actorUserId = null
}) {
  try {
    const estimate = estimateRepository?.getById ? await estimateRepository.getById(organizationId, estimateId) : null;
    const quoteNumber = estimate ? `${studioEstimateQuoteNumber(estimate)}-R${Number(estimate.revision) || 1}` : null;
    const enq = await salesOrderService.enqueueForSoldSnapshot({ organizationId, soldSnapshotId, quoteNumber, actorUserId });
    return { salesOrder: enq.job || { status: enq.status }, salesOrderError: null };
  } catch (e) {
    console.error("[qb-sales-order] enqueue after Mark Sold failed", { estimateId, code: e?.code || e?.message });
    return { salesOrder: null, salesOrderError: e?.code || "sales_order_enqueue_failed" };
  }
}

function sendError(res, e, fallback) {
  const status = Number(e?.statusCode) || 500;
  res.status(status).json({ ok: false, error: status < 500 ? e.message : fallback, code: e?.code || undefined });
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   staffStack: any[],
 *   orgIdFor: (req: any) => Promise<string>,
 *   getSupabase: () => any,
 *   env?: NodeJS.ProcessEnv,
 *   lifecycleRepository: any,
 *   estimateRepository: any,
 *   soldReviewService?: any,
 *   salesOrderService?: any,
 *   basePath?: string
 * }} deps
 */
export function attachQuoteFlowSoldRoutes(app, deps) {
  const env = deps.env || process.env;
  const base = deps.basePath || "/api/elite100-quote-flow/estimates/:estimateId";
  const { staffStack, orgIdFor } = deps;
  let soldReviewService = deps.soldReviewService || null;
  let salesOrderService = deps.salesOrderService || null;

  function sold() {
    if (!soldReviewService) {
      if (!deps.lifecycleRepository || !deps.estimateRepository) {
        throw httpError("studio_lifecycle_persistence_unavailable", "Sold review is unavailable.", 503);
      }
      soldReviewService = createStudioSoldReviewService({
        env,
        lifecycleRepository: deps.lifecycleRepository,
        studioEstimateRepository: deps.estimateRepository
      });
    }
    return soldReviewService;
  }

  function salesOrders() {
    if (!salesOrderService) salesOrderService = createStudioSalesOrderService({ getSupabase: deps.getSupabase, env });
    return salesOrderService;
  }

  async function safeSalesOrderStatus(organizationId, estimateId) {
    try {
      return { salesOrder: await salesOrders().statusForEstimate(organizationId, estimateId), salesOrderError: null };
    } catch (e) {
      return { salesOrder: null, salesOrderError: e?.code || "sales_order_unavailable" };
    }
  }

  function requireSoldPrivilege(req) {
    if (!canMarkStudioEstimateSold(req.user, env)) {
      throw httpError("forbidden_mark_sold", "Mark Sold and QuickBooks actions require a privileged role.", 403);
    }
  }

  const estimateIdOf = (req) => decodeURIComponent(String(req.params.estimateId || ""));

  app.get(`${base}/sold`, ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const estimateId = estimateIdOf(req);
      const workspace = await sold().getSoldReviewWorkspace(organizationId, estimateId);
      const { salesOrder, salesOrderError } = await safeSalesOrderStatus(organizationId, estimateId);
      res.json({ ...workspace, canMarkSold: canMarkStudioEstimateSold(req.user, env), salesOrder, salesOrderError });
    } catch (e) {
      sendError(res, e, "Unable to load sold review.");
    }
  });

  app.put(`${base}/sold-review`, ...staffStack, jsonParser, async (req, res) => {
    try {
      const organizationId = await orgIdFor(req);
      const result = await sold().upsertSoldReviewChecklist({
        organizationId,
        estimateId: estimateIdOf(req),
        checklist: req.body?.checklist || {},
        notes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 4000) : null,
        updatedByUserId: req.user?.id || null
      });
      res.json(result);
    } catch (e) {
      sendError(res, e, "Unable to save sold review.");
    }
  });

  app.post(`${base}/mark-sold`, ...staffStack, jsonParser, async (req, res) => {
    try {
      const organizationId = await orgIdFor(req);
      const estimateId = estimateIdOf(req);
      const result = await sold().markSold({
        organizationId,
        estimateId,
        actorUser: req.user,
        acceptanceId: req.body?.acceptanceId || null
      });
      const { salesOrder, salesOrderError } = await enqueueSalesOrderAfterMarkSold({
        salesOrderService: salesOrders(),
        estimateRepository: deps.estimateRepository,
        organizationId,
        estimateId,
        soldSnapshotId: result.soldSnapshot.id,
        actorUserId: req.user?.id || null
      });
      console.info("[qb-sales-order] marked sold", { organizationId, estimateId, actor: req.user?.id || null, salesOrderStatus: salesOrder?.status || null });
      res.json({ ...result, salesOrder, salesOrderError });
    } catch (e) {
      sendError(res, e, "Unable to mark sold.");
    }
  });

  app.get(`${base}/sales-order`, ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      res.json({ ok: true, salesOrder: await salesOrders().statusForEstimate(organizationId, estimateIdOf(req)) });
    } catch (e) {
      sendError(res, e, "Unable to load the QuickBooks sales order.");
    }
  });

  app.post(`${base}/sales-order/retry`, ...staffStack, jsonParser, async (req, res) => {
    try {
      requireSoldPrivilege(req);
      const organizationId = await orgIdFor(req);
      const current = await salesOrders().statusForEstimate(organizationId, estimateIdOf(req));
      if (!current?.jobId) throw httpError("sales_order_job_not_found", "No sales order for this estimate.", 404);
      res.json({ ok: true, salesOrder: await salesOrders().queue.retry({ organizationId, jobId: current.jobId }) });
    } catch (e) {
      sendError(res, e, "Unable to retry the sales order.");
    }
  });

  app.put(`${base}/sales-order/customer-job`, ...staffStack, jsonParser, async (req, res) => {
    try {
      requireSoldPrivilege(req);
      const organizationId = await orgIdFor(req);
      const current = await salesOrders().statusForEstimate(organizationId, estimateIdOf(req));
      if (!current?.jobId) throw httpError("sales_order_job_not_found", "No sales order for this estimate.", 404);
      const selection = { listId: req.body?.listId ?? null, fullName: req.body?.fullName ?? null };
      if (selection.fullName && !selection.listId && String(env.QB_SALES_ORDER_WRITE_ENVIRONMENT || "").trim().toLowerCase() !== "test") {
        throw httpError("customer_job_list_id_required", "Choose a QuickBooks customer:job from the list.", 400);
      }
      const salesOrder = await salesOrders().queue.selectCustomerJob({
        organizationId,
        jobId: current.jobId,
        selection,
        actorUserId: req.user?.id || null
      });
      res.json({ ok: true, salesOrder });
    } catch (e) {
      sendError(res, e, "Unable to set the QuickBooks customer:job.");
    }
  });

  return { soldReviewService: () => sold(), salesOrderService: () => salesOrders() };
}

/**
 * @param {import("express").Request} req
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null} bound organization id when the agent token is valid
 */
function authenticateAgent(req, env) {
  const expected = String(env.QB_SALES_ORDER_AGENT_TOKEN ?? "").trim();
  const org = String(env.QB_SALES_ORDER_AGENT_ORGANIZATION_ID ?? "").trim();
  if (!expected || !org) return null;
  const auth = String(req.header("authorization") ?? "").trim();
  const got = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return constantTimeEqualString(got, expected) ? org : null;
}

/**
 * @param {import("express").Express} app
 * @param {{ getSupabase: () => any, env?: NodeJS.ProcessEnv, salesOrderService?: any }} deps
 */
export function attachSalesOrderAgentRoutes(app, deps) {
  const env = deps.env || process.env;
  let service = deps.salesOrderService || null;
  const svc = () => (service ||= createStudioSalesOrderService({ getSupabase: deps.getSupabase, env }));

  app.post("/api/internal/qb-sales-order-agent/next", agentJsonParser, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const organizationId = authenticateAgent(req, env);
    if (!organizationId) return res.status(401).json({ ok: false, error: "Unauthorized" });
    try {
      await svc().sweepMissingJobs(organizationId).catch((e) => console.warn("[qb-sales-order] sweep failed", e?.code || e?.message));
      const { work } = await svc().queue.agentNext({ organizationId });
      res.json({ ok: true, work });
    } catch (e) {
      sendError(res, e, "Unable to claim sales order work.");
    }
  });

  app.post("/api/internal/qb-sales-order-agent/result", agentJsonParser, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const organizationId = authenticateAgent(req, env);
    if (!organizationId) return res.status(401).json({ ok: false, error: "Unauthorized" });
    try {
      const b = req.body || {};
      const result = await svc().queue.agentResult({
        organizationId,
        jobId: String(b.jobId || ""),
        attemptId: String(b.attemptId || ""),
        step: String(b.step || ""),
        responseXml: typeof b.responseXml === "string" ? b.responseXml : null,
        transportError: b.transportError ? String(b.transportError).slice(0, 500) : null
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      sendError(res, e, "Unable to record the QuickBooks result.");
    }
  });
}
