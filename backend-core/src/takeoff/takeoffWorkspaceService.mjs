/**
 * takeoffWorkspaceService — v4.5 normalized takeoff workspace.
 *
 * Architecture (v4.5):
 *   Uses quote_takeoff_jobs and quote_takeoff_results as the durable source of truth.
 *   quote_takeoff_jobs.quote_id is nullable (confirmed via eliteos_quote_files_takeoff_storage.sql),
 *   enabling pre-quote AI Takeoff Lab / Studio / Shared Inbox flows.
 *
 *   createTakeoffWorkspace → inserts a real quote_takeoff_jobs row (quote_id = null)
 *   saveTakeoffResult / saveTakeoffCorrection → insert a real quote_takeoff_results row
 *   getLatestTakeoffResult → reads from quote_takeoff_results (+ result_summary pointer)
 *
 * Canonical result invariant:
 *   Every successful Save/Approve resultId MUST be a physical quote_takeoff_results.id.
 *   result_summary.resultRowId is a pointer/cache only — never a synthetic UUID.
 *   Failed physical inserts return takeoff_result_persistence_failed (no summary promotion).
 *
 * quote_takeoff_results.quote_id:
 *   May be null for Studio/intake Takeoffs (see eliteos_quote_takeoff_results_quote_id_nullable_v1.sql).
 *   When the job has a legacy quote_id, it is copied onto the result row.
 *   FK to quote_headers is retained for non-null values.
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
  buildEstimatorConfirmedMeta,
  findPendingAiTakeoffResult,
  readAiHandlingMeta,
  readResultMutationRevision,
  selectAuthoritativeTakeoffResult,
  summarizeAiFindingsPreview
} from "./takeoffAuthoritativeResult.mjs";
import { takeoffDraftsSemanticallyEqual } from "./takeoffDraftEquality.mjs";
import {
  autoCompleteRoomReviewState,
  buildConsolidatedTakeoffSummary,
  collectConsolidatedHardBlockers,
  deriveConsolidatedDisplayStatus,
  evaluateConsolidatedApprovalGate,
  resolveConfirmAdvisories,
  rewriteConsolidatedAdvisoryMessage
} from "./takeoffConsolidatedApproval.mjs";
import { buildTakeoffImportPayload } from "./takeoffImportPayload.mjs";
import { loadReviewStateFromRaw, normalizeReviewState } from "./takeoffReviewStatus.mjs";
import { ESTIMATOR_DECISION_CODES, HARD_BLOCKER_CODES } from "./takeoffWorkflowState.mjs";

export { resolveConfirmAdvisories, rewriteConsolidatedAdvisoryMessage };

/** Pilot marker — proves hosted Brain is serving the consolidated-v3 approval policy. */
export const CONSOLIDATED_APPROVAL_POLICY_VERSION = "consolidated-v3";

/**
 * Safe pilot diagnostics (no tokens, org/user ids, or full takeoff payload).
 * @param {object} input
 */
export function buildApprovalDiagnostics(input = {}) {
  const legacyCodes = (input.legacyValidationCodes ?? []).map((c) => String(c)).slice(0, 20);
  const hard = (input.hardBlockers ?? []).map((b) => ({
    code: b?.code ?? null,
    message: String(b?.message ?? "").slice(0, 160)
  }));
  const advisory = (input.advisory ?? []).map((b) => ({
    code: b?.code ?? null,
    message: String(b?.message ?? "").slice(0, 160)
  }));
  return {
    approvalMode: input.approvalMode ?? null,
    confirmAdvisories: Boolean(input.confirmAdvisories),
    skipLegacyValidationGate: Boolean(input.skipLegacyValidationGate),
    hardBlockerCount: hard.length,
    hardBlockers: hard.slice(0, 12),
    advisoryCount: advisory.length,
    advisorySample: advisory.slice(0, 12),
    legacyValidationCodes: legacyCodes,
    branch: input.branch ?? null,
    approvalPolicyVersion: CONSOLIDATED_APPROVAL_POLICY_VERSION
  };
}

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

/**
 * Structured Save failure when a physical quote_takeoff_results row cannot be created.
 * Never invents a synthetic resultId.
 */
export function takeoffResultPersistenceFailed(details = {}) {
  console.warn(
    "[takeoffWorkspace] takeoff_result_persistence_failed",
    JSON.stringify({
      takeoffJobId: details.takeoffJobId ?? null,
      organizationId: details.organizationId ?? null,
      attemptedBaseResultId: details.attemptedBaseResultId ?? null,
      currentResultId: details.currentResultId ?? null,
      mutationRevision: details.mutationRevision ?? null,
      dbErrorCode: details.dbErrorCode ?? null,
      quoteIdPresent: Boolean(details.quoteIdPresent),
      errorCode: "takeoff_result_persistence_failed"
    })
  );
  const err = workspaceError(
    "The Takeoff draft could not be saved. Your edits remain on this screen.",
    503
  );
  err.code = "takeoff_result_persistence_failed";
  return err;
}

/**
 * Approval / integrity failure when the canonical result is not a physical row.
 */
export function takeoffResultNotPersisted(details = {}) {
  console.warn(
    "[takeoffWorkspace] takeoff_result_not_persisted",
    JSON.stringify({
      takeoffJobId: details.takeoffJobId ?? null,
      organizationId: details.organizationId ?? null,
      claimedResultId: details.claimedResultId ?? null,
      errorCode: "takeoff_result_not_persisted"
    })
  );
  const err = workspaceError(
    "The saved Takeoff result could not be verified. Refresh and save the draft before approval.",
    422
  );
  err.code = "takeoff_result_not_persisted";
  return err;
}

