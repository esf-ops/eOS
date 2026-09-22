import { createOpenAI } from "@ai-sdk/openai";
import type { AIProviderConfig, ModelClass } from "./types";

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function isProductionRuntime(): boolean {
  return env("NODE_ENV") === "production" || env("VERCEL_ENV") === "production";
}

/**
 * Resolve AI provider configuration from server env.
 * Never expose API keys to the browser.
 *
 * AI_PROVIDER=openai|ollama|mock
 * OLLAMA_BASE_URL / OLLAMA_MODEL for local models.
 */
export function getAIProviderConfig(): AIProviderConfig {
  const apiKey = env("OPENAI_API_KEY");
  const forcedMock = env("AI_MOCK_MODE") === "1" || env("AI_MOCK_MODE").toLowerCase() === "true";
  const providerEnv = (env("AI_PROVIDER") || "openai").toLowerCase();
  const inProd = isProductionRuntime();
  const ollamaBaseUrl = (env("OLLAMA_BASE_URL") || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const ollamaModel = env("OLLAMA_MODEL");

  const allowMockInProduction = env("AI_ALLOW_MOCK_PRODUCTION") === "1";

  if (providerEnv === "ollama") {
    const model = ollamaModel || env("AI_MODEL_DEFAULT") || "llama3.2";
    return {
      provider: "ollama",
      mockMode: false,
      defaultModel: model,
      fastModel: env("AI_MODEL_FAST") || model,
      reasoningModel: env("AI_MODEL_REASONING") || model,
      hasApiKey: true,
      allowMockInProduction,
      ollamaBaseUrl,
    };
  }

  const mockMode =
    forcedMock ||
    ((!apiKey || providerEnv === "mock") && (!inProd || allowMockInProduction));

  const defaultModel = env("AI_MODEL_DEFAULT") || "gpt-4o-mini";
  const fastModel = env("AI_MODEL_FAST") || defaultModel;
  const reasoningModel = env("AI_MODEL_REASONING") || defaultModel;

  return {
    provider: mockMode ? "mock" : "openai",
    mockMode,
    defaultModel,
    fastModel,
    reasoningModel,
    hasApiKey: Boolean(apiKey),
    allowMockInProduction,
    ollamaBaseUrl,
  };
}

export function getModelIdForClass(modelClass: ModelClass, config = getAIProviderConfig()): string {
  if (modelClass === "reasoning") return config.reasoningModel;
  return config.fastModel;
}

/**
 * Application code should call getAIModel(taskType) rather than hardcoding model IDs.
 */
export function getAIModel(taskType: ModelClass) {
  const config = getAIProviderConfig();
  if (config.mockMode) {
    return { kind: "mock" as const, modelId: getModelIdForClass(taskType, config), config };
  }

  if (config.provider === "ollama") {
    // Ollama OpenAI-compatible HTTP API — no cloud credentials; placeholder key required by SDK.
    const openai = createOpenAI({
      apiKey: "ollama",
      baseURL: `${config.ollamaBaseUrl || "http://127.0.0.1:11434"}/v1`,
    });
    const modelId = getModelIdForClass(taskType, config);
    return {
      kind: "openai" as const,
      model: openai(modelId),
      modelId,
      config,
    };
  }

  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) {
    throw Object.assign(new Error("AI provider is not configured."), {
      code: "AI_UNAVAILABLE",
      status: 503,
    });
  }

  const openai = createOpenAI({ apiKey });
  const modelId = getModelIdForClass(taskType, config);
  return {
    kind: "openai" as const,
    model: openai(modelId),
    modelId,
    config,
  };
}

export function getSafeAIStatus() {
  const config = getAIProviderConfig();
  return {
    provider: config.provider,
    mockMode: config.mockMode,
    hasApiKey: config.hasApiKey,
    fastModel: config.fastModel,
    reasoningModel: config.reasoningModel,
    ollamaBaseUrl: config.provider === "ollama" ? config.ollamaBaseUrl : undefined,
  };
}
