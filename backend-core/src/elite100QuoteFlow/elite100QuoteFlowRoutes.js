/**
 * Elite 100 Quote Flow Brain API — Slice 1A–1D (shell, Inbox, Queue/Set Scope, Estimates).
 */

import express from "express";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { assertInternalQuoteOperator } from "../quotes/partnerContext.js";
import { requireHeadAccess } from "../auth/headAccessMiddleware.js";
import { createQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepositoryFactory.mjs";
import { createStudioEstimateService } from "../elite100EstimateStudio/studioEstimateService.mjs";
import { createStudioEstimateQueueService } from "../elite100EstimateStudio/studioEstimateQueueService.mjs";
import {
  createStudioSharedInboxService,
  sharedInboxSafeError
} from "../elite100EstimateStudio/studioSharedInboxService.mjs";
import { openEstimateForIntakeCase } from "../takeoff/intakeOpenEstimateService.mjs";
import { bootstrapIntakeCasesAfterImport } from "../quoteIntake/intakeAutoBootstrapService.mjs";
import { requireElite100QuoteFlowEnabled } from "./elite100QuoteFlowAccess.mjs";
import {
  ELITE100_QUOTE_FLOW_HEAD_SLUG,
  isElite100QuoteFlowEnabled,
  readSafeElite100QuoteFlowConfig
} from "./elite100QuoteFlowConfig.mjs";
import { createQuoteFlowService } from "./quoteFlowService.mjs";
import { createQuoteFlowSetScopeService } from "./quoteFlowSetScope.mjs";
import { createQuoteFlowEstimatesService } from "./quoteFlowEstimates.mjs";
import { quoteFlowSafeError } from "./quoteFlowErrors.mjs";
import {
  approveAndBuildEstimate,
  getLatestTakeoffResult,
  getTakeoffWorkspace
} from "../takeoff/takeoffWorkspaceService.mjs";

const jsonParser = express.json({ limit: "256kb" });

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   env?: NodeJS.ProcessEnv,
 *   quoteFlowService?: ReturnType<typeof createQuoteFlowService>,
 *   quoteFlowSetScopeService?: ReturnType<typeof createQuoteFlowSetScopeService>,
 *   quoteFlowEstimatesService?: ReturnType<typeof createQuoteFlowEstimatesService>,
 *   sharedInboxService?: object,
 *   studioEstimateRepository?: object
 * }} deps
 */
