/**
 * exayardClient — backend-only HTTP client for the Exayard takeoff platform API.
 *
 * Exayard is a takeoff/estimating platform (projects, files, assessments, analysis,
 * estimates). Workflow v1: project → file upload → analysis propose/run → poll assessment.
 *
 * OpenAPI: https://api.exayard.com/v1/openapi.json
 * Auth: Authorization: Bearer <EXAYARD_API_KEY>
 *
 * Environment variables (server-side only — never client-exposed):
 *   EXAYARD_API_BASE_URL   default https://api.exayard.com/v1
 *   EXAYARD_API_KEY        Bearer token (never logged)
 *   EXAYARD_ORGANIZATION_ID  Exayard org id for takeoff routes
 *   EXAYARD_POLL_INTERVAL_MS   poll interval (default 3000)
 *   EXAYARD_POLL_TIMEOUT_MS    assessment poll timeout (default 300000)
 *   EXAYARD_PAGES_POLL_TIMEOUT_MS  page-ready poll timeout (default 120000)
 */

export const DEFAULT_EXAYARD_API_BASE_URL = "https://api.exayard.com/v1";

const TERMINAL_ASSESSMENT_STATUSES = new Set([
  "completed", "complete", "succeeded", "success", "failed", "error", "cancelled", "canceled",
]);

/** @param {number} ms */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readExayardPollConfig() {
  const intervalMs = Number(process.env.EXAYARD_POLL_INTERVAL_MS ?? 3000);
  const assessmentTimeoutMs = Number(process.env.EXAYARD_POLL_TIMEOUT_MS ?? 300_000);
  const pagesTimeoutMs = Number(process.env.EXAYARD_PAGES_POLL_TIMEOUT_MS ?? 120_000);
  const initialAssessmentPollTimeoutMs = Number(process.env.EXAYARD_INITIAL_POLL_TIMEOUT_MS ?? 45_000);
  return {
    intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 3000,
    assessmentTimeoutMs: Number.isFinite(assessmentTimeoutMs) && assessmentTimeoutMs > 0 ? assessmentTimeoutMs : 300_000,
    pagesTimeoutMs: Number.isFinite(pagesTimeoutMs) && pagesTimeoutMs > 0 ? pagesTimeoutMs : 120_000,
    initialAssessmentPollTimeoutMs:
      Number.isFinite(initialAssessmentPollTimeoutMs) && initialAssessmentPollTimeoutMs > 0
        ? initialAssessmentPollTimeoutMs
        : 45_000,
  };
}

/**
 * Map RFC 9457 problem codes to operator-friendly messages (never includes secrets).
 *
 * @param {{ problem?: { code?: string, detail?: string }, message?: string, statusCode?: number }} err
 */
export function formatExayardOperatorError(err) {
  const code = err?.problem?.code ?? err?.code ?? null;
  if (code === "insufficient_scope") {
    return "Exayard API key lacks required scope for this operation. Check key permissions in Exayard.";
  }
  if (code === "rate_limited" || err?.statusCode === 429) {
    const rl = err?.rateLimit ? ` (${err.rateLimit})` : "";
    return `Exayard rate limit exceeded${rl}. Retry shortly.`;
  }
  return String(err?.message ?? err ?? "Exayard request failed");
}

/**
 * @param {unknown} workflow
 */
export function buildExayardSafeWorkflowMeta(workflow) {
  if (!workflow || typeof workflow !== "object") {
    return { provider: "exayard" };
  }
  const w = /** @type {Record<string, unknown>} */ (workflow);
  return {
    provider:       "exayard",
    projectId:      w.projectId ?? null,
    fileId:         w.fileId ?? null,
    assessmentId:   w.assessmentId ?? null,
    status:         w.status ?? null,
    pausedStep:     w.pausedStep ?? w.failedStep ?? null,
    startedAt:      w.startedAt ?? null,
    completedAt:    w.completedAt ?? null,
    steps:          Array.isArray(w.steps) ? w.steps : [],
    retryAfterSeconds: w.retryAfterSeconds ?? null,
    retryAfterAt:      w.retryAfterAt ?? null,
    exayardCode:       w.exayardCode ?? null,
    exayardRequestId:  w.exayardRequestId ?? null,
    assessmentStatus:  w.assessmentStatus ?? null,
  };
}

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
  const retryAfterRaw = get("Retry-After") ?? get("retry-after");
  return {
    rateLimit: rateLimit ?? null,
    rateLimitPolicy: rateLimitPolicy ?? null,
    retryAfterRaw: retryAfterRaw ?? null,
  };
}

