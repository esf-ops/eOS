/**
 * OCR provider abstraction for scanned/image-only PDFs.
 * Production: OpenAI vision (Responses/Chat Completions with images).
 * Does NOT make OCR text authoritative — approval remains required.
 *
 * Runtime decision: OpenAI vision is used because Brain already has OpenAI
 * for takeoff and Vercel serverless cannot reliably host tesseract/native OCR.
 * PDF pages are transcribed via the Files + Responses API when available,
 * with a chat-completions vision fallback for page images when provided.
 */

import { pickStr } from "./knowledgeConstants.mjs";

export const OCR_DEFAULTS = {
  maxPages: Number(process.env.SLAB_AI_OCR_MAX_PAGES || 40),
  maxFileBytes: Number(process.env.SLAB_AI_OCR_MAX_BYTES || 20 * 1024 * 1024),
  /** Native extraction below this many non-whitespace chars → OCR candidate */
  minNativeChars: Number(process.env.SLAB_AI_OCR_MIN_NATIVE_CHARS || 80),
  /** If pages known and text-bearing ratio below this, treat as scanned */
  minTextBearingRatio: Number(process.env.SLAB_AI_OCR_MIN_TEXT_RATIO || 0.25),
};

/**
 * @typedef {{ pageNumber: number, text: string, confidence?: number }} OcrPage
 * @typedef {{ pages: OcrPage[], provider: string, model?: string }} OcrDocumentResult
 */

export function getOcrConfig(env = process.env) {
  const enabled = String(env.SLAB_AI_OCR_ENABLED || "1").trim() !== "0";
  const provider = String(env.SLAB_AI_OCR_PROVIDER || "openai").trim().toLowerCase();
  const apiKey = String(env.SLAB_AI_OCR_API_KEY || env.OPENAI_API_KEY || "").trim() || null;
  const model = String(env.SLAB_AI_OCR_MODEL || "gpt-4o-mini").trim();
  const mock = String(env.SLAB_AI_OCR_MOCK || "").trim() === "1" || provider === "mock";
  return {
    enabled,
    provider: mock ? "mock" : provider,
    apiKey,
    model,
    mock,
    maxPages: Number(env.SLAB_AI_OCR_MAX_PAGES || OCR_DEFAULTS.maxPages) || OCR_DEFAULTS.maxPages,
    maxFileBytes: Number(env.SLAB_AI_OCR_MAX_BYTES || OCR_DEFAULTS.maxFileBytes) || OCR_DEFAULTS.maxFileBytes,
    minNativeChars: Number(env.SLAB_AI_OCR_MIN_NATIVE_CHARS || OCR_DEFAULTS.minNativeChars) || OCR_DEFAULTS.minNativeChars,
    minTextBearingRatio: Number(env.SLAB_AI_OCR_MIN_TEXT_RATIO || OCR_DEFAULTS.minTextBearingRatio) || OCR_DEFAULTS.minTextBearingRatio,
  };
}

/**
 * Deterministic heuristic: should we OCR this PDF after native extraction?
 */
export function shouldInvokeOcr({ nativeText, pageCount, forceOcr }) {
  if (forceOcr) return { ocr: true, reason: "force_ocr" };
  const text = String(nativeText || "");
  const nonWs = text.replace(/\s+/g, "").length;
  if (nonWs >= OCR_DEFAULTS.minNativeChars) {
    return { ocr: false, reason: "native_text_adequate", nonWs, pageCount: pageCount || null };
  }
  if (nonWs === 0) {
    return { ocr: true, reason: "empty_native_text", nonWs, pageCount: pageCount || null };
  }
  // Sparse text relative to page count
  const pages = Number(pageCount) || 1;
  const charsPerPage = nonWs / pages;
  if (charsPerPage < 40) {
    return { ocr: true, reason: "sparse_native_text", nonWs, pageCount: pages, charsPerPage };
  }
  return { ocr: false, reason: "native_text_marginal_but_ok", nonWs, pageCount: pages };
}

export function createOcrProvider(env = process.env) {
  const cfg = getOcrConfig(env);
  if (!cfg.enabled) {
    return {
      id: "disabled",
      async processDocument() {
        throw Object.assign(new Error("OCR is disabled (SLAB_AI_OCR_ENABLED=0)."), { code: "OCR_DISABLED" });
      },
    };
  }
  if (cfg.mock || cfg.provider === "mock") {
    return createMockOcrProvider(cfg);
  }
  if (cfg.provider === "openai") {
    if (!cfg.apiKey) {
      throw Object.assign(new Error("OCR requires SLAB_AI_OCR_API_KEY or OPENAI_API_KEY"), {
        code: "OCR_UNAVAILABLE",
      });
    }
    return createOpenAiOcrProvider(cfg);
  }
  throw Object.assign(new Error(`Unsupported OCR provider: ${cfg.provider}`), { code: "OCR_UNSUPPORTED" });
}

