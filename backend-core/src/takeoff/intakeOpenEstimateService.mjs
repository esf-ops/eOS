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
  ATTACHMENT_SUPPORT,
  describeMissingPdfReason,
  isSupportedDirectPdf,
  isSupportedTakeoffPlan
} from "../quoteIntake/quoteIntakeAttachmentMeta.mjs";
import {
  findScopedAttachment,
  isSafeManualPlanImageOverride,
  requestHasManualPlanOverride
} from "../quoteIntake/quoteIntakePlanAttachmentSupport.mjs";
import { ingestQuoteFileFromBytes } from "../files/ingestQuoteFileFromBytes.mjs";
import { createTakeoffWorkspace } from "./takeoffWorkspaceService.mjs";
import {
  TAKEOFF_INITIATION_MODE,
  TAKEOFF_LINK_RELATIONSHIP_STATUS
} from "../quoteIntake/quoteIntakeTypes.mjs";
import {
  deriveIntakeLinkStatusFromJob,
  syncIntakeTakeoffLinkFromJob
} from "./intakeTakeoffLinkStatus.mjs";
import { decodeAndValidatePdfBytes, sha256BytesHex } from "../quoteIntake/quoteIntakeGraphNormalize.mjs";
import { validatePlanBytes } from "../elite100EstimateStudio/studioSecurePlanViewer.mjs";
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
 * Select a supported plan attachment (PDF or plan-like image) from a case.
 *
 * - Zero supported plans → no_supported_pdf with a precise `.reason`.
 * - Exactly one → selected deterministically.
 * - More than one → caller may pass selectedAttachmentId; otherwise multi_pdf_ambiguous.
 * - markAsPlan + Graph key / id / scoped filename can promote an image_needs_review row.
 *
 * PDF auto-selection is unchanged: markAsPlan filename/key fallbacks only apply when
 * markAsPlan is true (manual image override). direct_pdf never requires markAsPlan.
 *
 * @param {object} caseRow
 * @param {{
 *   selectedAttachmentId?: string|null,
 *   selectedAttachmentKey?: string|null,
 *   selectedFilename?: string|null,
 *   markAsPlan?: boolean
 * }} [opts]
 */
export function selectSupportedPdfAttachment(caseRow, opts = {}) {
  const atts = Array.isArray(caseRow?.attachments) ? caseRow.attachments : [];
  let plans = atts.filter(isSupportedTakeoffPlan);

  const selectedId = String(opts.selectedAttachmentId ?? "").trim();
  const selectedKey = String(opts.selectedAttachmentKey ?? "").trim();
  const selectedFilename = String(opts.selectedFilename ?? "").trim();

  if (opts.markAsPlan === true) {
    const candidate = findScopedAttachment(atts, {
      attachmentKey: selectedKey || selectedId || null,
      attachmentId: selectedId || null,
      filename: selectedFilename || null,
      // Filename fallback is intentional for Graph JPG override when the persisted
      // case row lost / truncated sourceAttachmentId. Scoped to this case only.
      allowFilenameFallback: true
    });
    if (
      candidate &&
      !candidate.isInline &&
      (candidate.support === ATTACHMENT_SUPPORT.IMAGE_NEEDS_REVIEW ||
        (!isSupportedTakeoffPlan(candidate) && isSafeManualPlanImageOverride(candidate)))
    ) {
      // Treat as a plan for this handoff only (persisted promotion is optional).
      plans = [candidate];
    }
  }

  if (plans.length === 0) {
    const err = openEstimateError(
      "No supported plan PDF or image attachment is available for this case. Send to manual review.",
      422,
      "no_supported_pdf"
    );
    err.reason = describeMissingPdfReason(atts);
    throw err;
  }

  if (plans.length === 1) return plans[0];

  if (selectedId || selectedKey || selectedFilename) {
    const chosen =
      findScopedAttachment(plans, {
        attachmentKey: selectedKey || selectedId || null,
        attachmentId: selectedId || null,
        filename: selectedFilename || null,
        allowFilenameFallback: Boolean(selectedFilename)
      }) ||
      plans.find((a) => String(a?.id ?? "") === selectedId);
    if (chosen) return chosen;
    throw openEstimateError(
      "Selected attachment is not a supported plan on this case.",
      422,
      "attachment_selection_invalid"
    );
  }

  const err = openEstimateError(
    "Multiple plan attachments are available. Select one to open.",
    409,
    "multi_pdf_ambiguous"
  );
  err.selectionRequired = true;
  err.options = plans.map((a) => ({
    attachmentId: String(a?.id ?? ""),
    safeFilename: a?.safeFilename || "plan",
    sizeBytes: a?.sizeBytes ?? null,
    support: a?.support || null
  }));
  throw err;
}

