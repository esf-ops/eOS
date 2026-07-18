/**
 * Takeoff Workspace Routes — AI Takeoff Lab workspace and AI extraction (v5).
 *
 * Endpoints:
 *   GET  /api/takeoff/config                       — safe AI provider config (v5.9.3)
 *   POST /api/takeoff-jobs                        — create workspace from uploaded quote file
 *   GET  /api/takeoff-jobs                        — list org takeoff jobs (inbox)
 *   GET  /api/takeoff-jobs/:id                    — get workspace status + file metadata
 *   POST /api/takeoff-jobs/:id/results             — save reviewed TakeoffResult (server recomputes)
 *   POST /api/takeoff-jobs/:id/corrections         — save estimator corrections + audit metadata
 *   POST /api/takeoff-jobs/:id/approve             — approve latest reviewed takeoff (validated)
 *   POST /api/takeoff-jobs/:id/approve-and-build-estimate — consolidated save+approve for Studio
 *   GET  /api/takeoff-jobs/:id/results/latest      — load latest saved result
 *   POST /api/takeoff-jobs/:id/process              — start async processing (Phase E)
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
  listTakeoffJobs,
  saveTakeoffResult,
  saveTakeoffCorrection,
  approveTakeoffJob,
  approveAndBuildEstimate,
  getLatestTakeoffResult,
  listTakeoffResults,
  getResultById,
} from "./takeoffWorkspaceService.mjs";
import { runAiTakeoffExtraction } from "./takeoffExtractionService.mjs";
import {
  readTakeoffGenerateConfig,
  startAiTakeoffGeneration,
} from "./takeoffGenerationOrchestrator.mjs";
import { startTakeoffProcessing } from "./takeoffProcessOrchestrator.mjs";
import { resumeExayardTakeoff } from "./exayardTakeoffResume.mjs";
import { readSafeProviderConfigAsync } from "./takeoffAiProvider.mjs";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import {
  TAKEOFF_BETA_LABEL,
  TAKEOFF_ISSUE_CATEGORIES,
  buildTakeoffBetaQaSummary,
  recordTakeoffBetaMetric,
  submitTakeoffFeedback,
  submitTakeoffIssueReport,
} from "./takeoffBetaService.mjs";

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

  // ── GET /api/takeoff-jobs ───────────────────────────────────────────────────
  //
  // Lists takeoff jobs for the authenticated organization (newest first).
  // Query: status, review_status, limit, offset
  //
  app.get("/api/takeoff-jobs", requireAuth(), guardHead, async (req, res) => {
    try {
      const supabase = getSupabase();

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const result = await listTakeoffJobs({
        supabase,
        organizationId: orgCtx.organizationId,
        query: req.query ?? {},
      });

      return res.json(result);
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

  // ── POST /api/takeoff-jobs/:id/corrections ────────────────────────────────
  //
  // Saves estimator corrections with audit metadata appended to result JSON.
  // Resets approval to needs_review. No quote mutation. No import.
  //
  app.post("/api/takeoff-jobs/:id/corrections", requireAuth(), guardHead, jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { takeoffResult, correctionNotes, baseResultId, reviewState } = body;

      const result = await saveTakeoffCorrection({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        takeoffJobId,
        takeoffResult,
        correctionNotes: correctionNotes ?? null,
        baseResultId: baseResultId ?? null,
        reviewState: reviewState ?? null,
      });

      return res.status(201).json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── POST /api/takeoff-jobs/:id/approve ────────────────────────────────────
  //
  // Validates + QA-gates the latest reviewed takeoff, then marks job/result approved.
  // Does NOT import into Internal Estimate. Does NOT create or update quotes.
  //
  app.post("/api/takeoff-jobs/:id/approve", requireAuth(), guardHead, jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const takeoffResult = body.takeoffResult ?? null;
      const reviewState = body.reviewState ?? null;
      const dimensionEvidence = body.dimensionEvidence ?? null;

      const result = await approveTakeoffJob({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        takeoffJobId,
        takeoffResult,
        reviewState,
        dimensionEvidence,
      });

      await recordTakeoffBetaMetric({
        db: supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
        eventType: "ai_takeoff_approved_for_import",
        userId: user?.id ?? null,
        userEmail: String(user?.email || user?.id || "unknown"),
        req,
      }).catch(() => {});

      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      // When the approval gate rejects, include structured blocker details so the
      // frontend can render decision cards instead of a raw error string.
      if (e.approvalBlockers) {
        return res.status(status).json({
          ok: false,
          error: String(e?.message ?? e),
          code: e.approvalBlockers.code ?? code,
          hardBlockers: e.approvalBlockers.hardBlockers ?? [],
          estimatorDecisionsRequired: e.approvalBlockers.estimatorDecisionsRequired ?? [],
          advisory: e.approvalBlockers.advisory ?? [],
          advisoryCount: e.approvalBlockers.advisoryCount ?? (e.approvalBlockers.advisory ?? []).length
        });
      }
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── POST /api/takeoff-jobs/:id/approve-and-build-estimate ─────────────────
  //
  // Consolidated worksheet path: save pending edits, classify blocking vs advisory,
  // approve Takeoff, return summary for Studio Estimate Scope seed. Does not import
  // to Internal Estimate. Does not create quotes.
  //
  app.post(
    "/api/takeoff-jobs/:id/approve-and-build-estimate",
    requireAuth(),
    guardHead,
    jsonParser,
    async (req, res) => {
      try {
        const supabase = getSupabase();
        const user = req.user;

        const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
        if (!orgCtx.organizationId) {
          return res.status(503).json({ ok: false, error: "Organization context not available" });
        }

        const takeoffJobId = String(req.params.id ?? "").trim();
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const takeoffResult = body.takeoffResult ?? null;
        const reviewState = body.reviewState ?? null;
        const dimensionEvidence = body.dimensionEvidence ?? null;
        const confirmAdvisories =
          body.confirmAdvisories === true ||
          body.confirmAdvisories === "1" ||
          body.acceptAdvisoryWarnings === true ||
          body.acceptAdvisoryWarnings === "1" ||
          body.acknowledgeAdvisories === true ||
          body.allowAdvisoryApproval === true;

        const result = await approveAndBuildEstimate({
          supabase,
          organizationId: orgCtx.organizationId,
          userId: user?.id ?? null,
          takeoffJobId,
          takeoffResult,
          reviewState,
          dimensionEvidence,
          confirmAdvisories,
          acceptAdvisoryWarnings: confirmAdvisories,
          correctionNotes:
            typeof body.correctionNotes === "string" ? body.correctionNotes : null
        });

        await recordTakeoffBetaMetric({
          db: supabase,
          organizationId: orgCtx.organizationId,
          takeoffJobId,
          eventType: "ai_takeoff_approved_for_import",
          userId: user?.id ?? null,
          userEmail: String(user?.email || user?.id || "unknown"),
          req
        }).catch(() => {});

        return res.json(result);
      } catch (e) {
        const status = e.statusCode ?? 500;
        const code = e.code || (status < 500 ? "validation_error" : "server_error");
        if (e.approvalBlockers) {
          return res.status(status).json({
            ok: false,
            error: String(e?.message ?? e),
            code: e.approvalBlockers.code ?? code,
            hardBlockers: e.approvalBlockers.hardBlockers ?? [],
            estimatorDecisionsRequired: e.approvalBlockers.estimatorDecisionsRequired ?? [],
            advisory: e.approvalBlockers.advisory ?? [],
            advisoryCount:
              e.approvalBlockers.advisoryCount ?? (e.approvalBlockers.advisory ?? []).length
          });
        }
        return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
      }
    }
  );

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

  // ── POST /api/takeoff-jobs/:id/process ────────────────────────────────────
  //
  // Phase E: start async takeoff processing (DB-backed lifecycle).
  // Returns 202 when queued; stub mode may complete synchronously in dev/test only.
  // Production without worker → 503 worker_not_configured.
  // Poll GET /api/takeoff-jobs/:id for processing status.
  //
  app.post("/api/takeoff-jobs/:id/process", requireAuth(), guardHead, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();

      const result = await startTakeoffProcessing({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        takeoffJobId,
      });

      const httpStatus = result.status === "completed" ? 200 : 202;
      return res.status(httpStatus).json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = e.code ?? (status < 500 ? "validation_error" : "server_error");
      return res.status(status).json({
        ok: false,
        error: String(e?.message ?? e),
        code,
        ...(e.processing ? { processing: e.processing } : {}),
      });
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
  // Response (sync 200):
  //   { ok: true, takeoffJobId, savedAt, schemaVersion, reviewStatus,
  //     normalizedTakeoffJson, computedMeasurementsJson, validationDiagnosticsJson,
  //     importPlanJson, summary, modelUsed, promptVersion, usage }
  //
  // Response (async 202 — Vercel production default):
  //   { ok: true, accepted: true, takeoffJobId, runId, status: "processing", processing, mode: "ai_generate" }
  //   Poll GET /api/takeoff-jobs/:id until status is completed | failed, then GET /results/latest.
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
      const generateConfig = readTakeoffGenerateConfig();

      if (generateConfig.asyncEnabled) {
        const accepted = await startAiTakeoffGeneration({
          supabase,
          organizationId: orgCtx.organizationId,
          userId: user?.id ?? null,
          takeoffJobId,
        });

        await recordTakeoffBetaMetric({
          db: supabase,
          organizationId: orgCtx.organizationId,
          takeoffJobId,
          eventType: "ai_takeoff_generation_queued",
          userId: user?.id ?? null,
          userEmail: String(user?.email || user?.id || "unknown"),
          metadata: {
            runId: accepted.runId ?? null,
            mode: accepted.mode ?? "ai_generate",
          },
          req,
        }).catch(() => {});

        return res.status(202).json(accepted);
      }

      const result = await runAiTakeoffExtraction({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        takeoffJobId,
      });

      await recordTakeoffBetaMetric({
        db: supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
        eventType: "ai_takeoff_draft_generated",
        userId: user?.id ?? null,
        userEmail: String(user?.email || user?.id || "unknown"),
        metadata: {
          modelUsed: result?.modelUsed ?? null,
          promptVersion: result?.promptVersion ?? null,
        },
        req,
      }).catch(() => {});

      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = e.code ?? (status < 500 ? "validation_error" : "server_error");
      return res.status(status).json({
        ok:    false,
        error: String(e?.message ?? e),
        code,
        ...(e.rawExcerpt != null && { rawExcerpt: e.rawExcerpt }),
        ...(e.processing ? { processing: e.processing } : {}),
      });
    }
  });

  // ── POST /api/takeoff-jobs/:id/resume-exayard ─────────────────────────────
  //
  // Single GET /assessments/{id} check for an in-flight Exayard workflow.
  // Uses stored quote_takeoff_jobs.metadata.exayard.assessmentId.
  // Returns waiting_on_exayard (non-fatal) or completed raw capture.
  //
  app.post("/api/takeoff-jobs/:id/resume-exayard", requireAuth(), guardHead, async (req, res) => {
    try {
      const supabase = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const takeoffJobId = String(req.params.id ?? "").trim();
      const result = await resumeExayardTakeoff({
        supabase,
        organizationId: orgCtx.organizationId,
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
      });
    }
  });

  // ── POST /api/takeoff-jobs/:id/review-started ─────────────────────────────
  // Auth + org job ownership only — reachable from AI Takeoff and IE beta flows.
  app.post("/api/takeoff-jobs/:id/review-started", requireAuth(), async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }
      const takeoffJobId = String(req.params.id ?? "").trim();
      const metric = await recordTakeoffBetaMetric({
        db: supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
        eventType: "ai_takeoff_review_started",
        userId: user?.id ?? null,
        userEmail: String(user?.email || user?.id || "unknown"),
        req,
      });
      return res.json({ ok: true, ...metric });
    } catch (e) {
      const status = e.statusCode ?? 500;
      return res.status(status).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // ── POST /api/takeoff-jobs/:id/import-cancelled ───────────────────────────
  app.post("/api/takeoff-jobs/:id/import-cancelled", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }
      const takeoffJobId = String(req.params.id ?? "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const metric = await recordTakeoffBetaMetric({
        db: supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
        eventType: "ai_takeoff_import_cancelled",
        userId: user?.id ?? null,
        userEmail: String(user?.email || user?.id || "unknown"),
        metadata: { reason: body.reason ?? null },
        req,
      });
      return res.json({ ok: true, ...metric });
    } catch (e) {
      const status = e.statusCode ?? 500;
      return res.status(status).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // ── POST /api/takeoff-jobs/:id/feedback ───────────────────────────────────
  app.post("/api/takeoff-jobs/:id/feedback", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }
      const takeoffJobId = String(req.params.id ?? "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await submitTakeoffFeedback({
        db: supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
        userId: user?.id ?? null,
        userEmail: String(user?.email || user?.id || "unknown"),
        quoteId: body.quoteId ?? body.quote_id ?? null,
        helpful: body.helpful,
        editedMeasurements: body.editedMeasurements ?? body.edited_measurements,
        missedRooms: body.missedRooms ?? body.missed_rooms,
        misreadBacksplash: body.misreadBacksplash ?? body.misread_backsplash,
        note: body.note,
        estimatedTimeSavedMinutes: body.estimatedTimeSavedMinutes ?? body.estimated_time_saved_minutes,
        req,
      });
      return res.status(201).json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      return res.status(status).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // ── POST /api/takeoff-jobs/:id/issue-report ───────────────────────────────
  app.post("/api/takeoff-jobs/:id/issue-report", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }
      const takeoffJobId = String(req.params.id ?? "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await submitTakeoffIssueReport({
        db: supabase,
        organizationId: orgCtx.organizationId,
        takeoffJobId,
        userId: user?.id ?? null,
        userEmail: String(user?.email || user?.id || "unknown"),
        quoteId: body.quoteId ?? body.quote_id ?? null,
        category: body.category,
        note: body.note,
        sourcePage: body.sourcePage ?? body.source_page,
        sourcePiece: body.sourcePiece ?? body.source_piece,
        req,
      });
      return res.status(201).json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      return res.status(status).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // ── GET /api/takeoff-beta/qa-summary ──────────────────────────────────────
  app.get("/api/takeoff-beta/qa-summary", requireAuth(), guardHead, async (req, res) => {
    try {
      const supabase = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }
      const limit = Number(req.query?.limit ?? 25);
      const summary = await buildTakeoffBetaQaSummary(supabase, orgCtx.organizationId, { limit });
      return res.json({ ...summary, betaLabel: TAKEOFF_BETA_LABEL, issueCategories: TAKEOFF_ISSUE_CATEGORIES });
    } catch (e) {
      const status = e.statusCode ?? 500;
      return res.status(status).json({ ok: false, error: String(e?.message ?? e) });
    }
  });
}
