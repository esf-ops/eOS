/**
 * Manual mailbox preview + import — Phase 6P.4.
 * Human-triggered only. No Takeoff, Storage, mailbox mutation, or classification.
 */

import {
  isQuoteIntakeGraphEnabled,
  isQuoteIntakeGraphManualSyncEnabled,
  readQuoteIntakeGraphCredentials,
  readQuoteIntakeGraphLimits,
  readQuoteIntakeGraphMailbox
} from "./quoteIntakeGraphConfig.mjs";
import { createQuoteIntakeGraphClient } from "./quoteIntakeGraphClient.mjs";
import {
  boundedBodyPreview,
  boundedSubject,
  classifyAttachmentMeta,
  computeFallbackContentHash,
  decodeAndValidatePdfBytes,
  normalizeGraphMessageCore
} from "./quoteIntakeGraphNormalize.mjs";
import { QUOTE_INTAKE_CASE_STATUS } from "./quoteIntakeTypes.mjs";

function graphGate(env) {
  if (!isQuoteIntakeGraphEnabled(env)) {
    const err = new Error("Graph connector disabled");
    err.code = "graph_disabled";
    err.statusCode = 404;
    throw err;
  }
  if (!isQuoteIntakeGraphManualSyncEnabled(env)) {
    const err = new Error("Manual mailbox sync disabled");
    err.code = "graph_disabled";
    err.statusCode = 404;
    throw err;
  }
}

function rejectCallerMailboxHints(input) {
  const keys = [
    "mailbox",
    "mailboxAddress",
    "userId",
    "tenantId",
    "tenant",
    "graphUrl",
    "graphBaseUrl",
    "accessToken",
    "token",
    "clientSecret",
    "clientId",
    "nextLink",
    "@odata.nextLink",
    "attachmentUrl",
    "contentUrl",
    "downloadUrl"
  ];
  const suspicious = keys.some((k) => {
    const v = input?.[k];
    return v != null && String(v).trim() !== "";
  });
  if (suspicious) {
    const err = new Error("Caller-controlled mailbox parameters are not accepted");
    err.code = "graph_forbidden";
    err.statusCode = 400;
    throw err;
  }
}

/**
 * @param {object} repository
 * @param {string} organizationId
 * @param {{ internetMessageId?: string|null, graphMessageId?: string|null, contentHash?: string|null }} keys
 */
async function findExistingCase(repository, organizationId, keys) {
  if (typeof repository.findCaseBySourceKeys === "function") {
    return repository.findCaseBySourceKeys(organizationId, keys);
  }
  // Fallback: scan recent cases (memory / older repos).
  const rows = await repository.listCases(organizationId, { limit: 100 });
  const list = Array.isArray(rows) ? rows : [];
  if (keys.internetMessageId) {
    const hit = list.find(
      (c) => c.sourceMessage?.internetMessageId === keys.internetMessageId
    );
    if (hit) return hit;
  }
  if (keys.graphMessageId) {
    const hit = list.find(
      (c) => c.sourceMessage?.graphImmutableMessageId === keys.graphMessageId
    );
    if (hit) return hit;
  }
  if (keys.contentHash) {
    const hit = list.find(
      (c) =>
        !c.sourceMessage?.internetMessageId &&
        c.sourceMessage?.contentHash === keys.contentHash
    );
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   repository: any,
 *   graphClient?: any,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   body?: object
 * }} input
 */
