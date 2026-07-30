/**
 * Elite 100 Studio V2 Slice A routes — additive under /api/elite100-studio-v2.
 * Same staff auth as V1 Studio. Does not alter V1 estimate-workspace routes.
 */

import express from "express";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { assertInternalQuoteOperator } from "../quotes/partnerContext.js";
import { requireHeadAccess } from "../auth/headAccessMiddleware.js";
import { requireElite100EstimateStudioPilot } from "./elite100EstimateStudioAccess.mjs";
import {
  ELITE100_ESTIMATE_STUDIO_HEAD_SLUG,
  isElite100EstimateStudioEnabled
} from "./elite100EstimateStudioConfig.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import { createSupabaseDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createDigitalEstimateConfigurationStack } from "../digitalEstimate/configuration/configurationFactory.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { isDigitalEstimateConfigurationEnabled } from "../digitalEstimate/configuration/configurationConfig.mjs";
import { createSupabaseAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { isDigitalEstimateReviewRequestsEnabled } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import { resolveStudioLifecycleRepositoryForRoutes } from "./studioLifecycleRepositoryFactory.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import {
  sanitizePublishBlockers,
  STUDIO_V2_ERROR_CODES,
  studioV2UserMessage
} from "./studioV2Errors.mjs";
import { redactDigitalEstimateTokenPath } from "../digitalEstimate/digitalEstimateToken.mjs";

const jsonParser = express.json({ limit: "256kb" });

function logStudioV2(label, e, req) {
  const path = redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "");
  console.error(`[elite100-studio-v2] ${label}`, e?.code || "error", path);
}

function auditStudioV2(action, req, detail = {}) {
  console.info(
    "[elite100-studio-v2][audit]",
    JSON.stringify({
      action,
      userId: req.user?.id ?? null,
      estimateId: detail.estimateId ?? null,
      intakeCaseId: detail.intakeCaseId ?? null,
      code: detail.code ?? null,
      at: new Date().toISOString()
    })
  );
}

/**
 * @param {unknown} e
 * @param {string} fallback
 */
