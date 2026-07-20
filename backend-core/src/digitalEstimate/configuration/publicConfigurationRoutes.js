/**
 * DE.2E — Public v2 Digital Estimate configuration routes.
 * Fragment-token exchange + HttpOnly session cookie. No path/query tokens.
 */

import express from "express";
import {
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublicReadEnabled,
  readDigitalEstimatePublicRateLimitPerMinute
} from "../digitalEstimateConfig.mjs";
import {
  checkDigitalEstimatePublicRateLimit,
  getDigitalEstimateClientIp
} from "../digitalEstimateRateLimit.mjs";
import { createSupabaseDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { redactDigitalEstimateTokenPath } from "../digitalEstimateToken.mjs";
import { createDigitalEstimateConfigurationStack } from "./configurationFactory.mjs";
import {
  isDigitalEstimatePublicConfigurationRuntimeEnabled,
  readDigitalEstimatePublicConfigRateLimitPerMinute,
  readDigitalEstimatePublicConfigurationOrigin,
  readSafeDigitalEstimatePublicConfigurationConfig
} from "./publicConfigurationConfig.mjs";
import { createPublicConfigurationService } from "./publicConfigurationService.mjs";
import {
  assertPublicConfigurationOrigin,
  clearConfigurationSessionCookie,
  hashConfigurationSessionSecret,
  readSessionSecretCandidatesFromCookie,
  readSessionSecretFromCookie,
  redactPublicConfigurationSecrets,
  setConfigurationSessionCookie
} from "./publicConfigurationSession.mjs";
import { readSafeSyntheticPilotConfig } from "../syntheticPilotGuard.mjs";

const jsonParser = express.json({ limit: "256kb" });

const PUBLIC_UNAVAILABLE = Object.freeze({
  ok: false,
  error: "Estimate unavailable",
  stage: "token_exchange",
  code: "unavailable",
  diagnosticCode: "DE-EXCHANGE-404"
});

const SAFE_PUBLIC_ERROR_CODES = new Set([
  "unavailable",
  "session_required",
  "session_not_found",
  "session_invalid",
  "origin_rejected",
  "origin_not_configured",
  "row_version_conflict",
  "stale_configuration",
  "idempotency_required",
  "concurrency_required",
  "forbidden_caller_authority",
  "unknown_option",
  "invalid_selection",
  "unresolved_product",
  "configuration_unavailable",
  "publication_revoked",
  "publication_expired",
  "publication_unavailable",
  "publication_superseded",
  "persistence_failed",
  "no_current_review_request"
]);

const SAFE_DIAGNOSTIC_CODES = new Set([
  "DE-EXCHANGE-NETWORK",
  "DE-EXCHANGE-404",
  "DE-COOKIE",
  "DE-STATE",
  "DE-RENDER",
  "DE-ORIGIN",
  "DE-SAVE"
]);

/** Missing session cookie on an authenticated v2 mutation/read — not a lifecycle revoke. */
const SESSION_REQUIRED = Object.freeze({
  ok: false,
  error: "Please refresh and try again",
  stage: "session",
  code: "session_required",
  diagnosticCode: "DE-COOKIE",
  recoverable: true,
  lifecycleFatal: false
});

function setPublicSecurityHeaders(res) {
  res.set("Cache-Control", "no-store, private");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
  res.set(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'self'; font-src 'none'"
  );
}

function logPublicCfg(label, e, req, extra = {}) {
  const path = redactPublicConfigurationSecrets(
    redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "")
  );
  const reason = e?.exchangeReason || e?.code || "error";
  const cookieCandidates = readSessionSecretCandidatesFromCookie(req);
  const hashPrefix =
    cookieCandidates[0] != null
      ? hashConfigurationSessionSecret(cookieCandidates[0]).slice(0, 8)
      : null;
  console.error(`[digital-estimate-public-config] ${label}`, {
    reason,
    path,
    cookiePresent: cookieCandidates.length > 0,
    cookieCandidateCount: cookieCandidates.length,
    sessionHashPrefix: hashPrefix,
    recoverable: Boolean(e?.recoverable),
    lifecycleFatal: Boolean(e?.lifecycleFatal),
    ...extra
  });
}

