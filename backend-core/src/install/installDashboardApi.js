/**
 * Install Dashboard Head (v1) — protected, read-only installer day view API.
 *
 * Routes:
 *   GET /api/install-dashboard/today
 *   GET /api/install-dashboard/day?date=YYYY-MM-DD&crewId=...
 *   GET /api/install-dashboard/crews?date=YYYY-MM-DD
 *
 * Auth: requireAuth() + requireHeadAccess("install_dashboard")
 * Data: Moraware calendar schedule rows when available, else brain_job_activities, else fixture in dev.
 * No Moraware writeback, no schedule mutation, no route optimization.
 */

import { loadInstallCrews, loadInstallDayPayload } from "./installDashboardBrainRead.js";
import {
  parseIsoDateParam,
  todayDateInChicago
} from "./installDashboardNormalizer.js";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";

export const INSTALL_DASHBOARD_HEAD_SLUG = "install_dashboard";

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient
 * }} deps
 */
export function attachInstallDashboardRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  if (typeof requireAuth !== "function") throw new Error("attachInstallDashboardRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") {
    throw new Error("attachInstallDashboardRoutes: requireHeadAccess required");
  }
  if (typeof getSupabase !== "function") throw new Error("attachInstallDashboardRoutes: getSupabase required");

  const headAccess = requireHeadAccess(INSTALL_DASHBOARD_HEAD_SLUG, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const db = () => getSupabase();

  async function orgId(req) {
    try {
      const ctx = await resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
      return ctx.organizationId || null;
    } catch {
      return null;
    }
  }

  async function respondDay(req, res, date, crewId) {
    jsonNoStore(res);
    const payload = await loadInstallDayPayload(db(), {
      date,
      crewId,
      organizationId: await orgId(req)
    });
    res.json({ ok: true, ...payload });
  }

  app.get("/api/install-dashboard/today", ...guard, async (req, res) => {
    try {
      const date = todayDateInChicago();
      const crewId = String(req.query?.crewId ?? req.query?.crew_id ?? "").trim() || null;
      await respondDay(req, res, date, crewId);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/install-dashboard/day", ...guard, async (req, res) => {
    try {
      const date = parseIsoDateParam(req.query?.date);
      if (!date) {
        return res.status(400).json({ ok: false, error: "Query param date=YYYY-MM-DD is required." });
      }
      const crewId = String(req.query?.crewId ?? req.query?.crew_id ?? "").trim() || null;
      await respondDay(req, res, date, crewId);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/install-dashboard/crews", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const date = parseIsoDateParam(req.query?.date) || todayDateInChicago();
      const payload = await loadInstallCrews(db(), {
        date,
        organizationId: await orgId(req)
      });
      res.json({ ok: true, ...payload });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