/**
 * Parse retry delay from RFC 9457 problem body or Retry-After header (seconds).
 *
 * @param {{ problem?: object, retryAfterRaw?: string|null }} err
 */
export function parseExayardRetryAfterSeconds(err) {
  const problem = err?.problem ?? {};
  const candidates = [
    problem.retry_after,
    problem.retryAfterSeconds,
    problem.retryAfter,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  const raw = err?.retryAfterRaw ?? null;
  if (raw != null) {
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum >= 0) return asNum;
    const asDate = Date.parse(String(raw));
    if (Number.isFinite(asDate)) {
      return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
    }
  }
  return null;
}

/** @param {unknown} err */
export function isExayardRateLimitedError(err) {
  return (
    err?.statusCode === 429 ||
    err?.code === "rate_limited" ||
    err?.problem?.code === "rate_limited"
  );
}

/**
 * @param {Error & { problem?: object, retryAfterRaw?: string|null, statusCode?: number, code?: string }} err
 */
export function enrichExayardRateLimitError(err) {
  if (!isExayardRateLimitedError(err)) return err;
  const retryAfterSeconds = parseExayardRetryAfterSeconds(err) ?? 60;
  err.code = err.code ?? err.problem?.code ?? "rate_limited";
  err.retryAfterSeconds = retryAfterSeconds;
  err.retryAfterAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
  err.requestId = err.problem?.request_id ?? err.requestId ?? null;
  err.name = "ExayardRateLimitedError";
  return err;
}

/**
 * Safe subset of quote_takeoff_jobs.metadata.exayard for API responses.
 *
 * @param {unknown} metadata
 */
export function pickSafeExayardJobMetadata(metadata) {
  const ex = metadata && typeof metadata === "object" ? metadata.exayard : null;
  if (!ex || typeof ex !== "object") return null;
  return {
    exayard: {
      provider:           "exayard",
      status:             ex.status ?? null,
      pausedStep:         ex.pausedStep ?? ex.failedStep ?? null,
      projectId:          ex.projectId ?? null,
      fileId:             ex.fileId ?? null,
      assessmentId:       ex.assessmentId ?? null,
      retryAfterSeconds:  ex.retryAfterSeconds ?? null,
      retryAfterAt:       ex.retryAfterAt ?? null,
      exayardCode:        ex.exayardCode ?? null,
      exayardRequestId:   ex.exayardRequestId ?? null,
      updatedAt:          ex.updatedAt ?? null,
    },
  };
}

/**
 * Low-level Exayard API request (single attempt). API key via Authorization header only.
 *
 * @param {string} path
 * @param {{
 *   method?: string,
 *   body?: unknown,
 *   fetchFn?: typeof fetch,
 *   headers?: Record<string, string>,
 * }} [options]
 */
