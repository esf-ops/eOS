/**
 * geminiTakeoffProvider — Google Gemini extraction provider for AI Takeoff.
 *
 * Supports all three AI passes:
 *   1. Page inventory      (geminiInventoryProvider)
 *   2. Dimension evidence  (geminiEvidenceProvider)
 *   3. Final extraction    (geminiExtractionProvider)
 *
 * Uses the Gemini generateContent REST API (v1beta) with inline base64 file data.
 * No npm package required — uses Node.js built-in fetch (Node 18+).
 *
 * API endpoint:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
 *
 * Security:
 *   - GEMINI_API_KEY is set in the query string (Gemini's design). NEVER log the URL.
 *   - API key is never returned to the frontend or included in any logs.
 *   - storage_path is never seen here — caller passes file bytes.
 *   - No quote mutation. No pricing. Evidence only.
 *
 * JSON output:
 *   - responseMimeType: "application/json" is requested in generationConfig.
 *   - Gemini may still wrap output in markdown fences; stripJsonFences() handles this.
 *
 * Provider interface (shared with openAiTakeoffProvider):
 *   input:  { fileBuffer, mimeType, originalFilename, modelName, apiKey, ... }
 *   output: { rawText, parsed, parseError, modelUsed, usage, provider }
 *
 * Environment variables (read by takeoffAiProvider.readExtractionConfig):
 *   GEMINI_API_KEY          — Gemini API key (server-side only, never frontend)
 *   GEMINI_TAKEOFF_MODEL    — model name, default "gemini-2.5-pro"
 *   TAKEOFF_AI_PROVIDER=gemini — enables this provider
 */
import { buildSystemPrompt, buildUserMessage }       from "./takeoffExtractionPrompt.mjs";
import { buildInventorySystemPrompt, buildInventoryUserMessage } from "./takeoffPageInventoryPrompt.mjs";
import { buildEvidenceSystemPrompt, buildEvidenceUserMessage }   from "./takeoffDimensionEvidencePrompt.mjs";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Max file size for AI extraction (20 MB). */
const MAX_AI_FILE_BYTES = 20 * 1024 * 1024;

/** MIME types supported for inline data (PDF + images). */
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/heic", "image/heif", "image/tiff",
]);

// ── JSON fence stripping ──────────────────────────────────────────────────────

/**
 * Strip markdown code fences from a string.
 * Gemini may return ```json ... ``` even when responseMimeType is set.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripJsonFences(text) {
  const trimmed = String(text ?? "").trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

// ── Core Gemini API call ──────────────────────────────────────────────────────

/**
 * Make a single generateContent call to the Gemini REST API.
 * Used internally by all three provider functions.
 *
 * IMPORTANT: Never log `url` — it contains the API key in the query string.
 *
 * @param {{
 *   apiKey:       string,
 *   modelName:    string,
 *   systemPrompt: string,
 *   userMessage:  string,
 *   fileBuffer:   Buffer,
 *   mimeType:     string,
 *   passLabel:    string,   — "extraction" | "inventory" | "evidence" (for error messages)
 * }}
 * @returns {Promise<{ rawText: string, parsed: object|null, parseError: string|null, modelUsed: string, usage: object }>}
 */
