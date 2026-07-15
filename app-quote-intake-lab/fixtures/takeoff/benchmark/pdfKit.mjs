/**
 * Reusable PDF generation helpers for the Phase 4B.5A offline benchmark corpus.
 *
 * Pure Node — no Gemini, no network. Copied/adapted from
 * fixtures/takeoff/generateSyntheticPlanPdf.mjs.
 *
 * Exports:
 *   escapePdfText(s) → string
 *   buildContentStream(lines) → string
 *   assemblePdf(streamText) → Buffer
 *   sha256Hex(buf) → string
 *   buildTextPlanPdf(lines) → Buffer   (convenience: stream → PDF 1.4)
 */

import { createHash } from "node:crypto";

/**
 * Escape special PDF string characters.
 * @param {string} s
 * @returns {string}
 */
export function escapePdfText(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a PDF content stream (BT … ET) from an array of text lines.
 * @param {string[]} lines
 * @returns {string}
 */
export function buildContentStream(lines) {
  const ops = [];
  ops.push("BT");
  ops.push("/F1 11 Tf");
  ops.push("50 750 Td");
  ops.push("14 TL");
  for (let i = 0; i < lines.length; i++) {
    const t = escapePdfText(lines[i] || " ");
    if (i === 0) {
      ops.push(`(${t}) Tj`);
    } else {
      ops.push(`T* (${t}) Tj`);
    }
  }
  ops.push("ET");
  ops.push("1.5 w");
  ops.push("50 120 400 40 re S");
  ops.push("50 60 240 50 re S");
  return ops.join("\n") + "\n";
}

/**
 * Assemble a minimal valid PDF 1.4 from a pre-built content stream string.
 * Fixed object layout produces stable bytes for a given stream text.
 * No JS, forms, links, or active content.
 * @param {string} streamText
 * @returns {Buffer}
 */
export function assemblePdf(streamText) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const contentId = add(
    `<< /Length ${Buffer.byteLength(streamText, "utf8")} >>\nstream\n${streamText}endstream`
  );
  const resourcesId = add(`<< /Font << /F1 ${fontId} 0 R >> >>`);
  const pageId = add(
    `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources ${resourcesId} 0 R >>`
  );
  const pagesId = add(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  objects[pageId - 1] =
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources ${resourcesId} 0 R >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/**
 * SHA-256 hex digest of a buffer.
 * @param {Buffer} buf
 * @returns {string}
 */
export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Build a text-only PDF 1.4 from an array of lines.
 * @param {string[]} lines
 * @returns {Buffer}
 */
export function buildTextPlanPdf(lines) {
  const stream = buildContentStream(lines);
  return assemblePdf(stream);
}
