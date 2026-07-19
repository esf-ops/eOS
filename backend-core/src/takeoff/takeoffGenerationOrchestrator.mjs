/**
 * takeoffGenerationOrchestrator — async AI takeoff generation (production-safe).
 *
 * POST /api/takeoff-jobs/:id/generate-ai-draft returns 202 quickly on Vercel and runs
 * runAiTakeoffExtraction in a background continuation via @vercel/functions waitUntil.
 *
 * Sync mode (local/tests): TAKEOFF_GENERATE_SYNC=1 or non-Vercel without TAKEOFF_GENERATE_ASYNC=1.
 */
import { randomUUID } from "node:crypto";
import { readExtractionConfig } from "./takeoffAiProvider.mjs";
import { runAiTakeoffExtraction } from "./takeoffExtractionService.mjs";
import {
  PROCESSING_PHASES,
  buildProcessingStatus,
  mergeProcessingMeta,
} from "./takeoffProcessOrchestrator.mjs";
import { syncIntakeTakeoffLinkFromJob } from "./intakeTakeoffLinkStatus.mjs";
import { isClaimableAiGenerationJob, readTakeoffWorkerStaleMs } from "./takeoffGenerationWorker.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_STATUS_PROCESSING = "processing";
const JOB_STATUS_FAILED = "failed";

const PHASE_LABELS = Object.freeze({
  [PROCESSING_PHASES.QUEUED]: "Queued",
  [PROCESSING_PHASES.DOWNLOAD]: "Preparing plan file",
  [PROCESSING_PHASES.PAGE_INVENTORY]: "Classifying plan pages",
  [PROCESSING_PHASES.DIMENSION_EVIDENCE]: "Extracting dimension evidence",
  [PROCESSING_PHASES.EXTRACTION]: "Extracting measurements",
  [PROCESSING_PHASES.NORMALIZE]: "Recomputing with eliteOS",
  [PROCESSING_PHASES.PERSIST]: "Saving takeoff result",
  [PROCESSING_PHASES.DONE]: "Complete",
});

function isUuid(v) {
  return UUID_RE.test(String(v ?? "").trim());
}

function generationError(message, statusCode = 400, extra = {}) {
  const e = new Error(message);
  e.statusCode = statusCode;
  Object.assign(e, extra);
  return e;
}

/**
 * @returns {{ asyncEnabled: boolean }}
 */
export function readTakeoffGenerateConfig() {
  const syncForced = String(process.env.TAKEOFF_GENERATE_SYNC ?? "").trim() === "1";
  const asyncForced = String(process.env.TAKEOFF_GENERATE_ASYNC ?? "").trim() === "1";
  const onVercel = String(process.env.VERCEL ?? "").trim() === "1";
  return {
    asyncEnabled: !syncForced && (asyncForced || onVercel),
  };
}

/**
 * Schedule work after the HTTP response is sent (Vercel) or fire-and-forget locally.
 *
 * @param {() => Promise<void>} work
 */
export async function scheduleBackgroundWork(work) {
  try {
    const mod = await import("@vercel/functions");
    if (typeof mod.waitUntil === "function") {
      mod.waitUntil(
        work().catch((err) => {
          console.error("[takeoffGeneration] background work failed:", err);
        })
      );
      return;
    }
  } catch {
    // @vercel/functions unavailable — local dev / tests
  }
  void work().catch((err) => {
    console.error("[takeoffGeneration] background work failed:", err);
  });
}

async function loadJobRow(supabase, organizationId, takeoffJobId) {
  const { data: rows, error } = await supabase
    .from("quote_takeoff_jobs")
    .select(
      "id,organization_id,quote_file_id,status,review_status,metadata,error_message,started_at"
    )
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (error) {
    throw Object.assign(new Error(`DB error loading job: ${error.message}`), { statusCode: 503 });
  }
  if (!rows?.length) {
    throw generationError("Takeoff job not found", 404);
  }
  return rows[0];
}