export async function previewQuoteIntakeMailbox(input) {
  const env = input.env ?? process.env;
  rejectCallerMailboxHints(input.body ?? {});
  graphGate(env);

  const credentials = readQuoteIntakeGraphCredentials(env);
  const limits = readQuoteIntakeGraphLimits(env);
  const mailbox = credentials.mailbox;

  const client =
    input.graphClient ??
    createQuoteIntakeGraphClient({
      mailbox,
      credentials,
      fetchImpl: input.fetchImpl,
      now: input.now,
      timeoutMs: limits.timeoutMs
    });

  // Enforce fixed mailbox even if an injected client somehow differs.
  if (String(client.mailbox ?? "").toLowerCase() !== mailbox) {
    const err = new Error("Graph mailbox mismatch");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }

  const messages = await client.listInboxMessages({ top: limits.previewLimit });
  const previews = [];

  for (const raw of messages) {
    const core = normalizeGraphMessageCore(raw);
    if (!core.graphMessageId) continue;

    let attachmentMeta = [];
    if (core.hasAttachments) {
      try {
        const atts = await client.listAttachmentMetadata(core.graphMessageId);
        attachmentMeta = atts.map(classifyAttachmentMeta);
      } catch {
        attachmentMeta = [];
      }
    }

    const pdfCandidates = attachmentMeta.filter((a) => a.support === "direct_pdf");
    const hasUnsupportedItem = attachmentMeta.some((a) => a.support === "unsupported_item");
    const multiPdf = pdfCandidates.length > 1;

    const existing = await findExistingCase(input.repository, input.organizationId, {
      internetMessageId: core.internetMessageId,
      graphMessageId: core.graphMessageId
    });

    let eligibilityHint = "importable";
    if (existing) eligibilityHint = "already_imported";
    else if (hasUnsupportedItem && pdfCandidates.length === 0) eligibilityHint = "manual_review";
    else if (multiPdf) eligibilityHint = "manual_review_multi_pdf";
    else if (pdfCandidates.length === 0 && core.hasAttachments) eligibilityHint = "manual_review";
    else if (!core.hasAttachments) eligibilityHint = "importable_no_pdf";

    previews.push({
      graphMessageId: core.graphMessageId,
      internetMessageId: core.internetMessageId,
      conversationId: core.conversationId,
      receivedDateTime: core.receivedDateTime,
      lastModifiedDateTime: core.lastModifiedDateTime,
      subject: core.subject,
      bodyPreview: core.bodyPreview,
      sender: {
        // UI may show hashed/unknown; avoid shipping raw addresses if we can — but
        // pilot queue UX needs sender display. Return domain-safe display only:
        displayName: core.sender.name || null,
        // Redact full email in API: only return local presence flag + hash prefix
        emailPresent: Boolean(core.sender.email),
        fromAddressHashPrefix: core.sender.fromAddressHash
          ? core.sender.fromAddressHash.slice(0, 12)
          : null
      },
      recipientSummary: {
        toCount: core.recipientSummary.to.count,
        ccCount: core.recipientSummary.cc.count
      },
      hasAttachments: core.hasAttachments,
      attachments: attachmentMeta.map((a) => ({
        sourceAttachmentId: a.sourceAttachmentId,
        name: a.name,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        isInline: a.isInline,
        kind: a.kind,
        support: a.support
      })),
      alreadyImported: Boolean(existing),
      existingCaseId: existing?.id ?? null,
      dedupeState: existing
        ? core.internetMessageId
          ? "internet_message_id"
          : "graph_message_id"
        : "new",
      eligibilityHint,
      importable: !existing && eligibilityHint.startsWith("importable")
    });
  }

  return {
    mailboxDisplay: readQuoteIntakeGraphMailbox(env),
    readOnly: true,
    previewLimit: limits.previewLimit,
    messageCount: previews.length,
    messages: previews,
    // Preview audit is response-scoped; case-bound audit requires intake_case_id.
    audit: {
      eventType: "mailbox_preview_completed",
      messageCount: previews.length,
      alreadyImportedCount: previews.filter((m) => m.alreadyImported).length
    }
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   repository: any,
 *   graphClient?: any,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   body?: object
 * }} input
 */
