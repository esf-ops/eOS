/**
 * Elite 100 Estimate Studio Brain API — Phase DE.1.1.
 * Read saved Elite 100 quotes + publish via Digital Estimate services.
 * Does not calculateQuote, mutate quotes, or expose pricing evidence publicly.
 */

import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { assertInternalQuoteOperator } from "../quotes/partnerContext.js";
import { requireElite100EstimateStudioPilot } from "./elite100EstimateStudioAccess.mjs";
import {
  ELITE100_ESTIMATE_STUDIO_HEAD_SLUG,
  isElite100EstimateStudioEnabled,
  isElite100EstimateStudioPilotUser,
  readSafeElite100EstimateStudioConfig
} from "./elite100EstimateStudioConfig.mjs";
import {
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublishEnabled,
  readSafeDigitalEstimateConfig
} from "../digitalEstimate/digitalEstimateConfig.mjs";
import { assessElite100PublicationEligibility } from "../digitalEstimate/digitalEstimateEligibility.mjs";
import {
  publishDigitalEstimate,
  recordDigitalEstimateLinkCopied,
  replaceDigitalEstimateToken,
  revokeDigitalEstimatePublication
} from "../digitalEstimate/digitalEstimatePublishService.mjs";
import {
  createSupabaseDigitalEstimateRepository
} from "../digitalEstimate/digitalEstimateRepository.mjs";
import { buildPublicationFreezePayloads } from "../digitalEstimate/digitalEstimateSnapshot.mjs";
import {
  buildPublicDigitalEstimateDto,
  assertPublicDtoHasNoForbiddenContent
} from "../digitalEstimate/digitalEstimatePublicSerializer.mjs";
import { redactDigitalEstimateTokenPath } from "../digitalEstimate/digitalEstimateToken.mjs";
import { requireHeadAccess } from "../auth/headAccessMiddleware.js";
import express from "express";

const jsonParser = express.json({ limit: "256kb" });

