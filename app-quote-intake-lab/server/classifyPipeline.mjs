import { geminiJsonGenerate } from "./geminiJsonClient.mjs";
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SYSTEM_PROMPT,
  VERIFICATION_PROMPT_VERSION,
  VERIFICATION_SYSTEM_PROMPT,
  buildExtractionUserMessage,
  buildVerificationUserMessage
} from "./prompts.mjs";
import { validateAndNormalizeClassificationResult } from "./validateClassificationResult.mjs";

export const LIVE_PROVIDER_NAME = "LiveGeminiIntakeIntelligenceProvider";
export const LIVE_PROVIDER_VERSION = "live-gemini-1.0.0";
export const LIVE_PROVIDER_MODE = "live";

/**
 * Two-pass live classification (extraction → optional verification).
 * @param {{ request: object, config: ReturnType<import("./config.mjs").readLabServerConfig>, fetchImpl?: typeof fetch }} args
 */
export async function runLiveClassificationPipeline({ request, config, fetchImpl }) {
  if (!config.liveAiEnabled) {
    throw Object.assign(new Error("Live AI is disabled (QIL_LIVE_AI_ENABLED=false)."), {
      statusCode: 503,
      code: "LIVE_DISABLED"
    });
  }
  if (config.provider !== "gemini") {
    throw Object.assign(new Error(`Unsupported QIL_AI_PROVIDER: ${config.provider}`), {
      statusCode: 503,
      code: "UNSUPPORTED_PROVIDER"
    });
  }
  if (!config._apiKey) {
    throw Object.assign(new Error("No Gemini API key configured for the lab server."), {
      statusCode: 503,
      code: "MISSING_API_KEY"
    });
  }
  if (!config.model) {
    throw Object.assign(new Error("QIL_AI_MODEL must be set — model is not guessed."), {
      statusCode: 503,
      code: "MISSING_MODEL"
    });
  }

  const startedAt = new Date().toISOString();
  const passMeta = {
    extraction: null,
    verification: null
  };

  const extract = await geminiJsonGenerate({
    apiKey: config._apiKey,
    modelName: config.model,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userMessage: buildExtractionUserMessage(request),
    timeoutMs: config.timeoutMs,
    passLabel: "extraction",
    fetchImpl
  });
  passMeta.extraction = {
    model: extract.modelUsed,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    latencyMs: extract.latencyMs,
    usage: extract.usage,
    providerRequestId: extract.providerRequestId,
    parseError: extract.parseError
  };

  if (extract.parseError || !extract.parsed) {
    throw Object.assign(new Error("Extraction pass returned invalid JSON."), {
      statusCode: 502,
      code: "INVALID_JSON",
      details: { parseError: extract.parseError }
    });
  }

  let proposed = extract.parsed;
  let verificationRan = false;

  if (config.verificationEnabled) {
    const verifyModel = config.verificationModel || config.model;
    const verify = await geminiJsonGenerate({
      apiKey: config._apiKey,
      modelName: verifyModel,
      systemPrompt: VERIFICATION_SYSTEM_PROMPT,
      userMessage: buildVerificationUserMessage(request, proposed),
      timeoutMs: config.timeoutMs,
      passLabel: "verification",
      fetchImpl
    });
    passMeta.verification = {
      model: verify.modelUsed,
      promptVersion: VERIFICATION_PROMPT_VERSION,
      latencyMs: verify.latencyMs,
      usage: verify.usage,
      providerRequestId: verify.providerRequestId,
      parseError: verify.parseError
    };
    if (verify.parseError || !verify.parsed) {
      // Keep extraction; note verification failure
      passMeta.verification.failed = true;
    } else {
      proposed = verify.parsed;
      verificationRan = true;
    }
  }

  const { result, validationWarnings } = validateAndNormalizeClassificationResult(proposed, request, {
    providerName: LIVE_PROVIDER_NAME,
    providerMode: LIVE_PROVIDER_MODE,
    providerVersion: LIVE_PROVIDER_VERSION
  });

  result.verification = {
    ran: verificationRan,
    enabled: config.verificationEnabled,
    extractionPromptVersion: EXTRACTION_PROMPT_VERSION,
    verificationPromptVersion: VERIFICATION_PROMPT_VERSION,
    extractionModel: passMeta.extraction?.model ?? null,
    verificationModel: passMeta.verification?.model ?? null,
    extractionRequestId: passMeta.extraction?.providerRequestId ?? null,
    verificationRequestId: passMeta.verification?.providerRequestId ?? null,
    extractionLatencyMs: passMeta.extraction?.latencyMs ?? null,
    verificationLatencyMs: passMeta.verification?.latencyMs ?? null,
    extractionUsage: passMeta.extraction?.usage ?? null,
    verificationUsage: passMeta.verification?.usage ?? null,
    validationWarnings
  };

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    result,
    passMeta,
    validationWarnings
  };
}
