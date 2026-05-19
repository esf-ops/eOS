/**
 * Moraware Admin APIs — Operations Integration Switchboard (read-only mirror + health).
 */

import {
  buildMorawareAdminHealth,
  buildMorawareDataQualitySummary,
  listMorawareAccounts,
  listMorawareActivities,
  listMorawareFormsFields,
  listMorawareJobs,
  listMorawareResources,
  loadPreparedFactsSummary,
  loadMorawareSyncOverview,
  resolveMorawareOrganizationId
} from "../moraware/morawareSyncHealth.js";

const REQUIRED_TABLES = Object.freeze([
  "moraware_sync_runs",
  "moraware_sync_errors",
  "moraware_data_quality_findings",
  "brain_moraware_accounts",
  "brain_moraware_jobs",
  "brain_moraware_job_activities",
  "brain_moraware_resources",
  "sales_moraware_job_facts",
  "sales_moraware_account_rollups"
]);

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

async function tableExists(supabase, table) {
  try {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) throw error;
    return { exists: true };
  } catch (e) {
    if (isMissingRelationError(e)) return { exists: false };
    return { exists: false, error: String(e?.message || e) };
  }
}

async function tableCount(supabase, table) {
  try {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) throw error;
    return { ok: true, count: count ?? null };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: false, missing: true };
    return { ok: false, error: String(e?.message || e) };
  }
}

function requireOrganization(res, organizationId) {
  if (!organizationId) {
    res.status(400).json({
      ok: false,
      error: "organization_id is required (query param, user profile, or MORAWARE_DEFAULT_ORGANIZATION_ID)."
    });
    return false;
  }
  return true;
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachMorawareAdminRoutes(app, deps) {
  const { requireAuth, requireRole, requireHeadAccess, getSupabase } = deps;
  const stack = [requireAuth(), requireRole(["admin"]), requireHeadAccess("system_admin", { getSupabase })];

  app.get("/api/admin/moraware/schema-health", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const tables = {};
      for (const table of REQUIRED_TABLES) {
        const exists = await tableExists(db, table);
        const count = exists.exists ? await tableCount(db, table) : { ok: false, missing: true };
        tables[table] = { exists: exists.exists, count: count.ok ? count.count : null, error: count.error || exists.error || null };
      }
      res.json({ ok: true, adapter: "moraware", tables });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/health", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const health = await buildMorawareAdminHealth(db, organizationId);
      res.json(health);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/prepared-facts", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const overview = await loadMorawareSyncOverview(db, organizationId);
      const prepared = await loadPreparedFactsSummary(db, organizationId, overview.latest_complete_import_group);
      res.json({ ok: true, organization_id: organizationId, ...prepared });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/data-quality", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const summary = await buildMorawareDataQualitySummary(db, organizationId);
      res.json(summary);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/jobs", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const result = await listMorawareJobs(db, organizationId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/accounts", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const result = await listMorawareAccounts(db, organizationId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/activities", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const result = await listMorawareActivities(db, organizationId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/resources", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const result = await listMorawareResources(db, organizationId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/moraware/forms-fields", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = resolveMorawareOrganizationId(req);
      if (!requireOrganization(res, organizationId)) return;
      const result = await listMorawareFormsFields(db, organizationId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
