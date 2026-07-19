/**
 * intakeOpenEstimateService — idempotent Quote Intake → production Takeoff handoff.
 *
 * Lives outside backend-core/src/quoteIntake so the intake package boundary
 * (no direct takeoffWorkspaceService imports) remains intact.
 *
 * Never trusts organizationId, actor, takeoffJobId, mailbox, Graph URL,
 * token, or attachment URL from the browser.
 */
import {
  isQuoteIntakeGraphEnabled,
  readQuoteIntakeGraphCredentials,
  readQuoteIntakeGraphLimits,
  assertPdfMetadataWithinLimit,
  pdfTooLargeError
} from "../quoteIntake/quoteIntakeGraphConfig.mjs";
import { createQuoteIntakeGraphClient } from "../quoteIntake/quoteIntakeGraphClient.mjs";
import {
  ATTACHMENT_RETRIEVAL_STATE,
  describeMissingPdfReason,
  isSupportedDirectPdf
} from "../quoteIntake/quoteIntakeAttachmentMeta.mjs";
import { ingestQuoteFileFromBytes } from "../files/ingestQuoteFileFromBytes.mjs";
import { createTakeoffWorkspace } from "./takeoffWorkspaceService.mjs";
import {
  TAKEOFF_INITIATION_MODE,
  TAKEOFF_LINK_RELATIONSHIP_STATUS
} from "../quoteIntake/quoteIntakeTypes.mjs";
import { decodeAndValidatePdfBytes } from "../quoteIntake/quoteIntakeGraphNormalize.mjs";
import { createHash } from "node:crypto";

/** @type {Map<string, Promise<unknown>>} */
const inflightByKey = new Map();

/**
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withIdempotencyLock(key, fn) {
  const existing = inflightByKey.get(key);
  if (existing) {
    return /** @type {Promise<T>} */ (existing);
  }
  const run = (async () => {
    try {
      return await fn();
    } finally {
      inflightByKey.delete(key);
    }
  })();
  inflightByKey.set(key, run);
  return run;
}

/**
 * @param {string} message
 * @param {number} statusCode
 * @param {string} code
 */
function openEstimateError(message, statusCode, code) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  e.isValidationError = statusCode < 500;
  return e;
}

/**
 * Reject caller-controlled identity / Graph / attachment fields on the body.
 * @param {unknown} body
 */
export function rejectCallerOpenEstimateHints(body) {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "organizationId",
    "orgId",
    "actorId",
    "actorUserId",
    "userId",
    "createdByUserId",
    "takeoffJobId",
    "quoteFileId",
    "mailbox",
    "mailboxAddress",
    "tenantId",
    "tenant",
    "graphUrl",
    "graphBaseUrl",
    "accessToken",
    "token",
    "clientSecret",
    "clientId",
    "attachmentUrl",
    "contentUrl",
    "downloadUrl",
    "storagePath",
    "storageUrl",
    "bytes",
    "contentBytes",
    "pdfUrl"
  ];
  for (const key of forbidden) {
    const v = /** @type {Record<string, unknown>} */ (body)[key];
    if (v != null && v !== "") {
      throw openEstimateError(
        "Caller-controlled identity or file fields are not accepted",
        400,
        "graph_forbidden"
      );
    }
  }
}

/**
 * Select the supported PDF attachment from a case using server-side classification.
 *
 * - Zero supported PDFs → no_supported_pdf with a precise `.reason`.
 * - Exactly one → selected deterministically.
 * - More than one → caller may pass selectedAttachmentId (a Quote Intake attachment
 *   record UUID, never a Graph id/URL); otherwise multi_pdf_ambiguous.
 *
 * @param {object} caseRow
 * @param {{ selectedAttachmentId?: string|null }} [opts]
 */
export function selectSupportedPdfAttachment(caseRow, opts = {}) {
  const atts = Array.isArray(caseRow?.attachments) ? caseRow.attachments : [];
  const pdfs = atts.filter(isSupportedDirectPdf);

  if (pdfs.length === 0) {
    const err = openEstimateError(
      "No supported PDF attachment is available for this case. Send to manual review.",
      422,
      "no_supported_pdf"
    );
    err.reason = describeMissingPdfReason(atts);
    throw err;
  }

  if (pdfs.length === 1) return pdfs[0];

  const selectedId = String(opts.selectedAttachmentId ?? "").trim();
  if (selectedId) {
    const chosen = pdfs.find((a) => String(a?.id ?? "") === selectedId);
    if (chosen) return chosen;
    throw openEstimateError(
      "Selected attachment is not a supported PDF on this case.",
      422,
      "attachment_selection_invalid"
    );
  }

  const err = openEstimateError(
    "Multiple PDF attachments are available. Select one to open.",
    409,
    "multi_pdf_ambiguous"
  );
  err.selectionRequired = true;
  err.options = pdfs.map((a) => ({
    attachmentId: String(a?.id ?? ""),
    safeFilename: a?.safeFilename || "plan.pdf",
    sizeBytes: a?.sizeBytes ?? null
  }));
  throw err;
}

