/**
 * exayardClient — backend-only HTTP client for the Exayard takeoff platform API.
 *
 * Exayard is a takeoff/estimating platform (projects, files, assessments, analysis,
 * estimates). This pass wires connection diagnostics only — no plan upload automation yet.
 *
 * OpenAPI: https://api.exayard.com/v1/openapi.json
 * Auth: Authorization: Bearer <EXAYARD_API_KEY>
 *
 * Environment variables (server-side only — never client-exposed):
 *   EXAYARD_API_BASE_URL   default https://api.exayard.com/v1
 *   EXAYARD_API_KEY        Bearer token (never logged)
 *   EXAYARD_ORGANIZATION_ID  Exayard org id for future takeoff routes
 */

export const DEFAULT_EXAYARD_API_BASE_URL = "https://api.exayard.com/v1";

/**
 * @returns {{ baseUrl: string, apiKey: string|null, organizationId: string|null }}
 */
export function readExayardConfig() {
  const rawBase = String(process.env.EXAYARD_API_BASE_URL ?? DEFAULT_EXAYARD_API_BASE_URL).trim();
  const baseUrl = (rawBase || DEFAULT_EXAYARD_API_BASE_URL).replace(/\/+$/, "");
  const apiKey = String(process.env.EXAYARD_API_KEY ?? "").trim() || null;
  const organizationId = String(process.env.EXAYARD_ORGANIZATION_ID ?? "").trim() || null;
  return { baseUrl, apiKey, organizationId };
}

/**
 * @param {string} message
 * @param {{ statusCode?: number, code?: string }} [extra]
 */
export function exayardSetupError(message, extra = {}) {
  const err = new Error(message);
  err.name = "ExayardSetupError";
  err.statusCode = extra.statusCode ?? 503;
  if (extra.code) err.code = extra.code;
  return err;
}

/**
 * Parse RFC 7807 application/problem+json error bodies from Exayard.
 *
 * @param {string} text
 * @param {string|null|undefined} contentType
 * @returns {{
 *   type?: string,
 *   title?: string,
 *   status?: number,
 *   detail?: string,
 *   code?: string,
 *   request_id?: string,
 * }|null}
 */
export function parseExayardProblemJson(text, contentType) {
  const ct = String(contentType ?? "").toLowerCase();
  if (!ct.includes("problem+json")) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Build a safe error message from an Exayard HTTP response (never includes API key).
 *
 * @param {number} status
 * @param {string} text
 * @param {string|null|undefined} contentType
 */
export function formatExayardHttpError(status, text, contentType) {
  const problem = parseExayardProblemJson(text, contentType);
  if (problem) {
    const parts = [
      problem.title || `Exayard API error ${status}`,
      problem.detail,
      problem.code ? `(code: ${problem.code})` : null,
      problem.request_id ? `(request_id: ${problem.request_id})` : null,
    ].filter(Boolean);
    return parts.join(" — ");
  }
  const snippet = String(text ?? "").trim().slice(0, 200);
  return snippet ? `Exayard API error ${status}: ${snippet}` : `Exayard API error ${status}`;
}

/**
 * @param {Headers|{ get?: (name: string) => string|null }} headers
 */
export function readExayardRateLimitHeaders(headers) {
  const get = typeof headers?.get === "function" ? (n) => headers.get(n) : () => null;
  const rateLimit = get("RateLimit") ?? get("ratelimit");
  const rateLimitPolicy = get("RateLimit-Policy") ?? get("ratelimit-policy");
  return {
    rateLimit: rateLimit ?? null,
    rateLimitPolicy: rateLimitPolicy ?? null,
  };
}

/**
 * Low-level Exayard API request. API key is sent via Authorization header only — never logged.
 *
 * @param {string} path  e.g. "/me" (appended to configured base URL)
 * @param {{
 *   method?: string,
 *   body?: unknown,
 *   fetchFn?: typeof fetch,
 *   headers?: Record<string, string>,
 * }} [options]
 * @returns {Promise<{ ok: true, status: number, data: unknown, rateLimit: string|null, rateLimitPolicy: string|null }>}
 */
export async function exayardRequest(path, options = {}) {
  const { baseUrl, apiKey } = readExayardConfig();
  if (!apiKey) {
    throw exayardSetupError(
      "EXAYARD_API_KEY is not configured. Set it in backend-core server environment.",
      { code: "missing_api_key" }
    );
  }

  const fetchFn = options.fetchFn ?? fetch;
  const method = String(options.method ?? "GET").toUpperCase();
  const relPath = String(path ?? "").startsWith("/") ? String(path) : `/${path}`;
  const url = `${baseUrl}${relPath}`;

  /** @type {Record<string, string>} */
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(options.headers ?? {}),
  };

  /** @type {RequestInit} */
  const init = { method, headers };
  if (options.body !== undefined && options.body !== null) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const res = await fetchFn(url, init);
  const text = await res.text();
  const contentType = res.headers?.get?.("content-type") ?? null;
  const { rateLimit, rateLimitPolicy } = readExayardRateLimitHeaders(res.headers);

  if (!res.ok) {
    const message = formatExayardHttpError(res.status, text, contentType);
    const err = new Error(message);
    err.name = "ExayardApiError";
    err.statusCode = res.status;
    err.problem = parseExayardProblemJson(text, contentType);
    err.rateLimit = rateLimit;
    err.rateLimitPolicy = rateLimitPolicy;
    throw err;
  }

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { ok: true, status: res.status, data, rateLimit, rateLimitPolicy };
}

