/**
 * takeoffPageInventoryService — first-pass page classification for two-step AI takeoff.
 *
 * Flow:
 *   1. Send the uploaded plan file to AI with the inventory system prompt.
 *   2. AI returns PageInventory JSON: page classification, recommended measurement
 *      pages, visible dimension evidence, and notes.
 *   3. Caller uses the inventory as context for the full TakeoffResult extraction.
 *
 * Why two-step:
 *   A messy multi-page PDF (hand sketch + email + elevation) confuses a single-pass
 *   extraction model — it may draw dimensions from the wrong page or ignore the
 *   measurement page entirely. The inventory pass tells the extraction model which
 *   page(s) to focus on before asking for structured dimensions.
 *
 * Non-fatal design:
 *   runPageInventory throws if the AI call or parse fails. The caller
 *   (takeoffExtractionService) catches these errors and continues extraction
 *   without inventory context rather than blocking the whole job.
 *
 * Security:
 *   - apiKey is never logged.
 *   - storage_path is never seen here — caller passes file bytes.
 *   - No quote mutation. No pricing.
 *
 * Testability:
 *   providerFn injectable for mocked tests — no real OpenAI calls needed.
 */
import {
  buildInventorySystemPrompt,
  buildInventoryUserMessage,
  INVENTORY_PROMPT_VERSION,
} from "./takeoffPageInventoryPrompt.mjs";

export { INVENTORY_PROMPT_VERSION };

// ── Constants ─────────────────────────────────────────────────────────────────

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

/** MIME types sent as input_image. */
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/heic", "image/heif", "image/tiff",
]);

/** MIME types sent as input_file (PDF). */
const FILE_MIME_TYPES = new Set(["application/pdf"]);

// ── Default inventory provider (OpenAI Responses API) ─────────────────────────

/**
 * Makes the OpenAI API call for page inventory.
 * Same pattern as openAiTakeoffProvider but with inventory prompt.
 *
 * @param {{ fileBuffer: Buffer, mimeType: string, originalFilename: string, modelName: string, apiKey: string }} input
 * @returns {Promise<{ rawText: string, parsed: object|null, parseError: string|null, modelUsed: string, usage: object }>}
 */