async function exayardRequestOnce(path, options = {}) {
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
  const { rateLimit, rateLimitPolicy, retryAfterRaw } = readExayardRateLimitHeaders(res.headers);

  if (!res.ok) {
    const message = formatExayardHttpError(res.status, text, contentType);
    const err = new Error(message);
    err.name = "ExayardApiError";
    err.statusCode = res.status;
    err.problem = parseExayardProblemJson(text, contentType);
    err.code = err.problem?.code ?? null;
    err.rateLimit = rateLimit;
    err.rateLimitPolicy = rateLimitPolicy;
    err.retryAfterRaw = retryAfterRaw;
    enrichExayardRateLimitError(err);
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
 * Exayard API request with rate-limit retries (429 / code rate_limited).
 *
 * @param {string} path  e.g. "/me" (appended to configured base URL)
 * @param {{
 *   method?: string,
 *   body?: unknown,
 *   fetchFn?: typeof fetch,
 *   headers?: Record<string, string>,
 *   maxRetries?: number,
 *   retryOnRateLimit?: boolean,
 * }} [options]
 */
export async function exayardRequest(path, options = {}) {
  const maxRetries = options.maxRetries ?? 0;
  const retryOnRateLimit = options.retryOnRateLimit === true;
  let attempt = 0;
  while (true) {
    try {
      return await exayardRequestOnce(path, options);
    } catch (err) {
      const retryable =
        retryOnRateLimit &&
        isExayardRateLimitedError(err);
      if (!retryable || attempt >= maxRetries) throw err;
      attempt += 1;
      const waitSec = err.retryAfterSeconds ?? Math.min(30, 2 ** attempt);
      await sleep(Math.min(30_000, Math.max(1000, waitSec * 1000)));
    }
  }
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

const EXAYARD_ORG_SETUP_WARNING =
  "Configured Exayard organization ID is missing or not in memberships.";

/**
 * Parse /me memberships into org IDs and optional name/slug fields (OpenAPI + extras).
 *
 * @param {unknown} me
 */
export function parseExayardMemberships(me) {
  const memberships = Array.isArray(me?.memberships) ? me.memberships : [];
  /** @type {string[]} */
  const membershipOrganizationIds = [];
  /** @type {Array<{ orgId: string, role: string|null, name: string|null, slug: string|null }>} */
  const membershipOrganizations = [];

  for (const m of memberships) {
    const orgId = String(m?.orgId ?? m?.organizationId ?? "").trim();
    if (!orgId) continue;
    membershipOrganizationIds.push(orgId);
    membershipOrganizations.push({
      orgId,
      role: typeof m?.role === "string" ? m.role : null,
      name:
        typeof m?.name === "string" ? m.name
        : typeof m?.organizationName === "string" ? m.organizationName
        : typeof m?.displayName === "string" ? m.displayName
        : null,
      slug:
        typeof m?.slug === "string" ? m.slug
        : typeof m?.organizationSlug === "string" ? m.organizationSlug
        : null,
    });
  }

  return { membershipOrganizationIds, membershipOrganizations };
}

/**
 * Build org-setup hints for diagnostics (no secrets).
 *
 * @param {{
 *   configuredOrganizationId: string|null,
 *   membershipOrganizationIds: string[],
 * }} params
 */
export function buildExayardOrganizationSetupHints({
  configuredOrganizationId,
  membershipOrganizationIds,
}) {
  const configured = configuredOrganizationId ?? null;
  const ids = membershipOrganizationIds ?? [];
  const hasMemberships = ids.length > 0;
  const configuredOrganizationIdInMemberships =
    Boolean(configured) && hasMemberships && ids.includes(configured);

  /** @type {Record<string, unknown>} */
  const hints = {
    configuredOrganizationId: configured,
    membershipOrganizationIds: ids,
    configuredOrganizationIdInMemberships,
    recommendedOrganizationId: null,
  };

  const missingOrInvalid =
    !configured ||
    (hasMemberships && !configuredOrganizationIdInMemberships);

  if (ids.length === 1 && missingOrInvalid) {
    hints.recommendedOrganizationId = ids[0];
    hints.setupWarning = EXAYARD_ORG_SETUP_WARNING;
  } else if (hasMemberships && configured && !configuredOrganizationIdInMemberships) {
    hints.setupWarning = EXAYARD_ORG_SETUP_WARNING;
  } else if (!configured) {
    hints.setupWarning =
      "EXAYARD_ORGANIZATION_ID is not configured. Set it in backend-core server environment.";
  }

  return hints;
}

/**
 * Assert configured org is present and (when /me memberships exist) included in memberships.
 * Call before POST /projects and other org-scoped Exayard routes.
 *
 * @param {{ fetchFn?: typeof fetch, me?: unknown|null }} [options]
 * @returns {Promise<string>} validated organization ID
 */
export async function validateExayardOrganizationAccess(options = {}) {
  const { organizationId: configured } = readExayardConfig();
  if (!configured) {
    throw exayardSetupError(
      "EXAYARD_ORGANIZATION_ID is not configured. Set it in backend-core server environment.",
      { code: "missing_organization_id" }
    );
  }

  const me = options.me ?? await testExayardConnection({ fetchFn: options.fetchFn });
  const { membershipOrganizationIds } = parseExayardMemberships(me);

  if (
    membershipOrganizationIds.length > 0 &&
    !membershipOrganizationIds.includes(configured)
  ) {
    throw exayardSetupError(
      "Configured Exayard organization ID is not available to this API key. " +
      "Use one of the membershipOrganizationIds from /api/takeoff/config.",
      { code: "invalid_organization_id" }
    );
  }

  return configured;
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
    configuredOrganizationId: organizationId ?? null,
    membershipOrganizationIds: [],
    membershipOrganizations: [],
    configuredOrganizationIdInMemberships: false,
    recommendedOrganizationId: null,
  };

  if (!apiKey) {
    diagnostics.setupError =
      "EXAYARD_API_KEY is not configured. Set it in backend-core server environment.";
    return diagnostics;
  }

  if (!organizationId) {
    diagnostics.setupWarning =
      "EXAYARD_ORGANIZATION_ID is not configured. Set it in backend-core server environment.";
  }

  const shouldTest = options.testConnection !== false;
  if (!shouldTest) return diagnostics;

  try {
    const me = await testExayardConnection({ fetchFn: options.fetchFn });
    diagnostics.authenticated = true;
    diagnostics.tokenType = typeof me?.tokenType === "string" ? me.tokenType : null;

    const { membershipOrganizationIds, membershipOrganizations } = parseExayardMemberships(me);
    diagnostics.membershipsCount = membershipOrganizationIds.length;
    diagnostics.membershipOrganizationIds = membershipOrganizationIds;
    diagnostics.membershipOrganizations = membershipOrganizations;

    const orgHints = buildExayardOrganizationSetupHints({
      configuredOrganizationId: organizationId,
      membershipOrganizationIds,
    });
    diagnostics.configuredOrganizationIdInMemberships =
      orgHints.configuredOrganizationIdInMemberships;
    diagnostics.recommendedOrganizationId = orgHints.recommendedOrganizationId ?? null;

    if (orgHints.setupWarning) {
      diagnostics.setupWarning = orgHints.setupWarning;
    } else {
      delete diagnostics.setupWarning;
    }
  } catch (e) {
    diagnostics.authenticated = false;
    diagnostics.connectionError = String(e?.message ?? e);
    if (e?.rateLimit) diagnostics.rateLimit = e.rateLimit;
    if (e?.rateLimitPolicy) diagnostics.rateLimitPolicy = e.rateLimitPolicy;
  }

  return diagnostics;
}

// ── Workflow v1 API methods (OpenAPI shapes) ─────────────────────────────────

function requireExayardOrganizationId() {
  const { organizationId } = readExayardConfig();
  if (!organizationId) {
    throw exayardSetupError(
      "EXAYARD_ORGANIZATION_ID is not configured. Set it in backend-core server environment.",
      { code: "missing_organization_id" }
    );
  }
  return organizationId;
}

/**
 * POST /projects — OpenAPI: { organizationId, name } → { id, secret }
 *
 * @param {{ name: string, fetchFn?: typeof fetch }} params
 */
export async function createExayardProject({ name, fetchFn }) {
  const organizationId = await validateExayardOrganizationAccess({ fetchFn });
  const { data } = await exayardRequest("/projects", {
    method: "POST",
    body: { organizationId, name },
    fetchFn,
  });
  const projectId = /** @type {{ id?: string }} */ (data)?.id;
  if (!projectId) {
    throw exayardSetupError("Exayard project creation did not return an id.", { code: "invalid_response" });
  }
  return { projectId, secret: /** @type {{ secret?: string }} */ (data)?.secret ?? null };
}

/**
 * GET /projects?organizationId=… — list projects for reuse lookup.
 *
 * @param {{ fetchFn?: typeof fetch }} [options]
 */
export async function listExayardProjects(options = {}) {
  const organizationId = requireExayardOrganizationId();
  const { data } = await exayardRequest(
    `/projects?organizationId=${encodeURIComponent(organizationId)}`,
    { fetchFn: options.fetchFn }
  );
  return Array.isArray(data) ? data : [];
}

/**
 * POST /files — OpenAPI: { projectId, filename, mimeType, fileSize } → presigned upload
 *
 * @param {{ projectId: string, filename: string, mimeType: string, fileSize: number, fetchFn?: typeof fetch }} params
 */
export async function createExayardFileUpload({ projectId, filename, mimeType, fileSize, fetchFn }) {
  const { data } = await exayardRequest("/files", {
    method: "POST",
    body: { projectId, filename, mimeType, fileSize },
    fetchFn,
  });
  const d = /** @type {{ fileId?: string, uploadUrl?: string, r2Key?: string }} */ (data);
  if (!d?.fileId || !d?.uploadUrl || !d?.r2Key) {
    throw exayardSetupError("Exayard file upload init did not return fileId/uploadUrl/r2Key.", {
      code: "invalid_response",
    });
  }
  return {
    fileId:    d.fileId,
    uploadUrl: d.uploadUrl,
    r2Key:     d.r2Key,
    expiresAt: /** @type {{ expiresAt?: number }} */ (data)?.expiresAt ?? null,
    filename:  /** @type {{ filename?: string }} */ (data)?.filename ?? filename,
  };
}

/**
 * PUT presigned upload URL (no Exayard auth header).
 *
 * @param {{ uploadUrl: string, fileBuffer: Buffer, mimeType: string, fetchFn?: typeof fetch }} params
 */
export async function uploadExayardFileBytes({ uploadUrl, fileBuffer, mimeType, fetchFn }) {
  const res = await (fetchFn ?? fetch)(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: fileBuffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Exayard file upload PUT failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 120)}` : ""}`);
    err.name = "ExayardUploadError";
    err.statusCode = res.status >= 400 && res.status < 500 ? res.status : 503;
    throw err;
  }
}