/**
 * @param {object} caseRow
 * @param {object} attachment
 */
export function buildOpenEstimateIdempotencyKey(caseRow, attachment) {
  const caseId = String(caseRow?.id ?? "").trim();
  const sha = String(attachment?.sha256 ?? "")
    .trim()
    .toLowerCase();
  // Prefer the content hash for stability; before bytes are retrieved fall back to
  // the durable Quote Intake attachment record id so repeat opens stay idempotent.
  const discriminator = /^[a-f0-9]{64}$/.test(sha)
    ? sha
    : String(attachment?.id ?? attachment?.sourceAttachmentId ?? "").trim();
  return `open-estimate:v1:${caseId}:${discriminator}`;
}

/**
 * @param {object[]} links
 */
function findActiveLinkedJob(links) {
  const list = Array.isArray(links) ? links : [];
  return (
    list.find(
      (l) =>
        l?.takeoffJobId &&
        String(l.relationshipStatus ?? "") !== TAKEOFF_LINK_RELATIONSHIP_STATUS.FAILED &&
        String(l.relationshipStatus ?? "") !== TAKEOFF_LINK_RELATIONSHIP_STATUS.SUPERSEDED
    ) || null
  );
}

/**
 * Resolve PDF bytes: injected provider → Graph re-fetch → fail closed.
 * @param {{
 *   caseRow: object,
 *   attachment: object,
 *   env: NodeJS.ProcessEnv,
 *   graphClient?: { getAttachment: Function }|null,
 *   fetchAttachmentBytes?: Function|null
 * }} deps
 */
async function resolveValidatedPdfBytes(deps) {
  const { caseRow, attachment, env, graphClient, fetchAttachmentBytes } = deps;
  const storedSha = String(attachment?.sha256 ?? "").trim().toLowerCase();
  // Metadata-only rows carry no sha256 until now; compute it from the real bytes.
  const expectedSha = /^[a-f0-9]{64}$/.test(storedSha) ? storedSha : null;
  const limits = readQuoteIntakeGraphLimits(env);
  const maxBytes = limits.maxPdfBytes;

  // Reject obviously oversized files from Graph/declared metadata BEFORE download.
  // Downloaded byte length is still verified below — metadata alone never authorizes.
  assertPdfMetadataWithinLimit(attachment?.sizeBytes, maxBytes);

  const assertShaMatch = (actual) => {
    if (expectedSha && actual !== expectedSha) {
      throw openEstimateError(
        "Attachment content does not match stored hash",
        409,
        "attachment_hash_mismatch"
      );
    }
  };

  const assertDownloadedLength = (byteLength) => {
    if (byteLength > maxBytes) {
      throw pdfTooLargeError(byteLength, maxBytes);
    }
  };

  if (typeof fetchAttachmentBytes === "function") {
    const raw = await fetchAttachmentBytes({ caseRow, attachment });
    if (Buffer.isBuffer(raw)) {
      assertDownloadedLength(raw.length);
      const validated = decodeAndValidatePdfBytes(raw.toString("base64"), {
        maxBytes
      });
      assertShaMatch(validated.sha256);
      return validated;
    }
    if (raw && typeof raw === "object" && Buffer.isBuffer(raw.bytes)) {
      assertDownloadedLength(raw.bytes.length);
      const sha =
        String(raw.sha256 ?? "").toLowerCase() ||
        createHash("sha256").update(raw.bytes).digest("hex");
      assertShaMatch(sha);
      // Magic check even for injected byte providers.
      if (raw.bytes.length < 4 || !raw.bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) {
        throw openEstimateError(
          "Attachment is not a valid PDF",
          400,
          "attachment_unsupported"
        );
      }
      return { bytes: raw.bytes, sha256: sha, sizeBytes: raw.bytes.length };
    }
  }

  const messageId = String(
    attachment?.providerMessageId ?? caseRow?.sourceMessage?.graphImmutableMessageId ?? ""
  ).trim();
  const sourceAttachmentId = String(attachment?.sourceAttachmentId ?? "").trim();

  // Build a fixed-mailbox Graph client from server env when none injected.
  let client = graphClient;
  if (!client && messageId && sourceAttachmentId && isQuoteIntakeGraphEnabled(env)) {
    try {
      const credentials = readQuoteIntakeGraphCredentials(env);
      client = createQuoteIntakeGraphClient({
        mailbox: credentials.mailbox,
        credentials,
        timeoutMs: limits.timeoutMs
      });
    } catch {
      client = null;
    }
  }

  if (!client || !messageId || !sourceAttachmentId) {
    throw openEstimateError(
      "Plan PDF bytes are not available for Takeoff. Re-import the mailbox message or use a persistent intake store.",
      422,
      "attachment_bytes_unavailable"
    );
  }

  const att = await client.getAttachment(messageId, sourceAttachmentId);
  // Graph may also report size on the full attachment object — reject before decode.
  assertPdfMetadataWithinLimit(att?.size, maxBytes);
  const validated = decodeAndValidatePdfBytes(att?.contentBytes, {
    maxBytes
  });
  assertShaMatch(validated.sha256);
  return validated;
}

