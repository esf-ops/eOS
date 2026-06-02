/**
 * quoteFileStoragePath — pure helpers for building eliteOS quote file storage paths.
 *
 * Design goals:
 *   - No I/O, no Supabase calls, no file upload — pure functions only.
 *   - All paths are deterministic from inputs.
 *   - Filenames are sanitized to prevent path traversal and filesystem issues.
 *   - organizationId + quoteFileId are always required (ownership + uniqueness).
 *
 * Storage bucket: eliteos-quote-files (private, no public read)
 *
 * Path convention:
 *   org/{organizationId}/{contextType}/{contextId}/files/{quoteFileId}/{safeFilename}
 *   org/{organizationId}/unlinked/files/{quoteFileId}/{safeFilename}
 *
 * Context types:
 *   internal-quotes  — quote_headers rows with quote_source='internal_quote'
 *   quotes           — public_consumer quotes (or generic quote_headers references)
 *   partner-quotes   — quote_headers rows with quote_source='partner_quote'
 *   takeoff-jobs     — standalone pre-quote takeoff job uploads
 *   unlinked         — uploaded without any quote/job context yet
 *
 * Security note:
 *   Never return storage_path directly to untrusted clients.
 *   Backend generates a short-lived signed URL for every download.
 */

/** The single private storage bucket for all quote-related files. */
export const QUOTE_FILE_BUCKET = "eliteos-quote-files";

/**
 * Sanitize a filename for safe use in an object-storage path.
 *
 * Rules:
 *   - Strip directory components (no path traversal via ../ or /)
 *   - Replace runs of unsafe characters with a single underscore
 *   - Collapse multiple underscores
 *   - Trim leading/trailing whitespace and dots
 *   - Preserve extension (last dot-segment)
 *   - Enforce max 200 character length for the final result
 *   - Falls back to "file" if nothing remains after sanitization
 *
 * @param {string} filename - Raw original filename from user input
 * @returns {string} Sanitized filename safe for use in a storage path
 */
export function sanitizeStorageFilename(filename) {
  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error("sanitizeStorageFilename: filename must be a non-empty string");
  }

  // Strip directory components (path traversal guard)
  let safe = filename.split(/[\\/]/).pop() ?? filename;

  // Trim whitespace
  safe = safe.trim();

  // Replace unsafe characters (anything not alphanumeric, dash, underscore, dot)
  safe = safe.replace(/[^a-zA-Z0-9._-]+/g, "_");

  // Collapse runs of underscores
  safe = safe.replace(/_+/g, "_");

  // Trim leading/trailing dots and underscores
  safe = safe.replace(/^[._-]+|[._-]+$/g, "");

  // Remove trailing underscores immediately before the file extension (e.g. "plan_.pdf" → "plan.pdf")
  safe = safe.replace(/_+(\.[a-zA-Z0-9]+)$/, "$1");

  // Enforce max length (preserve extension)
  if (safe.length > 200) {
    const dotIdx = safe.lastIndexOf(".");
    const ext = dotIdx > 0 ? safe.slice(dotIdx) : "";
    const base = safe.slice(0, 200 - ext.length);
    safe = base + ext;
  }

  // Fallback if nothing remains
  if (!safe) safe = "file";

  return safe;
}

