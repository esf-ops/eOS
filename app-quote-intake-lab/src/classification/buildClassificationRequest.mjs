import { sha256Hex } from "../inbound/hash.mjs";

/**
 * Build an IntakeClassificationRequest from a case (normalized Phase 2 fields only).
 * Never includes attachment bytes.
 *
 * @param {import("../domain/types.ts").QuoteIntakeCase} caseRow
 */
export function buildClassificationRequest(caseRow) {
  const meta = caseRow.importMeta;
  const textBody = meta?.textBody != null ? String(meta.textBody) : String(caseRow.emailExcerpt ?? "");
  const to = meta?.to?.length
    ? meta.to.map((a) => ({ name: a.name ?? null, email: a.email }))
    : [{ name: null, email: caseRow.recipientMailbox }];
  const cc = meta?.cc ?? [];

  return {
    caseId: caseRow.id,
    subject: String(caseRow.emailSubject ?? ""),
    textBody,
    from: {
      name: caseRow.senderName ?? null,
      email: caseRow.senderEmail ?? ""
    },
    to,
    cc,
    replyTo: meta?.replyTo ?? null,
    messageId: meta?.messageId ?? null,
    thread: meta?.thread ?? {
      conversationId: null,
      inReplyTo: null,
      references: [],
      threadKey: caseRow.id
    },
    attachments: (caseRow.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes ?? null
    })),
    mailbox: caseRow.recipientMailbox ?? caseRow.assignedSalesperson ?? null
  };
}

/**
 * Deterministic fingerprint of classification inputs (no attachment bytes).
 * @param {ReturnType<typeof buildClassificationRequest>} request
 */
export async function fingerprintClassificationRequest(request) {
  const att = (request.attachments ?? [])
    .map((a) => `${a.filename}|${a.contentType}|${a.sizeBytes ?? ""}`)
    .sort()
    .join(";");
  const material = [
    request.caseId,
    request.subject,
    request.textBody,
    request.from?.email ?? "",
    request.from?.name ?? "",
    (request.to ?? []).map((a) => a.email).join(","),
    (request.cc ?? []).map((a) => a.email).join(","),
    request.messageId ?? "",
    att
  ].join("\n");
  return sha256Hex(material);
}
