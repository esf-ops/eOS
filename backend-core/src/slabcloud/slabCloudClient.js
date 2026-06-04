/**
 * slabCloudClient — read-only HTTP helpers for the SlabCloud inventory POC.
 *
 * SCOPE / SAFETY (read this before extending):
 *   - READ ONLY. GET requests only (plus optional HEAD for image probing).
 *   - NO cookies, NO PHPSESSID, NO Authorization headers, NO private tokens.
 *   - NO login/session automation, NO HTML scraping — JSON endpoints only.
 *   - NEVER writes back to SlabCloud / Slabsmith and NEVER touches Supabase.
 *   - The company code (observed: "kbyd") is configurable, never assumed to be
 *     the same as the public inventory slug (/inventory/esf/).
 *
 * Network functions accept an injectable `fetchImpl` so tests can run without
 * touching the network. Uses Node 18+ global fetch by default.
 */

export const DEFAULT_SLABCLOUD_BASE_URL = "https://slabcloud.com";
export const DEFAULT_SLABCLOUD_COMPANY_CODE = "kbyd";
export const DEFAULT_SLABCLOUD_TYPE = "Slab";
export const DEFAULT_USER_AGENT =
  "eliteOS-SlabCloud-POC/0.1 (+read-only inventory dry-run)";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 600;

/** Header names that MUST NEVER appear on a request from this read-only client. */
const FORBIDDEN_HEADER_NAMES = ["cookie", "authorization", "x-auth-token", "set-cookie"];

/**
 * Build the (intentionally minimal) request headers for read-only access.
 * Explicitly contains no cookies, no Authorization, no session tokens.
 */
export function buildRequestHeaders({ userAgent = DEFAULT_USER_AGENT } = {}) {
  return {
    Accept: "application/json",
    "User-Agent": userAgent,
  };
}

/**
 * Defensive guard: throw if any forbidden auth/cookie header is present.
 * Keeps accidental credential leakage out of the POC.
 */
export function assertNoAuthHeaders(headers = {}) {
  for (const key of Object.keys(headers)) {
    if (FORBIDDEN_HEADER_NAMES.includes(key.toLowerCase())) {
      throw new Error(
        `slabCloudClient refuses to send forbidden header "${key}" (read-only, no auth/cookies).`
      );
    }
  }
  return true;
}

function trimBase(baseUrl) {
  return String(baseUrl || DEFAULT_SLABCLOUD_BASE_URL).replace(/\/+$/, "");
}

// ── URL builders (pure) ──────────────────────────────────────────────────────

export function buildMaterialsUrl({
  baseUrl = DEFAULT_SLABCLOUD_BASE_URL,
  companyCode = DEFAULT_SLABCLOUD_COMPANY_CODE,
} = {}) {
  return `${trimBase(baseUrl)}/api/materials/${encodeURIComponent(companyCode)}`;
}

export function buildSlabSummaryUrl({
  baseUrl = DEFAULT_SLABCLOUD_BASE_URL,
  companyCode = DEFAULT_SLABCLOUD_COMPANY_CODE,
  type = DEFAULT_SLABCLOUD_TYPE,
  edges = true,
} = {}) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (edges) params.set("edges", "true");
  return `${trimBase(baseUrl)}/api/slabs/${encodeURIComponent(companyCode)}?${params.toString()}`;
}

export function buildSlabDetailUrl({
  baseUrl = DEFAULT_SLABCLOUD_BASE_URL,
  companyCode = DEFAULT_SLABCLOUD_COMPANY_CODE,
  name,
  type = DEFAULT_SLABCLOUD_TYPE,
  edges = true,
} = {}) {
  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (type) params.set("type", type);
  if (edges) params.set("edges", "true");
  return `${trimBase(baseUrl)}/api/slabs/${encodeURIComponent(companyCode)}?${params.toString()}`;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET a URL and parse JSON, with timeout + simple retry for transient failures.
 *
 * Retries on network errors, timeouts, HTTP 429, and HTTP 5xx.
 * Does NOT retry on 4xx (other than 429) — those are treated as terminal.
 */
export async function fetchJson(
  url,
  {
    headers = buildRequestHeaders(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    fetchImpl = globalThis.fetch,
  } = {}
) {
  assertNoAuthHeaders(headers);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetchJson: no fetch implementation available (Node >=18 required).");
  }

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Invalid JSON response from ${url}`);
        }
      }

      // Non-OK: decide retry vs terminal.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
      } else {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr =
        err && err.name === "AbortError"
          ? new Error(`Timeout after ${timeoutMs}ms for ${url}`)
          : err;
    }

    if (attempt < retries) {
      await delay(retryDelayMs * (attempt + 1));
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

/**
 * HEAD-probe an image URL. Read-only and best-effort: returns a status string,
 * never throws. Used only when image verification is explicitly enabled.
 *   "ok" | "missing" | "error"
 */
export async function probeImage(
  url,
  {
    headers = buildRequestHeaders(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = {}
) {
  if (!url) return "error";
  assertNoAuthHeaders(headers);
  if (typeof fetchImpl !== "function") return "error";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "HEAD",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return "ok";
    if (res.status === 404 || res.status === 410) return "missing";
    return "error";
  } catch {
    clearTimeout(timer);
    return "error";
  }
}

/**
 * Run an async mapper over items with a bounded concurrency.
 * Order of results matches input order. Used to keep detail/image fetches gentle.
 */
export async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(concurrency) || 1);
  const results = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(list[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, list.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── High-level read-only fetchers ────────────────────────────────────────────

export function buildClientConfig(overrides = {}) {
  return {
    baseUrl: overrides.baseUrl || DEFAULT_SLABCLOUD_BASE_URL,
    companyCode: overrides.companyCode || DEFAULT_SLABCLOUD_COMPANY_CODE,
    type: overrides.type || DEFAULT_SLABCLOUD_TYPE,
    edges: overrides.edges !== undefined ? overrides.edges : true,
    timeoutMs: overrides.timeoutMs || DEFAULT_TIMEOUT_MS,
    retries: overrides.retries !== undefined ? overrides.retries : DEFAULT_RETRIES,
    userAgent: overrides.userAgent || DEFAULT_USER_AGENT,
    fetchImpl: overrides.fetchImpl || globalThis.fetch,
  };
}

function ensureArray(payload) {
  if (Array.isArray(payload)) return payload;
  // Some JSON APIs wrap rows under a key; be tolerant but predictable.
  if (payload && typeof payload === "object" && Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
}

export async function fetchMaterials(config = buildClientConfig()) {
  const url = buildMaterialsUrl(config);
  const headers = buildRequestHeaders({ userAgent: config.userAgent });
  const payload = await fetchJson(url, {
    headers,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    fetchImpl: config.fetchImpl,
  });
  return ensureArray(payload);
}

export async function fetchSlabSummary(config = buildClientConfig()) {
  const url = buildSlabSummaryUrl(config);
  const headers = buildRequestHeaders({ userAgent: config.userAgent });
  const payload = await fetchJson(url, {
    headers,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    fetchImpl: config.fetchImpl,
  });
  return ensureArray(payload);
}

export async function fetchSlabDetail(name, config = buildClientConfig()) {
  const url = buildSlabDetailUrl({ ...config, name });
  const headers = buildRequestHeaders({ userAgent: config.userAgent });
  const payload = await fetchJson(url, {
    headers,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    fetchImpl: config.fetchImpl,
  });
  return ensureArray(payload);
}
