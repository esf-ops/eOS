/**
 * slabsmithIngestApi — Windows connector ingest for Slabsmith XML inventory.
 *
 * POST /api/integrations/slabsmith/inventory/xml
 *
 * SECURITY:
 *   - Requires X-EliteOS-Slabsmith-Sync-Token matching server SLABSMITH_SYNC_TOKEN.
 *   - Supabase service role stays server-side (injected getSupabase).
 *   - Never returns tokens or Supabase secrets in responses.
 *
 * WRITES:
 *   - Uses normalizeSlabsmithInventory + persistSlabsmithInventory (external_source=slabsmith).
 *   - Does not delete rows, mark inactive, overwrite SlabCloud rows, or write slab_images (v1).
 *   - Not gated by SLABSMITH_INVENTORY_WRITE_ENABLED — token + server credentials authorize ingest.
 */

import express from "express";

import { normalizeSlabsmithInventory } from "./normalizeSlabsmithInventory.js";
import {
  persistSlabsmithInventory,
} from "./slabsmithPersistence.js";

export const SLABSMITH_INGEST_ROUTE = "/api/integrations/slabsmith/inventory/xml";
export const SLABSMITH_SYNC_TOKEN_ENV = "SLABSMITH_SYNC_TOKEN";
export const SLABSMITH_SYNC_TOKEN_HEADER = "x-eliteos-slabsmith-sync-token";
export const SLABSMITH_SYNC_ORG_ENV = "SLABSMITH_SYNC_ORGANIZATION_ID";
export const DEFAULT_TRIGGERED_BY = "windows_connector";

const MAX_XML_BYTES = 32 * 1024 * 1024;

/**
 * Read expected sync token from env (request time for testability).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readSlabsmithSyncToken(env = process.env) {
  return String(env?.[SLABSMITH_SYNC_TOKEN_ENV] ?? "").trim() || null;
}

/**
 * @param {import("express").Request} req
 * @param {NodeJS.ProcessEnv} [env]
 */
export function validateSlabsmithSyncToken(req, env = process.env) {
  const expected = readSlabsmithSyncToken(env);
  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: `${SLABSMITH_SYNC_TOKEN_ENV} not configured on backend`,
    };
  }

  const got = String(
    req.header?.(SLABSMITH_SYNC_TOKEN_HEADER) ??
      req.headers?.[SLABSMITH_SYNC_TOKEN_HEADER] ??
      ""
  ).trim();

  if (!got) {
    return {
      ok: false,
      status: 401,
      error: `Missing ${SLABSMITH_SYNC_TOKEN_HEADER} header`,
    };
  }

  if (got !== expected) {
    return { ok: false, status: 401, error: "Invalid sync token" };
  }

  return { ok: true };
}