function logStudio(label, e, req) {
  const path = redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "");
  console.error(`[elite100-estimate-studio] ${label}`, e?.code || "error", path);
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
export function maybeAttachElite100EstimateStudioRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isElite100EstimateStudioEnabled(env) && !isDigitalEstimateApiEnabled(env)) {
    // Studio shell routes still mount only when studio OR digital API is contemplated;
    // when both off, mount nothing (no side effects).
    return { mounted: false, reason: "flag_off" };
  }
  if (!isElite100EstimateStudioEnabled(env)) {
    return { mounted: false, reason: "studio_flag_off" };
  }
  return attachElite100EstimateStudioRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachElite100EstimateStudioRoutes(app, deps) {
  const { requireAuth, getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (!isElite100EstimateStudioEnabled(env)) {
    return { mounted: false, reason: "studio_flag_off" };
  }

  const repository =
    deps.repository || createSupabaseDigitalEstimateRepository({ db: getSupabase() });

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
    return ctx.organizationId;
  }

  app.get("/api/elite100-estimate-studio/config", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const pilot = isElite100EstimateStudioPilotUser(req.user, env);
    res.json({
      ok: true,
      config: {
        ...readSafeElite100EstimateStudioConfig(env),
        pilotAuthorized: pilot,
        digitalEstimate: readSafeDigitalEstimateConfig(env)
      }
    });
  });

  /** Search saved Elite 100 Internal Estimates (org-scoped read only). */
  app.get("/api/elite100-estimate-studio/quotes", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const q = String(req.query.q || req.query.search || "").trim().slice(0, 120);
      const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 40));
      const db = getSupabase();
      let query = db
        .from("quote_headers")
        .select(
          "id,quote_number,revision_number,revision_label,customer_name,project_name,project_address,quote_source,archived_at,is_current_revision,updated_at,created_at,calculation_snapshot"
        )
        .eq("organization_id", organizationId)
        .eq("quote_source", "internal_quote")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(Math.min(200, limit * 3));

      if (q) {
        query = query.or(
          `quote_number.ilike.%${q}%,customer_name.ilike.%${q}%,project_name.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = [];
      for (const row of data || []) {
        const elig = assessElite100PublicationEligibility(row);
        if (!elig.eligible) continue;
        rows.push({
          id: row.id,
          quoteNumber: row.quote_number,
          revisionNumber: row.revision_number,
          revisionLabel: row.revision_label,
          customerName: row.customer_name,
          projectName: row.project_name,
          projectAddress: row.project_address,
          isCurrentRevision: row.is_current_revision,
          updatedAt: row.updated_at,
          customerDisplayTotal: elig.details?.customerDisplayTotal ?? null,
          eligibility: { eligible: true, code: elig.code }
        });
        if (rows.length >= limit) break;
      }

      res.json({ ok: true, quotes: rows });
    } catch (e) {
      logStudio("list quotes failed", e, req);
      res.status(500).json({ ok: false, error: "Unable to list quotes" });
    }
  });

  /** Quote summary + customer-safe preview (no publish, no pricing evidence). */
  app.get("/api/elite100-estimate-studio/quotes/:quoteId", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const quoteId = String(req.params.quoteId || "").trim();
      const header = await repository.getQuoteHeader(organizationId, quoteId);
      if (!header) return res.status(404).json({ ok: false, error: "Not found" });

      const eligibility = assessElite100PublicationEligibility(header);
      const publications = await repository.listPublicationsForQuote(organizationId, header.id);

      let preview = null;
      if (eligibility.eligible) {
        const freeze = buildPublicationFreezePayloads({
          header,
          publishedAt: new Date().toISOString(),
          pricingValidThrough: new Date().toISOString().slice(0, 10)
        });
        preview = buildPublicDigitalEstimateDto(freeze.customerSnapshot, {
          accessExpiresAt: null
        });
        assertPublicDtoHasNoForbiddenContent(preview);
      }

      res.json({
        ok: true,
        quote: {
          id: header.id,
          quoteNumber: header.quote_number,
          revisionNumber: header.revision_number,
          revisionLabel: header.revision_label,
          customerName: header.customer_name,
          projectName: header.project_name,
          projectAddress: header.project_address,
          quoteSource: header.quote_source,
          archivedAt: header.archived_at,
          isCurrentRevision: header.is_current_revision,
          updatedAt: header.updated_at
        },
        eligibility,
        preview,
        publications: publications.map((p) => ({
          id: p.id,
          status: p.status,
          publishedAt: p.published_at,
          accessExpiresAt: p.access_expires_at,
          pricingValidThrough: p.pricing_valid_through,
          revokedAt: p.revoked_at ?? null,
          supersededAt: p.superseded_at ?? null,
          revisionNumber: p.revision_number,
          revisionLabel: p.revision_label
        }))
      });
    } catch (e) {
      logStudio("quote detail failed", e, req);
      res.status(500).json({ ok: false, error: "Unable to load quote" });
    }
  });

  app.get(
    "/api/elite100-estimate-studio/publications/:id",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const pub = await repository.getPublication(organizationId, req.params.id);
        if (!pub) return res.status(404).json({ ok: false, error: "Not found" });
        const events = await repository.listEventsForPublication(organizationId, pub.id, 100);
        const snap = await repository.getSnapshotByPublicationId(organizationId, pub.id);
        let preview = null;
        if (snap?.customer_snapshot_json) {
          preview = buildPublicDigitalEstimateDto(snap.customer_snapshot_json, {
            accessExpiresAt: pub.access_expires_at
          });
          assertPublicDtoHasNoForbiddenContent(preview);
        }
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
          preview,
          events: events.map((ev) => ({
            id: ev.id,
            eventType: ev.event_type,
            actorType: ev.actor_type,
            createdAt: ev.created_at,
            metadata: ev.metadata
          }))
        });
      } catch (e) {
        logStudio("publication detail failed", e, req);
        res.status(500).json({ ok: false, error: "Unable to load publication" });
      }
    }
  );

  // Publish / revoke / replace / link-copied — same Digital Estimate services.
  app.post(
    "/api/elite100-estimate-studio/publications",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
          return res.status(404).json({ ok: false, error: "Not found", code: "digital_estimate_disabled" });
        }
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
        logStudio("publish failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to publish",
          code: e?.code || "publish_failed"
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/publications/:id/revoke",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
          return res.status(404).json({ ok: false, error: "Not found" });
        }
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
        logStudio("revoke failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to revoke",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/publications/:id/replace-token",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
          return res.status(404).json({ ok: false, error: "Not found" });
        }
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
        logStudio("replace-token failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to replace token",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/publications/:id/events/link-copied",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        if (!isDigitalEstimateApiEnabled(env)) {
          return res.status(404).json({ ok: false, error: "Not found" });
        }
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
        logStudio("link-copied failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to record event",
          code: e?.code
        });
      }
    }
  );

  console.log(
    "[elite100-estimate-studio] mounted /api/elite100-estimate-studio/* (pilot + head gated)"
  );
  return { mounted: true };
}