function studioV2ErrorBody(e, fallback) {
  const status = Number(e?.statusCode) || 500;
  const code = e?.code || STUDIO_V2_ERROR_CODES.UNAVAILABLE;
  /** @type {Record<string, unknown>} */
  const body = {
    ok: false,
    error: status < 500 ? e?.message || studioV2UserMessage(code, fallback) : fallback,
    code
  };
  if (Array.isArray(e?.blockers) && e.blockers.length) {
    body.blockers = sanitizePublishBlockers(e.blockers);
  }
  if (e?.details != null) body.details = e.details;
  if (Array.isArray(e?.details?.issues)) body.issues = e.details.issues;
  if (e?.code === "estimate_revision_superseded" || code === STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION) {
    body.activeEstimateId = e.activeEstimateId || e?.details?.activeEstimateId || null;
  }
  return { status, body };
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function maybeAttachElite100StudioV2Routes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isElite100EstimateStudioEnabled(env) && !deps.forceMount) {
    return { mounted: false, reason: "studio_flag_off" };
  }
  return attachElite100StudioV2Routes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachElite100StudioV2Routes(app, deps) {
  const { requireAuth, getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (!isElite100EstimateStudioEnabled(env) && !deps.forceMount) {
    return { mounted: false, reason: "studio_flag_off" };
  }

  const rejectPartnerOnlyUser = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, getSupabase());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({
        ok: false,
        error: "Forbidden",
        code: e?.code || STUDIO_V2_ERROR_CODES.FORBIDDEN
      });
    }
  };

  const staffStack = [
    requireAuth(),
    rejectPartnerOnlyUser,
    requireHeadAccess(ELITE100_ESTIMATE_STUDIO_HEAD_SLUG, { getSupabase }),
    requireElite100EstimateStudioPilot({ env })
  ];

  async function orgIdFor(req) {
    const db = getSupabase();
    const ctx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
    if (!ctx.organizationId) {
      const err = new Error("Organization context unavailable");
      err.statusCode = 403;
      err.code = STUDIO_V2_ERROR_CODES.FORBIDDEN;
      throw err;
    }
    return ctx.organizationId;
  }

  const studioEstimateService =
    deps.studioEstimateService ||
    createStudioEstimateService({ env, getSupabase, repository: deps.estimateRepository });

  const deRepository =
    deps.digitalEstimateRepository ||
    createSupabaseDigitalEstimateRepository({ db: getSupabase() });

  let configurationStudioService = deps.configurationStudioService || null;
  if (!configurationStudioService && isDigitalEstimateConfigurationEnabled(env)) {
    try {
      const stack = createDigitalEstimateConfigurationStack({
        env,
        mode: deps.configurationStackMode || undefined,
        db: getSupabase(),
        requireRuntimeFlags: true
      });
      if (stack) {
        configurationStudioService = createConfigurationStudioService({
          configurationRepository: stack.configuration,
          pricingPolicyRepository: stack.pricingPolicy,
          deRepository,
          env
        });
      }
    } catch (e) {
      console.error(
        "[elite100-studio-v2][CRITICAL] configuration stack unavailable — interactive V2 publish will fail closed:",
        e?.code || e?.message
      );
      configurationStudioService = null;
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
    deps.studioDigitalEstimateService ||
    createStudioEstimateDigitalEstimateService({
      env,
      studioEstimateService,
      digitalEstimateRepository: deRepository,
      configurationStudioService,
      amendmentRepository,
      getSupabase,
      loadTakeoffWorkspace: deps.loadTakeoffWorkspace
    });

  let lifecycleRepository = deps.lifecycleRepository || null;
  if (!lifecycleRepository) {
    try {
      lifecycleRepository = resolveStudioLifecycleRepositoryForRoutes({ env, getSupabase });
    } catch {
      lifecycleRepository = null;
    }
  }

  const studioV2 =
    deps.studioV2Service ||
    createStudioV2Service({
      env,
      getSupabase,
      repository: deps.estimateRepository || studioEstimateService.repository,
      studioEstimateService,
      studioDigitalEstimateService,
      lifecycleRepository,
      loadTakeoffWorkspace: deps.loadTakeoffWorkspace,
      loadLatestTakeoffResult: deps.loadLatestTakeoffResult
    });

  app.get(
    "/api/elite100-studio-v2/cases/:caseId/working-draft",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.getWorkingDraft({
          organizationId,
          intakeCaseId: req.params.caseId,
          actorUserId: req.user?.id ?? null
        });
        auditStudioV2("working_draft.get", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null,
          code: result.code || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("working-draft get failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to load working draft");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-studio-v2/cases/:caseId/working-draft/calculate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.calculateWorkingDraft({
          organizationId,
          intakeCaseId: req.params.caseId,
          actorUserId: req.user?.id ?? null
        });
        auditStudioV2("working_draft.calculate", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("working-draft calculate failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to calculate estimate");
        res.status(status).json(body);
      }
    }
  );

  app.patch(
    "/api/elite100-studio-v2/cases/:caseId/working-draft/scope",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.patchWorkingDraftScope({
          organizationId,
          intakeCaseId: req.params.caseId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioV2("working_draft.scope_patch", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("working-draft scope patch failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to save scope");
        res.status(status).json(body);
      }
    }
  );

  app.patch(
    "/api/elite100-studio-v2/cases/:caseId/working-draft/options",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.patchWorkingDraftOptions({
          organizationId,
          intakeCaseId: req.params.caseId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioV2("working_draft.options_patch", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("working-draft options patch failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to save estimate options");
        res.status(status).json(body);
      }
    }
  );

  app.patch(
    "/api/elite100-studio-v2/cases/:caseId/working-draft/pricing",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.patchWorkingDraftPricing({
          organizationId,
          intakeCaseId: req.params.caseId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioV2("working_draft.pricing_patch", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("working-draft pricing patch failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to save pricing settings");
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-studio-v2/cases/:caseId/takeoff-import-preview",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.previewTakeoffImport({
          organizationId,
          intakeCaseId: req.params.caseId
        });
        auditStudioV2("takeoff_import.preview", req, {
          intakeCaseId: req.params.caseId,
          estimateId: null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("takeoff-import preview failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to preview Takeoff import");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-studio-v2/cases/:caseId/takeoff-import-apply",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.applyTakeoffImport({
          organizationId,
          intakeCaseId: req.params.caseId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioV2("takeoff_import.apply", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("takeoff-import apply failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to apply Takeoff import");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-studio-v2/cases/:caseId/working-draft/approve",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.approveWorkingDraft({
          organizationId,
          intakeCaseId: req.params.caseId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioV2("working_draft.approve", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("working-draft approve failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to approve estimate");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-studio-v2/approved/:estimateId/publish",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.publishApproved({
          organizationId,
          estimateId: req.params.estimateId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioV2("approved.publish", req, {
          estimateId: req.params.estimateId,
          code: null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("approved publish failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to publish Digital Estimate");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-studio-v2/cases/:caseId/approved/:estimateId/create-revision",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.createRevisionFromApproved({
          organizationId,
          intakeCaseId: req.params.caseId,
          estimateId: req.params.estimateId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioV2("approved.create_revision", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("approved create-revision failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to create editable revision");
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-studio-v2/cases/:caseId/customer-activity",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioV2.getCustomerActivity({
          organizationId,
          intakeCaseId: req.params.caseId
        });
        auditStudioV2("customer_activity.get", req, {
          intakeCaseId: req.params.caseId,
          estimateId: result.estimateId || null
        });
        res.json(result);
      } catch (e) {
        logStudioV2("customer-activity get failed", e, req);
        const { status, body } = studioV2ErrorBody(e, "Unable to load customer activity");
        res.status(status).json(body);
      }
    }
  );

  return { mounted: true, reason: "ok" };
}
