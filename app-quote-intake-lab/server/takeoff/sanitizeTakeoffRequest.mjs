/**
 * Sanitize + validate live takeoff requests (Phase 4B.4A).
 * Independently verifies SHA-256; does not trust browser metadata alone.
 */

import { createHash } from "node:crypto";

export const TAKEOFF_SUPPORTED_MIME = Object.freeze([
  "application/pdf",
  "image/png",
  "image/jpeg"
]);

const EXECUTABLE_OR_ARCHIVE_RE =
  /\.(exe|dll|bat|cmd|sh|ps1|js|msi|dmg|pkg|zip|rar|7z|tar|gz|tgz|bz2|xz|apk|jar|wasm)$/i;

const PROD_URL_RE =
  /supabase\.co|eliteos-quote-files|storage\/v1|takeoff\.eliteosfab|\/api\/takeoff|quote_takeoff_|quote_files|internal-quotes|quote-library|quote_headers/i;

const PROD_ID_RE =
  /^(qto-|qtj-|qf-|qfh-|ie-|ql-|qh-)|quote_takeoff_|quote_file_|internal_estimate_|quote_library_/i;

/**
 * @param {any} input
 * @param {{ maxAttachmentBytes: number, maxPages?: number }} limits
 */
export function sanitizeLiveTakeoffRequest(input, limits) {
  if (!input || typeof input !== "object") {
    reject(400, "BAD_REQUEST", "Request body must be a JSON object.");
  }

  assertNoHtml(input);
  assertNoProductionRefs(input);

  if (input.attachments != null || input.selectedAttachmentIds != null) {
    reject(400, "MULTIPLE_ATTACHMENTS", "Multiple attachments are not supported. Send exactly one attachment.");
  }

  const caseId = requireString(input.caseId, "CASE_ID_REQUIRED", "Case ID is required.", 120);
  const acceptedIntakeSnapshotId = requireString(
    input.acceptedIntakeSnapshotId,
    "ACCEPTED_INTAKE_REQUIRED",
    "Accepted intake snapshot ID is required.",
    160
  );
  const attachmentId = requireString(
    input.attachmentId ?? input.attachment?.id,
    "ATTACHMENT_ID_REQUIRED",
    "Attachment ID is required.",
    80
  );
  const filename = requireString(
    input.filename ?? input.attachment?.filename,
    "FILENAME_REQUIRED",
    "Filename is required.",
    240
  );
  if (EXECUTABLE_OR_ARCHIVE_RE.test(filename)) {
    reject(400, "UNSUPPORTED_FILE", "Executable or archive attachments are not permitted.");
  }

  const mimeType = String(input.mimeType ?? input.contentType ?? input.attachment?.contentType ?? "")
    .trim()
    .toLowerCase();
  if (!TAKEOFF_SUPPORTED_MIME.includes(mimeType)) {
    reject(415, "UNSUPPORTED_MIME", `Unsupported MIME type. Allowed: ${TAKEOFF_SUPPORTED_MIME.join(", ")}`);
  }

  const claimedSize = Number(input.sizeBytes ?? input.byteSize ?? input.attachment?.sizeBytes);
  if (!Number.isFinite(claimedSize) || claimedSize <= 0) {
    reject(400, "SIZE_REQUIRED", "Byte size is required and must be positive.");
  }
  if (claimedSize > limits.maxAttachmentBytes) {
    reject(413, "ATTACHMENT_TOO_LARGE", `Attachment exceeds max size of ${limits.maxAttachmentBytes} bytes.`);
  }

  const claimedHash = String(input.contentHash ?? input.sha256 ?? input.attachment?.contentHash ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(claimedHash)) {
    reject(400, "HASH_REQUIRED", "SHA-256 content hash (64 hex chars) is required.");
  }

  const ack = Boolean(
    input.liveTransmissionAcknowledged ??
      input.transmissionAcknowledged ??
      input.attachmentTransmissionAcknowledged
  );
  if (!ack) {
    reject(
      400,
      "ACKNOWLEDGMENT_REQUIRED",
      "Explicit live transmission acknowledgment is required before sending plan bytes to Gemini."
    );
  }

  const actorLabel = requireString(input.actorLabel ?? input.requestActor, "ACTOR_REQUIRED", "Request actor is required.", 120);
  const requestedAt = String(input.requestedAt ?? input.requestTimestamp ?? new Date().toISOString());
  if (Number.isNaN(Date.parse(requestedAt))) {
    reject(400, "TIMESTAMP_INVALID", "Request timestamp must be a valid ISO date.");
  }

  const contentB64 = input.contentBase64 ?? input.attachmentContentBase64 ?? input.content ?? null;
  if (contentB64 == null || contentB64 === "") {
    reject(400, "EMPTY_CONTENT", "Attachment content is required (contentBase64).");
  }
  if (typeof contentB64 !== "string") {
    reject(400, "BAD_CONTENT", "Attachment content must be a base64 string.");
  }
  if (contentB64.startsWith("http://") || contentB64.startsWith("https://") || PROD_URL_RE.test(contentB64)) {
    reject(400, "PRODUCTION_URL_FORBIDDEN", "Production or remote URLs are not permitted as attachment content.");
  }

  let bytes;
  try {
    bytes = Buffer.from(contentB64, "base64");
  } catch {
    reject(400, "BAD_BASE64", "Attachment content is not valid base64.");
  }
  if (!bytes.length) {
    reject(400, "EMPTY_CONTENT", "Attachment content decoded to empty bytes.");
  }
  if (bytes.length !== claimedSize) {
    reject(400, "SIZE_MISMATCH", "Decoded byte length does not match declared sizeBytes.");
  }
  if (bytes.length > limits.maxAttachmentBytes) {
    reject(413, "ATTACHMENT_TOO_LARGE", `Attachment exceeds max size of ${limits.maxAttachmentBytes} bytes.`);
  }

  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== claimedHash) {
    reject(400, "HASH_MISMATCH", "Server-computed SHA-256 does not match declared contentHash.");
  }

  // Soft magic sniff for declared MIME
  if (mimeType === "application/pdf" && bytes.subarray(0, 5).toString("utf8") !== "%PDF-") {
    reject(400, "UNSUPPORTED_FILE", "Declared PDF does not begin with a valid %PDF- header.");
  }
  if (mimeType === "image/png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    reject(400, "UNSUPPORTED_FILE", "Declared PNG failed magic-byte check.");
  }
  if (
    mimeType === "image/jpeg" &&
    !(bytes[0] === 0xff && bytes[1] === 0xd8)
  ) {
    reject(400, "UNSUPPORTED_FILE", "Declared JPEG failed magic-byte check.");
  }

  return {
    caseId,
    acceptedIntakeSnapshotId,
    attachmentId,
    filename,
    mimeType,
    sizeBytes: bytes.length,
    contentHash: actualHash,
    contentBytes: bytes,
    liveTransmissionAcknowledged: true,
    actorLabel,
    requestedAt,
    elite100Decision: input.elite100Decision === "elite_100_candidate" ? "elite_100_candidate" : input.elite100Decision ?? null,
    classificationHints:
      input.classificationHints && typeof input.classificationHints === "object"
        ? {
            statedSquareFootage: numOrNull(input.classificationHints.statedSquareFootage),
            sinkCutoutCount: numOrNull(input.classificationHints.sinkCutoutCount),
            edgeProfile: input.classificationHints.edgeProfile ?? null,
            backsplashDescription: input.classificationHints.backsplashDescription ?? null,
            projectName: input.classificationHints.projectName ?? null
          }
        : null,
    syntheticPlanAcknowledged: Boolean(input.syntheticPlanAcknowledged ?? true)
  };
}

