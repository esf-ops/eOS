import { finalizeInboundMessage, deriveThreadKey } from "./buildInboundMessage.mjs";
import { sha256Hex } from "./hash.mjs";
import {
  LAB_MAX_ATTACHMENT_BYTES,
  LAB_MAX_ATTACHMENTS,
  LAB_MAX_BODY_CHARS,
  LAB_MAX_TOTAL_ATTACHMENT_BYTES,
  formatByteLimit
} from "./limits.mjs";
import { normalizeEmail, parseAddressList, parseOneAddress } from "./parseAddresses.mjs";
import { sanitizeFilename } from "./sanitizeFilename.mjs";

/**
 * Normalize a manual paste form into InboundMessage.
 * @param {import("./inboundTypes.mjs").ManualEmailInput} input
 * @param {{ importActor?: string }} [opts]
 */
export async function parseManualPaste(input, opts = {}) {
  const warnings = [];
  const importActor = opts.importActor ?? "Lab Estimator (fixture)";
  const importTimestamp = new Date().toISOString();

  const senderEmail = normalizeEmail(input.senderEmail);
  if (!senderEmail) throw validationError("Sender email is required and must be valid.");
  const senderName = String(input.senderName ?? "").trim() || null;
  const to = parseAddressList(input.to);
  if (!to.length) throw validationError("At least one To recipient is required.");
  const cc = parseAddressList(input.cc);
  const subject = String(input.subject ?? "").trim();
  if (!subject) throw validationError("Subject is required.");
  let bodyText = String(input.bodyText ?? "").replace(/\r\n/g, "\n");
  if (!bodyText.trim()) throw validationError("Email body is required.");
  if (bodyText.length > LAB_MAX_BODY_CHARS) {
    throw validationError(`Body exceeds lab-only limit of ${LAB_MAX_BODY_CHARS} characters.`);
  }

  const mailboxRaw = String(input.mailbox ?? "").trim();
  const mailbox = normalizeEmail(mailboxRaw) || mailboxRaw || to[0]?.email || null;
  if (!mailbox) throw validationError("Receiving mailbox / salesperson email is required.");

  let sentOrReceivedAt = null;
  if (input.dateReceived) {
    const d = new Date(input.dateReceived);
    if (Number.isNaN(d.getTime())) warnings.push("Date received was invalid and was cleared.");
    else sentOrReceivedAt = d.toISOString();
  } else {
    warnings.push("No date supplied — using import timestamp as received time.");
    sentOrReceivedAt = importTimestamp;
  }

  // Refuse HTML paste being treated as markup later — keep as text only.
  if (/<[a-z][\s\S]*>/i.test(bodyText)) {
    warnings.push("Body looks like it may contain markup; it will be stored and shown as plain text only.");
  }

  const attachments = [];
  let total = 0;
  const rawAtts = Array.isArray(input.attachments) ? input.attachments : [];
  if (rawAtts.length > LAB_MAX_ATTACHMENTS) {
    throw validationError(`Too many attachments (lab limit ${LAB_MAX_ATTACHMENTS}).`);
  }
  for (const att of rawAtts) {
    const bytes = att.bytes instanceof Uint8Array ? att.bytes : new Uint8Array(att.bytes ?? []);
    if (bytes.byteLength > LAB_MAX_ATTACHMENT_BYTES) {
      throw validationError(
        `Attachment "${sanitizeFilename(att.filename)}" exceeds ${formatByteLimit(LAB_MAX_ATTACHMENT_BYTES)} lab limit.`
      );
    }
    total += bytes.byteLength;
    if (total > LAB_MAX_TOTAL_ATTACHMENT_BYTES) {
      throw validationError(
        `Total attachment size exceeds ${formatByteLimit(LAB_MAX_TOTAL_ATTACHMENT_BYTES)} lab limit.`
      );
    }
    const contentHash = await sha256Hex(bytes);
    attachments.push({
      id: `att-${contentHash.slice(0, 12)}`,
      filename: sanitizeFilename(att.filename),
      contentType: String(att.contentType || "application/octet-stream"),
      sizeBytes: bytes.byteLength,
      contentHash,
      bytes,
      localOnly: true
    });
  }

  warnings.push("Manual paste has no Message-ID — fallback content-hash dedupe will be used.");

  const from = { name: senderName, email: senderEmail };
  return finalizeInboundMessage({
    sourceType: "manual_paste",
    messageId: null,
    thread: {
      conversationId: null,
      inReplyTo: null,
      references: [],
      threadKey: deriveThreadKey({
        conversationId: null,
        inReplyTo: null,
        references: [],
        subject,
        fromEmail: senderEmail
      })
    },
    from,
    to,
    cc,
    replyTo: parseOneAddress(input.replyTo) ?? null,
    subject,
    sentOrReceivedAt,
    textBody: bodyText,
    htmlPresent: false,
    originalFilename: null,
    attachments,
    importTimestamp,
    importActor,
    parserWarnings: warnings,
    rawSourcePreserved: false,
    mailbox: typeof mailbox === "string" ? mailbox : null,
    headers: {}
  });
}

function validationError(message) {
  const e = new Error(message);
  e.code = "QIL_VALIDATION";
  return e;
}