/**
 * @param {{
 *   repository: object,
 *   organizationId: string,
 *   intakeCaseId: string,
 *   actorUserId?: string|null,
 *   body?: unknown,
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: Function,
 *   graphClient?: object|null,
 *   fetchAttachmentBytes?: Function|null,
 *   ingestFile?: typeof ingestQuoteFileFromBytes,
 *   createWorkspace?: typeof createTakeoffWorkspace,
 *   repositoryMode?: string,
 *   initiationMode?: string
 * }} deps
 */
export async function openEstimateForIntakeCase(deps) {
  const {
    repository,
    organizationId,
    intakeCaseId,
    actorUserId = null,
    body = {},
    env = process.env,
    getSupabase,
    graphClient = null,
    fetchAttachmentBytes = null,
    ingestFile = ingestQuoteFileFromBytes,
    createWorkspace = createTakeoffWorkspace,
    repositoryMode = "unknown",
    initiationMode = TAKEOFF_INITIATION_MODE.MANUAL
  } = deps;
  const resolvedInitiationMode =
    String(initiationMode || "").trim() === TAKEOFF_INITIATION_MODE.AUTOMATIC
      ? TAKEOFF_INITIATION_MODE.AUTOMATIC
      : TAKEOFF_INITIATION_MODE.MANUAL;

  rejectCallerOpenEstimateHints(body);

  const org = String(organizationId ?? "").trim();
  const caseId = String(intakeCaseId ?? "").trim();
  if (!org || !caseId) {
    throw openEstimateError("Case not found", 404, "case_not_found");
  }

  const caseRow = await repository.getCase(org, caseId);
  if (!caseRow) {
    throw openEstimateError("Case not found", 404, "case_not_found");
  }

  const selectedAttachmentId =
    body && typeof body === "object" && typeof body.attachmentId === "string"
      ? body.attachmentId.trim()
      : null;
  const attachment = selectSupportedPdfAttachment(caseRow, { selectedAttachmentId });
  const idempotencyKey = buildOpenEstimateIdempotencyKey(caseRow, attachment);
  const lockKey = `${org}:${idempotencyKey}`;

  return withIdempotencyLock(lockKey, async () => {
    const existingLinks = await repository.listTakeoffLinks(org, caseId);
    const active = findActiveLinkedJob(existingLinks);
    if (active?.takeoffJobId) {
      try {
        await repository.appendAuditEvent?.({
          organizationId: org,
          intakeCaseId: caseId,
          eventType: "takeoff_link_reused",
          actorType: "user",
          actorUserId,
          metadata: {
            linkId: active.id,
            takeoffJobIdPresent: true,
            reused: true
          }
        });
      } catch {
        // optional
      }
      return {
        ok: true,
        intakeCaseId: caseId,
        takeoffJobId: String(active.takeoffJobId),
        linkStatus: String(active.relationshipStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED),
        created: false,
        reused: true,
        attachmentName: attachment.safeFilename || "plan.pdf",
        repositoryMode,
        persistenceWarning:
          String(repositoryMode).toLowerCase() === "memory"
            ? "Quote Intake is using in-memory persistence; links reset when the Brain process restarts."
            : null
      };
    }

    const byKey = existingLinks.find((l) => l.idempotencyKey === idempotencyKey && l.takeoffJobId);
    if (byKey?.takeoffJobId) {
      return {
        ok: true,
        intakeCaseId: caseId,
        takeoffJobId: String(byKey.takeoffJobId),
        linkStatus: String(byKey.relationshipStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED),
        created: false,
        reused: true,
        attachmentName: attachment.safeFilename || "plan.pdf",
        repositoryMode,
        persistenceWarning:
          String(repositoryMode).toLowerCase() === "memory"
            ? "Quote Intake is using in-memory persistence; links reset when the Brain process restarts."
            : null
      };
    }

    if (typeof getSupabase !== "function") {
      throw openEstimateError(
        "Takeoff workspace services are unavailable",
        503,
        "takeoff_unavailable"
      );
    }
    const supabase = getSupabase();
    if (!supabase) {
      throw openEstimateError(
        "Takeoff workspace services are unavailable",
        503,
        "takeoff_unavailable"
      );
    }

    let validated;
    try {
      validated = await resolveValidatedPdfBytes({
        caseRow,
        attachment,
        env,
        graphClient,
        fetchAttachmentBytes
      });
    } catch (e) {
      if (attachment?.id && typeof repository.updateAttachmentRetrieval === "function") {
        try {
          await repository.updateAttachmentRetrieval(org, caseId, attachment.id, {
            retrievalState:
              e?.code === "attachment_bytes_unavailable"
                ? ATTACHMENT_RETRIEVAL_STATE.UNAVAILABLE
                : ATTACHMENT_RETRIEVAL_STATE.FAILED
          });
        } catch {
          // best-effort
        }
      }
      throw e;
    }

    if (attachment?.id && typeof repository.updateAttachmentRetrieval === "function") {
      try {
        await repository.updateAttachmentRetrieval(org, caseId, attachment.id, {
          sha256: validated.sha256,
          retrievalState: ATTACHMENT_RETRIEVAL_STATE.RETRIEVED
        });
      } catch {
        // best-effort — retrieval state is advisory
      }
    }

    let quoteFileId;
    try {
      const ingested = await ingestFile({
        supabase,
        organizationId: org,
        userId: actorUserId,
        bytes: validated.bytes,
        sha256: validated.sha256,
        originalFilename: attachment.safeFilename || "plan.pdf",
        mimeType: "application/pdf",
        metadata: {
          intakeCaseId: caseId,
          intakeAttachmentId: attachment.id || null,
          contentFingerprint: createHash("sha256")
            .update(`intake:${caseId}:${validated.sha256}`)
            .digest("hex")
            .slice(0, 16)
        }
      });
      quoteFileId = ingested.quoteFileId;
    } finally {
      validated.bytes.fill?.(0);
    }

    const workspace = await createWorkspace({
      supabase,
      organizationId: org,
      userId: actorUserId,
      quoteFileId
    });
    const takeoffJobId = String(workspace.takeoffJobId);

    const link = await repository.createTakeoffLink({
      organizationId: org,
      intakeCaseId: caseId,
      takeoffJobId,
      sourceAttachmentId: attachment.id || attachment.sourceAttachmentId,
      attachmentSha256: validated.sha256 || attachment.sha256,
      relationshipStatus: TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED,
      initiationMode: resolvedInitiationMode,
      idempotencyKey,
      actorType: "user",
      createdBy: actorUserId
    });

    // If an earlier stub link lacked a job id, createTakeoffLink returns that stub.
    // Prefer the workspace job id we just ensured.
    const resolvedJobId = String(link.takeoffJobId || takeoffJobId);

    return {
      ok: true,
      intakeCaseId: caseId,
      takeoffJobId: resolvedJobId,
      linkStatus: String(link.relationshipStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED),
      created: !existingLinks.some((l) => l.takeoffJobId === resolvedJobId),
      reused: Boolean(existingLinks.some((l) => l.takeoffJobId === resolvedJobId)),
      attachmentName: attachment.safeFilename || "plan.pdf",
      repositoryMode,
      persistenceWarning:
        String(repositoryMode).toLowerCase() === "memory"
          ? "Quote Intake is using in-memory persistence; links reset when the Brain process restarts."
          : null
    };
  });
}
