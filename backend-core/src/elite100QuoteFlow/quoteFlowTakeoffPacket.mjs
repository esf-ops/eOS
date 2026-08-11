/**
 * Build a single AI Takeoff packet PDF from one or more plan attachments.
 * PDFs are appended; JPEG/PNG become full-page images. WebP multi is not embeddable.
 */

import { PDFDocument } from "pdf-lib";
import { validatePlanBytes } from "../elite100EstimateStudio/studioSecurePlanViewer.mjs";

/**
 * @param {string|null|undefined} name
 * @param {number} [max]
 */
export function sanitizeTakeoffPacketFilename(name, max = 160) {
  let s = String(name || "quote-takeoff-packet")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\/]+/g, "-")
    .replace(/["<>:|?*]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  if (!s) s = "quote-takeoff-packet";
  if (!/\.pdf$/i.test(s)) s = `${s}.pdf`;
  if (s.length > max) {
    s = `${s.slice(0, Math.max(8, max - 4))}.pdf`;
  }
  return s;
}

/**
 * @param {{
 *   parts: Array<{ bytes: Buffer, filename?: string|null, declaredMime?: string|null }>,
 *   packetFilename?: string|null
 * }} input
 * @returns {Promise<{ bytes: Buffer, filename: string, mimeType: string, pageCount: number, partCount: number }>}
 */
export async function buildTakeoffPacketPdf(input = {}) {
  const parts = Array.isArray(input.parts) ? input.parts : [];
  if (!parts.length) {
    const err = new Error("Select at least one plan file for the takeoff packet.");
    err.statusCode = 400;
    err.code = "attachment_required";
    throw err;
  }

  const validated = parts.map((part, idx) => {
    if (!part || !Buffer.isBuffer(part.bytes)) {
      const err = new Error("AI Takeoff could not start for the selected plan packet.");
      err.statusCode = 400;
      err.code = "packet_build_failed";
      err.safeReason = "preview_or_fetch_failed";
      throw err;
    }
    let meta;
    try {
      meta = validatePlanBytes(part.bytes, {
        declaredMime: part.declaredMime,
        filename: part.filename
      });
    } catch (e) {
      const err = new Error("AI Takeoff could not start for the selected plan packet.");
      err.statusCode = Number(e?.statusCode) || 400;
      err.code = "packet_build_failed";
      err.safeReason = "unsupported_file";
      throw err;
    }
    if (meta.kind === "webp" && parts.length > 1) {
      const err = new Error(
        "Multi-file takeoff packets cannot include WebP images yet. Select one file or convert to PDF/PNG/JPG."
      );
      err.statusCode = 400;
      err.code = "packet_unsupported";
      err.safeReason = "unsupported_file";
      throw err;
    }
    return { ...meta, bytes: part.bytes, filename: part.filename || `part-${idx + 1}` };
  });

  // Single validated plan (PDF or image) — no merge needed.
  if (validated.length === 1) {
    const one = validated[0];
    const filename =
      one.kind === "pdf"
        ? sanitizeTakeoffPacketFilename(one.filename || input.packetFilename || "plan.pdf")
        : sanitizeTakeoffPacketFilename(input.packetFilename || one.filename || "plan");
    // Images stay as-is for the single-file worker path (Gemini accepts images).
    if (one.kind !== "pdf") {
      return {
        bytes: one.bytes,
        filename: one.filename || filename,
        mimeType: one.contentType,
        pageCount: 1,
        partCount: 1,
        merged: false
      };
    }
    return {
      bytes: one.bytes,
      filename,
      mimeType: "application/pdf",
      pageCount: null,
      partCount: 1,
      merged: false
    };
  }

  try {
    const out = await PDFDocument.create();
    for (const part of validated) {
      if (part.kind === "pdf") {
        const src = await PDFDocument.load(part.bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const page of pages) out.addPage(page);
        continue;
      }
      if (part.kind === "jpeg" || part.kind === "png") {
        const img =
          part.kind === "png" ? await out.embedPng(part.bytes) : await out.embedJpg(part.bytes);
        const page = out.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        continue;
      }
      const err = new Error(
        "Multi-file takeoff packets are not supported for this file type. Select one file or merge plans before upload."
      );
      err.statusCode = 400;
      err.code = "packet_unsupported";
      err.safeReason = "unsupported_file";
      throw err;
    }
    const bytes = Buffer.from(await out.save());
    return {
      bytes,
      filename: sanitizeTakeoffPacketFilename(input.packetFilename || "takeoff-packet.pdf"),
      mimeType: "application/pdf",
      pageCount: out.getPageCount(),
      partCount: validated.length,
      merged: true
    };
  } catch (e) {
    if (e?.code === "packet_unsupported" || e?.code === "packet_build_failed") throw e;
    const err = new Error("AI Takeoff could not start for the selected plan packet.");
    err.statusCode = 400;
    err.code = "packet_build_failed";
    err.safeReason = "packet_build_failed";
    throw err;
  }
}

/**
 * Normalize start-takeoff attachment key args (singular + plural).
 * @param {{ attachmentKey?: unknown, attachmentKeys?: unknown }} body
 * @returns {string[]}
 */
export function normalizeStartTakeoffAttachmentKeys(body = {}) {
  const fromArray = Array.isArray(body.attachmentKeys)
    ? body.attachmentKeys.map((k) => String(k || "").trim()).filter(Boolean)
    : [];
  if (fromArray.length) {
    // Preserve order; de-dupe.
    const seen = new Set();
    const out = [];
    for (const k of fromArray) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }
  const one = String(body.attachmentKey || "").trim();
  return one ? [one] : [];
}
