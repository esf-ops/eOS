/**
 * Durable AI takeoff generation worker — reclaim stuck/queued jobs after Vercel 202.
 *
 * waitUntil is best-effort; extraction may die when the serverless invocation ends.
 * This claimer runs via cron (or manual internal call) and completes durable work.
 */
import { randomUUID } from "node:crypto";
import { runAiTakeoffExtraction } from "./takeoffExtractionService.mjs";
import { readExtractionConfig } from "./takeoffAiProvider.mjs";
import {
  PROCESSING_PHASES,
  buildProcessingStatus,
  mergeProcessingMeta
} from "./takeoffProcessOrchestrator.mjs";

const JOB_STATUS_PROCESSING = "processing";
const JOB_STATUS_FAILED = "failed";
const JOB_STATUS_COMPLETED = "completed";

const DEFAULT_STALE_MS = 90_000;
const DEFAULT_LIMIT = 2;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readTakeoffWorkerStaleMs(env = process.env) {
  const n = Number.parseInt(String(env.TAKEOFF_AI_STALE_MS ?? ""), 10);
  return Number.isFinite(n) && n >= 15_000 ? n : DEFAULT_STALE_MS;
}

/**
 * True when a processing AI job should be claimed/retried.
 * @param {object} job
 * @param {{ now?: number, staleMs?: number }} [opts]
 */
export function isStaleAiGenerationJob(job, opts = {}) {
  const now = opts.now ?? Date.now();
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  if (String(job?.status ?? "") !== JOB_STATUS_PROCESSING) return false;
  const proc = buildProcessingStatus(job);
  if (proc.mode && proc.mode !== "ai_generate") return false;
  const phase = String(proc.phase || proc.asyncStatus || "").toLowerCase();
  if (phase === PROCESSING_PHASES.DONE || phase === "done") return false;
  if (phase === "failed") return false;

  const startedRaw =
    proc.startedAt || job.started_at || job.updated_at || job.created_at || null;
  const startedMs = startedRaw ? Date.parse(String(startedRaw)) : NaN;
  if (!Number.isFinite(startedMs)) {
    // Missing timestamps — treat queued/processing as claimable.
    return phase === PROCESSING_PHASES.QUEUED || phase === "queued" || !phase;
  }
  const age = now - startedMs;
  if (phase === PROCESSING_PHASES.QUEUED || phase === "queued") {
    return age >= Math.min(15_000, staleMs);
  }
  return age >= staleMs;
}

async function markFailed(supabase, job, message) {
  const safeMsg = String(message ?? "AI generation failed").slice(0, 500);
  const metadata = mergeProcessingMeta(job.metadata, {
    phase: "failed",
    phaseLabel: "Generation failed",
    asyncStatus: "failed",
    error: safeMsg,
    completedAt: new Date().toISOString()
  });
  await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_FAILED,
      error_message: safeMsg,
      metadata,
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);
}

async function advancePhase(supabase, job, phase, extra = {}) {
  const metadata = mergeProcessingMeta(job.metadata, {
    phase,
    phaseLabel: phase,
    asyncStatus: phase,
    ...extra
  });
  await supabase
    .from("quote_takeoff_jobs")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);
  job.metadata = metadata;
}

/**
 * Claim one job for worker execution (optimistic).
 * @returns {Promise<object|null>} claimed job or null
 */
export async function claimAiGenerationJob(supabase, job, claimToken) {
  const proc = buildProcessingStatus(job);
  const metadata = mergeProcessingMeta(job.metadata, {
    claimToken,
    claimedAt: new Date().toISOString(),
    phase: PROCESSING_PHASES.QUEUED,
    asyncStatus: PROCESSING_PHASES.QUEUED,
    mode: "ai_generate",
    runId: proc.runId || randomUUID()
  });
  const { data, error } = await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_PROCESSING,
      metadata,
      error_message: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id)
    .eq("status", JOB_STATUS_PROCESSING)
    .select("id,organization_id,quote_file_id,status,review_status,metadata,started_at,updated_at")
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * List candidate processing jobs (bounded), filter stale in memory.
 */
