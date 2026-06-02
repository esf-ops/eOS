/**
 * openAiTakeoffProvider — fetch-based OpenAI extraction provider.
 *
 * Uses the OpenAI Responses API (POST /v1/responses) which natively supports:
 *   - Images (JPEG, PNG, WEBP, GIF, HEIC, TIFF) via input_image + base64 data URL
 *   - PDFs via input_file + inline base64 file_data
 *
 * No npm package required — uses Node.js built-in fetch (Node 18+).
 *
 * Response API format expected:
 *   {
 *     "output": [{ "type": "message", "content": [{ "type": "output_text", "text": "..." }] }],
 *     "usage": { "input_tokens": N, "output_tokens": M },
 *     "model": "gpt-4o-..."
 *   }
 *
 * JSON output enforced via text.format.type = "json_object".
 * review_status is always set to "needs_review" by the caller — this provider
 * never sets approval status.
 *
 * Security:
 *   - apiKey is never logged (only used in Authorization header).
 *   - storage_path is never seen by this module (caller passes file bytes).
 *   - Raw response text is returned for audit storage — caller decides what to persist.
 */
import { buildSystemPrompt, buildUserMessage } from "./takeoffExtractionPrompt.mjs";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

/** Max file size for AI extraction (20 MB). OpenAI payload limits apply. */
export const MAX_AI_FILE_BYTES = 20 * 1024 * 1024;

/** MIME types sent as input_image (OpenAI vision-compatible). */
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/tiff",
]);

/** MIME types sent as input_file (PDF understanding). */
const FILE_MIME_TYPES = new Set([
  "application/pdf",
]);

/**
 * Extract a TakeoffResult from a file using the OpenAI Responses API.
 *
 * @param {{ fileBuffer: Buffer, mimeType: string, originalFilename: string, promptVersion: string, modelName: string, apiKey: string }} input
 * @returns {Promise<{ rawText: string, parsed: object|null, parseError: string|null, modelUsed: string, usage: { promptTokens: number, completionTokens: number } }>}
 */
export async function openAiTakeoffProvider({
  fileBuffer,
  mimeType,
  originalFilename,
  promptVersion: _promptVersion, // stored by caller in result row; not needed here
  modelName = "gpt-4o",
  apiKey,
}) {
  // ── Guards ───────────────────────────────────────────────────────────────────

  if (!apiKey) {
    throw Object.assign(
      new Error("OPENAI_API_KEY is not configured on this server."),
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
        `Maximum is 20 MB. Compress the PDF or use a smaller image file.`
      ),
      { statusCode: 413 }
    );
  }

  const mimeNorm = String(mimeType ?? "").toLowerCase().trim();
  const isImage = IMAGE_MIME_TYPES.has(mimeNorm);
  const isPdf   = FILE_MIME_TYPES.has(mimeNorm);

  if (!isImage && !isPdf) {
    throw Object.assign(
      new Error(
        `File type "${mimeType}" is not supported for AI extraction. ` +
        `Supported: PDF, JPEG, PNG, WEBP, GIF, HEIC, TIFF.`
      ),
      { statusCode: 415 }
    );
  }

  // ── Build content block ───────────────────────────────────────────────────────

  const base64    = fileBuffer.toString("base64");
  const dataUri   = `data:${mimeNorm};base64,${base64}`;

  // Responses API file content block.
  const fileBlock = isImage
    ? { type: "input_image", image_url: dataUri, detail: "high" }
    : { type: "input_file",  filename: originalFilename, file_data: dataUri };

  const textBlock = {
    type: "input_text",
    text: buildUserMessage({ originalFilename }),
  };

  // ── Responses API payload ────────────────────────────────────────────────────

  const payload = {
    model: modelName,
    instructions: buildSystemPrompt(),
    input: [
      {
        role: "user",
        content: [fileBlock, textBlock],
      },
    ],
    text: {
      format: { type: "json_object" },
    },
  };

  // ── HTTP call ────────────────────────────────────────────────────────────────

  let httpRes;
  try {
    httpRes = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`, // apiKey never logged
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw Object.assign(
      new Error(
        `OpenAI network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`
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

    const outboundStatus = httpRes.status >= 400 && httpRes.status < 500
      ? httpRes.status
      : 503;
    throw Object.assign(
      new Error(`OpenAI API error ${httpRes.status}: ${detail}`),
      { statusCode: outboundStatus }
    );
  }

  // ── Parse Responses API response ─────────────────────────────────────────────

  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    throw Object.assign(
      new Error("OpenAI returned a non-JSON response body"),
      { statusCode: 503 }
    );
  }

  // Extract text content from the output message.
  const outputMessage = Array.isArray(responseJson?.output)
    ? responseJson.output.find((o) => o?.type === "message")
    : null;

  const outputContent = Array.isArray(outputMessage?.content)
    ? outputMessage.content.find((c) => c?.type === "output_text")
    : null;

  const rawText = outputContent?.text ?? "";

  const usage = {
    promptTokens:     responseJson?.usage?.input_tokens     ?? 0,
    completionTokens: responseJson?.usage?.output_tokens    ?? 0,
  };
  const modelUsed = responseJson?.model ?? modelName;

  // ── Parse TakeoffResult JSON from model output ────────────────────────────────

  let parsed    = null;
  let parseError = null;

  if (!rawText) {
    parseError = "Model returned an empty response";
  } else {
    try {
      const candidate = JSON.parse(rawText);
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        parseError = "Model returned non-object JSON (expected TakeoffResult object)";
      } else {
        parsed = candidate;
      }
    } catch (e) {
      parseError = e instanceof SyntaxError ? e.message : String(e);
    }
  }

  return { rawText, parsed, parseError, modelUsed, usage };
}
