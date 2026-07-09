/**
 * visualizerRenderProvider — provider-neutral countertop render interface + factory.
 *
 * Mirrors takeoffAiProvider.mjs patterns without coupling to takeoff routes or tables.
 *
 * Environment variables:
 *   VISUALIZER_RENDER_ENABLED=1
 *   VISUALIZER_RENDER_PROVIDER=gemini|openai
 *   VISUALIZER_RENDER_MODEL=<provider-specific model>
 *   VISUALIZER_MAX_UPLOAD_MB=10
 *
 * Provider keys (reuse existing server-side keys when possible):
 *   GEMINI_API_KEY
 *   OPENAI_API_KEY
 */
import { geminiVisualizerRenderProvider } from "./geminiVisualizerRenderProvider.mjs";
import { openAiVisualizerRenderProvider } from "./openAiVisualizerRenderProvider.mjs";

/** @typedef {{
 *   roomBuffer: Buffer,
 *   roomMimeType: string,
 *   roomFilename: string,
 *   materialBuffer: Buffer,
 *   materialMimeType: string,
 *   materialName: string|null,
 *   userInstruction: string|null,
 *   modelName: string,
 *   apiKey: string|null,
 * }} VisualizerRenderInput */

/** @typedef {{
 *   renderedBuffer: Buffer,
 *   renderedDataUrl: string,
 *   renderedMimeType: string,
 *   modelUsed: string,
 *   provider: string,
 * }} VisualizerRenderOutput */

export const SUPPORTED_VISUALIZER_PROVIDERS = Object.freeze(["gemini", "openai"]);

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-preview-image-generation";
const DEFAULT_OPENAI_MODEL = "gpt-image-1";

/**
 * @param {string} providerName
 * @returns {(input: VisualizerRenderInput) => Promise<VisualizerRenderOutput>}
 */
export function getRenderProvider(providerName) {
  switch (String(providerName ?? "").trim().toLowerCase()) {
    case "gemini":
      return geminiVisualizerRenderProvider;
    case "openai":
      return openAiVisualizerRenderProvider;
    default:
      throw Object.assign(
        new Error(
          `Unsupported visualizer provider: "${providerName}". Supported: ${SUPPORTED_VISUALIZER_PROVIDERS.join(", ")}.`,
        ),
        { statusCode: 503 },
      );
  }
}

/**
 * @returns {{
 *   enabled: boolean,
 *   providerName: string,
 *   modelName: string,
 *   apiKey: string|null,
 *   maxUploadBytes: number,
 * }}
 */
export function readRenderConfig() {
  const providerName = String(process.env.VISUALIZER_RENDER_PROVIDER ?? "gemini").trim() || "gemini";
  const maxUploadMb = Number.parseInt(String(process.env.VISUALIZER_MAX_UPLOAD_MB ?? "10"), 10);
  const maxUploadBytes = Number.isFinite(maxUploadMb) && maxUploadMb > 0 ? maxUploadMb * 1024 * 1024 : 10 * 1024 * 1024;

  let modelName;
  let apiKey;
  if (providerName === "openai") {
    modelName = String(process.env.VISUALIZER_RENDER_MODEL ?? DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
    apiKey = String(process.env.OPENAI_API_KEY ?? "").trim() || null;
  } else {
    modelName = String(process.env.VISUALIZER_RENDER_MODEL ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
    apiKey = String(process.env.GEMINI_API_KEY ?? "").trim() || null;
  }

  return {
    enabled: String(process.env.VISUALIZER_RENDER_ENABLED ?? "").trim() === "1",
    providerName,
    modelName,
    apiKey,
    maxUploadBytes,
  };
}

/**
 * Safe config for GET /api/visualizer/config — never includes API keys.
 * @returns {{
 *   visualizerRenderEnabled: boolean,
 *   activeProvider: string,
 *   model: string,
 *   maxUploadMb: number,
 *   hasGeminiKey: boolean,
 *   hasOpenAiKey: boolean,
 *   supportedProviders: string[],
 * }}
 */
export function readSafeRenderConfig() {
  const cfg = readRenderConfig();
  return {
    visualizerRenderEnabled: cfg.enabled,
    activeProvider: cfg.providerName,
    model: cfg.modelName,
    maxUploadMb: Math.round(cfg.maxUploadBytes / (1024 * 1024)),
    hasGeminiKey: Boolean(String(process.env.GEMINI_API_KEY ?? "").trim()),
    hasOpenAiKey: Boolean(String(process.env.OPENAI_API_KEY ?? "").trim()),
    supportedProviders: [...SUPPORTED_VISUALIZER_PROVIDERS],
  };
}

/**
 * @param {VisualizerRenderInput} input
 * @returns {Promise<VisualizerRenderOutput>}
 */
export async function runVisualizerRender(input) {
  const cfg = readRenderConfig();
  if (!cfg.enabled) {
    throw Object.assign(new Error("Visualizer render is disabled. Set VISUALIZER_RENDER_ENABLED=1."), {
      statusCode: 503,
    });
  }
  const provider = getRenderProvider(cfg.providerName);
  return provider({
    ...input,
    modelName: input.modelName || cfg.modelName,
    apiKey: input.apiKey ?? cfg.apiKey,
  });
}
