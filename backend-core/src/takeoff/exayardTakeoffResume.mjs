/**
 * exayardTakeoffResume — resume/check Exayard assessment polling for AI Takeoff Lab.
 *
 * Single GET /assessments/{id} per resume request — no synchronous poll loops.
 * Security: never logs API keys, Authorization headers, or presigned upload URLs.
 */
import crypto from "node:crypto";
import { QUOTE_FILE_BUCKET } from "../files/quoteFileStoragePath.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";
import { planTakeoffImport } from "./takeoffImportPlanner.mjs";
import { TAKEOFF_SCHEMA_VERSION } from "./takeoffContract.mjs";
import { evaluateTakeoffQaGate } from "./takeoffQaGate.mjs";
import { PROMPT_VERSION } from "./takeoffExtractionPrompt.mjs";
import {
  buildExayardSafeWorkflowMeta,
  checkExayardAssessmentOnce,
  pickSafeExayardJobMetadata,
} from "./exayardClient.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return UUID_RE.test(String(v ?? "").trim());
}

function resumeError(message, statusCode = 400, extra = {}) {
  const e = new Error(message);
  e.statusCode = statusCode;
  Object.assign(e, extra);
  return e;
}

async function setJobFields(supabase, takeoffJobId, organizationId, fields) {
  await supabase
    .from("quote_takeoff_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);
}

/**
 * Persist safe Exayard waiting metadata on quote_takeoff_jobs.
 *
 * @param {object} workflow  safe workflow/waiting metadata from buildExayardSafeWorkflowMeta
 */
export function buildExayardJobMetadataFromWorkflow(workflow) {
  const w = workflow && typeof workflow === "object" ? workflow : {};
  return pickSafeExayardJobMetadata({
    exayard: {
      provider:           "exayard",
      status:             w.status ?? "waiting_on_exayard",
      pausedStep:         w.pausedStep ?? w.failedStep ?? "poll_assessment",
      projectId:          w.projectId ?? null,
      fileId:             w.fileId ?? null,
      assessmentId:       w.assessmentId ?? null,
      retryAfterSeconds:  w.retryAfterSeconds ?? null,
      retryAfterAt:       w.retryAfterAt ?? null,
      exayardCode:        w.exayardCode ?? null,
      exayardRequestId:   w.exayardRequestId ?? null,
      updatedAt:          new Date().toISOString(),
    },
  })?.exayard ?? null;
}

/**
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   takeoffJobId: string,
 *   job: object,
 *   file: object|null,
 *   providerOutput: object,
 *   modelUsed?: string,
 * }} params
 */
export async function handleExayardWaitingState({
  supabase,
  organizationId,
  takeoffJobId,
  job,
  file,
  providerOutput,
  modelUsed = "exayard-platform",
}) {
  const now = new Date().toISOString();
  const workflow = providerOutput.exayardWorkflow ?? {};
  const exayardJobMeta = buildExayardJobMetadataFromWorkflow(workflow);

  await setJobFields(supabase, takeoffJobId, organizationId, {
    status:        "processing",
    review_status: "needs_review",
    error_message: null,
    metadata: {
      ...(job.metadata && typeof job.metadata === "object" ? job.metadata : {}),
      exayard: exayardJobMeta,
    },
    result_summary: {
      aiExtraction:    true,
      exayardStatus:   "waiting_on_exayard",
      exayardWorkflow: workflow,
      modelUsed,
      promptVersion:   PROMPT_VERSION,
      savedAt:         now,
      fileName:        file?.original_filename ?? null,
    },
  });

  return {
    ok:               true,
    exayardStatus:    "waiting_on_exayard",
    takeoffJobId,
    message:
      workflow.retryAfterAt
        ? "Exayard is still processing this assessment. Try again after the retry time."
        : "Exayard is still processing this assessment.",
    exayardWorkflow:  workflow,
    retryAfterAt:     workflow.retryAfterAt ?? null,
    retryAfterSeconds: workflow.retryAfterSeconds ?? null,
    exayardCode:      workflow.exayardCode ?? null,
    exayardRequestId: workflow.exayardRequestId ?? null,
    assessmentId:     workflow.assessmentId ?? null,
    canResumeExayard: Boolean(workflow.assessmentId),
    pausedStep:       workflow.pausedStep ?? "poll_assessment",
  };
}

/**
 * Save completed Exayard raw assessment as a takeoff result row.
 *
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   takeoffJobId: string,
 *   job: object,
 *   file: object,
 *   rawAssessment: object,
 *   exayardWorkflow: object,
 *   modelUsed?: string,
 * }} params
 */
export async function finalizeExayardRawCapture({
  supabase,
  organizationId,
  takeoffJobId,
  job,
  file,
  rawAssessment,
  exayardWorkflow,
  modelUsed = "exayard-platform",
}) {
  const now = new Date().toISOString();
  const normalized = {
    schemaVersion: TAKEOFF_SCHEMA_VERSION,
    id:            crypto.randomUUID(),
    status:        "draft",
    rooms:         [],
    confidence:    "low",
    projectAssumptions: [
      "Exayard raw result captured — normalization pending.",
      "Countertop measurements were not mapped into eliteOS TakeoffResult rooms yet.",
    ],
    source: {
      fileName: file.original_filename ?? null,
      provider: "exayard",
    },
  };

  const computed   = computeTakeoffMeasurements(normalized);
  const validation = validateTakeoffResult(normalized, computed, null);
  const importPlan = planTakeoffImport(normalized, computed);
  let qaGate = null;
  try {
    qaGate = evaluateTakeoffQaGate({
      takeoffResult:         normalized,
      computedMeasurements:  computed,
      validationDiagnostics: validation,
      dimensionEvidence:     null,
      pageInventory:         null,
    });
  } catch {
    qaGate = null;
  }

  const summary = {
    countertopExactSf:      computed.countertopExactSf,
    backsplashExactSf:      computed.backsplashExactSf,
    combinedExactSf:        computed.combinedExactSf,
    chargeableCountertopSf: computed.chargeableCountertopSf,
    chargeableBacksplashSf: computed.chargeableBacksplashSf,
    roomCount:              normalized.rooms.length,
    errorCount:             validation.errorCount,
    warningCount:           validation.warningCount,
    canImport:              importPlan.canImport,
  };

  const safeWorkflow = buildExayardSafeWorkflowMeta({
    ...exayardWorkflow,
    status:      rawAssessment?.status ?? "completed",
    completedAt: now,
  });

  const metaEnvelope = {
    promptVersion:      PROMPT_VERSION,
    provider:           "exayard",
    modelUsed,
    savedAt:            now,
    pageInventory:      null,
    dimensionEvidence:  null,
    qaGate,
    exayardWorkflow:    safeWorkflow,
    exayardRaw:         rawAssessment,
    exayardRawCaptured: true,
  };

  const augmentedRawAiJson = { ...(rawAssessment ?? {}), _meta: metaEnvelope };

  const resultPayload = {
    organization_id:             organizationId,
    takeoff_job_id:              takeoffJobId,
    schema_version:              TAKEOFF_SCHEMA_VERSION,
    raw_ai_result_json:          augmentedRawAiJson,
    normalized_takeoff_json:     normalized,
    computed_measurements_json:  computed,
    validation_diagnostics_json: validation,
    import_plan_json:            importPlan,
    review_status:               "needs_review",
    needs_review:                true,
    reviewed_by_user_id:           null,
    reviewed_at:                 null,
  };

  let resultRowId = null;
  const { data: resultRows, error: resultInsertErr } = await supabase
    .from("quote_takeoff_results")
    .insert(resultPayload)
    .select();

  if (!resultInsertErr && resultRows?.length) {
    resultRowId = resultRows[0].id;
  } else if (resultInsertErr) {
    const isNotNullViolation =
      resultInsertErr.code === "23502" ||
      String(resultInsertErr.message ?? "").includes("null value in column");
    if (!isNotNullViolation) {
      throw Object.assign(
        new Error(`Failed to save Exayard result: ${resultInsertErr.message}`),
        { statusCode: 503 }
      );
    }
  }

  const exayardJobMeta = buildExayardJobMetadataFromWorkflow({
    ...safeWorkflow,
    status: "completed",
  });

  await setJobFields(supabase, takeoffJobId, organizationId, {
    status:        "completed",
    review_status: "needs_review",
    error_message: null,
    metadata: {
      ...(job.metadata && typeof job.metadata === "object" ? job.metadata : {}),
      exayard: exayardJobMeta,
    },
    result_summary: {
      ...summary,
      savedAt:                   now,
      schemaVersion:             TAKEOFF_SCHEMA_VERSION,
      reviewStatus:              "needs_review",
      modelUsed,
      promptVersion:             PROMPT_VERSION,
      usage:                     {},
      aiExtraction:              true,
      exayardRawCaptured:        true,
      exayardStatus:             "completed",
      exayardWorkflow:           safeWorkflow,
      normalizedTakeoffJson:     normalized,
      computedMeasurementsJson:  computed,
      validationDiagnosticsJson: validation,
      importPlanJson:            importPlan,
      resultRowId:               resultRowId ?? null,
    },
  });

  return {
    ok:                        true,
    exayardStatus:             "completed",
    takeoffJobId,
    resultRowId:               resultRowId ?? null,
    savedAt:                   now,
    schemaVersion:             TAKEOFF_SCHEMA_VERSION,
    reviewStatus:              "needs_review",
    normalizedTakeoffJson:     normalized,
    computedMeasurementsJson:  computed,
    validationDiagnosticsJson: validation,
    importPlanJson:            importPlan,
    summary,
    modelUsed,
    promptVersion:             PROMPT_VERSION,
    usage:                     {},
    exayardWorkflow:           safeWorkflow,
    exayardRawCaptured:        true,
    canResumeExayard:          false,
    message:                   "Exayard raw result captured — normalization pending.",
  };
}

/**
 * Resume/check Exayard assessment for an existing takeoff job (single GET — no poll loop).
 *
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   takeoffJobId: string,
 *   fetchFn?: typeof fetch,
 * }} params
 */
export async function resumeExayardTakeoff({
  supabase,
  organizationId,
  takeoffJobId,
  fetchFn,
}) {
  if (!isUuid(organizationId)) throw resumeError("organizationId must be a valid UUID");
  if (!isUuid(takeoffJobId)) throw resumeError("takeoffJobId must be a valid UUID");

  const { data: jobRows, error: jobErr } = await supabase
    .from("quote_takeoff_jobs")
    .select("id,organization_id,quote_file_id,status,metadata,result_summary")
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (jobErr) {
    throw Object.assign(new Error(`DB error loading job: ${jobErr.message}`), { statusCode: 503 });
  }
  if (!jobRows?.length) throw resumeError("Takeoff job not found", 404);

  const job = jobRows[0];
  const exayardMeta = pickSafeExayardJobMetadata(job.metadata)?.exayard;
  const assessmentId = exayardMeta?.assessmentId ?? null;

  if (!assessmentId) {
    throw resumeError(
      "No Exayard assessmentId is stored for this takeoff job. Run Exayard workflow first.",
      400,
      { code: "exayard_assessment_missing" }
    );
  }

  const check = await checkExayardAssessmentOnce({ assessmentId, fetchFn });

  if (check.state === "rate_limited") {
    const workflow = buildExayardSafeWorkflowMeta({
      provider:          "exayard",
      status:            "waiting_on_exayard",
      pausedStep:        "poll_assessment",
      projectId:         exayardMeta?.projectId ?? null,
      fileId:            exayardMeta?.fileId ?? null,
      assessmentId,
      retryAfterSeconds: check.retryAfterSeconds ?? null,
      retryAfterAt:      check.retryAfterAt ?? null,
      exayardCode:       check.exayardCode ?? "rate_limited",
      exayardRequestId:  check.exayardRequestId ?? null,
    });
    const exayardJobMeta = buildExayardJobMetadataFromWorkflow(workflow);

    await setJobFields(supabase, takeoffJobId, organizationId, {
      status: "processing",
      metadata: {
        ...(job.metadata && typeof job.metadata === "object" ? job.metadata : {}),
        exayard: exayardJobMeta,
      },
    });

    return {
      ok:               true,
      exayardStatus:    "waiting_on_exayard",
      takeoffJobId,
      message:          "Exayard rate limit exceeded. Try again after the retry time.",
      exayardWorkflow:  workflow,
      retryAfterAt:     workflow.retryAfterAt ?? null,
      retryAfterSeconds: workflow.retryAfterSeconds ?? null,
      exayardCode:      workflow.exayardCode ?? null,
      exayardRequestId: workflow.exayardRequestId ?? null,
      assessmentId,
      canResumeExayard: true,
      pausedStep:       "poll_assessment",
    };
  }

  if (check.state === "processing") {
    const workflow = buildExayardSafeWorkflowMeta({
      provider:     "exayard",
      status:       "waiting_on_exayard",
      pausedStep:   "poll_assessment",
      projectId:    exayardMeta?.projectId ?? null,
      fileId:       exayardMeta?.fileId ?? null,
      assessmentId,
      assessmentStatus: check.assessmentStatus ?? null,
    });

    return {
      ok:               true,
      exayardStatus:    "waiting_on_exayard",
      takeoffJobId,
      message:          "Exayard is still processing this assessment.",
      exayardWorkflow:  workflow,
      assessmentId,
      assessmentStatus: check.assessmentStatus ?? null,
      canResumeExayard: true,
      pausedStep:       "poll_assessment",
    };
  }

  // completed
  const { data: fileRows } = await supabase
    .from("quote_files")
    .select("id,original_filename,mime_type,storage_bucket")
    .eq("id", job.quote_file_id)
    .limit(1);

  const file = fileRows?.[0];
  if (!file) throw resumeError("Source file not found for takeoff job", 404);

  return finalizeExayardRawCapture({
    supabase,
    organizationId,
    takeoffJobId,
    job,
    file,
    rawAssessment: check.assessment,
    exayardWorkflow: {
      provider:     "exayard",
      projectId:    exayardMeta?.projectId ?? null,
      fileId:       exayardMeta?.fileId ?? null,
      assessmentId,
      status:       check.assessmentStatus ?? "completed",
      pausedStep:   null,
    },
  });
}
