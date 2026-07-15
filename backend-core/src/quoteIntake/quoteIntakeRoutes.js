/**
 * Quote Intake routes — Phase 6P.1/6P.2 (flag-gated).
 *
 * Prefix: /api/quote-intake
 *
 * Auth: requireAuth + requireHeadAccess("ai_takeoff") (or injected headAccess)
 * Org: resolveOrganizationContext (auth-derived; never from body)
 * Persistence: injected repository OR factory (memory default / supabase when configured)
 *
 * No Graph, Gemini, Takeoff job creation, Storage, or IE import.
 */

import express from "express";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import {
  isQuoteIntakeApiEnabled,
  readQuoteIntakePilotEmails,
  readSafeQuoteIntakeConfig
} from "./quoteIntakeConfig.mjs";
import { createQuoteIntakeRepository } from "./quoteIntakeRepositoryFactory.mjs";
import { QUOTE_INTAKE_API_PREFIX, AUTOMATION_PATH } from "./quoteIntakeTypes.mjs";
import { createFakeProductionTakeoffAdapter } from "./productionTakeoffAdapter.mjs";
import {
  importQuoteIntakeMailboxMessages,
  previewQuoteIntakeMailbox
} from "./quoteIntakeMailboxService.mjs";

export { QUOTE_INTAKE_API_PREFIX };
export { isQuoteIntakeApiEnabled, readSafeQuoteIntakeConfig } from "./quoteIntakeConfig.mjs";

const defaultJsonParser = express.json({ limit: "256kb" });

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