/**
 * Safe log / response metadata — never includes bytes or base64.
 */
export function takeoffRequestAuditMeta(req) {
  return {
    caseId: req.caseId,
    acceptedIntakeSnapshotId: req.acceptedIntakeSnapshotId,
    attachmentId: req.attachmentId,
    filename: req.filename,
    mimeType: req.mimeType,
    sizeBytes: req.sizeBytes,
    contentHash: req.contentHash,
    actorLabel: req.actorLabel,
    requestedAt: req.requestedAt
  };
}

function requireString(v, code, message, max) {
  const s = String(v ?? "").trim();
  if (!s) reject(400, code, message);
  return s.slice(0, max);
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function assertNoHtml(input) {
  if (input.htmlBody != null || input.rawHtml != null || input.html != null || input.textBodyHtml != null) {
    reject(400, "HTML_FORBIDDEN", "Raw HTML is not permitted in live takeoff requests.");
  }
  const blob = JSON.stringify({
    filename: input.filename,
    note: input.note,
    actorLabel: input.actorLabel
  });
  if (/<\s*html|<\s*script/i.test(blob)) {
    reject(400, "HTML_FORBIDDEN", "HTML-like content is not permitted in live takeoff requests.");
  }
}

function assertNoProductionRefs(input) {
  const scan = [
    input.storageUrl,
    input.url,
    input.productionTakeoffJobId,
    input.internalEstimateId,
    input.quoteLibraryId,
    input.takeoffJobId,
    input.attachment?.storageUrl,
    input.attachment?.url
  ]
    .filter(Boolean)
    .map(String)
    .join("\n");
  if (PROD_URL_RE.test(scan)) {
    reject(400, "PRODUCTION_URL_FORBIDDEN", "Production URLs are not permitted.");
  }
  for (const id of [
    input.productionTakeoffJobId,
    input.internalEstimateId,
    input.quoteLibraryId,
    input.takeoffJobId
  ]) {
    if (id != null && PROD_ID_RE.test(String(id))) {
      reject(400, "PRODUCTION_ID_FORBIDDEN", "Production Takeoff / IE / Quote Library IDs are not permitted.");
    }
  }
  if (
    input.productionTakeoffJobId != null ||
    input.internalEstimateId != null ||
    input.quoteLibraryId != null
  ) {
    reject(400, "PRODUCTION_ID_FORBIDDEN", "Production Takeoff / IE / Quote Library IDs are not permitted.");
  }
}

function reject(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  throw err;
}