async function updateJob(supabase, takeoffJobId, organizationId, fields) {
  await supabase
    .from("quote_takeoff_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);
}

async function advanceGenerationPhase(supabase, job, phase, extra = {}) {
  const processingPatch = {
    phase,
    phaseLabel: PHASE_LABELS[phase] ?? phase,
    asyncStatus: phase,
    ...extra,
  };
  const metadata = mergeProcessingMeta(job.metadata, processingPatch);
  await updateJob(supabase, job.id, job.organization_id, { metadata });
  job.metadata = metadata;
}

async function markGenerationFailed(supabase, job, message) {
  const safeMsg = String(message ?? "AI generation failed").slice(0, 500);
  const metadata = mergeProcessingMeta(job.metadata, {
    phase: "failed",
    phaseLabel: "Generation failed",
    asyncStatus: "failed",
    error: safeMsg,
    completedAt: new Date().toISOString(),
  });
  await updateJob(supabase, job.id, job.organization_id, {
    status: JOB_STATUS_FAILED,
    error_message: safeMsg,
    metadata,
  });
  job.metadata = metadata;
  job.status = JOB_STATUS_FAILED;
}

async function validateGenerationPreconditions(supabase, organizationId, takeoffJobId) {
  if (!isUuid(organizationId)) {
    throw generationError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw generationError("takeoffJobId must be a valid UUID");
  }

  const config = readExtractionConfig();
  if (!config.enabled) {
    throw generationError(
      "AI takeoff extraction is not enabled on this server. " +
        "Set TAKEOFF_AI_ENABLED=1 in the server environment.",
      403
    );
  }
  if (!config.apiKey) {
    const keyVar =
      config.providerName === "gemini"
        ? "GEMINI_API_KEY"
        : config.providerName === "exayard"
          ? "EXAYARD_API_KEY"
          : "OPENAI_API_KEY";
    throw generationError(
      `${keyVar} is not configured on this server. Set ${keyVar} in the server environment.`,
      503
    );
  }

  const job = await loadJobRow(supabase, organizationId, takeoffJobId);

  if (!job.quote_file_id) {
    throw generationError(
      "This takeoff job has no source file. Upload a plan file first, then generate.",
      400
    );
  }

  if (String(job.review_status ?? "").toLowerCase() === "approved") {
    throw generationError(
      "This takeoff is already approved. Confirmed geometry cannot be replaced by AI.",
      409,
      { code: "takeoff_already_approved" }
    );
  }

  if (String(job.status) === JOB_STATUS_PROCESSING) {
    const proc = buildProcessingStatus(job);
    if (proc.runId && proc.mode === "ai_generate") {
      const staleMs = readTakeoffWorkerStaleMs(process.env);
      if (isClaimableAiGenerationJob(job, { staleMs })) {
        // Allow reclaim / restart after waitUntil or worker death.
        return { job, config, reclaimStale: true };
      }
      // Idempotent: treat in-flight generation as success for retries / auto-bootstrap.
      const err = generationError("This takeoff is already generating.", 409, {
        code: "already_processing",
        processing: proc,
      });
      err.idempotentReuse = {
        ok: true,
        accepted: true,
        reused: true,
        takeoffJobId,
        runId: proc.runId,
        status: JOB_STATUS_PROCESSING,
        reviewStatus: job.review_status ?? "needs_review",
        processing: proc,
        mode: "ai_generate",
        message: "AI Takeoff is already processing. You may continue building the estimate.",
      };
      throw err;
    }
  }

  return { job, config };
}

/**
 * Queue AI generation and return immediately (202 payload shape).
 *
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   userId: string|null,
 *   takeoffJobId: string,
 *   scheduleFn?: typeof scheduleBackgroundWork,
 * }} params
 */
export async function startAiTakeoffGeneration({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  scheduleFn = scheduleBackgroundWork,
}) {
  let job;
  try {
    ({ job } = await validateGenerationPreconditions(supabase, organizationId, takeoffJobId));
  } catch (e) {
    if (e?.code === "already_processing" && e.idempotentReuse) {
      return e.idempotentReuse;
    }
    throw e;
  }

  const runId = randomUUID();
  const now = new Date().toISOString();
  const prevAttempt = buildProcessingStatus(job).attempt ?? 0;

  const queuedMeta = mergeProcessingMeta(job.metadata, {
    runId,
    mode: "ai_generate",
    attempt: prevAttempt + 1,
    phase: PROCESSING_PHASES.QUEUED,
    phaseLabel: PHASE_LABELS[PROCESSING_PHASES.QUEUED],
    asyncStatus: PROCESSING_PHASES.QUEUED,
    startedAt: now,
    completedAt: null,
    error: null,
    pageProgress: { current: 0, total: 0 },
  });

  await updateJob(supabase, takeoffJobId, organizationId, {
    status: JOB_STATUS_PROCESSING,
    error_message: null,
    started_at: now,
    metadata: queuedMeta,
  });

  job.metadata = queuedMeta;
  job.status = JOB_STATUS_PROCESSING;
  await syncIntakeTakeoffLinkFromJob(supabase, job);

  const work = async () => {
    try {
      await runAiTakeoffExtraction({
        supabase,
        organizationId,
        userId,
        takeoffJobId,
        onPhase: async (phase) => {
          await advanceGenerationPhase(supabase, job, phase);
        },
      });
      await advanceGenerationPhase(supabase, job, PROCESSING_PHASES.DONE, {
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[takeoffGeneration] job ${takeoffJobId} failed:`, err);
      if (String(job.status) !== JOB_STATUS_FAILED) {
        await markGenerationFailed(
          supabase,
          job,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  };

  await scheduleFn(work);

  const processing = buildProcessingStatus(job);
  return {
    ok: true,
    accepted: true,
    takeoffJobId,
    runId,
    status: JOB_STATUS_PROCESSING,
    reviewStatus: job.review_status ?? "needs_review",
    processing,
    mode: "ai_generate",
    message: "AI takeoff generation started. Poll GET /api/takeoff-jobs/:id for status.",
  };
}