async function geminiApiCall({
  apiKey,
  modelName,
  systemPrompt,
  userMessage,
  fileBuffer,
  mimeType,
  passLabel = "extraction",
}) {
  // ── Guards ─────────────────────────────────────────────────────────────────

  if (!apiKey) {
    throw Object.assign(
      new Error(`GEMINI_API_KEY is not configured — cannot run ${passLabel}.`),
      { statusCode: 503 }
    );
  }
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw Object.assign(new Error("File buffer is empty"), { statusCode: 400 });
  }
  if (fileBuffer.length > MAX_AI_FILE_BYTES) {
    throw Object.assign(
      new Error(
        `File is too large for AI extraction: ` +
        `${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB. ` +
        `Maximum is 20 MB.`
      ),
      { statusCode: 413 }
    );
  }

  const mimeNorm = String(mimeType ?? "").toLowerCase().trim();
  if (!SUPPORTED_MIME_TYPES.has(mimeNorm)) {
    throw Object.assign(
      new Error(
        `File type "${mimeType}" is not supported for Gemini extraction. ` +
        `Supported: PDF, JPEG, PNG, WEBP, GIF, HEIC, TIFF.`
      ),
      { statusCode: 415 }
    );
  }

  // ── Build request ──────────────────────────────────────────────────────────

  const base64 = fileBuffer.toString("base64");

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [{
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: mimeNorm,
            data:     base64,
          },
        },
        { text: userMessage },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  // NEVER log this URL — it contains apiKey in the query string.
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(modelName)}:generateContent?key=${apiKey}`;

  let httpRes;
  try {
    httpRes = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw Object.assign(
      new Error(
        `Gemini network error (${passLabel}): ` +
        `${networkErr instanceof Error ? networkErr.message : String(networkErr)}`
      ),
      { statusCode: 503 }
    );
  }

  const responseText = await httpRes.text();

  if (!httpRes.ok) {
    let detail = responseText.slice(0, 400);
    try {
      const errJson = JSON.parse(responseText);
      detail = errJson?.error?.message ?? detail;
    } catch { /* ignore */ }

    const outboundStatus =
      httpRes.status >= 400 && httpRes.status < 500 ? httpRes.status : 503;
    throw Object.assign(
      new Error(`Gemini API error ${httpRes.status} (${passLabel}): ${detail}`),
      { statusCode: outboundStatus }
    );
  }

  // ── Parse Gemini response ──────────────────────────────────────────────────

  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    throw Object.assign(
      new Error(`Gemini returned a non-JSON response body (${passLabel})`),
      { statusCode: 503 }
    );
  }

  // Extract text from candidates[0].content.parts[0].text
  const rawText =
    responseJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const usage = {
    promptTokens:     responseJson?.usageMetadata?.promptTokenCount      ?? 0,
    completionTokens: responseJson?.usageMetadata?.candidatesTokenCount  ?? 0,
  };
  // modelVersion is the actual resolved model (e.g., "gemini-2.5-pro-preview-05-06")
  const modelUsed = responseJson?.modelVersion ?? modelName;

  // ── Parse JSON from model output (with fence stripping) ───────────────────

  let parsed     = null;
  let parseError = null;

  if (!rawText) {
    parseError = "Gemini returned an empty response";
  } else {
    const cleaned = stripJsonFences(rawText);
    try {
      const candidate = JSON.parse(cleaned);
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        parseError = "Gemini returned non-object JSON (expected structured output)";
      } else {
        parsed = candidate;
      }
    } catch (e) {
      parseError = e instanceof SyntaxError ? e.message : String(e);
    }
  }

  return { rawText, parsed, parseError, modelUsed, usage };
}

// ── Provider exports ──────────────────────────────────────────────────────────

/**
 * Gemini provider for final TakeoffResult extraction (pass 3).
 *
 * @param {{ fileBuffer, mimeType, originalFilename, modelName, apiKey, pageInventory?, dimensionEvidence? }}
 * @returns {Promise<{ rawText, parsed, parseError, modelUsed, usage, provider }>}
 */
export async function geminiExtractionProvider({
  fileBuffer,
  mimeType,
  originalFilename,
  modelName         = "gemini-2.5-pro",
  apiKey,
  pageInventory     = null,
  dimensionEvidence = null,
}) {
  const result = await geminiApiCall({
    apiKey,
    modelName,
    systemPrompt: buildSystemPrompt(),
    userMessage:  buildUserMessage({ originalFilename, pageInventory, dimensionEvidence }),
    fileBuffer,
    mimeType,
    passLabel: "extraction",
  });
  return { ...result, provider: "gemini" };
}

/**
 * Gemini provider for page inventory pass (pass 1).
 *
 * @param {{ fileBuffer, mimeType, originalFilename, modelName, apiKey }}
 * @returns {Promise<{ rawText, parsed, parseError, modelUsed, usage, provider }>}
 */
export async function geminiInventoryProvider({
  fileBuffer,
  mimeType,
  originalFilename,
  modelName = "gemini-2.5-pro",
  apiKey,
}) {
  const result = await geminiApiCall({
    apiKey,
    modelName,
    systemPrompt: buildInventorySystemPrompt(),
    userMessage:  buildInventoryUserMessage({ originalFilename }),
    fileBuffer,
    mimeType,
    passLabel: "inventory",
  });
  return { ...result, provider: "gemini" };
}

/**
 * Gemini provider for dimension evidence pass (pass 2).
 *
 * @param {{ fileBuffer, mimeType, originalFilename, modelName, apiKey, pageInventory? }}
 * @returns {Promise<{ rawText, parsed, parseError, modelUsed, usage, provider }>}
 */
export async function geminiEvidenceProvider({
  fileBuffer,
  mimeType,
  originalFilename,
  modelName     = "gemini-2.5-pro",
  apiKey,
  pageInventory = null,
}) {
  const result = await geminiApiCall({
    apiKey,
    modelName,
    systemPrompt: buildEvidenceSystemPrompt(),
    userMessage:  buildEvidenceUserMessage({ originalFilename, pageInventory }),
    fileBuffer,
    mimeType,
    passLabel: "evidence",
  });
  return { ...result, provider: "gemini" };
}
