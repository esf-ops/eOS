import PostalMime from "postal-mime";
import { finalizeInboundMessage, deriveThreadKey } from "./buildInboundMessage.mjs";
import { sha256Hex, normalizeMessageId } from "./hash.mjs";
import { htmlToSafeText } from "./htmlToSafeText.mjs";
import {
  LAB_MAX_ATTACHMENT_BYTES,
  LAB_MAX_ATTACHMENTS,
  LAB_MAX_EML_BYTES,
  LAB_MAX_TOTAL_ATTACHMENT_BYTES,
  formatByteLimit
} from "./limits.mjs";
import { normalizeEmail, parseOneAddress } from "./parseAddresses.mjs";
import { sanitizeFilename } from "./sanitizeFilename.mjs";

/**
 * Parse a .eml file into a normalized InboundMessage (preview; not yet persisted).
 * @param {{ bytes: Uint8Array, filename: string, importActor?: string }} input
 */
export async function parseEmlUpload(input) {
  const warnings = [];
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes ?? []);
  const filename = sanitizeFilename(input.filename, "message.eml");
  const importActor = input.importActor ?? "Lab Estimator (fixture)";
  const importTimestamp = new Date().toISOString();

  if (!bytes.byteLength) {
    throw validationError("The .eml file is empty.");
  }
  if (bytes.byteLength > LAB_MAX_EML_BYTES) {
    throw validationError(
      `This .eml exceeds the lab-only size limit (${formatByteLimit(LAB_MAX_EML_BYTES)}).`
    );
  }
  if (!filename.toLowerCase().endsWith(".eml")) {
    throw validationError("Only .eml files are accepted in Phase 2.");
  }

  let parsed;
  try {
    parsed = await PostalMime.parse(bytes);
  } catch (err) {
    warnings.push(`PostalMime parse recovered with error: ${String(err?.message ?? err)}`);
    try {
      parsed = await PostalMime.parse(bytes, { rfc822Attachments: true });
    } catch (err2) {
      throw validationError(`Could not parse .eml: ${String(err2?.message ?? err2)}`);
    }
  }

  if (!parsed) {
    throw validationError("Could not parse .eml — no message structure returned.");
  }

  const headers = headerMap(parsed.headers);
  const from = mapPostalAddress(parsed.from) ?? parseOneAddress(headers.from);
  if (!from?.email) {
    warnings.push("Missing or invalid From address — using placeholder.");
  }
  const to = mapPostalAddressList(parsed.to);
  const cc = mapPostalAddressList(parsed.cc);
  const replyTo = mapPostalAddress(parsed.replyTo) ?? parseOneAddress(headers["reply-to"]);

  let textBody = String(parsed.text ?? "").trim();
  const html = String(parsed.html ?? "").trim();
  const htmlPresent = Boolean(html);
  if (!textBody && html) {
    textBody = htmlToSafeText(html);
    warnings.push("HTML-only message converted to plain display text (HTML not rendered).");
  }
  if (!textBody) {
    warnings.push("Message has no readable text body.");
    textBody = "";
  }

  const messageId = normalizeMessageId(parsed.messageId ?? headers["message-id"]);
  if (!messageId) warnings.push("No Message-ID header — fallback content-hash dedupe will be used.");

  const inReplyTo = normalizeMessageId(parsed.inReplyTo ?? headers["in-reply-to"]);
  const references = parseReferences(parsed.references ?? headers.references);
  const conversationId = headers["thread-index"] || headers["x-conversation-id"] || null;

  const sentOrReceivedAt = toIsoDate(parsed.date ?? headers.date) ?? null;
  if (!sentOrReceivedAt) warnings.push("Missing Date header.");

  const attachments = [];
  let totalAttBytes = 0;
  const rawAtts = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  if (rawAtts.length > LAB_MAX_ATTACHMENTS) {
    warnings.push(
      `Attachment count exceeds lab limit (${LAB_MAX_ATTACHMENTS}); extras were skipped.`
    );
  }

  for (const att of rawAtts.slice(0, LAB_MAX_ATTACHMENTS)) {
    const attBytes = toUint8Array(att.content);
    const sizeBytes = attBytes.byteLength;
    if (sizeBytes > LAB_MAX_ATTACHMENT_BYTES) {
      warnings.push(
        `Skipped attachment "${sanitizeFilename(att.filename)}" — exceeds ${formatByteLimit(LAB_MAX_ATTACHMENT_BYTES)} lab limit.`
      );
      continue;
    }
    if (totalAttBytes + sizeBytes > LAB_MAX_TOTAL_ATTACHMENT_BYTES) {
      warnings.push(
        `Skipped further attachments — total exceeds ${formatByteLimit(LAB_MAX_TOTAL_ATTACHMENT_BYTES)} lab limit.`
      );
      break;
    }
    totalAttBytes += sizeBytes;
    const contentHash = await sha256Hex(attBytes);
    attachments.push({
      id: `att-${contentHash.slice(0, 12)}`,
      filename: sanitizeFilename(att.filename || att.contentId || "attachment.bin"),
      contentType: String(att.mimeType || att.contentType || "application/octet-stream"),
      sizeBytes,
      contentHash,
      bytes: attBytes,
      localOnly: true
    });
  }

  const fromAddr = from ?? { name: null, email: "unknown@example.com" };
  const subject = String(parsed.subject ?? headers.subject ?? "(no subject)").trim() || "(no subject)";

  const mailbox =
    to[0]?.email ??
    normalizeEmail(headers["delivered-to"]) ??
    normalizeEmail(headers["x-original-to"]) ??
    null;

  const thread = {
    conversationId,
    inReplyTo,
    references,
    threadKey: deriveThreadKey({
      conversationId,
      inReplyTo,
      references,
      subject,
      fromEmail: fromAddr.email
    })
  };

  if (!to.length) warnings.push("No To recipients parsed.");

  return finalizeInboundMessage({
    sourceType: "manual_eml",
    messageId,
    thread,
    from: fromAddr,
    to,
    cc,
    replyTo,
    subject,
    sentOrReceivedAt,
    textBody,
    htmlPresent,
    originalFilename: filename,
    attachments,
    importTimestamp,
    importActor,
    parserWarnings: warnings,
    rawSourcePreserved: true,
    mailbox,
    headers
  });
}

