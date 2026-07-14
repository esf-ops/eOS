import { bodyExcerpt } from "./buildInboundMessage.mjs";
import { sha256Hex } from "./hash.mjs";

/**
 * Map a confirmed InboundMessage to a QuoteIntakeCase shell.
 * Business fields stay unknown — no inference in Phase 2.
 *
 * @param {import("./inboundTypes.mjs").InboundMessage} message
 * @param {{ caseId?: string }} [opts]
 */
export async function caseFromInboundMessage(message, opts = {}) {
  const receivedAt = message.sentOrReceivedAt || message.importTimestamp;
  const id =
    opts.caseId ||
    `qil-imp-${compactStamp(message.importTimestamp)}-${(await sha256Hex(message.dedupeKey)).slice(0, 8)}`;

  const attachments = (message.attachments ?? []).map((a) => ({
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    contentHash: a.contentHash,
    simulated: false,
    localOnly: true
  }));

  /** @type {import("../domain/types.ts").QuoteIntakeCase} */
  const caseRow = {
    id,
    status: "qil_received",
    priority: "normal",
    receivedAt,
    updatedAt: message.importTimestamp,
    senderName: message.from?.name || message.from?.email || "Unknown",
    senderEmail: message.from?.email || "unknown@example.com",
    recipientMailbox: message.mailbox || message.to?.[0]?.email || "unknown@example.com",
    assignedSalesperson: message.mailbox || message.to?.[0]?.email || "Unassigned mailbox",
    assignedEstimator: null,
    customerAccount: "—",
    projectName: "—",
    projectAddress: "—",
    emailSubject: message.subject || "(no subject)",
    emailExcerpt: bodyExcerpt(message.textBody),
    attachments,
    requestedColor: null,
    resolvedPriceGroup: null,
    proposedSquareFootage: null,
    sinkCutoutCount: null,
    edgeProfile: null,
    backsplashScope: null,
    missingInformation: [],
    aiConfidence: null,
    takeoffState: "not_started",
    quotePreviewState: "none",
    unreadActivityCount: 1,
    internalNotes: `Imported via ${message.sourceType}. Business fields not extracted in Phase 2.`,
    dataSource: "imported",
    simulatedLabels: Object.freeze(["imported locally", "no AI / takeoff / pricing"]),
    importMeta: {
      sourceType: message.sourceType,
      dedupeKey: message.dedupeKey,
      dedupeStrategy: message.dedupeStrategy,
      messageId: message.messageId,
      messageContentHash: message.messageContentHash,
      parserWarnings: [...(message.parserWarnings ?? [])],
      rawSourcePreserved: message.rawSourcePreserved,
      originalFilename: message.originalFilename,
      textBody: message.textBody,
      to: message.to,
      cc: message.cc,
      replyTo: message.replyTo,
      thread: message.thread,
      importTimestamp: message.importTimestamp,
      importActor: message.importActor,
      htmlPresent: message.htmlPresent
    },
    events: [
      {
        id: `${id}-evt-import`,
        at: message.importTimestamp,
        actorType: "user",
        actorLabel: message.importActor,
        eventType: "email_imported",
        summary: `Imported ${message.sourceType} email into lab (local only).`
      }
    ],
    nextAction: "Run simulated classification"
  };

  return caseRow;
}

function compactStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00000000";
  return d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}
