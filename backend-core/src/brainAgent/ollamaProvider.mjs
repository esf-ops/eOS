/**
 * Ollama chat provider for Brain Agent (server-side only).
 * No DB credentials are ever passed to Ollama.
 */

export function getOllamaConfig(processEnv = process.env) {
  const envGet = (name, fallback = "") => String(processEnv[name] ?? fallback).trim();
  const baseUrl = envGet("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = envGet("OLLAMA_MODEL", "");
  const provider = envGet("AI_PROVIDER", "openai").toLowerCase();
  return {
    enabled: provider === "ollama",
    baseUrl,
    model,
    timeoutMs: Number(envGet("OLLAMA_TIMEOUT_MS", "60000")) || 60000,
  };
}

/**
 * Generate text via Ollama /api/chat. Returns { ok, text, model } or error.
 */
export async function ollamaChat({
  messages,
  model,
  baseUrl,
  timeoutMs = 60000,
  format = null,
  fetchImpl = globalThis.fetch,
}) {
  const cfg = getOllamaConfig();
  const url = `${baseUrl || cfg.baseUrl}/api/chat`;
  const m = model || cfg.model;
  if (!m) {
    return { ok: false, code: "OLLAMA_MODEL_MISSING", error: "OLLAMA_MODEL is not configured" };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs || cfg.timeoutMs);
  try {
    const body = {
      model: m,
      messages,
      stream: false,
    };
    if (format) body.format = format;

    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        code: "OLLAMA_HTTP_ERROR",
        error: data.error || `Ollama HTTP ${res.status}`,
        status: res.status,
      };
    }
    const text = data?.message?.content || data?.response || "";
    return { ok: true, text: String(text), model: m, raw: { done: data.done, total_duration: data.total_duration } };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === "AbortError" ? "OLLAMA_TIMEOUT" : "OLLAMA_UNAVAILABLE",
      error: String(e?.message || e),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ask Ollama for JSON only — used for optional structured planning.
 * Runtime still validates / ignores invalid plans.
 */
export async function ollamaJsonPlan({ system, user, ...opts }) {
  const result = await ollamaChat({
    ...opts,
    format: "json",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  if (!result.ok) return result;
  try {
    const parsed = JSON.parse(result.text);
    return { ok: true, plan: parsed, model: result.model };
  } catch {
    return { ok: false, code: "OLLAMA_JSON_PARSE", error: "Model did not return valid JSON", text: result.text };
  }
}
