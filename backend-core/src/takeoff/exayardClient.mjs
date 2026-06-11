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
  return {
    intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 3000,
    assessmentTimeoutMs: Number.isFinite(assessmentTimeoutMs) && assessmentTimeoutMs > 0 ? assessmentTimeoutMs : 300_000,
    pagesTimeoutMs: Number.isFinite(pagesTimeoutMs) && pagesTimeoutMs > 0 ? pagesTimeoutMs : 120_000,
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
    startedAt:      w.startedAt ?? null,
    completedAt:    w.completedAt ?? null,
    steps:          Array.isArray(w.steps) ? w.steps : [],
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
  return {
    rateLimit: rateLimit ?? null,
    rateLimitPolicy: rateLimitPolicy ?? null,
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
  const { rateLimit, rateLimitPolicy } = readExayardRateLimitHeaders(res.headers);

  if (!res.ok) {
    const message = formatExayardHttpError(res.status, text, contentType);
    const err = new Error(message);
    err.name = "ExayardApiError";
    err.statusCode = res.status;
    err.problem = parseExayardProblemJson(text, contentType);
    err.code = err.problem?.code ?? null;
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
 * Exayard API request with rate-limit retries (429 / code rate_limited).
 *
 * @param {string} path  e.g. "/me" (appended to configured base URL)
 * @param {{
 *   method?: string,
 *   body?: unknown,
 *   fetchFn?: typeof fetch,
 *   headers?: Record<string, string>,
 *   maxRetries?: number,
 * }} [options]
 */
export async function exayardRequest(path, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;
  while (true) {
    try {
      return await exayardRequestOnce(path, options);
    } catch (err) {
      const retryable =
        err?.statusCode === 429 ||
        err?.problem?.code === "rate_limited";
      if (!retryable || attempt >= maxRetries) throw err;
      attempt += 1;
      const backoffMs = Math.min(30_000, 1000 * (2 ** (attempt - 1)));
      await sleep(backoffMs);
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
  const organizationId = requireExayardOrganizationId();
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
 * GET /assessments/{id}
 */
export async function getExayardAssessment({ assessmentId, fetchFn }) {
  const { data } = await exayardRequest(`/assessments/${encodeURIComponent(assessmentId)}`, { fetchFn });
  return data;
}

/**
 * Poll assessment until terminal status or timeout.
 *
 * @param {{ assessmentId: string, fetchFn?: typeof fetch, timeoutMs?: number, intervalMs?: number }} params
 */
export async function pollExayardAssessment({
  assessmentId,
  fetchFn,
  timeoutMs,
  intervalMs,
}) {
  const poll = readExayardPollConfig();
  const deadline = Date.now() + (timeoutMs ?? poll.assessmentTimeoutMs);
  const waitMs = intervalMs ?? poll.intervalMs;
  let last = null;

  while (Date.now() < deadline) {
    last = await getExayardAssessment({ assessmentId, fetchFn });
    const status = String(last?.status ?? "").toLowerCase();
    if (status && TERMINAL_ASSESSMENT_STATUSES.has(status)) {
      return last;
    }
    await sleep(waitMs);
  }

  throw Object.assign(
    new Error(
      `Timed out waiting for Exayard assessment ${assessmentId}` +
      (last?.status ? ` (last status: ${last.status})` : "")
    ),
    { statusCode: 504, code: "exayard_assessment_timeout", lastStatus: last?.status ?? null }
  );
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
  const rawAssessment = await pollExayardAssessment({
    assessmentId: runResult.assessmentId,
    fetchFn,
    timeoutMs: poll.assessmentTimeoutMs,
    intervalMs: poll.intervalMs,
  });

  const completedAt = new Date().toISOString();
  mark("completed");

  return {
    provider:       "exayard",
    projectId,
    fileId:         uploadInit.fileId,
    assessmentId:   runResult.assessmentId,
    status:         rawAssessment?.status ?? "unknown",
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