async function defaultInventoryProvider({
  fileBuffer,
  mimeType,
  originalFilename,
  modelName = "gpt-4o",
  apiKey,
}) {
  if (!apiKey) {
    throw Object.assign(
      new Error("OPENAI_API_KEY is not configured — cannot run page inventory."),
      { statusCode: 503 }
    );
  }
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw Object.assign(new Error("File buffer is empty"), { statusCode: 400 });
  }

  const mimeNorm = String(mimeType ?? "").toLowerCase().trim();
  const isImage  = IMAGE_MIME_TYPES.has(mimeNorm);
  const isPdf    = FILE_MIME_TYPES.has(mimeNorm);

  if (!isImage && !isPdf) {
    throw Object.assign(
      new Error(`File type "${mimeType}" is not supported for page inventory.`),
      { statusCode: 415 }
    );
  }

  const base64  = fileBuffer.toString("base64");
  const dataUri = `data:${mimeNorm};base64,${base64}`;

  const fileBlock = isImage
    ? { type: "input_image", image_url: dataUri, detail: "high" }
    : { type: "input_file",  filename: originalFilename, file_data: dataUri };

  const textBlock = {
    type: "input_text",
    text: buildInventoryUserMessage({ originalFilename }),
  };

  const payload = {
    model: modelName,
    instructions: buildInventorySystemPrompt(),
    input: [{ role: "user", content: [fileBlock, textBlock] }],
    text: { format: { type: "json_object" } },
  };

  let httpRes;
  try {
    httpRes = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw Object.assign(
      new Error(`OpenAI network error (inventory): ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`),
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
    const outboundStatus = httpRes.status >= 400 && httpRes.status < 500 ? httpRes.status : 503;
    throw Object.assign(
      new Error(`OpenAI API error ${httpRes.status} (inventory): ${detail}`),
      { statusCode: outboundStatus }
    );
  }

  let responseJson;
  try { responseJson = JSON.parse(responseText); }
  catch {
    throw Object.assign(
      new Error("OpenAI returned a non-JSON response body (inventory)"),
      { statusCode: 503 }
    );
  }

  const outputMessage = Array.isArray(responseJson?.output)
    ? responseJson.output.find((o) => o?.type === "message")
    : null;
  const outputContent = Array.isArray(outputMessage?.content)
    ? outputMessage.content.find((c) => c?.type === "output_text")
    : null;
  const rawText = outputContent?.text ?? "";

  const usage = {
    promptTokens:     responseJson?.usage?.input_tokens  ?? 0,
    completionTokens: responseJson?.usage?.output_tokens ?? 0,
  };
  const modelUsed = responseJson?.model ?? modelName;

  let parsed    = null;
  let parseError = null;

  if (!rawText) {
    parseError = "Model returned an empty response";
  } else {
    try {
      const candidate = JSON.parse(rawText);
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        parseError = "Model returned non-object JSON (expected PageInventory object)";
      } else {
        parsed = candidate;
      }
    } catch (e) {
      parseError = e instanceof SyntaxError ? e.message : String(e);
    }
  }

  return { rawText, parsed, parseError, modelUsed, usage };
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Run the page inventory / classification pass for a plan file.
 *
 * Returns a PageInventory object. Throws if the AI call or JSON parse fails —
 * callers should catch and treat as non-fatal.
 *
 * @param {{
 *   fileBuffer:        Buffer,
 *   mimeType:          string,
 *   originalFilename:  string,
 *   modelName?:        string,
 *   apiKey?:           string|null,
 *   providerFn?:       Function|null,   — injectable for testing (skips real API call)
 * }} params
 * @returns {Promise<PageInventory>}
 */
export async function runPageInventory({
  fileBuffer,
  mimeType,
  originalFilename,
  modelName   = "gpt-4o",
  apiKey      = null,
  providerFn  = null,
}) {
  const callProvider = providerFn ?? defaultInventoryProvider;

  let rawText, parsed, parseError;
  try {
    ({ rawText, parsed, parseError } = await callProvider({
      fileBuffer,
      mimeType,
      originalFilename,
      modelName,
      apiKey,
    }));
  } catch (e) {
    throw Object.assign(
      new Error(
        `Page inventory AI call failed: ${e instanceof Error ? e.message : String(e)}`
      ),
      { statusCode: e.statusCode ?? 503, inventoryFailed: true }
    );
  }

  if (!parsed || parseError) {
    throw Object.assign(
      new Error(
        `Page inventory JSON parse failed: ${parseError ?? "empty response"}`
      ),
      { statusCode: 422, inventoryFailed: true }
    );
  }

  if (!Array.isArray(parsed.pages)) {
    throw Object.assign(
      new Error("Page inventory response is missing the pages array"),
      { statusCode: 422, inventoryFailed: true }
    );
  }

  // Normalize: ensure recommendedMeasurementPages and pagesToIgnore are present.
  return {
    schemaVersion: parsed.schemaVersion ?? "1.0",
    inventoryPromptVersion: INVENTORY_PROMPT_VERSION,
    pages: parsed.pages,
    recommendedMeasurementPages: Array.isArray(parsed.recommendedMeasurementPages)
      ? parsed.recommendedMeasurementPages
      : parsed.pages
          .filter((p) => p.recommendedForTakeoff)
          .map((p) => p.pageNumber),
    pagesToIgnore: Array.isArray(parsed.pagesToIgnore)
      ? parsed.pagesToIgnore
      : [],
    overallNotes: Array.isArray(parsed.overallNotes)
      ? parsed.overallNotes
      : [],
  };
}
