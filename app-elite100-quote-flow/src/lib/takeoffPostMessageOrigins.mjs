/**
 * Exact-origin allowlist for AI Takeoff ↔ Quote Flow postMessage.
 */

export const TAKEOFF_APPROVED_MESSAGE_TYPE = "eliteos-takeoff-approved";
/** Parent → iframe: collect current reviewed measurements for one-click Set Scope. */
export const QUOTE_FLOW_REQUEST_SET_SCOPE = "eliteos-quote-flow-request-set-scope";
/** iframe → parent: reviewed takeoffResult (+ reviewState) ready for Set Scope. */
export const QUOTE_FLOW_SET_SCOPE_PAYLOAD = "eliteos-quote-flow-set-scope-payload";
/** iframe → parent: worksheet dirty flag for Review Takeoff modal close guards. */
export const TAKEOFF_REVIEW_DIRTY = "eliteos-takeoff-review-dirty";
/** iframe → parent: draft saved successfully. */
export const TAKEOFF_REVIEW_DRAFT_SAVED = "TAKEOFF_REVIEW_DRAFT_SAVED";
/** iframe → parent: Save Draft failed — Set Scope must not continue. */
export const TAKEOFF_REVIEW_DRAFT_SAVE_FAILED = "TAKEOFF_REVIEW_DRAFT_SAVE_FAILED";
/** Parent → iframe: trigger Save draft from Quote Flow sticky actions. */
export const QUOTE_FLOW_REQUEST_SAVE_DRAFT = "eliteos-quote-flow-request-save-draft";
/** Confirm copy when closing a dirty Review Takeoff workspace. */
export const REVIEW_DISCARD_CONFIRM = "Discard unsaved review changes?";

export const SET_SCOPE_SAVE_REQUIRED_ERROR =
  "Could not save the current Review Takeoff worksheet. Your edits are still on screen — fix the save error, then try Set Scope again.";
export const SET_SCOPE_SAVE_TIMEOUT_ERROR =
  "Timed out waiting for Review Takeoff to save. Keep Review Takeoff open and try Set Scope again.";
export const SET_SCOPE_IFRAME_REQUIRED_ERROR =
  "Review Takeoff is not available. Open Review Takeoff, then try Set Scope again.";

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

/**
 * Resolve Vite / override env for Takeoff head URL.
 * IMPORTANT: access `import.meta.env.VITE_*` as static member expressions so Vite
 * inlines production values. Do not only spread `import.meta.env`.
 */
function resolveTakeoffHeadUrlRaw(env = {}) {
  const fromArg =
    env && typeof env === "object" ? String(env.VITE_HEAD_URL_AI_TAKEOFF ?? "").trim() : "";
  let fromMeta = "";
  try {
    fromMeta = String(
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_HEAD_URL_AI_TAKEOFF) ||
        ""
    ).trim();
  } catch {
    fromMeta = "";
  }
  return fromArg || fromMeta;
}

function resolveExtraAllowedOriginsRaw(env = {}) {
  const fromArg =
    env && typeof env === "object"
      ? String(env.VITE_TAKEOFF_POSTMESSAGE_ALLOWED_ORIGINS ?? "").trim()
      : "";
  let fromMeta = "";
  try {
    fromMeta = String(
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_TAKEOFF_POSTMESSAGE_ALLOWED_ORIGINS) ||
        ""
    ).trim();
  } catch {
    fromMeta = "";
  }
  return fromArg || fromMeta;
}

export function aiTakeoffHeadUrl(env) {
  const raw = resolveTakeoffHeadUrlRaw(env);
  return raw.replace(/\/+$/, "") || "http://localhost:5186";
}

/**
 * Allowed origins for messages FROM the Takeoff iframe TO Quote Flow.
 * Must include production takeoff.eliteosfab.com via VITE_HEAD_URL_AI_TAKEOFF.
 */
export function buildAllowedTakeoffMessageOrigins(env = {}) {
  const set = new Set();
  const head =
    originFromUrl(resolveTakeoffHeadUrlRaw(env)) || originFromUrl("http://localhost:5186");
  if (head) set.add(head);
  for (const o of LOCAL_TAKEOFF_ORIGINS) set.add(o);
  const extra = resolveExtraAllowedOriginsRaw(env);
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

/**
 * Ask the embedded Takeoff review iframe for the current reviewed measurements.
 * Resolves with { takeoffResult, reviewState, dirty } or null on timeout/unavailable.
 * Prefer requestSaveDraftFromIframe + backend Set Scope for the production transaction.
 */
export function requestSetScopePayloadFromIframe(iframe, takeoffJobId, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 8000;
  const jobId = String(takeoffJobId || "").trim();
  const env = opts.env;
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
      if (!isAllowedTakeoffMessageOrigin(event.origin, env)) return;
      if (!isValidQuoteFlowSetScopePayload(event.data, jobId)) return;
      if (event.data.error) {
        finish({
          takeoffResult: null,
          reviewState: null,
          dirty: false,
          error: String(event.data.error)
        });
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

/**
 * Ask the embedded Review Takeoff iframe to Save Draft and wait for confirmation.
 * Resolves { ok: true, alreadyClean?, resultId? } | { ok: false, error, reason }.
 */
export function requestSaveDraftFromIframe(iframe, takeoffJobId, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 20000;
  const jobId = String(takeoffJobId || "").trim();
  const env = opts.env;
  if (!iframe?.contentWindow || !jobId) {
    return Promise.resolve({
      ok: false,
      reason: "iframe_missing",
      error: SET_SCOPE_IFRAME_REQUIRED_ERROR
    });
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
      if (!isAllowedTakeoffMessageOrigin(event.origin, env)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (String(data.takeoffJobId || "") !== jobId) return;
      if (data.type === TAKEOFF_REVIEW_DRAFT_SAVED) {
        finish({
          ok: true,
          alreadyClean: data.alreadyClean === true,
          resultId: data.resultId || null,
          savedState: data.savedState || "saved"
        });
        return;
      }
      if (data.type === TAKEOFF_REVIEW_DRAFT_SAVE_FAILED) {
        finish({
          ok: false,
          reason: "save_failed",
          error: String(data.error || SET_SCOPE_SAVE_REQUIRED_ERROR)
        });
      }
    }
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(
      () =>
        finish({
          ok: false,
          reason: "timeout",
          error: SET_SCOPE_SAVE_TIMEOUT_ERROR
        }),
      timeoutMs
    );
    try {
      iframe.contentWindow.postMessage(
        { type: QUOTE_FLOW_REQUEST_SAVE_DRAFT, takeoffJobId: jobId, forSetScope: true },
        "*"
      );
    } catch {
      finish({
        ok: false,
        reason: "post_failed",
        error: SET_SCOPE_IFRAME_REQUIRED_ERROR
      });
    }
  });
}