/**
 * Mount Quote Intake routes when enabled.
 *
 * When QUOTE_INTAKE_API_ENABLED is not "1", this function registers nothing.
 * Handlers re-check the flag and 404 with zero repository side effects if disabled later.
 * Misconfigured supabase persistence fails closed (throw or 503) — never silent memory fallback.
 *
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachQuoteIntakeRoutes(app, deps) {
  const {
    requireAuth,
    requireHeadAccess,
    getSupabase,
    resolveOrganizationId,
    takeoffAdapter = createFakeProductionTakeoffAdapter(),
    jsonParser = defaultJsonParser,
    env = process.env,
    graphClient = null,
    graphFetchImpl = null
  } = deps;

  if (!isQuoteIntakeApiEnabled(env)) {
    return { mounted: false, reason: "QUOTE_INTAKE_API_ENABLED is not 1" };
  }

  if (typeof requireAuth !== "function") {
    throw new Error("attachQuoteIntakeRoutes: requireAuth required");
  }

  let repository = deps.repository;
  let repositoryMode = "injected";
  if (!repository) {
    const created = createQuoteIntakeRepository({ env, getSupabase });
    repository = created.repository;
    repositoryMode = created.mode;
  } else if (typeof repository.createCase !== "function") {
    throw new Error("attachQuoteIntakeRoutes: repository missing createCase");
  }

  const guardHead =
    typeof deps.headAccess === "function"
      ? deps.headAccess
      : typeof requireHeadAccess === "function"
        ? requireHeadAccess("ai_takeoff", { getSupabase })
        : (_req, _res, next) => next();

  function requireEnabled(_req, res, next) {
    if (!isQuoteIntakeApiEnabled(env)) {
      jsonNoStore(res);
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    next();
  }

  function requirePilot(req, res, next) {
    const allow = readQuoteIntakePilotEmails(env);
    if (allow.length === 0) {
      next();
      return;
    }
    const email = String(req.user?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !allow.includes(email)) {
      jsonNoStore(res);
      res.status(403).json({ ok: false, error: "Quote Intake pilot access required" });
      return;
    }
    next();
  }

  async function orgIdFor(req) {
    if (typeof resolveOrganizationId === "function") {
      return resolveOrganizationId(req);
    }
    if (typeof getSupabase !== "function") {
      const err = new Error("Organization resolver unavailable");
      err.statusCode = 503;
      throw err;
    }
    const ctx = await resolveOrganizationContext({
      req,
      supabase: getSupabase(),
      mode: "authenticated"
    });
    if (!ctx.organizationId) {
      const err = new Error("Organization context required");
      err.statusCode = 503;
      throw err;
    }
    return ctx.organizationId;
  }

  const stack = [requireAuth(), requireEnabled, guardHead, requirePilot];

  app.get(`${QUOTE_INTAKE_API_PREFIX}/config`, ...stack, async (_req, res) => {
    jsonNoStore(res);
    res.status(200).json({ ok: true, config: readSafeQuoteIntakeConfig(env) });
  });

  app.get(`${QUOTE_INTAKE_API_PREFIX}/health`, ...stack, async (_req, res) => {
    jsonNoStore(res);
    res.status(200).json({
      ok: true,
      phase: "6P.4",
      repositoryMode,
      takeoffAdapter: takeoffAdapter?.name ?? "none"
    });
  });

  app.post(`${QUOTE_INTAKE_API_PREFIX}/cases`, ...stack, jsonParser, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      // Never trust caller-supplied org/actor fields from the payload.
      const created = await repository.createCase({
        organizationId,
        createdByUserId: req.user?.id ?? null,
        status: body.status,
        sourceMessage: body.sourceMessage,
        attachments: body.attachments
        // intentionally omit body.organizationId / body.createdByUserId / body.userId
      });
      res.status(201).json({ ok: true, case: created });
    } catch (e) {
      const status = Number(e?.statusCode) || 500;
      if (status >= 500) {
        console.error("[quote-intake] createCase failed", e?.code || "error");
        res.status(status === 503 ? 503 : 500).json({
          ok: false,
          error: "Unable to create intake case",
          code: e?.code
        });
        return;
      }
      res.status(status).json({
        ok: false,
        error: e?.message || "Bad request",
        code: e?.code,
        existingCaseId: e?.existingCaseId
      });
    }
  });

  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const cases = await repository.listCases(organizationId, {
        limit: req.query?.limit
      });
      res.status(200).json({ ok: true, cases });
    } catch (e) {
      console.error("[quote-intake] listCases failed", e?.code || "error");
      res.status(Number(e?.statusCode) === 503 ? 503 : 500).json({
        ok: false,
        error: "Unable to list intake cases",
        code: e?.code
      });
    }
  });

  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases/:id`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const row = await repository.getCase(organizationId, req.params.id);
      if (!row) {
        res.status(404).json({ ok: false, error: "Case not found" });
        return;
      }
      res.status(200).json({ ok: true, case: row });
    } catch (e) {
      console.error("[quote-intake] getCase failed", e?.code || "error");
      res.status(Number(e?.statusCode) === 503 ? 503 : 500).json({
        ok: false,
        error: "Unable to load intake case",
        code: e?.code
      });
    }
  });

  app.post(
    `${QUOTE_INTAKE_API_PREFIX}/cases/:id/automation-decisions`,
    ...stack,
    jsonParser,
    async (req, res) => {
      jsonNoStore(res);
      try {
        const organizationId = await orgIdFor(req);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const path = String(body.path ?? "").trim() || AUTOMATION_PATH.MANUAL_REVIEW;
        const decision = await repository.recordAutomationDecision({
          organizationId,
          intakeCaseId: req.params.id,
          path,
          reasonCodes: body.reasonCodes,
          wouldStartTakeoff: Boolean(body.wouldStartTakeoff),
          actorType: "user",
          actorUserId: req.user?.id ?? null,
          note: body.note
        });
        res.status(201).json({
          ok: true,
          decision,
          takeoffInvocation: {
            attempted: false,
            enabled: false,
            note: "ProductionTakeoffAdapter invocation deferred to 6P.6"
          }
        });
      } catch (e) {
        const status = Number(e?.statusCode) || 500;
        if (status >= 500) {
          console.error("[quote-intake] automationDecision failed", e?.code || "error");
          res.status(status === 503 ? 503 : 500).json({
            ok: false,
            error: "Unable to record automation decision",
            code: e?.code
          });
          return;
        }
        res.status(status).json({ ok: false, error: e?.message || "Bad request", code: e?.code });
      }
    }
  );

  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases/:id/audit-events`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const events = await repository.listAuditEvents(organizationId, req.params.id, {
        limit: req.query?.limit
      });
      if (events === null) {
        res.status(404).json({ ok: false, error: "Case not found" });
        return;
      }
      res.status(200).json({ ok: true, events });
    } catch (e) {
      console.error("[quote-intake] listAudit failed", e?.code || "error");
      res.status(Number(e?.statusCode) === 503 ? 503 : 500).json({
        ok: false,
        error: "Unable to list audit events",
        code: e?.code
      });
    }
  });

  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases/:id/takeoff-links`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      if (!(await repository.getCase(organizationId, req.params.id))) {
        res.status(404).json({ ok: false, error: "Case not found" });
        return;
      }
      const links = await repository.listTakeoffLinks(organizationId, req.params.id);
      res.status(200).json({ ok: true, links });
    } catch (e) {
      console.error("[quote-intake] listTakeoffLinks failed", e?.code || "error");
      res.status(Number(e?.statusCode) === 503 ? 503 : 500).json({
        ok: false,
        error: "Unable to list takeoff links",
        code: e?.code
      });
    }
  });

  function graphErrorStatus(e) {
    const code = String(e?.code ?? "");
    if (code === "graph_disabled") return 404;
    if (code === "graph_throttled") return 429;
    if (code === "graph_timeout") return 504;
    if (code === "graph_forbidden") return Number(e?.statusCode) === 400 ? 400 : 403;
    if (code === "message_not_found") return 404;
    if (code === "attachment_too_large") return 413;
    if (Number(e?.statusCode) >= 400 && Number(e?.statusCode) < 600) return Number(e.statusCode);
    return 503;
  }

  function safeGraphError(e) {
    const code = String(e?.code ?? "graph_unavailable");
    const messages = {
      graph_disabled: "Mailbox sync is not enabled",
      graph_not_configured: "Mailbox sync is not configured",
      graph_token_failed: "Mailbox authentication failed",
      graph_forbidden: "Mailbox access denied",
      graph_throttled: "Mailbox provider is busy — try again later",
      graph_timeout: "Mailbox request timed out",
      graph_unavailable: "Mailbox temporarily unavailable",
      graph_invalid_response: "Mailbox returned an invalid response",
      message_not_found: "Message not found",
      attachment_unsupported: "Attachment type is not supported",
      attachment_too_large: "Attachment exceeds size limits",
      attachment_hash_failed: "Attachment validation failed",
      duplicate: "Message already imported",
      import_failed: "Unable to import mailbox messages"
    };
    return { ok: false, error: messages[code] || "Mailbox request failed", code };
  }

  app.post(
    `${QUOTE_INTAKE_API_PREFIX}/mailbox/preview`,
    ...stack,
    jsonParser,
    async (req, res) => {
      jsonNoStore(res);
      try {
        const organizationId = await orgIdFor(req);
        const preview = await previewQuoteIntakeMailbox({
          env,
          organizationId,
          actorUserId: req.user?.id ?? null,
          repository,
          graphClient,
          fetchImpl: graphFetchImpl,
          body: req.body
        });
        res.status(200).json({ ok: true, ...preview });
      } catch (e) {
        console.error("[quote-intake] mailbox preview failed", e?.code || "error");
        res.status(graphErrorStatus(e)).json(safeGraphError(e));
      }
    }
  );

  app.post(
    `${QUOTE_INTAKE_API_PREFIX}/mailbox/import`,
    ...stack,
    jsonParser,
    async (req, res) => {
      jsonNoStore(res);
      try {
        const organizationId = await orgIdFor(req);
        const imported = await importQuoteIntakeMailboxMessages({
          env,
          organizationId,
          actorUserId: req.user?.id ?? null,
          repository,
          graphClient,
          fetchImpl: graphFetchImpl,
          body: req.body
        });
        res.status(200).json({ ok: true, ...imported });
      } catch (e) {
        console.error("[quote-intake] mailbox import failed", e?.code || "error");
        res.status(graphErrorStatus(e)).json(safeGraphError(e));
      }
    }
  );

  return { mounted: true, prefix: QUOTE_INTAKE_API_PREFIX, repositoryMode };
}

/**
 * Conditionally mount from server.js — no-op when flag off.
 * When enabled + supabase misconfigured, fails closed (does not fall back to memory).
 */
export function maybeAttachQuoteIntakeRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isQuoteIntakeApiEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }
  try {
    return attachQuoteIntakeRoutes(app, deps);
  } catch (e) {
    if (e?.code === "quote_intake_persistence_misconfigured") {
      console.error("[quote-intake] persistence misconfigured — routes not mounted", e.code);
      return { mounted: false, reason: "persistence_misconfigured", code: e.code };
    }
    throw e;
  }
}
