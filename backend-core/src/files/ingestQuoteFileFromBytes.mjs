/**
 * Server-side ingest of validated PDF bytes into quote_files + private storage.
 * Used by Quote Intake → Takeoff handoff. Never accepts client URLs.
 */
import { randomUUID } from "node:crypto";
import {
  buildQuoteFileStoragePath,
  QUOTE_FILE_BUCKET
} from "./quoteFileStoragePath.mjs";
import { isUuid, logQuoteFileEvent, MAX_FILE_SIZE_BYTES } from "./quoteFileService.mjs";
import { pdfTooLargeError } from "../quoteIntake/quoteIntakeGraphConfig.mjs";

/**
 * @param {string} message
 * @param {number} [statusCode]
 * @param {string} [code]
 */
function ingestError(message, statusCode = 400, code = "file_ingest_failed") {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  e.isValidationError = statusCode < 500;
  return e;
}

/**
 * Find an existing active quote_files row for this org + sha256.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} organizationId
 * @param {string} sha256
 */
async function findFileByHash(supabase, organizationId, sha256) {
  const { data, error } = await supabase
    .from("quote_files")
    .select("id,organization_id,status,original_filename,mime_type,file_size_bytes,file_hash,created_at")
    .eq("organization_id", organizationId)
    .eq("file_hash", sha256)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw Object.assign(new Error(`DB error looking up file hash: ${error.message}`), {
      statusCode: 503,
      code: "file_ingest_failed"
    });
  }
  return data?.[0] ?? null;
}

/**
 * Ingest validated PDF bytes into eliteos-quote-files and quote_files.
 * Idempotent on (organizationId, sha256) when a prior active row exists.
 *
 * @param {{
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   organizationId: string,
 *   userId?: string|null,
 *   bytes: Buffer,
 *   sha256: string,
 *   originalFilename?: string|null,
 *   mimeType?: string|null,
 *   metadata?: Record<string, unknown>
 * }} params
 */
export async function ingestQuoteFileFromBytes({
  supabase,
  organizationId,
  userId = null,
  bytes,
  sha256,
  originalFilename = "plan.pdf",
  mimeType = "application/pdf",
  metadata = {}
}) {
  if (!organizationId || !isUuid(organizationId)) {
    throw ingestError("organizationId must be a valid UUID", 400, "invalid_organization");
  }
  if (!Buffer.isBuffer(bytes) || bytes.length < 4) {
    throw ingestError("PDF bytes are required", 400, "attachment_unsupported");
  }
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    throw pdfTooLargeError(bytes.length, MAX_FILE_SIZE_BYTES);
  }
  if (!bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw ingestError("Attachment is not a valid PDF", 400, "attachment_unsupported");
  }
  const hash = String(sha256 ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw ingestError("sha256 is required", 400, "attachment_hash_failed");
  }

  const existing = await findFileByHash(supabase, organizationId, hash);
  if (existing) {
    return {
      quoteFileId: String(existing.id),
      reused: true,
      originalFilename: existing.original_filename,
      sha256: hash
    };
  }

  const quoteFileId = randomUUID();
  const filename = String(originalFilename || "plan.pdf").trim() || "plan.pdf";
  const { path: storagePath, safeFilename } = buildQuoteFileStoragePath({
    organizationId,
    quoteFileId,
    filename,
    contextType: undefined
  });

  const { error: uploadErr } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType || "application/pdf",
    upsert: false
  });
  if (uploadErr) {
    throw Object.assign(new Error(`Storage upload failed: ${uploadErr.message}`), {
      statusCode: 503,
      code: "file_ingest_failed"
    });
  }

  const fileRow = {
    id: quoteFileId,
    organization_id: organizationId,
    quote_id: null,
    partner_account_id: null,
    takeoff_job_id: null,
    uploaded_by_user_id: userId ?? null,
    storage_provider: "supabase",
    storage_bucket: QUOTE_FILE_BUCKET,
    storage_path: storagePath,
    original_filename: filename,
    safe_filename: safeFilename,
    mime_type: mimeType || "application/pdf",
    file_size_bytes: bytes.length,
    file_hash: hash,
    file_role: "measurement_plan",
    visibility: "internal",
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      ...metadata,
      source: "quote_intake_open_estimate"
    }
  };

  const { error: insertErr } = await supabase.from("quote_files").insert(fileRow);
  if (insertErr) {
    // Race: another request may have inserted the same hash.
    const raced = await findFileByHash(supabase, organizationId, hash);
    if (raced) {
      return {
        quoteFileId: String(raced.id),
        reused: true,
        originalFilename: raced.original_filename,
        sha256: hash
      };
    }
    throw Object.assign(new Error(`Failed to create file record: ${insertErr.message}`), {
      statusCode: 503,
      code: "file_ingest_failed"
    });
  }

  try {
    await logQuoteFileEvent({
      supabase,
      quoteFileId,
      organizationId,
      actorUserId: userId,
      action: "uploaded",
      metadata: { source: "quote_intake_open_estimate", sha256Prefix: hash.slice(0, 12) }
    });
  } catch {
    // Non-fatal — file + storage already committed.
  }

  return {
    quoteFileId,
    reused: false,
    originalFilename: filename,
    sha256: hash
  };
}
