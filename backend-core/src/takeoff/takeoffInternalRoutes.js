/**
 * Internal Takeoff durability routes (cron-secret gated).
 * GET|POST /api/internal/takeoff/process-queued
 *
 * Vercel Cron invokes GET with Authorization: Bearer <CRON_SECRET>.
 */
import {
  buildTakeoffWorkerDiagnostics,
  processQueuedAiTakeoffJobs,
  readTakeoffWorkerStaleMs
} from "./takeoffGenerationWorker.mjs";

export function readCronSecret(env = process.env) {
  return (
    String(env.CRON_SECRET ?? "").trim() ||
    String(env.EOS_CRON_SECRET ?? "").trim() ||
    String(env.ELITEOS_CRON_SECRET ?? "").trim() ||
    ""
  );
}

/**
 * @param {import("express").Request} req
 * @param {NodeJS.ProcessEnv} [env]
 */
export function validateCronSecret(req, env = process.env) {
  const expected = readCronSecret(env);
  if (!expected) {
    return {
      ok: false,
      status: 500,
      error:
        "No cron secret configured on backend (set CRON_SECRET, EOS_CRON_SECRET, or ELITEOS_CRON_SECRET)"
    };
  }
  const auth = String(req?.headers?.authorization ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === expected) {
    return { ok: true };
  }
  const eos = String(req?.headers?.["x-eos-cron-secret"] ?? "").trim();
  if (eos && eos === expected) return { ok: true };
  const elite = String(req?.headers?.["x-eliteos-cron-secret"] ?? "").trim();
  if (elite && elite === expected) return { ok: true };
  return { ok: false, status: 401, error: "Unauthorized" };
}

/**
 * @param {import("express").Express} app
 * @param {{ getSupabase: Function, env?: NodeJS.ProcessEnv }} deps
 */
export function attachTakeoffInternalRoutes(app, deps) {
  const env = deps.env ?? process.env;
  const ROUTE = "/api/internal/takeoff/process-queued";

  async function handler(req, res) {
    res.set("Cache-Control", "no-store");
    const secretCheck = validateCronSecret(req, env);
    if (!secretCheck.ok) {
      return res.status(secretCheck.status).json({
        ok: false,
        error: secretCheck.error,
        claimed: 0,
        processed: 0,
        failed: 0
      });
    }

    let supabase;
    try {
      supabase = deps.getSupabase();
    } catch {
      return res.status(503).json({
        ok: false,
        error: "Supabase unavailable",
        code: "supabase_unavailable",
        claimed: 0,
        processed: 0,
        failed: 0
      });
    }
    if (!supabase) {
      return res.status(503).json({
        ok: false,
        error: "Supabase unavailable",
        code: "supabase_unavailable",
        claimed: 0,
        processed: 0,
        failed: 0
      });
    }

    const wantDiagnostics =
      String(req.query?.diagnostics ?? req.body?.diagnostics ?? "").trim() === "1";
    const limitRaw = Number.parseInt(String(req.query?.limit ?? req.body?.limit ?? ""), 10);

    try {
      const result = await processQueuedAiTakeoffJobs({
        supabase,
        env,
        limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
        staleMs: readTakeoffWorkerStaleMs(env)
      });
      const body = {
        ok: true,
        claimed: Number(result.claimed) || 0,
        processed: Number(result.processed) || 0,
        failed: Number(result.failed) || 0,
        skipped: Boolean(result.skipped),
        code: result.code || null,
        candidateCount: result.candidateCount ?? 0,
        route: ROUTE,
        method: String(req.method || "GET").toUpperCase()
      };
      if (wantDiagnostics) {
        body.diagnostics = await buildTakeoffWorkerDiagnostics(supabase, env);
      }
      return res.status(200).json(body);
    } catch (e) {
      console.error("[takeoff-internal] process-queued failed", e?.code || e?.message);
      return res.status(500).json({
        ok: false,
        error: "Unable to process queued takeoff jobs",
        code: e?.code || "process_queued_failed",
        claimed: 0,
        processed: 0,
        failed: 0
      });
    }
  }

  app.get(ROUTE, handler);
  app.post(ROUTE, handler);

  return { mounted: true, route: ROUTE };
}
