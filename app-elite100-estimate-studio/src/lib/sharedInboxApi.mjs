/**
 * Shared Inbox API client — Elite 100 Estimate Studio.
 * Org/actor never sent from the browser.
 */
import { apiGet, apiPost, ApiError, isTransientHttpError } from "./api";

/**
 * @param {string} token
 * @param {Record<string, string|number|undefined|null> & { signal?: AbortSignal }} [query]
 */
export async function fetchSharedInbox(token, query = {}) {
  const { signal, ...rest } = query;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) {
    if (v == null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return apiGet(`/api/elite100-estimate-studio/shared-inbox${qs ? `?${qs}` : ""}`, token, {
    signal
  });
}

/**
 * @param {string} token
 * @param {string} messageKey
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function fetchSharedInboxMessage(token, messageKey, opts = {}) {
  return apiGet(
    `/api/elite100-estimate-studio/shared-inbox/${encodeURIComponent(messageKey)}`,
    token,
    { signal: opts.signal }
  );
}

/**
 * Explicit import — confirm:true required. Idempotency-Key recommended.
 * Compatibility route — prefer startSharedInboxEstimate for the simplified workflow.
 * @param {string} token
 * @param {string} messageKey
 * @param {{ idempotencyKey?: string }} [opts]
 */
export async function importSharedInboxMessage(token, messageKey, opts = {}) {
  const headers = {};
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = String(opts.idempotencyKey);
  }
  return apiPost(
    `/api/elite100-estimate-studio/shared-inbox/${encodeURIComponent(messageKey)}/import`,
    token,
    { confirm: true, idempotencyKey: opts.idempotencyKey || undefined },
    { headers }
  );
}

/**
 * One-click Start Estimate — idempotent import + ensure Studio estimate.
 * @param {string} token
 * @param {string} messageKey
 * @param {{ idempotencyKey?: string, forceManual?: boolean }} [opts]
 */
export async function startSharedInboxEstimate(token, messageKey, opts = {}) {
  const headers = {};
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = String(opts.idempotencyKey);
  }
  // confirm: true is required by the backend import guard
  // (import_confirm_required). Clicking Start Estimate is the explicit
  // confirmation — never weaken or bypass that server check.
  return apiPost(
    `/api/elite100-estimate-studio/shared-inbox/${encodeURIComponent(messageKey)}/start-estimate`,
    token,
    {
      confirm: true,
      forceManual: opts.forceManual === true,
      idempotencyKey: opts.idempotencyKey || undefined
    },
    { headers }
  );
}

/**
 * Mark inbox message viewed without starting an estimate.
 * @param {string} token
 * @param {string} messageKey
 */
export async function markSharedInboxViewed(token, messageKey) {
  return apiPost(
    `/api/elite100-estimate-studio/shared-inbox/${encodeURIComponent(messageKey)}/mark-viewed`,
    token,
    {}
  );
}

/**
 * One-step Publish Digital Estimate (simplified workflow).
 * @param {string} token
 * @param {string} estimateId
 * @param {Record<string, unknown>} body
 */
export async function simplifiedPublishEstimate(token, estimateId, body = {}) {
  return apiPost(
    `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/simplified-publish`,
    token,
    { confirm: true, ...body }
  );
}

export { ApiError, isTransientHttpError };

/**
 * @param {unknown} e
 */
export function classifySharedInboxError(e) {
  if (isTransientHttpError(e)) {
    return {
      code: "mailbox_unavailable",
      message:
        "Shared Inbox could not be refreshed. Existing rows were kept. Retry when the service is available.",
      transient: true
    };
  }
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? /** @type {Record<string, unknown>} */ (e.body) : null;
    const code = String(body?.code || "import_failed");
    return {
      code,
      message: e.message || "Request failed",
      transient: false
    };
  }
  return { code: "import_failed", message: "Request failed", transient: false };
}

export function newImportIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `si-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
