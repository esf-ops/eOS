/**
 * Lab-owned Gemini JSON generateContent client.
 *
 * Replicates the proven Visualizer / Takeoff transport pattern:
 * - Node built-in fetch
 * - REST generateContent
 * - API key in query string (Gemini design)
 * - NEVER log the URL (contains the key)
 *
 * Does NOT import or call Visualizer / Takeoff modules.
 * Text-only — no image generation, no file/PDF inline data.
 */

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * @param {string} text
 */
export function stripJsonFences(text) {
  const trimmed = String(text ?? "").trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

/**
 * @param {{
 *   apiKey: string,
 *   modelName: string,
 *   systemPrompt: string,
 *   userMessage: string,
 *   timeoutMs?: number,
 *   passLabel?: string,
 *   fetchImpl?: typeof fetch
 * }} input
 */
export async function geminiJsonGenerate(input) {
  const {
    apiKey,
    modelName,
    systemPrompt,
    userMessage,
    timeoutMs = 60_000,
    passLabel = "classification",
    fetchImpl = globalThis.fetch
  } = input;

  if (!apiKey) {
    throw Object.assign(new Error("Gemini API key is not configured."), {
      statusCode: 503,
      code: "MISSING_API_KEY"
    });
  }
  if (!modelName) {
    throw Object.assign(new Error("QIL_AI_MODEL is required — model must be supplied by configuration."), {
      statusCode: 503,
      code: "MISSING_MODEL"
    });
  }
  if (typeof fetchImpl !== "function") {
    throw Object.assign(new Error("fetch is unavailable."), { statusCode: 500, code: "NO_FETCH" });
  }

  // IMPORTANT: never log `url` — it embeds the API key.
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
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
    const code = res.status === 429 ? "RATE_LIMITED" : res.status >= 500 ? "PROVIDER_5XX" : "PROVIDER_4XX";
    throw Object.assign(new Error(`Gemini ${passLabel} failed (${res.status}).`), {
      statusCode: res.status === 429 ? 429 : res.status >= 500 ? 502 : 400,
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
