/**
 * Internal READ-ONLY Monday Sales Ops schedule routes (cron-secret gated).
 * GET|POST /api/internal/sales-ops/monday-sync/{light|deep|full}
 *
 * Vercel Cron invokes GET with Authorization: Bearer <CRON_SECRET>.
 * Does not expose an unauthenticated admin trigger. Monday writes stay disabled.
 */

import { validateCronSecret } from "../takeoff/takeoffInternalRoutes.js";
import { createSalesOpsMondayClient } from "./salesOpsMonday.mjs";
import { resolveSalesOpsStore } from "./salesOpsApi.js";
import { normalizeMondaySyncJobType, runScheduledMondayJob } from "./salesOpsMondaySchedule.mjs";

function jobTypeFromPath(path) {
  const p = String(path || "");
  if (p.endsWith("/light")) return "light";
  if (p.endsWith("/deep")) return "deep";
  if (p.endsWith("/full")) return "full";
  return null;
}

export function attachSalesOpsMondayScheduleRoutes(app, deps = {}) {
  const env = deps.env ?? process.env;
  const getStore = () => deps.store || resolveSalesOpsStore(deps.getSupabase);
  const getMonday = () => deps.monday || createSalesOpsMondayClient();
  const paths = [
    "/api/internal/sales-ops/monday-sync/light",
    "/api/internal/sales-ops/monday-sync/deep",
    "/api/internal/sales-ops/monday-sync/full"
  ];

  async function handler(req, res) {
    res.set("Cache-Control", "no-store");
    const secretCheck = validateCronSecret(req, env);
    if (!secretCheck.ok) {
      return res.status(secretCheck.status).json({
        ok: false,
        error: secretCheck.error,
        writeEnabled: false
      });
    }

    const jobType = normalizeMondaySyncJobType(req.query?.job || jobTypeFromPath(req.path));
    if (!jobType) {
      return res.status(400).json({ ok: false, error: "Unknown Monday schedule job type.", writeEnabled: false });
    }

    let store;
    try {
      store = getStore();
    } catch {
      return res.status(503).json({
        ok: false,
        error: "Sales Ops store unavailable",
        code: "store_unavailable",
        writeEnabled: false
      });
    }

    try {
      const organizationId = String(req.query?.organizationId || req.body?.organizationId || "").trim() || null;
      const result = await runScheduledMondayJob({
        store,
        monday: getMonday(),
        jobType,
        organizationId,
        actorUserId: null
      });
      return res.status(200).json({
        ...result,
        ok: true,
        writeEnabled: false,
        webhookEnabled: false
      });
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 500);
      console.error(JSON.stringify({ sales_ops_monday_schedule: true, jobType, error: msg }));
      return res.status(e?.status || 500).json({
        ok: false,
        error: "Monday scheduled sync failed.",
        code: e?.code || "monday_schedule_failed",
        jobType,
        writeEnabled: false
      });
    }
  }

  for (const path of paths) {
    app.get(path, handler);
    app.post(path, handler);
  }
}
