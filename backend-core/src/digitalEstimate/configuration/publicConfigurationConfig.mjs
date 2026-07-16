/**
 * DE.2E — Public Digital Estimate configuration flags (default OFF).
 */

import {
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublicReadEnabled,
  readDigitalEstimatePublicBaseUrl
} from "../digitalEstimateConfig.mjs";
import { isDigitalEstimateConfigurationEnabled } from "./configurationConfig.mjs";

export function isDigitalEstimatePublicConfigurationEnabled(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED ?? "").trim() === "1";
}

/**
 * Full public configuration runtime requires API + public read + configuration schema + public config flag.
 */
export function isDigitalEstimatePublicConfigurationRuntimeEnabled(env = process.env) {
  return (
    isDigitalEstimateApiEnabled(env) &&
    isDigitalEstimatePublicReadEnabled(env) &&
    isDigitalEstimateConfigurationEnabled(env) &&
    isDigitalEstimatePublicConfigurationEnabled(env)
  );
}

export function readDigitalEstimatePublicConfigurationOrigin(env = process.env) {
  return readDigitalEstimatePublicBaseUrl(env);
}

export function readDigitalEstimateSessionTtlHours(env = process.env) {
  const n = Number(env.DIGITAL_ESTIMATE_CONFIGURATION_SESSION_TTL_HOURS);
  if (Number.isFinite(n) && n > 0 && n <= 24 * 90) return Math.floor(n);
  return 72;
}

export function readDigitalEstimatePublicConfigRateLimitPerMinute(env = process.env) {
  const n = Number(env.DIGITAL_ESTIMATE_PUBLIC_CONFIG_RATE_LIMIT_PER_MINUTE);
  if (Number.isFinite(n) && n > 0 && n <= 10_000) return Math.floor(n);
  return 30;
}

/** Cookie name for opaque configuration session secret (HttpOnly). */
export const DE_PUBLIC_CONFIG_SESSION_COOKIE = "de_cfg_session";

export const DE_PUBLIC_CONFIG_COOKIE_PATH = "/api/public-digital-estimate/v2";

export function readSafeDigitalEstimatePublicConfigurationConfig(env = process.env) {
  return {
    apiEnabled: isDigitalEstimateApiEnabled(env),
    publicReadEnabled: isDigitalEstimatePublicReadEnabled(env),
    configurationEnabled: isDigitalEstimateConfigurationEnabled(env),
    publicConfigurationEnabled: isDigitalEstimatePublicConfigurationEnabled(env),
    runtimeEnabled: isDigitalEstimatePublicConfigurationRuntimeEnabled(env),
    publicOrigin: readDigitalEstimatePublicConfigurationOrigin(env),
    sessionTtlHours: readDigitalEstimateSessionTtlHours(env)
  };
}
