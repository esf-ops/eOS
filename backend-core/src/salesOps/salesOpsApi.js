/**
 * Sales Ops Head API.
 * Auth: requireAuth + requireHeadAccess("sales_ops").
 * Rep identity is always req.user — never a browser-supplied user_id.
 */

import express from "express";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { logAction } from "../auth/auditLog.js";
import { SALES_OPS_HEAD_SLUG } from "./salesOpsConstants.js";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsSupabaseStore } from "./salesOpsSupabaseStore.mjs";
import { createSalesOpsService, SalesOpsError } from "./salesOpsService.mjs";
import { createSalesOpsMondayClient } from "./salesOpsMonday.mjs";
import { verifyHs256Jwt } from "./salesOpsJwt.mjs";

const jsonParser = express.json({ limit: "512kb" });

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

function sendError(res, e) {
  if (e instanceof SalesOpsError) {
    jsonNoStore(res);
    return res.status(e.status).json({ ok: false, error: e.message, code: e.code });
  }
  console.error("salesOps", e);
  jsonNoStore(res);
  return res.status(500).json({ ok: false, error: "Sales Ops request failed." });
}

function actorUser(req) {
  const u = req.user || {};
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name || u.fullName || "",
    role: u.role,
    organization_id: u.organization_id,
    isActive: u.isActive !== false,
    is_active: u.is_active !== false
  };
}

export function resolveSalesOpsStore(getSupabase) {
  const mode = String(process.env.SALES_OPS_STORE || "").trim().toLowerCase();
  if (mode === "memory") return createSalesOpsMemoryStore();
  const hosted =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.VERCEL_ENV) ||
    String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const wantSupabase = mode === "supabase" || (mode === "" && hosted && typeof getSupabase === "function");
  if (wantSupabase) {
    if (typeof getSupabase !== "function") {
      throw new Error("SALES_OPS_STORE=supabase requires a Supabase client factory");
    }
    return createSalesOpsSupabaseStore(getSupabase);
  }
  return createSalesOpsMemoryStore();
}