/**
 * GET /me — verify API key and return caller profile (OpenAPI Account tag).
 *
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ clerkUserId: string|null, clerkOrgId?: string, tokenType: string, memberships: Array<{ orgId: string, role?: string }> }>}
 */
export async function testExayardConnection(options = {}) {
  const { data } = await exayardRequest("/me", { fetchFn: options.fetchFn });
  return /** @type {any} */ (data);
}

/**
 * Safe diagnostics for GET /api/takeoff/config — never includes API key values.
 *
 * @param {{ fetchFn?: typeof fetch, testConnection?: boolean }} [options]
 */
export async function getExayardSafeDiagnostics(options = {}) {
  const enabled = String(process.env.TAKEOFF_AI_ENABLED ?? "").trim() === "1";
  const { organizationId, apiKey } = readExayardConfig();

  /** @type {Record<string, unknown>} */
  const diagnostics = {
    provider: "exayard",
    enabled,
    organizationIdPresent: Boolean(organizationId),
    apiKeyPresent: Boolean(apiKey),
    authenticated: false,
    tokenType: null,
    membershipsCount: null,
  };

  if (!apiKey) {
    diagnostics.setupError =
      "EXAYARD_API_KEY is not configured. Set it in backend-core server environment.";
    return diagnostics;
  }

  if (!organizationId) {
    diagnostics.setupWarning =
      "EXAYARD_ORGANIZATION_ID is not configured. Connection can be tested, but takeoff routes will require it.";
  }

  const shouldTest = options.testConnection !== false;
  if (!shouldTest) return diagnostics;

  try {
    const me = await testExayardConnection({ fetchFn: options.fetchFn });
    diagnostics.authenticated = true;
    diagnostics.tokenType = typeof me?.tokenType === "string" ? me.tokenType : null;
    diagnostics.membershipsCount = Array.isArray(me?.memberships) ? me.memberships.length : null;
  } catch (e) {
    diagnostics.authenticated = false;
    diagnostics.connectionError = String(e?.message ?? e);
    if (e?.rateLimit) diagnostics.rateLimit = e.rateLimit;
    if (e?.rateLimitPolicy) diagnostics.rateLimitPolicy = e.rateLimitPolicy;
  }

  return diagnostics;
}