/**
 * Build a deterministic object-storage path for a quote file.
 *
 * @param {object} options
 * @param {string}  options.organizationId  - Required. Organization UUID.
 * @param {string}  options.quoteFileId     - Required. quote_files.id UUID.
 * @param {string}  options.filename        - Required. Original filename (will be sanitized).
 * @param {string} [options.quoteId]        - Optional. quote_headers.id (any quote_source).
 * @param {string} [options.contextType]    - Context folder label. Defaults derived from provided IDs.
 *   Explicit values: 'internal-quotes' | 'quotes' | 'partner-quotes' | 'takeoff-jobs' | 'unlinked'
 * @param {string} [options.takeoffJobId]   - Optional. takeoff_job.id — used when no quote exists.
 * @returns {{ bucket: string, path: string, safeFilename: string }}
 *
 * @example
 * // Internal quote file
 * buildQuoteFileStoragePath({
 *   organizationId: "org-uuid",
 *   quoteFileId: "file-uuid",
 *   filename: "kitchen plan.pdf",
 *   quoteId: "quote-uuid",
 *   contextType: "internal-quotes",
 * });
 * // → { bucket: "eliteos-quote-files",
 * //     path: "org/org-uuid/internal-quotes/quote-uuid/files/file-uuid/kitchen_plan.pdf",
 * //     safeFilename: "kitchen_plan.pdf" }
 *
 * @example
 * // Pre-quote takeoff job file
 * buildQuoteFileStoragePath({
 *   organizationId: "org-uuid",
 *   quoteFileId: "file-uuid",
 *   filename: "spec73.pdf",
 *   takeoffJobId: "job-uuid",
 * });
 * // → path: "org/org-uuid/takeoff-jobs/job-uuid/files/file-uuid/spec73.pdf"
 */
export function buildQuoteFileStoragePath({
  organizationId,
  quoteFileId,
  filename,
  quoteId,
  contextType,
  takeoffJobId,
}) {
  // --- Validate required inputs ---
  if (!organizationId || typeof organizationId !== "string" || !organizationId.trim()) {
    throw new Error("buildQuoteFileStoragePath: organizationId is required");
  }
  if (!quoteFileId || typeof quoteFileId !== "string" || !quoteFileId.trim()) {
    throw new Error("buildQuoteFileStoragePath: quoteFileId is required");
  }
  if (!filename || typeof filename !== "string" || !filename.trim()) {
    throw new Error("buildQuoteFileStoragePath: filename is required");
  }

  // --- Validate and resolve context type ---
  const validContextTypes = ["internal-quotes", "quotes", "partner-quotes", "takeoff-jobs", "unlinked"];

  let resolvedContextType = contextType;
  let contextId = null;

  // If contextType was explicitly provided, validate it first before anything else.
  if (resolvedContextType !== undefined && resolvedContextType !== null) {
    if (!validContextTypes.includes(resolvedContextType)) {
      throw new Error(
        `buildQuoteFileStoragePath: invalid contextType '${resolvedContextType}'. ` +
        `Must be one of: ${validContextTypes.join(", ")}`
      );
    }
  } else {
    // Derive contextType from provided IDs when not explicit.
    if (takeoffJobId) {
      resolvedContextType = "takeoff-jobs";
    } else if (quoteId) {
      resolvedContextType = "quotes";
    } else {
      resolvedContextType = "unlinked";
    }
  }

  // Determine context ID based on resolved context type.
  if (resolvedContextType === "takeoff-jobs") {
    if (!takeoffJobId) {
      throw new Error("buildQuoteFileStoragePath: takeoffJobId is required when contextType is 'takeoff-jobs'");
    }
    contextId = takeoffJobId;
  } else if (resolvedContextType !== "unlinked") {
    if (!quoteId) {
      throw new Error(
        `buildQuoteFileStoragePath: quoteId is required when contextType is '${resolvedContextType}'`
      );
    }
    contextId = quoteId;
  }

  // --- Sanitize filename ---
  const safeFilename = sanitizeStorageFilename(filename);

  // --- Build path ---
  // org/{organizationId}/{contextType}/{contextId}/files/{quoteFileId}/{safeFilename}
  // or for unlinked:
  // org/{organizationId}/unlinked/files/{quoteFileId}/{safeFilename}
  const segments = [
    "org",
    organizationId.trim(),
    resolvedContextType,
    ...(contextId ? [contextId.trim()] : []),
    "files",
    quoteFileId.trim(),
    safeFilename,
  ];

  const path = segments.join("/");

  return {
    bucket: QUOTE_FILE_BUCKET,
    path,
    safeFilename,
  };
}
