/**
 * DE.2F — Studio review queue + amendment routes (pilot-gated).
 */

import express from "express";
import { resolveOrganizationContext } from "../../organizations/organizationContext.js";
import { assertInternalQuoteOperator } from "../../quotes/partnerContext.js";
import { requireHeadAccess } from "../../auth/headAccessMiddleware.js";
import { requireElite100EstimateStudioPilot } from "../../elite100EstimateStudio/elite100EstimateStudioAccess.mjs";
import {
  ELITE100_ESTIMATE_STUDIO_HEAD_SLUG,
  isElite100EstimateStudioEnabled
} from "../../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";
import { isDigitalEstimateApiEnabled } from "../digitalEstimateConfig.mjs";
import { redactDigitalEstimateTokenPath } from "../digitalEstimateToken.mjs";
import {
  createInMemoryDigitalEstimateRepository,
  createSupabaseDigitalEstimateRepository
} from "../digitalEstimateRepository.mjs";
import {
  isDigitalEstimateAmendmentsEnabled,
  isDigitalEstimateAmendmentStudioRuntimeEnabled,
  readSafeDigitalEstimateAmendmentConfig
} from "./amendmentConfig.mjs";
import {
  createInMemoryAmendmentRepository,
  createSupabaseAmendmentRepository
} from "./amendmentRepository.mjs";
import { createAmendmentStudioService } from "./amendmentStudioService.mjs";
import { isDigitalEstimateConfigurationEnabled } from "./configurationConfig.mjs";
import { createDigitalEstimateConfigurationStack } from "./configurationFactory.mjs";

const jsonParser = express.json({ limit: "256kb" });

function logAmd(label, e, req) {
  const path = redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "");
  console.error(`[digital-estimate-amendment] ${label}`, e?.code || "error", path);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function maybeAttachDigitalEstimateAmendmentRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (
    !isDigitalEstimateApiEnabled(env) ||
    !isDigitalEstimateConfigurationEnabled(env) ||
    !isElite100EstimateStudioEnabled(env) ||
    !isDigitalEstimateAmendmentsEnabled(env)
  ) {
    return { mounted: false, reason: "flag_off" };
  }
  return attachDigitalEstimateAmendmentRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachDigitalEstimateAmendmentRoutes(app, deps) {
  const { requireAuth, getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (
    !isDigitalEstimateAmendmentStudioRuntimeEnabled(env) &&
    !deps.amendmentRepository
  ) {
    // Allow test injection without full runtime when repository provided
    if (!deps.amendmentRepository) {
      return { mounted: false, reason: "runtime_off" };
    }
  }

  const stack =
    deps.configurationRepository
      ? null
      : createDigitalEstimateConfigurationStack({
          env,
          mode: deps.mode || (getSupabase ? "supabase" : "memory"),
          db: getSupabase?.(),
          requireRuntimeFlags: !deps.amendmentRepository
        });

  const configurationRepository = deps.configurationRepository || stack?.configuration;
  const pricingPolicyRepository = deps.pricingPolicyRepository || stack?.pricingPolicy;
  const deRepository =
    deps.deRepository ||
    deps.repository ||
    (getSupabase
      ? createSupabaseDigitalEstimateRepository({ db: getSupabase() })
      : createInMemoryDigitalEstimateRepository());
  const amendmentRepository =
    deps.amendmentRepository ||
    (deps.mode === "memory" || !getSupabase
      ? createInMemoryAmendmentRepository({ deRepository, configurationRepository })
      : createSupabaseAmendmentRepository({ db: getSupabase() }));

  if (!configurationRepository || !amendmentRepository) {
    return { mounted: false, reason: "repository_unavailable" };
  }

  const service = createAmendmentStudioService({
    env,
    deRepository,
    configurationRepository,
    pricingPolicyRepository,
    amendmentRepository
  });

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
    requireHeadAccess(ELITE100_ESTIMATE_STUDIO_HEAD_SLUG, { getSupabase }),
    requireElite100EstimateStudioPilot({ env })
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
    if (req.body?.organizationId || req.body?.organization_id || req.query?.organizationId) {
      const err = new Error("Caller must not supply organizationId");
      err.statusCode = 400;
      err.code = "forbidden_caller_authority";
      throw err;
    }
    return ctx.organizationId;
  }

  function sendErr(res, e) {
    const status = Number(e?.statusCode) || 500;
    res.status(status).json({
      ok: false,
      error: status < 500 ? e.message : "Unable to process amendment request",
      code: e?.code || "amendment_error"
    });
  }

  app.get(
    "/api/digital-estimate/amendments/config",
    ...staffStack,
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, ...readSafeDigitalEstimateAmendmentConfig(env) });
    }
  );

  app.get("/api/digital-estimate/review-requests", ...staffStack, async (req, res) => {
    try {
      const organizationId = await orgIdFor(req);
      const result = await service.listReviewRequests(organizationId, req.query || {});
      res.json(result);
    } catch (e) {
      logAmd("list review requests failed", e, req);
      sendErr(res, e);
    }
  });

  app.get("/api/digital-estimate/review-requests/:requestId", ...staffStack, async (req, res) => {
    try {
      const organizationId = await orgIdFor(req);
      const result = await service.getReviewRequestDetail(organizationId, req.params.requestId);
      res.json(result);
    } catch (e) {
      logAmd("get review request failed", e, req);
      sendErr(res, e);
    }
  });

  app.post(
    "/api/digital-estimate/review-requests/:requestId/start",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.startReview(
          organizationId,
          req.params.requestId,
          req.user?.id
        );
        res.json(result);
      } catch (e) {
        logAmd("start review failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/review-requests/:requestId/clarification",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.setClarification(
          organizationId,
          req.params.requestId,
          req.body?.message,
          req.user?.id
        );
        res.json(result);
      } catch (e) {
        logAmd("clarification failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/review-requests/:requestId/close",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.closeReview(
          organizationId,
          req.params.requestId,
          req.body?.reason,
          req.user?.id
        );
        res.json(result);
      } catch (e) {
        logAmd("close review failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/review-requests/:requestId/amendments",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.createAmendmentDraft(
          organizationId,
          req.params.requestId,
          req.user?.id
        );
        res.json(result);
      } catch (e) {
        logAmd("create amendment failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.patch(
    "/api/digital-estimate/amendments/:amendmentId",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.updateAmendmentDraft(
          organizationId,
          req.params.amendmentId,
          req.body || {},
          req.user?.id
        );
        res.json(result);
      } catch (e) {
        logAmd("update amendment failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/amendments/:amendmentId/validate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.validateAmendment(
          organizationId,
          req.params.amendmentId,
          req.body || {},
          req.user?.id
        );
        res.json(result);
      } catch (e) {
        logAmd("validate amendment failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/amendments/:amendmentId/publish",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.publishAmendment(
          organizationId,
          req.params.amendmentId,
          req.body || {},
          req.user?.id
        );
        // Never log accessToken / customerUrl with token
        res.json(result);
      } catch (e) {
        logAmd("publish amendment failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/publications/:publicationId/replacement-link-copied",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.recordReplacementLinkCopied(
          organizationId,
          req.params.publicationId,
          req.user?.id
        );
        res.json(result);
      } catch (e) {
        logAmd("replacement link copied failed", e, req);
        sendErr(res, e);
      }
    }
  );

  console.log("[digital-estimate-amendment] mounted Studio review/amendment routes (flags on)");
  return { mounted: true, config: readSafeDigitalEstimateAmendmentConfig(env) };
}