function validationError(message) {
  const e = new Error(message);
  e.code = "QIL_VALIDATION";
  return e;
}

function headerMap(headers) {
  const out = {};
  if (!Array.isArray(headers)) return out;
  for (const h of headers) {
    const key = String(h?.key ?? h?.name ?? "")
      .trim()
      .toLowerCase();
    const value = String(h?.value ?? "").trim();
    if (!key) continue;
    if (out[key]) out[key] = `${out[key]}, ${value}`;
    else out[key] = value;
  }
  return out;
}

function mapPostalAddress(addr) {
  if (!addr) return null;
  if (Array.isArray(addr)) return mapPostalAddress(addr[0]);
  const email = normalizeEmail(addr.address || addr.email);
  if (!email) return null;
  const name = String(addr.name ?? "").trim() || null;
  return { name, email };
}

function mapPostalAddressList(list) {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  const out = [];
  for (const a of arr) {
    const mapped = mapPostalAddress(a);
    if (mapped) out.push(mapped);
  }
  return out;
}

function parseReferences(raw) {
  if (Array.isArray(raw)) {
    return raw.map((r) => normalizeMessageId(r)).filter(Boolean);
  }
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/\s+/)
    .map((r) => normalizeMessageId(r))
    .filter(Boolean);
}

function toIsoDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toUint8Array(content) {
  if (!content) return new Uint8Array();
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof content === "string") return new TextEncoder().encode(content);
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  return new Uint8Array();
}