export function attachSalesOpsRoutes(app, { requireAuth, requireHeadAccess, getSupabase, store, monday, service } = {}) {
  if (typeof requireAuth !== "function") throw new Error("attachSalesOpsRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") throw new Error("attachSalesOpsRoutes: requireHeadAccess required");

  const dbStore = store || resolveSalesOpsStore(getSupabase);
  const mondayClient = monday || createSalesOpsMondayClient();
  const svc =
    service ||
    createSalesOpsService({
      store: dbStore,
      monday: mondayClient,
      audit: async (args) => {
        try {
          await logAction({ head: SALES_OPS_HEAD_SLUG, toolSlug: SALES_OPS_HEAD_SLUG, ...args });
        } catch {
          /* audit is best-effort */
        }
      }
    });

  const guard = [requireAuth(), requireHeadAccess(SALES_OPS_HEAD_SLUG, { getSupabase })];

  app.get("/api/sales-ops/me", ...guard, async (req, res) => {
    try {
      const me = await svc.getMe(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...me });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/plan", ...guard, async (req, res) => {
    try {
      const data = await svc.getMyPlan(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/performance", ...guard, async (req, res) => {
    try {
      const data = await svc.getMyPerformance(actorUser(req), { period: req.query.period || null });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/performance/months", ...guard, async (req, res) => {
    try {
      const data = await svc.getMyPerformance(actorUser(req), { period: req.query.period || null });
      jsonNoStore(res);
      res.json({ ok: true, period: data.period, months: data.months, actualSfDefinition: data.actualSfDefinition });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/performance/accounts", ...guard, async (req, res) => {
    try {
      const data = await svc.getMyPerformance(actorUser(req), {
        period: req.query.period || null,
        includeAccounts: true
      });
      jsonNoStore(res);
      res.json({
        ok: true,
        period: data.period,
        actualStatus: data.currentMonth?.actualStatus,
        actualSf: data.currentMonth?.actualSf,
        accounts: data.accounts,
        actualSfDefinition: data.actualSfDefinition
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/progress", ...guard, async (req, res) => {
    try {
      const data = await svc.getMyProgress(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/scorecards", ...guard, async (req, res) => {
    try {
      const scorecards = await svc.getMyScorecards(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, scorecards });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.put("/api/sales-ops/me/scorecards/:period", ...guard, jsonParser, async (req, res) => {
    try {
      const saved = await svc.putMyScorecard(actorUser(req), req.params.period, req.body || {});
      jsonNoStore(res);
      res.json({ ok: true, scorecard: saved });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/accounts", ...guard, async (req, res) => {
    try {
      const data = await svc.getMyAccounts(actorUser(req), {
        limit: req.query.limit,
        cursor: req.query.cursor
      });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/activities", ...guard, async (req, res) => {
    try {
      const activities = await svc.getMyActivities(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, activities });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/commission", ...guard, async (req, res) => {
    try {
      const data = await svc.getMyCommission(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/me/plans", ...guard, async (req, res) => {
    try {
      const plans = await svc.getMyPlanHistory(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, plans });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/me/plans/:planId/acknowledge", ...guard, jsonParser, async (req, res) => {
    try {
      const acknowledgement = await svc.acknowledgeMyPlan(actorUser(req), req.params.planId);
      jsonNoStore(res);
      res.json({ ok: true, acknowledgement });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/accounts/:accountId", ...guard, async (req, res) => {
    try {
      const data = await svc.getAccountWorkspace(actorUser(req), req.params.accountId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/accounts/:accountId/subitems", ...guard, async (req, res) => {
    try {
      const data = await svc.getAccountSubitems(actorUser(req), req.params.accountId, {
        limit: req.query.limit,
        cursor: req.query.cursor
      });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/accounts/:accountId/updates", ...guard, async (req, res) => {
    try {
      const data = await svc.getAccountUpdates(actorUser(req), req.params.accountId, {
        limit: req.query.limit,
        cursor: req.query.cursor
      });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/accounts/:accountId/files", ...guard, async (req, res) => {
    try {
      const data = await svc.getAccountFiles(actorUser(req), req.params.accountId, {
        limit: req.query.limit,
        cursor: req.query.cursor
      });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/accounts/:accountId/files/:assetId", ...guard, async (req, res) => {
    try {
      await svc.getAccountFile(actorUser(req), req.params.accountId, req.params.assetId);
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/accounts/:accountId/docs", ...guard, async (req, res) => {
    try {
      const data = await svc.getAccountDocs(actorUser(req), req.params.accountId, {
        limit: req.query.limit,
        cursor: req.query.cursor
      });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/accounts/:accountId/activity", ...guard, async (req, res) => {
    try {
      const data = await svc.getAccountActivity(actorUser(req), req.params.accountId, {
        limit: req.query.limit,
        cursor: req.query.cursor
      });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/sales-ops/accounts/:accountId", ...guard, jsonParser, async (req, res) => {
    try {
      const account = await svc.patchAccount(actorUser(req), req.params.accountId, req.body || {});
      jsonNoStore(res);
      res.json({ ok: true, account });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/accounts/:accountId/notes", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.addNote(actorUser(req), req.params.accountId, req.body?.body ?? req.body?.note);
      jsonNoStore(res);
      res.status(201).json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/accounts/:accountId/follow-ups", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.upsertFollowUp(actorUser(req), req.params.accountId, req.body || {});
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/team", ...guard, async (req, res) => {
    try {
      const data = await svc.getTeam(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/team/performance", ...guard, async (req, res) => {
    try {
      const data = await svc.getTeamPerformance(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/team/:userId/performance", ...guard, async (req, res) => {
    try {
      const data = await svc.getScopedPerformance(actorUser(req), req.params.userId, {
        period: req.query.period || null,
        includeAccounts: req.query.accounts === "1" || req.query.accounts === "true"
      });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/team/:userId/plan", ...guard, async (req, res) => {
    try {
      const data = await svc.getTeamMemberPlan(actorUser(req), req.params.userId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/plans", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.createPlanForUser(actorUser(req), req.body || {});
      jsonNoStore(res);
      res.status(201).json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/plans", ...guard, async (req, res) => {
    try {
      const plans = await svc.listAdminPlans(actorUser(req), {
        userId: req.query.userId,
        status: req.query.status,
        year: req.query.year,
        managerUserId: req.query.manager || req.query.managerUserId
      });
      jsonNoStore(res);
      res.json({ ok: true, plans });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/templates", ...guard, async (req, res) => {
    try {
      const templates = await svc.listPlanTemplates(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, templates });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/people", ...guard, async (req, res) => {
    try {
      const people = await svc.listAdminPeople(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, people });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/identity-audit", ...guard, async (req, res) => {
    try {
      const data = await svc.getIdentityAudit(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/plans/:planId", ...guard, async (req, res) => {
    try {
      const data = await svc.getAdminPlan(actorUser(req), req.params.planId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/plans/:planId/preview", ...guard, async (req, res) => {
    try {
      const data = await svc.previewAdminPlan(actorUser(req), req.params.planId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/sales-ops/admin/plans/:planId", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.updateAdminPlan(actorUser(req), req.params.planId, req.body || {});
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/plans/:planId/submit-review", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.submitAdminPlan(actorUser(req), req.params.planId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/plans/:planId/approve", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.approveAdminPlan(actorUser(req), req.params.planId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/plans/:planId/publish", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.publishAdminPlan(actorUser(req), req.params.planId, req.body || {});
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/plans/:planId/revise", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.reviseAdminPlan(actorUser(req), req.params.planId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/plans/:planId/generate-ramp", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.generateAdminRamp(actorUser(req), req.params.planId, req.body || {});
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/plans/:planId/archive", ...guard, jsonParser, async (req, res) => {
    try {
      const data = await svc.archiveAdminPlan(actorUser(req), req.params.planId);
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/manager-assignments", ...guard, jsonParser, async (req, res) => {
    try {
      const assignment = await svc.assignManager(actorUser(req), req.body || {});
      jsonNoStore(res);
      res.status(201).json({ ok: true, assignment });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/sync", ...guard, async (req, res) => {
    try {
      const mode = String(req.query.mode || req.body?.mode || "full").trim() || "full";
      const data = await svc.syncMonday(actorUser(req), { mode });
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/sync/status", ...guard, async (req, res) => {
    try {
      const data = await svc.getReconcileStatus(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/reproject", ...guard, async (req, res) => {
    try {
      const data = await svc.reprojectAccounts(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/admin/person-mappings/preview", ...guard, async (req, res) => {
    try {
      const data = await svc.previewMondayPersonMappings(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/sales-ops/admin/person-mappings/apply", ...guard, async (req, res) => {
    try {
      const data = await svc.applyMondayPersonMappings(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/sales-ops/integration/health", ...guard, async (req, res) => {
    try {
      const data = await svc.integrationHealth(actorUser(req));
      jsonNoStore(res);
      res.json({ ok: true, ...data });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/integrations/monday/sales-ops/webhook", jsonParser, async (req, res) => {
    try {
      const body = req.body || {};
      if (body.challenge) {
        jsonNoStore(res);
        return res.status(200).json({ challenge: body.challenge });
      }
      const secret = mondayClient.getSigningSecret?.() || "";
      if (secret) {
        const authz = String(req.header("authorization") ?? "");
        const verified = verifyHs256Jwt(authz, secret);
        if (!verified.ok) {
          jsonNoStore(res);
          return res.status(401).json({ ok: false, error: "Unauthorized" });
        }
      }
      const orgCtx = await resolveOrganizationContext({ req, supabase: getSupabase?.(), mode: "public" });
      const event = body.event || body;
      const boardId = String(event?.boardId || event?.board_id || body.boardId || req.query.board_id || "").trim();
      let organizationId =
        orgCtx?.organizationId || String(req.query.organization_id || "").trim() || "";
      if (!organizationId && boardId && typeof dbStore.getOrganizationIdByBoardId === "function") {
        organizationId = (await dbStore.getOrganizationIdByBoardId(boardId)) || "";
      }
      if (!organizationId) {
        jsonNoStore(res);
        return res.json({ ok: true, skipped: "no_organization" });
      }
      const result = await svc.processWebhook({
        organizationId,
        eventId: event?.id || body?.trigger?.id || event?.pulseId || event?.itemId,
        eventType: event?.type || body?.type,
        itemId: event?.pulseId || event?.itemId || event?.pulseId,
        pulseId: event?.pulseId
      });
      jsonNoStore(res);
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("salesOps webhook", e);
      jsonNoStore(res);
      res.status(500).json({ ok: false, error: "Webhook processing failed." });
    }
  });
}
