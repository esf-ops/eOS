/**
 * Estimate Queue dashboard client — combined operational list/preview APIs.
 */
import { apiGet, apiPost } from "./api";

/**
 * @param {string} token
 * @param {Record<string, string|number|undefined|null> & { signal?: AbortSignal }} [query]
 */
export async function fetchEstimateQueue(token, query = {}) {
  const { signal, ...rest } = query;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) {
    if (v == null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return apiGet(`/api/elite100-estimate-studio/queue${qs ? `?${qs}` : ""}`, token, {
    signal
  });
}

/**
 * @param {string} token
 * @param {string} caseId
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function fetchEstimateQueuePreview(token, caseId, opts = {}) {
  return apiGet(
    `/api/elite100-estimate-studio/queue/${encodeURIComponent(caseId)}/preview`,
    token,
    { signal: opts.signal }
  );
}

/**
 * @param {string} token
 * @param {string} caseId
 */
export async function recordEstimateQueueOpened(token, caseId) {
  return apiPost(
    `/api/elite100-estimate-studio/queue/${encodeURIComponent(caseId)}/opened`,
    token,
    {}
  );
}

/**
 * @param {string} token
 * @param {string} caseId
 * @param {string|null} assignedEstimatorUserId
 */
export async function assignEstimateQueueCase(token, caseId, assignedEstimatorUserId) {
  return apiPost(
    `/api/elite100-estimate-studio/queue/${encodeURIComponent(caseId)}/assign`,
    token,
    { assignedEstimatorUserId }
  );
}