function safeDiagnosticCode(e, status, safeCode) {
  if (SAFE_DIAGNOSTIC_CODES.has(e?.diagnosticCode)) return e.diagnosticCode;
  if (safeCode === "origin_rejected" || safeCode === "origin_not_configured") return "DE-ORIGIN";
  if (
    safeCode === "session_required" ||
    safeCode === "session_not_found" ||
    safeCode === "session_invalid"
  ) {
    return "DE-COOKIE";
  }
  if (status === 404 || status === 403 || status === 410) return "DE-EXCHANGE-404";
  return "DE-STATE";
}

function publicError(res, e, stageHint = "token_exchange") {
  let status = Number(e?.statusCode) || 0;
  // Selection-stage failures without an explicit status must not become lifecycle 404s.
  if (!status) {
    status = stageHint === "selection" ? 500 : 404;
  }
  const code = e?.code || (stageHint === "selection" ? "persistence_failed" : "not_found");
  let message = "Estimate unavailable";
  if (code === "origin_rejected" || code === "origin_not_configured") {
    message = "Configuration unavailable";
  } else if (
    code === "session_required" ||
    code === "session_not_found" ||
    code === "session_invalid"
  ) {
    message = "Please refresh and try again";
  } else if (status === 409 || code === "row_version_conflict" || code === "stale_configuration") {
    message = "Please refresh and try again";
  } else if (
    code === "unresolved_product" ||
    code === "unknown_option" ||
    code === "invalid_selection" ||
    code === "forbidden_caller_authority"
  ) {
    message = "That selection is unavailable";
  } else if (code === "publication_expired" || String(e?.message || "").includes("Pricing has expired")) {
    message = "Pricing has expired";
  } else if (String(e?.message || "").includes("options were updated")) {
    message = "Your estimate options were updated";
  } else if (code === "configuration_unavailable") {
    message = "Configuration unavailable";
  } else if (code === "persistence_failed") {
    message = "Unable to save right now. Please try again.";
  } else if (status === 400 || status === 422) {
    message = e?.message && /refresh|unavailable|try again/i.test(e.message)
      ? e.message
      : "Please refresh and try again";
  } else if (status === 404 || status === 403 || status === 410) {
    message = e?.message && /unavailable|expired|updated|revoked/i.test(e.message)
      ? e.message
      : "Estimate unavailable";
  } else if (status >= 500) {
    message = "Unable to save right now. Please try again.";
  }
  const safeCode = SAFE_PUBLIC_ERROR_CODES.has(code) ? code : stageHint === "selection" ? "persistence_failed" : "unavailable";
  const stage =
    safeCode === "origin_rejected" || safeCode === "origin_not_configured"
      ? "origin"
      : status === 429
        ? "rate_limit"
        : stageHint || "token_exchange";
  const diagnostic =
    stageHint === "selection" && (status === 400 || status === 401 || status === 409 || status === 422 || status >= 500)
      ? safeDiagnosticCode(e, status, safeCode)
      : safeDiagnosticCode(e, status, safeCode);
  const recoverable =
    e?.recoverable === true ||
    safeCode === "session_required" ||
    safeCode === "session_not_found" ||
    safeCode === "session_invalid" ||
    safeCode === "row_version_conflict" ||
    safeCode === "stale_configuration" ||
    safeCode === "unknown_option" ||
    safeCode === "invalid_selection" ||
    safeCode === "configuration_unavailable" ||
    safeCode === "persistence_failed";
  const lifecycleFatal =
    e?.lifecycleFatal === true ||
    safeCode === "publication_revoked" ||
    safeCode === "publication_expired" ||
    safeCode === "publication_unavailable" ||
    safeCode === "publication_superseded";
  /** @type {Record<string, unknown>} */
  const body = {
    ok: false,
    error: message,
    stage,
    code: safeCode,
    diagnosticCode: diagnostic,
    recoverable,
    lifecycleFatal
  };
  if (
    (safeCode === "invalid_selection" || safeCode === "unknown_option") &&
    e?.selectionKey &&
    typeof e.selectionKey === "string"
  ) {
    body.selectionKey = e.selectionKey.slice(0, 160);
  }
  res.status(status >= 400 && status < 600 ? status : 404).json(body);
}

