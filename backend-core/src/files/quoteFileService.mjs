/**
 * quoteFileService — backend service for quote file metadata, signed URLs, and audit events.
 *
 * Design:
 *   - All functions take an authenticated `supabase` client (service role).
 *   - Pure input validation happens before any DB or storage calls.
 *   - Storage path is always built by the backend using buildQuoteFileStoragePath().
 *   - Signed URLs are short-lived; storage_path is never returned to clients.
 *   - quote_file_events are logged for every significant action.
 *
 * No I/O except Supabase Storage + Supabase DB. No AI calls. No pricing logic.
 */
import { randomUUID } from "node:crypto";
import {
  buildQuoteFileStoragePath,
  sanitizeStorageFilename,
  QUOTE_FILE_BUCKET,
} from "./quoteFileStoragePath.mjs";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Signed download URL TTL — 1 hour. Short enough to limit exposure. */
export const SIGNED_DOWNLOAD_TTL_SECONDS = 3600;

/** Signed upload URL TTL — 60 seconds. Supabase recommends a short window for uploads. */
export const SIGNED_UPLOAD_TTL_SECONDS = 60;

/** Max accepted file size: 50 MB. Larger plans can be split or compressed. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** File roles accepted by the upload-intent endpoint. */
export const ALLOWED_FILE_ROLES = new Set([
  "cabinet_plan",
  "measurement_plan",
  "signed_quote",
  "customer_pdf",
  "shop_drawing",
  "photo",
  "spec",
  "contract",
  "other",
]);

/** Visibility values accepted by the upload-intent endpoint. */
export const ALLOWED_VISIBILITIES = new Set(["internal", "partner", "customer"]);

/**
 * MIME types accepted for upload.
 * Staff tools: PDFs, images, common doc formats.
 * Expand as needed; this is a safety gate, not a strict allowlist for all use cases.
 */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/gif",
  "image/svg+xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword",  // .doc
  "text/plain",
]);

// ── Validation helpers ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

/**
 * Build a structured validation error.
 * @param {string} message
 * @param {number} [statusCode]
 * @returns {Error}
 */
export function validationError(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.isValidationError = true;
  return e;
}

/**
 * Map a quote_headers.quote_source value to a storage context type.
 * @param {string|null|undefined} quoteSource
 * @returns {string}
 */
export function quoteSourceToContextType(quoteSource) {
  if (quoteSource === "internal_quote") return "internal-quotes";
  if (quoteSource === "partner_quote") return "partner-quotes";
  return "quotes";
}

// ── Core service functions ────────────────────────────────────────────────────

/**
 * Log a quote_file_events row. Non-fatal on failure (logs warning).
 *
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, organizationId: string, quoteFileId: string, actorUserId: string|null, action: string, metadata?: Record<string, unknown> }} params
 */
