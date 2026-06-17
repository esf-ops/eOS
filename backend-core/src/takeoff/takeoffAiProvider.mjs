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
 *   provider          string        provider name ("openai" | "gemini" | "exayard")
 *
 * Environment variables:
 *   TAKEOFF_AI_ENABLED=1                    must be exactly "1" to enable
 *   TAKEOFF_AI_PROVIDER=openai|gemini|exayard  provider name (default: openai)
 *
 *   OpenAI provider:
 *     TAKEOFF_AI_MODEL=gpt-4o          model name (default: gpt-4o)
 *     OPENAI_API_KEY=sk-...            OpenAI API key (never client-exposed)
 *
 *   Gemini provider:
 *     GEMINI_TAKEOFF_MODEL=gemini-2.5-pro  model name (default: gemini-2.5-pro)
 *     GEMINI_API_KEY=...               Gemini API key (never client-exposed)
 *
 *   Exayard provider (platform API — workflow v1):
 *     EXAYARD_API_BASE_URL=https://api.exayard.com/v1
 *     EXAYARD_API_KEY=...              Exayard API key (never client-exposed)
 *     EXAYARD_ORGANIZATION_ID=...      Exayard org id for future takeoff routes
 */
import { openAiTakeoffProvider }  from "./openAiTakeoffProvider.mjs";
import {
  geminiExtractionProvider,
  geminiInventoryProvider,
  geminiEvidenceProvider,
} from "./geminiTakeoffProvider.mjs";
import { getExayardSafeDiagnostics } from "./exayardClient.mjs";
import { exayardTakeoffProvider } from "./exayardTakeoffProvider.mjs";

/** All supported provider names. */
export const SUPPORTED_PROVIDERS = ["openai", "gemini", "exayard"];

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
    case "exayard":
      return exayardTakeoffProvider;
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
    case "exayard":
      return null;
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
    case "exayard":
      return null;
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
  } else if (providerName === "exayard") {
    modelName = "platform";
    apiKey    = String(process.env.EXAYARD_API_KEY ?? "").trim() || null;
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

/**
 * Build the safe provider config for the GET /api/takeoff/config endpoint.
 *
 * Returns only non-sensitive information: whether AI is enabled, which provider
 * is active, the model name, and whether each provider's API key is present.
 * API key values are NEVER included.
 *
 * Shape matches what the /api/takeoff/config endpoint returns.
 *
 * @returns {{
 *   takeoffAiEnabled: boolean,
 *   activeProvider:   "openai" | "gemini" | "exayard" | string,
 *   model:            string,
 *   hasGeminiKey:     boolean,
 *   hasOpenAiKey:     boolean,
 *   hasExayardKey:    boolean,
 *   hasExayardOrganizationId: boolean,
 * }}
 */
export function readSafeProviderConfig() {
  const cfg = readExtractionConfig();
  const asyncCfg = readTakeoffAsyncConfigFromEnv();
  return {
    takeoffAiEnabled: cfg.enabled,
    activeProvider:   cfg.providerName,
    model:            cfg.modelName,
    hasGeminiKey:     Boolean(String(process.env.GEMINI_API_KEY ?? "").trim()),
    hasOpenAiKey:     Boolean(String(process.env.OPENAI_API_KEY ?? "").trim()),
    hasExayardKey:    Boolean(String(process.env.EXAYARD_API_KEY ?? "").trim()),
    hasExayardOrganizationId: Boolean(String(process.env.EXAYARD_ORGANIZATION_ID ?? "").trim()),
    takeoffAsyncStubEnabled: asyncCfg.stubEnabled,
    takeoffAsyncWorkerEnabled: asyncCfg.workerEnabled,
    takeoffAsyncStartAllowed: asyncCfg.asyncStartAllowed,
  };
}

function readTakeoffAsyncConfigFromEnv() {
  const nodeEnv = String(process.env.NODE_ENV ?? "").trim();
  const stubFlag = String(process.env.TAKEOFF_ASYNC_STUB ?? "").trim() === "1";
  const stubEnabled = stubFlag && nodeEnv !== "production";
  const workerEnabled = String(process.env.TAKEOFF_ASYNC_WORKER_ENABLED ?? "").trim() === "1";
  return {
    stubEnabled,
    workerEnabled,
    asyncStartAllowed: stubEnabled || workerEnabled,
  };
}

/**
 * Async extension of readSafeProviderConfig — adds live Exayard connection diagnostics
 * when TAKEOFF_AI_PROVIDER=exayard. Never returns API key values.
 *
 * @param {{ fetchFn?: typeof fetch }} [options]
 */
export async function readSafeProviderConfigAsync(options = {}) {
  const config = readSafeProviderConfig();
  if (config.activeProvider !== "exayard") {
    return config;
  }
  const exayard = await getExayardSafeDiagnostics({ fetchFn: options.fetchFn });
  return { ...config, exayard };
}
