/**
 * Narrow Quote Intake API client for app-ai-takeoff (Phase 6P.3).
 * Calls only `/api/quote-intake/*`. Org/actor never sent from the client.
 *
 * Pure enough for node tests via injected `fetchImpl` (no network by default in tests).
 */

export const QUOTE_INTAKE_API_PREFIX = "/api/quote-intake";

export class QuoteIntakeClientError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {unknown} [body]
   */
  constructor(message, status, body = null) {
    super(message);
    this.name = "QuoteIntakeClientError";
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {string} path
 * @param {(name: string) => string} [readEnv]
 */
function joinUrl(path, readEnv) {
  const raw = String(
    (readEnv ? readEnv("VITE_BACKEND_URL") : "") || "http://localhost:3001"
  )
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${raw}${p}`;
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @param {(name: string) => string} [readEnv]
 */
async function defaultFetch(path, init, readEnv) {
  const res = await fetch(joinUrl(path, readEnv), init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, ok: res.ok };
}

function authHeaders(token) {
  const t = String(token ?? "").trim();
  if (!t) throw new QuoteIntakeClientError("Sign in required", 401, null);
  return { authorization: `Bearer ${t}` };
}

function throwIfNotOk(result, fallback) {
  if (result.ok) return;
  const body = result.json;
  const msg =
    typeof body === "object" && body && "error" in body
      ? String(/** @type {{ error?: string }} */ (body).error)
      : fallback;
  throw new QuoteIntakeClientError(msg || fallback, result.status, body);
}

/**
 * @param {{
 *   fetchImpl?: (path: string, init?: RequestInit) => Promise<{ status: number, json: unknown, ok: boolean }>,
 *   readEnv?: (name: string) => string
 * }} [deps]
 */
export function createQuoteIntakeApiClient(deps = {}) {
  const fetchImpl =
    deps.fetchImpl ??
    ((path, init) => defaultFetch(path, init, deps.readEnv));

  async function get(path, token) {
    assertQuoteIntakePathAllowed(path);
    return fetchImpl(path, { headers: authHeaders(token) });
  }

  async function post(path, token, body) {
    assertQuoteIntakePathAllowed(path);
    return fetchImpl(path, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(body ?? {})
    });
  }

  return {
    async getConfig(token) {
      const res = await get(`${QUOTE_INTAKE_API_PREFIX}/config`, token);
      throwIfNotOk(res, "Unable to load Quote Intake config");
      const body = /** @type {{ config?: object }} */ (res.json);
      return body?.config ?? {};
    },

    async listCases(token) {
      const res = await get(`${QUOTE_INTAKE_API_PREFIX}/cases`, token);
      throwIfNotOk(res, "Unable to list intake cases");
      const body = /** @type {{ cases?: unknown[] }} */ (res.json);
      return Array.isArray(body?.cases) ? body.cases : [];
    },

    async getCase(token, caseId) {
      const id = encodeURIComponent(String(caseId ?? "").trim());
      const res = await get(`${QUOTE_INTAKE_API_PREFIX}/cases/${id}`, token);
      throwIfNotOk(res, "Unable to load intake case");
      const body = /** @type {{ case?: object }} */ (res.json);
      if (!body?.case) throw new QuoteIntakeClientError("Case not found", 404, body);
      return body.case;
    },

    async listAuditEvents(token, caseId) {
      const id = encodeURIComponent(String(caseId ?? "").trim());
      const res = await get(`${QUOTE_INTAKE_API_PREFIX}/cases/${id}/audit-events`, token);
      throwIfNotOk(res, "Unable to load audit events");
      const body = /** @type {{ events?: unknown[] }} */ (res.json);
      return Array.isArray(body?.events) ? body.events : [];
    },

    async listTakeoffLinks(token, caseId) {
      const id = encodeURIComponent(String(caseId ?? "").trim());
      const res = await get(`${QUOTE_INTAKE_API_PREFIX}/cases/${id}/takeoff-links`, token);
      throwIfNotOk(res, "Unable to load takeoff links");
      const body = /** @type {{ links?: unknown[] }} */ (res.json);
      return Array.isArray(body?.links) ? body.links : [];
    },

    /** Explicit human-triggered Graph preview — never called automatically. */
    async previewMailbox(token) {
      const res = await post(`${QUOTE_INTAKE_API_PREFIX}/mailbox/preview`, token, {});
      throwIfNotOk(res, "Unable to preview mailbox");
      return /** @type {Record<string, unknown>} */ (res.json) ?? {};
    },

    /**
     * Explicit confirmed import of refetch'd messages.
     * @param {string} token
     * @param {{ messageIds: string[], confirm: true }} body
     */
    async importMailboxMessages(token, body) {
      const res = await post(`${QUOTE_INTAKE_API_PREFIX}/mailbox/import`, token, {
        messageIds: body?.messageIds ?? [],
        confirm: body?.confirm === true
      });
      throwIfNotOk(res, "Unable to import mailbox messages");
      return /** @type {Record<string, unknown>} */ (res.json) ?? {};
    }
  };
}

/**
 * @param {unknown} err
 */
export function classifyQuoteIntakeError(err) {
  const status =
    err && typeof err === "object" && "status" in err
      ? Number(/** @type {{ status?: number }} */ (err).status)
      : NaN;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Request failed";

  if (status === 401) return { kind: "unauthorized", message: "Sign in required", status };
  if (status === 403) return { kind: "forbidden", message, status };
  if (status === 404) {
    return { kind: "not_found", message: message || "Quote Intake API unavailable", status };
  }
  if (status === 503 || status >= 500) {
    return {
      kind: "unavailable",
      message: message || "Quote Intake temporarily unavailable",
      status
    };
  }
  if (Number.isFinite(status) && status > 0) {
    return { kind: "error", message, status };
  }
  return { kind: "error", message, status: null };
}

/** Paths this client is allowed to call. */
export const QUOTE_INTAKE_ALLOWED_PATH_PREFIXES = [
  `${QUOTE_INTAKE_API_PREFIX}/config`,
  `${QUOTE_INTAKE_API_PREFIX}/health`,
  `${QUOTE_INTAKE_API_PREFIX}/cases`,
  `${QUOTE_INTAKE_API_PREFIX}/mailbox/preview`,
  `${QUOTE_INTAKE_API_PREFIX}/mailbox/import`
];

export function assertQuoteIntakePathAllowed(path) {
  const p = String(path ?? "");
  const ok = QUOTE_INTAKE_ALLOWED_PATH_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`)
  );
  if (!ok) {
    throw new Error(`Quote Intake client refused non-intake path: ${p}`);
  }
}
