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
  "origin_rejected",
  "origin_not_configured",
  "row_version_conflict",
  "idempotency_required",
  "concurrency_required",
  "forbidden_caller_authority",
  "unknown_option",
  "unresolved_product"
]);

const SAFE_DIAGNOSTIC_CODES = new Set([
  "DE-EXCHANGE-NETWORK",
  "DE-EXCHANGE-404",
  "DE-COOKIE",
  "DE-STATE",
  "DE-RENDER",
  "DE-ORIGIN"
]);

const CONFIG_UNAVAILABLE = Object.freeze({
  ok: false,
  error: "Configuration unavailable",
  diagnosticCode: "DE-STATE"
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

function logPublicCfg(label, e, req) {
  const path = redactPublicConfigurationSecrets(
    redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "")
  );
  const reason = e?.exchangeReason || e?.code || "error";
  console.error(`[digital-estimate-public-config] ${label}`, reason, path);
}

function safeDiagnosticCode(e, status, safeCode) {
  if (SAFE_DIAGNOSTIC_CODES.has(e?.diagnosticCode)) return e.diagnosticCode;
  if (safeCode === "origin_rejected" || safeCode === "origin_not_configured") return "DE-ORIGIN";
  if (status === 404 || status === 403) return "DE-EXCHANGE-404";
  return "DE-STATE";
}

function publicError(res, e) {
  const status = Number(e?.statusCode) || 404;
  const code = e?.code || "not_found";
  let message = "Estimate unavailable";
  if (code === "origin_rejected" || code === "origin_not_configured") {
    message = "Configuration unavailable";
  } else if (status === 409 || code === "row_version_conflict") {
    message = "Please refresh and try again";
  } else if (code === "unresolved_product" || code === "unknown_option" || code === "forbidden_caller_authority") {
    message = "That selection is unavailable";
  } else if (String(e?.message || "").includes("Pricing has expired")) {
    message = "Pricing has expired";
  } else if (String(e?.message || "").includes("options were updated")) {
    message = "Your estimate options were updated";
  } else if (status === 400) {
    message = "Please refresh and try again";
  } else if (status === 404 || status === 403) {
    message = e?.message && /unavailable|expired|updated/i.test(e.message) ? e.message : "Estimate unavailable";
  }
  const safeCode = SAFE_PUBLIC_ERROR_CODES.has(code) ? code : "unavailable";
  const stage =
    safeCode === "origin_rejected" || safeCode === "origin_not_configured"
      ? "origin"
      : status === 429
        ? "rate_limit"
        : "token_exchange";
  res.status(status >= 400 && status < 600 ? status : 404).json({
    ok: false,
    error: message,
    stage,
    code: safeCode,
    diagnosticCode: safeDiagnosticCode(e, status, safeCode)
  });
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

  const service = createPublicConfigurationService({
    env,
    deRepository,
    configurationRepository,
    pricingPolicyRepository
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
      res.status(201).json({ ok: true, ...result.state });
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
      if (!rawSecret) return res.status(404).json(PUBLIC_UNAVAILABLE);
      const state = await service.resumeFromSessionSecret({ rawSecret });
      res.json({ ok: true, ...state });
    } catch (e) {
      logPublicCfg("session resume failed", e, req);
      clearConfigurationSessionCookie(res, env);
      publicError(res, e);
    }
  });

  app.get("/api/public-digital-estimate/v2/configuration", async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "resume")) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(404).json(CONFIG_UNAVAILABLE);
      const state = await service.getConfiguration({ rawSecret });
      res.json({ ok: true, ...state });
    } catch (e) {
      logPublicCfg("configuration get failed", e, req);
      publicError(res, e);
    }
  });

  app.put("/api/public-digital-estimate/v2/selections", jsonParser, async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "selection")) return;
    if (!requireJsonMutation(req, res)) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(404).json(CONFIG_UNAVAILABLE);
      const result = await service.saveSelections({ rawSecret, body: req.body || {} });
      res.json(result);
    } catch (e) {
      logPublicCfg("selections put failed", e, req);
      publicError(res, e);
    }
  });

  app.post("/api/public-digital-estimate/v2/recalculate", jsonParser, async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env, "recalc")) return;
    if (!requireJsonMutation(req, res)) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(404).json(CONFIG_UNAVAILABLE);
      // Recalculate uses same contract as PUT selections (idempotent server inputs only)
      const result = await service.saveSelections({ rawSecret, body: req.body || {} });
      res.json(result);
    } catch (e) {
      logPublicCfg("recalculate failed", e, req);
      publicError(res, e);
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
  return { mounted: true, config: readSafeDigitalEstimatePublicConfigurationConfig(env) };
}

// silence unused import when public read flag checked elsewhere
void isDigitalEstimatePublicReadEnabled;