/**
 * Resolve organization_id for connector ingest.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveSlabsmithSyncOrganizationId(env = process.env) {
  return (
    String(env?.[SLABSMITH_SYNC_ORG_ENV] ?? "").trim() ||
    String(env?.SLABOS_ORGANIZATION_ID ?? "").trim() ||
    null
  );
}

/**
 * Validate server-side Supabase credentials for ingest writes.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function validateIngestServerEnv(env = process.env) {
  /** @type {string[]} */
  const missing = [];
  if (!String(env?.SUPABASE_URL ?? "").trim()) missing.push("SUPABASE_URL");
  if (!String(env?.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  const orgId = resolveSlabsmithSyncOrganizationId(env);
  if (!orgId) {
    missing.push(`${SLABSMITH_SYNC_ORG_ENV} or SLABOS_ORGANIZATION_ID`);
  }
  if (missing.length) {
    return {
      ok: false,
      status: 500,
      error: `Backend ingest not configured: missing ${missing.join(", ")}`,
    };
  }
  return { ok: true, organizationId: orgId };
}

/**
 * Extract XML string from raw ingest body (application/xml or application/json).
 * @param {unknown} body
 * @param {string|undefined|null} contentType
 */
export function extractXmlFromIngestBody(body, contentType) {
  const ct = String(contentType ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    let parsed = body;
    if (Buffer.isBuffer(parsed)) {
      try {
        parsed = JSON.parse(parsed.toString("utf8"));
      } catch {
        return null;
      }
    }
    if (typeof parsed === "string") {
      return parsed.trim() ? parsed : null;
    }
    if (parsed && typeof parsed === "object") {
      const xml =
        /** @type {Record<string, unknown>} */ (parsed).xml ??
        /** @type {Record<string, unknown>} */ (parsed).XML ??
        /** @type {Record<string, unknown>} */ (parsed).payload?.xml;
      if (typeof xml === "string" && xml.trim()) return xml;
    }
    return null;
  }

  if (Buffer.isBuffer(body)) {
    const text = body.toString("utf8");
    return text.trim() ? text : null;
  }
  if (typeof body === "string") {
    return body.trim() ? body : null;
  }
  return null;
}

/**
 * Map persistence result to connector-friendly JSON (no secrets).
 * @param {Record<string, unknown>} persistResult
 * @param {{ organizationId?: string|null, triggeredBy?: string }} meta
 */
export function buildIngestResponse(persistResult, meta = {}) {
  const warnings = Array.isArray(persistResult.warnings) ? persistResult.warnings : [];
  const status = persistResult.status ?? persistResult.mode ?? "unknown";

  return {
    ok: status === "completed",
    organization_id: meta.organizationId ?? null,
    triggered_by: meta.triggeredBy ?? DEFAULT_TRIGGERED_BY,
    rows_seen: Number(persistResult.rows_seen ?? 0),
    inserted: Number(persistResult.inserted ?? persistResult.changeCounts?.inserted ?? 0),
    updated: Number(persistResult.updated ?? persistResult.changeCounts?.updated ?? 0),
    unchanged: Number(persistResult.unchanged ?? persistResult.changeCounts?.unchanged ?? 0),
    raw_records_written: Number(persistResult.raw_records_written ?? 0),
    slab_inventory_upserted: Number(persistResult.slab_inventory_upserted ?? 0),
    needs_review: Number(persistResult.needs_review ?? 0),
    sync_run_id: persistResult.syncRunId ?? null,
    status,
    warnings_count: warnings.length,
    warnings: warnings.slice(0, 10),
    errors: persistResult.errors ?? null,
  };
}

/**
 * Ensure response JSON never leaks server secrets.
 * @param {Record<string, unknown>} payload
 */
export function sanitizeIngestResponse(payload) {
  const json = JSON.stringify(payload);
  const banned = ["SUPABASE_SERVICE_ROLE_KEY", "SLABSMITH_SYNC_TOKEN", "service_role"];
  for (const needle of banned) {
    if (json.includes(needle)) {
      throw new Error("Ingest response must not expose secrets");
    }
  }
  return payload;
}

/**
 * Core ingest orchestration (exported for tests).
 * @param {object} params
 */
export async function ingestSlabsmithInventoryXml({
  xml,
  db,
  organizationId,
  triggeredBy = DEFAULT_TRIGGERED_BY,
  persistFn = persistSlabsmithInventory,
  normalizeFn = normalizeSlabsmithInventory,
}) {
  if (!xml || !String(xml).trim()) {
    throw new Error("XML body is empty");
  }
  if (!db) {
    throw new Error("Supabase client required for ingest write");
  }
  if (!organizationId) {
    throw new Error("organizationId required for ingest write");
  }

  const { rows } = normalizeFn(String(xml));
  if (!rows.length) {
    throw new Error("No Slabsmith.dbo.Slabs records found in XML");
  }

  const persistResult = await persistFn({
    db,
    organizationId,
    normalized: rows,
    writeEnabled: true,
    runMeta: { triggeredBy },
  });

  return buildIngestResponse(persistResult, { organizationId, triggeredBy });
}

/**
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   persistSlabsmithInventory?: typeof persistSlabsmithInventory,
 *   normalizeSlabsmithInventory?: typeof normalizeSlabsmithInventory,
 * }} deps
 */
export function createSlabsmithIngestHandler(deps) {
  if (!deps || typeof deps.getSupabase !== "function") {
    throw new Error("createSlabsmithIngestHandler: getSupabase required");
  }

  const getSupabase = deps.getSupabase;
  const persistFn = deps.persistSlabsmithInventory ?? persistSlabsmithInventory;
  const normalizeFn = deps.normalizeSlabsmithInventory ?? normalizeSlabsmithInventory;

  return async function slabsmithIngestHandler(req, res) {
    try {
      const tokenCheck = validateSlabsmithSyncToken(req);
      if (!tokenCheck.ok) {
        return res.status(tokenCheck.status).json({ ok: false, error: tokenCheck.error });
      }

      const envCheck = validateIngestServerEnv();
      if (!envCheck.ok) {
        return res.status(envCheck.status).json({ ok: false, error: envCheck.error });
      }

      const xml = extractXmlFromIngestBody(req.body, req.headers["content-type"]);
      if (!xml) {
        return res.status(400).json({
          ok: false,
          error: 'Request body must be raw XML (application/xml) or JSON { "xml": "..." }',
        });
      }

      const db = getSupabase();
      const payload = sanitizeIngestResponse(
        await ingestSlabsmithInventoryXml({
          xml,
          db,
          organizationId: envCheck.organizationId,
          persistFn,
          normalizeFn,
        })
      );

      const httpStatus = payload.ok ? 200 : 500;
      return res.status(httpStatus).json(payload);
    } catch (err) {
      console.error("[slabsmith-ingest] failed:", err?.message || String(err));
      return res.status(500).json({
        ok: false,
        error: String(err?.message || err),
      });
    }
  };
}

/**
 * @param {import("express").Application} app
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   persistSlabsmithInventory?: typeof persistSlabsmithInventory,
 *   normalizeSlabsmithInventory?: typeof normalizeSlabsmithInventory,
 * }} deps
 */
export function attachSlabsmithIngestRoutes(app, deps) {
  const rawParser = express.raw({ type: () => true, limit: MAX_XML_BYTES });
  app.post(SLABSMITH_INGEST_ROUTE, rawParser, createSlabsmithIngestHandler(deps));
  console.log(`[slabsmith-ingest] mounted POST ${SLABSMITH_INGEST_ROUTE} (token auth, server-side Supabase write)`);
}