/**
 * POST /files/{id}/confirm — OpenAPI: { r2Key } → 204
 *
 * @param {{ fileId: string, r2Key: string, fetchFn?: typeof fetch }} params
 */
export async function confirmExayardFileUpload({ fileId, r2Key, fetchFn }) {
  await exayardRequest(`/files/${encodeURIComponent(fileId)}/confirm`, {
    method: "POST",
    body: { r2Key },
    fetchFn,
  });
}

/**
 * GET /files/{id}?organizationId=…
 */
export async function getExayardFile({ fileId, fetchFn }) {
  const organizationId = requireExayardOrganizationId();
  const { data } = await exayardRequest(
    `/files/${encodeURIComponent(fileId)}?organizationId=${encodeURIComponent(organizationId)}`,
    { fetchFn }
  );
  return data;
}

/**
 * GET /projects/{id}/pages?organizationId=…
 */
export async function listExayardProjectPages({ projectId, fetchFn }) {
  const organizationId = requireExayardOrganizationId();
  const { data } = await exayardRequest(
    `/projects/${encodeURIComponent(projectId)}/pages?organizationId=${encodeURIComponent(organizationId)}`,
    { fetchFn }
  );
  return Array.isArray(data) ? data.filter(Boolean) : [];
}

/**
 * Poll until pages exist for the uploaded file.
 *
 * @param {{ projectId: string, fileId: string, fetchFn?: typeof fetch, timeoutMs?: number, intervalMs?: number }} params
 */
