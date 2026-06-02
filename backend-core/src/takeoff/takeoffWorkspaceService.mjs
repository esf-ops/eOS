/**
 * takeoffWorkspaceService — v4 file-backed takeoff workspace.
 *
 * Architecture note (v4):
 *   The base `quote_takeoff_jobs` table has `quote_id NOT NULL`, which blocks
 *   pre-quote Lab flows. The additive SQL (eliteos_quote_files_takeoff_storage.sql)
 *   makes quote_id nullable, but may not be applied in all envs.
 *
 *   v4 approach: store takeoff workspace state in `quote_files.metadata` jsonb.
 *   The `quoteFileId` serves as the "takeoff job ID" — a 1:1 mapping in this version.
 *   v5 will wire proper `quote_takeoff_jobs` rows once the schema migration is confirmed.
 *
 * Metadata structure (inside quote_files.metadata):
 *   takeoffWorkspace: { startedAt, startedByUserId, reviewStatus }
 *   takeoffResult:    { savedAt, savedByUserId, schemaVersion,
 *                       normalizedTakeoffJson, computedMeasurementsJson,
 *                       validationDiagnosticsJson, importPlanJson, reviewStatus }
 *
 * Security:
 *   - organizationId always derived from auth context (never from client body).
 *   - quoteFileId ownership verified before any read/write.
 *   - storage_path is never returned to the client.
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

// ── File row helper ───────────────────────────────────────────────────────────

/**
 * Load and verify a quote_files row belongs to the given org.
 * @returns {Promise<Record<string, unknown>>}
 */
async function loadVerifiedFileRow(supabase, organizationId, quoteFileId) {
  const { data: rows, error } = await supabase
    .from("quote_files")
    .select("id,organization_id,status,original_filename,file_role,visibility,mime_type,file_size_bytes,created_at,metadata")
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

/** Safe object merge into existing metadata. */
function mergeMetadata(existing, patch) {
  const base = (typeof existing === "object" && existing !== null) ? existing : {};
  return { ...base, ...patch };
}

/** Shape a safe file summary (no storage_path). */
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

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Create a takeoff workspace linked to an already-uploaded quote file.
 * Marks the file's metadata with workspace state; returns `takeoffJobId = quoteFileId`.
 *
 * @param {{ supabase: object, organizationId: string, userId: string|null, quoteFileId: string }} params
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

  const row = await loadVerifiedFileRow(supabase, organizationId, quoteFileId);

  // If a workspace already exists on this file, return it (idempotent).
  const existingMeta = (typeof row.metadata === "object" && row.metadata !== null) ? row.metadata : {};
  if (existingMeta.takeoffWorkspace) {
    return {
      takeoffJobId: quoteFileId,
      startedAt: existingMeta.takeoffWorkspace.startedAt,
      reviewStatus: existingMeta.takeoffWorkspace.reviewStatus ?? "needs_review",
      hasSavedResult: Boolean(existingMeta.takeoffResult),
      file: safeFileSummary(row),
    };
  }

  const now = new Date().toISOString();
  const newMeta = mergeMetadata(existingMeta, {
    takeoffWorkspace: {
      startedAt: now,
      startedByUserId: userId ?? null,
      reviewStatus: "needs_review",
    },
  });

  const { error: updateErr } = await supabase
    .from("quote_files")
    .update({ metadata: newMeta, updated_at: now })
    .eq("id", quoteFileId)
    .eq("organization_id", organizationId);

  if (updateErr) {
    throw Object.assign(
      new Error(`Failed to create takeoff workspace: ${updateErr.message}`),
      { statusCode: 503 }
    );
  }

  return {
    takeoffJobId: quoteFileId,
    startedAt: now,
    reviewStatus: "needs_review",
    hasSavedResult: false,
    file: safeFileSummary(row),
  };
}

/**
 * Get takeoff workspace status and file metadata.
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

  const row = await loadVerifiedFileRow(supabase, organizationId, takeoffJobId);
  const meta = (typeof row.metadata === "object" && row.metadata !== null) ? row.metadata : {};
  const ws = meta.takeoffWorkspace ?? null;
  const savedResult = meta.takeoffResult ?? null;

  return {
    takeoffJobId,
    reviewStatus: ws?.reviewStatus ?? null,
    startedAt: ws?.startedAt ?? null,
    hasSavedResult: Boolean(savedResult),
    isWorkspace: Boolean(ws),
    file: safeFileSummary(row),
  };
}

/**
 * Save a reviewed TakeoffResult for a workspace.
 * Performs server-side recomputation and validation before persisting.
 * Does NOT import into a quote or mutate any quote data.
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

  const row = await loadVerifiedFileRow(supabase, organizationId, takeoffJobId);
  const existingMeta = (typeof row.metadata === "object" && row.metadata !== null) ? row.metadata : {};

  // Server-side recompute — independent of any AI-provided totals.
  let computed, validation, importPlan;
  try {
    computed = computeTakeoffMeasurements(takeoffResult);
    validation = validateTakeoffResult(takeoffResult, computed);
    importPlan = planTakeoffImport(takeoffResult, computed);
  } catch (e) {
    throw workspaceError(`Takeoff computation failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const now = new Date().toISOString();
  const newMeta = mergeMetadata(existingMeta, {
    takeoffResult: {
      savedAt: now,
      savedByUserId: userId ?? null,
      schemaVersion: takeoffResult.schemaVersion ?? TAKEOFF_SCHEMA_VERSION,
      reviewStatus,
      normalizedTakeoffJson: takeoffResult,
      computedMeasurementsJson: computed,
      validationDiagnosticsJson: validation,
      importPlanJson: importPlan,
    },
    // Ensure workspace is marked even if createTakeoffWorkspace wasn't called first.
    takeoffWorkspace: existingMeta.takeoffWorkspace ?? {
      startedAt: now,
      startedByUserId: userId ?? null,
      reviewStatus,
    },
  });

  const { error: updateErr } = await supabase
    .from("quote_files")
    .update({ metadata: newMeta, updated_at: now })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  if (updateErr) {
    throw Object.assign(
      new Error(`Failed to save takeoff result: ${updateErr.message}`),
      { statusCode: 503 }
    );
  }

  return {
    ok: true,
    takeoffJobId,
    savedAt: now,
    schemaVersion: takeoffResult.schemaVersion ?? TAKEOFF_SCHEMA_VERSION,
    reviewStatus,
    summary: {
      countertopExactSf: computed.countertopExactSf,
      backsplashExactSf: computed.backsplashExactSf,
      combinedExactSf: computed.combinedExactSf,
      chargeableCountertopSf: computed.chargeableCountertopSf,
      chargeableBacksplashSf: computed.chargeableBacksplashSf,
      roomCount: takeoffResult.rooms.length,
      errorCount: validation.errorCount,
      warningCount: validation.warningCount,
      canImport: importPlan.canImport,
    },
  };
}

/**
 * Get the latest saved takeoff result for a workspace.
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

  const row = await loadVerifiedFileRow(supabase, organizationId, takeoffJobId);
  const meta = (typeof row.metadata === "object" && row.metadata !== null) ? row.metadata : {};
  const saved = meta.takeoffResult ?? null;

  if (!saved) {
    throw workspaceError("No saved result found for this takeoff workspace", 404);
  }

  // Re-run computation from the stored normalized JSON to produce a fresh summary.
  // This guards against calc changes since the result was last saved.
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
    file: safeFileSummary(row),
  };
}
