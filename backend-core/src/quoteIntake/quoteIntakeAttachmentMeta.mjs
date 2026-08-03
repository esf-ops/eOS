/**
 * Shared Quote Intake attachment metadata normalization.
 *
 * Part 1 real-PDF fix: mailbox import persists a metadata-only row for EVERY
 * attachment (supported or not). sha256 is optional at import time and is filled
 * in only after Open Estimate retrieves and validates the real bytes server-side.
 */

import { randomUUID } from "node:crypto";

export const ATTACHMENT_SUPPORT = Object.freeze({
  DIRECT_PDF: "direct_pdf",
  INLINE_IGNORED: "inline_ignored",
  UNSUPPORTED_ITEM: "unsupported_item",
  METADATA_ONLY: "metadata_only"
});

export const ATTACHMENT_KIND = Object.freeze({
  FILE: "file",
  INLINE: "inline",
  ITEM: "item",
  PDF_CANDIDATE: "pdf_candidate"
});

export const ATTACHMENT_RETRIEVAL_STATE = Object.freeze({
  PENDING: "pending",
  NOT_APPLICABLE: "not_applicable",
  RETRIEVED: "retrieved",
  FAILED: "failed",
  UNAVAILABLE: "unavailable"
});

const SUPPORT_VALUES = new Set(Object.values(ATTACHMENT_SUPPORT));
const KIND_VALUES = new Set(Object.values(ATTACHMENT_KIND));
const RETRIEVAL_VALUES = new Set(Object.values(ATTACHMENT_RETRIEVAL_STATE));

/**
 * @param {unknown} sha
 * @returns {string|null}
 */
export function normalizeAttachmentSha(sha) {
  const s = String(sha ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (!/^[a-f0-9]{64}$/.test(s)) {
    const err = new Error("attachment.sha256 must be 64-char hex when provided");
    err.code = "invalid_attachment";
    err.statusCode = 400;
    throw err;
  }
  return s;
}

/**
 * Normalize a raw attachment input into the stored record shape.
 * sha256 may be null (metadata-only, not yet retrieved).
 * @param {any} a
 * @returns {object}
 */
export function normalizeAttachmentInput(a) {
  const support = SUPPORT_VALUES.has(String(a?.support))
    ? String(a.support)
    : undefined;
  const kind = KIND_VALUES.has(String(a?.kind)) ? String(a.kind) : undefined;
  const retrievalState = RETRIEVAL_VALUES.has(String(a?.retrievalState))
    ? String(a.retrievalState)
    : support === ATTACHMENT_SUPPORT.DIRECT_PDF
      ? ATTACHMENT_RETRIEVAL_STATE.PENDING
      : support
        ? ATTACHMENT_RETRIEVAL_STATE.NOT_APPLICABLE
        : undefined;
  return {
    id: a?.id ? String(a.id) : randomUUID(),
    sha256: normalizeAttachmentSha(a?.sha256),
    mimeType: a?.mimeType ? String(a.mimeType).slice(0, 128) : undefined,
    sizeBytes: Number.isFinite(Number(a?.sizeBytes)) ? Number(a.sizeBytes) : undefined,
    safeFilename: a?.safeFilename ? String(a.safeFilename).slice(0, 200) : undefined,
    sourceAttachmentId: a?.sourceAttachmentId
      ? String(a.sourceAttachmentId).slice(0, 512)
      : undefined,
    providerMessageId: a?.providerMessageId
      ? String(a.providerMessageId).slice(0, 2048)
      : undefined,
    isInline: Boolean(a?.isInline),
    kind,
    support,
    retrievalState
  };
}

/**
 * Normalize + dedupe a list of attachment inputs.
 * Dedupe key: sourceAttachmentId when present, else sha256, else a unique id.
 * @param {any[]|undefined} attachments
 * @returns {object[]}
 */
export function normalizeAttachmentInputs(attachments) {
  /** @type {Map<string, object>} */
  const byKey = new Map();
  for (const raw of attachments ?? []) {
    const rec = normalizeAttachmentInput(raw);
    const key = rec.sourceAttachmentId || rec.sha256 || rec.id;
    if (!byKey.has(key)) byKey.set(key, rec);
  }
  return [...byKey.values()];
}

/**
 * Is this stored attachment a supported, retrievable direct PDF?
 * Handles both classified rows (support field) and legacy sha256-only rows.
 * @param {any} a
 * @returns {boolean}
 */
export function isSupportedDirectPdf(a) {
  if (!a) return false;
  if (a.support === ATTACHMENT_SUPPORT.DIRECT_PDF) return true;
  // Explicitly classified as something unsupported.
  if (a.support && a.support !== ATTACHMENT_SUPPORT.DIRECT_PDF) return false;
  if (a.isInline) return false;
  if (String(a.kind) === ATTACHMENT_KIND.ITEM) return false;
  const mime = String(a.mimeType ?? "").toLowerCase();
  const name = String(a.safeFilename ?? "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

/**
 * Derive a precise, customer-safe reason code when no supported PDF exists.
 * @param {any[]} attachments
 * @returns {string}
 */
export function describeMissingPdfReason(attachments) {
  const atts = Array.isArray(attachments) ? attachments : [];
  if (atts.length === 0) return "no_attachments";
  const hasItem = atts.some(
    (a) => a?.support === ATTACHMENT_SUPPORT.UNSUPPORTED_ITEM || String(a?.kind) === ATTACHMENT_KIND.ITEM
  );
  const onlyInline = atts.every(
    (a) => a?.isInline || a?.support === ATTACHMENT_SUPPORT.INLINE_IGNORED
  );
  if (onlyInline) return "only_inline_images";
  if (hasItem) return "pdf_nested_in_forwarded_item";
  return "unsupported_attachment_type";
}