export async function waitForExayardPagesReady({
  projectId,
  fileId,
  fetchFn,
  timeoutMs,
  intervalMs,
}) {
  const poll = readExayardPollConfig();
  const deadline = Date.now() + (timeoutMs ?? poll.pagesTimeoutMs);
  const waitMs = intervalMs ?? poll.intervalMs;

  while (Date.now() < deadline) {
    const pages = await listExayardProjectPages({ projectId, fetchFn });
    const filePages = pages.filter((p) => {
      const pid = p?.fileId ?? p?.file_id ?? null;
      return pid === fileId;
    });
    if (filePages.length > 0) {
      return filePages;
    }

    const file = await getExayardFile({ fileId, fetchFn });
    const embedded = Array.isArray(file?.pages) ? file.pages : [];
    if (embedded.length > 0) return embedded;

    const uploadStatus = String(file?.uploadStatus ?? "").toLowerCase();
    if (uploadStatus === "failed" || uploadStatus === "error") {
      throw Object.assign(
        new Error(`Exayard file processing failed (uploadStatus=${uploadStatus}).`),
        { statusCode: 422, code: "exayard_file_processing_failed" }
      );
    }

    await sleep(waitMs);
  }

  throw Object.assign(
    new Error("Timed out waiting for Exayard to process uploaded plan pages."),
    { statusCode: 504, code: "exayard_pages_timeout" }
  );
}

