/**
 * Quote Intake routes — Phase 6P.1 (in-memory, flag-gated).
 *
 * Prefix: /api/quote-intake
 *
 * Auth: requireAuth + requireHeadAccess("ai_takeoff") (or injected headAccess)
 * Org: resolveOrganizationContext (auth-derived; never from body)
 * Storage: injected InMemoryQuoteIntakeRepository only
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
import {
  InMemoryQuoteIntakeRepository,
  sharedInMemoryQuoteIntakeRepository
} from "./quoteIntakeRepository.mjs";
import { QUOTE_INTAKE_API_PREFIX, AUTOMATION_PATH } from "./quoteIntakeTypes.mjs";
import { createFakeProductionTakeoffAdapter } from "./productionTakeoffAdapter.mjs";

export { QUOTE_INTAKE_API_PREFIX };
export { isQuoteIntakeApiEnabled, readSafeQuoteIntakeConfig } from "./quoteIntakeConfig.mjs";

const defaultJsonParser = express.json({ limit: "256kb" });

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

/**
 * Mount Quote Intake routes when enabled.
 *
 * When QUOTE_INTAKE_API_ENABLED is not "1", this function registers nothing
 * (caller should also skip the call). Handlers re-check the flag and 404 with
 * zero repository side effects if somehow reached while disabled.
 *
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireHeadAccess?: Function,
 *   headAccess?: Function,
 *   getSupabase?: () => unknown,
 *   repository?: InMemoryQuoteIntakeRepository,
 *   resolveOrganizationId?: (req: import("express").Request) => Promise<string>,
 *   takeoffAdapter?: ReturnType<typeof createFakeProductionTakeoffAdapter>,
 *   jsonParser?: import("express").RequestHandler,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function attachQuoteIntakeRoutes(app, deps) {
  const {
    requireAuth,
    requireHeadAccess,
    getSupabase,
    repository = sharedInMemoryQuoteIntakeRepository,
    resolveOrganizationId,
    takeoffAdapter = createFakeProductionTakeoffAdapter(),
    jsonParser = defaultJsonParser,
    env = process.env
  } = deps;

  if (!isQuoteIntakeApiEnabled(env)) {
    return { mounted: false, reason: "QUOTE_INTAKE_API_ENABLED is not 1" };
  }

  if (typeof requireAuth !== "function") {
    throw new Error("attachQuoteIntakeRoutes: requireAuth required");
  }
  if (!(repository instanceof InMemoryQuoteIntakeRepository) && repository?.constructor?.name !== "InMemoryQuoteIntakeRepository") {
    // Allow duck-typed test doubles that share the same methods.
    if (typeof repository.createCase !== "function") {
      throw new Error("attachQuoteIntakeRoutes: in-memory repository required");
    }
  }

  const guardHead =
    typeof deps.headAccess === "function"
      ? deps.headAccess
      : typeof requireHeadAccess === "function"
        ? requireHeadAccess("ai_takeoff", { getSupabase })
        : (_req, _res, next) => next();

  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   * @param {import("express").NextFunction} next
   */
  function requireEnabled(_req, res, next) {
    if (!isQuoteIntakeApiEnabled(env)) {
      jsonNoStore(res);
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    next();
  }

  /**
   * Optional pilot email allowlist (when QUOTE_INTAKE_PILOT_EMAILS is set).
   */
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

  // ── GET /api/quote-intake/config ──────────────────────────────────────────
  app.get(`${QUOTE_INTAKE_API_PREFIX}/config`, ...stack, async (_req, res) => {
    jsonNoStore(res);
    res.status(200).json({ ok: true, config: readSafeQuoteIntakeConfig(env) });
  });

  // ── GET /api/quote-intake/health ──────────────────────────────────────────
  app.get(`${QUOTE_INTAKE_API_PREFIX}/health`, ...stack, async (_req, res) => {
    jsonNoStore(res);
    res.status(200).json({
      ok: true,
      phase: "6P.1",
      repositoryMode: "memory",
      takeoffAdapter: takeoffAdapter?.name ?? "none"
    });
  });

  // ── POST /api/quote-intake/cases ──────────────────────────────────────────
  app.post(`${QUOTE_INTAKE_API_PREFIX}/cases`, ...stack, jsonParser, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const created = repository.createCase({
        organizationId,
        createdByUserId: req.user?.id ?? null,
        status: body.status,
        sourceMessage: body.sourceMessage,
        attachments: body.attachments
      });
      res.status(201).json({ ok: true, case: created });
    } catch (e) {
      const status = Number(e?.statusCode) || 500;
      if (status >= 500) {
        console.error("[quote-intake] createCase failed", e?.code || e?.message || "error");
        res.status(500).json({ ok: false, error: "Unable to create intake case" });
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

  // ── GET /api/quote-intake/cases ───────────────────────────────────────────
  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const cases = repository.listCases(organizationId, {
        limit: req.query?.limit
      });
      res.status(200).json({ ok: true, cases });
    } catch (e) {
      console.error("[quote-intake] listCases failed", e?.code || e?.message || "error");
      res.status(500).json({ ok: false, error: "Unable to list intake cases" });
    }
  });

  // ── GET /api/quote-intake/cases/:id ───────────────────────────────────────
  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases/:id`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const row = repository.getCase(organizationId, req.params.id);
      if (!row) {
        res.status(404).json({ ok: false, error: "Case not found" });
        return;
      }
      res.status(200).json({ ok: true, case: row });
    } catch (e) {
      console.error("[quote-intake] getCase failed", e?.code || e?.message || "error");
      res.status(500).json({ ok: false, error: "Unable to load intake case" });
    }
  });

  // ── POST /api/quote-intake/cases/:id/automation-decisions ────────────────
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
        const decision = repository.recordAutomationDecision({
          organizationId,
          intakeCaseId: req.params.id,
          path,
          reasonCodes: body.reasonCodes,
          // 6P.1: Path A may record wouldStartTakeoff=true but never invokes adapter.
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
          console.error("[quote-intake] automationDecision failed", e?.code || e?.message || "error");
          res.status(500).json({ ok: false, error: "Unable to record automation decision" });
          return;
        }
        res.status(status).json({ ok: false, error: e?.message || "Bad request", code: e?.code });
      }
    }
  );

  // ── GET /api/quote-intake/cases/:id/audit-events ─────────────────────────
  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases/:id/audit-events`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      const events = repository.listAuditEvents(organizationId, req.params.id, {
        limit: req.query?.limit
      });
      if (events === null) {
        res.status(404).json({ ok: false, error: "Case not found" });
        return;
      }
      res.status(200).json({ ok: true, events });
    } catch (e) {
      console.error("[quote-intake] listAudit failed", e?.code || e?.message || "error");
      res.status(500).json({ ok: false, error: "Unable to list audit events" });
    }
  });

  // ── GET /api/quote-intake/cases/:id/takeoff-links ─────────────────────────
  app.get(`${QUOTE_INTAKE_API_PREFIX}/cases/:id/takeoff-links`, ...stack, async (req, res) => {
    jsonNoStore(res);
    try {
      const organizationId = await orgIdFor(req);
      if (!repository.getCase(organizationId, req.params.id)) {
        res.status(404).json({ ok: false, error: "Case not found" });
        return;
      }
      const links = repository.listTakeoffLinks(organizationId, req.params.id);
      res.status(200).json({ ok: true, links });
    } catch (e) {
      console.error("[quote-intake] listTakeoffLinks failed", e?.code || e?.message || "error");
      res.status(500).json({ ok: false, error: "Unable to list takeoff links" });
    }
  });

  return { mounted: true, prefix: QUOTE_INTAKE_API_PREFIX };
}

/**
 * Conditionally mount from server.js — no-op when flag off (no side effects).
 * @param {import("express").Express} app
 * @param {Parameters<typeof attachQuoteIntakeRoutes>[1]} deps
 */
export function maybeAttachQuoteIntakeRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isQuoteIntakeApiEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }
  return attachQuoteIntakeRoutes(app, deps);
}
