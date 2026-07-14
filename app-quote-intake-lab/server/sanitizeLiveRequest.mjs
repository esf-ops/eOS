/**
 * Build the only payload allowed to leave the browser / enter Gemini.
 * Strips attachment bytes, HTML, IndexedDB, credentials, etc.
 */

const MAX_BODY_CHARS = 100_000;
const MAX_SUBJECT_CHARS = 2_000;

/**
 * @param {any} input
 */
export function sanitizeLiveClassificationRequest(input) {
  if (!input || typeof input !== "object") {
    const err = new Error("Request body must be a JSON object.");
    err.statusCode = 400;
    err.code = "BAD_REQUEST";
    throw err;
  }

  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  if (attachments.length > 30) {
    const err = new Error("Too many attachments in metadata list.");
    err.statusCode = 413;
    err.code = "TOO_MANY_ATTACHMENTS";
    throw err;
  }

  for (const a of attachments) {
    if (a && (a.bytes != null || a.content != null || a.data != null || a.base64 != null)) {
      const err = new Error("Attachment bytes are not permitted in live classification requests.");
      err.statusCode = 400;
      err.code = "ATTACHMENT_BYTES_FORBIDDEN";
      throw err;
    }
  }

  if (input.htmlBody != null || input.rawHtml != null || input.html != null) {
    const err = new Error("Raw HTML is not permitted in live classification requests.");
    err.statusCode = 400;
    err.code = "HTML_FORBIDDEN";
    throw err;
  }

  const textBody = String(input.textBody ?? "").slice(0, MAX_BODY_CHARS);
  const subject = String(input.subject ?? "").slice(0, MAX_SUBJECT_CHARS);

  return {
    caseId: String(input.caseId ?? "").slice(0, 120),
    subject,
    textBody,
    from: {
      name: input.from?.name != null ? String(input.from.name).slice(0, 200) : null,
      email: String(input.from?.email ?? "").slice(0, 320)
    },
    to: mapAddrs(input.to),
    cc: mapAddrs(input.cc),
    replyTo: input.replyTo
      ? {
          name: input.replyTo.name != null ? String(input.replyTo.name).slice(0, 200) : null,
          email: String(input.replyTo.email ?? "").slice(0, 320)
        }
      : null,
    messageId: input.messageId != null ? String(input.messageId).slice(0, 300) : null,
    thread: {
      conversationId: input.thread?.conversationId ?? null,
      inReplyTo: input.thread?.inReplyTo ?? null,
      references: Array.isArray(input.thread?.references)
        ? input.thread.references.map((r) => String(r).slice(0, 300)).slice(0, 40)
        : [],
      threadKey: input.thread?.threadKey != null ? String(input.thread.threadKey).slice(0, 200) : null
    },
    attachments: attachments.map((a) => ({
      id: a?.id != null ? String(a.id).slice(0, 80) : null,
      filename: String(a?.filename ?? "attachment").slice(0, 240),
      contentType: String(a?.contentType ?? "application/octet-stream").slice(0, 120),
      sizeBytes: Number.isFinite(a?.sizeBytes) ? Number(a.sizeBytes) : null
    })),
    mailbox: input.mailbox != null ? String(input.mailbox).slice(0, 320) : null
  };
}

function mapAddrs(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 40).map((a) => ({
    name: a?.name != null ? String(a.name).slice(0, 200) : null,
    email: String(a?.email ?? "").slice(0, 320)
  }));
}