/**
 * POST /projects/{id}/analysis/propose — OpenAPI: { organizationId, prompt, fileIds? }
 */
export async function proposeExayardAnalysis({ projectId, prompt, fileIds, fetchFn }) {
  const organizationId = requireExayardOrganizationId();
  const body = { organizationId, prompt };
  if (Array.isArray(fileIds) && fileIds.length > 0) body.fileIds = fileIds;

  const { data } = await exayardRequest(`/projects/${encodeURIComponent(projectId)}/analysis/propose`, {
    method: "POST",
    body,
    fetchFn,
  });
  const d = /** @type {{ pageIds?: string[], elements?: object[] }} */ (data);
  if (!Array.isArray(d?.pageIds) || d.pageIds.length === 0) {
    throw exayardSetupError("Exayard analysis propose did not return pageIds.", { code: "invalid_response" });
  }
  if (!Array.isArray(d?.elements) || d.elements.length === 0) {
    throw exayardSetupError("Exayard analysis propose did not return elements.", { code: "invalid_response" });
  }
  return /** @type {{ projectId: string, pageIds: string[], fileIds?: string[], elements: object[], creditEstimate?: number, prompt?: string }} */ (data);
}

/**
 * POST /projects/{id}/analysis/run — OpenAPI: { organizationId, pageIds, elements } → { assessmentId }
 */
export async function runExayardAnalysis({ projectId, pageIds, elements, layerName, fetchFn }) {
  const organizationId = requireExayardOrganizationId();
  const body = { organizationId, pageIds, elements };
  if (layerName) body.layerName = layerName;

  const { data } = await exayardRequest(`/projects/${encodeURIComponent(projectId)}/analysis/run`, {
    method: "POST",
    body,
    fetchFn,
  });
  const assessmentId = /** @type {{ assessmentId?: string }} */ (data)?.assessmentId;
  if (!assessmentId) {
    throw exayardSetupError("Exayard analysis run did not return assessmentId.", { code: "invalid_response" });
  }
  return { assessmentId, pageIds: /** @type {{ pageIds?: string[] }} */ (data)?.pageIds ?? pageIds };
}

/**
 * GET /assessments/{id} — single check, no retries on rate limit.
 */
export async function getExayardAssessment({ assessmentId, fetchFn }) {
  const { data } = await exayardRequest(`/assessments/${encodeURIComponent(assessmentId)}`, {
    fetchFn,
    maxRetries: 0,
    retryOnRateLimit: false,
  });
  return data;
}

/**
 * Single assessment status check for resume flows (no poll loop).
 *
 * @param {{ assessmentId: string, fetchFn?: typeof fetch }} params
 */
export async function checkExayardAssessmentOnce({ assessmentId, fetchFn }) {
  try {
    const assessment = await getExayardAssessment({ assessmentId, fetchFn });
    const assessmentStatus = String(assessment?.status ?? "").toLowerCase();
    if (assessmentStatus && TERMINAL_ASSESSMENT_STATUSES.has(assessmentStatus)) {
      return { state: "completed", assessment, assessmentStatus };
    }
    return { state: "processing", assessment, assessmentStatus };
  } catch (err) {
    if (isExayardRateLimitedError(err)) {
      return {
        state:             "rate_limited",
        retryAfterSeconds: err.retryAfterSeconds ?? null,
        retryAfterAt:      err.retryAfterAt ?? null,
        exayardCode:       err.code ?? "rate_limited",
        exayardRequestId:  err.requestId ?? err.problem?.request_id ?? null,
      };
    }
    throw err;
  }
}