function extractBearerToken(req) {
  const h = String(req.get("authorization") || "");
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

function rateLimitGate(req, res, env, bucket) {
  const limit =
    bucket === "config" || bucket === "exchange" || bucket === "selection" || bucket === "recalc"
      ? readDigitalEstimatePublicConfigRateLimitPerMinute(env)
      : readDigitalEstimatePublicRateLimitPerMinute(env);
  const ip = getDigitalEstimateClientIp(req);
  const result = checkDigitalEstimatePublicRateLimit(`de2e:${bucket}:${ip}`, limit);
  if (!result.allowed) {
    res.set("Retry-After", String(result.retryAfterSec || 60));
    res.status(429).json({ ok: false, error: "Please refresh and try again" });
    return false;
  }
  return true;
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function maybeAttachDigitalEstimatePublicConfigurationRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isDigitalEstimatePublicConfigurationRuntimeEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }
  return attachDigitalEstimatePublicConfigurationRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachDigitalEstimatePublicConfigurationRoutes(app, deps) {
  const { getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (!isDigitalEstimatePublicConfigurationRuntimeEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }

  const deRepository =
    deps.deRepository ||
    deps.repository ||
    createSupabaseDigitalEstimateRepository({ db: getSupabase() });

  const stack =
    deps.configurationRepository && deps.pricingPolicyRepository
      ? null
      : createDigitalEstimateConfigurationStack({
          env,
          mode: deps.configurationStack?.mode || (deps.configurationRepository ? "memory" : "supabase"),
          db: getSupabase?.(),
          requireRuntimeFlags: false
        });

  const configurationRepository = deps.configurationRepository || stack?.configuration;
  const pricingPolicyRepository = deps.pricingPolicyRepository || stack?.pricingPolicy;

  if (!configurationRepository) {
    return { mounted: false, reason: "repository_unavailable" };
  }

  const isProd =
    String(env.VERCEL_ENV || "").trim() === "production" ||
    String(env.NODE_ENV || "").trim() === "production";
  if (isProd && stack?.mode === "memory" && !deps.configurationRepository) {
    console.error(
      "[digital-estimate-public-config] refusing in-memory configuration repository in production (Vercel requires Supabase durability)"
    );
    return { mounted: false, reason: "memory_forbidden_in_production" };
  }

  console.log(
    "[digital-estimate-public-config] repository mode=",
    stack?.mode || (deps.configurationRepository ? "injected" : "unknown")
  );

  const service = createPublicConfigurationService({
    env,
    deRepository,
    configurationRepository,
    pricingPolicyRepository,
    getSupabase
  });

  const expectedOrigin = readDigitalEstimatePublicConfigurationOrigin(env);

  function requireJsonMutation(req, res) {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;
    const ct = String(req.get("content-type") || "");
    if (!ct.includes("application/json")) {
      res.status(415).json({ ok: false, error: "Please refresh and try again" });
      return false;
    }
    return true;
  }

  app.get("/api/public-digital-estimate/v2/config", (req, res) => {
    setPublicSecurityHeaders(res);
    const synthetic = readSafeSyntheticPilotConfig(env);
    // Safe, non-sensitive flag mirror for the public head (no secrets / no allowlist IDs)
    res.json({
      ok: true,
      config: {
        publicConfigurationEnabled: true,
        liveCustomerConfigureReady: !synthetic.syntheticPilotOnly,
        publicOrigin: expectedOrigin,
        syntheticPilotOnly: synthetic.syntheticPilotOnly,
        syntheticAllowlistConfigured: synthetic.syntheticAllowlistConfigured,
        syntheticAllowlistCount: synthetic.syntheticAllowlistCount
      }
    });
  });

  // POST exchange — Authorization: Bearer <publication-token>
  app.post("/api/public-digital-estimate/v2/session", jsonParser, async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "exchange")) return;
    if (!requireJsonMutation(req, res)) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawToken = extractBearerToken(req);
      if (!rawToken) {
        return res.status(404).json(PUBLIC_UNAVAILABLE);
      }
      // Reject body/query token smuggling
      if (req.body?.token || req.body?.accessToken || req.query?.token) {
        return res.status(404).json(PUBLIC_UNAVAILABLE);
      }
      const result = await service.exchangePublicationToken({
        rawToken,
        body: req.body && typeof req.body === "object" ? req.body : {}
      });
      setConfigurationSessionCookie(res, result.rawSecret, env);
      // Do not echo rawSecret or full hash — only confirm session was established.
      res.status(201).json({
        ok: true,
        ...result.state,
        sessionCookie: {
          established: true,
          path: "/",
          sameSite: "None"
        }
      });
    } catch (e) {
      logPublicCfg("session exchange failed", e, req);
      clearConfigurationSessionCookie(res, env);
      publicError(res, e);
    }
  });

  app.get("/api/public-digital-estimate/v2/session", async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "resume")) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(401).json(SESSION_REQUIRED);
      const state = await service.resumeFromSessionSecret({ rawSecret });
      res.json({ ok: true, ...state });
    } catch (e) {
      logPublicCfg("session resume failed", e, req);
      clearConfigurationSessionCookie(res, env);
      publicError(res, e, "session");
    }
  });

  app.get("/api/public-digital-estimate/v2/configuration", async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "resume")) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(401).json(SESSION_REQUIRED);
      const state = await service.getConfiguration({ rawSecret });
      res.json({ ok: true, ...state });
    } catch (e) {
      logPublicCfg("configuration get failed", e, req);
      publicError(res, e, "configuration");
    }
  });

  async function handleSelectionsSave(req, res) {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "selection")) return;
    if (!requireJsonMutation(req, res)) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const candidates = readSessionSecretCandidatesFromCookie(req);
      if (!candidates.length) return res.status(401).json(SESSION_REQUIRED);
      let lastErr = null;
      for (const rawSecret of candidates) {
        try {
          const result = await service.saveSelections({ rawSecret, body: req.body || {} });
          return res.json(result);
        } catch (e) {
          lastErr = e;
          if (e?.code === "session_not_found" || e?.code === "session_invalid") {
            continue;
          }
          throw e;
        }
      }
      throw lastErr || Object.assign(new Error("Please refresh and try again"), {
        code: "session_not_found",
        statusCode: 401,
        diagnosticCode: "DE-COOKIE",
        recoverable: true,
        exchangeReason: "session_not_found"
      });
    } catch (e) {
      logPublicCfg("selections put failed", e, req, {
        repositoryMode: stack?.mode || (deps.configurationRepository ? "injected" : "unknown")
      });
      publicError(res, e, "selection");
    }
  }

  // Canonical contract: PUT /api/public-digital-estimate/v2/selections
  app.put("/api/public-digital-estimate/v2/selections", jsonParser, handleSelectionsSave);
  // Alias: same handler (some proxies mishandle PUT; keep one Brain save path)
  app.post("/api/public-digital-estimate/v2/selections", jsonParser, handleSelectionsSave);

  app.post("/api/public-digital-estimate/v2/recalculate", jsonParser, async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "recalc")) return;
    if (!requireJsonMutation(req, res)) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(401).json(SESSION_REQUIRED);
      // Recalculate uses same contract as PUT selections (idempotent server inputs only)
      const result = await service.saveSelections({ rawSecret, body: req.body || {} });
      res.json(result);
    } catch (e) {
      logPublicCfg("recalculate failed", e, req);
      publicError(res, e, "selection");
    }
  });

  app.delete("/api/public-digital-estimate/v2/session", async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "resume")) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      await service.revokeSessionCookie({ rawSecret });
      clearConfigurationSessionCookie(res, env);
      res.json({ ok: true });
    } catch (e) {
      clearConfigurationSessionCookie(res, env);
      res.json({ ok: true });
    }
  });

  console.log(
    "[digital-estimate-public-config] mounted /api/public-digital-estimate/v2/* (flags on)"
  );
  const synthetic = readSafeSyntheticPilotConfig(env);
  if (synthetic.syntheticPilotOnly) {
    console.warn(
      "[digital-estimate-public-config] DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY is on — POST /api/public-digital-estimate/v2/session only succeeds for allowlisted publication UUIDs. Set DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=0 for live customer ConfigurationView. allowlistCount=",
      synthetic.syntheticAllowlistCount
    );
  }
  return { mounted: true, config: readSafeDigitalEstimatePublicConfigurationConfig(env) };
}

// silence unused import when public read flag checked elsewhere
void isDigitalEstimatePublicReadEnabled;
