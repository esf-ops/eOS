/**
 * Takeoff Workspace Routes — AI Takeoff Lab workspace and AI extraction (v5).
 *
 * Endpoints:
 *   GET  /api/takeoff/config                       — safe AI provider config (v5.9.3)
 *   POST /api/takeoff-jobs                        — create workspace from uploaded quote file
 *   GET  /api/takeoff-jobs/:id                    — get workspace status + file metadata
 *   POST /api/takeoff-jobs/:id/results             — save reviewed TakeoffResult (server recomputes)
 *   GET  /api/takeoff-jobs/:id/results/latest      — load latest saved result
 *   POST /api/takeoff-jobs/:id/generate-ai-draft   — generate AI draft from uploaded plan (v5)
 *
 * v5: adds live AI extraction via POST /api/takeoff-jobs/:id/generate-ai-draft.
 *   - Backend downloads file from private storage, sends to AI provider, recomputes server-side.
 *   - review_status is always 'needs_review' — AI draft is never auto-approved.
 *   - Controlled by TAKEOFF_AI_ENABLED=1, TAKEOFF_AI_PROVIDER, TAKEOFF_AI_MODEL, OPENAI_API_KEY.
 *   - storage_path and API key are never returned to clients.
 *   - No quote mutation. No import.
 *
 * v4.5: `takeoffJobId` is a real quote_takeoff_jobs.id (quote_id = null for pre-quote Lab flows).
 *       Results persisted in quote_takeoff_results (with fallback to quote_takeoff_jobs.result_summary
 *       if quote_takeoff_results.quote_id NOT NULL is not yet relaxed).
 *
 * All endpoints:
 *   - Require authentication.
 *   - Derive organizationId from auth context (never from client body).
 *   - Verify job/file ownership before any read/write.
 *   - Never return storage_path.
 *   - No pricing, no Monday, no Moraware, no Internal Estimate mutation.
 */
import express from "express";
import {
  createTakeoffWorkspace,
  getTakeoffWorkspace,
  saveTakeoffResult,
  getLatestTakeoffResult,
  listTakeoffResults,
  getResultById,
} from "./takeoffWorkspaceService.mjs";
import { runAiTakeoffExtraction } from "./takeoffExtractionService.mjs";
import { readSafeProviderConfigAsync } from "./takeoffAiProvider.mjs";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";

const jsonParser = express.json({ limit: "4mb" }); // TakeoffResult JSON can be large

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   headAccess: Function,   — requireHeadAccess("ai_takeoff", ...) middleware; all takeoff routes are gated
 * }} deps
 */
