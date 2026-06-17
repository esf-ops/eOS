/**
 * takeoffProcessOrchestrator — async takeoff processing lifecycle (Phase E).
 *
 * DB-backed state machine on quote_takeoff_jobs.status + metadata.processing.
 * No live AI calls. Stub completion only when TAKEOFF_ASYNC_STUB=1 and not production.
 *
 * Production without TAKEOFF_ASYNC_WORKER_ENABLED=1 → worker_not_configured (503).
 */
import { randomUUID } from "node:crypto";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";
import { planTakeoffImport } from "./takeoffImportPlanner.mjs";
import { TAKEOFF_SCHEMA_VERSION } from "./takeoffContract.mjs";
import { buildSpec73Fixture } from "./fixtures/spec73.fixture.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const JOB_STATUS_PROCESSING = "processing";
const JOB_STATUS_COMPLETED = "completed";
const JOB_STATUS_FAILED = "failed";
const JOB_STATUS_PENDING = "pending";

export const PROCESSING_PHASES = Object.freeze({
  QUEUED: "queued",
  DOWNLOAD: "download",
  PAGE_INVENTORY: "page_inventory",
  DIMENSION_EVIDENCE: "dimension_evidence",
  EXTRACTION: "extraction",
  NORMALIZE: "normalize",
  PERSIST: "persist",
  DONE: "done",
});

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

function orchestratorError(message, statusCode = 400, extra = {}) {
  const e = new Error(message);
  e.statusCode = statusCode;
  Object.assign(e, extra);
  return e;
}

/**
 * @returns {{ stubEnabled: boolean, workerEnabled: boolean, asyncStartAllowed: boolean }}
 */
export function readTakeoffAsyncConfig() {
  const nodeEnv = String(process.env.NODE_ENV ?? "").trim();
  const stubFlag = String(process.env.TAKEOFF_ASYNC_STUB ?? "").trim() === "1";
  const stubEnabled = stubFlag && nodeEnv !== "production";
  const workerEnabled = String(process.env.TAKEOFF_ASYNC_WORKER_ENABLED ?? "").trim() === "1";
  return {
    stubEnabled,
    workerEnabled,
    asyncStartAllowed: stubEnabled || workerEnabled,
  };
}

/**
 * Build safe processing status for API responses from a job row.
 *
 * @param {Record<string, unknown>|null|undefined} jobRow
 * @returns {{
 *   asyncStatus: string|null,
 *   phase: string|null,
 *   phaseLabel: string|null,
 *   pageProgress: { current: number, total: number }|null,
 *   runId: string|null,
 *   mode: string|null,
 *   startedAt: string|null,
 *   updatedAt: string|null,
 *   completedAt: string|null,
 *   error: string|null,
 *   attempt: number|null,
 * }}
 */