export async function logQuoteFileEvent({
  supabase,
  organizationId,
  quoteFileId,
  actorUserId = null,
  action,
  metadata = {},
}) {
  const row = {
    organization_id: organizationId,
    quote_file_id: quoteFileId,
    actor_user_id: actorUserId ?? null,
    action,
    metadata: metadata ?? {},
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("quote_file_events").insert(row);
  if (error) {
    console.warn(
      `[quoteFileService] logQuoteFileEvent failed (action=${action}, fileId=${quoteFileId}):`,
      error.message
    );
  }
  return { ok: !error };
}

/**
 * Create a signed upload URL for a new quote file.
 *
 * Steps:
 *   1. Validate all inputs.
 *   2. If quoteId given → verify quote belongs to organization; derive contextType from quote_source.
 *   3. If takeoffJobId given → verify takeoff_job belongs to organization.
 *   4. Generate quoteFileId (UUID).
 *   5. Build deterministic storage path.
 *   6. Insert quote_files row (status = 'active').
 *   7. Create signed upload URL from Supabase Storage.
 *   8. Log quote_file_events action = 'uploaded'.
 *   9. Return { quoteFileId, storagePath, signedUploadUrl, expiresAt }.
 *
 * Note: storage_path is included in the server response for debugging by internal staff.
 * It MUST NOT be forwarded to customer-facing UI.
 *
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, organizationId: string, userId: string|null, quoteId?: string|null, partnerAccountId?: string|null, takeoffJobId?: string|null, originalFilename: string, mimeType?: string|null, fileSizeBytes?: number|null, fileRole: string, visibility?: string }} params
 */
export async function createQuoteFileUploadIntent({
  supabase,
  organizationId,
  userId,
  quoteId,
  partnerAccountId,
  takeoffJobId,
  originalFilename,
  mimeType,
  fileSizeBytes,
  fileRole,
  visibility = "internal",
}) {
  // ── Input validation ──────────────────────────────────────────────────────

  if (!organizationId || !isUuid(organizationId)) {
    throw validationError("organizationId must be a valid UUID");
  }
  if (!originalFilename || typeof originalFilename !== "string" || !originalFilename.trim()) {
    throw validationError("originalFilename is required");
  }
  if (!fileRole || !ALLOWED_FILE_ROLES.has(fileRole)) {
    throw validationError(
      `fileRole '${fileRole}' is not allowed. Must be one of: ${[...ALLOWED_FILE_ROLES].join(", ")}`
    );
  }
  if (!ALLOWED_VISIBILITIES.has(visibility)) {
    throw validationError(
      `visibility '${visibility}' is not allowed. Must be one of: ${[...ALLOWED_VISIBILITIES].join(", ")}`
    );
  }
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw validationError(
      `mimeType '${mimeType}' is not accepted. Upload PDFs or image files.`
    );
  }
  if (fileSizeBytes != null && Number(fileSizeBytes) > MAX_FILE_SIZE_BYTES) {
    throw validationError(
      `File too large: ${Number(fileSizeBytes).toLocaleString()} bytes. Maximum is ${MAX_FILE_SIZE_BYTES.toLocaleString()} bytes (50 MB).`
    );
  }
  if (quoteId && !isUuid(quoteId)) {
    throw validationError("quoteId must be a valid UUID");
  }
  if (takeoffJobId && !isUuid(takeoffJobId)) {
    throw validationError("takeoffJobId must be a valid UUID");
  }
  if (partnerAccountId && !isUuid(partnerAccountId)) {
    throw validationError("partnerAccountId must be a valid UUID");
  }

  // ── Access checks ─────────────────────────────────────────────────────────

  let resolvedContextType = null;

  if (quoteId) {
    const { data: quoteRow, error: qErr } = await supabase
      .from("quote_headers")
      .select("id,organization_id,quote_source")
      .eq("id", quoteId)
      .limit(1);

    if (qErr) {
      throw Object.assign(new Error(`Failed to load quote: ${qErr.message}`), { statusCode: 503 });
    }
    if (!quoteRow || quoteRow.length === 0) {
      throw validationError("Quote not found", 404);
    }
    const quote = quoteRow[0];
    if (String(quote.organization_id ?? "") !== organizationId) {
      throw validationError("Quote does not belong to this organization", 403);
    }
    resolvedContextType = quoteSourceToContextType(quote.quote_source);
  }

  if (takeoffJobId) {
    const { data: jobRow, error: jErr } = await supabase
      .from("quote_takeoff_jobs")
      .select("id,organization_id")
      .eq("id", takeoffJobId)
      .limit(1);

    if (jErr) {
      throw Object.assign(new Error(`Failed to load takeoff job: ${jErr.message}`), { statusCode: 503 });
    }
    if (!jobRow || jobRow.length === 0) {
      throw validationError("Takeoff job not found", 404);
    }
    const job = jobRow[0];
    // Note: organization_id on quote_takeoff_jobs was added additively and may be null for legacy rows.
    if (job.organization_id && String(job.organization_id) !== organizationId) {
      throw validationError("Takeoff job does not belong to this organization", 403);
    }
    // Only use takeoff-jobs context if no quoteId (quoteId context takes priority).
    if (!resolvedContextType) {
      resolvedContextType = "takeoff-jobs";
    }
  }

  // ── Build storage path ────────────────────────────────────────────────────

  const quoteFileId = randomUUID();

  const { path: storagePath, safeFilename } = buildQuoteFileStoragePath({
    organizationId,
    quoteFileId,
    filename: originalFilename,
    quoteId: quoteId ?? undefined,
    takeoffJobId: takeoffJobId ?? undefined,
    contextType: resolvedContextType ?? undefined,
  });

  // ── Insert quote_files row ────────────────────────────────────────────────

  const fileRow = {
    id: quoteFileId,
    organization_id: organizationId,
    quote_id: quoteId ?? null,
    partner_account_id: partnerAccountId ?? null,
    takeoff_job_id: takeoffJobId ?? null,
    uploaded_by_user_id: userId ?? null,
    storage_provider: "supabase",
    storage_bucket: QUOTE_FILE_BUCKET,
    storage_path: storagePath,
    original_filename: originalFilename.trim(),
    safe_filename: safeFilename,
    mime_type: mimeType ?? null,
    file_size_bytes: fileSizeBytes != null ? Number(fileSizeBytes) : null,
    file_hash: null,
    file_role: fileRole,
    visibility,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {},
  };

  const { error: insertErr } = await supabase.from("quote_files").insert(fileRow);
  if (insertErr) {
    throw Object.assign(
      new Error(`Failed to create file record: ${insertErr.message}`),
      { statusCode: 503 }
    );
  }

  // ── Create signed upload URL ──────────────────────────────────────────────

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(QUOTE_FILE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (uploadErr || !uploadData?.signedUrl) {
    // Row inserted but storage URL failed — soft failure (row exists for audit; client can retry).
    console.error(
      `[quoteFileService] createSignedUploadUrl failed for ${quoteFileId}:`,
      uploadErr?.message ?? "no signedUrl returned"
    );
    throw Object.assign(
      new Error(`Storage upload URL generation failed: ${uploadErr?.message ?? "unknown error"}`),
      { statusCode: 503, quoteFileId }
    );
  }

  const expiresAt = new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString();

  // ── Log event ─────────────────────────────────────────────────────────────

  await logQuoteFileEvent({
    supabase,
    organizationId,
    quoteFileId,
    actorUserId: userId ?? null,
    action: "uploaded",
    metadata: {
      file_role: fileRole,
      visibility,
      context_type: resolvedContextType ?? "unlinked",
      quote_id: quoteId ?? null,
      takeoff_job_id: takeoffJobId ?? null,
    },
  });

  return {
    quoteFileId,
    storagePath,      // internal; do not forward to customer-facing UI
    safeFilename,
    signedUploadUrl: uploadData.signedUrl,
    uploadToken: uploadData.token ?? null,
    expiresAt,
  };
}

/**
 * Create a short-lived signed download URL for an existing quote file.
 *
 * Steps:
 *   1. Load quote_files row by quoteFileId.
 *   2. Verify organization ownership.
 *   3. Verify status is not deleted or archived.
 *   4. Create signed download URL.
 *   5. Log 'downloaded' event.
 *   6. Return signed URL + metadata (no storage_path).
 *
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, organizationId: string, userId: string|null, quoteFileId: string }} params
 */
export async function createQuoteFileDownloadUrl({
  supabase,
  organizationId,
  userId,
  quoteFileId,
}) {
  if (!organizationId || !isUuid(organizationId)) {
    throw validationError("organizationId must be a valid UUID");
  }
  if (!quoteFileId || !isUuid(quoteFileId)) {
    throw validationError("quoteFileId must be a valid UUID");
  }

  // ── Load file record ──────────────────────────────────────────────────────

  const { data: fileRows, error: fetchErr } = await supabase
    .from("quote_files")
    .select("id,organization_id,storage_bucket,storage_path,original_filename,safe_filename,mime_type,file_size_bytes,file_role,visibility,status,quote_id,takeoff_job_id")
    .eq("id", quoteFileId)
    .limit(1);

  if (fetchErr) {
    throw Object.assign(new Error(`Failed to load file: ${fetchErr.message}`), { statusCode: 503 });
  }
  if (!fileRows || fileRows.length === 0) {
    throw validationError("File not found", 404);
  }

  const file = fileRows[0];

  // ── Organization check ────────────────────────────────────────────────────

  if (String(file.organization_id ?? "") !== organizationId) {
    throw validationError("File does not belong to this organization", 403);
  }

  // ── Status check (refuse deleted/archived) ────────────────────────────────

  if (file.status === "deleted") {
    throw validationError("File has been deleted and cannot be downloaded", 410);
  }
  if (file.status === "archived") {
    throw validationError("File is archived. Contact an administrator to restore it.", 410);
  }

  // ── Create signed download URL ────────────────────────────────────────────

  const { data: urlData, error: urlErr } = await supabase.storage
    .from(file.storage_bucket ?? QUOTE_FILE_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_DOWNLOAD_TTL_SECONDS);

  if (urlErr || !urlData?.signedUrl) {
    throw Object.assign(
      new Error(`Download URL generation failed: ${urlErr?.message ?? "unknown error"}`),
      { statusCode: 503 }
    );
  }

  const expiresAt = new Date(Date.now() + SIGNED_DOWNLOAD_TTL_SECONDS * 1000).toISOString();

  // ── Log event ─────────────────────────────────────────────────────────────

  await logQuoteFileEvent({
    supabase,
    organizationId,
    quoteFileId,
    actorUserId: userId ?? null,
    action: "downloaded",
    metadata: {
      file_role: file.file_role,
      expires_at: expiresAt,
      quote_id: file.quote_id ?? null,
    },
  });

  return {
    signedUrl: urlData.signedUrl,
    expiresAt,
    filename: file.original_filename,
    mimeType: file.mime_type ?? null,
    fileSizeBytes: file.file_size_bytes ?? null,
    fileRole: file.file_role,
    visibility: file.visibility,
    // storage_path intentionally omitted from return value
  };
}

/**
 * List quote files for a given quote. Returns safe metadata only (no storage_path).
 *
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, organizationId: string, quoteId: string, includeArchived?: boolean }} params
 */
export async function listQuoteFilesForQuote({
  supabase,
  organizationId,
  quoteId,
  includeArchived = false,
}) {
  if (!organizationId || !isUuid(organizationId)) {
    throw validationError("organizationId must be a valid UUID");
  }
  if (!quoteId || !isUuid(quoteId)) {
    throw validationError("quoteId must be a valid UUID");
  }

  // ── Verify quote belongs to org ───────────────────────────────────────────

  const { data: quoteRows, error: qErr } = await supabase
    .from("quote_headers")
    .select("id,organization_id")
    .eq("id", quoteId)
    .limit(1);

  if (qErr) {
    throw Object.assign(new Error(`Failed to load quote: ${qErr.message}`), { statusCode: 503 });
  }
  if (!quoteRows || quoteRows.length === 0) {
    throw validationError("Quote not found", 404);
  }
  if (String(quoteRows[0].organization_id ?? "") !== organizationId) {
    throw validationError("Quote does not belong to this organization", 403);
  }

  // ── Query files ───────────────────────────────────────────────────────────

  let qb = supabase
    .from("quote_files")
    .select(
      "id,original_filename,safe_filename,file_role,visibility,mime_type,file_size_bytes,status,created_at,updated_at,takeoff_job_id"
    )
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    qb = qb.neq("status", "deleted").neq("status", "archived");
  } else {
    qb = qb.neq("status", "deleted");
  }

  const { data: files, error: listErr } = await qb;
  if (listErr) {
    throw Object.assign(new Error(`Failed to list files: ${listErr.message}`), { statusCode: 503 });
  }

  return {
    quoteId,
    files: (files ?? []).map((f) => ({
      id: f.id,
      originalFilename: f.original_filename,
      safeFilename: f.safe_filename,
      fileRole: f.file_role,
      visibility: f.visibility,
      mimeType: f.mime_type ?? null,
      fileSizeBytes: f.file_size_bytes ?? null,
      status: f.status,
      takeoffJobId: f.takeoff_job_id ?? null,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
      // storage_path intentionally omitted
    })),
  };
}
