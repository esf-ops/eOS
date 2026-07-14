/**
 * Lab intelligence server configuration (Phase 3.1).
 * Never logs credential values.
 */

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function envInt(name, defaultValue) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

/**
 * Resolve Gemini API key for the lab server.
 * Primary: QIL_GEMINI_API_KEY
 * Optional shared reuse: only when QIL_ALLOW_SHARED_GEMINI_KEY=true, fall back to GEMINI_API_KEY.
 * Never prints the value.
 */
export function resolveGeminiApiKey() {
  const labKey = String(process.env.QIL_GEMINI_API_KEY ?? "").trim();
  if (labKey) return { apiKey: labKey, source: "QIL_GEMINI_API_KEY" };
  if (envBool("QIL_ALLOW_SHARED_GEMINI_KEY", false)) {
    const shared = String(process.env.GEMINI_API_KEY ?? "").trim();
    if (shared) return { apiKey: shared, source: "GEMINI_API_KEY (explicit shared opt-in)" };
  }
  return { apiKey: null, source: null };
}

export function readLabServerConfig() {
  const keyInfo = resolveGeminiApiKey();
  const model = String(process.env.QIL_AI_MODEL ?? "").trim();
  const verificationModel =
    String(process.env.QIL_AI_VERIFICATION_MODEL ?? "").trim() || model;

  const takeoffModel = String(process.env.QIL_TAKEOFF_MODEL ?? "").trim();
  const takeoffVerificationModel =
    String(process.env.QIL_TAKEOFF_VERIFICATION_MODEL ?? "").trim() || takeoffModel;
  const takeoffMaxAttachmentBytes = envInt("QIL_TAKEOFF_MAX_ATTACHMENT_BYTES", 4_000_000);
  // JSON + base64 overhead (~4/3) + metadata envelope headroom
  const takeoffMaxBodyBytes = Math.min(
    envInt("QIL_TAKEOFF_MAX_BODY_BYTES", Math.ceil(takeoffMaxAttachmentBytes * 1.4) + 64_000),
    12_000_000
  );

  return {
    liveAiEnabled: envBool("QIL_LIVE_AI_ENABLED", false),
    provider: String(process.env.QIL_AI_PROVIDER ?? "gemini").trim() || "gemini",
    model,
    verificationModel,
    verificationEnabled: envBool("QIL_AI_VERIFICATION_ENABLED", true),
    timeoutMs: envInt("QIL_AI_TIMEOUT_MS", 60_000),
    maxConcurrency: envInt("QIL_AI_MAX_CONCURRENCY", 2),
    /** Classification endpoint body limit — do not raise for takeoff. */
    maxBodyBytes: envInt("QIL_AI_MAX_BODY_BYTES", 256_000),
    allowedOrigin: String(process.env.QIL_ALLOWED_ORIGIN ?? "http://127.0.0.1:5196").trim(),
    labRequestToken: String(process.env.QIL_LAB_REQUEST_TOKEN ?? "").trim(),
    host: "127.0.0.1",
    port: envInt("QIL_LIVE_SERVER_PORT", 5197),
    hasApiKey: Boolean(keyInfo.apiKey),
    apiKeySource: keyInfo.source,
    /** Only for server-side use — never serialize into HTTP responses */
    _apiKey: keyInfo.apiKey,
    takeoff: {
      liveEnabled: envBool("QIL_LIVE_TAKEOFF_ENABLED", false),
      provider: String(process.env.QIL_TAKEOFF_PROVIDER ?? "gemini").trim() || "gemini",
      model: takeoffModel,
      verificationModel: takeoffVerificationModel,
      timeoutMs: envInt("QIL_TAKEOFF_TIMEOUT_MS", 90_000),
      maxAttachmentBytes: takeoffMaxAttachmentBytes,
      maxBodyBytes: takeoffMaxBodyBytes,
      maxPages: envInt("QIL_TAKEOFF_MAX_PAGES", 20),
      maxConcurrency: envInt("QIL_TAKEOFF_MAX_CONCURRENCY", 1)
    }
  };
}

export function readSafeLabServerConfig() {
  const c = readLabServerConfig();
  return {
    liveAiEnabled: c.liveAiEnabled,
    provider: c.provider,
    modelConfigured: Boolean(c.model),
    verificationEnabled: c.verificationEnabled,
    verificationModelConfigured: Boolean(c.verificationModel),
    timeoutMs: c.timeoutMs,
    maxConcurrency: c.maxConcurrency,
    maxBodyBytes: c.maxBodyBytes,
    allowedOrigin: c.allowedOrigin,
    host: c.host,
    port: c.port,
    hasApiKey: c.hasApiKey,
    apiKeySource: c.apiKeySource,
    labRequestTokenConfigured: Boolean(c.labRequestToken),
    takeoff: {
      liveEnabled: c.takeoff.liveEnabled,
      modelConfigured: Boolean(c.takeoff.model),
      verificationModelConfigured: Boolean(c.takeoff.verificationModel),
      timeoutMs: c.takeoff.timeoutMs,
      maxAttachmentBytes: c.takeoff.maxAttachmentBytes,
      maxBodyBytes: c.takeoff.maxBodyBytes,
      maxPages: c.takeoff.maxPages,
      maxConcurrency: c.takeoff.maxConcurrency,
      provider: c.takeoff.provider
    }
  };
}
