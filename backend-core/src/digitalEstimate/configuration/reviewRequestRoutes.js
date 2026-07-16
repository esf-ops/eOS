/**
 * DE.2F — Public review-request routes (session cookie + Origin).
 */

import express from "express";
import {
  checkDigitalEstimatePublicRateLimit,
  getDigitalEstimateClientIp
} from "../digitalEstimateRateLimit.mjs";
import { createSupabaseDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { redactDigitalEstimateTokenPath } from "../digitalEstimateToken.mjs";
import {
  isDigitalEstimateReviewRequestRuntimeEnabled,
  isDigitalEstimateReviewRequestsEnabled,
  readSafeDigitalEstimateAmendmentConfig
} from "./amendmentConfig.mjs";
import { createInMemoryAmendmentRepository, createSupabaseAmendmentRepository } from "./amendmentRepository.mjs";
import { createDigitalEstimateConfigurationStack } from "./configurationFactory.mjs";
import {
  readDigitalEstimatePublicConfigRateLimitPerMinute,
  readDigitalEstimatePublicConfigurationOrigin
} from "./publicConfigurationConfig.mjs";
import {
  assertPublicConfigurationOrigin,
  clearConfigurationSessionCookie,
  readSessionSecretFromCookie,
  redactPublicConfigurationSecrets
} from "./publicConfigurationSession.mjs";
import { createReviewRequestService } from "./reviewRequestService.mjs";

const jsonParser = express.json({ limit: "64kb" });
const UNAVAILABLE = Object.freeze({ ok: false, error: "Estimate unavailable" });

function setPublicSecurityHeaders(res) {
  res.set("Cache-Control", "no-store, private");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
}

function logReview(label, e, req) {
  const path = redactPublicConfigurationSecrets(
    redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "")
  );
  console.error(`[digital-estimate-review] ${label}`, e?.code || "error", path);
}

function publicError(res, e) {
  const status = Number(e?.statusCode) || 404;
  const code = e?.code || "not_found";
  let message = "Estimate unavailable";
  if (code === "origin_rejected" || code === "origin_not_configured") {
    message = "Configuration unavailable";
  } else if (status === 409 || code === "row_version_conflict" || code === "stale_selection") {
    message = "Please refresh and try again";
  } else if (code === "incomplete_configuration" || code === "note_too_long") {
    message = e.message || "Please refresh and try again";
  } else if (code === "forbidden_caller_authority") {
    message = "Please refresh and try again";
  } else if (String(e?.message || "").includes("Pricing has expired")) {
    message = "Pricing has expired";
  } else if (status === 400) {
    message = "Please refresh and try again";
  }
  res.status(status >= 400 && status < 600 ? status : 404).json({ ok: false, error: message });
}

function requireJsonMutation(req, res) {
  const ct = String(req.get("content-type") || "");
  if (!ct.includes("application/json")) {
    res.status(415).json({ ok: false, error: "Please refresh and try again" });
    return false;
  }
  return true;
}

function rateLimitGate(req, res, env) {
  const limit = readDigitalEstimatePublicConfigRateLimitPerMinute(env);
  const ip = getDigitalEstimateClientIp(req);
  const result = checkDigitalEstimatePublicRateLimit(`de2f:review:${ip}`, limit);
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
export function maybeAttachDigitalEstimateReviewRequestRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isDigitalEstimateReviewRequestsEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }
  if (!isDigitalEstimateReviewRequestRuntimeEnabled(env)) {
    return { mounted: false, reason: "runtime_off" };
  }
  return attachDigitalEstimateReviewRequestRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachDigitalEstimateReviewRequestRoutes(app, deps) {
  const env = deps.env ?? process.env;
  const { getSupabase } = deps;

  if (!isDigitalEstimateReviewRequestRuntimeEnabled(env) && !deps.amendmentRepository) {
    return { mounted: false, reason: "runtime_off" };
  }

  const expectedOrigin = readDigitalEstimatePublicConfigurationOrigin(env);

  const stack =
    deps.configurationRepository && deps.deRepository
      ? null
      : createDigitalEstimateConfigurationStack({
          env,
          mode: deps.mode || (getSupabase ? "supabase" : "memory"),
          db: getSupabase?.(),
          requireRuntimeFlags: !deps.amendmentRepository
        });

  const configurationRepository = deps.configurationRepository || stack?.configuration;
  const deRepository =
    deps.deRepository ||
    deps.repository ||
    (getSupabase ? createSupabaseDigitalEstimateRepository({ db: getSupabase() }) : null);
  const amendmentRepository =
    deps.amendmentRepository ||
    (deps.mode === "memory" || !getSupabase
      ? createInMemoryAmendmentRepository({
          deRepository,
          configurationRepository
        })
      : createSupabaseAmendmentRepository({ db: getSupabase() }));

  if (!configurationRepository || !deRepository || !amendmentRepository) {
    return { mounted: false, reason: "repository_unavailable" };
  }

  const service = createReviewRequestService({
    env,
    deRepository,
    configurationRepository,
    amendmentRepository
  });

  app.post("/api/public-digital-estimate/v2/review-requests", jsonParser, async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env)) return;
    if (!requireJsonMutation(req, res)) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(404).json(UNAVAILABLE);
      const result = await service.createReviewRequest({ rawSecret, body: req.body || {} });
      res.json(result);
    } catch (e) {
      logReview("review request create failed", e, req);
      if (e?.statusCode === 404) clearConfigurationSessionCookie(res, env);
      publicError(res, e);
    }
  });

  app.get("/api/public-digital-estimate/v2/review-requests/current", async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env)) return;
    try {
      assertPublicConfigurationOrigin(req, expectedOrigin, env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(404).json(UNAVAILABLE);
      const result = await service.getCurrentReviewRequest({ rawSecret });
      res.json(result);
    } catch (e) {
      logReview("review request get failed", e, req);
      publicError(res, e);
    }
  });

  console.log("[digital-estimate-review] mounted public review-request routes (flags on)");
  return { mounted: true, config: readSafeDigitalEstimateAmendmentConfig(env) };
}