/**
 * Poll assessment until terminal, rate limit, or timeout.
 * In brief mode (default), rate limit / timeout returns waiting metadata — does not throw.
 *
 * @param {{
 *   assessmentId: string,
 *   fetchFn?: typeof fetch,
 *   timeoutMs?: number,
 *   intervalMs?: number,
 *   mode?: "brief" | "strict",
 * }} params
 */
export async function pollExayardAssessment({
  assessmentId,
  fetchFn,
  timeoutMs,
  intervalMs,
  mode = "brief",
}) {
  const poll = readExayardPollConfig();
  const deadline = Date.now() + (timeoutMs ?? poll.assessmentTimeoutMs);
  const waitMs = intervalMs ?? poll.intervalMs;
  let last = null;

  while (Date.now() < deadline) {
    try {
      last = await getExayardAssessment({ assessmentId, fetchFn });
    } catch (err) {
      if (isExayardRateLimitedError(err)) {
        return {
          completed:         false,
          waiting:           true,
          rateLimited:       true,
          assessmentId,
          pausedStep:        "poll_assessment",
          retryAfterSeconds: err.retryAfterSeconds ?? null,
          retryAfterAt:      err.retryAfterAt ?? null,
          exayardCode:       err.code ?? "rate_limited",
          exayardRequestId:  err.requestId ?? err.problem?.request_id ?? null,
          lastAssessment:    last,
        };
      }
      throw err;
    }

    const status = String(last?.status ?? "").toLowerCase();
    if (status && TERMINAL_ASSESSMENT_STATUSES.has(status)) {
      return { completed: true, assessment: last, assessmentId };
    }

    await sleep(waitMs);
  }

  if (mode === "strict") {
    throw Object.assign(
      new Error(
        `Timed out waiting for Exayard assessment ${assessmentId}` +
        (last?.status ? ` (last status: ${last.status})` : "")
      ),
      { statusCode: 504, code: "exayard_assessment_timeout", lastStatus: last?.status ?? null }
    );
  }

  return {
    completed:      false,
    waiting:        true,
    rateLimited:    false,
    assessmentId,
    pausedStep:     "poll_assessment",
    reason:         "poll_window_exhausted",
    lastAssessment: last,
    assessmentStatus: last?.status ?? null,
  };
}

/**
 * Exayard Takeoff Workflow v1 — one plan/PDF end-to-end.
 *
 * OpenAPI endpoints used:
 *   POST /projects
 *   POST /files → PUT uploadUrl → POST /files/{id}/confirm
 *   GET  /projects/{id}/pages (poll)
 *   POST /projects/{id}/analysis/propose
 *   POST /projects/{id}/analysis/run
 *   GET  /assessments/{id} (poll)
 *
 * @param {{
 *   fileBuffer: Buffer,
 *   mimeType: string,
 *   filename: string,
 *   existingProjectId?: string|null,
 *   takeoffJobId?: string|null,
 *   prompt: string,
 *   fetchFn?: typeof fetch,
 *   pollConfig?: { intervalMs?: number, assessmentTimeoutMs?: number, pagesTimeoutMs?: number },
 * }} params
 */
