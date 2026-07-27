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
import { buildSafeDigitalEstimateDiagnostics } from "../digitalEstimate/deploymentState.mjs";
import { readSafeSyntheticPilotConfig } from "../digitalEstimate/syntheticPilotGuard.mjs";
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
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioEstimateQueueService } from "./studioEstimateQueueService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import { createStudioReviewRequestService } from "./studioReviewRequestService.mjs";
import { searchStudioPartnerAccounts, loadStudioPartnerAccount } from "./studioPartnerAccountSearch.mjs";
import {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  actorRole,
  actorUserId,
  buildCustomerIdentitySnapshot,
  createProspectForEstimate,
  getAccountDirectoryServiceForEstimate,
  isAccountDirectoryUuid,
  loadAccountForEstimateSelection,
  lookupAccountsForEstimate,
  permissionsForRole,
  roleHasCapability
} from "./studioAccountDirectoryLookup.mjs";
import { AccountDirectoryError } from "../accountDirectory/accountDirectoryErrors.mjs";
import { resolveAccountDirectoryStore } from "../accountDirectory/accountDirectoryApi.js";
import { createDigitalEstimateConfigurationStack } from "../digitalEstimate/configuration/configurationFactory.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { isDigitalEstimateConfigurationEnabled } from "../digitalEstimate/configuration/configurationConfig.mjs";
import {
  createSupabaseAmendmentRepository
} from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { isDigitalEstimateReviewRequestsEnabled } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import { recoverStaffPublicationLinkMeta } from "../digitalEstimate/staffPublicationLinkRecovery.mjs";
import { createLiveDigitalEstimatesService } from "./liveDigitalEstimatesService.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { createQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepositoryFactory.mjs";
import {
  createStudioSharedInboxService,
  sharedInboxSafeError
} from "./studioSharedInboxService.mjs";
import { createStudioSecurePlanViewerService } from "./studioSecurePlanViewer.mjs";
import { bootstrapIntakeCasesAfterImport } from "../quoteIntake/intakeAutoBootstrapService.mjs";
import { openEstimateForIntakeCase } from "../takeoff/intakeOpenEstimateService.mjs";
import { resolveStudioLifecycleRepositoryForRoutes } from "./studioLifecycleRepositoryFactory.mjs";
import { createStudioSoldReviewService } from "./studioSoldReviewService.mjs";
import { createStudioAllEstimatesService } from "./studioAllEstimatesService.mjs";
import { canMarkStudioEstimateSold } from "./studioSoldReviewService.mjs";
import { createStudioSimplifiedWorkflowService } from "./studioSimplifiedWorkflow.mjs";

const jsonParser = express.json({ limit: "256kb" });

/** Publications + Live DE share the same staff-safe link recovery authority. */
async function staffLinkMetaForPublication(repository, organizationId, pub, env) {
  return recoverStaffPublicationLinkMeta(repository, organizationId, pub, env);
}

function logStudio(label, e, req) {
  const path = redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "");
  console.error(`[elite100-estimate-studio] ${label}`, e?.code || "error", path);
}

