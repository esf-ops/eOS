/**
 * DE.2G.0 — Distinct Digital Estimate deployment states (server-derived).
 * REAL_CUSTOMER_PILOT is never returned as an authorized operational state in this phase.
 */

import {
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublishEnabled,
  isDigitalEstimatePublicReadEnabled
} from "./digitalEstimateConfig.mjs";
import { isDigitalEstimateConfigurationEnabled } from "./configuration/configurationConfig.mjs";
import { isDigitalEstimatePublicConfigurationEnabled } from "./configuration/publicConfigurationConfig.mjs";
import { isDigitalEstimateReviewRequestsEnabled } from "./configuration/amendmentConfig.mjs";
import { isDigitalEstimateAmendmentsEnabled } from "./configuration/amendmentConfig.mjs";
import { isElite100EstimateStudioEnabled } from "../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";
import {
  isDigitalEstimateSyntheticPilotOnly,
  readSafeSyntheticPilotConfig
} from "./syntheticPilotGuard.mjs";

export const DE_DEPLOYMENT_STATE = Object.freeze({
  OFF: "OFF",
  PRIVATE_STUDIO_ONLY: "PRIVATE_STUDIO_ONLY",
  SYNTHETIC_PUBLICATION_PILOT: "SYNTHETIC_PUBLICATION_PILOT",
  /** Named for documentation only — never an authorized DE.2G.0 runtime state. */
  REAL_CUSTOMER_PILOT_BLOCKED: "REAL_CUSTOMER_PILOT_BLOCKED"
});

/**
 * Derive deployment state from flags. Does not authorize real-customer mode.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveDigitalEstimateDeploymentState(env = process.env) {
  const studio = isElite100EstimateStudioEnabled(env);
  const api = isDigitalEstimateApiEnabled(env);
  const publicRead = isDigitalEstimatePublicReadEnabled(env);
  const publicCfg = isDigitalEstimatePublicConfigurationEnabled(env);
  const syntheticOnly = isDigitalEstimateSyntheticPilotOnly(env);

  if (!studio && !api && !publicRead && !publicCfg) {
    return DE_DEPLOYMENT_STATE.OFF;
  }

  // Explicit attempt to leave synthetic-only while public is on → blocked label
  if (!syntheticOnly && (publicRead || publicCfg)) {
    return DE_DEPLOYMENT_STATE.REAL_CUSTOMER_PILOT_BLOCKED;
  }

  if (publicRead || publicCfg) {
    return DE_DEPLOYMENT_STATE.SYNTHETIC_PUBLICATION_PILOT;
  }

  if (studio || api) {
    return DE_DEPLOYMENT_STATE.PRIVATE_STUDIO_ONLY;
  }

  return DE_DEPLOYMENT_STATE.OFF;
}

/**
 * Safe diagnostics for authenticated Studio pilots — no secrets / no allowlist IDs.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ pilotAuthorized?: boolean, repositoryConfigured?: boolean, distributedLimiterReady?: boolean }} [opts]
 */
export function buildSafeDigitalEstimateDiagnostics(env = process.env, opts = {}) {
  const synthetic = readSafeSyntheticPilotConfig(env);
  const state = resolveDigitalEstimateDeploymentState(env);
  return {
    ok: true,
    deploymentState: state,
    realCustomerPilotAuthorized: false,
    realCustomerPilotBlockedReason:
      state === DE_DEPLOYMENT_STATE.REAL_CUSTOMER_PILOT_BLOCKED
        ? "REAL_CUSTOMER_PILOT requires distributed rate limiting, operational approval, and a later phase"
        : "REAL_CUSTOMER_PILOT is prohibited in DE.2G.0",
    flags: {
      apiEnabled: isDigitalEstimateApiEnabled(env),
      publishEnabled: isDigitalEstimatePublishEnabled(env),
      publicReadEnabled: isDigitalEstimatePublicReadEnabled(env),
      configurationEnabled: isDigitalEstimateConfigurationEnabled(env),
      publicConfigurationEnabled: isDigitalEstimatePublicConfigurationEnabled(env),
      reviewRequestsEnabled: isDigitalEstimateReviewRequestsEnabled(env),
      amendmentsEnabled: isDigitalEstimateAmendmentsEnabled(env),
      studioEnabled: isElite100EstimateStudioEnabled(env)
    },
    syntheticPilot: synthetic,
    headUrlsConfigured: {
      studio: Boolean(String(env.HEAD_URL_ELITE100_ESTIMATE_STUDIO ?? "").trim()),
      digitalEstimate: Boolean(
        String(env.HEAD_URL_DIGITAL_ESTIMATE || env.DIGITAL_ESTIMATE_PUBLIC_BASE_URL || "").trim()
      )
    },
    pilotAuthorized: Boolean(opts.pilotAuthorized),
    repositoryConfigured: Boolean(opts.repositoryConfigured),
    migrations: {
      expectedOrder: [
        "eliteos_digital_estimate_v1.sql",
        "eliteos_digital_estimate_configuration_v1.sql",
        "eliteos_digital_estimate_public_configuration_v1.sql",
        "eliteos_digital_estimate_amendment_v1.sql"
      ],
      applied: null, // never probed from public diagnostics without explicit later tooling
      note: "Apply only after Gate 3 authorization; preflight verifies file presence/checksums only"
    },
    distributedLimiterReady: Boolean(opts.distributedLimiterReady),
    processLocalRateLimitOnly: !opts.distributedLimiterReady,
    killSwitchesIndependent: true
  };
}
