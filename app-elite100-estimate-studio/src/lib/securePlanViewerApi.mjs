/**
 * Secure plan content fetch — authenticated blob only (no Graph/storage URLs).
 */
import { apiFetch, ApiError, isTransientHttpError } from "./api";

/**
 * @param {string} token
 * @param {string} messageKey
 * @param {string} attachmentKey
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ blob: Blob, contentType: string, filename: string|null }>}
 */
export async function fetchSharedInboxPlanContent(token, messageKey, attachmentKey, opts = {}) {
  const path = `/api/elite100-estimate-studio/shared-inbox/${encodeURIComponent(messageKey)}/attachments/${encodeURIComponent(attachmentKey)}/content`;
  return fetchPlanContentBlob(token, path, opts);
}

/**
 * @param {string} token
 * @param {string} caseId
 * @param {string} attachmentId
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function fetchIntakePlanContent(token, caseId, attachmentId, opts = {}) {
  const path = `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(attachmentId)}/content`;
  return fetchPlanContentBlob(token, path, opts);
}

/**
 * @param {string} token
 * @param {string} caseId
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function fetchIntakeSourcePlans(token, caseId, opts = {}) {
  return apiFetch(
    `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/source-plans`,
    token,
    { method: "GET", signal: opts.signal }
  );
}

/**
 * @param {string} token
 * @param {string} path
 * @param {{ signal?: AbortSignal }} [opts]
 */
async function fetchPlanContentBlob(token, path, opts = {}) {
  const base = String(
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_BACKEND_URL) ||
      "http://localhost:3001"
  )
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: opts.signal
  });
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const msg =
      body && typeof body === "object" && body.error
        ? String(body.error)
        : res.statusText || "Unable to load plan";
    throw new ApiError(res.status, msg, body);
  }
  const blob = await res.blob();
  const contentType = res.headers.get("content-type") || blob.type || "application/octet-stream";
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  return {
    blob,
    contentType,
    filename: match ? match[1] : null
  };
}

export { ApiError, isTransientHttpError };
