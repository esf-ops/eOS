/**
 * Digital Estimate feature flags — Phase DE.1.
 * Exact string "1" enables; all default OFF.
 */

export function isDigitalEstimateApiEnabled(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_API_ENABLED ?? "").trim() === "1";
}

export function isDigitalEstimatePublishEnabled(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_PUBLISH_ENABLED ?? "").trim() === "1";
}

export function isDigitalEstimatePublicReadEnabled(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED ?? "").trim() === "1";
}

/**
 * Public customer base URL used only to construct share links for staff.
 * Documented host digital.eliteosfab.com — DNS/deploy not created in DE.1.
 */
export function readDigitalEstimatePublicBaseUrl(env = process.env) {
  const raw = String(
    env.HEAD_URL_DIGITAL_ESTIMATE || env.DIGITAL_ESTIMATE_PUBLIC_BASE_URL || ""
  ).trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://digital.eliteosfab.com";
}

export function readDigitalEstimateAccessTtlDays(env = process.env) {
  const n = Number(env.DIGITAL_ESTIMATE_ACCESS_TTL_DAYS);
  if (Number.isFinite(n) && n > 0 && n <= 3650) return Math.floor(n);
  return 90;
}

export function readDigitalEstimatePricingValidDays(env = process.env) {
  const n = Number(env.DIGITAL_ESTIMATE_PRICING_VALID_DAYS);
  if (Number.isFinite(n) && n > 0 && n <= 3650) return Math.floor(n);
  return 30;
}

export function readDigitalEstimatePublicRateLimitPerMinute(env = process.env) {
  const n = Number(env.DIGITAL_ESTIMATE_PUBLIC_RATE_LIMIT_PER_MINUTE);
  if (Number.isFinite(n) && n > 0 && n <= 10_000) return Math.floor(n);
  return 60;
}

export function readDigitalEstimateViewThrottleSeconds(env = process.env) {
  const n = Number(env.DIGITAL_ESTIMATE_VIEW_THROTTLE_SECONDS);
  if (Number.isFinite(n) && n >= 0 && n <= 86_400) return Math.floor(n);
  return 300;
}

export const DIGITAL_ESTIMATE_TERMS_VERSION = "de1_v1";
export const DIGITAL_ESTIMATE_ENGINE_VERSION = "quoteCalculator";

/**
 * Safe config for authenticated staff (no secrets).
 */
export function readSafeDigitalEstimateConfig(env = process.env) {
  return {
    apiEnabled: isDigitalEstimateApiEnabled(env),
    publishEnabled: isDigitalEstimatePublishEnabled(env),
    publicReadEnabled: isDigitalEstimatePublicReadEnabled(env),
    publicBaseUrl: readDigitalEstimatePublicBaseUrl(env),
    accessTtlDays: readDigitalEstimateAccessTtlDays(env),
    pricingValidDays: readDigitalEstimatePricingValidDays(env),
    termsDisclosureVersion: DIGITAL_ESTIMATE_TERMS_VERSION,
    syntheticPilotOnly: String(env.DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY ?? "1").trim() !== "0"
  };
}
