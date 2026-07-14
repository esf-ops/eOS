import { SUPPORTED_PLAN_MIME_TYPES } from "./takeoffTypes.mjs";

const PROD_URL_RE =
  /supabase\.co|eliteos-quote-files|storage\/v1|takeoff\.eliteosfab|backend-core|\/api\/takeoff|quote_takeoff_|quote_files|internal-quotes|quote-library|quote_headers/i;

const PROD_ID_RE =
  /^(qto-|qtj-|qf-|qfh-|ie-|ql-|qh-)|quote_takeoff_|quote_file_|internal_estimate_|quote_library_/i;

/**
 * Build a validated TakeoffRequest. Does not read attachment bytes.
 *
 * @param {{
 *   caseId: string,
 *   acceptedIntakeSnapshotId: string|null|undefined,
 *   elite100Decision: string|null|undefined,
 *   intent?: string|null,
 *   attachments: Array<{
 *     id: string,
 *     filename: string,
 *     contentType: string,
 *     sizeBytes?: number,
 *     contentHash?: string|null,
 *     source?: string,
 *     storageUrl?: string|null,
 *     bytes?: unknown,
 *     productionTakeoffJobId?: string|null,
 *     internalEstimateId?: string|null,
 *     quoteLibraryId?: string|null
 *   }>,
 *   selectedAttachmentId: string,
 *   transmissionAcknowledgmentPlaceholder: boolean,
 *   actorLabel: string,
 *   requestedAt?: string,
 *   scenarioId?: string
 * }} input
 */
export function buildTakeoffRequest(input) {
  assertPresent(input?.caseId, "CASE_ID_REQUIRED", "Lab case ID is required.");
  assertPresent(
    input?.acceptedIntakeSnapshotId,
    "ACCEPTED_INTAKE_REQUIRED",
    "An accepted intake classification snapshot is required before takeoff."
  );

  const intent = String(input.intent ?? "");
  if (intent === "not_quote_related") {
    reject("NOT_QUOTE_RELATED", "Case is marked not quote-related; takeoff is not allowed.");
  }

  const elite = String(input.elite100Decision ?? "");
  if (elite === "non_elite_100_candidate") {
    reject("NON_ELITE_100", "Case is marked non-Elite-100; MVP takeoff is not allowed.");
  }
  if (elite !== "elite_100_candidate") {
    reject(
      "ELITE_100_CANDIDATE_REQUIRED",
      "Accepted Elite 100 candidate decision is required before takeoff."
    );
  }

  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  if (!attachments.length) {
    reject("ATTACHMENT_REQUIRED", "At least one plan attachment is required.");
  }
  if (!input.selectedAttachmentId) {
    reject("ATTACHMENT_SELECTION_REQUIRED", "Exactly one plan attachment must be selected.");
  }

  const selected = attachments.filter((a) => a && a.id === input.selectedAttachmentId);
  if (selected.length !== 1) {
    reject("ATTACHMENT_NOT_FOUND", "Selected attachment was not found on the case.");
  }
  // Explicit one-selection policy: caller must not pass a multi-select list.
  if (input.selectedAttachmentIds != null) {
    reject("MULTIPLE_ATTACHMENTS", "Multiple selected attachments are not supported.");
  }

  const att = selected[0];
  if (att.bytes != null) {
    // Phase 4B.0 must never consume bytes — reject if caller tried to pass them.
    reject("ATTACHMENT_BYTES_FORBIDDEN", "Phase 4B.0 must not read or accept attachment bytes.");
  }
  if (att.storageUrl || looksLikeProdUrl(att.filename) || looksLikeProdUrl(att.storageUrl)) {
    reject("PRODUCTION_STORAGE_URL", "Production storage URLs are not allowed in lab takeoff requests.");
  }
  if (att.productionTakeoffJobId || PROD_ID_RE.test(String(att.productionTakeoffJobId ?? ""))) {
    reject("PRODUCTION_TAKEOFF_ID", "Production takeoff job IDs are not allowed.");
  }
  if (att.internalEstimateId) {
    reject("INTERNAL_ESTIMATE_ID", "Internal Estimate IDs are not allowed.");
  }
  if (att.quoteLibraryId) {
    reject("QUOTE_LIBRARY_ID", "Quote Library IDs are not allowed.");
  }
  if (PROD_ID_RE.test(String(att.id ?? "")) || PROD_URL_RE.test(String(att.id ?? ""))) {
    reject("PRODUCTION_IDENTIFIER", "Attachment id looks like a production identifier.");
  }
  if (PROD_ID_RE.test(String(input.caseId)) || PROD_URL_RE.test(String(input.caseId))) {
    reject("PRODUCTION_IDENTIFIER", "Case id must not reference production takeoff/quote systems.");
  }
  if (
    PROD_ID_RE.test(String(input.acceptedIntakeSnapshotId)) &&
    !String(input.acceptedIntakeSnapshotId).startsWith("qil-")
  ) {
    reject("PRODUCTION_IDENTIFIER", "Accepted snapshot id must be a lab snapshot id.");
  }

  const mime = String(att.contentType ?? "").toLowerCase();
  if (!SUPPORTED_PLAN_MIME_TYPES.includes(mime)) {
    reject("UNSUPPORTED_MIME", `Unsupported plan MIME type: ${mime || "(empty)"}`);
  }

  const hash = String(att.contentHash ?? "").trim().toLowerCase();
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
    reject("ATTACHMENT_HASH_REQUIRED", "Attachment SHA-256 hash is required (64 hex chars).");
  }

  const sizeBytes = Number(att.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    reject("ATTACHMENT_SIZE_REQUIRED", "Attachment byte size must be a positive number (metadata only).");
  }

  if (input.transmissionAcknowledgmentPlaceholder !== true) {
    reject(
      "TRANSMISSION_ACK_REQUIRED",
      "transmissionAcknowledgmentPlaceholder must be true (placeholder for future live ack)."
    );
  }

  const source = normalizeSource(att.source);
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const actorLabel = String(input.actorLabel ?? "").trim() || "Lab Estimator";

  return Object.freeze({
    caseId: String(input.caseId),
    acceptedIntakeSnapshotId: String(input.acceptedIntakeSnapshotId),
    elite100Decision: "elite_100_candidate",
    attachment: Object.freeze({
      attachmentId: String(att.id),
      caseId: String(input.caseId),
      filename: String(att.filename ?? "plan.pdf"),
      contentType: mime,
      sizeBytes,
      contentHash: hash,
      source,
      transmissionAcknowledgmentPlaceholder: true
    }),
    requestedAt,
    actorLabel,
    ...(input.scenarioId ? { scenarioId: String(input.scenarioId) } : {})
  });
}

function normalizeSource(source) {
  if (source === "imported_eml" || source === "manual_paste" || source === "synthetic_fixture") {
    return source;
  }
  return "synthetic_fixture";
}

function looksLikeProdUrl(value) {
  if (value == null || value === "") return false;
  return PROD_URL_RE.test(String(value));
}

function assertPresent(value, code, message) {
  if (value == null || String(value).trim() === "") reject(code, message);
}

function reject(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}
