/**
 * Normalize Graph messages / attachments for Quote Intake (Phase 6P.4).
 * Never returns raw HTML for rendering; strips tags for bounded text.
 */

import { createHash } from "node:crypto";

export const PDF_MAGIC = Buffer.from("%PDF");

/**
 * @param {string|null|undefined} raw
 * @param {number} [maxChars]
 */
export function stripToPlainText(raw, maxChars = 2000) {
  if (!raw) return "";
  const text = String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxChars);
}

/**
 * @param {string} value
 */
export function sha256Hex(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

/**
 * @param {Buffer|Uint8Array} bytes
 */
export function sha256BytesHex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * @param {unknown} from
 */
export function normalizeSender(from) {
  const email = String(from?.emailAddress?.address ?? "")
    .trim()
    .toLowerCase();
  const name = String(from?.emailAddress?.name ?? "").trim();
  return {
    email: email || null,
    name: name || null,
    /** Privacy-preserving fingerprint for persistence */
    fromAddressHash: email ? sha256Hex(`email:${email}`).slice(0, 64) : null
  };
}

/**
 * @param {unknown[]} recipients
 * @param {number} [max]
 */
export function summarizeRecipients(recipients, max = 5) {
  const list = Array.isArray(recipients) ? recipients : [];
  const emails = [];
  for (const r of list) {
    const e = String(r?.emailAddress?.address ?? "")
      .trim()
      .toLowerCase();
    if (e) emails.push(e);
    if (emails.length >= max) break;
  }
  return {
    count: list.length,
    sampleHashes: emails.map((e) => sha256Hex(`email:${e}`).slice(0, 16))
  };
}

/**
 * @param {unknown} att Graph attachment object
 */
export function classifyAttachmentMeta(att) {
  const odataType = String(att?.["@odata.type"] ?? att?.odataType ?? "").toLowerCase();
  const name = String(att?.name ?? "").slice(0, 200);
  const contentType = String(att?.contentType ?? "").toLowerCase();
  const size = Number(att?.size);
  const isInline = Boolean(att?.isInline);
  const id = String(att?.id ?? "").trim();

  const isItemAttachment =
    odataType.includes("itemattachment") || odataType.includes("referenceattachment");
  const isFileAttachment = odataType.includes("fileattachment") || (!isItemAttachment && Boolean(id));
  const looksPdfMime = contentType.includes("application/pdf") || contentType === "application/x-pdf";
  const looksPdfName = /\.pdf$/i.test(name);
  // Filename is not MIME authority — only a hint; import still requires magic bytes.
  const isDirectPdfCandidate = isFileAttachment && !isInline && !isItemAttachment && (looksPdfMime || looksPdfName);

  let kind = "file";
  if (isItemAttachment) kind = "item";
  else if (isInline) kind = "inline";
  else if (isDirectPdfCandidate) kind = "pdf_candidate";

  let support = "metadata_only";
  if (isItemAttachment) support = "unsupported_item";
  else if (isInline) support = "inline_ignored";
  else if (isDirectPdfCandidate) support = "direct_pdf";

  return {
    sourceAttachmentId: id || null,
    name: name || null,
    mimeType: contentType || null,
    sizeBytes: Number.isFinite(size) ? size : null,
    isInline,
    odataType: odataType || null,
    kind,
    support
  };
}

/**
 * @param {string|null|undefined} contentBytesBase64
 * @param {{ maxBytes: number }} limits
 */
export function decodeAndValidatePdfBytes(contentBytesBase64, limits) {
  if (!contentBytesBase64 || typeof contentBytesBase64 !== "string") {
    const err = new Error("Attachment content missing");
    err.code = "attachment_unsupported";
    err.statusCode = 400;
    throw err;
  }
  let buf;
  try {
    buf = Buffer.from(contentBytesBase64, "base64");
  } catch {
    const err = new Error("Attachment decode failed");
    err.code = "attachment_hash_failed";
    err.statusCode = 400;
    throw err;
  }
  if (!buf.length) {
    const err = new Error("Attachment empty");
    err.code = "attachment_unsupported";
    err.statusCode = 400;
    throw err;
  }
  if (buf.length > limits.maxBytes) {
    const err = new Error("Attachment too large");
    err.code = "attachment_too_large";
    err.statusCode = 413;
    throw err;
  }
  if (buf.length < 4 || !buf.subarray(0, 4).equals(PDF_MAGIC)) {
    const err = new Error("Attachment is not a valid PDF");
    err.code = "attachment_unsupported";
    err.statusCode = 400;
    throw err;
  }
  const sha256 = sha256BytesHex(buf);
  return { sizeBytes: buf.length, sha256, bytes: buf };
}

/**
 * Content-hash fallback when Message-ID absent.
 * @param {{ fromAddressHash?: string|null, receivedAt?: string|null, subjectHash?: string|null, attachmentSha256s?: string[] }} parts
 */
export function computeFallbackContentHash(parts) {
  const att = [...(parts.attachmentSha256s ?? [])].filter(Boolean).sort().join(",");
  const material = [
    "qil_content_v1",
    parts.fromAddressHash ?? "",
    parts.receivedAt ?? "",
    parts.subjectHash ?? "",
    att
  ].join("|");
  return sha256Hex(material);
}

/**
 * Bound preview of subject for UI — still treated as sensitive; never logged server-side.
 * @param {unknown} message
 * @param {number} [max]
 */
export function boundedSubject(message, max = 180) {
  return stripToPlainText(message?.subject, max);
}

/**
 * @param {unknown} message
 * @param {number} [max]
 */
export function boundedBodyPreview(message, max = 500) {
  const bodyContent = message?.body?.content;
  const contentType = String(message?.body?.contentType ?? "").toLowerCase();
  const raw =
    contentType === "text"
      ? String(bodyContent ?? message?.bodyPreview ?? "")
      : String(message?.bodyPreview ?? bodyContent ?? "");
  return stripToPlainText(raw, max);
}

/**
 * @param {unknown} message
 */
export function normalizeGraphMessageCore(message) {
  const graphMessageId = String(message?.id ?? "").trim();
  const internetMessageId = String(message?.internetMessageId ?? "").trim() || null;
  const conversationId = String(message?.conversationId ?? "").trim() || null;
  const receivedDateTime = String(message?.receivedDateTime ?? "").trim() || null;
  const lastModifiedDateTime = String(message?.lastModifiedDateTime ?? "").trim() || null;
  const sender = normalizeSender(message?.from);
  const subjectText = boundedSubject(message, 500);
  const subjectHash = subjectText ? sha256Hex(`subject:${subjectText}`) : null;
  const bodyText = boundedBodyPreview(message, 2000);
  return {
    graphMessageId,
    internetMessageId,
    conversationId,
    receivedDateTime,
    lastModifiedDateTime,
    sender,
    subject: subjectText || null,
    subjectHash,
    bodyPreview: bodyText || null,
    bodyCharCount: bodyText ? bodyText.length : 0,
    hasAttachments: Boolean(message?.hasAttachments),
    recipientSummary: {
      to: summarizeRecipients(message?.toRecipients),
      cc: summarizeRecipients(message?.ccRecipients)
    }
  };
}
