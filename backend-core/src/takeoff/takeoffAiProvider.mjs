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
 *   modelName         string        model name (e.g., 'gpt-4o')
 *   apiKey            string        API key — NEVER logged
 *
 * ExtractionOutput:
 *   rawText           string        raw text from the model (stored as raw_ai_result_json for audit)
 *   parsed            object|null   parsed TakeoffResult JSON (null if parse failed)
 *   parseError        string|null   parse failure reason (null if success)
 *   modelUsed         string        actual model name returned by the API
 *   usage             object        token usage { promptTokens, completionTokens }
 *
 * Environment variables:
 *   TAKEOFF_AI_ENABLED=1           must be exactly "1" to enable
 *   TAKEOFF_AI_PROVIDER=openai     provider name (default: openai)
 *   TAKEOFF_AI_MODEL=gpt-4o        model name (default: gpt-4o)
 *   OPENAI_API_KEY=sk-...          OpenAI API key (never client-exposed)
 */
import { openAiTakeoffProvider } from "./openAiTakeoffProvider.mjs";

/** All supported provider names. Add here when a new provider is added. */
export const SUPPORTED_PROVIDERS = ["openai"];

/**
 * Get the extraction provider function for the given provider name.
 *
 * @param {string} providerName
 * @returns {Function} provider function matching the ExtractionInput → ExtractionOutput signature
 * @throws if the provider is not supported
 */
export function getExtractionProvider(providerName) {
  switch (String(providerName ?? "").toLowerCase()) {
    case "openai":
      return openAiTakeoffProvider;
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
 * Read AI extraction configuration from environment variables.
 * Called server-side only — API key never sent to browser.
 *
 * @returns {{ enabled: boolean, providerName: string, modelName: string, apiKey: string|null }}
 */
export function readExtractionConfig() {
  return {
    enabled: String(process.env.TAKEOFF_AI_ENABLED ?? "").trim() === "1",
    providerName: String(process.env.TAKEOFF_AI_PROVIDER ?? "openai").trim() || "openai",
    modelName: String(process.env.TAKEOFF_AI_MODEL ?? "gpt-4o").trim() || "gpt-4o",
    apiKey: String(process.env.OPENAI_API_KEY ?? "").trim() || null,
  };
}
