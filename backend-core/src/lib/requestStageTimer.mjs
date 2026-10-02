/**
 * Lightweight request-stage timing for Brain performance investigations.
 * No secrets. Enable via ELITEOS_REQUEST_TIMING=1 or opts.enabled.
 * Keep production env unset unless actively measuring (Phase 3 measurement complete).
 * Prefer Git auto-deploy from the monorepo root (do not CLI-deploy with cwd=backend-core).
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** @type {AsyncLocalStorage<{ db: { n: number, ms: number }, auth: { n: number, ms: number }, resources: Record<string, number> }>} */
const supabaseCallStore = new AsyncLocalStorage();

function requestTimingEnvEnabled() {
  const v = String(process.env.ELITEOS_REQUEST_TIMING || "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Wrap a fetch implementation so Supabase calls made while a timed request is active
 * are counted (count + summed ms; auth vs PostgREST/storage). URLs and bodies are not recorded.
 * @param {typeof fetch} [fetchImpl]
 * @returns {typeof fetch}
 */
export function withSupabaseCallTiming(fetchImpl = globalThis.fetch) {
  return async function timedSupabaseFetch(input, init) {
    const store = supabaseCallStore.getStore();
    if (!store) return fetchImpl(input, init);
    const url = typeof input === "string" ? input : input?.url || String(input);
    const bucket = url.includes("/auth/v1/") ? store.auth : store.db;
    const resource = /\/(?:rest\/v1|auth\/v1|storage\/v1)\/(?:rpc\/)?([A-Za-z0-9_]+)/.exec(url)?.[1] || "other";
    const started = performance.now();
    try {
      return await fetchImpl(input, init);
    } finally {
      bucket.n += 1;
      bucket.ms += performance.now() - started;
      store.resources[resource] = (store.resources[resource] || 0) + 1;
    }
  };
}

/**
 * Per-request timing for a route family: total ms plus Supabase call counts, keyed by the
 * Express route template (never the concrete URL). Enabled by ELITEOS_REQUEST_TIMING=1 (server log),
 * or ?perf=1 outside production. The X-Eliteos-Perf response header is never sent in production.
 */
export function requestTimingMiddleware() {
  return function requestTiming(req, res, next) {
    const exposeHeader = String(process.env.VERCEL_ENV || "").trim() !== "production";
    const enabled = requestTimingEnvEnabled() || (exposeHeader && String(req.query?.perf ?? "") === "1");
    if (!enabled) return next();
    const started = performance.now();
    const store = { db: { n: 0, ms: 0 }, auth: { n: 0, ms: 0 }, resources: {} };
    const snapshot = () => ({
      label: `${req.method} ${req.route?.path || "(unmatched)"}`,
      status: res.statusCode,
      totalMs: Math.round(performance.now() - started),
      supabase: {
        db: { n: store.db.n, ms: Math.round(store.db.ms) },
        auth: { n: store.auth.n, ms: Math.round(store.auth.ms) },
        resources: { ...store.resources }
      }
    });
    const writeHead = res.writeHead;
    res.writeHead = function writeHeadWithTiming(...args) {
      if (exposeHeader && !res.headersSent && !res.getHeader("X-Eliteos-Perf")) {
        try {
          res.setHeader("X-Eliteos-Perf", JSON.stringify(snapshot()));
        } catch {
          // ignore header failures
        }
      }
      return writeHead.apply(this, args);
    };
    res.on("finish", () => {
      console.info("[eliteos-perf]", JSON.stringify(snapshot()));
    });
    supabaseCallStore.run(store, next);
  };
}

/**
 * @param {string} label
 * @param {{ enabled?: boolean, log?: boolean }} [opts]
 */
export function createRequestStageTimer(label, opts = {}) {
  const envOn =
    String(process.env.ELITEOS_REQUEST_TIMING || "").trim() === "1" ||
    String(process.env.ELITEOS_REQUEST_TIMING || "").toLowerCase() === "true";
  const enabled = opts.enabled === true || (opts.enabled !== false && envOn);
  const started = Date.now();
  /** @type {Record<string, number>} */
  const stages = {};
  let last = started;

  return {
    enabled,
    /** @param {string} name */
    mark(name) {
      if (!enabled) return;
      const now = Date.now();
      const key = String(name || "stage").slice(0, 64);
      stages[key] = (stages[key] || 0) + (now - last);
      last = now;
    },
    /** @returns {{ label: string, totalMs: number, stages: Record<string, number> } | null} */
    finish() {
      if (!enabled) return null;
      const totalMs = Date.now() - started;
      const payload = { label: String(label || "request"), totalMs, stages: { ...stages } };
      if (opts.log !== false) {
        console.info("[eliteos-perf]", JSON.stringify(payload));
      }
      return payload;
    }
  };
}

/**
 * Attach timing JSON to response header when present (staff debugging only).
 * @param {import('express').Response} res
 * @param {{ label: string, totalMs: number, stages: Record<string, number> } | null} timing
 */
export function attachRequestTimingHeader(res, timing) {
  if (!timing || !res || typeof res.setHeader !== "function") return;
  try {
    res.setHeader("X-Eliteos-Perf", JSON.stringify(timing));
  } catch {
    // ignore header failures
  }
}
