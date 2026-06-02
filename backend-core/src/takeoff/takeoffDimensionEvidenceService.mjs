/**
 * takeoffDimensionEvidenceService — second-pass dimension evidence extraction.
 *
 * Flow:
 *   1. Send the uploaded plan file to AI with the dimension evidence system prompt.
 *   2. AI returns DimensionEvidence JSON: all visible labeled dimensions, fabrication
 *      notes, and cutout callouts — no sqft calculation, no TakeoffResult.
 *   3. Caller passes the evidence table into the final TakeoffResult extraction so the
 *      extraction model builds runs directly from pre-identified dimensions.
 *
 * Why this matters:
 *   A single-pass extraction on messy hand sketches causes the model to miss or
 *   "shrink" dimensions across runs. By pre-extracting all labeled dimensions into an
 *   evidence table first, we anchor the final extraction and prevent random omissions.
 *
 * Non-fatal design:
 *   runDimensionEvidence throws if the AI call or parse fails. The caller
 *   (takeoffExtractionService) catches these errors and continues extraction
 *   without evidence context rather than blocking the whole job.
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
  buildEvidenceSystemPrompt,
  buildEvidenceUserMessage,
  EVIDENCE_PROMPT_VERSION,
} from "./takeoffDimensionEvidencePrompt.mjs";

export { EVIDENCE_PROMPT_VERSION };

// ── Constants ─────────────────────────────────────────────────────────────────

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/heic", "image/heif", "image/tiff",
]);
const FILE_MIME_TYPES = new Set(["application/pdf"]);

// ── Default evidence provider (OpenAI Responses API) ──────────────────────────

/**
 * Makes the OpenAI API call for dimension evidence extraction.
 * Same pattern as openAiTakeoffProvider but with evidence prompt.
 *
 * @param {{ fileBuffer: Buffer, mimeType: string, originalFilename: string, modelName: string, apiKey: string, pageInventory?: object|null }} input
 * @returns {Promise<{ rawText: string, parsed: object|null, parseError: string|null, modelUsed: string, usage: object }>}
 */
async function defaultEvidenceProvider({
  fileBuffer,
  mimeType,
  originalFilename,
  modelName = "gpt-4o",
  apiKey,
  pageInventory = null,
}) {
  if (!apiKey) {
    throw Object.assign(
      new Error("OPENAI_API_KEY is not configured — cannot run dimension evidence extraction."),
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
      new Error(`File type "${mimeType}" is not supported for dimension evidence extraction.`),
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
    text: buildEvidenceUserMessage({ originalFilename, pageInventory }),
  };

  const payload = {
    model: modelName,
    instructions: buildEvidenceSystemPrompt(),
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
      new Error(`OpenAI network error (evidence): ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`),
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
      new Error(`OpenAI API error ${httpRes.status} (evidence): ${detail}`),
      { statusCode: outboundStatus }
    );
  }

  let responseJson;
  try { responseJson = JSON.parse(responseText); }
  catch {
    throw Object.assign(
      new Error("OpenAI returned a non-JSON response body (evidence)"),
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
        parseError = "Model returned non-object JSON (expected DimensionEvidence object)";
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
 * Run the dimension evidence extraction pass for a plan file.
 *
 * Returns a DimensionEvidence object. Throws if the AI call or JSON parse fails —
 * callers should catch and treat as non-fatal.
 *
 * @param {{
 *   fileBuffer:        Buffer,
 *   mimeType:          string,
 *   originalFilename:  string,
 *   modelName?:        string,
 *   apiKey?:           string|null,
 *   pageInventory?:    object|null,   — context from prior inventory pass
 *   providerFn?:       Function|null, — injectable for testing (skips real API call)
 * }} params
 * @returns {Promise<DimensionEvidence>}
 */
export async function runDimensionEvidence({
  fileBuffer,
  mimeType,
  originalFilename,
  modelName   = "gpt-4o",
  apiKey      = null,
  pageInventory = null,
  providerFn  = null,
}) {
  const callProvider = providerFn ?? defaultEvidenceProvider;

  let rawText, parsed, parseError;
  try {
    ({ rawText, parsed, parseError } = await callProvider({
      fileBuffer,
      mimeType,
      originalFilename,
      modelName,
      apiKey,
      pageInventory,
    }));
  } catch (e) {
    throw Object.assign(
      new Error(
        `Dimension evidence AI call failed: ${e instanceof Error ? e.message : String(e)}`
      ),
      { statusCode: e.statusCode ?? 503, evidenceFailed: true }
    );
  }

  if (!parsed || parseError) {
    throw Object.assign(
      new Error(
        `Dimension evidence JSON parse failed: ${parseError ?? "empty response"}`
      ),
      { statusCode: 422, evidenceFailed: true }
    );
  }

  if (!Array.isArray(parsed.dimensions)) {
    throw Object.assign(
      new Error("Dimension evidence response is missing the dimensions array"),
      { statusCode: 422, evidenceFailed: true }
    );
  }

  // Normalize: ensure all arrays are present.
  return {
    schemaVersion:          parsed.schemaVersion ?? "1.0",
    evidencePromptVersion:  EVIDENCE_PROMPT_VERSION,
    sourcePages:            Array.isArray(parsed.sourcePages) ? parsed.sourcePages : [],
    dimensions:             parsed.dimensions,
    notes:                  Array.isArray(parsed.notes) ? parsed.notes : [],
    cutouts:                Array.isArray(parsed.cutouts) ? parsed.cutouts : [],
    uncertainItems:         Array.isArray(parsed.uncertainItems) ? parsed.uncertainItems : [],
    reviewRequired:         Boolean(parsed.reviewRequired ?? false),
  };
}
