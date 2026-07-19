/**
 * Durable AI takeoff generation worker — claim queued/stale jobs after Vercel 202.
 *
 * waitUntil is best-effort. Cron GET/POST /api/internal/takeoff/process-queued
 * must claim jobs with metadata.processing.phase=queued immediately (no delay).
 */
import { randomUUID } from "node:crypto";
import { runAiTakeoffExtraction } from "./takeoffExtractionService.mjs";
import { readExtractionConfig } from "./takeoffAiProvider.mjs";
import {
  PROCESSING_PHASES,
  buildProcessingStatus,
  mergeProcessingMeta
} from "./takeoffProcessOrchestrator.mjs";
import { syncIntakeTakeoffLinkFromJob } from "./intakeTakeoffLinkStatus.mjs";

const JOB_STATUS_PROCESSING = "processing";
const JOB_STATUS_FAILED = "failed";
const JOB_STATUS_COMPLETED = "completed";
const JOB_STATUS_PENDING = "pending";
const JOB_STATUS_QUEUED = "queued";

const DEFAULT_STALE_MS = 90_000;
const DEFAULT_LIMIT = 2;

/** In-process diagnostics for the last worker tick (staff-safe). */
let lastWorkerOutcome = {
  at: null,
  outcome: "never_run",
  claimed: 0,
  processed: 0,
  failed: 0
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readTakeoffWorkerStaleMs(env = process.env) {
  const n = Number.parseInt(String(env.TAKEOFF_AI_STALE_MS ?? ""), 10);
  return Number.isFinite(n) && n >= 5_000 ? n : DEFAULT_STALE_MS;
}

/**
 * True when a job should be claimed now.
 * Queued/pending phase → immediate. Active extraction → only when stale.
 *
 * @param {object} job
 * @param {{ now?: number, staleMs?: number }} [opts]
 */
export function isClaimableAiGenerationJob(job, opts = {}) {
  const now = opts.now ?? Date.now();
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const status = String(job?.status ?? "").toLowerCase();
  if (
    status !== JOB_STATUS_PROCESSING &&
    status !== JOB_STATUS_PENDING &&
    status !== JOB_STATUS_QUEUED
  ) {
    return false;
  }

  const proc = buildProcessingStatus(job);
  const mode = String(proc.mode || "").toLowerCase();
  // Auto-bootstrap / generate always set mode=ai_generate. Allow missing mode for
  // pending/queued statuses and for processing with a runId.
  if (mode && mode !== "ai_generate") return false;

  const phase = String(proc.phase || proc.asyncStatus || "").toLowerCase();
  if (phase === PROCESSING_PHASES.DONE || phase === "done") return false;

  // Immediate claim for newly queued work (do NOT wait 15s).
  if (
    status === JOB_STATUS_PENDING ||
    status === JOB_STATUS_QUEUED ||
    phase === PROCESSING_PHASES.QUEUED ||
    phase === "queued" ||
    !phase
  ) {
    return true;
  }

  const startedRaw =
    proc.claimedAt || proc.startedAt || job.started_at || job.updated_at || job.created_at || null;
  const startedMs = startedRaw ? Date.parse(String(startedRaw)) : NaN;
  if (!Number.isFinite(startedMs)) return true;
  return now - startedMs >= staleMs;
}

/** @deprecated use isClaimableAiGenerationJob */
export function isStaleAiGenerationJob(job, opts = {}) {
  return isClaimableAiGenerationJob(job, opts);
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
  job.metadata = metadata;
  job.status = JOB_STATUS_FAILED;
  await syncIntakeTakeoffLinkFromJob(supabase, job);
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
 * Atomic claim: only succeeds if still claimable (no fresh claimToken).
 * @returns {Promise<object|null>}
 */
export async function claimAiGenerationJob(supabase, job, claimToken) {
  const proc = buildProcessingStatus(job);
  const existingClaim = String(proc.claimToken || "").trim();
  const claimedAtMs = proc.claimedAt ? Date.parse(String(proc.claimedAt)) : NaN;
  const claimAge = Number.isFinite(claimedAtMs) ? Date.now() - claimedAtMs : Infinity;
  // Another worker claimed recently — skip (idempotent).
  if (existingClaim && claimAge < 60_000 && String(proc.phase || "") !== "queued") {
    return null;
  }

  const now = new Date().toISOString();
  const metadata = mergeProcessingMeta(job.metadata, {
    claimToken,
    claimedAt: now,
    phase: PROCESSING_PHASES.DOWNLOAD,
    phaseLabel: "Claimed by worker",
    asyncStatus: PROCESSING_PHASES.DOWNLOAD,
    mode: "ai_generate",
    runId: proc.runId || randomUUID(),
    error: null
  });

  let query = supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_PROCESSING,
      metadata,
      error_message: null,
      started_at: job.started_at ?? now,
      updated_at: now
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id)
    .in("status", [JOB_STATUS_PROCESSING, JOB_STATUS_PENDING, JOB_STATUS_QUEUED]);

  const { data, error } = await query
    .select("id,organization_id,quote_file_id,status,review_status,metadata,started_at,updated_at")
    .maybeSingle();

  if (error || !data) return null;
  // Verify our claim won if concurrent updates race on metadata.
  const won = data.metadata?.processing?.claimToken === claimToken;
  if (!won) return null;
  await syncIntakeTakeoffLinkFromJob(supabase, data);
  return data;
}

/**
 * List candidate jobs for worker claim.
 */
export async function listClaimableAiGenerationJobs(supabase, { limit = 20, staleMs } = {}) {
  const { data, error } = await supabase
    .from("quote_takeoff_jobs")
    .select(
      "id,organization_id,quote_file_id,status,review_status,metadata,started_at,updated_at,created_at,error_message"
    )
    .in("status", [JOB_STATUS_PROCESSING, JOB_STATUS_PENDING, JOB_STATUS_QUEUED])
    .order("updated_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) {
    throw Object.assign(new Error(error.message), {
      statusCode: 503,
      code: "takeoff_worker_list_failed"
    });
  }
  const now = Date.now();
  return (data || []).filter((job) => isClaimableAiGenerationJob(job, { now, staleMs }));
}

/** @deprecated */
export async function listStaleAiGenerationJobs(supabase, opts) {
  return listClaimableAiGenerationJobs(supabase, opts);
}

/**
 * Staff-safe diagnostics snapshot (no secrets / payloads).
 */
export async function buildTakeoffWorkerDiagnostics(supabase, env = process.env) {
  const ai = readExtractionConfig(env);
  let queuedCount = 0;
  let staleProcessingCount = 0;
  let processingCount = 0;
  try {
    const { data } = await supabase
      .from("quote_takeoff_jobs")
      .select("id,status,metadata,started_at,updated_at,created_at")
      .in("status", [JOB_STATUS_PROCESSING, JOB_STATUS_PENDING, JOB_STATUS_QUEUED])
      .limit(50);
    const rows = data || [];
    processingCount = rows.filter((r) => String(r.status) === JOB_STATUS_PROCESSING).length;
    const staleMs = readTakeoffWorkerStaleMs(env);
    for (const job of rows) {
      const proc = buildProcessingStatus(job);
      const phase = String(proc.phase || proc.asyncStatus || "").toLowerCase();
      if (
        phase === "queued" ||
        String(job.status) === JOB_STATUS_QUEUED ||
        String(job.status) === JOB_STATUS_PENDING
      ) {
        queuedCount += 1;
      } else if (isClaimableAiGenerationJob(job, { staleMs })) {
        staleProcessingCount += 1;
      }
    }
  } catch {
    /* counts stay 0 */
  }

  return {
    cronConfigured: Boolean(
      String(env.CRON_SECRET ?? env.EOS_CRON_SECRET ?? env.ELITEOS_CRON_SECRET ?? "").trim()
    ),
    workerRouteMounted: true,
    repositoryMode: "supabase",
    queuedCount,
    staleProcessingCount,
    processingCount,
    lastClaimAt: lastWorkerOutcome.at,
    lastRunOutcome: lastWorkerOutcome.outcome,
    lastClaimed: lastWorkerOutcome.claimed,
    lastProcessed: lastWorkerOutcome.processed,
    lastFailed: lastWorkerOutcome.failed,
    providerEnabled: Boolean(ai.enabled),
    providerKeyPresent: Boolean(ai.apiKey),
    providerName: ai.providerName || null
  };
}

/**
 * Process up to `limit` claimable AI generation jobs.
 */
export async function processQueuedAiTakeoffJobs(deps) {
  const env = deps.env ?? process.env;
  const supabase = deps.supabase;
  const limit = Math.min(Math.max(Number(deps.limit) || DEFAULT_LIMIT, 1), 5);
  const staleMs = deps.staleMs ?? readTakeoffWorkerStaleMs(env);
  const runExtraction = deps.runExtraction || runAiTakeoffExtraction;

  const aiConfig = readExtractionConfig(env);
  if (!aiConfig.enabled) {
    lastWorkerOutcome = {
      at: new Date().toISOString(),
      outcome: "skipped_ai_disabled",
      claimed: 0,
      processed: 0,
      failed: 0
    };
    return {
      ok: true,
      skipped: true,
      code: "takeoff_ai_disabled",
      claimed: 0,
      processed: 0,
      failed: 0,
      attempts: []
    };
  }
  if (!aiConfig.apiKey) {
    lastWorkerOutcome = {
      at: new Date().toISOString(),
      outcome: "skipped_key_missing",
      claimed: 0,
      processed: 0,
      failed: 0
    };
    return {
      ok: true,
      skipped: true,
      code: "takeoff_ai_key_missing",
      claimed: 0,
      processed: 0,
      failed: 0,
      attempts: []
    };
  }

  const candidates = await listClaimableAiGenerationJobs(supabase, {
    limit: Math.max(limit * 3, 10),
    staleMs
  });

  const attempts = [];
  let claimed = 0;
  let processed = 0;
  let failed = 0;

  for (const job of candidates) {
    if (claimed >= limit) break;
    if (String(job.review_status ?? "").toLowerCase() === "approved") {
      attempts.push({
        takeoffJobId: job.id,
        skipped: true,
        code: "takeoff_already_approved"
      });
      continue;
    }

    const claimToken = randomUUID();
    const claimedJob = await claimAiGenerationJob(supabase, job, claimToken);
    if (!claimedJob) {
      attempts.push({ takeoffJobId: job.id, skipped: true, code: "claim_lost" });
      continue;
    }
    claimed += 1;

    try {
      await runExtraction({
        supabase,
        organizationId: claimedJob.organization_id,
        userId: null,
        takeoffJobId: claimedJob.id,
        onPhase: async (phase) => {
          await advancePhase(supabase, claimedJob, phase);
        }
      });
      await advancePhase(supabase, claimedJob, PROCESSING_PHASES.DONE, {
        completedAt: new Date().toISOString()
      });
      await supabase
        .from("quote_takeoff_jobs")
        .update({
          status: JOB_STATUS_COMPLETED,
          updated_at: new Date().toISOString()
        })
        .eq("id", claimedJob.id)
        .eq("organization_id", claimedJob.organization_id)
        .neq("status", JOB_STATUS_FAILED);

      claimedJob.status = JOB_STATUS_COMPLETED;
      await syncIntakeTakeoffLinkFromJob(supabase, claimedJob);

      processed += 1;
      attempts.push({
        takeoffJobId: claimedJob.id,
        ok: true,
        status: JOB_STATUS_COMPLETED
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[takeoffGenerationWorker] job ${claimedJob.id} failed:`, message);
      await markFailed(supabase, claimedJob, message);
      failed += 1;
      attempts.push({
        takeoffJobId: claimedJob.id,
        ok: false,
        code: "generation_failed",
        message: message.slice(0, 200),
        retryable: true
      });
    }
  }

  const outcome =
    claimed === 0 ? "empty" : failed > 0 && processed === 0 ? "failed" : "processed";
  lastWorkerOutcome = {
    at: new Date().toISOString(),
    outcome,
    claimed,
    processed,
    failed
  };

  console.info(
    "[takeoffGenerationWorker]",
    JSON.stringify({
      outcome,
      claimed,
      processed,
      failed,
      candidateCount: candidates.length
    })
  );

  return {
    ok: true,
    skipped: false,
    claimed,
    processed,
    failed,
    candidateCount: candidates.length,
    attempts,
    staleMs
  };
}
