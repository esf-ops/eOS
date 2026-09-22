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
 */
export function getAIProviderConfig(): AIProviderConfig {
  const apiKey = env("OPENAI_API_KEY");
  const forcedMock = env("AI_MOCK_MODE") === "1" || env("AI_MOCK_MODE").toLowerCase() === "true";
  const providerEnv = (env("AI_PROVIDER") || "openai").toLowerCase();
  const inProd = isProductionRuntime();

  // Auto mock when no key — never silently mock in production unless explicitly forced
  // and AI_ALLOW_MOCK_PRODUCTION=1 (ops escape hatch for demos).
  const allowMockInProduction = env("AI_ALLOW_MOCK_PRODUCTION") === "1";
  const shouldMock =
    forcedMock ||
    !apiKey ||
    providerEnv === "mock";

  if (shouldMock && inProd && !allowMockInProduction && !forcedMock) {
    // Production without key and without explicit mock force → treat as unavailable mock flag
    // Generation layer will still use mock only when forcedMock; otherwise error.
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
  };
}