export async function runExayardTakeoffWorkflow(params) {
  const fetchFn = params.fetchFn ?? fetch;
  const poll = { ...readExayardPollConfig(), ...(params.pollConfig ?? {}) };
  const startedAt = new Date().toISOString();
  /** @type {Array<{ step: string, at: string }>} */
  const steps = [];
  const mark = (step) => steps.push({ step, at: new Date().toISOString() });

  requireExayardOrganizationId();

  let projectId = params.existingProjectId ?? null;
  if (!projectId) {
    mark("create_project");
    const safeName = String(params.filename ?? "plan.pdf").slice(0, 120);
    const suffix = params.takeoffJobId ? ` (${String(params.takeoffJobId).slice(0, 8)})` : "";
    const created = await createExayardProject({
      name: `eliteOS Takeoff Lab — ${safeName}${suffix}`.slice(0, 200),
      fetchFn,
    });
    projectId = created.projectId;
  } else {
    mark("reuse_project");
    await validateExayardOrganizationAccess({ fetchFn });
  }

  mark("create_file_upload");
  const uploadInit = await createExayardFileUpload({
    projectId,
    filename: params.filename,
    mimeType: params.mimeType,
    fileSize: params.fileBuffer.length,
    fetchFn,
  });

  mark("upload_bytes");
  await uploadExayardFileBytes({
    uploadUrl: uploadInit.uploadUrl,
    fileBuffer: params.fileBuffer,
    mimeType: params.mimeType,
    fetchFn,
  });

  mark("confirm_file");
  await confirmExayardFileUpload({
    fileId: uploadInit.fileId,
    r2Key: uploadInit.r2Key,
    fetchFn,
  });

  mark("wait_pages");
  const pages = await waitForExayardPagesReady({
    projectId,
    fileId: uploadInit.fileId,
    fetchFn,
    timeoutMs: poll.pagesTimeoutMs,
    intervalMs: poll.intervalMs,
  });
  const pageIds = pages
    .map((p) => p?._id ?? p?.id ?? null)
    .filter(Boolean);

  mark("analysis_propose");
  const proposal = await proposeExayardAnalysis({
    projectId,
    prompt: params.prompt,
    fileIds: [uploadInit.fileId],
    fetchFn,
  });

  mark("analysis_run");
  const runResult = await runExayardAnalysis({
    projectId,
    pageIds: proposal.pageIds,
    elements: proposal.elements,
    fetchFn,
  });

  mark("poll_assessment");
  const pollResult = await pollExayardAssessment({
    assessmentId: runResult.assessmentId,
    fetchFn,
    timeoutMs: poll.initialAssessmentPollTimeoutMs ?? poll.assessmentTimeoutMs,
    intervalMs: poll.intervalMs,
    mode: "brief",
  });

  if (pollResult.completed) {
    const rawAssessment = pollResult.assessment;
    const completedAt = new Date().toISOString();
    mark("completed");

    return {
      provider:       "exayard",
      projectId,
      fileId:         uploadInit.fileId,
      assessmentId:   runResult.assessmentId,
      status:         rawAssessment?.status ?? "completed",
      pageIds:        proposal.pageIds,
      pageCount:      pageIds.length,
      startedAt,
      completedAt,
      steps,
      rawAssessment,
      proposal: {
        creditEstimate: proposal.creditEstimate ?? null,
        elementCount:   Array.isArray(proposal.elements) ? proposal.elements.length : 0,
      },
    };
  }

  mark("waiting_on_exayard");
  const waitingAt = new Date().toISOString();

  return {
    provider:       "exayard",
    projectId,
    fileId:         uploadInit.fileId,
    assessmentId:   runResult.assessmentId,
    status:         "waiting_on_exayard",
    pausedStep:     pollResult.pausedStep ?? "poll_assessment",
    pageIds:        proposal.pageIds,
    pageCount:      pageIds.length,
    startedAt,
    completedAt:    null,
    steps,
    rawAssessment:  pollResult.lastAssessment ?? null,
    retryAfterSeconds: pollResult.retryAfterSeconds ?? null,
    retryAfterAt:      pollResult.retryAfterAt ?? null,
    exayardCode:       pollResult.exayardCode ?? (pollResult.rateLimited ? "rate_limited" : null),
    exayardRequestId:  pollResult.exayardRequestId ?? null,
    assessmentStatus:  pollResult.assessmentStatus ?? pollResult.lastAssessment?.status ?? null,
    waitingReason:     pollResult.reason ?? (pollResult.rateLimited ? "rate_limited" : "processing"),
    waitingSince:      waitingAt,
    proposal: {
      creditEstimate: proposal.creditEstimate ?? null,
      elementCount:   Array.isArray(proposal.elements) ? proposal.elements.length : 0,
    },
  };
}
