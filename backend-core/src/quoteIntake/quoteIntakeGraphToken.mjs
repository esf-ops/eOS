/**
 * Client-credentials token provider for Quote Intake Graph (Phase 6P.4).
 * In-memory cache only. Never persist tokens. Never log secrets/tokens.
 */

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const EARLY_REFRESH_MS = 60_000;

/**
 * @param {{
 *   credentials: { tenantId: string, clientId: string, clientSecret: string },
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   timeoutMs?: number
 * }} deps
 */
export function createQuoteIntakeGraphTokenProvider(deps) {
  const credentials = deps.credentials;
  if (!credentials?.tenantId || !credentials?.clientId || !credentials?.clientSecret) {
    const err = new Error("Quote Intake Graph is not configured");
    err.code = "graph_not_configured";
    err.statusCode = 503;
    throw err;
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = deps.now ?? Date.now;
  const timeoutMs = Number(deps.timeoutMs) > 0 ? Number(deps.timeoutMs) : 30_000;

  /** @type {{ accessToken: string, expiresAtMs: number } | null} */
  let cache = null;
  /** @type {Promise<string> | null} */
  let inflight = null;

  function tokenUrl() {
    return `https://login.microsoftonline.com/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`;
  }

  async function fetchToken() {
    const body = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
      scope: GRAPH_SCOPE
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(tokenUrl(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal
      });
    } catch (e) {
      const err = new Error("Graph token request failed");
      err.code =
        e?.name === "AbortError" || String(e?.message ?? "").includes("abort")
          ? "graph_timeout"
          : "graph_token_failed";
      err.statusCode = err.code === "graph_timeout" ? 504 : 503;
      throw err;
    } finally {
      clearTimeout(timer);
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok || !json?.access_token) {
      const err = new Error("Graph token request failed");
      err.code = res.status === 401 || res.status === 403 ? "graph_forbidden" : "graph_token_failed";
      err.statusCode = 503;
      // Never attach token response body (may echo errors with sensitive context).
      throw err;
    }

    const expiresInSec = Number(json.expires_in);
    const ttlMs =
      Number.isFinite(expiresInSec) && expiresInSec > 0
        ? expiresInSec * 1000
        : 3600 * 1000;

    cache = {
      accessToken: String(json.access_token),
      expiresAtMs: now() + ttlMs
    };
    return cache.accessToken;
  }

  return {
    scope: GRAPH_SCOPE,
    tokenUrl,
    invalidate() {
      cache = null;
    },
    async getAccessToken() {
      if (cache && cache.expiresAtMs - EARLY_REFRESH_MS > now()) {
        return cache.accessToken;
      }
      if (inflight) return inflight;
      inflight = fetchToken().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    /** Test helper — do not use in production routes. */
    _debugCacheState() {
      return cache
        ? { hasToken: true, expiresAtMs: cache.expiresAtMs }
        : { hasToken: false, expiresAtMs: null };
    }
  };
}
