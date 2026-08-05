/**
 * Exact-origin allowlist for AI Takeoff ↔ Quote Flow postMessage.
 */

export const TAKEOFF_APPROVED_MESSAGE_TYPE = "eliteos-takeoff-approved";
/** Parent → iframe: collect current reviewed measurements for one-click Set Scope. */
export const QUOTE_FLOW_REQUEST_SET_SCOPE = "eliteos-quote-flow-request-set-scope";
/** iframe → parent: reviewed takeoffResult (+ reviewState) ready for Set Scope. */
export const QUOTE_FLOW_SET_SCOPE_PAYLOAD = "eliteos-quote-flow-set-scope-payload";
/** iframe footer → parent: run the same Set Scope action as the workspace button. */
export const QUOTE_FLOW_TRIGGER_SET_SCOPE = "eliteos-quote-flow-trigger-set-scope";

export const LOCAL_TAKEOFF_ORIGINS = Object.freeze([
  "http://localhost:5186",
  "http://127.0.0.1:5186"
]);

export function originFromUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

export function aiTakeoffHeadUrl(env) {
  const fromEnv =
    env && typeof env === "object" ? String(env.VITE_HEAD_URL_AI_TAKEOFF ?? "").trim() : "";
  let fromMeta = "";
  try {
    fromMeta = String(
      (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_HEAD_URL_AI_TAKEOFF) ||
        ""
    ).trim();
  } catch {
    fromMeta = "";
  }
  const raw = fromEnv || fromMeta;
  return raw.replace(/\/+$/, "") || "http://localhost:5186";
}

export function buildAllowedTakeoffMessageOrigins(env = {}) {
  const set = new Set();
  const head = originFromUrl(env.VITE_HEAD_URL_AI_TAKEOFF) || originFromUrl("http://localhost:5186");
  if (head) set.add(head);
  for (const o of LOCAL_TAKEOFF_ORIGINS) set.add(o);
  const extra = String(env.VITE_TAKEOFF_POSTMESSAGE_ALLOWED_ORIGINS ?? "").trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const o = originFromUrl(part.trim());
      if (o) set.add(o);
    }
  }
  return set;
}

export function isAllowedTakeoffMessageOrigin(origin, env = {}) {
  const o = String(origin || "").trim();
  if (!o || o === "null" || o.startsWith("file:")) return false;
  return buildAllowedTakeoffMessageOrigins(env).has(o);
}

export function isValidTakeoffApprovedMessage(data, expectedTakeoffJobId) {
  if (!data || typeof data !== "object") return false;
  if (data.type !== TAKEOFF_APPROVED_MESSAGE_TYPE) return false;
  const jobId = String(data.takeoffJobId ?? "").trim();
  if (!jobId || jobId !== String(expectedTakeoffJobId || "").trim()) return false;
  if (data.reviewStatus != null && String(data.reviewStatus) !== "approved") return false;
  return true;
}

export function isValidQuoteFlowSetScopePayload(data, expectedTakeoffJobId) {
  if (!data || typeof data !== "object") return false;
  if (data.type !== QUOTE_FLOW_SET_SCOPE_PAYLOAD) return false;
  const jobId = String(data.takeoffJobId ?? "").trim();
  if (!jobId || jobId !== String(expectedTakeoffJobId || "").trim()) return false;
  return true;
}

export function isValidQuoteFlowTriggerSetScope(data, expectedTakeoffJobId) {
  if (!data || typeof data !== "object") return false;
  if (data.type !== QUOTE_FLOW_TRIGGER_SET_SCOPE) return false;
  const jobId = String(data.takeoffJobId ?? "").trim();
  if (!jobId || jobId !== String(expectedTakeoffJobId || "").trim()) return false;
  return true;
}

/**
 * Ask the embedded Takeoff review iframe for the current reviewed measurements.
 * Resolves with { takeoffResult, reviewState, dirty } or null on timeout/unavailable.
 */
export function requestSetScopePayloadFromIframe(iframe, takeoffJobId, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 8000;
  const jobId = String(takeoffJobId || "").trim();
  if (!iframe?.contentWindow || !jobId) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      resolve(value);
    };
    function onMessage(event) {
      if (!isAllowedTakeoffMessageOrigin(event.origin)) return;
      if (!isValidQuoteFlowSetScopePayload(event.data, jobId)) return;
      if (event.data.error) {
        finish(null);
        return;
      }
      finish({
        takeoffResult: event.data.takeoffResult || null,
        reviewState: event.data.reviewState || null,
        dirty: event.data.dirty === true
      });
    }
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    try {
      iframe.contentWindow.postMessage(
        { type: QUOTE_FLOW_REQUEST_SET_SCOPE, takeoffJobId: jobId },
        "*"
      );
    } catch {
      finish(null);
    }
  });
}
