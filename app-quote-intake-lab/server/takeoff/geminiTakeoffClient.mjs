/**
 * Lab-owned Gemini generateContent client with inline PDF/image parts.
 *
 * Replicates the proven REST + query-key pattern from geminiJsonClient.mjs,
 * but supports multimodal inline_data for takeoff plan bytes.
 *
 * NEVER log the request URL (contains API key).
 * NEVER log attachment bytes or base64.
 */

import { stripJsonFences } from "../geminiJsonClient.mjs";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * @param {{
 *   apiKey: string,
 *   modelName: string,
 *   systemPrompt: string,
 *   userMessage: string,
 *   mimeType: string,
 *   contentBytes: Buffer,
 *   timeoutMs?: number,
 *   passLabel?: string,
 *   fetchImpl?: typeof fetch
 * }} input
 */
export async function geminiTakeoffJsonGenerate(input) {
  const {
    apiKey,
    modelName,
    systemPrompt,
    userMessage,
    mimeType,
    contentBytes,
    timeoutMs = 90_000,
    passLabel = "takeoff",
    fetchImpl = globalThis.fetch
  } = input;

  if (!apiKey) {
    throw Object.assign(new Error("Gemini API key is not configured."), {
      statusCode: 503,
      code: "MISSING_API_KEY"
    });
  }
  if (!modelName) {
    throw Object.assign(new Error("QIL_TAKEOFF_MODEL is required — model must be supplied by configuration."), {
      statusCode: 503,
      code: "MISSING_MODEL"
    });
  }
  if (!Buffer.isBuffer(contentBytes) || !contentBytes.length) {
    throw Object.assign(new Error("Attachment content bytes are required."), {
      statusCode: 400,
      code: "EMPTY_CONTENT"
    });
  }
  if (typeof fetchImpl !== "function") {
    throw Object.assign(new Error("fetch is unavailable."), { statusCode: 500, code: "NO_FETCH" });
  }

  // IMPORTANT: never log `url` — it embeds the API key.
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: contentBytes.toString("base64")
            }
          },
          { text: userMessage }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Body contains attachment base64 — never log body
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      throw Object.assign(new Error(`Gemini ${passLabel} timed out.`), {
        statusCode: 504,
        code: "PROVIDER_TIMEOUT"
      });
    }
    throw Object.assign(new Error(`Gemini ${passLabel} network error.`), {
      statusCode: 502,
      code: "PROVIDER_NETWORK"
    });
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  const rawText = await res.text();

  if (!res.ok) {
    let code = "PROVIDER_4XX";
    let statusCode = 400;
    if (res.status === 401 || res.status === 403) {
      code = "INVALID_CREDENTIAL";
      statusCode = 502;
    } else if (res.status === 404) {
      code = "MODEL_UNAVAILABLE";
      statusCode = 502;
    } else if (res.status === 429) {
      code = "RATE_LIMITED";
      statusCode = 429;
    } else if (res.status >= 500) {
      code = "PROVIDER_5XX";
      statusCode = 502;
    }
    throw Object.assign(new Error(`Gemini ${passLabel} failed (${res.status}).`), {
      statusCode,
      code
    });
  }

  let envelope;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    throw Object.assign(new Error(`Gemini ${passLabel} returned non-JSON envelope.`), {
      statusCode: 502,
      code: "INVALID_ENVELOPE"
    });
  }

  const parts = envelope?.candidates?.[0]?.content?.parts ?? [];
  const joined = parts.map((p) => p?.text ?? "").join("\n").trim();
  if (!joined) {
    throw Object.assign(new Error(`Gemini ${passLabel} returned empty content.`), {
      statusCode: 502,
      code: "EMPTY_RESPONSE"
    });
  }

  const cleaned = stripJsonFences(joined);
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    parseError = String(e?.message ?? e);
  }

  const usage = envelope?.usageMetadata
    ? {
        promptTokenCount: envelope.usageMetadata.promptTokenCount ?? null,
        candidatesTokenCount: envelope.usageMetadata.candidatesTokenCount ?? null,
        totalTokenCount: envelope.usageMetadata.totalTokenCount ?? null
      }
    : null;

  return {
    rawText: cleaned,
    parsed,
    parseError,
    modelUsed: modelName,
    latencyMs,
    usage,
    providerRequestId: envelope?.responseId ?? envelope?.requestId ?? null
  };
}
