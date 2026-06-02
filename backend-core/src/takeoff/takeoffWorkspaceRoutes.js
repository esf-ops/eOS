/**
 * Takeoff Workspace Routes — normalized takeoff workspace (v4.5).
 *
 * Endpoints:
 *   POST /api/takeoff-jobs                   — create workspace from uploaded quote file
 *   GET  /api/takeoff-jobs/:id               — get workspace status + file metadata
 *   POST /api/takeoff-jobs/:id/results        — save reviewed TakeoffResult (server recomputes)
 *   GET  /api/takeoff-jobs/:id/results/latest — load latest saved result
 *
 * v4.5: `takeoffJobId` is a real quote_takeoff_jobs.id (quote_id = null for Lab/pre-quote flows).
 *       Results are persisted in quote_takeoff_results (with fallback to quote_takeoff_jobs.result_summary
 *       if quote_takeoff_results.quote_id NOT NULL constraint is not yet relaxed in this env).
 *       See takeoffWorkspaceService.mjs for the full persistence strategy.
 *
 * Legacy v4: if a request arrives with a quoteFileId as the workspace ID (v4 behavior),
 *       the service falls back to reading from quote_files.metadata (read-only).
 *
 * All endpoints:
 *   - Require authentication.
 *   - Derive organizationId from auth context (never from client body).
 *   - Verify job/file ownership before any read/write.
 *   - Never return storage_path.
 *   - No AI calls. No quote mutation. No pricing logic.
 *
 * Hard boundaries: no pricing, no Monday, no Moraware, no Internal Estimate mutation.
 */
import express from "express";
import {
  createTakeoffWorkspace,
  getTakeoffWorkspace,
  saveTakeoffResult,
  getLatestTakeoffResult,
} from "./takeoffWorkspaceService.mjs";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";

const jsonParser = express.json({ limit: "4mb" }); // TakeoffResult JSON can be large

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachTakeoffWorkspaceRoutes(app, { requireAuth, getSupabase }) {

  // ── POST /api/takeoff-jobs ─────────────────────────────────────────────────
  //
  // Creates a takeoff workspace from an already-uploaded quote file.
  // Returns a real quote_takeoff_jobs.id as the takeoffJobId.
  //
  // Request body:
  //   quoteFileId  uuid  required — must belong to the authenticated org
  //
  // Response:
  //   { ok: true, takeoffJobId, startedAt, reviewStatus, hasSavedResult, file: {...} }
  //
  app.post("/api/takeoff-jobs", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const quoteFileId = String(body.quoteFileId ?? "").trim();

      const result = await createTakeoffWorkspace({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        quoteFileId,
      });

      return res.status(201).json({ ok: true, ...result });
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── GET /api/takeoff-jobs/:id ──────────────────────────────────────────────
  //
  // Returns workspace status, file metadata, and whether a saved result exists.
  //
  // Response:
  //   { ok: true, takeoffJobId, reviewStatus, startedAt, hasSavedResult, isWorkspace, file: {...} }
  //
  app.get("/api/takeoff-jobs/:id", requireAuth(), async (req, res) => {
    try {
      const supabase = getSupabase();

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();
      const result = await getTakeoffWorkspace({
        supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
      });

      return res.json({ ok: true, ...result });
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── POST /api/takeoff-jobs/:id/results ────────────────────────────────────
  //
  // Saves a reviewed TakeoffResult. Backend recomputes measurements independently.
  // No quote mutation. No import.
  //
  // Request body:
  //   takeoffResult  object  required — TakeoffResult JSON (schema v1.0+)
  //   reviewStatus   string  optional — 'needs_review' | 'approved' | 'rejected' (default: needs_review)
  //
  // Response:
  //   { ok: true, takeoffJobId, savedAt, schemaVersion, reviewStatus, summary: {...} }
  //
  app.post("/api/takeoff-jobs/:id/results", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { takeoffResult, reviewStatus } = body;

      const result = await saveTakeoffResult({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        takeoffJobId,
        takeoffResult,
        reviewStatus: String(reviewStatus ?? "needs_review").trim() || "needs_review",
      });

      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── GET /api/takeoff-jobs/:id/results/latest ──────────────────────────────
  //
  // Returns the latest saved TakeoffResult with server-recomputed measurements.
  //
  // Response:
  //   { ok: true, takeoffJobId, savedAt, schemaVersion, reviewStatus,
  //     normalizedTakeoffJson, computedMeasurementsJson, validationDiagnosticsJson,
  //     importPlanJson, file: {...} }
  //
  app.get("/api/takeoff-jobs/:id/results/latest", requireAuth(), async (req, res) => {
    try {
      const supabase = getSupabase();

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();
      const result = await getLatestTakeoffResult({
        supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
      });

      return res.json({ ok: true, ...result });
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });
}