function resolveResultQuoteId(jobRow) {
  const q = jobRow?.quote_id;
  return q && isUuid(q) ? q : null;
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

/**
 * Load a physical result row by id (org + job scoped). Returns null if missing.
 */
export async function loadPhysicalTakeoffResultRow(
  supabase,
  { organizationId, takeoffJobId, resultId }
) {
  if (!isUuid(resultId)) return null;
  const { data, error } = await supabase
    .from("quote_takeoff_results")
    .select(RESULT_DETAIL_SELECT_COLS)
    .eq("id", resultId)
    .eq("takeoff_job_id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);
  if (error) {
    throw Object.assign(new Error(`DB error loading takeoff result: ${error.message}`), {
      statusCode: 503
    });
  }
  return data?.[0] ?? null;
}

/**
 * Assert resultId is a real quote_takeoff_results row for this job/org.
 */
export async function assertPhysicalTakeoffResult(
  supabase,
  { organizationId, takeoffJobId, resultId }
) {
  const row = await loadPhysicalTakeoffResultRow(supabase, {
    organizationId,
    takeoffJobId,
    resultId
  });
  if (!row) {
    throw takeoffResultNotPersisted({
      organizationId,
      takeoffJobId,
      claimedResultId: resultId
    });
  }
  return row;
}

/**
 * Authoritative latest result — estimator-confirmed / owned geometry outranks newer AI.
 * Pass job.result_summary so correction fallback wins when result-row insert was blocked.
 * @returns {Promise<Record<string, unknown> | null>}
 */
/**
 * Load recent result rows for authoritative selection (newest-first, capped).
 * @returns {Promise<object[]>}
 */
async function loadRecentResultRows(supabase, organizationId, takeoffJobId) {
  const { data: rows, error } = await supabase
    .from("quote_takeoff_results")
    .select(RESULT_DETAIL_SELECT_COLS)
    .eq("takeoff_job_id", takeoffJobId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    throw Object.assign(new Error(`DB error loading takeoff result: ${error.message}`), {
      statusCode: 503,
    });
  }
  return rows || [];
}

async function loadLatestResultRow(
  supabase,
  organizationId,
  takeoffJobId,
  jobResultSummary = null,
  preloadedRows = null
) {
  const rows = Array.isArray(preloadedRows)
    ? preloadedRows
    : await loadRecentResultRows(supabase, organizationId, takeoffJobId);
  return selectAuthoritativeTakeoffResult(rows, {
    jobResultSummary
  }).row;
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
  forceNew = false
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(quoteFileId)) {
    throw workspaceError("quoteFileId must be a valid UUID");
  }

  const fileRow = await loadVerifiedFileRow(supabase, organizationId, quoteFileId);

  // Idempotency: return existing job if one already exists for this file + org.
  // forceNew (Quote Flow Inbox fresh start) always inserts a new job row.
  if (forceNew !== true) {
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
  _timing = null,
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  _timing?.mark?.("job_lookup");

  // ── Legacy v4 fallback ──────────────────────────────────────────────────────
  if (!jobRow) {
    return await _legacyV4GetWorkspace(supabase, organizationId, takeoffJobId);
  }

  // Parallel: file metadata + recent results (removes prior sequential triple:
  // file → id-count → full latest load).
  const filePromise = jobRow.quote_file_id
    ? supabase
        .from("quote_files")
        .select(FILE_SELECT_COLS)
        .eq("id", jobRow.quote_file_id)
        .limit(1)
        .then(({ data }) => data?.[0] ?? null)
    : Promise.resolve(null);
  const resultsPromise = loadRecentResultRows(supabase, organizationId, takeoffJobId);
  const [fileRow, resultRows] = await Promise.all([filePromise, resultsPromise]);
  _timing?.mark?.("file_and_results");

  const resultCount = resultRows.length;
  const hasJobSummary = jobHasResultSummary(jobRow);
  const hasSavedResult = Boolean(resultCount > 0 || hasJobSummary);

  const latestRow = await loadLatestResultRow(
    supabase,
    organizationId,
    takeoffJobId,
    jobRow.result_summary,
    resultRows
  );
  const latestResult = latestRow ? buildLatestResultMeta(latestRow) : null;
  _timing?.mark?.("select_authoritative");

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
  _timing?.mark?.("can_approve");

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
    // Staff-safe Quote Flow draft selections (no secrets / no raw Graph HTML).
    // Legacy jobs may omit quoteFlow entirely — expose nulls, never throw.
    quoteFlowRequestedSelections: readQuoteFlowNestedObject(
      jobRow.metadata,
      "requestedSelections"
    ),
    quoteFlowStartingConfiguration: readQuoteFlowNestedObject(
      jobRow.metadata,
      "startingConfiguration"
    ),
    quoteFlowAccountDirectoryLink: readQuoteFlowNestedObject(
      jobRow.metadata,
      "accountDirectoryLink"
    ),
    quoteName: readQuoteFlowQuoteName(jobRow.metadata)
  };
}

/** Null-safe nested quoteFlow object reader for legacy takeoff jobs. */
export function readQuoteFlowNestedObject(metadata, key) {
  try {
    const qf =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata.quoteFlow
        : null;
    if (!qf || typeof qf !== "object" || Array.isArray(qf)) return null;
    const value = qf[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function readQuoteFlowQuoteName(metadata) {
  try {
    const qf =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata.quoteFlow
        : null;
    return typeof qf?.quoteName === "string" ? qf.quoteName : null;
  } catch {
    return null;
  }
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
    quote_id: resolveResultQuoteId(jobRow),
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

  // Physical row required — never promote a synthetic or summary-only result.
  const { data: resultRows, error: resultInsertErr } = await supabase
    .from("quote_takeoff_results")
    .insert(resultPayload)
    .select();

  if (resultInsertErr || !resultRows?.length || !resultRows[0]?.id) {
    throw takeoffResultPersistenceFailed({
      takeoffJobId,
      organizationId,
      attemptedBaseResultId: null,
      currentResultId: null,
      mutationRevision: null,
      dbErrorCode: resultInsertErr?.code ?? "insert_returned_empty",
      quoteIdPresent: Boolean(resolveResultQuoteId(jobRow))
    });
  }

  const resultRowId = resultRows[0].id;

  const priorSummary =
    jobRow.result_summary && typeof jobRow.result_summary === "object"
      ? jobRow.result_summary
      : {};

  await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_COMPLETED,
      review_status: reviewStatus,
      updated_at: now,
      result_summary: {
        ...priorSummary,
        ...summary,
        savedAt: now,
        schemaVersion,
        reviewStatus,
        normalizedTakeoffJson: takeoffResult,
        computedMeasurementsJson: computed,
        validationDiagnosticsJson: validation,
        importPlanJson: importPlan,
        resultRowId,
        summaryOnlyPromotion: false
      },
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  return {
    ok: true,
    takeoffJobId,
    resultId: resultRowId,
    savedAt: now,
    schemaVersion,
    reviewStatus,
    summary,
  };
}

/**
 * Reopen an approved Takeoff job so Edit Measurements can mutate a new draft.
 * Keeps prior approved result rows; only flips job review_status to needs_review.
 * No-op when the job is already editable.
 */
export async function reopenTakeoffJobForMeasurementRevision({
  supabase,
  organizationId,
  takeoffJobId,
  userId = null
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
  const status = String(jobRow.review_status ?? "needs_review").toLowerCase();
  if (status !== "approved") {
    return {
      ok: true,
      alreadyEditable: true,
      reviewStatus: jobRow.review_status ?? "needs_review"
    };
  }
  const now = new Date().toISOString();
  const priorSummary =
    jobRow.result_summary && typeof jobRow.result_summary === "object"
      ? jobRow.result_summary
      : {};
  const { error } = await supabase
    .from("quote_takeoff_jobs")
    .update({
      review_status: "needs_review",
      updated_at: now,
      result_summary: {
        ...priorSummary,
        reviewStatus: "needs_review",
        editableRevisionOpenedAt: now,
        editableRevisionOpenedByUserId: userId ?? null,
        priorApprovedAt: priorSummary.approvedAt ?? null,
        priorApprovedByUserId: priorSummary.approvedByUserId ?? null
      }
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);
  if (error) {
    throw Object.assign(new Error(`Failed to reopen Takeoff for revision: ${error.message}`), {
      statusCode: 503
    });
  }
  return { ok: true, alreadyEditable: false, reviewStatus: "needs_review" };
}

/**
 * Save estimator corrections with an audit payload appended to result metadata.
 *
 * Inserts a new quote_takeoff_results row and resets job approval to needs_review.
 * Corrections are stored in raw_ai_result_json._corrections (no dedicated table).
 * Approved jobs are rejected until reopenTakeoffJobForMeasurementRevision runs.
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
  aiHandling = null,
  clientMutationRevision = null,
  reopenIfApproved = false,
  correctionTelemetry = null,
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

  let jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) {
    throw workspaceError("Takeoff job not found", 404);
  }

  // Approved Takeoff is immutable until Edit Measurements reopens an editable revision.
  // Quote Flow Set Scope may opt in to reopen automatically for still-unscoped work.
  if (String(jobRow.review_status ?? "").toLowerCase() === "approved") {
    if (reopenIfApproved === true) {
      await reopenTakeoffJobForMeasurementRevision({
        supabase,
        organizationId,
        takeoffJobId,
        userId
      });
      jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
      if (!jobRow) {
        throw workspaceError("Takeoff job not found", 404);
      }
    }
    if (String(jobRow.review_status ?? "").toLowerCase() === "approved") {
      const err = workspaceError(
        "Approved Takeoff measurements cannot be changed. Open Edit Measurements to start a new editable revision.",
        409
      );
      err.code = "takeoff_already_approved";
      throw err;
    }
  }

  let computed, validation, importPlan;
  try {
    ({ computed, validation, importPlan } = recomputeTakeoffBundle(takeoffResult));
  } catch (e) {
    throw workspaceError(
      `Takeoff computation failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const latestRow = await loadLatestResultRow(
    supabase,
    organizationId,
    takeoffJobId,
    jobRow.result_summary
  );
  const incomingRevision =
    clientMutationRevision == null ? null : Number(clientMutationRevision);
  if (
    incomingRevision != null &&
    (!Number.isSafeInteger(incomingRevision) || incomingRevision < 1)
  ) {
    throw workspaceError("clientMutationRevision must be a positive safe integer");
  }
  const summaryRevision = Number(jobRow.result_summary?.clientMutationRevision ?? 0);
  const rowRevision = readResultMutationRevision(latestRow);
  const latestClientRevision = Math.max(
    Number.isSafeInteger(summaryRevision) ? summaryRevision : 0,
    rowRevision
  );
  const latestResultId =
    String(latestRow?.id ?? "").trim() ||
    String(jobRow.result_summary?.resultRowId ?? "").trim() ||
    null;
  const currentHeadResultId = latestResultId;

  if (
    baseResultId &&
    latestResultId &&
    String(baseResultId) !== latestResultId
  ) {
    console.info(
      "[takeoffWorkspace] stale_takeoff_correction",
      JSON.stringify({
        takeoffJobId,
        requestedBaseResultId: String(baseResultId),
        currentHeadResultId,
        requestedMutationRevision: incomingRevision,
        currentMutationRevision: latestClientRevision,
        unchanged: false,
        errorCode: "stale_takeoff_correction"
      })
    );
    const err = workspaceError(
      "The estimator draft changed after editing began; stale correction was ignored",
      409
    );
    err.code = "stale_takeoff_correction";
    err.latestResultId = latestResultId;
    err.latestClientMutationRevision = latestClientRevision;
    throw err;
  }

  // Idempotent no-op: current base + semantically equal draft → do not create a row.
  // Stale base already 409'd above; content resembling an older state is fine when base is current.
  const currentCanonicalDraft =
    latestRow?.normalized_takeoff_json ??
    jobRow.result_summary?.normalizedTakeoffJson ??
    null;
  if (
    currentCanonicalDraft &&
    takeoffDraftsSemanticallyEqual(takeoffResult, currentCanonicalDraft)
  ) {
    const unchangedRevision =
      latestClientRevision > 0
        ? latestClientRevision
        : incomingRevision != null
          ? incomingRevision
          : 0;
    console.info(
      "[takeoffWorkspace] takeoff_correction_unchanged",
      JSON.stringify({
        takeoffJobId,
        requestedBaseResultId: baseResultId ? String(baseResultId) : null,
        currentHeadResultId,
        requestedMutationRevision: incomingRevision,
        currentMutationRevision: unchangedRevision,
        createdResultId: null,
        promotedResultId: currentHeadResultId,
        unchanged: true
      })
    );
    return {
      ok: true,
      unchanged: true,
      takeoffJobId,
      correctionId: null,
      resultId: currentHeadResultId,
      savedAt: latestRow?.created_at ?? jobRow.result_summary?.savedAt ?? new Date().toISOString(),
      clientMutationRevision: unchangedRevision,
      normalizedTakeoffJson: currentCanonicalDraft,
      takeoffResult: currentCanonicalDraft,
      schemaVersion:
        latestRow?.schema_version ??
        jobRow.result_summary?.schemaVersion ??
        takeoffResult.schemaVersion ??
        TAKEOFF_SCHEMA_VERSION,
      reviewStatus: latestRow?.review_status ?? jobRow.review_status ?? "needs_review",
      approvalStatus: "needs_review",
      canApprove: computeCanApprove({
        hasSavedResult: true,
        validation,
        qaGate: computeQaGateForResult(
          currentCanonicalDraft,
          computed,
          validation,
          latestRow?.raw_ai_result_json ?? null
        ),
        reviewStatus: latestRow?.review_status ?? jobRow.review_status ?? "needs_review"
      }),
      correction: null,
      summary: buildResultSummary(currentCanonicalDraft, computed, validation, importPlan)
    };
  }

  if (
    incomingRevision != null &&
    Number.isSafeInteger(latestClientRevision) &&
    incomingRevision <= latestClientRevision
  ) {
    console.info(
      "[takeoffWorkspace] stale_takeoff_correction",
      JSON.stringify({
        takeoffJobId,
        requestedBaseResultId: baseResultId ? String(baseResultId) : null,
        currentHeadResultId,
        requestedMutationRevision: incomingRevision,
        currentMutationRevision: latestClientRevision,
        unchanged: false,
        errorCode: "stale_takeoff_correction"
      })
    );
    const err = workspaceError(
      "A newer estimator draft is already saved; stale correction was ignored",
      409
    );
    err.code = "stale_takeoff_correction";
    err.latestResultId = latestResultId;
    err.latestClientMutationRevision = latestClientRevision;
    throw err;
  }
  const now = new Date().toISOString();
  const schemaVersion = takeoffResult.schemaVersion ?? TAKEOFF_SCHEMA_VERSION;
  const summary = buildResultSummary(takeoffResult, computed, validation, importPlan);
  const estimatorConfirmed = buildEstimatorConfirmedMeta({
    userId,
    source: "estimator_save",
    now
  });
  const normalizedReviewState =
    reviewState != null ? normalizeReviewState(reviewState) : null;

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
    // Plan-source + field-level correction ops for later analysis (no dashboard in this slice).
    planSource:
      correctionTelemetry?.planSource && typeof correctionTelemetry.planSource === "object"
        ? correctionTelemetry.planSource
        : null,
    events: Array.isArray(correctionTelemetry?.events)
      ? correctionTelemetry.events.slice(0, 100)
      : [],
  };

  const existingRaw =
    typeof latestRow?.raw_ai_result_json === "object" && latestRow.raw_ai_result_json !== null
      ? latestRow.raw_ai_result_json
      : {};
  const existingCorrections = Array.isArray(existingRaw._corrections)
    ? existingRaw._corrections
    : [];
  const priorHandling = readAiHandlingMeta(latestRow, jobRow.result_summary);
  const aiHandlingPatch = {};
  if (aiHandling && typeof aiHandling === "object") {
    if (aiHandling.lastMergedAiResultId) {
      aiHandlingPatch.lastMergedAiResultId = String(aiHandling.lastMergedAiResultId);
    }
    if (aiHandling.sourceResultId) {
      aiHandlingPatch.sourceResultId = String(aiHandling.sourceResultId);
    }
    if (aiHandling.dismissAiResultId) {
      const dismissed = new Set(priorHandling.dismissedAiResultIds);
      dismissed.add(String(aiHandling.dismissAiResultId));
      aiHandlingPatch.dismissedAiResultIds = [...dismissed];
    } else if (Array.isArray(aiHandling.dismissedAiResultIds)) {
      aiHandlingPatch.dismissedAiResultIds = [
        ...new Set(aiHandling.dismissedAiResultIds.map(String).filter(Boolean))
      ];
    }
  }
  const rawPayload = {
    ...existingRaw,
    _corrections: [...existingCorrections, correctionEntry],
    _meta: {
      ...(existingRaw._meta ?? {}),
      lastCorrectionAt: now,
      lastCorrectedByUserId: userId ?? null,
      estimatorConfirmed,
      ...(incomingRevision != null ? { clientMutationRevision: incomingRevision } : {}),
      ...aiHandlingPatch,
      ...(priorHandling.lastMergedAiResultId && !aiHandlingPatch.lastMergedAiResultId
        ? { lastMergedAiResultId: priorHandling.lastMergedAiResultId }
        : {}),
      ...(priorHandling.dismissedAiResultIds.length && !aiHandlingPatch.dismissedAiResultIds
        ? { dismissedAiResultIds: priorHandling.dismissedAiResultIds }
        : {}),
      ...(normalizedReviewState != null ? { reviewState: normalizedReviewState } : {}),
    },
  };

  const resultPayload = {
    organization_id: organizationId,
    takeoff_job_id: takeoffJobId,
    quote_id: resolveResultQuoteId(jobRow),
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

  const { data: resultRows, error: resultInsertErr } = await supabase
    .from("quote_takeoff_results")
    .insert(resultPayload)
    .select();

  if (resultInsertErr || !resultRows?.length || !resultRows[0]?.id) {
    throw takeoffResultPersistenceFailed({
      takeoffJobId,
      organizationId,
      attemptedBaseResultId: baseResultId,
      currentResultId: latestResultId,
      mutationRevision: incomingRevision,
      dbErrorCode: resultInsertErr?.code ?? "insert_returned_empty",
      quoteIdPresent: Boolean(resolveResultQuoteId(jobRow))
    });
  }

  const resultRowId = resultRows[0].id;
  // Verify the inserted row is physically addressable before promoting the pointer.
  await assertPhysicalTakeoffResult(supabase, {
    organizationId,
    takeoffJobId,
    resultId: resultRowId
  });

  const priorSummary =
    jobRow.result_summary && typeof jobRow.result_summary === "object"
      ? jobRow.result_summary
      : {};

  await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_COMPLETED,
      review_status: "needs_review",
      updated_at: now,
      result_summary: {
        ...priorSummary,
        ...summary,
        savedAt: now,
        schemaVersion,
        reviewStatus: "needs_review",
        approvedAt: null,
        approvedByUserId: null,
        lastCorrectionId: correctionEntry.id,
        estimatorConfirmed,
        ...(incomingRevision != null ? { clientMutationRevision: incomingRevision } : {}),
        ...(normalizedReviewState != null ? { reviewState: normalizedReviewState } : {}),
        ...(rawPayload._meta?.lastMergedAiResultId
          ? { lastMergedAiResultId: rawPayload._meta.lastMergedAiResultId }
          : {}),
        ...(Array.isArray(rawPayload._meta?.dismissedAiResultIds)
          ? { dismissedAiResultIds: rawPayload._meta.dismissedAiResultIds }
          : {}),
        normalizedTakeoffJson: takeoffResult,
        computedMeasurementsJson: computed,
        validationDiagnosticsJson: validation,
        importPlanJson: importPlan,
        resultRowId,
        summaryOnlyPromotion: false
      },
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  console.info(
    "[takeoffWorkspace] takeoff_correction_saved",
    JSON.stringify({
      takeoffJobId,
      requestedBaseResultId: baseResultId ? String(baseResultId) : null,
      currentHeadResultId: latestResultId,
      requestedMutationRevision: incomingRevision,
      currentMutationRevision: incomingRevision,
      createdResultId: resultRowId,
      promotedResultId: resultRowId,
      unchanged: false,
      summaryOnlyPromotion: false
    })
  );

  return {
    ok: true,
    unchanged: false,
    takeoffJobId,
    correctionId: correctionEntry.id,
    resultId: resultRowId,
    savedAt: now,
    clientMutationRevision: incomingRevision,
    normalizedTakeoffJson: takeoffResult,
    takeoffResult,
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
  confirmAdvisories = undefined,
  /**
   * Consolidated approve-and-build only. When true, worksheet hard blockers are
   * the sole approval criteria — legacy evaluateTakeoffApprovalGate / VALIDATION_ERRORS
   * / QA do_not_import cannot re-block after consolidated preflight.
   */
  skipLegacyValidationGate = false,
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

  const advisoriesConfirmed = resolveConfirmAdvisories({
    confirmAdvisories,
    acceptAdvisoryWarnings
  });
  const useConsolidated = String(approvalMode ?? "legacy") === "consolidated";
  const skipLegacy = useConsolidated && skipLegacyValidationGate === true;

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  if (!jobRow) {
    throw workspaceError("Takeoff job not found", 404);
  }

  if (String(jobRow.status ?? "") === "processing") {
    throw workspaceError("Takeoff is still processing — wait for completion before approval", 422);
  }

  const latestRow = await loadLatestResultRow(
    supabase,
    organizationId,
    takeoffJobId,
    jobRow.result_summary
  );
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

  let approvalGate;
  let consolidatedGate = null;
  let consolidatedAdvisory = [];
  const reviewStatusLower = String(jobRow.review_status ?? "needs_review").toLowerCase();
  const alreadyApproved = reviewStatusLower === "approved";

  if (useConsolidated) {
    const effectiveRs = autoCompleteRoomReviewState(resolvedResult, rs);
    // Worksheet-only hard blockers — never promote legacy VALIDATION_ERRORS / QA.
    const hardBlockers = collectConsolidatedHardBlockers(
      resolvedResult,
      effectiveRs,
      computed
    );

    // Advisory surface only (legacy codes demoted). Not used for hard blocking.
    consolidatedGate = evaluateConsolidatedApprovalGate({
      takeoffResult: resolvedResult,
      computed,
      validation,
      qaGate,
      dimensionEvidence: dimEvidence,
      reviewState: effectiveRs,
      hasSavedResult: true,
      hasUnsavedEdits: false,
      reviewStatus: jobRow.review_status ?? "needs_review",
      jobStatus: String(jobRow.status ?? "")
    });
    consolidatedAdvisory = consolidatedGate.advisory ?? [];
    const blockingIssues = hardBlockers;

    const legacyValidationCodes = [
      ...(validation?.hasErrors ? ["VALIDATION_ERRORS"] : []),
      ...((validation?.diagnostics ?? [])
        .filter((d) => String(d.level ?? "").toLowerCase() === "error")
        .map((d) => d.code)
        .filter(Boolean))
    ];
    if (qaGate?.status === "do_not_import") legacyValidationCodes.push("QA_GATE_BLOCKED");

    if (alreadyApproved) {
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
        advisory: consolidatedAdvisory,
        advisoryCount: consolidatedAdvisory.length,
        blocking: [],
        estimateScopeRefreshRequired: true,
        approvalPolicyVersion: CONSOLIDATED_APPROVAL_POLICY_VERSION,
        approvalDiagnostics: buildApprovalDiagnostics({
          approvalMode: "consolidated",
          confirmAdvisories: advisoriesConfirmed,
          skipLegacyValidationGate: skipLegacy,
          hardBlockers: [],
          advisory: consolidatedAdvisory,
          legacyValidationCodes,
          branch: "consolidated_already_approved"
        })
      };
    }

    if (blockingIssues.length > 0) {
      const err = workspaceError(
        blockingIssues.map((b) => b.message).join("; ") ||
          "Approval blockers must be resolved before approval",
        422
      );
      err.approvalBlockers = {
        ok: false,
        code: "approval_hard_blockers",
        hardBlockers: blockingIssues,
        estimatorDecisionsRequired: [],
        advisory: consolidatedAdvisory,
        approvalDiagnostics: buildApprovalDiagnostics({
          approvalMode: "consolidated",
          confirmAdvisories: advisoriesConfirmed,
          skipLegacyValidationGate: skipLegacy,
          hardBlockers: blockingIssues,
          advisory: consolidatedAdvisory,
          legacyValidationCodes,
          branch: "consolidated_hard_blockers"
        })
      };
      throw err;
    }

    // skipLegacyValidationGate (approve-and-build): advisories confirmed upstream — do not re-block.
    if (consolidatedAdvisory.length > 0 && !advisoriesConfirmed && !skipLegacy) {
      const err = workspaceError(
        `Confirm ${consolidatedAdvisory.length} advisory warning(s) before approval. You may approve with these advisory warnings.`,
        422
      );
      err.approvalBlockers = {
        ok: false,
        code: "approval_advisory_confirmation_required",
        hardBlockers: [],
        estimatorDecisionsRequired: [],
        advisory: consolidatedAdvisory,
        advisoryCount: consolidatedAdvisory.length,
        approvalDiagnostics: buildApprovalDiagnostics({
          approvalMode: "consolidated",
          confirmAdvisories: false,
          skipLegacyValidationGate: skipLegacy,
          hardBlockers: [],
          advisory: consolidatedAdvisory,
          legacyValidationCodes,
          branch: "consolidated_advisory_confirmation_required"
        })
      };
      throw err;
    }

    approvalGate = {
      canApprove: true,
      canImport: false,
      blockers: [],
      blockerCount: 0,
      workflowStatus: "approved_for_import"
    };
    consolidatedGate = {
      ...consolidatedGate,
      reviewState: effectiveRs,
      blocking: [],
      advisory: consolidatedAdvisory
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

  // Approval requires a physical current result — never a synthetic/summary-only id.
  const claimedResultId = String(latestRow?.id ?? "").trim() || null;
  if (!claimedResultId || !isUuid(claimedResultId)) {
    throw takeoffResultNotPersisted({
      organizationId,
      takeoffJobId,
      claimedResultId
    });
  }
  const physicalRow = await assertPhysicalTakeoffResult(supabase, {
    organizationId,
    takeoffJobId,
    resultId: claimedResultId
  });

  const schemaVersion = resolvedResult.schemaVersion ?? TAKEOFF_SCHEMA_VERSION;
  const summary = buildResultSummary(resolvedResult, computed, validation, importPlan);
  const priorSummary =
    jobRow.result_summary && typeof jobRow.result_summary === "object"
      ? jobRow.result_summary
      : {};
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
      takeoffResultId: physicalRow.id,
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
      // Critical: without this, buildTakeoffImportPayload re-runs the legacy
      // evaluateTakeoffApprovalGate and re-throws VALIDATION_ERRORS after
      // consolidated worksheet hard blockers already passed.
      ignoreApprovalGateBlockers: useConsolidated === true,
    }),
  };

  const nextRaw = {
    ...rawJson,
    _meta: {
      ...(rawJson._meta ?? {}),
      approvedSnapshot,
    },
  };
  const { data: updatedRows, error: updateErr } = await supabase
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
    .eq("id", physicalRow.id)
    .eq("organization_id", organizationId)
    .eq("takeoff_job_id", takeoffJobId)
    .select("id");

  if (updateErr) {
    throw Object.assign(
      new Error(`Failed to approve takeoff result: ${updateErr.message}`),
      { statusCode: 503 }
    );
  }
  if (!updatedRows?.length) {
    throw takeoffResultNotPersisted({
      organizationId,
      takeoffJobId,
      claimedResultId: physicalRow.id
    });
  }

  await supabase
    .from("quote_takeoff_jobs")
    .update({
      status: JOB_STATUS_COMPLETED,
      review_status: "approved",
      updated_at: now,
      result_summary: {
        ...priorSummary,
        ...summary,
        savedAt: now,
        schemaVersion,
        reviewStatus: "approved",
        approvedAt: now,
        approvedByUserId: userId ?? null,
        qaGateStatus: qaGate?.status ?? null,
        resultRowId: physicalRow.id,
        clientMutationRevision:
          priorSummary.clientMutationRevision ??
          physicalRow.raw_ai_result_json?._meta?.clientMutationRevision ??
          null,
        lastCorrectionId: priorSummary.lastCorrectionId ?? null,
        estimatorConfirmed: priorSummary.estimatorConfirmed ?? null,
        reviewState: effectiveReviewState,
        ...(priorSummary.lastMergedAiResultId
          ? { lastMergedAiResultId: priorSummary.lastMergedAiResultId }
          : {}),
        ...(Array.isArray(priorSummary.dismissedAiResultIds)
          ? { dismissedAiResultIds: priorSummary.dismissedAiResultIds }
          : {}),
        normalizedTakeoffJson: resolvedResult,
        computedMeasurementsJson: computed,
        validationDiagnosticsJson: validation,
        importPlanJson: importPlan,
        summaryOnlyPromotion: false
      },
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  return {
    ok: true,
    takeoffJobId,
    approvedResultId: physicalRow.id,
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
    ...(useConsolidated
      ? {
          advisory: consolidatedGate?.advisory ?? consolidatedAdvisory ?? [],
          advisoryCount: (consolidatedGate?.advisory ?? consolidatedAdvisory ?? []).length,
          blocking: [],
          estimateScopeRefreshRequired: true,
          approvalPolicyVersion: CONSOLIDATED_APPROVAL_POLICY_VERSION,
          approvalDiagnostics: buildApprovalDiagnostics({
            approvalMode: "consolidated",
            confirmAdvisories: advisoriesConfirmed,
            skipLegacyValidationGate: skipLegacy,
            hardBlockers: [],
            advisory: consolidatedGate?.advisory ?? consolidatedAdvisory ?? [],
            legacyValidationCodes: [
              ...(validation?.hasErrors ? ["VALIDATION_ERRORS"] : []),
              ...(qaGate?.status === "do_not_import" ? ["QA_GATE_BLOCKED"] : [])
            ],
            branch: skipLegacy
              ? "consolidated_skip_legacy_approved"
              : "consolidated_approved"
          })
        }
      : {})
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
 *   confirmAdvisories?: boolean,
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
  confirmAdvisories = undefined,
  correctionNotes = null,
  reopenIfApproved = false,
  _timing = null
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }

  const advisoriesConfirmed = resolveConfirmAdvisories({
    confirmAdvisories,
    acceptAdvisoryWarnings
  });
  const mark = (name) => _timing?.mark?.(name);

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  mark("approve_job_lookup");
  if (!jobRow) {
    throw workspaceError("Takeoff job not found", 404);
  }

  if (String(jobRow.status ?? "") === "processing") {
    throw workspaceError("Takeoff is still processing — wait for completion before approval", 422);
  }

  let latestRow = await loadLatestResultRow(
    supabase,
    organizationId,
    takeoffJobId,
    jobRow.result_summary
  );
  mark("approve_latest_lookup");
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
    try {
      await saveTakeoffCorrection({
        supabase,
        organizationId,
        userId,
        takeoffJobId,
        takeoffResult: resolvedResult,
        correctionNotes: correctionNotes ?? "Consolidated worksheet save before approve-and-build",
        reviewState,
        baseResultId: latestRow?.id ?? null,
        reopenIfApproved: reopenIfApproved === true
      });
      mark("approve_save_correction");
    } catch (e) {
      const err = workspaceError(
        `Failed to persist reviewed Takeoff edits: ${e instanceof Error ? e.message : String(e)}`,
        e?.statusCode && e.statusCode >= 400 ? e.statusCode : 503
      );
      err.code = e?.code === "takeoff_already_approved" ? "takeoff_already_approved" : "PERSISTENCE_FAILED";
      err.approvalBlockers = {
        ok: false,
        code: "approval_hard_blockers",
        hardBlockers: [
          {
            code: err.code,
            message:
              err.code === "takeoff_already_approved"
                ? String(e?.message || "Approved Takeoff measurements cannot be changed.")
                : "Server cannot persist the reviewed edits or approved result.",
            path: null,
            category: "persist"
          }
        ],
        estimatorDecisionsRequired: [],
        advisory: [],
        approvalDiagnostics: buildApprovalDiagnostics({
          approvalMode: "consolidated",
          confirmAdvisories: advisoriesConfirmed,
          skipLegacyValidationGate: true,
          hardBlockers: [{ code: err.code, message: "persist failed" }],
          advisory: [],
          legacyValidationCodes: [],
          branch: "approve_and_build_persist_failed"
        })
      };
      throw err;
    }
    latestRow = await loadLatestResultRow(
      supabase,
      organizationId,
      takeoffJobId,
      {
        ...(jobRow.result_summary && typeof jobRow.result_summary === "object"
          ? jobRow.result_summary
          : {}),
        normalizedTakeoffJson: resolvedResult,
        lastCorrectionId: "post_save",
        savedAt: new Date().toISOString(),
        estimatorConfirmed: buildEstimatorConfirmedMeta({
          userId,
          source: "estimator_save"
        }),
        reviewState: reviewState ?? jobRow.result_summary?.reviewState ?? null
      }
    );
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

  const effectiveRs = autoCompleteRoomReviewState(resolvedResult, rs);

  // Authoritative consolidated hard blockers — worksheet only.
  // Legacy VALIDATION_ERRORS / QA do_not_import are never hard blockers here.
  const hardBlockers = collectConsolidatedHardBlockers(
    resolvedResult,
    effectiveRs,
    computed
  );

  const preflight = evaluateConsolidatedApprovalGate({
    takeoffResult: resolvedResult,
    computed,
    validation,
    qaGate,
    dimensionEvidence: dimEvidence,
    reviewState: effectiveRs,
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus: jobRow.review_status ?? "needs_review",
    jobStatus: String(jobRow.status ?? "")
  });
  const advisoryIssues = preflight.advisory ?? [];

  const legacyValidationCodes = [
    ...(validation?.hasErrors ? ["VALIDATION_ERRORS"] : []),
    ...((validation?.diagnostics ?? [])
      .filter((d) => String(d.level ?? "").toLowerCase() === "error")
      .map((d) => d.code)
      .filter(Boolean))
  ];
  if (qaGate?.status === "do_not_import") legacyValidationCodes.push("QA_GATE_BLOCKED");

  const diagnosticsBase = {
    approvalMode: "consolidated",
    confirmAdvisories: advisoriesConfirmed,
    skipLegacyValidationGate: true,
    hardBlockers,
    advisory: advisoryIssues,
    legacyValidationCodes
  };

  if (hardBlockers.length > 0 && !preflight.alreadyApproved) {
    const err = workspaceError(
      hardBlockers.map((b) => b.message).join("; ") ||
        "Approval blockers must be resolved before approval",
      422
    );
    err.approvalBlockers = {
      ok: false,
      code: "approval_hard_blockers",
      hardBlockers,
      estimatorDecisionsRequired: [],
      advisory: advisoryIssues,
      approvalDiagnostics: buildApprovalDiagnostics({
        ...diagnosticsBase,
        branch: "approve_and_build_hard_blockers"
      })
    };
    throw err;
  }

  if (advisoryIssues.length > 0 && !advisoriesConfirmed && !preflight.alreadyApproved) {
    const err = workspaceError(
      `Confirm ${advisoryIssues.length} advisory warning(s) before approval. You may approve with these advisory warnings.`,
      422
    );
    err.approvalBlockers = {
      ok: false,
      code: "approval_advisory_confirmation_required",
      hardBlockers: [],
      estimatorDecisionsRequired: [],
      advisory: advisoryIssues,
      advisoryCount: advisoryIssues.length,
      approvalDiagnostics: buildApprovalDiagnostics({
        ...diagnosticsBase,
        branch: "approve_and_build_advisory_confirmation_required"
      })
    };
    throw err;
  }

  const summaryView = buildConsolidatedTakeoffSummary(
    resolvedResult,
    effectiveRs,
    computed,
    { blocking: [], advisory: advisoryIssues }
  );

  // Persist + mark approved. skipLegacyValidationGate prevents any later
  // evaluateTakeoffApprovalGate / VALIDATION_ERRORS re-block.
  let approved;
  try {
    approved = await approveTakeoffJob({
      supabase,
      organizationId,
      userId,
      takeoffJobId,
      takeoffResult: resolvedResult,
      reviewState: effectiveRs,
      dimensionEvidence: dimEvidence,
      approvalMode: "consolidated",
      confirmAdvisories: true,
      acceptAdvisoryWarnings: true,
      skipLegacyValidationGate: true
    });
  } catch (e) {
    if (e?.approvalBlockers) {
      e.approvalBlockers.approvalDiagnostics = buildApprovalDiagnostics({
        ...diagnosticsBase,
        hardBlockers: e.approvalBlockers.hardBlockers ?? [],
        advisory: e.approvalBlockers.advisory ?? advisoryIssues,
        branch: "approve_and_build_persist_or_recheck_failed"
      });
    }
    // Persistence failures (503) stay as-is.
    throw e;
  }

  const approvedResultId =
    approved?.approvedResultId ||
    approved?.summary?.latestResultId ||
    approved?.importPayload?.takeoffResultId ||
    latestRow?.id ||
    null;

  mark("approve_persist");
  return {
    ...approved,
    ok: true,
    takeoffJobId,
    reviewStatus: "approved",
    approvedResultId,
    displayStatus: deriveConsolidatedDisplayStatus({
      jobStatus: "completed",
      reviewStatus: "approved",
      hasResult: true
    }),
    consolidatedSummary: summaryView,
    advisory: approved.advisory ?? advisoryIssues,
    advisoryCount:
      approved.advisoryCount ??
      (approved.advisory ?? advisoryIssues)?.length ??
      0,
    blocking: [],
    seededEstimateScope: true,
    estimateScopeRefreshRequired: true,
    idempotent: Boolean(approved.idempotent),
    approvalPolicyVersion: CONSOLIDATED_APPROVAL_POLICY_VERSION,
    approvalDiagnostics: buildApprovalDiagnostics({
      ...diagnosticsBase,
      hardBlockers: [],
      branch: "approve_and_build_approved"
    }),
    // Request-scoped facts for Set Scope reuse within the same transaction only.
    setScopeFacts: {
      takeoffJobId,
      reviewStatus: "approved",
      resultId: approvedResultId,
      normalizedTakeoffJson: resolvedResult,
      computedMeasurementsJson: computed,
      validationDiagnosticsJson: validation,
      reviewState: effectiveRs,
      approvedAt: approved?.approvedAt ?? new Date().toISOString(),
      approvedByUserId: userId ?? null
    }
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
  _timing = null,
}) {
  if (!isUuid(organizationId)) {
    throw workspaceError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw workspaceError("takeoffJobId must be a valid UUID");
  }

  const jobRow = await loadVerifiedJobRow(supabase, organizationId, takeoffJobId);
  _timing?.mark?.("job_lookup");

  // ── Legacy v4 fallback ──────────────────────────────────────────────────────
  if (!jobRow) {
    return await _legacyV4GetLatestResult(supabase, organizationId, takeoffJobId);
  }

  // Parallel: result rows + file metadata (independent after job ownership check).
  const resultsPromise = supabase
    .from("quote_takeoff_results")
    .select(
      "id,organization_id,schema_version,normalized_takeoff_json," +
        "computed_measurements_json,validation_diagnostics_json," +
        "import_plan_json,review_status,created_at,raw_ai_result_json"
    )
    .eq("takeoff_job_id", takeoffJobId)
    .order("created_at", { ascending: false })
    .limit(40)
    .then(({ data }) => data || []);

  const filePromise = jobRow.quote_file_id
    ? supabase
        .from("quote_files")
        .select(FILE_SELECT_COLS)
        .eq("id", jobRow.quote_file_id)
        .limit(1)
        .then(({ data }) => data?.[0] ?? null)
    : Promise.resolve(null);

  const [resultRows, fileRow] = await Promise.all([resultsPromise, filePromise]);
  _timing?.mark?.("results_and_file");

  let savedResult = selectAuthoritativeTakeoffResult(resultRows || [], {
    jobResultSummary: jobRow.result_summary
  }).row;
  _timing?.mark?.("select_authoritative");

  // Fall back to job.result_summary if selector returned empty (no rows / no summary JSON).
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
        raw_ai_result_json: {
          _meta: {
            ...(rs.estimatorConfirmed ? { estimatorConfirmed: rs.estimatorConfirmed } : {}),
            ...(rs.reviewState ? { reviewState: rs.reviewState } : {})
          }
        }
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
  _timing?.mark?.("recompute");

  const rawJson = savedResult.raw_ai_result_json ?? null;
  const dimensionEvidence =
    typeof rawJson?._meta?.dimensionEvidence === "object" && rawJson._meta.dimensionEvidence !== null
      ? rawJson._meta.dimensionEvidence
      : null;

  const handling = readAiHandlingMeta(savedResult, jobRow.result_summary);
  const pending = findPendingAiTakeoffResult(resultRows || [], savedResult, handling);
  const pendingAiPreview = pending.pendingAiAvailable
    ? summarizeAiFindingsPreview(pending.pendingAiDraft)
    : { rooms: [] };
  _timing?.mark?.("pending_ai");

  const summaryRev = Number(jobRow.result_summary?.clientMutationRevision ?? 0);
  const rowRev = Number(rawJson?._meta?.clientMutationRevision ?? 0);
  const clientMutationRevision = Math.max(
    Number.isSafeInteger(summaryRev) ? summaryRev : 0,
    Number.isSafeInteger(rowRev) ? rowRev : 0
  );

  return {
    takeoffJobId,
    savedAt: savedResult.created_at,
    schemaVersion: savedResult.schema_version,
    reviewStatus: savedResult.review_status ?? "needs_review",
    clientMutationRevision,
    // Authoritative estimator draft for editing — never silently replaced by raw AI.
    resultId: savedResult.id ?? jobRow.result_summary?.resultRowId ?? null,
    normalizedTakeoffJson: savedResult.normalized_takeoff_json,
    takeoffResult: savedResult.normalized_takeoff_json,
    computedMeasurementsJson: freshComputed,
    validationDiagnosticsJson: savedResult.validation_diagnostics_json,
    importPlanJson: savedResult.import_plan_json,
    reviewState: loadReviewStateFromRaw(rawJson),
    importPayload: rawJson?._meta?.approvedSnapshot?.importPayload ?? null,
    dimensionEvidence,
    file: fileRow ? safeFileSummary(fileRow) : null,
    // Separate pending AI payload — does not become authoritative until Save & merge.
    pendingAiAvailable: Boolean(pending.pendingAiAvailable),
    pendingAiResultId: pending.pendingAiResultId,
    pendingAiDraft: pending.pendingAiDraft,
    pendingAiSavedAt: pending.pendingAiSavedAt,
    pendingAiPreview,
    lastMergedAiResultId: pending.lastMergedAiResultId,
    dismissedAiResultIds: pending.dismissedAiResultIds,
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
