/**
 * Digital Estimate HTTP routes — Phase DE.1.
 * Internal: /api/digital-estimate/*
 * Public:   /api/public-digital-estimate/v1/:token
 */

import express from "express";

import { requireHeadAccess } from "../auth/headAccessMiddleware.js";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { assertInternalQuoteOperator } from "../quotes/partnerContext.js";
import { requireElite100EstimateStudioPilot } from "../elite100EstimateStudio/elite100EstimateStudioAccess.mjs";
import {
  ELITE100_ESTIMATE_STUDIO_HEAD_SLUG,
  isElite100EstimateStudioEnabled
} from "../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";
import { resolvePublicDigitalEstimate } from "./digitalEstimateAccessService.mjs";
import {
  isDigitalEstimateApiEnabled,
  readDigitalEstimatePublicRateLimitPerMinute,
  readSafeDigitalEstimateConfig
} from "./digitalEstimateConfig.mjs";
import {
  checkDigitalEstimatePublicRateLimit,
  getDigitalEstimateClientIp
} from "./digitalEstimateRateLimit.mjs";
import {
  createInMemoryDigitalEstimateRepository,
  createSupabaseDigitalEstimateRepository
} from "./digitalEstimateRepository.mjs";
import {
  publishDigitalEstimate,
  recordDigitalEstimateLinkCopied,
  replaceDigitalEstimateToken,
  revokeDigitalEstimatePublication
} from "./digitalEstimatePublishService.mjs";
import { redactDigitalEstimateTokenPath } from "./digitalEstimateToken.mjs";

const jsonParser = express.json({ limit: "256kb" });

const PUBLIC_UNAVAILABLE = Object.freeze({ ok: false, error: "Not found" });

function logDeError(label, e, req) {
  const path = redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "");
  console.error(`[digital-estimate] ${label}`, e?.code || "error", path);
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   env?: NodeJS.ProcessEnv,
 *   repository?: any
 * }} deps
 */
export function maybeAttachDigitalEstimateRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isDigitalEstimateApiEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }
  return attachDigitalEstimateRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachDigitalEstimateRoutes(app, deps) {
  const { requireAuth, getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (!isDigitalEstimateApiEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }

  const repository =
    deps.repository ||
    createSupabaseDigitalEstimateRepository({ db: getSupabase() });

  const rejectPartnerOnlyUser = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, getSupabase());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({
        ok: false,
        error: String(e?.message || e),
        code: e?.code || "forbidden"
      });
    }
  };

  // DE.1.1: staff publication controls require Studio feature + head + pilot (not IE/QL).
  const staffStack = [
    requireAuth(),
    rejectPartnerOnlyUser,
    (req, res, next) => {
      if (!isElite100EstimateStudioEnabled(env)) {
        return res.status(404).json({ ok: false, error: "Not found" });
      }
      return next();
    },
    requireHeadAccess(ELITE100_ESTIMATE_STUDIO_HEAD_SLUG, { getSupabase }),
    requireElite100EstimateStudioPilot({ env })
  ];

  async function orgIdFor(req) {
    const db = getSupabase();
    const ctx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
    return ctx.organizationId;
  }

  app.get("/api/digital-estimate/config", ...staffStack, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, config: readSafeDigitalEstimateConfig(env) });
  });

  app.post(
    "/api/digital-estimate/publications",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await publishDigitalEstimate({
          env,
          organizationId,
          actorUserId: req.user?.id ?? null,
          repository,
          body: req.body
        });
        res.status(200).json(result);
      } catch (e) {
        logDeError("publish failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to publish",
          code: e?.code || "publish_failed"
        });
      }
    }
  );

  app.get("/api/digital-estimate/publications", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const quoteId = String(req.query.quoteId || "").trim();
      if (!quoteId) {
        return res.status(400).json({ ok: false, error: "quoteId required", code: "quote_id_required" });
      }
      const rows = await repository.listPublicationsForQuote(organizationId, quoteId);
      res.json({
        ok: true,
        publications: rows.map((p) => ({
          id: p.id,
          sourceQuoteId: p.source_quote_id,
          quoteNumber: p.quote_number,
          revisionNumber: p.revision_number,
          revisionLabel: p.revision_label,
          status: p.status,
          publishedAt: p.published_at,
          accessExpiresAt: p.access_expires_at,
          pricingValidThrough: p.pricing_valid_through,
          revokedAt: p.revoked_at ?? null,
          supersededAt: p.superseded_at ?? null
        }))
      });
    } catch (e) {
      logDeError("list failed", e, req);
      res.status(500).json({ ok: false, error: "Unable to list publications" });
    }
  });

  app.get("/api/digital-estimate/publications/:id", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const pub = await repository.getPublication(organizationId, req.params.id);
      if (!pub) return res.status(404).json({ ok: false, error: "Not found" });
      const events = await repository.listEventsForPublication(organizationId, pub.id, 100);
      res.json({
        ok: true,
        publication: {
          id: pub.id,
          sourceQuoteId: pub.source_quote_id,
          quoteNumber: pub.quote_number,
          revisionNumber: pub.revision_number,
          revisionLabel: pub.revision_label,
          status: pub.status,
          publishedAt: pub.published_at,
          accessExpiresAt: pub.access_expires_at,
          pricingValidThrough: pub.pricing_valid_through,
          revokedAt: pub.revoked_at ?? null,
          supersededAt: pub.superseded_at ?? null
        },
        events: events.map((ev) => ({
          id: ev.id,
          eventType: ev.event_type,
          actorType: ev.actor_type,
          createdAt: ev.created_at,
          metadata: ev.metadata
        }))
      });
    } catch (e) {
      logDeError("get failed", e, req);
      res.status(500).json({ ok: false, error: "Unable to load publication" });
    }
  });

  app.post(
    "/api/digital-estimate/publications/:id/revoke",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await revokeDigitalEstimatePublication({
          env,
          organizationId,
          actorUserId: req.user?.id ?? null,
          repository,
          publicationId: req.params.id,
          body: req.body
        });
        res.json(result);
      } catch (e) {
        logDeError("revoke failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to revoke",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/digital-estimate/publications/:id/replace-token",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await replaceDigitalEstimateToken({
          env,
          organizationId,
          actorUserId: req.user?.id ?? null,
          repository,
          publicationId: req.params.id,
          body: req.body
        });
        res.json(result);
      } catch (e) {
        logDeError("replace-token failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to replace token",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/digital-estimate/publications/:id/events/link-copied",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await recordDigitalEstimateLinkCopied({
          env,
          organizationId,
          actorUserId: req.user?.id ?? null,
          repository,
          publicationId: req.params.id
        });
        res.json(result);
      } catch (e) {
        logDeError("link-copied failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to record event",
          code: e?.code
        });
      }
    }
  );

  // ── Public (unauthenticated) ─────────────────────────────────────────────
  async function publicGet(req, res) {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'self'; font-src 'none'"
    );
    try {
      const ip = getDigitalEstimateClientIp(req);
      const rl = checkDigitalEstimatePublicRateLimit(
        ip,
        readDigitalEstimatePublicRateLimitPerMinute(env)
      );
      if (!rl.allowed) {
        res.set("Retry-After", String(rl.retryAfterSec));
        return res.status(429).json({ ok: false, error: "Too many requests" });
      }

      let rawToken = String(req.params.token || "");
      try {
        rawToken = decodeURIComponent(rawToken);
      } catch {
        /* keep Express-decoded param */
      }
      const dto = await resolvePublicDigitalEstimate({
        env,
        repository,
        rawToken,
        clientIp: ip,
        userAgent: req.headers?.["user-agent"]
      });
      res.status(200).json(dto);
    } catch (e) {
      // Safe unavailable: invalid → 404; revoked/replaced/access-expired → 410.
      const status = Number(e?.statusCode) === 410 ? 410 : 404;
      res.status(status).json(PUBLIC_UNAVAILABLE);
    }
  }

  app.get("/api/public-digital-estimate/v1/:token", publicGet);
  app.get("/api/public-digital-estimate/v1/:token/print", publicGet);

  console.log(
    "[digital-estimate] mounted /api/digital-estimate/* and /api/public-digital-estimate/v1/:token"
  );
  return { mounted: true, repositoryMode: repository.mode };
}

export { createInMemoryDigitalEstimateRepository };