export function maybeAttachElite100QuoteFlowRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isElite100QuoteFlowEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }
  return attachElite100QuoteFlowRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachElite100QuoteFlowRoutes(app, deps) {
  const { requireAuth, getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (!isElite100QuoteFlowEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }

  const rejectPartnerOnlyUser = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, getSupabase());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({
        ok: false,
        error: "Forbidden",
        code: e?.code || "forbidden"
      });
    }
  };

  const staffStack = [
    requireAuth(),
    rejectPartnerOnlyUser,
    requireHeadAccess(ELITE100_QUOTE_FLOW_HEAD_SLUG, { getSupabase }),
    requireElite100QuoteFlowEnabled({ env })
  ];

  async function orgIdFor(req) {
    const db = getSupabase();
    const ctx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
    if (!ctx.organizationId) {
      const err = new Error("Organization context unavailable");
      err.statusCode = 403;
      err.code = "organization_required";
      throw err;
    }
    return ctx.organizationId;
  }

  let quoteFlowService = deps.quoteFlowService || null;
  let quoteFlowSetScopeService = deps.quoteFlowSetScopeService || null;
  let quoteFlowEstimatesService = deps.quoteFlowEstimatesService || null;

  if (!quoteFlowService || !quoteFlowSetScopeService || !quoteFlowEstimatesService) {
    const studioEstimateService =
      deps.studioEstimateService || createStudioEstimateService({ env, getSupabase });
    const quoteIntakeRepository =
      deps.quoteIntakeRepository ||
      createQuoteIntakeRepository({ env, getSupabase }).repository;
    const studioEstimateQueueService =
      deps.studioEstimateQueueService ||
      createStudioEstimateQueueService({ env, getSupabase });
    const estimateRepository =
      deps.studioEstimateRepository || studioEstimateService.repository || null;

    if (!quoteFlowService) {
      const sharedInboxService =
        deps.sharedInboxService ||
        createStudioSharedInboxService({
          env,
          quoteIntakeRepository,
          studioEstimateQueueService,
          graphClient: deps.graphClient || null,
          graphFetchImpl: deps.graphFetchImpl || undefined,
          getSupabase,
          openEstimate: deps.openEstimate || openEstimateForIntakeCase,
          bootstrapIntakeCases:
            deps.bootstrapIntakeCases ||
            ((args) =>
              bootstrapIntakeCasesAfterImport({
                ...args,
                openEstimate: deps.openEstimate || openEstimateForIntakeCase
              }))
        });

      quoteFlowService = createQuoteFlowService({
        sharedInboxService,
        estimateRepository,
        env
      });
    }

    if (!quoteFlowSetScopeService) {
      quoteFlowSetScopeService = createQuoteFlowSetScopeService({
        queueService: deps.studioEstimateQueueService || studioEstimateQueueService,
        estimateRepository,
        studioEstimateService,
        approveAndBuildEstimate: deps.approveAndBuildEstimate || approveAndBuildEstimate,
        getTakeoffWorkspace: deps.getTakeoffWorkspace || getTakeoffWorkspace,
        getLatestTakeoffResult: deps.getLatestTakeoffResult || getLatestTakeoffResult,
        getSupabase,
        env
      });
    }

    if (!quoteFlowEstimatesService) {
      quoteFlowEstimatesService = createQuoteFlowEstimatesService({
        estimateRepository,
        studioEstimateService,
        env
      });
    }
  }

  function sendSafeError(res, e, fallback) {
    const status = Number(e?.statusCode) || 500;
    const code = String(e?.code || "mailbox_unavailable");
    const safe = quoteFlowSafeError(code, e?.message || fallback);
    if (
      (safe.code === "attachment_not_supported" ||
        safe.code === "takeoff_unavailable" ||
        safe.code === "import_failed") &&
      e?.diagnostic &&
      typeof e.diagnostic === "object"
    ) {
      safe.diagnostic = e.diagnostic;
    }
    // Prefer Shared Inbox wording for known mailbox codes.
    if (status >= 500 || safe.code.startsWith("mailbox_") || safe.code === "message_not_found") {
      const shared = sharedInboxSafeError(code, fallback);
      if (shared?.error) safe.error = shared.error;
    }
    res.status(status).json(safe);
  }

  app.get("/api/elite100-quote-flow/health", ...staffStack, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      shell: "slice-1d",
      headSlug: ELITE100_QUOTE_FLOW_HEAD_SLUG
    });
  });

  app.get("/api/elite100-quote-flow/config", ...staffStack, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      config: {
        ...readSafeElite100QuoteFlowConfig(env),
        shell: "slice-1d"
      }
    });
  });

  app.get("/api/elite100-quote-flow/inbox", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const result = await quoteFlowService.listInbox({
        organizationId,
        actorUserId: req.user?.id ?? null,
        query: req.query || {}
      });
      res.json(result);
    } catch (e) {
      console.error("[elite100-quote-flow] inbox list failed", e?.code || e?.message);
      sendSafeError(res, e, "Inbox could not be refreshed.");
    }
  });

  app.get("/api/elite100-quote-flow/inbox/:messageKey", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const result = await quoteFlowService.getMessage({
        organizationId,
        messageKey: decodeURIComponent(String(req.params.messageKey || "")),
        actorUserId: req.user?.id ?? null
      });
      res.json(result);
    } catch (e) {
      console.error("[elite100-quote-flow] inbox detail failed", e?.code || e?.message);
      sendSafeError(res, e, "Unable to load message details.");
    }
  });

  app.post(
    "/api/elite100-quote-flow/inbox/:messageKey/start-takeoff",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const idempotencyKey =
          String(req.get("idempotency-key") || body.idempotencyKey || "").trim() || null;
        const result = await quoteFlowService.startTakeoff({
          organizationId,
          actorUserId: req.user?.id ?? null,
          messageKey: decodeURIComponent(String(req.params.messageKey || "")),
          attachmentKey: body.attachmentKey ? String(body.attachmentKey) : null,
          markAsPlan: body.markAsPlan === true || body.markAsPlan === "true",
          manualPlanOverride:
            body.manualPlanOverride === true || body.manualPlanOverride === "true",
          confirm: body.confirm === true || body.confirm === "true",
          idempotencyKey
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "inbox.start_takeoff",
            userId: req.user?.id ?? null,
            intakeCaseId: result.intakeCaseId ?? null,
            takeoffJobId: result.takeoffJobId ?? null,
            reused: result.reused === true,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] start-takeoff failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to start AI Takeoff.");
      }
    }
  );

  app.get("/api/elite100-quote-flow/queue", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const result = await quoteFlowSetScopeService.listQueue({
        organizationId,
        actorUserId: req.user?.id ?? null,
        query: req.query || {}
      });
      res.json(result);
    } catch (e) {
      console.error("[elite100-quote-flow] queue list failed", e?.code || e?.message);
      sendSafeError(res, e, "Estimate Queue could not be refreshed.");
    }
  });

  app.get("/api/elite100-quote-flow/queue/:takeoffJobId", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const result = await quoteFlowSetScopeService.getQueueDetail({
        organizationId,
        takeoffJobId: decodeURIComponent(String(req.params.takeoffJobId || "")),
        actorUserId: req.user?.id ?? null
      });
      res.json(result);
    } catch (e) {
      console.error("[elite100-quote-flow] queue detail failed", e?.code || e?.message);
      sendSafeError(res, e, "Unable to load takeoff for review.");
    }
  });

  app.post(
    "/api/elite100-quote-flow/queue/:takeoffJobId/set-scope",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowSetScopeService.setScope({
          organizationId,
          actorUserId: req.user?.id ?? null,
          takeoffJobId: decodeURIComponent(String(req.params.takeoffJobId || "")),
          confirm: body.confirm === true || body.confirm === "true",
          takeoffResult: body.takeoffResult || null,
          reviewState: body.reviewState || null
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "queue.set_scope",
            userId: req.user?.id ?? null,
            intakeCaseId: result.intakeCaseId ?? null,
            takeoffJobId: result.takeoffJobId ?? null,
            estimateId: result.estimateId ?? null,
            reused: result.reused === true,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] set-scope failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to set scope from takeoff.");
      }
    }
  );

  app.get("/api/elite100-quote-flow/estimates", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const result = await quoteFlowEstimatesService.listEstimates({
        organizationId,
        actorUserId: req.user?.id ?? null,
        query: req.query || {}
      });
      res.json(result);
    } catch (e) {
      console.error("[elite100-quote-flow] estimates list failed", e?.code || e?.message);
      sendSafeError(res, e, "Estimates could not be refreshed.");
    }
  });

  app.get("/api/elite100-quote-flow/estimates/:estimateId", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const result = await quoteFlowEstimatesService.getEstimateDetail({
        organizationId,
        estimateId: decodeURIComponent(String(req.params.estimateId || "")),
        actorUserId: req.user?.id ?? null
      });
      res.json(result);
    } catch (e) {
      console.error("[elite100-quote-flow] estimate detail failed", e?.code || e?.message);
      sendSafeError(res, e, "Unable to load estimate.");
    }
  });

  app.patch(
    "/api/elite100-quote-flow/estimates/:estimateId/scope",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowEstimatesService.patchOfficialScope({
          organizationId,
          actorUserId: req.user?.id ?? null,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          body
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "estimates.patch_scope",
            userId: req.user?.id ?? null,
            estimateId: result.estimate?.estimateId ?? null,
            intakeCaseId: result.estimate?.intakeCaseId ?? null,
            takeoffJobId: result.estimate?.takeoffJobId ?? null,
            reused: result.reused === true,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] patch scope failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to save official scope.");
      }
    }
  );

  console.log(
    "[elite100-quote-flow] mounted health|config|inbox|queue|set-scope|estimates (Slice 1D)"
  );
  return { mounted: true, reason: "ok" };
}
