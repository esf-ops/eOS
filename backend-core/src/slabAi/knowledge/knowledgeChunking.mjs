/**
 * Deterministic structure-aware chunking for knowledge passages.
 */
import { normalizeExtractedText } from "./knowledgeExtraction.mjs";

const TARGET_CHARS = 1200;
const MAX_CHARS = 2200;
const MIN_CHARS = 200;

/**
 * @param {{ text: string, page?: number|null, sectionTitle?: string|null }[]} blocks
 * @returns {{ text: string, searchText: string, locator: string|null, pageNumber: number|null, sectionTitle: string|null, sortOrder: number, keywords: string[] }[]}
 */
export function chunkKnowledgeBlocks(blocks) {
  /** @type {ReturnType<typeof chunkKnowledgeBlocks>} */
  const out = [];
  let sortOrder = 0;

  for (const block of blocks || []) {
    const normalized = normalizeExtractedText(block.text);
    if (!normalized) continue;
    const pieces = splitPreservingParagraphs(normalized);
    for (const piece of pieces) {
      sortOrder += 1;
      const page = block.page != null ? Number(block.page) : null;
      const section = block.sectionTitle ? String(block.sectionTitle).slice(0, 160) : null;
      const locatorParts = [];
      if (page != null && Number.isFinite(page)) locatorParts.push(`page ${page}`);
      if (section) locatorParts.push(section);
      out.push({
        text: piece,
        searchText: piece.toLowerCase(),
        locator: locatorParts.length ? locatorParts.join(" · ") : null,
        pageNumber: page != null && Number.isFinite(page) ? page : null,
        sectionTitle: section,
        sortOrder,
        keywords: extractKeywords(piece),
      });
    }
  }
  return out;
}

function splitPreservingParagraphs(text) {
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  /** @type {string[]} */
  const chunks = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };

  for (const p of paras) {
    if (p.length > MAX_CHARS) {
      flush();
      for (const hard of hardSplit(p, MAX_CHARS)) chunks.push(hard);
      continue;
    }
    if (!buf) {
      buf = p;
      continue;
    }
    if (buf.length + 2 + p.length <= TARGET_CHARS) {
      buf = `${buf}\n\n${p}`;
    } else if (buf.length < MIN_CHARS) {
      buf = `${buf}\n\n${p}`;
      if (buf.length >= TARGET_CHARS) flush();
    } else {
      flush();
      buf = p;
    }
  }
  flush();
  return chunks.length ? chunks : [text.slice(0, MAX_CHARS)];
}

function hardSplit(text, size) {
  const parts = [];
  for (let i = 0; i < text.length; i += size) {
    parts.push(text.slice(i, i + size).trim());
  }
  return parts.filter(Boolean);
}

function extractKeywords(text) {
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "your", "are", "was", "were",
    "not", "use", "using", "when", "then", "than", "also", "any", "all", "can", "may", "must",
  ]);
  const counts = new Map();
  for (const t of text.toLowerCase().split(/[^a-z0-9]+/i)) {
    if (t.length < 3 || t.length > 32 || stop.has(t)) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);
}