/** @deprecated Prefer selectSupportedPdfAttachment (now PDF + image plans). */
export const selectSupportedPlanAttachment = selectSupportedPdfAttachment;

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
 * Ensure Graph fetch identity is present on a selected attachment.
 * Used when inbox sends a live Graph attachmentKey but the case row lost it.
 * @param {object} attachment
 * @param {{ attachmentKey?: string|null, caseRow?: object }} opts
 */
export function hydrateAttachmentGraphIdentity(attachment, opts = {}) {
  if (!attachment || typeof attachment !== "object") return attachment;
  const key = String(opts.attachmentKey || "").trim();
  const caseMessageId = String(
    opts.caseRow?.sourceMessage?.graphImmutableMessageId || ""
  ).trim();
  const existingSource = String(attachment.sourceAttachmentId || "").trim();

  /** @type {Record<string, unknown>} */
  const next = { ...attachment };

  if (key) {
    if (!existingSource) {
      next.sourceAttachmentId = key;
    } else if (
      existingSource.length >= 32 &&
      key.length > existingSource.length &&
      key.startsWith(existingSource)
    ) {
      // Prefer the longer live Graph key when the stored id looks truncated.
      next.sourceAttachmentId = key;
    }
  }

  if (!String(next.providerMessageId || "").trim() && caseMessageId) {
    next.providerMessageId = caseMessageId;
  }

  return next;
}

/**
 * Resolve plan bytes: injected provider → Graph re-fetch → fail closed.
 * Supports PDF magic and JPEG/PNG/WEBP magic via validatePlanBytes.
 * @param {{
 *   caseRow: object,
 *   attachment: object,
 *   env: NodeJS.ProcessEnv,
 *   graphClient?: { getAttachment: Function }|null,
 *   fetchAttachmentBytes?: Function|null
 * }} deps
 */
async function resolveValidatedPlanBytes(deps) {
  const { caseRow, attachment, env, graphClient, fetchAttachmentBytes } = deps;
  const storedSha = String(attachment?.sha256 ?? "").trim().toLowerCase();
  const expectedSha = /^[a-f0-9]{64}$/.test(storedSha) ? storedSha : null;
  const limits = readQuoteIntakeGraphLimits(env);
  const maxBytes = limits.maxPdfBytes;
  const filename = attachment?.safeFilename || attachment?.name || "plan";
  const declaredMime = attachment?.mimeType || null;

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

  const validateBuffer = (buf) => {
    assertDownloadedLength(buf.length);
    let validatedMeta;
    try {
      validatedMeta = validatePlanBytes(buf, {
        declaredMime: declaredMime,
        filename
      });
    } catch (e) {
      throw openEstimateError(
        e?.message || "Attachment is not a supported plan file",
        Number(e?.statusCode) || 400,
        e?.code || "attachment_unsupported"
      );
    }
    // Own a copy so post-ingest zero-fill cannot mutate caller/cached buffers.
    const owned = Buffer.from(buf);
    const sha = sha256BytesHex(owned);
    assertShaMatch(sha);
    return {
      bytes: owned,
      sha256: sha,
      sizeBytes: owned.length,
      mimeType: validatedMeta.contentType,
      kind: validatedMeta.kind
    };
  };

  if (typeof fetchAttachmentBytes === "function") {
    const raw = await fetchAttachmentBytes({ caseRow, attachment });
    if (Buffer.isBuffer(raw)) {
      return validateBuffer(raw);
    }
    if (raw && typeof raw === "object" && Buffer.isBuffer(raw.bytes)) {
      return validateBuffer(raw.bytes);
    }
  }

  const messageId = String(
    attachment?.providerMessageId ?? caseRow?.sourceMessage?.graphImmutableMessageId ?? ""
  ).trim();
  const sourceAttachmentId = String(attachment?.sourceAttachmentId ?? "").trim();

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
      "Plan file bytes are not available for Takeoff. Re-import the mailbox message or use a persistent intake store.",
      422,
      "attachment_bytes_unavailable"
    );
  }

  const att = await client.getAttachment(messageId, sourceAttachmentId);
  assertPdfMetadataWithinLimit(att?.size, maxBytes);
  if (!att?.contentBytes || typeof att.contentBytes !== "string") {
    throw openEstimateError(
      "Plan file bytes are not available for Takeoff. Re-import the mailbox message or use a persistent intake store.",
      422,
      "attachment_bytes_unavailable"
    );
  }
  let buf;
  try {
    buf = Buffer.from(att.contentBytes, "base64");
  } catch {
    throw openEstimateError("Attachment decode failed", 400, "attachment_hash_failed");
  }
  return validateBuffer(buf);
}