export function buildProcessingStatus(jobRow) {
  if (!jobRow) {
    return {
      asyncStatus: null,
      phase: null,
      phaseLabel: null,
      pageProgress: null,
      runId: null,
      mode: null,
      startedAt: null,
      updatedAt: null,
      completedAt: null,
      error: null,
      attempt: null,
    };
  }

  const meta =
    typeof jobRow.metadata === "object" && jobRow.metadata !== null ? jobRow.metadata : {};
  const proc =
    typeof meta.processing === "object" && meta.processing !== null ? meta.processing : null;

  const jobStatus = String(jobRow.status ?? "");
  const asyncStatus =
    proc?.asyncStatus ??
    (jobStatus === JOB_STATUS_PROCESSING
      ? PROCESSING_PHASES.QUEUED
      : jobStatus === JOB_STATUS_COMPLETED
        ? PROCESSING_PHASES.DONE
        : jobStatus === JOB_STATUS_FAILED
          ? "failed"
          : null);

  const safeError =
    jobStatus === JOB_STATUS_FAILED
      ? String(proc?.error ?? jobRow.error_message ?? "").slice(0, 500) || null
      : proc?.error != null
        ? String(proc.error).slice(0, 500)
        : null;

  const pageProgress =
    proc?.pageProgress &&
    typeof proc.pageProgress === "object" &&
    proc.pageProgress !== null
      ? {
          current: Number(proc.pageProgress.current ?? 0),
          total: Number(proc.pageProgress.total ?? 0),
        }
      : null;

  return {
    asyncStatus,
    phase: proc?.phase ?? asyncStatus,
    phaseLabel: proc?.phaseLabel ?? (proc?.phase ? PHASE_LABELS[proc.phase] ?? null : null),
    pageProgress,
    runId: proc?.runId ?? null,
    mode: proc?.mode ?? null,
    startedAt: proc?.startedAt ?? null,
    updatedAt: proc?.updatedAt ?? null,
    completedAt: proc?.completedAt ?? null,
    error: safeError,
    attempt: proc?.attempt != null ? Number(proc.attempt) : null,
  };
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
    throw orchestratorError("Takeoff job not found", 404);
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

function mergeProcessingMeta(existingMeta, processingPatch) {
  const base = typeof existingMeta === "object" && existingMeta !== null ? existingMeta : {};
  const prev =
    typeof base.processing === "object" && base.processing !== null ? base.processing : {};
  const now = new Date().toISOString();
  const next = {
    ...prev,
    ...processingPatch,
    updatedAt: now,
  };
  if (!next.startedAt && processingPatch.phase === PROCESSING_PHASES.QUEUED) {
    next.startedAt = now;
  }
  return { ...base, processing: next };
}

async function advancePhase(supabase, job, phase, extra = {}) {
  const processingPatch = {
    phase,
    phaseLabel: PHASE_LABELS[phase] ?? phase,
    asyncStatus: phase,
    ...extra,
  };
  await updateJob(supabase, job.id, job.organization_id, {
    metadata: mergeProcessingMeta(job.metadata, processingPatch),
  });
  job.metadata = mergeProcessingMeta(job.metadata, processingPatch);
}

/**
 * Stub pipeline — deterministic phases, Spec 73 fixture, no provider HTTP.
 * Only invoked when readTakeoffAsyncConfig().stubEnabled is true.
 */
export async function runStubTakeoffPipeline({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  job,
  runId,
}) {
  const phases = [
    PROCESSING_PHASES.DOWNLOAD,
    PROCESSING_PHASES.PAGE_INVENTORY,
    PROCESSING_PHASES.DIMENSION_EVIDENCE,
    PROCESSING_PHASES.EXTRACTION,
    PROCESSING_PHASES.NORMALIZE,
    PROCESSING_PHASES.PERSIST,
  ];

  try {
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      await advancePhase(supabase, job, phase, {
        runId,
        mode: "stub",
        attempt: 1,
        pageProgress: { current: i + 1, total: phases.length },
      });
    }

    const normalized = buildSpec73Fixture();
    normalized.status = "draft";
    const computed = computeTakeoffMeasurements(normalized);
    const validation = validateTakeoffResult(normalized, computed);
    const importPlan = planTakeoffImport(normalized, computed);
    const now = new Date().toISOString();
    const schemaVersion = normalized.schemaVersion ?? TAKEOFF_SCHEMA_VERSION;

    const summary = {
      countertopExactSf: computed.countertopExactSf,
      backsplashExactSf: computed.backsplashExactSf,
      combinedExactSf: computed.combinedExactSf,
      chargeableCountertopSf: computed.chargeableCountertopSf,
      chargeableBacksplashSf: computed.chargeableBacksplashSf,
      roomCount: normalized.rooms.length,
      errorCount: validation.errorCount,
      warningCount: validation.warningCount,
      canImport: importPlan.canImport,
    };

    const rawAiJson = {
      _meta: {
        mode: "stub",
        promptVersion: "stub-v1",
        provider: "stub",
        modelUsed: "stub-fixture-spec73",
        savedAt: now,
        stub: true,
      },
    };

    const resultPayload = {
      organization_id: organizationId,
      takeoff_job_id: takeoffJobId,
      schema_version: schemaVersion,
      raw_ai_result_json: rawAiJson,
      normalized_takeoff_json: normalized,
      computed_measurements_json: computed,
      validation_diagnostics_json: validation,
      import_plan_json: importPlan,
      review_status: "needs_review",
      needs_review: true,
      reviewed_by_user_id: null,
      reviewed_at: null,
    };

    let resultRowId = null;
    const { data: resultRows, error: insertErr } = await supabase
      .from("quote_takeoff_results")
      .insert(resultPayload)
      .select();

    if (!insertErr && resultRows?.length) {
      resultRowId = resultRows[0].id;
    } else if (insertErr) {
      const isNotNullViolation =
        insertErr.code === "23502" ||
        String(insertErr.message ?? "").includes("null value in column");
      if (!isNotNullViolation) {
        throw new Error(`Failed to save stub result: ${insertErr.message}`);
      }
    }

    const completedProcessing = mergeProcessingMeta(job.metadata, {
      runId,
      mode: "stub",
      phase: PROCESSING_PHASES.DONE,
      phaseLabel: PHASE_LABELS[PROCESSING_PHASES.DONE],
      asyncStatus: PROCESSING_PHASES.DONE,
      completedAt: now,
      pageProgress: { current: phases.length, total: phases.length },
      error: null,
    });

    await updateJob(supabase, takeoffJobId, organizationId, {
      status: JOB_STATUS_COMPLETED,
      review_status: "needs_review",
      error_message: null,
      completed_at: now,
      started_at: job.started_at ?? now,
      metadata: completedProcessing,
      result_summary: {
        ...summary,
        savedAt: now,
        schemaVersion,
        reviewStatus: "needs_review",
        modelUsed: "stub-fixture-spec73",
        promptVersion: "stub-v1",
        aiExtraction: false,
        stubProcessing: true,
        normalizedTakeoffJson: normalized,
        computedMeasurementsJson: computed,
        validationDiagnosticsJson: validation,
        importPlanJson: importPlan,
        resultRowId: resultRowId ?? null,
      },
    });

    return {
      ok: true,
      status: JOB_STATUS_COMPLETED,
      reviewStatus: "needs_review",
      resultRowId: resultRowId ?? null,
      processing: buildProcessingStatus({
        status: JOB_STATUS_COMPLETED,
        metadata: completedProcessing,
        error_message: null,
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const failedMeta = mergeProcessingMeta(job.metadata, {
      runId,
      mode: "stub",
      phase: PROCESSING_PHASES.DONE,
      asyncStatus: "failed",
      error: msg.slice(0, 500),
    });
    await updateJob(supabase, takeoffJobId, organizationId, {
      status: JOB_STATUS_FAILED,
      error_message: msg.slice(0, 500),
      metadata: failedMeta,
    });
    throw orchestratorError(`Stub processing failed: ${msg}`, 500, { code: "processing_failed" });
  }
}

/**
 * Start async takeoff processing for a workspace.
 *
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   userId: string|null,
 *   takeoffJobId: string,
 *   asyncConfig?: ReturnType<typeof readTakeoffAsyncConfig>,
 * }} params
 */
export async function startTakeoffProcessing({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  asyncConfig = readTakeoffAsyncConfig(),
}) {
  if (!isUuid(organizationId)) {
    throw orchestratorError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw orchestratorError("takeoffJobId must be a valid UUID");
  }

  if (!asyncConfig.asyncStartAllowed) {
    throw orchestratorError(
      "Async takeoff worker is not configured on this server. " +
        "Use Generate AI takeoff draft (sync) or enable TAKEOFF_ASYNC_WORKER_ENABLED for a future worker.",
      503,
      { code: "worker_not_configured" }
    );
  }

  const job = await loadJobRow(supabase, organizationId, takeoffJobId);

  if (!job.quote_file_id) {
    throw orchestratorError(
      "This takeoff job has no source file. Upload a plan file first.",
      400
    );
  }

  if (String(job.status) === JOB_STATUS_PROCESSING) {
    const proc = buildProcessingStatus(job);
    if (proc.runId) {
      throw orchestratorError(
        "This takeoff is already processing.",
        409,
        { code: "already_processing", processing: proc }
      );
    }
  }

  const runId = randomUUID();
  const now = new Date().toISOString();
  const mode = asyncConfig.stubEnabled ? "stub" : "worker";

  const queuedMeta = mergeProcessingMeta(job.metadata, {
    runId,
    mode,
    attempt: 1,
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
    started_at: job.started_at ?? now,
    metadata: queuedMeta,
  });

  job.metadata = queuedMeta;
  job.status = JOB_STATUS_PROCESSING;

  const processing = buildProcessingStatus(job);

  if (asyncConfig.stubEnabled) {
    const completed = await runStubTakeoffPipeline({
      supabase,
      organizationId,
      userId,
      takeoffJobId,
      job,
      runId,
    });
    return {
      ok: true,
      accepted: true,
      takeoffJobId,
      status: completed.status,
      reviewStatus: completed.reviewStatus,
      resultRowId: completed.resultRowId,
      processing: completed.processing,
      mode: "stub",
    };
  }

  // Worker mode: job stays processing until an external worker claims it (Phase F).
  return {
    ok: true,
    accepted: true,
    takeoffJobId,
    status: JOB_STATUS_PROCESSING,
    reviewStatus: job.review_status ?? "needs_review",
    processing,
    mode: "worker",
    message:
      "Processing queued. A background worker will complete this takeoff when configured.",
  };
}