export async function listStaleAiGenerationJobs(supabase, { limit = 20, staleMs } = {}) {
  const { data, error } = await supabase
    .from("quote_takeoff_jobs")
    .select(
      "id,organization_id,quote_file_id,status,review_status,metadata,started_at,updated_at,created_at,error_message"
    )
    .eq("status", JOB_STATUS_PROCESSING)
    .order("updated_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) {
    throw Object.assign(new Error(error.message), { statusCode: 503, code: "takeoff_worker_list_failed" });
  }
  const now = Date.now();
  return (data || []).filter((job) => isStaleAiGenerationJob(job, { now, staleMs }));
}

/**
 * Process up to `limit` stale/queued AI generation jobs.
 *
 * @param {{
 *   supabase: object,
 *   limit?: number,
 *   staleMs?: number,
 *   env?: NodeJS.ProcessEnv,
 *   runExtraction?: typeof runAiTakeoffExtraction
 * }} deps
 */
export async function processQueuedAiTakeoffJobs(deps) {
  const env = deps.env ?? process.env;
  const supabase = deps.supabase;
  const limit = Math.min(Math.max(Number(deps.limit) || DEFAULT_LIMIT, 1), 5);
  const staleMs = deps.staleMs ?? readTakeoffWorkerStaleMs(env);
  const runExtraction = deps.runExtraction || runAiTakeoffExtraction;

  const aiConfig = readExtractionConfig(env);
  if (!aiConfig.enabled) {
    return {
      ok: true,
      skipped: true,
      code: "takeoff_ai_disabled",
      processed: 0,
      attempts: []
    };
  }
  if (!aiConfig.apiKey) {
    return {
      ok: true,
      skipped: true,
      code: "takeoff_ai_key_missing",
      processed: 0,
      attempts: []
    };
  }

  const candidates = await listStaleAiGenerationJobs(supabase, {
    limit: Math.max(limit * 3, 10),
    staleMs
  });

  const attempts = [];
  let processed = 0;

  for (const job of candidates) {
    if (processed >= limit) break;
    if (String(job.review_status ?? "").toLowerCase() === "approved") {
      attempts.push({
        takeoffJobId: job.id,
        skipped: true,
        code: "takeoff_already_approved"
      });
      continue;
    }

    const claimToken = randomUUID();
    const claimed = await claimAiGenerationJob(supabase, job, claimToken);
    if (!claimed) {
      attempts.push({ takeoffJobId: job.id, skipped: true, code: "claim_lost" });
      continue;
    }

    processed += 1;
    try {
      await runExtraction({
        supabase,
        organizationId: claimed.organization_id,
        userId: null,
        takeoffJobId: claimed.id,
        onPhase: async (phase) => {
          await advancePhase(supabase, claimed, phase);
        }
      });
      await advancePhase(supabase, claimed, PROCESSING_PHASES.DONE, {
        completedAt: new Date().toISOString()
      });
      // Extraction sets job completed; ensure status if not.
      await supabase
        .from("quote_takeoff_jobs")
        .update({
          status: JOB_STATUS_COMPLETED,
          updated_at: new Date().toISOString()
        })
        .eq("id", claimed.id)
        .eq("organization_id", claimed.organization_id)
        .neq("status", JOB_STATUS_FAILED);

      attempts.push({
        takeoffJobId: claimed.id,
        ok: true,
        status: JOB_STATUS_COMPLETED
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[takeoffGenerationWorker] job ${claimed.id} failed:`, message);
      await markFailed(supabase, claimed, message);
      attempts.push({
        takeoffJobId: claimed.id,
        ok: false,
        code: "generation_failed",
        message: message.slice(0, 200)
      });
    }
  }

  return {
    ok: true,
    skipped: false,
    processed,
    candidateCount: candidates.length,
    attempts,
    staleMs
  };
}