/** Structured audit for estimate create/update/calculate/approve (no secrets). */
function auditStudioEstimate(action, req, detail = {}) {
  console.info(
    "[elite100-estimate-studio][audit]",
    JSON.stringify({
      action,
      userId: req.user?.id ?? null,
      estimateId: detail.estimateId ?? null,
      intakeCaseId: detail.intakeCaseId ?? null,
      status: detail.status ?? null,
      revision: detail.revision ?? null,
      at: new Date().toISOString()
    })
  );
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

  /** Structured error JSON — includes activeEstimateId on superseded revision (AUDIT-002). */
  function studioMutationErrorBody(e, fallbackMessage) {
    const status = Number(e?.statusCode) || 500;
    /** @type {Record<string, unknown>} */
    const body = {
      ok: false,
      error: status < 500 ? e.message : fallbackMessage,
      code: e?.code || undefined
    };
    if (e?.code === "estimate_revision_superseded") {
      body.activeEstimateId = e.activeEstimateId || null;
      body.requestedEstimateId = e.requestedEstimateId || null;
      body.message = e.message;
    }
    if (e?.details != null) body.details = e.details;
    return { status, body };
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
        digitalEstimate: readSafeDigitalEstimateConfig(env),
        syntheticPilot: readSafeSyntheticPilotConfig(env)
      }
    });
  });

  /** DE.2G.0 — Safe deployment diagnostics (no secrets / no allowlist IDs). */
  app.get("/api/elite100-estimate-studio/diagnostics", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const pilot = isElite100EstimateStudioPilotUser(req.user, env);
    res.json(
      buildSafeDigitalEstimateDiagnostics(env, {
        pilotAuthorized: pilot,
        repositoryConfigured: Boolean(repository),
        // Process-local limiter only until a later authorized shared limiter ships.
        distributedLimiterReady: false,
        reusableLinkRpcVersion: repository?.reusableLinkRpcVersion ?? null,
        repositoryMode: repository?.mode ?? null
      })
    );
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
        publications: await Promise.all(
          publications.map(async (p) => {
            const link = await staffLinkMetaForPublication(repository, organizationId, p, env);
            return {
              id: p.id,
              publicationId: p.id,
              status: p.status,
              publishedAt: p.published_at,
              accessExpiresAt: p.access_expires_at,
              pricingValidThrough: p.pricing_valid_through,
              revokedAt: p.revoked_at ?? null,
              supersededAt: p.superseded_at ?? null,
              revisionNumber: p.revision_number,
              revisionLabel: p.revision_label,
              customerUrl: link.customerUrl,
              linkStatus: link.linkStatus,
              linkDiagnostics: link.linkDiagnostics || null,
              linkError: link.linkError || null
            };
          })
        )
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
        const link = await staffLinkMetaForPublication(repository, organizationId, pub, env);
        res.json({
          ok: true,
          publication: {
            id: pub.id,
            publicationId: pub.id,
            sourceQuoteId: pub.source_quote_id,
            quoteNumber: pub.quote_number,
            revisionNumber: pub.revision_number,
            revisionLabel: pub.revision_label,
            status: pub.status,
            publishedAt: pub.published_at,
            accessExpiresAt: pub.access_expires_at,
            pricingValidThrough: pub.pricing_valid_through,
            revokedAt: pub.revoked_at ?? null,
            supersededAt: pub.superseded_at ?? null,
            customerUrl: link.customerUrl,
            linkStatus: link.linkStatus,
            linkDiagnostics: link.linkDiagnostics || null,
            linkError: link.linkError || null
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
        const status = Number(e?.statusCode) || 500;
        const code = e?.code || "replace_failed";
        const rpcDiagnostics =
          e?.diagnostics &&
          e.diagnostics.rpc === "digital_estimate_replace_token_atomic" &&
          Array.isArray(e.diagnostics.parameterKeys)
            ? {
                message: e.diagnostics.message ?? null,
                details: e.diagnostics.details ?? null,
                hint: e.diagnostics.hint ?? null,
                rpc: e.diagnostics.rpc,
                parameterKeys: e.diagnostics.parameterKeys,
                buildVersion: e.diagnostics.buildVersion ?? "reusable-link-v2"
              }
            : null;
        // Temporary: surface complete safe PostgREST RPC failure fields (no param values).
        if (rpcDiagnostics) {
          return res.status(status).json({
            ok: false,
            error: "Unable to replace token",
            code,
            diagnostics: rpcDiagnostics
          });
        }
        const structured =
          Boolean(e?.code) &&
          (status < 500 ||
            [
              "link_wrap_key_missing",
              "link_wrap_failed",
              "link_unwrap_failed",
              "token_wrap_persist_failed",
              "token_wrapped_column_unavailable",
              "token_wrapped_required",
              "token_wrap_atomic_unavailable",
              "active_token_missing",
              "atomic_replace_unavailable"
            ].includes(String(e.code)));
        res.status(status).json({
          ok: false,
          error: structured && e?.message ? e.message : "Unable to replace token",
          code,
          diagnostics: e?.diagnostics || null,
          linkDiagnostics: e?.diagnostics || null,
          diagnostic: {
            status,
            code,
            message: structured && e?.message ? e.message : "Unable to replace token",
            linkDiagnostics: e?.diagnostics || null
          }
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

  // ── Studio estimate (scope → calculate → approve) + Digital Estimate publish ──
  const studioEstimateService =
    deps.studioEstimateService || createStudioEstimateService({ env, getSupabase });

  const studioEstimateQueueService =
    deps.studioEstimateQueueService ||
    createStudioEstimateQueueService({ env, getSupabase });

  let configurationStudioService = deps.configurationStudioService || null;
  let configurationRepository = deps.configurationRepository || null;
  if (!configurationStudioService && isDigitalEstimateConfigurationEnabled(env)) {
    try {
      const stack = createDigitalEstimateConfigurationStack({
        env,
        mode: deps.configurationStackMode || undefined,
        db: getSupabase(),
        requireRuntimeFlags: true
      });
      if (stack) {
        configurationRepository = configurationRepository || stack.configuration;
        configurationStudioService = createConfigurationStudioService({
          configurationRepository: stack.configuration,
          pricingPolicyRepository: stack.pricingPolicy,
          deRepository: repository,
          env
        });
      }
    } catch (e) {
      console.warn(
        "[elite100-estimate-studio] configuration stack unavailable for Studio publish:",
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
    deps.studioDigitalEstimateService ||
    createStudioEstimateDigitalEstimateService({
      env,
      studioEstimateService,
      digitalEstimateRepository: repository,
      configurationStudioService,
      amendmentRepository,
      getSupabase,
      loadTakeoffWorkspace: deps.loadTakeoffWorkspace
    });

  const studioReviewRequestService =
    deps.studioReviewRequestService ||
    (amendmentRepository
      ? createStudioReviewRequestService({
          env,
          amendmentRepository,
          deRepository: repository,
          configurationRepository,
          studioEstimateService,
          studioDigitalEstimateService
        })
      : null);

  const liveDigitalEstimatesService =
    deps.liveDigitalEstimatesService ||
    createLiveDigitalEstimatesService({
      digitalEstimateRepository: repository,
      studioEstimateRepository:
        deps.studioEstimateRepository || studioEstimateService.repository || null,
      amendmentRepository,
      accountDirectoryStore: deps.accountDirectoryStore || null,
      configurationRepository,
      env,
      queryCounters: deps.liveDeQueryCounters || undefined
    });

  const quoteIntakeRepository =
    deps.quoteIntakeRepository ||
    createQuoteIntakeRepository({ env, getSupabase }).repository;

  const studioManualEstimateService =
    deps.studioManualEstimateService ||
    createStudioManualEstimateService({
      quoteIntakeRepository,
      studioEstimateRepository:
        deps.studioEstimateRepository || studioEstimateService.repository,
      studioEstimateService
    });

  const studioSharedInboxService =
    deps.studioSharedInboxService ||
    createStudioSharedInboxService({
      env,
      quoteIntakeRepository,
      studioEstimateQueueService,
      graphClient: deps.graphClient || null,
      graphFetchImpl: deps.graphFetchImpl || undefined,
      getSupabase,
      ensureStudioEstimate:
        deps.ensureStudioEstimate ||
        (async ({ organizationId, intakeCaseId, takeoffJobId, actorUserId }) =>
          studioEstimateService.getOrCreateForCase({
            organizationId,
            intakeCaseId,
            takeoffJobId,
            actorUserId
          })),
      bootstrapIntakeCases:
        deps.bootstrapIntakeCases ||
        ((args) =>
          bootstrapIntakeCasesAfterImport({
            ...args,
            openEstimate: deps.openEstimate || openEstimateForIntakeCase
          }))
    });

  const studioSecurePlanViewerService =
    deps.studioSecurePlanViewerService ||
    createStudioSecurePlanViewerService({
      env,
      quoteIntakeRepository,
      getSupabase,
      graphClient: deps.graphClient || null,
      graphFetchImpl: deps.graphFetchImpl || undefined,
      downloadStoredFile: deps.downloadStoredFile || undefined
    });

  const studioSimplifiedWorkflowService =
    deps.studioSimplifiedWorkflowService ||
    createStudioSimplifiedWorkflowService({
      env,
      sharedInboxService: studioSharedInboxService,
      studioEstimateService,
      manualEstimateService: studioManualEstimateService,
      digitalEstimateService: studioDigitalEstimateService,
      approveTakeoffJob: deps.approveTakeoffJob || null
    });

  function sendPlanViewerError(res, e, fallback) {
    const status = Number(e?.statusCode) || 500;
    const code = String(e?.code || "attachment_content_unavailable");
    const messages = {
      attachment_not_found: "The attachment could not be found.",
      attachment_content_unavailable:
        "The attachment is known, but its contents are temporarily unavailable.",
      attachment_preview_not_supported: "This file type cannot be previewed securely.",
      attachment_too_large_for_preview: "This file is too large for the current secure viewer.",
      attachment_type_mismatch: "The file contents do not match the expected type.",
      mailbox_unavailable: "The mailbox could not be reached.",
      plan_view_not_authorized: "You do not have access to this plan."
    };
    res.status(status).json({
      ok: false,
      error: messages[code] || e?.message || fallback,
      code
    });
  }

  app.post(
    "/api/elite100-estimate-studio/manual-estimates",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const idempotencyKey =
          String(req.get("idempotency-key") || req.body?.idempotencyKey || "").trim() || null;
        const result = await studioManualEstimateService.createManualEstimate({
          organizationId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {},
          idempotencyKey
        });
        auditStudioEstimate("manual_estimate.create", req, {
          estimateId: result.estimateId,
          intakeCaseId: result.intakeCaseId,
          status: result.status,
          revision: result.revision
        });
        res.status(201).json(result);
      } catch (e) {
        logStudio("manual estimate create failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to create manual estimate",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/estimates/:estimateId/confirm-manual-scope",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioManualEstimateService.confirmManualScope({
          organizationId,
          estimateId: req.params.estimateId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioEstimate("manual_estimate.confirm_scope", req, {
          estimateId: req.params.estimateId,
          status: result?.estimate?.status
        });
        res.json(result);
      } catch (e) {
        logStudio("confirm manual scope failed", e, req);
        const { status, body } = studioMutationErrorBody(e, "Unable to confirm manual scope");
        res.status(status).json(body);
      }
    }
  );

  app.patch(
    "/api/elite100-estimate-studio/estimates/:estimateId/manual-scope",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const estimate = await studioManualEstimateService.saveManualScopeDraft({
          organizationId,
          estimateId: req.params.estimateId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        res.json({ ok: true, estimate });
      } catch (e) {
        logStudio("save manual scope failed", e, req);
        const { status, body } = studioMutationErrorBody(e, "Unable to save manual scope");
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/live-digital-estimates",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        // Prefer AD store from the same factory used by Studio AD routes.
        let adStore = deps.accountDirectoryStore || null;
        if (!adStore) {
          try {
            adStore = resolveAccountDirectoryStore({ env, getSupabase });
          } catch {
            adStore = null;
          }
        }
        const service =
          deps.liveDigitalEstimatesService ||
          createLiveDigitalEstimatesService({
            digitalEstimateRepository: repository,
            studioEstimateRepository:
              deps.studioEstimateRepository || studioEstimateService.repository || null,
            amendmentRepository,
            accountDirectoryStore: adStore,
            configurationRepository,
            env
          });
        const result = await service.listPortfolio({
          organizationId,
          q: String(req.query?.q ?? ""),
          status: req.query?.status ? String(req.query.status) : undefined,
          accountId: req.query?.accountId ? String(req.query.accountId) : undefined,
          estimatorUserId: req.query?.estimatorUserId
            ? String(req.query.estimatorUserId)
            : undefined,
          branch: req.query?.branch ? String(req.query.branch) : undefined,
          expiringWithinDays:
            req.query?.expiringWithinDays != null
              ? Number(req.query.expiringWithinDays)
              : undefined,
          history:
            String(req.query?.history || "").trim() === "1" ||
            String(req.query?.mode || "").toLowerCase() === "history",
          needsAttentionOnly: String(req.query?.needsAttentionOnly || "") === "1",
          accountLinked: req.query?.accountLinked
            ? String(req.query.accountLinked)
            : undefined,
          quickbooksLinked: req.query?.quickbooksLinked
            ? String(req.query.quickbooksLinked)
            : undefined,
          groupByAccount: String(req.query?.groupByAccount || "1") !== "0",
          sort: req.query?.sort ? String(req.query.sort) : "activity",
          limit: Number(req.query?.limit) || 25,
          offset: Number(req.query?.offset) || 0
        });
        res.json(result);
      } catch (e) {
        logStudio("live digital estimates list failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load Live Digital Estimates",
          code: e?.code
        });
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/live-digital-estimates/:publicationId",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        let adStore = deps.accountDirectoryStore || null;
        if (!adStore) {
          try {
            adStore = resolveAccountDirectoryStore({ env, getSupabase });
          } catch {
            adStore = null;
          }
        }
        const service =
          deps.liveDigitalEstimatesService ||
          createLiveDigitalEstimatesService({
            digitalEstimateRepository: repository,
            studioEstimateRepository:
              deps.studioEstimateRepository || studioEstimateService.repository || null,
            amendmentRepository,
            accountDirectoryStore: adStore,
            configurationRepository,
            env
          });
        const result = await service.getPortfolioDetail(
          organizationId,
          String(req.params.publicationId)
        );
        res.json(result);
      } catch (e) {
        logStudio("live digital estimates detail failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load publication",
          code: e?.code
        });
      }
    }
  );

  app.get("/api/elite100-estimate-studio/partner-accounts", ...staffStack, async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await searchStudioPartnerAccounts({
          db: getSupabase(),
          organizationId,
          q: String(req.query?.q ?? req.query?.search ?? ""),
          limit: Number(req.query?.limit) || 20
        });
        res.json({ ok: true, ...result });
      } catch (e) {
        logStudio("partner account search failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to search accounts",
          code: e?.code
        });
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/partner-accounts/:partnerAccountId",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const account = await loadStudioPartnerAccount({
          db: getSupabase(),
          organizationId,
          partnerAccountId: req.params.partnerAccountId
        });
        if (!account) {
          res.status(404).json({ ok: false, error: "Partner account not found", code: "account_not_found" });
          return;
        }
        res.json({ ok: true, account });
      } catch (e) {
        logStudio("partner account load failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load account",
          code: e?.code
        });
      }
    }
  );

  // Account Directory lookup for Elite 100 Studio staff (separate from Internal Estimate lookup)
  app.get("/api/elite100-estimate-studio/account-directory", ...staffStack, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const organizationId = await orgIdFor(req);
      const role = actorRole(req);
      const service = getAccountDirectoryServiceForEstimate({ getSupabase });
      const result = await lookupAccountsForEstimate({
        service,
        organizationId,
        role,
        search: String(req.query?.q ?? req.query?.search ?? ""),
        limit: req.query?.limit
      });
      res.json({
        ok: true,
        ...result,
        permissions: {
          canCreateProspect: roleHasCapability(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT),
          ...permissionsForRole(role)
        }
      });
    } catch (e) {
      if (e instanceof AccountDirectoryError) {
        return res.status(e.status || 400).json({ ok: false, error: e.message, code: e.code });
      }
      logStudio("account directory search failed", e, req);
      res.status(Number(e?.statusCode) || 500).json({
        ok: false,
        error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to search Account Directory",
        code: e?.code
      });
    }
  });

  app.post(
    "/api/elite100-estimate-studio/account-directory/prospects",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const service = getAccountDirectoryServiceForEstimate({ getSupabase });
        const detail = await createProspectForEstimate({
          service,
          organizationId,
          role: actorRole(req),
          actorUserId: actorUserId(req),
          requestId: String(req.headers?.["x-request-id"] || "") || null,
          payload: req.body && typeof req.body === "object" ? req.body : {}
        });
        res.status(201).json({ ok: true, ...detail });
      } catch (e) {
        if (e instanceof AccountDirectoryError) {
          return res.status(e.status || 400).json({ ok: false, error: e.message, code: e.code });
        }
        logStudio("account directory prospect create failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to create prospect",
          code: e?.code
        });
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/account-directory/:accountId",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const accountId = String(req.params.accountId || "").trim();
        if (!isAccountDirectoryUuid(accountId)) {
          return res.status(400).json({ ok: false, error: "Invalid account id", code: "invalid_account_id" });
        }
        const organizationId = await orgIdFor(req);
        const service = getAccountDirectoryServiceForEstimate({ getSupabase });
        const detail = await loadAccountForEstimateSelection({
          service,
          organizationId,
          role: actorRole(req),
          accountId
        });
        res.json({ ok: true, ...detail });
      } catch (e) {
        if (e instanceof AccountDirectoryError) {
          return res.status(e.status || 400).json({ ok: false, error: e.message, code: e.code });
        }
        logStudio("account directory load failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load account",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/account-directory/:accountId/snapshot",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const accountId = String(req.params.accountId || "").trim();
        if (!isAccountDirectoryUuid(accountId)) {
          return res.status(400).json({ ok: false, error: "Invalid account id", code: "invalid_account_id" });
        }
        const organizationId = await orgIdFor(req);
        const service = getAccountDirectoryServiceForEstimate({ getSupabase });
        const detail = await loadAccountForEstimateSelection({
          service,
          organizationId,
          role: actorRole(req),
          accountId
        });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const contactId = String(body.contactId ?? body.contact_id ?? "").trim();
        const locationId = String(body.locationId ?? body.location_id ?? "").trim();
        const contact =
          (contactId && detail.contacts.find((c) => c.id === contactId)) || detail.primaryContact;
        const location =
          (locationId && detail.locations.find((l) => l.id === locationId)) || detail.primaryLocation;
        const draftSnapshot = buildCustomerIdentitySnapshot({
          account: detail.account,
          contact,
          location
        });
        res.json({
          ok: true,
          account: detail.account,
          contact: contact || null,
          location: location || null,
          draftSnapshot
        });
      } catch (e) {
        if (e instanceof AccountDirectoryError) {
          return res.status(e.status || 400).json({ ok: false, error: e.message, code: e.code });
        }
        logStudio("account directory snapshot failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to build snapshot",
          code: e?.code
        });
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/intake-cases/:caseId/estimate",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const takeoffJobId = String(req.query?.takeoffJobId ?? "").trim() || null;
        const estimate = await studioEstimateService.getOrCreateForCase({
          organizationId,
          intakeCaseId: req.params.caseId,
          takeoffJobId,
          actorUserId: req.user?.id ?? null
        });
        let partnerAccount = null;
        if (estimate?.scope?.partnerAccountId) {
          partnerAccount = await loadStudioPartnerAccount({
            db: getSupabase(),
            organizationId,
            partnerAccountId: estimate.scope.partnerAccountId
          });
        }
        // Bounded read-only publication summary for reopen — never mutates.
        let estimateWithPublication = estimate;
        if (
          estimate?.id &&
          studioDigitalEstimateService &&
          typeof studioDigitalEstimateService.getWorkspacePublicationSummary === "function"
        ) {
          try {
            const pub = await studioDigitalEstimateService.getWorkspacePublicationSummary(
              organizationId,
              estimate.id
            );
            if (pub?.estimate) estimateWithPublication = pub.estimate;
            else if (pub?.publicationSummary) {
              estimateWithPublication = {
                ...estimate,
                publication: pub.publicationSummary,
                workflow: undefined
              };
            }
          } catch {
            // Non-fatal: workspace still opens; DE panel can load publication later.
          }
        }
        auditStudioEstimate("estimate.get_or_create", req, {
          estimateId: estimateWithPublication?.id,
          intakeCaseId: req.params.caseId,
          status: estimateWithPublication?.status,
          revision: estimateWithPublication?.revision
        });
        res.json({ ok: true, estimate: estimateWithPublication, partnerAccount });
      } catch (e) {
        logStudio("get estimate failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load estimate",
          code: e?.code
        });
      }
    }
  );

  app.patch(
    "/api/elite100-estimate-studio/estimates/:estimateId",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const estimate = await studioEstimateService.updateScope({
          organizationId,
          estimateId: req.params.estimateId,
          body: req.body && typeof req.body === "object" ? req.body : {},
          actorUserId: req.user?.id ?? null
        });
        auditStudioEstimate("estimate.update_scope", req, {
          estimateId: estimate?.id,
          status: estimate?.status,
          revision: estimate?.revision
        });
        res.json({ ok: true, estimate });
      } catch (e) {
        logStudio("patch estimate failed", e, req);
        const { status, body } = studioMutationErrorBody(e, "Unable to update estimate");
        res.status(status).json(body);
      }
    }
  );

  app.patch(
    "/api/elite100-estimate-studio/estimates/:estimateId/project-details",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioEstimateService.updateProjectDetails({
          organizationId,
          estimateId: req.params.estimateId,
          body: req.body && typeof req.body === "object" ? req.body : {},
          actorUserId: req.user?.id ?? null
        });
        auditStudioEstimate("estimate.update_project_details", req, {
          estimateId: result?.estimate?.id,
          status: result?.estimate?.status,
          revision: result?.estimate?.revision,
          published: false,
          notified: false
        });
        res.json({
          ok: true,
          estimate: result.estimate,
          published: false,
          notified: false,
          calculationCleared: false,
          revised: false
        });
      } catch (e) {
        logStudio("patch project details failed", e, req);
        const { status, body } = studioMutationErrorBody(e, "Unable to update project details");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/estimates/:estimateId/refresh-from-takeoff",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const force = body.force === true || body.confirm === true;
        const result = await studioEstimateService.refreshScopeFromTakeoff({
          organizationId,
          estimateId: req.params.estimateId,
          actorUserId: req.user?.id ?? null,
          force
        });
        auditStudioEstimate("estimate.refresh_from_takeoff", req, {
          estimateId: req.params.estimateId,
          force,
          preview: result?.preview
        });
        res.json({ ok: true, ...result });
      } catch (e) {
        logStudio("refresh from takeoff failed", e, req);
        const { status, body } = studioMutationErrorBody(e, "Unable to refresh from Takeoff");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/estimates/:estimateId/calculate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const estimate = await studioEstimateService.calculate({
          organizationId,
          estimateId: req.params.estimateId,
          body: req.body && typeof req.body === "object" ? req.body : {},
          actorUserId: req.user?.id ?? null
        });
        auditStudioEstimate("estimate.calculate", req, {
          estimateId: estimate?.id,
          status: estimate?.status,
          revision: estimate?.revision
        });
        res.json({ ok: true, estimate });
      } catch (e) {
        logStudio("calculate estimate failed", e, req);
        const { status, body } = studioMutationErrorBody(e, "Unable to calculate estimate");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/estimates/:estimateId/approve",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const estimate = await studioEstimateService.approve({
          organizationId,
          estimateId: req.params.estimateId,
          body: req.body && typeof req.body === "object" ? req.body : {},
          actorUserId: req.user?.id ?? null
        });
        auditStudioEstimate("estimate.approve", req, {
          estimateId: estimate?.id,
          status: estimate?.status,
          revision: estimate?.revision
        });
        res.json({ ok: true, estimate });
      } catch (e) {
        logStudio("approve estimate failed", e, req);
        const { status, body } = studioMutationErrorBody(e, "Unable to approve estimate");
        res.status(status).json(body);
      }
    }
  );

  function configurationFromStudioQuery(query) {
    if (!query || typeof query !== "object") return null;
    const pricingValidThrough = String(query.pricingValidThrough ?? "").trim();
    const allowedRaw = String(query.allowedOptionKeys ?? "").trim();
    const allowedOptionKeys = allowedRaw
      ? allowedRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    const hasAny =
      pricingValidThrough ||
      (allowedOptionKeys && allowedOptionKeys.length) ||
      query.roomLocked != null ||
      String(query.estimatorNotes ?? "").trim();
    if (!hasAny) return null;
    const roomLocked =
      query.roomLocked === "0" || query.roomLocked === "false" ? false : true;
    return {
      ...(pricingValidThrough ? { pricingValidThrough } : {}),
      ...(allowedOptionKeys ? { allowedOptionKeys } : {}),
      ...(String(query.estimatorNotes ?? "").trim()
        ? { estimatorNotes: String(query.estimatorNotes).trim().slice(0, 2000) }
        : {}),
      roomLocks: [{ roomKey: "*", locked: roomLocked }]
    };
  }

  function studioPublishErrorPayload(e, fallbackMessage) {
    const status = Number(e?.statusCode) || 500;
    const code = e?.code || "publish_failed";
    const blockers = e?.blockingReasons || e?.blockers || undefined;
    const readinessBlockerCodes = Array.isArray(blockers)
      ? blockers.map((b) => b?.code).filter(Boolean)
      : undefined;
    // Surface known structured messages even for 503 persistence codes; generic only when unstructured.
    const structured =
      Boolean(e?.code) &&
      (status < 500 ||
        [
          "publication_storage_unavailable",
          "publication_source_missing",
          "publication_source_conflict",
          "public_dto_leak",
          "atomic_publish_unavailable",
          "estimate_repo_unavailable",
          "link_wrap_key_missing",
          "link_wrap_failed",
          "link_unwrap_failed",
          "token_wrap_persist_failed",
          "token_wrapped_column_unavailable",
          "token_wrapped_missing",
          "active_token_missing",
          "DE-PUBLISH-TIMEOUT",
          "DE-ENVELOPE-ACTIVATION-FAILED",
          "DE-TOKEN-ROTATION-FAILED",
          "DE-PUBLISH-CONFLICT",
          "DE-PUBLISH-FAILED"
        ].includes(String(e.code)));
    const message = structured && e?.message ? e.message : fallbackMessage;
    const linkDiagnostics = e?.diagnostics || null;
    return {
      status,
      body: {
        ok: false,
        error: message,
        code,
        correlationId: e?.correlationId || null,
        phases: e?.phases || null,
        field: e?.field || null,
        allowedRange: e?.allowedRange || null,
        blockers,
        blockingReasons: blockers,
        linkDiagnostics,
        diagnostic: {
          status,
          code,
          message,
          field: e?.field || null,
          readinessBlockerCodes: readinessBlockerCodes || [],
          linkDiagnostics,
          correlationId: e?.correlationId || null,
          phases: e?.phases || null
        }
      }
    };
  }

  // ── Studio estimate → Digital Estimate (readiness / publish / history / review) ──
  app.get(
    "/api/elite100-estimate-studio/estimates/:estimateId/digital-estimate",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const configuration = configurationFromStudioQuery(req.query);
        const result = await studioDigitalEstimateService.assessReadiness(
          organizationId,
          req.params.estimateId,
          configuration
        );
        // Serialize the full service result — never strip customerUrl/linkStatus.
        res.json(result);
      } catch (e) {
        logStudio("digital-estimate readiness failed", e, req);
        const { status, body } = studioPublishErrorPayload(
          e,
          "Unable to load Digital Estimate readiness"
        );
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/estimates/:estimateId/publications",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioDigitalEstimateService.listPublications(
          organizationId,
          req.params.estimateId
        );
        res.json(result);
      } catch (e) {
        logStudio("list studio publications failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to list publications",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/estimates/:estimateId/digital-estimate/publish",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
          return res.status(404).json({
            ok: false,
            error: "Not found",
            code: "digital_estimate_disabled"
          });
        }
        const organizationId = await orgIdFor(req);
        const result = await studioDigitalEstimateService.publish({
          organizationId,
          estimateId: req.params.estimateId,
          actorUserId: req.user?.id ?? null,
          body: req.body && typeof req.body === "object" ? req.body : {}
        });
        auditStudioEstimate("estimate.digital_estimate_publish", req, {
          estimateId: req.params.estimateId,
          status: result?.publication?.status,
          revision: result?.publication?.revisionNumber
        });
        res.json(result);
      } catch (e) {
        logStudio("studio digital-estimate publish failed", e, req);
        const { status, body } = studioPublishErrorPayload(
          e,
          "Unable to publish Digital Estimate"
        );
        res.status(status).json(body);
      }
    }
  );

  /**
   * One-step Publish — client flushes drafts; server auto confirm/calculate/approve then publish.
   * Estimator commitment action. No email / sold / QB / Moraware.
   */
  app.post(
    "/api/elite100-estimate-studio/estimates/:estimateId/simplified-publish",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
          return res.status(404).json({
            ok: false,
            error: "Not found",
            code: "digital_estimate_disabled"
          });
        }
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await studioSimplifiedWorkflowService.publishDigitalEstimate({
          organizationId,
          estimateId: req.params.estimateId,
          actorUserId: req.user?.id ?? null,
          body
        });
        auditStudioEstimate("estimate.simplified_publish", req, {
          estimateId: req.params.estimateId,
          status: result?.publication?.publication?.status || result?.publication?.status,
          steps: result?.preparedSteps
        });
        res.json(result);
      } catch (e) {
        logStudio("studio simplified-publish failed", e, req);
        if (e?.code === "scope_needs_attention" || Array.isArray(e?.issues)) {
          return res.status(422).json({
            ok: false,
            error: e.message || "Scope needs attention",
            code: e.code || "scope_needs_attention",
            issues: e.issues || []
          });
        }
        const { status, body } = studioPublishErrorPayload(
          e,
          "Unable to publish Digital Estimate"
        );
        res.status(status).json(body);
      }
    }
  );

  // Existing revoke / replace-token / link-copied routes already cover Studio-backed pubs by id.

  function reviewServiceOr503(res) {
    if (!studioReviewRequestService) {
      res.status(503).json({
        ok: false,
        error: "Review request service unavailable",
        code: "review_service_unavailable"
      });
      return null;
    }
    return studioReviewRequestService;
  }

  app.get(
    "/api/elite100-estimate-studio/queue",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioEstimateQueueService.listQueue({
          organizationId,
          query: req.query || {}
        });
        res.json(result);
      } catch (e) {
        logStudio("queue list failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load estimate queue",
          code: e?.code
        });
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/queue/:caseId/preview",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioEstimateQueueService.getPreview({
          organizationId,
          caseId: req.params.caseId
        });
        res.json(result);
      } catch (e) {
        logStudio("queue preview failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load queue preview",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/queue/:caseId/opened",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioEstimateQueueService.recordOpened({
          organizationId,
          caseId: req.params.caseId,
          actorUserId: req.user?.id ?? null
        });
        auditStudioEstimate("queue.opened", req, { caseId: req.params.caseId });
        res.json(result);
      } catch (e) {
        logStudio("queue opened failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to record open",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/queue/:caseId/assign",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const result = await studioEstimateQueueService.assignEstimator({
          organizationId,
          caseId: req.params.caseId,
          assignedEstimatorUserId: body.assignedEstimatorUserId ?? null,
          actorUserId: req.user?.id ?? null
        });
        auditStudioEstimate("queue.assign", req, {
          caseId: req.params.caseId,
          assignedEstimatorUserId: result.assignedEstimatorUserId
        });
        res.json(result);
      } catch (e) {
        logStudio("queue assign failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to assign estimator",
          code: e?.code
        });
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/shared-inbox",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioSharedInboxService.listInbox({
          organizationId,
          actorUserId: req.user?.id ?? null,
          query: req.query || {}
        });
        res.json(result);
      } catch (e) {
        logStudio("shared inbox list failed", e, req);
        const status = Number(e?.statusCode) || 503;
        const safe = sharedInboxSafeError(e?.code, "Shared Inbox could not be refreshed.");
        res.status(status).json(safe);
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/shared-inbox/:messageKey",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioSharedInboxService.getMessage({
          organizationId,
          messageKey: decodeURIComponent(String(req.params.messageKey || "")),
          actorUserId: req.user?.id ?? null
        });
        res.json(result);
      } catch (e) {
        logStudio("shared inbox detail failed", e, req);
        const status = Number(e?.statusCode) || 503;
        const safe = sharedInboxSafeError(e?.code, "Unable to load message details.");
        res.status(status).json(safe);
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/shared-inbox/:messageKey/import",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const idempotencyKey =
          String(req.get("idempotency-key") || body.idempotencyKey || "").trim() || null;
        const result = await studioSharedInboxService.importMessage({
          organizationId,
          messageKey: decodeURIComponent(String(req.params.messageKey || "")),
          actorUserId: req.user?.id ?? null,
          confirm: body.confirm === true || body.confirm === "true",
          idempotencyKey
        });
        auditStudioEstimate("shared_inbox.import", req, {
          intakeCaseId: result.intakeCaseId,
          estimateId: result.estimateId,
          status: result.alreadyImported ? "duplicate" : result.created ? "created" : "imported"
        });
        res.json(result);
      } catch (e) {
        logStudio("shared inbox import failed", e, req);
        const status = Number(e?.statusCode) || 500;
        const safe = sharedInboxSafeError(e?.code, "The request could not be imported.");
        res.status(status).json(safe);
      }
    }
  );

  /**
   * Simplified Start Estimate — one idempotent action (import + ensure estimate).
   * Compatibility: /import remains; estimators should use this route.
   */
  app.post(
    "/api/elite100-estimate-studio/shared-inbox/:messageKey/start-estimate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const idempotencyKey =
          String(req.get("idempotency-key") || body.idempotencyKey || "").trim() || null;
        const result = await studioSimplifiedWorkflowService.startEstimate({
          organizationId,
          actorUserId: req.user?.id ?? null,
          messageKey: decodeURIComponent(String(req.params.messageKey || "")),
          idempotencyKey,
          forceManual: body.forceManual === true
        });
        auditStudioEstimate("shared_inbox.start_estimate", req, {
          intakeCaseId: result.intakeCaseId,
          estimateId: result.estimateId,
          status: result.reused ? "reused" : "started"
        });
        res.json(result);
      } catch (e) {
        logStudio("shared inbox start-estimate failed", e, req);
        const status = Number(e?.statusCode) || 500;
        const safe = sharedInboxSafeError(e?.code, "Unable to start the estimate.");
        res.status(status).json(safe);
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/shared-inbox/:messageKey/mark-viewed",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioSimplifiedWorkflowService.markInboxViewed({
          organizationId,
          actorUserId: req.user?.id ?? null,
          messageKey: decodeURIComponent(String(req.params.messageKey || ""))
        });
        res.json(result);
      } catch (e) {
        logStudio("shared inbox mark-viewed failed", e, req);
        const status = Number(e?.statusCode) || 500;
        res.status(status).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to mark viewed",
          code: e?.code
        });
      }
    }
  );

  /** Secure plan viewer — bytes only; no Graph/storage URLs. Read-only. */
  app.get(
    "/api/elite100-estimate-studio/shared-inbox/:messageKey/attachments/:attachmentKey/content",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioSecurePlanViewerService.getSharedInboxAttachmentContent({
          organizationId,
          messageKey: decodeURIComponent(String(req.params.messageKey || "")),
          attachmentKey: decodeURIComponent(String(req.params.attachmentKey || ""))
        });
        for (const [k, v] of Object.entries(result.headers || {})) {
          res.set(k, v);
        }
        res.status(200).end(result.bytes);
      } catch (e) {
        logStudio("shared inbox plan content failed", e, req);
        sendPlanViewerError(res, e, "Unable to load plan.");
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/intake-cases/:caseId/source-plans",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioSecurePlanViewerService.listIntakeSourcePlans({
          organizationId,
          intakeCaseId: String(req.params.caseId || "")
        });
        res.json(result);
      } catch (e) {
        logStudio("source plans list failed", e, req);
        sendPlanViewerError(res, e, "Unable to load source plans.");
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/intake-cases/:caseId/attachments/:attachmentId/content",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      try {
        const organizationId = await orgIdFor(req);
        const result = await studioSecurePlanViewerService.getIntakeAttachmentContent({
          organizationId,
          intakeCaseId: String(req.params.caseId || ""),
          attachmentId: decodeURIComponent(String(req.params.attachmentId || ""))
        });
        for (const [k, v] of Object.entries(result.headers || {})) {
          res.set(k, v);
        }
        res.status(200).end(result.bytes);
      } catch (e) {
        logStudio("intake plan content failed", e, req);
        sendPlanViewerError(res, e, "Unable to load plan.");
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/review-requests",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const svc = reviewServiceOr503(res);
        if (!svc) return;
        const organizationId = await orgIdFor(req);
        const result = await svc.list(organizationId, req.query || {});
        res.json(result);
      } catch (e) {
        logStudio("list studio review requests failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to list review requests",
          code: e?.code
        });
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/review-requests/:requestId",
    ...staffStack,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const svc = reviewServiceOr503(res);
        if (!svc) return;
        const organizationId = await orgIdFor(req);
        const result = await svc.getDetail(organizationId, req.params.requestId);
        res.json(result);
      } catch (e) {
        logStudio("get studio review request failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to load review request",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/review-requests/:requestId/start",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const svc = reviewServiceOr503(res);
        if (!svc) return;
        const organizationId = await orgIdFor(req);
        const result = await svc.startReview(
          organizationId,
          req.params.requestId,
          req.user?.id ?? null
        );
        auditStudioEstimate("review.start", req, { status: result.status });
        res.json(result);
      } catch (e) {
        logStudio("start review failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to start review",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/review-requests/:requestId/resolve-no-change",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const svc = reviewServiceOr503(res);
        if (!svc) return;
        const organizationId = await orgIdFor(req);
        const result = await svc.resolveNoChange(
          organizationId,
          req.params.requestId,
          req.body && typeof req.body === "object" ? req.body : {},
          req.user?.id ?? null
        );
        auditStudioEstimate("review.resolve_no_change", req, { status: result.status });
        res.json(result);
      } catch (e) {
        logStudio("resolve-no-change failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to resolve request",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/review-requests/:requestId/reject",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const svc = reviewServiceOr503(res);
        if (!svc) return;
        const organizationId = await orgIdFor(req);
        const result = await svc.reject(
          organizationId,
          req.params.requestId,
          req.body && typeof req.body === "object" ? req.body : {},
          req.user?.id ?? null
        );
        auditStudioEstimate("review.reject", req, { status: result.status });
        res.json(result);
      } catch (e) {
        logStudio("reject review failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to reject request",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/review-requests/:requestId/revise-estimate",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const svc = reviewServiceOr503(res);
        if (!svc) return;
        const organizationId = await orgIdFor(req);
        const result = await svc.reviseEstimate(
          organizationId,
          req.params.requestId,
          req.body && typeof req.body === "object" ? req.body : {},
          req.user?.id ?? null
        );
        auditStudioEstimate("review.revise_estimate", req, {
          estimateId: result?.revisedEstimate?.id,
          revision: result?.revisedEstimate?.revision,
          status: result.status
        });
        res.json(result);
      } catch (e) {
        logStudio("revise estimate from review failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to revise estimate",
          code: e?.code
        });
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/review-requests/:requestId/republish",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const svc = reviewServiceOr503(res);
        if (!svc) return;
        const organizationId = await orgIdFor(req);
        const result = await svc.republish(
          organizationId,
          req.params.requestId,
          req.body && typeof req.body === "object" ? req.body : {},
          req.user?.id ?? null
        );
        auditStudioEstimate("review.republish", req, {
          estimateId: result?.revisedEstimateId,
          status: result.status
        });
        res.json(result);
      } catch (e) {
        logStudio("republish from review failed", e, req);
        res.status(Number(e?.statusCode) || 500).json({
          ok: false,
          error: e?.statusCode && e.statusCode < 500 ? e.message : "Unable to republish",
          code: e?.code
        });
      }
    }
  );

  // ── Lifecycle closeout: All Estimates / Sold Review / Mark Sold / Acceptance ──
  let lifecycleRepository = deps.lifecycleRepository || null;
  if (!lifecycleRepository) {
    try {
      lifecycleRepository = resolveStudioLifecycleRepositoryForRoutes({
        env,
        getSupabase,
        studioEstimateRepository: studioEstimateService.repository
      });
    } catch (e) {
      if (e?.code === "studio_lifecycle_persistence_unavailable") {
        console.error(
          "[elite100-estimate-studio] lifecycle persistence unavailable at mount",
          e.code
        );
        lifecycleRepository = {
          mode: "unavailable",
          async getAcceptanceByPublication() {
            throw e;
          },
          async getAcceptanceForEstimate() {
            throw e;
          },
          async getSoldReviewForEstimate() {
            throw e;
          },
          async upsertSoldReview() {
            throw e;
          },
          async getSoldSnapshotForEstimate() {
            throw e;
          },
          async createSoldSnapshot() {
            throw e;
          },
          async listLifecycleEvents() {
            throw e;
          },
          async createAcceptance() {
            throw e;
          }
        };
      } else {
        throw e;
      }
    }
  }
  const soldReviewService =
    deps.soldReviewService ||
    createStudioSoldReviewService({
      env,
      lifecycleRepository,
      studioEstimateRepository: studioEstimateService.repository
    });
  const allEstimatesService =
    deps.allEstimatesService ||
    createStudioAllEstimatesService({
      studioEstimateRepository: studioEstimateService.repository,
      lifecycleRepository
    });

  function lifecycleHttpError(e, fallbackMessage) {
    const status = Number(e?.statusCode) || 500;
    return {
      status,
      body: {
        ok: false,
        error:
          e?.code === "studio_lifecycle_persistence_unavailable"
            ? "Studio lifecycle persistence unavailable. Apply eliteos_studio_estimate_lifecycle_closeout_v1.sql."
            : status < 500
              ? e.message
              : fallbackMessage,
        code: e?.code || undefined
      }
    };
  }

  app.get("/api/elite100-estimate-studio/all-estimates", ...staffStack, async (req, res) => {
    try {
      const organizationId = await orgIdFor(req);
      const result = await allEstimatesService.listAllEstimates(organizationId, req.query || {});
      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (e) {
      logStudio("all estimates list failed", e, req);
      const { status, body } = lifecycleHttpError(e, "Unable to list estimates");
      res.status(status).json(body);
    }
  });

  app.get(
    "/api/elite100-estimate-studio/all-estimates/:estimateId/history",
    ...staffStack,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await allEstimatesService.getEstimateHistory(
          organizationId,
          req.params.estimateId
        );
        res.set("Cache-Control", "no-store");
        res.json(result);
      } catch (e) {
        logStudio("all estimates history failed", e, req);
        const { status, body } = lifecycleHttpError(e, "Unable to load history");
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/estimates/:estimateId/acceptance",
    ...staffStack,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const acceptance = await lifecycleRepository.getAcceptanceForEstimate(
          organizationId,
          req.params.estimateId
        );
        res.set("Cache-Control", "no-store");
        res.json({
          ok: true,
          acceptance: acceptance
            ? {
                id: acceptance.id,
                acceptedAt: acceptance.accepted_at,
                estimateRevision: acceptance.estimate_revision,
                publicationId: acceptance.publication_id,
                customerDisplayTotal: acceptance.customer_display_total,
                termsVersion: acceptance.terms_version,
                customerSafeSnapshot: acceptance.customer_safe_snapshot_json,
                configuration: acceptance.customer_configuration_json
              }
            : null
        });
      } catch (e) {
        logStudio("get acceptance failed", e, req);
        const { status, body } = lifecycleHttpError(e, "Unable to load acceptance");
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/estimates/:estimateId/sold-review",
    ...staffStack,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await soldReviewService.getSoldReviewWorkspace(
          organizationId,
          req.params.estimateId
        );
        res.set("Cache-Control", "no-store");
        res.json({
          ...result,
          canMarkSold: canMarkStudioEstimateSold(req.user, env)
        });
      } catch (e) {
        logStudio("sold review get failed", e, req);
        const { status, body } = lifecycleHttpError(e, "Unable to load sold review");
        res.status(status).json(body);
      }
    }
  );

  app.put(
    "/api/elite100-estimate-studio/estimates/:estimateId/sold-review",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await soldReviewService.upsertSoldReviewChecklist({
          organizationId,
          estimateId: req.params.estimateId,
          checklist: req.body?.checklist || {},
          notes: req.body?.notes ?? null,
          updatedByUserId: req.user?.id || null
        });
        auditStudioEstimate("sold_review_updated", req, {
          estimateId: req.params.estimateId
        });
        res.json(result);
      } catch (e) {
        logStudio("sold review upsert failed", e, req);
        const { status, body } = lifecycleHttpError(e, "Unable to save sold review");
        res.status(status).json(body);
      }
    }
  );

  app.post(
    "/api/elite100-estimate-studio/estimates/:estimateId/mark-sold",
    ...staffStack,
    jsonParser,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const result = await soldReviewService.markSold({
          organizationId,
          estimateId: req.params.estimateId,
          actorUser: req.user,
          acceptanceId: req.body?.acceptanceId || null
        });
        auditStudioEstimate("marked_sold", req, {
          estimateId: req.params.estimateId
        });
        res.json(result);
      } catch (e) {
        logStudio("mark sold failed", e, req);
        const { status, body } = lifecycleHttpError(e, "Unable to mark sold");
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/estimates/:estimateId/sold-snapshot",
    ...staffStack,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const sold = await lifecycleRepository.getSoldSnapshotForEstimate(
          organizationId,
          req.params.estimateId
        );
        res.set("Cache-Control", "no-store");
        res.json({ ok: true, soldSnapshot: sold });
      } catch (e) {
        logStudio("sold snapshot get failed", e, req);
        const { status, body } = lifecycleHttpError(e, "Unable to load sold snapshot");
        res.status(status).json(body);
      }
    }
  );

  app.get(
    "/api/elite100-estimate-studio/estimates/:estimateId/lifecycle-events",
    ...staffStack,
    async (req, res) => {
      try {
        const organizationId = await orgIdFor(req);
        const events = await lifecycleRepository.listLifecycleEvents(organizationId, {
          estimateId: req.params.estimateId
        });
        res.set("Cache-Control", "no-store");
        res.json({ ok: true, events });
      } catch (e) {
        logStudio("lifecycle events failed", e, req);
        const { status, body } = lifecycleHttpError(e, "Unable to load events");
        res.status(status).json(body);
      }
    }
  );

  console.log(
    "[elite100-estimate-studio] mounted /api/elite100-estimate-studio/* (pilot + head gated)",
    {
      reusableLinkRpcVersion: repository?.reusableLinkRpcVersion ?? null,
      repositoryMode: repository?.mode ?? null
    }
  );
  return { mounted: true };
}