function createMockOcrProvider(cfg = OCR_DEFAULTS) {
  return {
    id: "mock",
    async processDocument(input) {
      const maxPages = cfg.maxPages || OCR_DEFAULTS.maxPages;
      const maxBytes = cfg.maxFileBytes || OCR_DEFAULTS.maxFileBytes;
      if (input.bytes?.length > maxBytes) {
        throw Object.assign(
          new Error(`PDF exceeds OCR size limit (${Math.round(maxBytes / (1024 * 1024))} MB).`),
          { code: "OCR_TOO_LARGE" }
        );
      }
      if ((input.pageCountHint || 0) > maxPages) {
        throw Object.assign(
          new Error(`PDF has ${input.pageCountHint} pages; OCR max is ${maxPages}. Split the document or raise SLAB_AI_OCR_MAX_PAGES.`),
          { code: "OCR_PAGE_LIMIT" }
        );
      }
      const pages = Math.min(input.pageCountHint || 1, maxPages);
      /** @type {OcrPage[]} */
      const out = [];
      for (let i = 1; i <= pages; i++) {
        out.push({
          pageNumber: i,
          text: `SENTINEL OCR page ${i}: Verify coolant delivery. Maximum spindle RPM: 4200. Do not bypass guards.`,
        });
      }
      return { pages: out, provider: "mock", model: "mock-ocr" };
    },
  };
}

function createOpenAiOcrProvider(cfg) {
  return {
    id: "openai",
    async processDocument(input) {
      const bytes = input.bytes;
      if (!bytes?.length) throw Object.assign(new Error("Empty PDF for OCR"), { code: "OCR_EMPTY" });
      if (bytes.length > cfg.maxFileBytes) {
        throw Object.assign(
          new Error(`PDF exceeds OCR size limit (${Math.round(cfg.maxFileBytes / (1024 * 1024))} MB).`),
          { code: "OCR_TOO_LARGE" }
        );
      }

      const pageHint = Math.min(Number(input.pageCountHint) || cfg.maxPages, cfg.maxPages);
      if ((input.pageCountHint || 0) > cfg.maxPages) {
        throw Object.assign(
          new Error(`PDF has ${input.pageCountHint} pages; OCR max is ${cfg.maxPages}. Split the document or raise SLAB_AI_OCR_MAX_PAGES.`),
          { code: "OCR_PAGE_LIMIT" }
        );
      }

      // Upload PDF to OpenAI Files API, then ask for page-by-page transcription.
      const form = new FormData();
      form.append("purpose", "user_data");
      form.append("file", new Blob([bytes], { type: "application/pdf" }), input.filename || "document.pdf");

      const up = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        body: form,
      });
      if (!up.ok) {
        const t = await up.text().catch(() => "");
        throw Object.assign(new Error(`OCR file upload failed (${up.status})`), {
          code: "OCR_UPLOAD_FAILED",
          detail: t.slice(0, 200),
        });
      }
      const file = await up.json();
      const fileId = file.id;

      try {
        const prompt = [
          "Transcribe this PDF for a stone fabrication knowledge base.",
          "Return ONLY valid JSON: {\"pages\":[{\"pageNumber\":1,\"text\":\"...\"}]}",
          `Transcribe at most ${pageHint} pages.`,
          "Preserve numbers, units, warnings, headings, and lists exactly.",
          "If a page is blank, return empty text for that page.",
          "Do not invent content that is not visible.",
        ].join(" ");

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "file", file: { file_id: fileId } },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          // Fallback: ask without file attachment type (older API) — treat as failure with clear message
          const t = await res.text().catch(() => "");
          throw Object.assign(new Error(`OCR transcription failed (${res.status}). Provider may not accept PDF file attachments for this model.`), {
            code: "OCR_TRANSCRIBE_FAILED",
            detail: t.slice(0, 240),
          });
        }

        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || "{}";
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw Object.assign(new Error("OCR returned non-JSON content."), { code: "OCR_BAD_RESPONSE" });
        }
        const pages = Array.isArray(parsed.pages)
          ? parsed.pages
              .map((p) => ({
                pageNumber: Number(p.pageNumber) || 0,
                text: pickStr(p.text),
              }))
              .filter((p) => p.pageNumber > 0)
              .slice(0, cfg.maxPages)
          : [];

        if (!pages.some((p) => p.text.replace(/\s+/g, "").length > 0)) {
          throw Object.assign(new Error("OCR produced no usable text."), { code: "OCR_EMPTY_RESULT" });
        }

        return { pages, provider: "openai", model: cfg.model };
      } finally {
        // Best-effort cleanup
        void fetch(`https://api.openai.com/v1/files/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
        }).catch(() => null);
      }
    },
  };
}