/** @deprecated Use resolveValidatedPlanBytes */
async function resolveValidatedPdfBytes(deps) {
  const result = await resolveValidatedPlanBytes(deps);
  if (result.kind !== "pdf" && !String(result.mimeType || "").includes("pdf")) {
    // Legacy callers that only expect PDF still receive validated plan bytes;
    // image plans are allowed through the shared path.
  }
  return result;
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
  // Prefer intake attachment UUID; Graph attachmentKey is resolved below when needed.
  const attachmentKey =
    body && typeof body === "object" && typeof body.attachmentKey === "string"
      ? body.attachmentKey.trim()
      : null;
  const selectedFilename =
    body && typeof body === "object"
      ? String(
          body.attachmentFilename ||
            body.filename ||
            body.safeFilename ||
            body.attachmentName ||
            ""
        ).trim() || null
      : null;
  const markAsPlan = requestHasManualPlanOverride(body);

  // Resolve Graph opaque keys / filenames against the persisted case attachment list.
  // Filename fallback is only used for manual image override (markAsPlan).
  const resolved =
    findScopedAttachment(caseRow.attachments, {
      attachmentKey: attachmentKey || selectedAttachmentId,
      attachmentId: selectedAttachmentId,
      filename: selectedFilename,
      allowFilenameFallback: markAsPlan === true
    }) || null;
  const resolvedSelectedId = resolved?.id
    ? String(resolved.id)
    : selectedAttachmentId;

  let attachment = selectSupportedPdfAttachment(caseRow, {
    selectedAttachmentId: resolvedSelectedId,
    selectedAttachmentKey: attachmentKey,
    selectedFilename: selectedFilename,
    markAsPlan
  });

  // Production Graph JPG shape: live UI sends AAMk… attachmentKey, but the persisted
  // intake attachment often has sourceAttachmentId null. Selection can succeed via
  // scoped filename; Graph byte fetch still requires the opaque attachment id.
  // Hydrate in-memory only (no migration). PDF auto path is unchanged when the
  // stored sourceAttachmentId is already present.
  attachment = hydrateAttachmentGraphIdentity(attachment, {
    attachmentKey,
    caseRow
  });

  const idempotencyKey = buildOpenEstimateIdempotencyKey(caseRow, attachment);
  const lockKey = `${org}:${idempotencyKey}`;

  return withIdempotencyLock(lockKey, async () => {
    async function resolveLinkStatusForJob(takeoffJobId, fallbackStatus) {
      if (typeof getSupabase !== "function") {
        return String(fallbackStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED);
      }
      try {
        const supabase = getSupabase();
        const { data: job } = await supabase
          .from("quote_takeoff_jobs")
          .select("id,organization_id,status,review_status,metadata")
          .eq("id", takeoffJobId)
          .eq("organization_id", org)
          .maybeSingle();
        if (!job) return String(fallbackStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED);
        await syncIntakeTakeoffLinkFromJob(supabase, job);
        const proc = job.metadata?.processing || {};
        return deriveIntakeLinkStatusFromJob(job.status, job.review_status, proc.phase);
      } catch {
        return String(fallbackStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED);
      }
    }

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
      const linkStatus = await resolveLinkStatusForJob(
        active.takeoffJobId,
        active.relationshipStatus
      );
      return {
        ok: true,
        intakeCaseId: caseId,
        takeoffJobId: String(active.takeoffJobId),
        linkStatus,
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
      const linkStatus = await resolveLinkStatusForJob(byKey.takeoffJobId, byKey.relationshipStatus);
      return {
        ok: true,
        intakeCaseId: caseId,
        takeoffJobId: String(byKey.takeoffJobId),
        linkStatus,
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
      validated = await resolveValidatedPlanBytes({
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
        mimeType: validated.mimeType || attachment.mimeType || "application/pdf",
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
