/**
 * Public Final Acceptance routes (session cookie + Origin).
 * Distinct from Review Request. No email / sold / QB / Moraware.
 * Production persistence: Supabase only (no process-memory fallback).
 */

import express from "express";
import {
  checkDigitalEstimatePublicRateLimit,
  getDigitalEstimateClientIp
} from "../digitalEstimate/digitalEstimateRateLimit.mjs";
import { createSupabaseDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { redactDigitalEstimateTokenPath } from "../digitalEstimate/digitalEstimateToken.mjs";
import { createDigitalEstimateConfigurationStack } from "../digitalEstimate/configuration/configurationFactory.mjs";
import {
  readDigitalEstimatePublicConfigRateLimitPerMinute,
  readDigitalEstimatePublicConfigurationOrigin
} from "../digitalEstimate/configuration/publicConfigurationConfig.mjs";
import {
  assertPublicConfigurationOrigin,
  clearConfigurationSessionCookie,
  hashConfigurationSessionSecret,
  readSessionSecretFromCookie,
  redactPublicConfigurationSecrets
} from "../digitalEstimate/configuration/publicConfigurationSession.mjs";
import { isDigitalEstimateReviewRequestRuntimeEnabled } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import {
  createInMemoryAmendmentRepository,
  createSupabaseAmendmentRepository
} from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { createStudioFinalAcceptanceService } from "./studioFinalAcceptanceService.mjs";
import { createStudioEstimateRepository } from "./studioEstimateRepository.mjs";
import { resolveStudioLifecycleRepositoryForRoutes } from "./studioLifecycleRepositoryFactory.mjs";

const jsonParser = express.json({ limit: "64kb" });
const UNAVAILABLE = Object.freeze({ ok: false, error: "Estimate unavailable" });

function setPublicSecurityHeaders(res) {
  res.set("Cache-Control", "no-store, private");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
}

function logAccept(label, e, req) {
  const path = redactPublicConfigurationSecrets(
    redactDigitalEstimateTokenPath(req?.originalUrl || req?.url || "")
  );
  console.error(`[studio-final-acceptance] ${label}`, e?.code || "error", path);
}

function publicError(res, e) {
  const status = Number(e?.statusCode) || 404;
  const code = e?.code || "not_found";
  let message = "We couldn’t record your acceptance. Please try again.";
  if (code === "studio_lifecycle_persistence_unavailable") {
    message = "Acceptance is temporarily unavailable. Please contact Elite.";
  } else if (
    code === "publication_revoked" ||
    code === "publication_expired" ||
    code === "publication_unavailable"
  ) {
    message = "This estimate link is no longer active. Please contact Elite.";
  } else if (code === "publication_superseded") {
    message =
      "A newer estimate is available. Please use the latest estimate link from Elite.";
  } else if (code === "confirmation_required") {
    message = "Please confirm you are accepting this estimate.";
  } else if (
    code === "acceptance_blocked_selection_changes" ||
    code === "acceptance_blocked_scope_review" ||
    code === "acceptance_blocked_review_requested"
  ) {
    message = e.message || "Please send your selections to Elite for review before accepting.";
  } else if (code === "session_invalid" || code === "session_required" || code === "session_not_found") {
    message = "Please refresh and try again";
  } else if (code === "forbidden_caller_authority") {
    message = "Please refresh and try again";
  } else if (status === 409) {
    message = e.message || "Please refresh and try again";
  } else if (status === 400) {
    message = e.message || "Please refresh and try again";
  }
  res.status(status >= 400 && status < 600 ? status : 404).json({
    ok: false,
    error: message,
    code,
    lifecycleFatal: Boolean(e?.lifecycleFatal) || status === 410
  });
}

function rateLimitGate(req, res, env) {
  const limit = readDigitalEstimatePublicConfigRateLimitPerMinute(env);
  const ip = getDigitalEstimateClientIp(req);
  const result = checkDigitalEstimatePublicRateLimit(`studio:accept:${ip}`, limit);
  if (!result.allowed) {
    res.set("Retry-After", String(result.retryAfterSec || 60));
    res.status(429).json({ ok: false, error: "Please refresh and try again" });
    return false;
  }
  return true;
}

/**
 * Mount when Digital Estimate public configuration runtime is on
 * (same surface as Review Request — Final Acceptance is the closeout action).
 */
export function maybeAttachStudioFinalAcceptanceRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isDigitalEstimateReviewRequestRuntimeEnabled(env) && !deps.lifecycleRepository) {
    if (!deps.forceMount) return { mounted: false, reason: "runtime_off" };
  }
  return attachStudioFinalAcceptanceRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachStudioFinalAcceptanceRoutes(app, deps) {
  const env = deps.env ?? process.env;
  const { getSupabase } = deps;

  const stack =
    deps.configurationRepository && deps.deRepository
      ? null
      : createDigitalEstimateConfigurationStack({
          env,
          mode: deps.mode || (getSupabase ? "supabase" : "memory"),
          db: getSupabase?.(),
          requireRuntimeFlags: !deps.lifecycleRepository
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

  const studioEstimateRepository =
    deps.studioEstimateRepository ||
    createStudioEstimateRepository({
      env,
      db: getSupabase?.(),
      getSupabase
    }).repository;

  let lifecycleRepository;
  try {
    lifecycleRepository =
      deps.lifecycleRepository ||
      resolveStudioLifecycleRepositoryForRoutes({
        env,
        getSupabase,
        studioEstimateRepository
      });
  } catch (e) {
    if (e?.code === "studio_lifecycle_persistence_unavailable" && deps.forceMount) {
      // Tests that force-mount without injection must still fail closed at request time.
      lifecycleRepository = {
        mode: "unavailable",
        async getAcceptanceByPublication() {
          throw e;
        },
        async createAcceptance() {
          throw e;
        },
        async getAcceptanceForEstimate() {
          throw e;
        }
      };
    } else if (e?.code === "studio_lifecycle_persistence_unavailable") {
      console.error(
        "[studio-final-acceptance] lifecycle persistence unavailable at mount",
        e.code
      );
      return { mounted: false, reason: "lifecycle_persistence_unavailable" };
    } else {
      throw e;
    }
  }

  if (!configurationRepository || !deRepository || !lifecycleRepository) {
    return { mounted: false, reason: "repository_unavailable" };
  }

  const service = createStudioFinalAcceptanceService({
    env,
    lifecycleRepository,
    deRepository,
    configurationRepository,
    studioEstimateRepository,
    amendmentRepository,
    listOpenReviewRequests: deps.listOpenReviewRequests || null
  });

  app.post("/api/public-digital-estimate/v2/final-acceptance", jsonParser, async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env)) return;
    const ct = String(req.get("content-type") || "");
    if (!ct.includes("application/json")) {
      return res.status(415).json({ ok: false, error: "Please refresh and try again" });
    }
    try {
      assertPublicConfigurationOrigin(req, readDigitalEstimatePublicConfigurationOrigin(env), env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) return res.status(404).json(UNAVAILABLE);
      const result = await service.acceptFinalEstimate({ rawSecret, body: req.body || {} });
      res.json(result);
    } catch (e) {
      logAccept("final acceptance failed", e, req);
      if (e?.statusCode === 404) clearConfigurationSessionCookie(res, env);
      publicError(res, e);
    }
  });

  app.get("/api/public-digital-estimate/v2/final-acceptance/current", async (req, res) => {
    setPublicSecurityHeaders(res);
    if (!rateLimitGate(req, res, env)) return;
    try {
      assertPublicConfigurationOrigin(req, readDigitalEstimatePublicConfigurationOrigin(env), env);
      const rawSecret = readSessionSecretFromCookie(req);
      if (!rawSecret) {
        return res.json({ ok: true, acceptance: null, code: "no_current_acceptance" });
      }
      const secretHash = hashConfigurationSessionSecret(rawSecret);
      const session = await configurationRepository.getSessionBySecretHash(secretHash);
      if (!session) {
        return res.json({ ok: true, acceptance: null, code: "no_current_acceptance" });
      }
      try {
        const acceptance = await service.getAcceptanceForPublication(
          session.organization_id,
          session.publication_id
        );
        return res.json({
          ok: true,
          acceptance,
          configurationLocked: Boolean(acceptance),
          code: acceptance ? "accepted" : "no_current_acceptance"
        });
      } catch (persistErr) {
        if (persistErr?.code === "studio_lifecycle_persistence_unavailable") {
          // Do not show Accepted when persistence is unavailable
          return res.status(503).json({
            ok: false,
            acceptance: null,
            configurationLocked: false,
            code: "studio_lifecycle_persistence_unavailable",
            error: "Acceptance is temporarily unavailable. Please contact Elite."
          });
        }
        throw persistErr;
      }
    } catch (e) {
      logAccept("final acceptance get nonfatal", e, req);
      if (e?.code === "studio_lifecycle_persistence_unavailable") {
        return res.status(503).json({
          ok: false,
          acceptance: null,
          configurationLocked: false,
          code: "studio_lifecycle_persistence_unavailable",
          error: "Acceptance is temporarily unavailable. Please contact Elite."
        });
      }
      return res.json({ ok: true, acceptance: null, code: "no_current_acceptance" });
    }
  });

  console.log("[studio-final-acceptance] mounted public final-acceptance routes");
  return { mounted: true, service, lifecycleRepository };
}
