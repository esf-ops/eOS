/**
 * DE.2D — Internal Digital Estimate configuration Studio routes.
 * Mounted only when API + configuration + Studio flags are on.
 * No public customer configuration routes.
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
import {
  isDigitalEstimateConfigurationEnabled,
  readSafeDigitalEstimateConfigurationConfig
} from "./configurationConfig.mjs";
import { createDigitalEstimateConfigurationStack } from "./configurationFactory.mjs";
import { createConfigurationStudioService } from "./configurationStudioService.mjs";
import {
  createInMemoryDigitalEstimateRepository,
  createSupabaseDigitalEstimateRepository
} from "../digitalEstimateRepository.mjs";
import { redactDigitalEstimateTokenPath } from "../digitalEstimateToken.mjs";

const jsonParser = express.json({ limit: "256kb" });

function logCfg(label, e, req) {
  const path = redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "");
  console.error(`[digital-estimate-configuration] ${label}`, e?.code || "error", path);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function maybeAttachDigitalEstimateConfigurationRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (
    !isDigitalEstimateApiEnabled(env) ||
    !isDigitalEstimateConfigurationEnabled(env) ||
    !isElite100EstimateStudioEnabled(env)
  ) {
    return { mounted: false, reason: "flag_off" };
  }
  return attachDigitalEstimateConfigurationRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachDigitalEstimateConfigurationRoutes(app, deps) {
  const { requireAuth, getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (
    !isDigitalEstimateApiEnabled(env) ||
    !isDigitalEstimateConfigurationEnabled(env) ||
    !isElite100EstimateStudioEnabled(env)
  ) {
    return { mounted: false, reason: "flag_off" };
  }

  const stack =
    deps.configurationRepository && deps.pricingPolicyRepository
      ? null
      : createDigitalEstimateConfigurationStack({
          env,
          mode: deps.configurationStack?.mode || (deps.configurationRepository ? "memory" : "supabase"),
          db: deps.configurationStack ? null : getSupabase?.(),
          requireRuntimeFlags: true
        });

  // Allow test injection
  const configurationRepository =
    deps.configurationRepository || stack?.configuration;
  const pricingPolicyRepository =
    deps.pricingPolicyRepository || stack?.pricingPolicy;
  const deRepository =
    deps.deRepository ||
    (deps.repository
      ? deps.repository
      : createSupabaseDigitalEstimateRepository({ db: getSupabase() }));

  if (!configurationRepository) {
    return { mounted: false, reason: "repository_unavailable" };
  }

  const service = createConfigurationStudioService({
    deRepository,
    configurationRepository,
    pricingPolicyRepository
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
    // Reject body/query org spoof
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
      error: status < 500 ? e.message : "Unable to process configuration request",
      code: e?.code || "configuration_error",
      blockers: e?.blockers
    });
  }

  app.get(
    "/api/digital-estimate/configuration/config",
    ...staffStack,
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({
        ok: true,
        config: readSafeDigitalEstimateConfigurationConfig(env)
      });
    }
  );

  app.get(
    "/api/digital-estimate/configuration/publications/:publicationId/context",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.getPublicationContext(
          organizationId,
          req.params.publicationId
        );
        // Do not leak optionCatalogInternal sell prices in a confused way — keep for staff
        res.json({ ok: true, ...result });
      } catch (e) {
        logCfg("context failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/configuration/envelopes",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const publicationId = String(req.body?.publicationId || "").trim();
        if (!publicationId) {
          return res.status(400).json({ ok: false, error: "publicationId required", code: "validation" });
        }
        const graph = await service.createDraft(
          organizationId,
          req.user?.id ?? null,
          publicationId,
          req.body || {}
        );
        res.status(201).json({ ok: true, ...graph });
      } catch (e) {
        logCfg("create draft failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.get(
    "/api/digital-estimate/configuration/envelopes/:id",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const graph = await service.getEnvelope(organizationId, req.params.id);
        if (!graph) return res.status(404).json({ ok: false, error: "Not found" });
        res.json({ ok: true, ...graph });
      } catch (e) {
        logCfg("get envelope failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.get(
    "/api/digital-estimate/configuration/publications/:publicationId/envelopes",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const envelopes = await service.listEnvelopes(
          organizationId,
          req.params.publicationId
        );
        res.json({ ok: true, envelopes });
      } catch (e) {
        logCfg("list envelopes failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.patch(
    "/api/digital-estimate/configuration/envelopes/:id",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const envelope = await service.patchDraft(
          organizationId,
          req.params.id,
          req.body || {},
          req.user?.id ?? null
        );
        res.json({ ok: true, envelope });
      } catch (e) {
        logCfg("patch envelope failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.put(
    "/api/digital-estimate/configuration/envelopes/:id/groups",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.putGroups(organizationId, req.params.id, req.body || {});
        res.json({ ok: true, ...result });
      } catch (e) {
        logCfg("put groups failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.put(
    "/api/digital-estimate/configuration/envelopes/:id/options",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.putOptions(organizationId, req.params.id, req.body || {});
        res.json({ ok: true, ...result });
      } catch (e) {
        logCfg("put options failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/configuration/envelopes/:id/validate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.validate(organizationId, req.params.id);
        res.json({ ok: true, ...result });
      } catch (e) {
        logCfg("validate failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/configuration/envelopes/:id/preview",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.preview(
          organizationId,
          req.params.id,
          req.body || {},
          req.user?.id ?? null
        );
        res.json({ ok: true, ...result });
      } catch (e) {
        logCfg("preview failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/configuration/envelopes/:id/activate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await service.activate(
          organizationId,
          req.params.id,
          req.body || {},
          req.user?.id ?? null
        );
        res.json({ ok: true, ...result });
      } catch (e) {
        logCfg("activate failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.post(
    "/api/digital-estimate/configuration/envelopes/:id/clone",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const envelope = await service.clone(
          organizationId,
          req.params.id,
          req.user?.id ?? null
        );
        res.json({ ok: true, envelope });
      } catch (e) {
        logCfg("clone failed", e, req);
        sendErr(res, e);
      }
    }
  );

  app.get(
    "/api/digital-estimate/configuration/envelopes/:id/events",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const events = await service.listEvents(organizationId, req.params.id);
        res.json({
          ok: true,
          events: events.map((ev) => ({
            id: ev.id,
            eventType: ev.event_type,
            actorType: ev.actor_type,
            createdAt: ev.created_at,
            metadata: ev.metadata
          }))
        });
      } catch (e) {
        logCfg("events failed", e, req);
        sendErr(res, e);
      }
    }
  );

  console.log(
    "[digital-estimate-configuration] mounted /api/digital-estimate/configuration/* (pilot gated)"
  );
  return { mounted: true };
}

export { createInMemoryDigitalEstimateRepository };
