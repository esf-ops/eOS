import express from "express";

import { normalizeEntityName } from "../identity/identityResolver.js";

/** Tables from `backend-core/supabase/eos_identity_resolution.sql` (additive proposal). */
export const IDENTITY_RESOLUTION_TABLES = Object.freeze([
  "eos_entities",
  "eos_source_records",
  "eos_entity_links",
  "eos_identity_suggestions",
  "eos_identity_audit_log"
]);

const NOT_INSTALLED_MESSAGE = "Identity Resolution schema has not been applied yet.";

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

async function tableExists(supabase, table) {
  try {
    const { error } = await supabase.from(table).select("id").limit(1);
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
    return { ok: true, count: count ?? 0 };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: false, missing: true };
    return { ok: false, error: String(e?.message || e) };
  }
}

async function filteredCount(supabase, table, filters) {
  try {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    for (const [col, val] of filters) {
      q = q.eq(col, val);
    }
    const { count, error } = await q;
    if (error) throw error;
    return { ok: true, count: count ?? 0 };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: false, missing: true };
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function getIdentityResolutionSchemaHealth(supabase) {
  const checks = {};
  const missingTables = [];
  for (const t of IDENTITY_RESOLUTION_TABLES) {
    const ex = await tableExists(supabase, t);
    checks[t] = ex;
    if (!ex.exists) missingTables.push(t);
  }
  const installed = missingTables.length === 0;
  return {
    ok: installed,
    installed,
    requiredTables: [...IDENTITY_RESOLUTION_TABLES],
    missingTables,
    checks,
    message: installed ? "Identity Resolution schema is installed." : NOT_INSTALLED_MESSAGE
  };
}

/**
 * Resolver / module readiness (no DB writes).
 */
export function getIdentityResolverReadiness() {
  const sample = normalizeEntityName("  Elite Stone  ", {});
  return {
    identityResolverModuleLoaded: true,
    normalizeEntityNameSample: sample,
    note: "Server-side resolver helpers are stubs until workflows are wired; they do not create or approve links."
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function getIdentityResolutionSummary(supabase) {
  const health = await getIdentityResolutionSchemaHealth(supabase);
  if (!health.installed) {
    return {
      ok: false,
      installed: false,
      missingTables: health.missingTables,
      message: NOT_INSTALLED_MESSAGE,
      counts: null,
      resolverReadiness: getIdentityResolverReadiness()
    };
  }

  const entities = await tableCount(supabase, "eos_entities");
  const sourceRecords = await tableCount(supabase, "eos_source_records");
  const auditEvents = await tableCount(supabase, "eos_identity_audit_log");
  const activeLinks = await filteredCount(supabase, "eos_entity_links", [["link_status", "active"]]);
  const needsReviewSuggestions = await filteredCount(supabase, "eos_identity_suggestions", [
    ["suggestion_status", "needs_review"]
  ]);

  const countErr =
    !entities.ok && entities.error
      ? entities.error
      : !sourceRecords.ok && sourceRecords.error
        ? sourceRecords.error
        : !auditEvents.ok && auditEvents.error
          ? auditEvents.error
          : !activeLinks.ok && activeLinks.error
            ? activeLinks.error
            : !needsReviewSuggestions.ok && needsReviewSuggestions.error
              ? needsReviewSuggestions.error
              : null;

  if (countErr) {
    return {
      ok: false,
      installed: true,
      message: `Identity tables exist but a count query failed: ${countErr}`,
      missingTables: [],
      counts: null,
      resolverReadiness: getIdentityResolverReadiness()
    };
  }

  return {
    ok: true,
    installed: true,
    missingTables: [],
    message: "Identity Resolution summary loaded.",
    counts: {
      entities: entities.count ?? 0,
      sourceRecords: sourceRecords.count ?? 0,
      activeLinks: activeLinks.count ?? 0,
      needsReviewSuggestions: needsReviewSuggestions.count ?? 0,
      auditEvents: auditEvents.count ?? 0
    },
    resolverReadiness: getIdentityResolverReadiness()
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachIdentityResolutionAdminRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const headAccessSystemAdmin = requireHeadAccess("system_admin", { getSupabase });
  const supabaseGetter = () => getSupabase();

  /** Mounted router keeps `/api/admin/identity-resolution/*` wiring explicit and consistent with Express routing. */
  const router = express.Router();

  router.get(
    "/schema-health",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (_req, res) => {
      try {
        const supabase = supabaseGetter();
        const payload = await getIdentityResolutionSchemaHealth(supabase);
        res.json(payload);
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  router.get(
    "/summary",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (_req, res) => {
      try {
        const supabase = supabaseGetter();
        const payload = await getIdentityResolutionSummary(supabase);
        res.json(payload);
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.use("/api/admin/identity-resolution", router);

  console.log(
    "[admin] identity-resolution: mounted GET /api/admin/identity-resolution/schema-health + /summary (auth + admin role + system_admin head)"
  );
}
