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
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";
import { planTakeoffImport } from "./takeoffImportPlanner.mjs";
import { TAKEOFF_SCHEMA_VERSION } from "./takeoffContract.mjs";

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
  "created_by_user_id,metadata,result_summary,created_at,updated_at";

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

  // Check for any saved results (from quote_takeoff_results or job.result_summary).
  const { data: resultRows } = await supabase
    .from("quote_takeoff_results")
    .select("id")
    .eq("takeoff_job_id", takeoffJobId)
    .limit(1);

  const hasResultRow = resultRows && resultRows.length > 0;
  const hasJobSummary =
    jobRow.result_summary !== null &&
    typeof jobRow.result_summary === "object" &&
    Object.keys(jobRow.result_summary).length > 0;

  return {
    takeoffJobId,
    status: jobRow.status,
    reviewStatus: jobRow.review_status ?? "needs_review",
    startedAt: jobRow.created_at,
    hasSavedResult: Boolean(hasResultRow || hasJobSummary),
    isWorkspace: true,
    file: fileRow ? safeFileSummary(fileRow) : null,
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
      "import_plan_json,review_status,created_at"
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

  return {
    takeoffJobId,
    savedAt: savedResult.created_at,
    schemaVersion: savedResult.schema_version,
    reviewStatus: savedResult.review_status ?? "needs_review",
    normalizedTakeoffJson: savedResult.normalized_takeoff_json,
    computedMeasurementsJson: freshComputed,
    validationDiagnosticsJson: savedResult.validation_diagnostics_json,
    importPlanJson: savedResult.import_plan_json,
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
        modelUsed:            meta.modelUsed ?? null,
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

  return {
    ok:                        true,
    takeoffJobId,
    resultId:                  row.id,
    savedAt:                   row.created_at,
    schemaVersion:             row.schema_version ?? null,
    reviewStatus:              row.review_status ?? "needs_review",
    promptVersion:             meta.promptVersion ?? null,
    modelUsed:                 meta.modelUsed ?? null,
    normalizedTakeoffJson:     row.normalized_takeoff_json,
    computedMeasurementsJson:  freshComputed,
    validationDiagnosticsJson: freshValidation,
    importPlanJson:            freshImportPlan,
    pageInventory:             meta.pageInventory    ?? null, // v5.4: null for pre-inventory runs
    dimensionEvidence:         meta.dimensionEvidence ?? null, // v5.5: null for pre-evidence runs
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
    startedAt: meta.takeoffWorkspace.startedAt ?? null,
    hasSavedResult: Boolean(meta.takeoffResult),
    isWorkspace: true,
    legacyV4: true,
    file: safeFileSummary(fr),
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