export async function importQuoteIntakeMailboxMessages(input) {
  const env = input.env ?? process.env;
  const body = input.body && typeof input.body === "object" ? input.body : {};
  rejectCallerMailboxHints(body);
  graphGate(env);

  if (body.confirm !== true && body.confirm !== "true") {
    const err = new Error("Explicit import confirmation required");
    err.code = "import_failed";
    err.statusCode = 400;
    throw err;
  }

  const rawIds = Array.isArray(body.messageIds)
    ? body.messageIds
    : Array.isArray(body.graphMessageIds)
      ? body.graphMessageIds
      : null;
  if (!rawIds) {
    const err = new Error("messageIds required");
    err.code = "import_failed";
    err.statusCode = 400;
    throw err;
  }

  const credentials = readQuoteIntakeGraphCredentials(env);
  const limits = readQuoteIntakeGraphLimits(env);
  const mailbox = credentials.mailbox;

  if (rawIds.length === 0 || rawIds.length > limits.importLimit) {
    const err = new Error("Invalid messageIds count");
    err.code = "import_failed";
    err.statusCode = 400;
    throw err;
  }

  const messageIds = [
    ...new Set(
      rawIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => id.length > 0 && id.length <= 2048)
    )
  ];
  if (!messageIds.length || messageIds.length > limits.importLimit) {
    const err = new Error("Invalid messageIds");
    err.code = "import_failed";
    err.statusCode = 400;
    throw err;
  }

  const client =
    input.graphClient ??
    createQuoteIntakeGraphClient({
      mailbox,
      credentials,
      fetchImpl: input.fetchImpl,
      now: input.now,
      timeoutMs: limits.timeoutMs
    });

  if (String(client.mailbox ?? "").toLowerCase() !== mailbox) {
    const err = new Error("Graph mailbox mismatch");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }

  const results = [];

  for (const messageId of messageIds) {
    try {
      // Always refetch — never trust browser preview payloads.
      const raw = await client.getMessage(messageId);
      const core = normalizeGraphMessageCore(raw);
      if (!core.graphMessageId || core.graphMessageId !== messageId) {
        // Require exact id match from Graph response when possible.
        if (!core.graphMessageId) {
          results.push({
            graphMessageId: messageId,
            status: "failed",
            code: "message_not_found"
          });
          continue;
        }
      }

      const attMetas = await client.listAttachmentMetadata(core.graphMessageId);
      const classified = attMetas.map(classifyAttachmentMeta);
      const pdfCandidates = classified.filter((a) => a.support === "direct_pdf");
      const hasUnsupportedItem = classified.some((a) => a.support === "unsupported_item");
      const multiPdf = pdfCandidates.length > 1;

      /** @type {Array<{ sha256: string, mimeType?: string, sizeBytes?: number, safeFilename?: string, sourceAttachmentId?: string }>} */
      const attachmentsForCase = [];
      let totalBytes = 0;
      let manualReview = multiPdf || hasUnsupportedItem;
      const reasonCodes = [];

      if (multiPdf) reasonCodes.push("multi_pdf_ambiguous");
      if (hasUnsupportedItem) reasonCodes.push("attachment_invalid");

      // Import PDF bytes only when exactly one direct PDF candidate.
      if (pdfCandidates.length === 1 && !multiPdf) {
        const cand = pdfCandidates[0];
        const att = await client.getAttachment(core.graphMessageId, cand.sourceAttachmentId);
        const contentBytes = att?.contentBytes;
        try {
          const validated = decodeAndValidatePdfBytes(contentBytes, {
            maxBytes: limits.maxAttachmentBytes
          });
          totalBytes += validated.sizeBytes;
          if (totalBytes > limits.maxTotalBytes) {
            const err = new Error("Attachment total too large");
            err.code = "attachment_too_large";
            err.statusCode = 413;
            throw err;
          }
          attachmentsForCase.push({
            sha256: validated.sha256,
            mimeType: "application/pdf",
            sizeBytes: validated.sizeBytes,
            safeFilename: cand.name || "plan.pdf",
            sourceAttachmentId: cand.sourceAttachmentId || undefined
          });
          // Discard bytes — validated.bytes intentionally not retained.
          validated.bytes.fill?.(0);
        } catch (e) {
          manualReview = true;
          reasonCodes.push(e?.code || "attachment_hash_failed");
        }
      } else if (pdfCandidates.length === 0) {
        // Persist metadata-only rows (no sha from bytes) — repository requires sha256.
        // Store metadata without bytes via placeholder: skip attachment insert; mark review.
        if (classified.length) {
          manualReview = true;
          reasonCodes.push("no_supported_pdf");
        }
      }

      // Metadata-only for non-PDF / unsupported — include sha of empty marker? Skip insert.
      // Store unsupported attachment descriptors in audit metadata instead.

      const contentHash = core.internetMessageId
        ? undefined
        : computeFallbackContentHash({
            fromAddressHash: core.sender.fromAddressHash,
            receivedAt: core.receivedDateTime,
            subjectHash: core.subjectHash,
            attachmentSha256s: attachmentsForCase.map((a) => a.sha256)
          });

      try {
        const created = await input.repository.createCase({
          organizationId: input.organizationId,
          createdByUserId: input.actorUserId ?? null,
          status: manualReview
            ? QUOTE_INTAKE_CASE_STATUS.MANUAL_REVIEW
            : QUOTE_INTAKE_CASE_STATUS.RECEIVED,
          sourceType: "graph_mailbox",
          mailboxIdentity: mailbox,
          receivedAt: core.receivedDateTime,
          subjectHash: core.subjectHash,
          bodyCharCount: core.bodyCharCount,
          sourceMessage: {
            internetMessageId: core.internetMessageId || undefined,
            contentHash: contentHash || undefined,
            graphImmutableMessageId: core.graphMessageId,
            fromAddressHash: core.sender.fromAddressHash || undefined
          },
          attachments: attachmentsForCase
        });

        if (typeof input.repository.appendAuditEvent === "function") {
          await input.repository.appendAuditEvent({
            organizationId: input.organizationId,
            intakeCaseId: created.id,
            eventType: manualReview
              ? "mailbox_message_manual_review"
              : "mailbox_message_imported",
            actorType: "user",
            actorUserId: input.actorUserId ?? null,
            metadata: {
              sourceType: "graph_mailbox",
              attachmentCount: attachmentsForCase.length,
              reasonCodes,
              hasInternetMessageId: Boolean(core.internetMessageId)
            }
          });
        }

        results.push({
          graphMessageId: core.graphMessageId,
          status: manualReview ? "manual_review" : "created",
          caseId: created.id,
          code: manualReview ? "manual_review" : "created",
          reasonCodes
        });
      } catch (e) {
        if (e?.code === "duplicate_message") {
          if (typeof input.repository.appendAuditEvent === "function" && e.existingCaseId) {
            await input.repository.appendAuditEvent({
              organizationId: input.organizationId,
              intakeCaseId: e.existingCaseId,
              eventType: "mailbox_message_duplicate",
              actorType: "user",
              actorUserId: input.actorUserId ?? null,
              metadata: {
                sourceType: "graph_mailbox",
                hasInternetMessageId: Boolean(core.internetMessageId)
              }
            });
          }
          results.push({
            graphMessageId: core.graphMessageId,
            status: "duplicate",
            caseId: e.existingCaseId ?? null,
            code: "duplicate"
          });
        } else {
          results.push({
            graphMessageId: messageId,
            status: "failed",
            code: e?.code || "import_failed"
          });
        }
      }
    } catch (e) {
      results.push({
        graphMessageId: messageId,
        status: "failed",
        code: e?.code || "import_failed"
      });
    }
  }

  return {
    mailboxDisplay: mailbox,
    takeoffInvocation: { attempted: false, enabled: false },
    storageUpload: { attempted: false, enabled: false },
    results,
    audit: {
      eventType: "mailbox_import_requested",
      requestedCount: messageIds.length,
      createdCount: results.filter((r) => r.status === "created").length,
      duplicateCount: results.filter((r) => r.status === "duplicate").length,
      manualReviewCount: results.filter((r) => r.status === "manual_review").length,
      failedCount: results.filter((r) => r.status === "failed").length
    }
  };
}

/** Exported for tests — subject/body helpers never used for HTML render. */
export const _mailboxNormalizeHelpers = {
  boundedSubject,
  boundedBodyPreview
};
