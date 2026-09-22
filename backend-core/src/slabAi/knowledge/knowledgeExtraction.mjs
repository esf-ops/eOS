/**
 * Text extraction for knowledge ingestion — text only, no macros/OCR.
 */
import mammoth from "mammoth";
import { sniffFileKind } from "./knowledgeConstants.mjs";

/**
 * @typedef {{ text: string, page?: number|null, sectionTitle?: string|null }} ExtractedBlock
 */

/**
 * @param {Buffer} bytes
 * @param {"pdf"|"docx"|"txt"|"markdown"} kind
 * @returns {Promise<{ ok: boolean, blocks?: ExtractedBlock[], plainText?: string, error?: string, empty?: boolean }>}
 */
export async function extractKnowledgeText(bytes, kind) {
  try {
    if (!bytes?.length) return { ok: false, empty: true, error: "File is empty." };

    const sniff = sniffFileKind(bytes);
    if (kind === "pdf" && sniff.kind !== "pdf") {
      return { ok: false, error: "File content is not a valid PDF." };
    }
    if (kind === "docx" && sniff.kind !== "docx_or_zip") {
      return { ok: false, error: "File content is not a valid DOCX." };
    }

    if (kind === "txt" || kind === "markdown") {
      const text = bytes.toString("utf8").replace(/\u0000/g, "");
      if (!text.trim()) return { ok: false, empty: true, error: "No extractable text found." };
      return { ok: true, plainText: text, blocks: [{ text, page: null, sectionTitle: null }] };
    }

    if (kind === "docx") {
      const result = await mammoth.extractRawText({ buffer: bytes });
      const text = String(result.value || "").replace(/\u0000/g, "");
      if (!text.trim()) return { ok: false, empty: true, error: "DOCX contained no extractable text." };
      const blocks = splitByHeadings(text);
      return { ok: true, plainText: text, blocks };
    }

    if (kind === "pdf") {
      return await extractPdf(bytes);
    }

    return { ok: false, error: "Unsupported extraction kind." };
  } catch (e) {
    const msg = String(e?.message || e);
    if (/password|encrypt/i.test(msg)) {
      return { ok: false, error: "Password-protected PDFs are not supported." };
    }
    return { ok: false, error: "Extraction failed. The file may be corrupt or unsupported." };
  }
}

function splitByHeadings(text) {
  const lines = text.split(/\r?\n/);
  /** @type {ExtractedBlock[]} */
  const blocks = [];
  let currentTitle = null;
  let buf = [];
  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) blocks.push({ text: t, page: null, sectionTitle: currentTitle });
    buf = [];
  };
  for (const line of lines) {
    if (/^#{1,3}\s+\S/.test(line) || (/^[A-Z][A-Z0-9 \-/]{8,}$/.test(line.trim()) && line.trim().length < 80)) {
      flush();
      currentTitle = line.replace(/^#+\s*/, "").trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks.length ? blocks : [{ text, page: null, sectionTitle: null }];
}

async function extractPdf(bytes) {
  // Dynamic import — pdf-parse is CJS
  const pdfParseMod = await import("pdf-parse");
  const pdfParse = pdfParseMod.default || pdfParseMod;
  const data = await pdfParse(bytes);
  const raw = String(data.text || "").replace(/\u0000/g, "").trim();
  if (!raw) {
    return {
      ok: false,
      empty: true,
      error: "No extractable text found. Scanned/image-only PDFs require OCR (not available in this phase).",
    };
  }

  const numPages = Number(data.numpages) || 0;
  // pdf-parse does not reliably split by page; approximate with form-feed if present
  const pageParts = raw.includes("\f") ? raw.split("\f") : [raw];
  /** @type {ExtractedBlock[]} */
  const blocks = [];
  if (pageParts.length > 1) {
    pageParts.forEach((part, i) => {
      const t = part.trim();
      if (t) blocks.push({ text: t, page: i + 1, sectionTitle: null });
    });
  } else if (numPages > 1) {
    // Single blob — keep as one block with unknown page; chunker will add locators
    blocks.push({ text: raw, page: null, sectionTitle: null });
  } else {
    blocks.push({ text: raw, page: 1, sectionTitle: null });
  }

  return { ok: true, plainText: raw, blocks, pageCount: numPages || blocks.length };
}

export function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
