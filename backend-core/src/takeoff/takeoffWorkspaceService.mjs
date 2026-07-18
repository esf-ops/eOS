/**
 * takeoffWorkspaceService — v4.5 normalized takeoff workspace.
 *
 * Architecture (v4.5):
 *   Uses quote_takeoff_jobs and quote_takeoff_results as the durable source of truth.
 *   quote_takeoff_jobs.quote_id is nullable (confirmed via eliteos_quote_files_takeoff_storage.sql),
 *   enabling pre-quote AI Takeoff Lab flows.
 *
 *   createTakeoffWorkspace → inserts a real quote_takeoff_jobs row (quote_id = null)
 *   saveTakeoffResult      → inserts a real quote_takeoff_results row
 *   getTakeoffWorkspace    → reads from quote_takeoff_jobs + quote_files
 *   getLatestTakeoffResult → reads from quote_takeoff_results
 *
 * NOTE on quote_takeoff_results.quote_id:
 *   The base schema has quote_id NOT NULL. The additive SQL does not explicitly
 *   DROP NOT NULL there. If that constraint is still in place, saveTakeoffResult
 *   will fall back to storing the full result JSON in quote_takeoff_jobs.result_summary
 *   and getLatestTakeoffResult will read it from there. To fully enable the real
 *   results table, run:
 *     ALTER TABLE public.quote_takeoff_results ALTER COLUMN quote_id DROP NOT NULL;
 *
 * Legacy v4 fallback (read-only):
 *   If getTakeoffWorkspace / getLatestTakeoffResult receives an ID that matches a
 *   v4 quote_files row with metadata.takeoffWorkspace, it returns limited workspace
 *   data. v4 was pre-production; this fallback is read-only — no writes are made.
 *
 * Security:
 *   - organizationId always derived from auth context, never from client body.
 *   - Job/file ownership verified before any read/write.
 *   - storage_path never returned.
 *   - No AI API calls. No quote mutation. No pricing logic.
 */
import { randomUUID } from "node:crypto";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";
import { planTakeoffImport } from "./takeoffImportPlanner.mjs";
import { TAKEOFF_SCHEMA_VERSION } from "./takeoffContract.mjs";
import { buildProcessingStatus } from "./takeoffProcessOrchestrator.mjs";
import { evaluateTakeoffQaGate } from "./takeoffQaGate.mjs";
import { pickSafeExayardJobMetadata } from "./exayardClient.mjs";
import { evaluateTakeoffApprovalGate } from "./takeoffApprovalGate.mjs";
import {
  buildConsolidatedTakeoffSummary,
  deriveConsolidatedDisplayStatus,
  evaluateConsolidatedApprovalGate
} from "./takeoffConsolidatedApproval.mjs";
import { buildTakeoffImportPayload } from "./takeoffImportPayload.mjs";
import { loadReviewStateFromRaw, normalizeReviewState } from "./takeoffReviewStatus.mjs";
import { ESTIMATOR_DECISION_CODES, HARD_BLOCKER_CODES } from "./takeoffWorkflowState.mjs";

// ── Validation helpers ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {unknown} v @returns {boolean} */
export function isUuid(v) {
  return UUID_RE.test(String(v ?? "").trim());
}

/**
 * @param {string} message
 * @param {number} [statusCode]
 * @returns {Error}
 */
