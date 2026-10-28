/**
 * Jobs Command Center Head — protected, read-only All Jobs + Job Detail.
 *
 * Routes:
 *   GET /api/jobs-command-center/projects
 *   GET /api/jobs-command-center/projects/:projectRef
 *
 * Auth: requireAuth → requireRole(admin|super_admin) → requireHeadAccess(jobs_command_center)
 * Org: resolveOrganizationContext from caller profile only.
 */

import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import {
  JOBS_COMMAND_CENTER_HEAD_SLUG,
  JOBS_COMMAND_CENTER_ROLES
} from "./jobsCommandCenterConstants.js";
import {
  getJobsCommandCenterProject,
  listJobsCommandCenterProjects
} from "./jobsCommandCenterService.mjs";

export { JOBS_COMMAND_CENTER_HEAD_SLUG };

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  const code = err?.code || (status === 500 ? "internal_error" : "error");
  const message =
    status >= 500 ? "Request failed." : String(err?.message || err || "Request failed.");
  res.status(status).json({ ok: false, error: message, code });
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireRole: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient
 * }} deps
 */
export function attachJobsCommandCenterRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  if (typeof requireAuth !== "function") throw new Error("attachJobsCommandCenterRoutes: requireAuth required");
  if (typeof requireRole !== "function") throw new Error("attachJobsCommandCenterRoutes: requireRole required");
  if (typeof requireHeadAccess !== "function") {
    throw new Error("attachJobsCommandCenterRoutes: requireHeadAccess required");
  }
  if (typeof getSupabase !== "function") throw new Error("attachJobsCommandCenterRoutes: getSupabase required");

  const guard = [
    requireAuth(),
    requireRole([...JOBS_COMMAND_CENTER_ROLES]),
    requireHeadAccess(JOBS_COMMAND_CENTER_HEAD_SLUG, { getSupabase })
  ];

  async function orgIdFromCaller(req) {
    const ctx = await resolveOrganizationContext({
      req,
      supabase: getSupabase(),
      mode: "authenticated"
    });
    if (!ctx?.organizationId || ctx.source !== "user_profile") {
      const err = new Error("organization_required");
      err.status = 403;
      err.code = "organization_required";
      throw err;
    }
    return ctx.organizationId;
  }

  app.get("/api/jobs-command-center/projects", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgIdFromCaller(req);
      const payload = await listJobsCommandCenterProjects({
        supabase: getSupabase(),
        organizationId,
        page: req.query?.page,
        pageSize: req.query?.pageSize ?? req.query?.page_size,
        q: req.query?.q,
        bucket: req.query?.bucket
      });
      res.json(payload);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/jobs-command-center/projects/:projectRef", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgIdFromCaller(req);
      const payload = await getJobsCommandCenterProject({
        supabase: getSupabase(),
        organizationId,
        projectRef: req.params.projectRef
      });
      res.json(payload);
    } catch (err) {
      sendError(res, err);
    }
  });
}