export function attachTakeoffWorkspaceRoutes(app, { requireAuth, getSupabase, headAccess }) {
  // Inline guard: headAccess is provided in production by server.js; fall back to a
  // no-op for backwards-compat with tests that inject requireAuth + getSupabase only.
  const guardHead = typeof headAccess === "function" ? headAccess : (_r, _s, next) => next();

  // ── GET /api/takeoff/config ───────────────────────────────────────────────
  //
  // Returns safe AI provider configuration for the UI (no API key values).
  // Used to display a compact provider badge near the "Generate AI draft" button
  // so operators can quickly confirm which backend provider is active.
  //
  // Response shape:
  //   { ok, takeoffAiEnabled, activeProvider, model, hasGeminiKey, hasOpenAiKey,
  //     hasExayardKey, hasExayardOrganizationId,
  //     exayard?: { configuredOrganizationId, membershipOrganizationIds, … } }
  //
  app.get("/api/takeoff/config", requireAuth(), guardHead, async (_req, res) => {
    try {
      const config = await readSafeProviderConfigAsync();
      return res.json({ ok: true, ...config });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

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
  app.post("/api/takeoff-jobs", requireAuth(), guardHead, jsonParser, async (req, res) => {
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
  app.get("/api/takeoff-jobs/:id", requireAuth(), guardHead, async (req, res) => {
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
  app.post("/api/takeoff-jobs/:id/results", requireAuth(), guardHead, jsonParser, async (req, res) => {
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
  app.get("/api/takeoff-jobs/:id/results/latest", requireAuth(), guardHead, async (req, res) => {
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

  // ── GET /api/takeoff-jobs/:id/results ─────────────────────────────────────
  //
  // v5.3: List recent AI extraction run summaries for a takeoff job.
  // Returns safe metadata only — no full JSON, no storage_path, no secrets.
  // Sorted newest-first, limit 20.
  //
  // Response:
  //   { ok: true, results: [{ id, createdAt, promptVersion, modelUsed,
  //     computedCountertopSf, computedBacksplashSf, computedCombinedSf,
  //     warningCount, errorCount, reviewStatus, schemaVersion, source }] }
  //
  // NOTE: registered BEFORE /:id/results/:resultId to avoid route collision.
  //
  app.get("/api/takeoff-jobs/:id/results", requireAuth(), guardHead, async (req, res) => {
    try {
      const supabase = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }
      const takeoffJobId = String(req.params.id ?? "").trim();
      const result = await listTakeoffResults({
        supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
      });
      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── GET /api/takeoff-jobs/:id/results/:resultId ────────────────────────────
  //
  // v5.3: Load a specific AI extraction result by ID.
  // Returns full result with server-recomputed measurements.
  // storage_path and secrets never returned.
  //
  // IMPORTANT: registered AFTER /results/latest to avoid Express treating "latest"
  // as a :resultId value.
  //
  // Response:
  //   { ok: true, takeoffJobId, resultId, savedAt, schemaVersion, reviewStatus,
  //     promptVersion, modelUsed, normalizedTakeoffJson, computedMeasurementsJson,
  //     validationDiagnosticsJson, importPlanJson }
  //
  app.get("/api/takeoff-jobs/:id/results/:resultId", requireAuth(), guardHead, async (req, res) => {
    try {
      const supabase = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }
      const takeoffJobId = String(req.params.id ?? "").trim();
      const resultId     = String(req.params.resultId ?? "").trim();
      const result = await getResultById({
        supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
        resultId,
      });
      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── POST /api/takeoff-jobs/:id/generate-ai-draft ──────────────────────────
  //
  // v5: Generate an AI takeoff draft from the workspace's uploaded source file.
  //
  // Behavior:
  //   1. Verify auth + org ownership.
  //   2. Verify job has a source file (quote_file_id set, file status = active).
  //   3. Set job status = 'processing'.
  //   4. Download file bytes from private Supabase Storage (service-role — never client-exposed).
  //   5. Send to AI provider (OpenAI) for measurement extraction.
  //   6. Server-side recompute with computeTakeoffMeasurements (AI totals not trusted).
  //   7. Server-side validate with validateTakeoffResult.
  //   8. Generate import plan with planTakeoffImport.
  //   9. Save to quote_takeoff_results (review_status = 'needs_review').
  //  10. Return normalizedTakeoffJson + computed + diagnostics + importPlan.
  //
  // Requires: TAKEOFF_AI_ENABLED=1 and OPENAI_API_KEY in server environment.
  // Does NOT import into a quote. Does NOT enable the Internal Estimate import button.
  // review_status is ALWAYS 'needs_review' — AI output is never auto-approved.
  //
  // Response:
  //   { ok: true, takeoffJobId, savedAt, schemaVersion, reviewStatus,
  //     normalizedTakeoffJson, computedMeasurementsJson, validationDiagnosticsJson,
  //     importPlanJson, summary, modelUsed, promptVersion, usage }
  //
  app.post("/api/takeoff-jobs/:id/generate-ai-draft", requireAuth(), guardHead, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();

      const result = await runAiTakeoffExtraction({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        takeoffJobId,
      });

      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = e.code ?? (status < 500 ? "validation_error" : "server_error");
      return res.status(status).json({
        ok:    false,
        error: String(e?.message ?? e),
        code,
        ...(e.rawExcerpt != null && { rawExcerpt: e.rawExcerpt }),
      });
    }
  });
}