export function workspaceError(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.isValidationError = statusCode < 500;
  return e;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_SOURCE_TYPE = "ai_takeoff_lab";
const JOB_STATUS_PENDING = "pending";
const JOB_STATUS_COMPLETED = "completed";

// ── File row helper ───────────────────────────────────────────────────────────

const FILE_SELECT_COLS =
  "id,organization_id,status,original_filename,file_role,visibility,mime_type,file_size_bytes,created_at,metadata";

/**
 * Load a quote_files row and verify org ownership + active status.
 * @returns {Promise<Record<string, unknown>>}
 */
async function loadVerifiedFileRow(supabase, organizationId, quoteFileId) {
  const { data: rows, error } = await supabase
    .from("quote_files")
    .select(FILE_SELECT_COLS)
    .eq("id", quoteFileId)
    .limit(1);

  if (error) {
    throw Object.assign(new Error(`DB error: ${error.message}`), { statusCode: 503 });
  }
  if (!rows || rows.length === 0) {
    throw workspaceError("Takeoff workspace file not found", 404);
  }
  const row = rows[0];
  if (String(row.organization_id ?? "") !== organizationId) {
    throw workspaceError("File does not belong to this organization", 403);
  }
  if (row.status === "deleted") {
    throw workspaceError("File has been deleted", 410);
  }
  if (row.status === "archived") {
    throw workspaceError("File has been archived", 410);
  }
  return row;
}

/** Shape a safe file summary (omits storage_path). */
function safeFileSummary(row) {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    fileRole: row.file_role,
    visibility: row.visibility,
    mimeType: row.mime_type ?? null,
    fileSizeBytes: row.file_size_bytes ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ── Job row helper ────────────────────────────────────────────────────────────

const JOB_SELECT_COLS =
  "id,organization_id,quote_id,quote_file_id,status,review_status,source_type," +
  "created_by_user_id,model_provider,model_version,metadata,result_summary,error_message," +
  "created_at,updated_at,started_at,completed_at";

/** @param {Record<string, unknown> | null | undefined} resultRow */
function buildResultSummaryCounts(resultRow) {
  if (!resultRow) return null;
  const computed =
    typeof resultRow.computed_measurements_json === "object" && resultRow.computed_measurements_json !== null
      ? resultRow.computed_measurements_json
      : {};
  const diagnostics =
    typeof resultRow.validation_diagnostics_json === "object" && resultRow.validation_diagnostics_json !== null
      ? resultRow.validation_diagnostics_json
      : {};
  return {
    computedCountertopSf: computed.countertopExactSf ?? 0,
    computedBacksplashSf: computed.backsplashExactSf ?? 0,
    warningCount: diagnostics.warningCount ?? diagnostics.warnings?.length ?? 0,
    errorCount: diagnostics.errorCount ?? diagnostics.errors?.length ?? 0,
  };
}

/** @param {Record<string, unknown>} resultRow */
function buildLatestResultMeta(resultRow) {
  return {
    id: resultRow.id,
    createdAt: resultRow.created_at,
    reviewStatus: resultRow.review_status ?? "needs_review",
    schemaVersion: resultRow.schema_version ?? null,
    hasNormalizedTakeoffJson: resultRow.normalized_takeoff_json != null,
    reviewedAt: resultRow.reviewed_at ?? null,
    reviewedByUserId: resultRow.reviewed_by_user_id ?? null,
    summary: buildResultSummaryCounts(resultRow),
  };
}

const RESULT_DETAIL_SELECT_COLS =
  "id,created_at,review_status,schema_version,normalized_takeoff_json," +
  "computed_measurements_json,validation_diagnostics_json,import_plan_json," +
  "raw_ai_result_json,reviewed_by_user_id,reviewed_at";

/** @returns {Promise<Record<string, unknown> | null>} */
async function loadLatestResultRow(supabase, organizationId, takeoffJobId) {
  const { data: rows, error } = await supabase
    .from("quote_takeoff_results")
    .select(RESULT_DETAIL_SELECT_COLS)
    .eq("takeoff_job_id", takeoffJobId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw Object.assign(new Error(`DB error loading takeoff result: ${error.message}`), {
      statusCode: 503,
    });
  }
  return rows?.[0] ?? null;
}

function recomputeTakeoffBundle(takeoffResult) {
  const computed = computeTakeoffMeasurements(takeoffResult);
  const validation = validateTakeoffResult(takeoffResult, computed);
  const importPlan = planTakeoffImport(takeoffResult, computed);
  return { computed, validation, importPlan };
}

function computeQaGateForResult(takeoffResult, computed, validation, rawAiJson) {
  const meta =
    typeof rawAiJson === "object" && rawAiJson !== null && typeof rawAiJson._meta === "object"
      ? rawAiJson._meta
      : {};
  try {
    return evaluateTakeoffQaGate({
      takeoffResult,
      computedMeasurements: computed,
      validationDiagnostics: validation,
      dimensionEvidence: meta.dimensionEvidence ?? null,
      pageInventory: meta.pageInventory ?? null,
    });
  } catch {
    return null;
  }
}

function extractApprovalFields(jobRow, latestResultRow) {
  const reviewStatus =
    jobRow.review_status ??
    latestResultRow?.review_status ??
    "needs_review";
  let approvedAt = null;
  let approvedByUserId = null;
  if (reviewStatus === "approved") {
    approvedAt =
      latestResultRow?.reviewed_at ??
      jobRow.result_summary?.approvedAt ??
      jobRow.updated_at ??
      null;
    approvedByUserId =
      latestResultRow?.reviewed_by_user_id ??
      jobRow.result_summary?.approvedByUserId ??
      null;
  }
  return { reviewStatus, approvalStatus: reviewStatus, approvedAt, approvedByUserId };
}

function computeCanApprove({
  hasSavedResult,
  validation,
  qaGate,
  reviewStatus,
  takeoffResult = null,
  computed = null,
  reviewState = null,
  dimensionEvidence = null,
  hasUnsavedEdits = false,
}) {
  if (!hasSavedResult) return false;
  if (reviewStatus === "approved") return false;
  if (!takeoffResult) {
    if (validation?.hasErrors || (validation?.errorCount ?? 0) > 0) return false;
    if (qaGate?.status === "do_not_import") return false;
    return true;
  }
  const gate = evaluateTakeoffApprovalGate({
    takeoffResult,
    computed,
    validation,
    qaGate,
    dimensionEvidence,
    reviewState,
    hasSavedResult,
    hasUnsavedEdits,
    reviewStatus,
  });
  return gate.canApprove;
}

function buildResultSummary(takeoffResult, computed, validation, importPlan) {
  return {
    countertopExactSf: computed.countertopExactSf,
    backsplashExactSf: computed.backsplashExactSf,
    combinedExactSf: computed.combinedExactSf,
    chargeableCountertopSf: computed.chargeableCountertopSf,
    chargeableBacksplashSf: computed.chargeableBacksplashSf,
    roomCount: takeoffResult.rooms.length,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    canImport: importPlan.canImport,
  };
}

function jobHasResultSummary(jobRow) {
  return (
    jobRow.result_summary !== null &&
    typeof jobRow.result_summary === "object" &&
    Object.keys(jobRow.result_summary).length > 0
  );
}

/**
 * Parse list query params for GET /api/takeoff-jobs.
 * @param {Record<string, unknown>} [query]
 */
export function parseListTakeoffJobsQuery(query = {}) {
  const status =
    typeof query.status === "string" && query.status.trim() ? query.status.trim() : null;
  const reviewStatus =
    typeof query.review_status === "string" && query.review_status.trim()
      ? query.review_status.trim()
      : typeof query.reviewStatus === "string" && query.reviewStatus.trim()
        ? query.reviewStatus.trim()
        : null;

  let limit = parseInt(String(query.limit ?? "25"), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 25;
  if (limit > 100) limit = 100;

  let offset = parseInt(String(query.offset ?? "0"), 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  return { status, reviewStatus, limit, offset };
}

/**
 * Load a quote_takeoff_jobs row by ID + org. Returns null if not found (not 403).
 * The DB-level filter already scopes by org; cross-org jobs simply don't appear.
 *
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function loadVerifiedJobRow(supabase, organizationId, takeoffJobId) {
  const { data: rows, error } = await supabase
    .from("quote_takeoff_jobs")
    .select(JOB_SELECT_COLS)
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (error) {
    throw Object.assign(new Error(`DB error: ${error.message}`), { statusCode: 503 });
  }
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0];
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Create a takeoff workspace linked to an already-uploaded quote file.
 *
 * Inserts a real quote_takeoff_jobs row with quote_id = null (pre-quote Lab flow).
 * Idempotent: if a job already exists for this quote_file_id + org, returns it.
 * Also updates quote_files.takeoff_job_id and logs a linked_to_takeoff audit event.
 *
 * @param {{ supabase: object, organizationId: string, userId: string|null, quoteFileId: string }} params
 * @returns {Promise<{ takeoffJobId: string, startedAt: string, reviewStatus: string, hasSavedResult: boolean, file: object }>}
 */
export async function createTakeoffWorkspace({
  supabase,
  organizationId,
  userId,
  quoteFileId,
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(quoteFileId)) {
    throw workspaceError("quoteFileId must be a valid UUID");
  }

  const fileRow = await loadVerifiedFileRow(supabase, organizationId, quoteFileId);

  // Idempotency: return existing job if one already exists for this file + org.
  const { data: existing } = await supabase
    .from("quote_takeoff_jobs")
    .select("id,review_status,created_at,result_summary")
    .eq("quote_file_id", quoteFileId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (existing && existing.length > 0) {
    const ex = existing[0];
    const rs = ex.result_summary;
    const hasSavedResult =
      rs !== null &&
      typeof rs === "object" &&
      Object.keys(rs).length > 0;
    return {
      takeoffJobId: ex.id,
      startedAt: ex.created_at,
      reviewStatus: ex.review_status ?? "needs_review",
      hasSavedResult: Boolean(hasSavedResult),
      file: safeFileSummary(fileRow),
    };
  }

  // Insert new quote_takeoff_jobs row.
  const { data: inserted, error: insertErr } = await supabase
    .from("quote_takeoff_jobs")
    .insert({
      organization_id: organizationId,
      quote_id: null,               // pre-quote Lab flow — nullable after additive SQL
      quote_file_id: quoteFileId,
      status: JOB_STATUS_PENDING,
      source_type: JOB_SOURCE_TYPE,
      review_status: "needs_review",
      created_by_user_id: userId ?? null,
      metadata: {
        source: "ai_takeoff_lab",
        schemaVersion: TAKEOFF_SCHEMA_VERSION,
      },
    })
    .select();

  if (insertErr || !inserted || inserted.length === 0) {
    throw Object.assign(
      new Error(`Failed to create takeoff job: ${insertErr?.message ?? "no row returned"}`),
      { statusCode: 503 }
    );
  }

  const job = inserted[0];

  // Update quote_files.takeoff_job_id to link the file back to this job.
  const { error: fileUpdateErr } = await supabase
    .from("quote_files")
    .update({ takeoff_job_id: job.id })
    .eq("id", quoteFileId)
    .eq("organization_id", organizationId);

  if (fileUpdateErr) {
    // Non-fatal: the job is created; just log and continue.
    console.warn(
      `[takeoffWorkspace] Failed to set quote_files.takeoff_job_id: ${fileUpdateErr.message}`
    );
  }

  // Audit: log linked_to_takeoff event.
  await supabase.from("quote_file_events").insert({
    organization_id: organizationId,
    quote_file_id: quoteFileId,
    actor_user_id: userId ?? null,
    action: "linked_to_takeoff",
    metadata: { takeoff_job_id: job.id },
  });

  return {
    takeoffJobId: job.id,
    startedAt: job.created_at,
    reviewStatus: job.review_status ?? "needs_review",
    hasSavedResult: false,
    file: safeFileSummary(fileRow),
  };
}

/**
 * Get takeoff workspace status and file metadata.
 *
 * Falls back to v4 quote_files.metadata format (read-only) if no job row found.
 *
 * @param {{ supabase: object, organizationId: string, takeoffJobId: string }} params
 */
export async function getTakeoffWorkspace({
  supabase,
  organizationId,
  takeoffJobId,
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);

  // ── Legacy v4 fallback ──────────────────────────────────────────────────────
  if (!jobRow) {
    return await _legacyV4GetWorkspace(supabase, organizationId, takeoffJobId);
  }

  // Load the linked file metadata.
  let fileRow = null;
  if (jobRow.quote_file_id) {
    const { data: fileRows } = await supabase
      .from("quote_files")
      .select(FILE_SELECT_COLS)
      .eq("id", jobRow.quote_file_id)
      .limit(1);
    fileRow = fileRows?.[0] ?? null;
  }

  const { data: resultIdRows } = await supabase
    .from("quote_takeoff_results")
    .select("id")
    .eq("takeoff_job_id", takeoffJobId)
    .eq("organization_id", organizationId);

  const resultCount = resultIdRows?.length ?? 0;
  const hasJobSummary = jobHasResultSummary(jobRow);
  const hasSavedResult = Boolean(resultCount > 0 || hasJobSummary);

  const latestRow = await loadLatestResultRow(supabase, organizationId, takeoffJobId);
  const latestResult = latestRow ? buildLatestResultMeta(latestRow) : null;

  let canApprove = false;
  let approvalBlockers = null;
  if (hasSavedResult) {
    const takeoffJson =
      latestRow?.normalized_takeoff_json ??
      (hasJobSummary ? jobRow.result_summary.normalizedTakeoffJson : null);
    const rawJson = latestRow?.raw_ai_result_json ?? null;
    if (!takeoffJson) {
      // Legacy path: job has a result row but no normalized JSON.
      // Fall back to basic validation-only check (matches old computeCanApprove behavior).
      try {
        const { validation } = recomputeTakeoffBundle(takeoffJson);
        const qaGate = computeQaGateForResult(takeoffJson, null, validation, rawJson);
        if (!(validation?.hasErrors || (validation?.errorCount ?? 0) > 0) &&
            qaGate?.status !== "do_not_import") {
          canApprove = true;
        }
      } catch {
        canApprove = false;
      }
    } else {
      try {
        const { computed, validation } = recomputeTakeoffBundle(takeoffJson);
        const qaGate = computeQaGateForResult(takeoffJson, computed, validation, rawJson);
        const approval = extractApprovalFields(jobRow, latestRow);
        const reviewState = loadReviewStateFromRaw(rawJson);
        const dimEvidence =
          typeof rawJson?._meta?.dimensionEvidence === "object" && rawJson._meta.dimensionEvidence !== null
            ? rawJson._meta.dimensionEvidence
            : null;
        const gate = evaluateTakeoffApprovalGate({
          takeoffResult: takeoffJson,
          computed,
          validation,
          qaGate,
          dimensionEvidence: dimEvidence,
          reviewState,
          hasSavedResult,
          hasUnsavedEdits: false,
          reviewStatus: approval.reviewStatus,
        });
        canApprove = gate.canApprove;
        // Expose classified blockers so the frontend can render decision cards
        // on workspace load without waiting for a 422 from the approve endpoint.
        if (!gate.canApprove && gate.blockers.length > 0) {
          approvalBlockers = {
            hardBlockers: gate.blockers.filter((b) => HARD_BLOCKER_CODES.has(b.code)),
            estimatorDecisionsRequired: gate.blockers
              .filter((b) => ESTIMATOR_DECISION_CODES.has(b.code))
              .map((b) => ({
                code: b.code,
                message: b.message,
                path: b.path ?? null,
                category: b.category ?? "review",
              })),
          };
        }
      } catch {
        canApprove = false;
      }
    }
  }

  const approval = extractApprovalFields(jobRow, latestRow);

  if (String(jobRow.status ?? "") === "processing") {
    canApprove = false;
  }

  return {
    takeoffJobId,
    status: jobRow.status,
    reviewStatus: approval.reviewStatus,
    approvalStatus: approval.approvalStatus,
    approvedAt: approval.approvedAt,
    approvedByUserId: approval.approvedByUserId,
    canApprove,
    approvalBlockers,
    sourceType: jobRow.source_type ?? null,
    modelProvider: jobRow.model_provider ?? null,
    modelVersion: jobRow.model_version ?? null,
    createdByUserId: jobRow.created_by_user_id ?? null,
    startedAt: jobRow.started_at ?? jobRow.created_at,
    completedAt: jobRow.completed_at ?? null,
    updatedAt: jobRow.updated_at ?? null,
    hasSavedResult,
    resultCount: resultCount > 0 ? resultCount : hasJobSummary ? 1 : 0,
    latestResult,
    isWorkspace: true,
    file: fileRow ? safeFileSummary(fileRow) : null,
    exayard: pickSafeExayardJobMetadata(jobRow.metadata)?.exayard ?? null,
    processing: buildProcessingStatus(jobRow),
    errorMessage: jobRow.error_message ?? null,
  };
}

/**
 * List takeoff jobs for an organization (newest first).
 *
 * @param {{ supabase: object, organizationId: string, query?: Record<string, unknown> }} params
 */
export async function listTakeoffJobs({ supabase, organizationId, query = {} }) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }

  const { status, reviewStatus, limit, offset } = parseListTakeoffJobsQuery(query);

  let jobQuery = supabase
    .from("quote_takeoff_jobs")
    .select(JOB_SELECT_COLS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (status) jobQuery = jobQuery.eq("status", status);
  if (reviewStatus) jobQuery = jobQuery.eq("review_status", reviewStatus);

  const { data: jobRows, error: jobsErr } = await jobQuery.range(offset, offset + limit - 1);

  if (jobsErr) {
    throw Object.assign(new Error(`DB error listing takeoff jobs: ${jobsErr.message}`), {
      statusCode: 503,
    });
  }

  const rows = jobRows ?? [];
  const fileIds = [...new Set(rows.map((j) => j.quote_file_id).filter(Boolean))];
  /** @type {Record<string, Record<string, unknown>>} */
  const fileById = {};

  if (fileIds.length > 0) {
    const { data: fileRows, error: filesErr } = await supabase
      .from("quote_files")
      .select(FILE_SELECT_COLS)
      .in("id", fileIds);

    if (filesErr) {
      throw Object.assign(new Error(`DB error loading quote files: ${filesErr.message}`), {
        statusCode: 503,
      });
    }

    for (const fr of fileRows ?? []) {
      fileById[fr.id] = fr;
    }
  }

  const jobIds = rows.map((j) => j.id);
  /** @type {Record<string, Record<string, unknown>>} */
  const latestByJob = {};
  /** @type {Record<string, number>} */
  const countByJob = {};

  if (jobIds.length > 0) {
    const { data: resultRows, error: resultsErr } = await supabase
      .from("quote_takeoff_results")
      .select(
        "id,takeoff_job_id,created_at,review_status,reviewed_at,reviewed_by_user_id," +
        "normalized_takeoff_json,computed_measurements_json,validation_diagnostics_json"
      )
      .eq("organization_id", organizationId)
      .in("takeoff_job_id", jobIds)
      .order("created_at", { ascending: false });

    if (resultsErr) {
      throw Object.assign(new Error(`DB error loading takeoff results: ${resultsErr.message}`), {
        statusCode: 503,
      });
    }

    for (const rr of resultRows ?? []) {
      const jid = rr.takeoff_job_id;
      countByJob[jid] = (countByJob[jid] ?? 0) + 1;
      if (!latestByJob[jid]) latestByJob[jid] = rr;
    }
  }

  const jobs = rows.map((jobRow) => {
    const fileRow = jobRow.quote_file_id ? fileById[jobRow.quote_file_id] ?? null : null;
    const latest = latestByJob[jobRow.id] ?? null;
    const hasJobSummary = jobHasResultSummary(jobRow);
    let resultCount = countByJob[jobRow.id] ?? 0;
    if (resultCount === 0 && hasJobSummary) resultCount = 1;

    const latestMeta = latest
      ? buildLatestResultMeta(latest)
      : hasJobSummary
        ? {
            id: null,
            createdAt: jobRow.updated_at ?? jobRow.created_at,
            reviewStatus: jobRow.review_status ?? "needs_review",
            schemaVersion: null,
            hasNormalizedTakeoffJson: true,
            reviewedAt: jobRow.result_summary?.approvedAt ?? null,
            reviewedByUserId: jobRow.result_summary?.approvedByUserId ?? null,
            summary: null,
          }
        : null;

    const approval = extractApprovalFields(jobRow, latest);
    // canApprove is intentionally omitted from the list response. A list-level check
    // (no gate evaluation) disagreed with the detail endpoint and the approve endpoint,
    // causing the frontend to show "Approve takeoff" for jobs the server would reject.
    // Use GET /api/takeoff-jobs/:id (detail) for authoritative canApprove.

    const safeFile = fileRow ? safeFileSummary(fileRow) : null;

    return {
      takeoffJobId: jobRow.id,
      quoteFileId: jobRow.quote_file_id ?? null,
      originalFilename: safeFile?.originalFilename ?? null,
      status: jobRow.status,
      reviewStatus: approval.reviewStatus,
      approvalStatus: approval.approvalStatus,
      approvedAt: approval.approvedAt,
      approvedByUserId: approval.approvedByUserId,
      sourceType: jobRow.source_type ?? null,
      modelProvider: jobRow.model_provider ?? null,
      modelVersion: jobRow.model_version ?? null,
      createdByUserId: jobRow.created_by_user_id ?? null,
      createdAt: jobRow.created_at,
      updatedAt: jobRow.updated_at ?? null,
      startedAt: jobRow.started_at ?? jobRow.created_at ?? null,
      completedAt: jobRow.completed_at ?? null,
      latestResultId: latestMeta?.id ?? null,
      latestResultCreatedAt: latestMeta?.createdAt ?? null,
      hasNormalizedTakeoffJson: latest
        ? latest.normalized_takeoff_json != null
        : hasJobSummary,
      resultCount,
      resultSummary: latestMeta?.summary ?? null,
      file: safeFile,
      processing: buildProcessingStatus(jobRow),
      errorMessage: jobRow.error_message ?? null,
    };
  });

  return {
    ok: true,
    jobs,
    pagination: {
      limit,
      offset,
      count: jobs.length,
      hasMore: jobs.length === limit,
    },
  };
}

/**
 * Save a reviewed TakeoffResult for a workspace.
 *
 * Server-side recomputes measurements, validation, and import plan independently
 * of any client-provided totals. Inserts into quote_takeoff_results; if the
 * quote_id NOT NULL constraint blocks it, stores the full result in
 * quote_takeoff_jobs.result_summary as a fallback.
 *
 * Does NOT import into a quote. Does NOT mutate any quote data.
 *
 * @param {{ supabase: object, organizationId: string, userId: string|null, takeoffJobId: string, takeoffResult: object, reviewStatus?: string }} params
 */
export async function saveTakeoffResult({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  takeoffResult,
  reviewStatus = "needs_review",
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }
  if (!takeoffResult || typeof takeoffResult !== "object" || Array.isArray(takeoffResult)) {
    throw workspaceError("takeoffResult must be a TakeoffResult object");
  }
  if (!Array.isArray(takeoffResult.rooms)) {
    throw workspaceError("takeoffResult.rooms must be an array");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) {
    throw workspaceError("Takeoff job not found", 404);
  }

  // Server-side recompute — independent of any client-provided totals.
  let computed, validation, importPlan;
  try {
    computed = computeTakeoffMeasurements(takeoffResult);
    validation = validateTakeoffResult(takeoffResult, computed);
    importPlan = planTakeoffImport(takeoffResult, computed);
  } catch (e) {
    throw workspaceError(
      `Takeoff computation failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const now = new Date().toISOString();
  const schemaVersion = takeoffResult.schemaVersion ?? TAKEOFF_SCHEMA_VERSION;
  const summary = {
    countertopExactSf: computed.countertopExactSf,
    backsplashExactSf: computed.backsplashExactSf,
    combinedExactSf: computed.combinedExactSf,
    chargeableCountertopSf: computed.chargeableCountertopSf,
    chargeableBacksplashSf: computed.chargeableBacksplashSf,
    roomCount: takeoffResult.rooms.length,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    canImport: importPlan.canImport,
  };

  const resultPayload = {
    organization_id: organizationId,
    takeoff_job_id: takeoffJobId,
    schema_version: schemaVersion,
    raw_ai_result_json: null,             // manual/lab source — no AI output
    normalized_takeoff_json: takeoffResult,
    computed_measurements_json: computed,
    validation_diagnostics_json: validation,
    import_plan_json: importPlan,
    review_status: reviewStatus,
    needs_review: reviewStatus !== "approved",
    reviewed_by_user_id: reviewStatus === "approved" ? (userId ?? null) : null,
    reviewed_at: reviewStatus === "approved" ? now : null,
  };

  // Attempt insert into quote_takeoff_results.
  // Falls back to quote_takeoff_jobs.result_summary if quote_id NOT NULL still applies.
  let resultRowId = null;
  const { data: resultRows, error: resultInsertErr } = await supabase
    .from("quote_takeoff_results")
    .insert(resultPayload)
    .select();

  if (!resultInsertErr && resultRows && resultRows.length > 0) {
    resultRowId = resultRows[0].id;
  } else if (resultInsertErr) {
    const isNotNullViolation =
      resultInsertErr.code === "23502" ||
      String(resultInsertErr.message ?? "").includes("null value in column");
    if (!isNotNullViolation) {
      throw Object.assign(
        new Error(`Failed to save takeoff result: ${resultInsertErr.message}`),
        { statusCode: 503 }
      );
    }
    // quote_id NOT NULL not yet relaxed — fall through to job-level storage.
    console.warn(
      "[takeoffWorkspace] quote_takeoff_results.quote_id NOT NULL blocked insert. " +
      "Result stored in quote_takeoff_jobs.result_summary. " +
      "Run: ALTER TABLE public.quote_takeoff_results ALTER COLUMN quote_id DROP NOT NULL;"
    );
  }

  // Always update quote_takeoff_jobs: status, review_status, result_summary.
  // result_summary carries the full result as a fast-read fallback.
  await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_COMPLETED,
      review_status: reviewStatus,
      updated_at: now,
      result_summary: {
        ...summary,
        savedAt: now,
        schemaVersion,
        reviewStatus,
        normalizedTakeoffJson: takeoffResult,
        computedMeasurementsJson: computed,
        validationDiagnosticsJson: validation,
        importPlanJson: importPlan,
        resultRowId: resultRowId ?? null,
      },
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  return {
    ok: true,
    takeoffJobId,
    savedAt: now,
    schemaVersion,
    reviewStatus,
    summary,
  };
}

/**
 * Save estimator corrections with an audit payload appended to result metadata.
 *
 * Inserts a new quote_takeoff_results row and resets job approval to needs_review.
 * Corrections are stored in raw_ai_result_json._corrections (no dedicated table).
 *
 * @param {{ supabase: object, organizationId: string, userId: string|null, takeoffJobId: string, takeoffResult: object, correctionNotes?: string|null, baseResultId?: string|null }} params
 */
export async function saveTakeoffCorrection({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  takeoffResult,
  correctionNotes = null,
  baseResultId = null,
  reviewState = null,
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }
  if (!takeoffResult || typeof takeoffResult !== "object" || Array.isArray(takeoffResult)) {
    throw workspaceError("takeoffResult must be a TakeoffResult object");
  }
  if (!Array.isArray(takeoffResult.rooms)) {
    throw workspaceError("takeoffResult.rooms must be an array");
  }
  if (baseResultId != null && baseResultId !== "" && !isUuid(baseResultId)) {
    throw workspaceError("baseResultId must be a valid UUID");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) {
    throw workspaceError("Takeoff job not found", 404);
  }

  let computed, validation, importPlan;
  try {
    ({ computed, validation, importPlan } = recomputeTakeoffBundle(takeoffResult));
  } catch (e) {
    throw workspaceError(
      `Takeoff computation failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const latestRow = await loadLatestResultRow(supabase, organizationId, takeoffJobId);
  const now = new Date().toISOString();
  const schemaVersion = takeoffResult.schemaVersion ?? TAKEOFF_SCHEMA_VERSION;
  const summary = buildResultSummary(takeoffResult, computed, validation, importPlan);

  const correctionEntry = {
    id: randomUUID(),
    correctedAt: now,
    correctedByUserId: userId ?? null,
    notes: correctionNotes ? String(correctionNotes).trim() || null : null,
    baseResultId:
      baseResultId && isUuid(baseResultId)
        ? baseResultId
        : latestRow?.id ?? null,
    summary: {
      countertopExactSf: summary.countertopExactSf,
      backsplashExactSf: summary.backsplashExactSf,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
    },
  };

  const existingRaw =
    typeof latestRow?.raw_ai_result_json === "object" && latestRow.raw_ai_result_json !== null
      ? latestRow.raw_ai_result_json
      : {};
  const existingCorrections = Array.isArray(existingRaw._corrections)
    ? existingRaw._corrections
    : [];
  const rawPayload = {
    ...existingRaw,
    _corrections: [...existingCorrections, correctionEntry],
    _meta: {
      ...(existingRaw._meta ?? {}),
      lastCorrectionAt: now,
      lastCorrectedByUserId: userId ?? null,
      ...(reviewState != null
        ? { reviewState: normalizeReviewState(reviewState) }
        : {}),
    },
  };

  const resultPayload = {
    organization_id: organizationId,
    takeoff_job_id: takeoffJobId,
    schema_version: schemaVersion,
    raw_ai_result_json: rawPayload,
    normalized_takeoff_json: takeoffResult,
    computed_measurements_json: computed,
    validation_diagnostics_json: validation,
    import_plan_json: importPlan,
    review_status: "needs_review",
    needs_review: true,
    reviewed_by_user_id: null,
    reviewed_at: null,
  };

  let resultRowId = null;
  const { data: resultRows, error: resultInsertErr } = await supabase
    .from("quote_takeoff_results")
    .insert(resultPayload)
    .select();

  if (!resultInsertErr && resultRows && resultRows.length > 0) {
    resultRowId = resultRows[0].id;
  } else if (resultInsertErr) {
    const isNotNullViolation =
      resultInsertErr.code === "23502" ||
      String(resultInsertErr.message ?? "").includes("null value in column");
    if (!isNotNullViolation) {
      throw Object.assign(
        new Error(`Failed to save takeoff correction: ${resultInsertErr.message}`),
        { statusCode: 503 }
      );
    }
    console.warn(
      "[takeoffWorkspace] quote_takeoff_results.quote_id NOT NULL blocked correction insert."
    );
  }

  await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_COMPLETED,
      review_status: "needs_review",
      updated_at: now,
      result_summary: {
        ...summary,
        savedAt: now,
        schemaVersion,
        reviewStatus: "needs_review",
        approvedAt: null,
        approvedByUserId: null,
        lastCorrectionId: correctionEntry.id,
        normalizedTakeoffJson: takeoffResult,
        computedMeasurementsJson: computed,
        validationDiagnosticsJson: validation,
        importPlanJson: importPlan,
        resultRowId: resultRowId ?? null,
      },
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  return {
    ok: true,
    takeoffJobId,
    correctionId: correctionEntry.id,
    savedAt: now,
    schemaVersion,
    reviewStatus: "needs_review",
    approvalStatus: "needs_review",
    canApprove: computeCanApprove({
      hasSavedResult: true,
      validation,
      qaGate: computeQaGateForResult(takeoffResult, computed, validation, rawPayload),
      reviewStatus: "needs_review",
    }),
    correction: correctionEntry,
    summary,
  };
}

/**
 * Approve the latest reviewed takeoff result after server-side validation + QA gate.
 *
 * Does NOT import into Internal Estimate. Does NOT create or update quotes.
 *
 * @param {{ supabase: object, organizationId: string, userId: string|null, takeoffJobId: string, takeoffResult?: object|null }} params
 */
export async function approveTakeoffJob({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  takeoffResult = null,
  reviewState = null,
  dimensionEvidence = null,
  approvalMode = "legacy",
  acceptAdvisoryWarnings = false,
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }
  if (
    takeoffResult != null &&
    (typeof takeoffResult !== "object" || Array.isArray(takeoffResult))
  ) {
    throw workspaceError("takeoffResult must be a TakeoffResult object");
  }
  if (takeoffResult != null && !Array.isArray(takeoffResult.rooms)) {
    throw workspaceError("takeoffResult.rooms must be an array");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) {
    throw workspaceError("Takeoff job not found", 404);
  }

  if (String(jobRow.status ?? "") === "processing") {
    throw workspaceError("Takeoff is still processing — wait for completion before approval", 422);
  }

  const latestRow = await loadLatestResultRow(supabase, organizationId, takeoffJobId);
  let resolvedResult = takeoffResult;
  if (!resolvedResult) {
    if (latestRow?.normalized_takeoff_json) {
      resolvedResult = latestRow.normalized_takeoff_json;
    } else {
      const rs = jobRow.result_summary;
      if (rs && typeof rs === "object" && rs.normalizedTakeoffJson) {
        resolvedResult = rs.normalizedTakeoffJson;
      }
    }
  }

  if (!resolvedResult) {
    throw workspaceError("No saved result found for this takeoff workspace", 404);
  }

  let computed, validation, importPlan;
  try {
    ({ computed, validation, importPlan } = recomputeTakeoffBundle(resolvedResult));
  } catch (e) {
    throw workspaceError(
      `Takeoff computation failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const rawJson =
    typeof latestRow?.raw_ai_result_json === "object" && latestRow.raw_ai_result_json !== null
      ? latestRow.raw_ai_result_json
      : {};
  const qaGate = computeQaGateForResult(resolvedResult, computed, validation, rawJson);

  const rs =
    reviewState != null
      ? normalizeReviewState(reviewState)
      : loadReviewStateFromRaw(rawJson);
  const dimEvidence =
    dimensionEvidence ??
    (typeof rawJson?._meta?.dimensionEvidence === "object"
      ? rawJson._meta.dimensionEvidence
      : null);

  const useConsolidated = String(approvalMode ?? "legacy") === "consolidated";
  let approvalGate;
  let consolidatedGate = null;
  if (useConsolidated) {
    consolidatedGate = evaluateConsolidatedApprovalGate({
      takeoffResult: resolvedResult,
      computed,
      validation,
      qaGate,
      dimensionEvidence: dimEvidence,
      reviewState: rs,
      hasSavedResult: true,
      hasUnsavedEdits: false,
      reviewStatus: jobRow.review_status ?? "needs_review",
      jobStatus: String(jobRow.status ?? "")
    });
    if (consolidatedGate.alreadyApproved) {
      return {
        ok: true,
        takeoffJobId,
        approvedAt: jobRow.result_summary?.approvedAt ?? null,
        approvedByUserId: jobRow.result_summary?.approvedByUserId ?? null,
        reviewStatus: "approved",
        approvalStatus: "approved_for_import",
        workflowStatus: "approved_for_import",
        canApprove: false,
        canImport: true,
        qaGate,
        approvalGate: {
          canApprove: false,
          blockers: [],
          blockerCount: 0
        },
        summary: buildResultSummary(resolvedResult, computed, validation, importPlan),
        importPayload: null,
        idempotent: true,
        advisory: consolidatedGate.advisory,
        blocking: []
      };
    }
    if (consolidatedGate.blocking.length > 0) {
      const err = workspaceError(
        consolidatedGate.blocking.map((b) => b.message).join("; ") ||
          "Approval blockers must be resolved before approval",
        422
      );
      err.approvalBlockers = {
        ok: false,
        code: "approval_hard_blockers",
        hardBlockers: consolidatedGate.blocking,
        estimatorDecisionsRequired: [],
        advisory: consolidatedGate.advisory
      };
      throw err;
    }
    if (consolidatedGate.advisory.length > 0 && !acceptAdvisoryWarnings) {
      const err = workspaceError(
        `Confirm ${consolidatedGate.advisory.length} advisory warning(s) before approval`,
        422
      );
      err.approvalBlockers = {
        ok: false,
        code: "approval_advisory_confirmation_required",
        hardBlockers: [],
        estimatorDecisionsRequired: [],
        advisory: consolidatedGate.advisory,
        advisoryCount: consolidatedGate.advisory.length
      };
      throw err;
    }
    approvalGate = {
      canApprove: true,
      canImport: false,
      blockers: [],
      blockerCount: 0,
      workflowStatus: consolidatedGate.workflowStatus
    };
  } else {
    approvalGate = evaluateTakeoffApprovalGate({
      takeoffResult: resolvedResult,
      computed,
      validation,
      qaGate,
      dimensionEvidence: dimEvidence,
      reviewState: rs,
      hasSavedResult: true,
      hasUnsavedEdits: false,
      reviewStatus: jobRow.review_status ?? "needs_review",
    });

    if (!approvalGate.canApprove) {
      // Classify blockers so the frontend can render actionable decision cards rather
      // than just displaying a raw error string.
      const hardBlockers = approvalGate.blockers.filter(
        (b) => !ESTIMATOR_DECISION_CODES.has(b.code) && !HARD_BLOCKER_CODES.has(b.code)
          ? true  // unknown codes are hard blockers by default
          : HARD_BLOCKER_CODES.has(b.code)
      );
      const estimatorDecisionsRequired = approvalGate.blockers
        .filter((b) => ESTIMATOR_DECISION_CODES.has(b.code))
        .map((b) => ({
          code: b.code,
          message: b.message,
          path: b.path ?? null,
          category: b.category ?? "review",
        }));
      const allMessages = approvalGate.blockers.map((b) => b.message).join("; ");
      const err = workspaceError(
        allMessages || "Approval blockers must be resolved before approval",
        422
      );
      err.approvalBlockers = {
        ok: false,
        code: estimatorDecisionsRequired.length > 0 && hardBlockers.length === 0
          ? "approval_decisions_required"
          : "approval_hard_blockers",
        hardBlockers,
        estimatorDecisionsRequired,
      };
      throw err;
    }
  }

  const effectiveReviewState = useConsolidated
    ? consolidatedGate.reviewState
    : rs;
  const now = new Date().toISOString();
  const schemaVersion = resolvedResult.schemaVersion ?? TAKEOFF_SCHEMA_VERSION;
  const summary = buildResultSummary(resolvedResult, computed, validation, importPlan);
  const approvedSnapshot = {
    approvedAt: now,
    approvedByUserId: userId ?? null,
    schemaVersion,
    qaGateStatus: qaGate?.status ?? null,
    summary,
    computedMeasurementsJson: computed,
    validationDiagnosticsJson: validation,
    importPlanJson: importPlan,
    reviewState: effectiveReviewState,
    approvalGate,
    importPayload: buildTakeoffImportPayload({
      takeoffJobId,
      takeoffResultId: latestRow?.id ?? null,
      takeoffResult: resolvedResult,
      reviewState: effectiveReviewState,
      computed,
      validation,
      qaGate,
      dimensionEvidence: dimEvidence,
      sourceFileName: null,
      approvedBy: userId ?? null,
      approvedAt: now,
      createdBy: userId ?? null,
      reviewStatus: "approved",
      requireApproved: false,
    }),
  };

  if (latestRow?.id) {
    const nextRaw = {
      ...rawJson,
      _meta: {
        ...(rawJson._meta ?? {}),
        approvedSnapshot,
      },
    };
    const { error: updateErr } = await supabase
      .from("quote_takeoff_results")
      .update({
        normalized_takeoff_json: resolvedResult,
        computed_measurements_json: computed,
        validation_diagnostics_json: validation,
        import_plan_json: importPlan,
        review_status: "approved",
        needs_review: false,
        reviewed_by_user_id: userId ?? null,
        reviewed_at: now,
        raw_ai_result_json: nextRaw,
      })
      .eq("id", latestRow.id)
      .eq("organization_id", organizationId);

    if (updateErr) {
      throw Object.assign(
        new Error(`Failed to approve takeoff result: ${updateErr.message}`),
        { statusCode: 503 }
      );
    }
  } else {
    const insertPayload = {
      organization_id: organizationId,
      takeoff_job_id: takeoffJobId,
      schema_version: schemaVersion,
      raw_ai_result_json: { _meta: { approvedSnapshot } },
      normalized_takeoff_json: resolvedResult,
      computed_measurements_json: computed,
      validation_diagnostics_json: validation,
      import_plan_json: importPlan,
      review_status: "approved",
      needs_review: false,
      reviewed_by_user_id: userId ?? null,
      reviewed_at: now,
    };
    const { error: insertErr } = await supabase
      .from("quote_takeoff_results")
      .insert(insertPayload)
      .select();
    if (insertErr) {
      const isNotNullViolation =
        insertErr.code === "23502" ||
        String(insertErr.message ?? "").includes("null value in column");
      if (!isNotNullViolation) {
        throw Object.assign(
          new Error(`Failed to approve takeoff result: ${insertErr.message}`),
          { statusCode: 503 }
        );
      }
    }
  }

  await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_COMPLETED,
      review_status: "approved",
      updated_at: now,
      result_summary: {
        ...summary,
        savedAt: now,
        schemaVersion,
        reviewStatus: "approved",
        approvedAt: now,
        approvedByUserId: userId ?? null,
        qaGateStatus: qaGate?.status ?? null,
        normalizedTakeoffJson: resolvedResult,
        computedMeasurementsJson: computed,
        validationDiagnosticsJson: validation,
        importPlanJson: importPlan,
      },
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  return {
    ok: true,
    takeoffJobId,
    approvedAt: now,
    approvedByUserId: userId ?? null,
    reviewStatus: "approved",
    approvalStatus: "approved_for_import",
    workflowStatus: "approved_for_import",
    canApprove: false,
    canImport: true,
    qaGate,
    approvalGate,
    summary,
    importPayload: approvedSnapshot.importPayload,
  };
}

/**
 * Consolidated path: save pending edits (if any), validate blocking vs advisory,
 * approve Takeoff, and return payload for Studio Estimate Scope seed/refresh.
 *
 * Idempotent when already approved for the same reviewed result.
 *
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   userId: string|null,
 *   takeoffJobId: string,
 *   takeoffResult?: object|null,
 *   reviewState?: object|null,
 *   dimensionEvidence?: object|null,
 *   acceptAdvisoryWarnings?: boolean,
 *   correctionNotes?: string|null
 * }} params
 */
export async function approveAndBuildEstimate({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  takeoffResult = null,
  reviewState = null,
  dimensionEvidence = null,
  acceptAdvisoryWarnings = false,
  correctionNotes = null
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) {
    throw workspaceError("Takeoff job not found", 404);
  }

  if (String(jobRow.status ?? "") === "processing") {
    throw workspaceError("Takeoff is still processing — wait for completion before approval", 422);
  }

  let latestRow = await loadLatestResultRow(supabase, organizationId, takeoffJobId);
  let resolvedResult = takeoffResult;
  if (!resolvedResult) {
    if (latestRow?.normalized_takeoff_json) {
      resolvedResult = latestRow.normalized_takeoff_json;
    } else {
      const rsSummary = jobRow.result_summary;
      if (rsSummary && typeof rsSummary === "object" && rsSummary.normalizedTakeoffJson) {
        resolvedResult = rsSummary.normalizedTakeoffJson;
      }
    }
  }
  if (!resolvedResult) {
    throw workspaceError("No saved result found for this takeoff workspace", 404);
  }

  if (takeoffResult != null) {
    await saveTakeoffCorrection({
      supabase,
      organizationId,
      userId,
      takeoffJobId,
      takeoffResult: resolvedResult,
      correctionNotes: correctionNotes ?? "Consolidated worksheet save before approve-and-build",
      reviewState,
      baseResultId: latestRow?.id ?? null
    });
    latestRow = await loadLatestResultRow(supabase, organizationId, takeoffJobId);
    if (latestRow?.normalized_takeoff_json) {
      resolvedResult = latestRow.normalized_takeoff_json;
    }
  }

  let computed;
  let validation;
  try {
    ({ computed, validation } = recomputeTakeoffBundle(resolvedResult));
  } catch (e) {
    const err = workspaceError(
      `Takeoff computation failed: ${e instanceof Error ? e.message : String(e)}`,
      422
    );
    err.code = "CALCULATION_FAILED";
    throw err;
  }

  const rawJson =
    typeof latestRow?.raw_ai_result_json === "object" && latestRow.raw_ai_result_json !== null
      ? latestRow.raw_ai_result_json
      : {};
  const qaGate = computeQaGateForResult(resolvedResult, computed, validation, rawJson);
  const rs =
    reviewState != null
      ? normalizeReviewState(reviewState)
      : loadReviewStateFromRaw(rawJson);
  const dimEvidence =
    dimensionEvidence ??
    (typeof rawJson?._meta?.dimensionEvidence === "object"
      ? rawJson._meta.dimensionEvidence
      : null);

  // Preflight with the same validation/QA inputs approveTakeoffJob will use so
  // advisory confirmation is accurate and legacy codes are demoted once.
  const preflight = evaluateConsolidatedApprovalGate({
    takeoffResult: resolvedResult,
    computed,
    validation,
    qaGate,
    dimensionEvidence: dimEvidence,
    reviewState: rs,
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus: jobRow.review_status ?? "needs_review",
    jobStatus: String(jobRow.status ?? "")
  });

  if (preflight.blocking.length > 0) {
    const err = workspaceError(
      preflight.blocking.map((b) => b.message).join("; ") ||
        "Approval blockers must be resolved before approval",
      422
    );
    err.approvalBlockers = {
      ok: false,
      code: "approval_hard_blockers",
      hardBlockers: preflight.blocking,
      estimatorDecisionsRequired: [],
      advisory: preflight.advisory
    };
    throw err;
  }

  if (preflight.advisory.length > 0 && !acceptAdvisoryWarnings) {
    const err = workspaceError(
      `Confirm ${preflight.advisory.length} advisory warning(s) before approval`,
      422
    );
    err.approvalBlockers = {
      ok: false,
      code: "approval_advisory_confirmation_required",
      hardBlockers: [],
      estimatorDecisionsRequired: [],
      advisory: preflight.advisory,
      advisoryCount: preflight.advisory.length
    };
    throw err;
  }

  const summaryView = buildConsolidatedTakeoffSummary(
    resolvedResult,
    preflight.reviewState,
    computed,
    { blocking: preflight.blocking, advisory: preflight.advisory }
  );

  const approved = await approveTakeoffJob({
    supabase,
    organizationId,
    userId,
    takeoffJobId,
    takeoffResult: resolvedResult,
    reviewState: preflight.reviewState,
    dimensionEvidence: dimEvidence,
    approvalMode: "consolidated",
    acceptAdvisoryWarnings: true
  });

  return {
    ...approved,
    displayStatus: deriveConsolidatedDisplayStatus({
      jobStatus: "completed",
      reviewStatus: "approved",
      hasResult: true
    }),
    consolidatedSummary: summaryView,
    advisory: approved.advisory ?? preflight.advisory,
    blocking: [],
    seededEstimateScope: true,
    idempotent: Boolean(approved.idempotent)
  };
}

/**
 * Get the latest saved takeoff result for a workspace.
 *
 * Reads from quote_takeoff_results first; falls back to quote_takeoff_jobs.result_summary
 * if no result row found (e.g., quote_id NOT NULL constraint not yet relaxed).
 * Performs a fresh server-side recompute to guard against calculation changes.
 *
 * @param {{ supabase: object, organizationId: string, takeoffJobId: string }} params
 */
export async function getLatestTakeoffResult({
  supabase,
  organizationId,
  takeoffJobId,
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);

  // ── Legacy v4 fallback ──────────────────────────────────────────────────────
  if (!jobRow) {
    return await _legacyV4GetLatestResult(supabase, organizationId, takeoffJobId);
  }

  // Try quote_takeoff_results (real normalized table).
  const { data: resultRows } = await supabase
    .from("quote_takeoff_results")
    .select(
      "id,organization_id,schema_version,normalized_takeoff_json," +
      "computed_measurements_json,validation_diagnostics_json," +
      "import_plan_json,review_status,created_at,raw_ai_result_json"
    )
    .eq("takeoff_job_id", takeoffJobId)
    .order("created_at", { ascending: false })
    .limit(1);

  let savedResult = resultRows?.[0] ?? null;

  // Fall back to job.result_summary if no result row (quote_id NOT NULL fallback path).
  if (!savedResult) {
    const rs = jobRow.result_summary;
    if (rs && typeof rs === "object" && rs.normalizedTakeoffJson) {
      savedResult = {
        schema_version: rs.schemaVersion ?? null,
        normalized_takeoff_json: rs.normalizedTakeoffJson,
        computed_measurements_json: rs.computedMeasurementsJson,
        validation_diagnostics_json: rs.validationDiagnosticsJson,
        import_plan_json: rs.importPlanJson,
        review_status: rs.reviewStatus ?? "needs_review",
        created_at: rs.savedAt ?? null,
      };
    }
  }

  if (!savedResult) {
    throw workspaceError("No saved result found for this takeoff workspace", 404);
  }

  // Fresh server-side recompute — guards against calculation changes since save.
  let freshComputed;
  try {
    freshComputed = computeTakeoffMeasurements(savedResult.normalized_takeoff_json);
  } catch {
    freshComputed = savedResult.computed_measurements_json;
  }

  // Load file metadata.
  let fileRow = null;
  if (jobRow.quote_file_id) {
    const { data: fileRows } = await supabase
      .from("quote_files")
      .select(FILE_SELECT_COLS)
      .eq("id", jobRow.quote_file_id)
      .limit(1);
    fileRow = fileRows?.[0] ?? null;
  }

  const rawJson = savedResult.raw_ai_result_json ?? null;
  const dimensionEvidence =
    typeof rawJson?._meta?.dimensionEvidence === "object" && rawJson._meta.dimensionEvidence !== null
      ? rawJson._meta.dimensionEvidence
      : null;

  return {
    takeoffJobId,
    savedAt: savedResult.created_at,
    schemaVersion: savedResult.schema_version,
    reviewStatus: savedResult.review_status ?? "needs_review",
    normalizedTakeoffJson: savedResult.normalized_takeoff_json,
    computedMeasurementsJson: freshComputed,
    validationDiagnosticsJson: savedResult.validation_diagnostics_json,
    importPlanJson: savedResult.import_plan_json,
    reviewState: loadReviewStateFromRaw(rawJson),
    importPayload: rawJson?._meta?.approvedSnapshot?.importPayload ?? null,
    // Returned so the frontend can evaluate the same approval gate as the server.
    // Without dimensionEvidence, EVIDENCE_RECONCILIATION blockers are invisible to
    // the local gate, causing canApprove=true on the client while the server returns false.
    dimensionEvidence,
    file: fileRow ? safeFileSummary(fileRow) : null,
  };
}

// ── listTakeoffResults ────────────────────────────────────────────────────────

/**
 * List recent AI extraction run summaries for a takeoff job.
 *
 * Returns safe metadata only — storage_path, API secrets, and full normalized JSON
 * are never included. Sorted newest-first, limit 20.
 *
 * Extracts promptVersion and modelUsed from the _meta envelope in raw_ai_result_json
 * (injected by runAiTakeoffExtraction since v5.3).
 *
 * Falls back to job.result_summary when no table rows exist (quote_id NOT NULL fallback).
 *
 * @param {{ supabase: object, organizationId: string, takeoffJobId: string }} params
 * @returns {Promise<{ ok: true, results: RunSummary[] }>}
 */
export async function listTakeoffResults({ supabase, organizationId, takeoffJobId }) {
  if (!isUuid(organizationId)) throw workspaceError("organizationId must be a valid UUID");
  if (!isUuid(takeoffJobId))   throw workspaceError("takeoffJobId must be a valid UUID");

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) throw workspaceError("Takeoff job not found", 404);

  const { data: rows, error: rowsErr } = await supabase
    .from("quote_takeoff_results")
    .select(
      "id,created_at,review_status,schema_version," +
      "raw_ai_result_json,computed_measurements_json,validation_diagnostics_json"
    )
    .eq("takeoff_job_id", takeoffJobId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (rowsErr) throw workspaceError(`DB error listing results: ${rowsErr.message}`, 503);

  const results = [];

  if (rows && rows.length > 0) {
    for (const row of rows) {
      const computed    = row.computed_measurements_json ?? {};
      const diagnostics = row.validation_diagnostics_json ?? {};
      // _meta was injected by runAiTakeoffExtraction; not present on manual saves.
      const meta        = row.raw_ai_result_json?._meta ?? {};
      results.push({
        id:                   row.id,
        createdAt:            row.created_at,
        promptVersion:        meta.promptVersion ?? null,
        provider:             meta.provider      ?? null, // v5.9: "openai" | "gemini"
        modelUsed:            meta.modelUsed     ?? null,
        computedCountertopSf: computed.countertopExactSf ?? 0,
        computedBacksplashSf: computed.backsplashExactSf ?? 0,
        computedCombinedSf:   computed.combinedExactSf   ?? 0,
        warningCount:         diagnostics.warningCount   ?? diagnostics.warnings?.length ?? 0,
        errorCount:           diagnostics.errorCount     ?? diagnostics.errors?.length   ?? 0,
        reviewStatus:         row.review_status ?? "needs_review",
        schemaVersion:        row.schema_version ?? null,
        source:               "results_table",
      });
    }
  }

  // Fallback: surface the job's result_summary when no table rows exist.
  if (results.length === 0 && jobRow.result_summary?.aiExtraction) {
    const rs      = jobRow.result_summary;
    const computed    = rs.computedMeasurementsJson ?? {};
    const diagnostics = rs.validationDiagnosticsJson ?? {};
    results.push({
      id:                   rs.resultRowId ?? null,
      createdAt:            rs.savedAt ?? jobRow.updated_at ?? new Date().toISOString(),
      promptVersion:        rs.promptVersion ?? null,
      provider:             rs.provider      ?? null, // v5.9
      modelUsed:            rs.modelUsed ?? null,
      computedCountertopSf: rs.countertopExactSf ?? computed.countertopExactSf ?? 0,
      computedBacksplashSf: rs.backsplashExactSf ?? computed.backsplashExactSf ?? 0,
      computedCombinedSf:   rs.combinedExactSf   ?? computed.combinedExactSf   ?? 0,
      warningCount:         rs.warningCount ?? diagnostics.warningCount ?? 0,
      errorCount:           rs.errorCount   ?? diagnostics.errorCount   ?? 0,
      reviewStatus:         rs.reviewStatus ?? "needs_review",
      schemaVersion:        rs.schemaVersion ?? null,
      source:               "result_summary",
    });
  }

  return { ok: true, results };
}

// ── getResultById ─────────────────────────────────────────────────────────────

/**
 * Load a specific AI extraction result by ID, with fresh server-side recompute.
 *
 * Returns full normalized JSON + recomputed measurements + diagnostics + import plan.
 * storage_path and secrets are never returned.
 *
 * @param {{ supabase: object, organizationId: string, takeoffJobId: string, resultId: string }} params
 */
export async function getResultById({
  supabase,
  organizationId,
  takeoffJobId,
  resultId,
}) {
  if (!isUuid(organizationId)) throw workspaceError("organizationId must be a valid UUID");
  if (!isUuid(takeoffJobId))   throw workspaceError("takeoffJobId must be a valid UUID");
  if (!isUuid(resultId))       throw workspaceError("resultId must be a valid UUID");

  // Verify job ownership first (cross-org returns 404 via filter).
  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) throw workspaceError("Takeoff job not found", 404);

  const { data: resRows, error: resErr } = await supabase
    .from("quote_takeoff_results")
    .select(
      "id,created_at,review_status,schema_version," +
      "raw_ai_result_json,normalized_takeoff_json," +
      "computed_measurements_json,validation_diagnostics_json,import_plan_json"
    )
    .eq("id", resultId)
    .eq("takeoff_job_id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (resErr) throw workspaceError(`DB error loading result: ${resErr.message}`, 503);
  if (!resRows || resRows.length === 0) throw workspaceError("Result not found", 404);
  const row = resRows[0];

  if (!row.normalized_takeoff_json) throw workspaceError("Result has no takeoff JSON", 404);

  // Fresh server-side recompute (guards against calculation changes since save).
  let freshComputed, freshValidation, freshImportPlan;
  try {
    freshComputed    = computeTakeoffMeasurements(row.normalized_takeoff_json);
    freshValidation  = validateTakeoffResult(row.normalized_takeoff_json, freshComputed);
    freshImportPlan  = planTakeoffImport(row.normalized_takeoff_json, freshComputed);
  } catch (calcErr) {
    // Use stored values if recompute fails.
    freshComputed    = row.computed_measurements_json;
    freshValidation  = row.validation_diagnostics_json;
    freshImportPlan  = row.import_plan_json;
  }

  const meta = row.raw_ai_result_json?._meta ?? {};

  // v5.8: recompute QA gate from fresh data (ensures consistency with recomputed measurements).
  let freshQaGate = null;
  try {
    freshQaGate = evaluateTakeoffQaGate({
      takeoffResult:         row.normalized_takeoff_json,
      computedMeasurements:  freshComputed,
      validationDiagnostics: freshValidation,
      dimensionEvidence:     meta.dimensionEvidence ?? null,
      pageInventory:         meta.pageInventory     ?? null,
    });
  } catch {
    freshQaGate = meta.qaGate ?? null; // fall back to stored value
  }

  return {
    ok:                        true,
    takeoffJobId,
    resultId:                  row.id,
    savedAt:                   row.created_at,
    schemaVersion:             row.schema_version ?? null,
    reviewStatus:              row.review_status ?? "needs_review",
    promptVersion:             meta.promptVersion ?? null,
    provider:                  meta.provider      ?? null, // v5.9: "openai" | "gemini"
    modelUsed:                 meta.modelUsed     ?? null,
    normalizedTakeoffJson:     row.normalized_takeoff_json,
    computedMeasurementsJson:  freshComputed,
    validationDiagnosticsJson: freshValidation,
    importPlanJson:            freshImportPlan,
    pageInventory:             meta.pageInventory    ?? null, // v5.4: null for pre-inventory runs
    dimensionEvidence:         meta.dimensionEvidence ?? null, // v5.5: null for pre-evidence runs
    qaGate:                    freshQaGate,           // v5.8: automatic QA gate result
  };
}

// ── Legacy v4 helpers (read-only) ─────────────────────────────────────────────

/**
 * Attempt to load a v4 workspace from quote_files.metadata.
 * Called when no quote_takeoff_jobs row exists for the given ID.
 * Returns limited workspace data or throws 404.
 */
async function _legacyV4GetWorkspace(supabase, organizationId, takeoffJobId) {
  const { data: fileRows } = await supabase
    .from("quote_files")
    .select(FILE_SELECT_COLS)
    .eq("id", takeoffJobId)
    .limit(1);

  if (!fileRows || fileRows.length === 0) {
    throw workspaceError("Takeoff workspace not found", 404);
  }
  const fr = fileRows[0];
  if (String(fr.organization_id ?? "") !== organizationId) {
    throw workspaceError("Takeoff workspace not found", 404);
  }
  const meta = typeof fr.metadata === "object" && fr.metadata !== null ? fr.metadata : {};
  if (!meta.takeoffWorkspace) {
    throw workspaceError("Takeoff workspace not found", 404);
  }
  return {
    takeoffJobId,
    reviewStatus: meta.takeoffWorkspace.reviewStatus ?? "needs_review",
    approvalStatus: meta.takeoffWorkspace.reviewStatus ?? "needs_review",
    approvedAt: null,
    approvedByUserId: null,
    canApprove: false,
    startedAt: meta.takeoffWorkspace.startedAt ?? null,
    hasSavedResult: Boolean(meta.takeoffResult),
    resultCount: meta.takeoffResult ? 1 : 0,
    latestResult: null,
    isWorkspace: true,
    legacyV4: true,
    file: safeFileSummary(fr),
    processing: {
      pageProgress: null,
      asyncStatus: null,
    },
  };
}

/**
 * Attempt to load a v4 latest result from quote_files.metadata.
 * Called when no quote_takeoff_jobs row exists for the given ID.
 */
async function _legacyV4GetLatestResult(supabase, organizationId, takeoffJobId) {
  const { data: fileRows } = await supabase
    .from("quote_files")
    .select(FILE_SELECT_COLS)
    .eq("id", takeoffJobId)
    .limit(1);

  if (!fileRows || fileRows.length === 0) {
    throw workspaceError("Takeoff workspace not found", 404);
  }
  const fr = fileRows[0];
  if (String(fr.organization_id ?? "") !== organizationId) {
    throw workspaceError("Takeoff workspace not found", 404);
  }
  const meta = typeof fr.metadata === "object" && fr.metadata !== null ? fr.metadata : {};
  const saved = meta.takeoffResult ?? null;
  if (!saved) {
    throw workspaceError("No saved result found for this takeoff workspace", 404);
  }
  let freshComputed;
  try {
    freshComputed = computeTakeoffMeasurements(saved.normalizedTakeoffJson);
  } catch {
    freshComputed = saved.computedMeasurementsJson;
  }
  return {
    takeoffJobId,
    savedAt: saved.savedAt,
    schemaVersion: saved.schemaVersion,
    reviewStatus: saved.reviewStatus ?? "needs_review",
    normalizedTakeoffJson: saved.normalizedTakeoffJson,
    computedMeasurementsJson: freshComputed,
    validationDiagnosticsJson: saved.validationDiagnosticsJson,
    importPlanJson: saved.importPlanJson,
    legacyV4: true,
    file: safeFileSummary(fr),
  };
}
