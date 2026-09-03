/**
 * Elite 100 Quote Flow Brain API — Slice 1A–1E (shell, Inbox, Queue/Set Scope, Estimates, Pricing).
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
import { createQuoteFlowPricingService } from "./quoteFlowPricing.mjs";
import { createQuoteFlowReviewService } from "./quoteFlowReview.mjs";
import { createQuoteFlowDigitalEstimateService } from "./quoteFlowDigitalEstimate.mjs";
import { createQuoteFlowActivityService } from "./quoteFlowActivity.mjs";
import { createQuoteFlowAcceptedReportService } from "./quoteFlowAcceptedReport.mjs";
import { quoteFlowSafeError } from "./quoteFlowErrors.mjs";
import { createStudioSecurePlanViewerService } from "../elite100EstimateStudio/studioSecurePlanViewer.mjs";
import { normalizeStartTakeoffAttachmentKeys } from "./quoteFlowTakeoffPacket.mjs";
import { resolveStudioLifecycleRepositoryForRoutes } from "../elite100EstimateStudio/studioLifecycleRepositoryFactory.mjs";
import {
  approveAndBuildEstimate,
  getLatestTakeoffResult,
  getTakeoffWorkspace,
  reopenTakeoffJobForMeasurementRevision
} from "../takeoff/takeoffWorkspaceService.mjs";
import { createStudioEstimateDigitalEstimateService } from "../elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs";
import {
  createInMemoryDigitalEstimateRepository,
  createSupabaseDigitalEstimateRepository
} from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createDigitalEstimateConfigurationStack } from "../digitalEstimate/configuration/configurationFactory.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { isDigitalEstimateConfigurationEnabled } from "../digitalEstimate/configuration/configurationConfig.mjs";
import { isDigitalEstimateReviewRequestsEnabled } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import { createSupabaseAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";

const jsonParser = express.json({ limit: "256kb" });
/** Set Scope may include a full reviewed TakeoffResult payload. */
const setScopeJsonParser = express.json({ limit: "4mb" });

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   env?: NodeJS.ProcessEnv,
 *   quoteFlowService?: ReturnType<typeof createQuoteFlowService>,
 *   quoteFlowSetScopeService?: ReturnType<typeof createQuoteFlowSetScopeService>,
 *   quoteFlowEstimatesService?: ReturnType<typeof createQuoteFlowEstimatesService>,
 *   quoteFlowPricingService?: ReturnType<typeof createQuoteFlowPricingService>,
 *   quoteFlowReviewService?: ReturnType<typeof createQuoteFlowReviewService>,
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
  let quoteFlowPricingService = deps.quoteFlowPricingService || null;
  let quoteFlowReviewService = deps.quoteFlowReviewService || null;
  let quoteFlowDigitalEstimateService = deps.quoteFlowDigitalEstimateService || null;
  let quoteFlowActivityService = deps.quoteFlowActivityService || null;
  let quoteFlowAcceptedReportService = deps.quoteFlowAcceptedReportService || null;
  /** @type {object|null} */
  let wiredDigitalEstimateRepository = deps.digitalEstimateRepository || null;
  /** @type {object|null} */
  let wiredStudioDigitalEstimateService = deps.studioDigitalEstimateService || null;
  /** @type {object|null} */
  let lifecycleRepository = deps.lifecycleRepository || null;
  if (!lifecycleRepository) {
    try {
      lifecycleRepository = resolveStudioLifecycleRepositoryForRoutes({
        env,
        getSupabase,
        studioEstimateRepository: deps.studioEstimateRepository || null
      });
    } catch {
      lifecycleRepository = null;
    }
  }

  if (
    !quoteFlowService ||
    !quoteFlowSetScopeService ||
    !quoteFlowEstimatesService ||
    !quoteFlowPricingService ||
    !quoteFlowReviewService ||
    !quoteFlowDigitalEstimateService ||
    !quoteFlowActivityService
  ) {
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

      const planViewerService =
        deps.planViewerService ||
        createStudioSecurePlanViewerService({
          env,
          quoteIntakeRepository,
          graphClient: deps.graphClient || null,
          graphFetchImpl: deps.graphFetchImpl || undefined,
          getSupabase
        });

      quoteFlowService = createQuoteFlowService({
        sharedInboxService,
        estimateRepository,
        quoteIntakeRepository,
        planViewerService,
        openEstimate: deps.openEstimate || openEstimateForIntakeCase,
        getSupabase,
        env
      });
    }

    if (!quoteFlowSetScopeService) {
      quoteFlowSetScopeService = createQuoteFlowSetScopeService({
        queueService: deps.studioEstimateQueueService || studioEstimateQueueService,
        estimateRepository,
        studioEstimateService,
        approveAndBuildEstimate: deps.approveAndBuildEstimate || approveAndBuildEstimate,
        reopenTakeoffJobForMeasurementRevision:
          deps.reopenTakeoffJobForMeasurementRevision || reopenTakeoffJobForMeasurementRevision,
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

    if (!quoteFlowPricingService) {
      quoteFlowPricingService = createQuoteFlowPricingService({
        estimateRepository,
        studioEstimateService,
        env
      });
    }

    if (!quoteFlowReviewService) {
      quoteFlowReviewService = createQuoteFlowReviewService({
        estimateRepository,
        studioEstimateService,
        env
      });
    }

    if (!quoteFlowDigitalEstimateService || !quoteFlowActivityService) {
      const deRepository =
        wiredDigitalEstimateRepository ||
        deps.digitalEstimateRepository ||
        (typeof getSupabase === "function" && getSupabase()
          ? createSupabaseDigitalEstimateRepository({ db: getSupabase() })
          : createInMemoryDigitalEstimateRepository());

      let configurationStudioService = deps.configurationStudioService || null;
      let configurationRepository = deps.configurationRepository || null;
      if (
        (!configurationStudioService || !configurationRepository) &&
        isDigitalEstimateConfigurationEnabled(env)
      ) {
        try {
          const stack = createDigitalEstimateConfigurationStack({
            env,
            mode: deps.configurationStackMode || undefined,
            db: typeof getSupabase === "function" ? getSupabase() : null,
            requireRuntimeFlags: true
          });
          if (stack) {
            configurationRepository = configurationRepository || stack.configuration || null;
            if (!configurationStudioService) {
              configurationStudioService = createConfigurationStudioService({
                configurationRepository: stack.configuration,
                pricingPolicyRepository: stack.pricingPolicy,
                deRepository,
                env
              });
            }
          }
        } catch (e) {
          console.warn(
            "[elite100-quote-flow] configuration stack unavailable for Digital Estimate publish:",
            e?.code || e?.message
          );
        }
      }

      let amendmentRepository = deps.amendmentRepository || null;
      if (!amendmentRepository && isDigitalEstimateReviewRequestsEnabled(env)) {
        try {
          amendmentRepository = createSupabaseAmendmentRepository({ db: getSupabase() });
        } catch {
          amendmentRepository = null;
        }
      }

      const studioDigitalEstimateService =
        wiredStudioDigitalEstimateService ||
        deps.studioDigitalEstimateService ||
        createStudioEstimateDigitalEstimateService({
          env,
          studioEstimateService,
          digitalEstimateRepository: deRepository,
          configurationStudioService,
          amendmentRepository,
          getSupabase,
          loadTakeoffWorkspace: deps.getTakeoffWorkspace || getTakeoffWorkspace
        });
      wiredDigitalEstimateRepository = deRepository;
      wiredStudioDigitalEstimateService = studioDigitalEstimateService;

      if (!quoteFlowDigitalEstimateService) {
        quoteFlowDigitalEstimateService = createQuoteFlowDigitalEstimateService({
          estimateRepository,
          studioEstimateService,
          studioDigitalEstimateService,
          env,
          preferInteractiveConfiguration: Boolean(configurationStudioService)
        });
      }

      if (!lifecycleRepository) {
        try {
          lifecycleRepository = resolveStudioLifecycleRepositoryForRoutes({
            env,
            getSupabase,
            studioEstimateRepository: estimateRepository
          });
        } catch {
          lifecycleRepository = null;
        }
      }

      if (!quoteFlowActivityService) {
        quoteFlowActivityService = createQuoteFlowActivityService({
          estimateRepository,
          studioEstimateService,
          studioDigitalEstimateService,
          digitalEstimateRepository: deRepository,
          configurationRepository,
          configurationStudioService,
          lifecycleRepository,
          env
        });
      }

      if (!quoteFlowAcceptedReportService) {
        quoteFlowAcceptedReportService = createQuoteFlowAcceptedReportService({
          estimateRepository,
          studioEstimateService,
          lifecycleRepository,
          env
        });
      }
    }
  }

  if (!quoteFlowActivityService) {
    quoteFlowActivityService = createQuoteFlowActivityService({
      estimateRepository: deps.studioEstimateRepository || null,
      studioEstimateService: deps.studioEstimateService || null,
      studioDigitalEstimateService:
        wiredStudioDigitalEstimateService || deps.studioDigitalEstimateService || null,
      digitalEstimateRepository:
        wiredDigitalEstimateRepository || deps.digitalEstimateRepository || null,
      configurationRepository: deps.configurationRepository || null,
      configurationStudioService: deps.configurationStudioService || null,
      lifecycleRepository,
      env
    });
  }

  if (!quoteFlowAcceptedReportService) {
    quoteFlowAcceptedReportService = createQuoteFlowAcceptedReportService({
      estimateRepository: deps.studioEstimateRepository || null,
      studioEstimateService: deps.studioEstimateService || null,
      lifecycleRepository,
      env
    });
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

  async function sendAttachmentBytes(req, res, disposition) {
    res.set("Cache-Control", "private, no-store");
    try {
      const organizationId = await orgIdFor(req);
      const result = await quoteFlowService.getAttachmentContent({
        organizationId,
        messageKey: decodeURIComponent(String(req.params.messageKey || "")),
        attachmentKey: decodeURIComponent(String(req.params.attachmentKey || "")),
        disposition
      });
      for (const [k, v] of Object.entries(result.headers || {})) {
        res.set(k, v);
      }
      res.status(200).end(result.bytes);
    } catch (e) {
      console.error(
        "[elite100-quote-flow] attachment content failed",
        e?.code || e?.message
      );
      const status = Number(e?.statusCode) || 500;
      const code = String(e?.code || "attachment_content_unavailable");
      res.status(status).json({
        ok: false,
        error:
          status < 500
            ? e?.message || "Unable to load attachment."
            : "Unable to load attachment.",
        code
      });
    }
  }

  app.get(
    "/api/elite100-quote-flow/inbox/:messageKey/attachments/:attachmentKey/preview",
    ...staffStack,
    (req, res) => sendAttachmentBytes(req, res, "inline")
  );

  app.get(
    "/api/elite100-quote-flow/inbox/:messageKey/attachments/:attachmentKey/download",
    ...staffStack,
    (req, res) => sendAttachmentBytes(req, res, "attachment")
  );

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
        const keys = normalizeStartTakeoffAttachmentKeys(body);
        const result = await quoteFlowService.startTakeoff({
          organizationId,
          actorUserId: req.user?.id ?? null,
          messageKey: decodeURIComponent(String(req.params.messageKey || "")),
          attachmentKey: keys[0] || null,
          attachmentKeys: keys,
          markAsPlan: body.markAsPlan === true || body.markAsPlan === "true",
          manualPlanOverride:
            body.manualPlanOverride === true ||
            body.manualPlanOverride === "true" ||
            body.useAttachmentAsPlan === true ||
            body.useAttachmentAsPlan === "true",
          confirm: body.confirm === true || body.confirm === "true",
          startFresh: body.startFresh !== false && body.startFresh !== "false",
          idempotencyKey
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "inbox.start_takeoff",
            userId: req.user?.id ?? null,
            intakeCaseId: result.intakeCaseId ?? null,
            takeoffJobId: result.takeoffJobId ?? null,
            attachmentCount: Array.isArray(result.attachmentKeys)
              ? result.attachmentKeys.length
              : 1,
            packetMerged: result.packetMerged === true,
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

  app.post(
    "/api/elite100-quote-flow/inbox/:messageKey/dismiss",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const messageKey = decodeURIComponent(String(req.params.messageKey || ""));
        const result = await quoteFlowService.dismissMessage({
          organizationId,
          messageKey,
          actorUserId: req.user?.id ?? null
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "inbox.dismiss",
            userId: req.user?.id ?? null,
            messageKey,
            emailDeleted: false,
            mailboxMutated: false,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] inbox dismiss failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to remove from Quote Flow.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/inbox/:messageKey/restore",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const messageKey = decodeURIComponent(String(req.params.messageKey || ""));
        const result = await quoteFlowService.restoreMessage({
          organizationId,
          messageKey,
          actorUserId: req.user?.id ?? null
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "inbox.restore",
            userId: req.user?.id ?? null,
            messageKey,
            emailDeleted: false,
            mailboxMutated: false,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] inbox restore failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to restore to Quote Flow.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/inbox/:messageKey/opened",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const messageKey = decodeURIComponent(String(req.params.messageKey || ""));
        const result = await quoteFlowService.markOpened({
          organizationId,
          messageKey,
          actorUserId: req.user?.id ?? null
        });
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] inbox opened failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to mark request opened.");
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

  app.post(
    "/api/elite100-quote-flow/queue/:queueItemKey/archive",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const queueItemKey = decodeURIComponent(String(req.params.queueItemKey || ""));
        const result = await quoteFlowSetScopeService.archiveQueueItem({
          organizationId,
          queueItemKey,
          actorUserId: req.user?.id ?? null
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "queue.archive",
            userId: req.user?.id ?? null,
            queueItemKey,
            takeoffCancelled: false,
            takeoffDeleted: false,
            intakeDeleted: false,
            estimateDeleted: false,
            emailDeleted: false,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] queue archive failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to archive queue item.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/queue/:queueItemKey/restore",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const queueItemKey = decodeURIComponent(String(req.params.queueItemKey || ""));
        const result = await quoteFlowSetScopeService.restoreQueueItem({
          organizationId,
          queueItemKey,
          actorUserId: req.user?.id ?? null
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "queue.restore",
            userId: req.user?.id ?? null,
            queueItemKey,
            takeoffCancelled: false,
            takeoffDeleted: false,
            intakeDeleted: false,
            estimateDeleted: false,
            emailDeleted: false,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] queue restore failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to restore queue item.");
      }
    }
  );

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
    "/api/elite100-quote-flow/queue/:takeoffJobId/quote-name",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowSetScopeService.updateQuoteName({
          organizationId,
          actorUserId: req.user?.id ?? null,
          takeoffJobId: decodeURIComponent(String(req.params.takeoffJobId || "")),
          quoteName:
            body.quoteName != null
              ? String(body.quoteName)
              : body.estimateName != null
                ? String(body.estimateName)
                : body.projectName != null
                  ? String(body.projectName)
                  : null,
          userSet: body.userSet !== false
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "queue.quote_name",
            userId: req.user?.id ?? null,
            takeoffJobId: result.takeoffJobId ?? null,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] quote-name save failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to save Quote Name.");
      }
    }
  );

  app.get(
    "/api/elite100-quote-flow/queue/:takeoffJobId/requested-selections",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await quoteFlowSetScopeService.getRequestedSelections({
          organizationId,
          takeoffJobId: decodeURIComponent(String(req.params.takeoffJobId || ""))
        });
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] requested-selections get failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to load requested selections.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/queue/:takeoffJobId/requested-selections",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowSetScopeService.updateRequestedSelection({
          organizationId,
          actorUserId: req.user?.id ?? null,
          takeoffJobId: decodeURIComponent(String(req.params.takeoffJobId || "")),
          selectionId: body.selectionId != null ? String(body.selectionId) : null,
          action: body.action != null ? String(body.action) : null,
          patch: body.patch && typeof body.patch === "object" ? body.patch : null,
          item: body.item && typeof body.item === "object" ? body.item : null
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "queue.requested_selections",
            userId: req.user?.id ?? null,
            takeoffJobId: result.takeoffJobId ?? null,
            selectionAction: body.action ?? null,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] requested-selections update failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to update requested selections.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/queue/:takeoffJobId/set-scope",
    ...staffStack,
    setScopeJsonParser,
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
          reviewState: body.reviewState || null,
          projectName: body.projectName != null ? String(body.projectName) : null,
          estimateName: body.estimateName != null ? String(body.estimateName) : null
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

  app.post(
    "/api/elite100-quote-flow/queue/:takeoffJobId/set-manual-scope",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowSetScopeService.setManualScope({
          organizationId,
          actorUserId: req.user?.id ?? null,
          takeoffJobId: decodeURIComponent(String(req.params.takeoffJobId || "")),
          confirm: body.confirm === true || body.confirm === "true",
          rooms: body.rooms,
          projectName: body.projectName != null ? String(body.projectName) : null,
          estimateName: body.estimateName != null ? String(body.estimateName) : null
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "queue.set_manual_scope",
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
        console.error("[elite100-quote-flow] set-manual-scope failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to set manual scope.");
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

  app.get(
    "/api/elite100-quote-flow/estimates/:estimateId/pricing",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await quoteFlowPricingService.getPricing({
          organizationId,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          actorUserId: req.user?.id ?? null
        });
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] estimate pricing get failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to load pricing.");
      }
    }
  );

  app.patch(
    "/api/elite100-quote-flow/estimates/:estimateId/pricing",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowPricingService.patchPricing({
          organizationId,
          actorUserId: req.user?.id ?? null,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          body
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "estimates.patch_pricing",
            userId: req.user?.id ?? null,
            estimateId: result.estimateId ?? null,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] patch pricing failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to save pricing draft.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/estimates/:estimateId/pricing/calculate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowPricingService.calculatePricing({
          organizationId,
          actorUserId: req.user?.id ?? null,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          body
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "estimates.calculate_pricing",
            userId: req.user?.id ?? null,
            estimateId: result.estimateId ?? null,
            persisted: result.persisted === true,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] calculate pricing failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to calculate pricing.");
      }
    }
  );

  app.get(
    "/api/elite100-quote-flow/estimates/:estimateId/review",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await quoteFlowReviewService.getReview({
          organizationId,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          actorUserId: req.user?.id ?? null
        });
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] estimate review get failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to load review.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/estimates/:estimateId/review/approve",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowReviewService.approveReview({
          organizationId,
          actorUserId: req.user?.id ?? null,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          body
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "estimates.review_approve",
            userId: req.user?.id ?? null,
            estimateId: result.estimateId ?? null,
            reused: result.reused === true,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] review approve failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to approve estimate.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/estimates/:estimateId/review/reopen",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowReviewService.reopenReview({
          organizationId,
          actorUserId: req.user?.id ?? null,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          body
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "estimates.review_reopen",
            userId: req.user?.id ?? null,
            estimateId: result.estimateId ?? null,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] review reopen failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to reopen review.");
      }
    }
  );

  app.get(
    "/api/elite100-quote-flow/estimates/:estimateId/digital-estimate",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await quoteFlowDigitalEstimateService.getDigitalEstimate({
          organizationId,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          actorUserId: req.user?.id ?? null
        });
        res.json(result);
      } catch (e) {
        console.error(
          "[elite100-quote-flow] digital estimate get failed",
          e?.code || e?.message
        );
        sendSafeError(res, e, "Unable to load Digital Estimate.");
      }
    }
  );

  app.post(
    "/api/elite100-quote-flow/estimates/:estimateId/digital-estimate/publish",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await quoteFlowDigitalEstimateService.publishDigitalEstimate({
          organizationId,
          actorUserId: req.user?.id ?? null,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          body
        });
        console.info(
          "[elite100-quote-flow][audit]",
          JSON.stringify({
            action: "estimates.digital_estimate_publish",
            userId: req.user?.id ?? null,
            estimateId: result.estimateId ?? null,
            publicationId: result.publication?.publicationId ?? null,
            reused: result.reused === true,
            sold: false,
            accepted: false,
            at: new Date().toISOString()
          })
        );
        res.json(result);
      } catch (e) {
        console.error(
          "[elite100-quote-flow] digital estimate publish failed",
          e?.code || e?.message
        );
        sendSafeError(res, e, "Unable to publish Digital Estimate.");
      }
    }
  );

  app.get(
    "/api/elite100-quote-flow/estimates/:estimateId/activity",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await quoteFlowActivityService.getActivity({
          organizationId,
          estimateId: decodeURIComponent(String(req.params.estimateId || "")),
          actorUserId: req.user?.id ?? null
        });
        res.json(result);
      } catch (e) {
        console.error("[elite100-quote-flow] estimate activity get failed", e?.code || e?.message);
        sendSafeError(res, e, "Unable to load activity.");
      }
    }
  );

  app.get(
    "/api/elite100-quote-flow/estimates/:estimateId/accepted-report",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await quoteFlowAcceptedReportService.getAcceptedReport({
          organizationId,
          estimateId: decodeURIComponent(String(req.params.estimateId || ""))
        });
        res.json(result);
      } catch (e) {
        console.error(
          "[elite100-quote-flow] accepted-report get failed",
          e?.code || e?.message
        );
        sendSafeError(res, e, "Unable to load accepted job report.");
      }
    }
  );

  console.log(
    "[elite100-quote-flow] mounted health|config|inbox|queue|set-scope|estimates|pricing|review|digital-estimate|activity|accepted-report"
  );
  return { mounted: true, reason: "ok" };
}
