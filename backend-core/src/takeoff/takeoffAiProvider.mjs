/**
 * takeoffAiProvider — provider-neutral AI extraction interface + factory.
 *
 * Design:
 *   Provider functions share a common interface so switching from OpenAI to
 *   Gemini, Claude, or a self-hosted model only requires adding a new file
 *   and a new case in getExtractionProvider().
 *
 * Provider interface:
 *   async function provider(input: ExtractionInput): Promise<ExtractionOutput>
 *
 * ExtractionInput:
 *   fileBuffer        Buffer        raw file bytes (never exceeds 20 MB for AI)
 *   mimeType          string        MIME type (e.g., 'application/pdf', 'image/jpeg')
 *   originalFilename  string        filename for model context
 *   promptVersion     string        prompt version ('v1'); stored for audit
 *   modelName         string        model name (e.g., 'gpt-4o', 'gemini-2.5-pro')
 *   apiKey            string        API key — NEVER logged
 *
 * ExtractionOutput:
 *   rawText           string        raw text from the model (stored as raw_ai_result_json for audit)
 *   parsed            object|null   parsed TakeoffResult JSON (null if parse failed)
 *   parseError        string|null   parse failure reason (null if success)
 *   modelUsed         string        actual model name returned by the API
 *   usage             object        token usage { promptTokens, completionTokens }
 *   provider          string        provider name ("openai" | "gemini")
 *
 * Environment variables:
 *   TAKEOFF_AI_ENABLED=1               must be exactly "1" to enable
 *   TAKEOFF_AI_PROVIDER=openai|gemini  provider name (default: openai)
 *
 *   OpenAI provider:
 *     TAKEOFF_AI_MODEL=gpt-4o          model name (default: gpt-4o)
 *     OPENAI_API_KEY=sk-...            OpenAI API key (never client-exposed)
 *
 *   Gemini provider:
 *     GEMINI_TAKEOFF_MODEL=gemini-2.5-pro  model name (default: gemini-2.5-pro)
 *     GEMINI_API_KEY=...               Gemini API key (never client-exposed)
 */
import { openAiTakeoffProvider }  from "./openAiTakeoffProvider.mjs";
import {
  geminiExtractionProvider,
  geminiInventoryProvider,
  geminiEvidenceProvider,
} from "./geminiTakeoffProvider.mjs";

/** All supported provider names. */
export const SUPPORTED_PROVIDERS = ["openai", "gemini"];

/**
 * Get the extraction provider function (pass 3) for the given provider name.
 *
 * @param {string} providerName
 * @returns {Function}
 * @throws if the provider is not supported
 */
export function getExtractionProvider(providerName) {
  switch (String(providerName ?? "").toLowerCase()) {
    case "openai":
      return openAiTakeoffProvider;
    case "gemini":
      return geminiExtractionProvider;
    default:
      throw Object.assign(
        new Error(
          `Unsupported AI provider: "${providerName}". ` +
          `Supported: ${SUPPORTED_PROVIDERS.join(", ")}. ` +
          `Set TAKEOFF_AI_PROVIDER in .env.`
        ),
        { statusCode: 503 }
      );
  }
}

/**
 * Get the page inventory provider function (pass 1) for the given provider name.
 * Returns null for openai — the inventory service uses its own built-in OpenAI call.
 *
 * @param {string} providerName
 * @returns {Function|null}
 */
export function getInventoryProvider(providerName) {
  switch (String(providerName ?? "").toLowerCase()) {
    case "gemini":
      return geminiInventoryProvider;
    case "openai":
    default:
      return null; // null → inventory service uses its built-in OpenAI default
  }
}

/**
 * Get the dimension evidence provider function (pass 2) for the given provider name.
 * Returns null for openai — the evidence service uses its own built-in OpenAI call.
 *
 * @param {string} providerName
 * @returns {Function|null}
 */
export function getEvidenceProvider(providerName) {
  switch (String(providerName ?? "").toLowerCase()) {
    case "gemini":
      return geminiEvidenceProvider;
    case "openai":
    default:
      return null; // null → evidence service uses its built-in OpenAI default
  }
}

/**
 * Read AI extraction configuration from environment variables.
 * Called server-side only — API key never sent to browser.
 *
 * Provider-aware: reads the correct API key based on TAKEOFF_AI_PROVIDER.
 *
 * @returns {{
 *   enabled:      boolean,
 *   providerName: string,
 *   modelName:    string,
 *   apiKey:       string|null,
 * }}
 */
export function readExtractionConfig() {
  const providerName = String(process.env.TAKEOFF_AI_PROVIDER ?? "openai").trim() || "openai";

  let modelName, apiKey;
  if (providerName === "gemini") {
    modelName = String(process.env.GEMINI_TAKEOFF_MODEL ?? "gemini-2.5-pro").trim() || "gemini-2.5-pro";
    apiKey    = String(process.env.GEMINI_API_KEY ?? "").trim() || null;
  } else {
    // openai (and any unknown provider — getExtractionProvider will reject unknown at call time)
    modelName = String(process.env.TAKEOFF_AI_MODEL ?? "gpt-4o").trim() || "gpt-4o";
    apiKey    = String(process.env.OPENAI_API_KEY ?? "").trim() || null;
  }

  return {
    enabled: String(process.env.TAKEOFF_AI_ENABLED ?? "").trim() === "1",
    providerName,
    modelName,
    apiKey,
  };
}
