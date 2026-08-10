/**
 * QuickBooks Gateway / CData Remote Connector configuration (live read only).
 *
 * Credentials come ONLY from environment variables. Never commit secrets.
 * Connection is refused unless QB_LIVE_READ_ENABLED=1.
 */

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * @typedef {{
 *   enabled: boolean,
 *   gatewayUrl: string|null,
 *   user: string|null,
 *   password: string|null,
 *   sslServerCert: string|null,
 *   qbXmlVersion: string,
 *   defaultTxnLimit: number,
 *   defaultListLimit: number,
 *   requestTimeoutMs: number,
 *   probeFromTxnDate: string|null,
 * }} QuickBooksGatewayConfig
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isQuickBooksLiveReadEnabled(env = process.env) {
  return TRUTHY.has(String(env.QB_LIVE_READ_ENABLED ?? "").trim().toLowerCase());
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {{ min?: number, max?: number }} [bounds]
 */
function parsePositiveInt(value, fallback, bounds = {}) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const min = bounds.min ?? 1;
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, n));
}

/**
 * Load gateway config from env. Does not throw for missing credentials unless
 * `requireEnabled` is true — callers that will connect should call
 * `assertQuickBooksLiveReadReady`.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {QuickBooksGatewayConfig}
 */
export function loadQuickBooksGatewayConfig(env = process.env) {
  const enabled = isQuickBooksLiveReadEnabled(env);
  return {
    enabled,
    gatewayUrl: trimOrNull(env.QB_GATEWAY_URL),
    user: trimOrNull(env.QB_GATEWAY_USER),
    password: env.QB_GATEWAY_PASSWORD != null ? String(env.QB_GATEWAY_PASSWORD) : null,
    sslServerCert: trimOrNull(env.QB_GATEWAY_SSL_SERVER_CERT),
    qbXmlVersion: trimOrNull(env.QB_LIVE_QBXML_VERSION) || "16.0",
    defaultTxnLimit: parsePositiveInt(env.QB_LIVE_PROBE_TXN_LIMIT, 10, { min: 1, max: 25 }),
    defaultListLimit: parsePositiveInt(env.QB_LIVE_PROBE_LIST_LIMIT, 100, { min: 1, max: 500 }),
    requestTimeoutMs: parsePositiveInt(env.QB_LIVE_REQUEST_TIMEOUT_MS, 120_000, {
      min: 5_000,
      max: 600_000,
    }),
    probeFromTxnDate: trimOrNull(env.QB_LIVE_PROBE_FROM_TXN_DATE),
  };
}

/**
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function trimOrNull(value) {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

/**
 * Fail closed before any network call.
 * @param {QuickBooksGatewayConfig} [config]
 */
export function assertQuickBooksLiveReadReady(config = loadQuickBooksGatewayConfig()) {
  if (!config.enabled) {
    throw new Error(
      "QuickBooks live read is disabled. Set QB_LIVE_READ_ENABLED=1 to allow Gateway connections."
    );
  }
  if (!config.gatewayUrl) {
    throw new Error("QB_GATEWAY_URL is required when QB_LIVE_READ_ENABLED=1.");
  }
  if (!config.user) {
    throw new Error("QB_GATEWAY_USER is required when QB_LIVE_READ_ENABLED=1.");
  }
  if (config.password == null || config.password === "") {
    throw new Error("QB_GATEWAY_PASSWORD is required when QB_LIVE_READ_ENABLED=1.");
  }

  let parsed;
  try {
    parsed = new URL(config.gatewayUrl.includes("://") ? config.gatewayUrl : `http://${config.gatewayUrl}`);
  } catch {
    throw new Error("QB_GATEWAY_URL is not a valid URL (expected http(s)://host:port or host:port).");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("QB_GATEWAY_URL must use http or https.");
  }

  return {
    ...config,
    gatewayUrl: parsed.toString().replace(/\/$/, ""),
  };
}

/**
 * Safe summary for logs / connection-summary.json — never includes password.
 * @param {QuickBooksGatewayConfig} config
 */
export function summarizeGatewayConfig(config) {
  let host = null;
  let port = null;
  let protocol = null;
  try {
    const url = new URL(
      config.gatewayUrl?.includes("://") ? config.gatewayUrl : `http://${config.gatewayUrl || "invalid"}`
    );
    host = url.hostname || null;
    port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    protocol = url.protocol.replace(":", "");
  } catch {
    // leave nulls
  }

  return {
    enabled: config.enabled,
    protocol,
    host,
    port,
    userConfigured: Boolean(config.user),
    passwordConfigured: config.password != null && config.password !== "",
    sslServerCertConfigured: Boolean(config.sslServerCert),
    qbXmlVersion: config.qbXmlVersion,
    defaultTxnLimit: config.defaultTxnLimit,
    defaultListLimit: config.defaultListLimit,
    requestTimeoutMs: config.requestTimeoutMs,
    probeFromTxnDate: config.probeFromTxnDate,
  };
}

/**
 * Env var names documented for operators (no values).
 */
export const QUICKBOOKS_LIVE_READ_ENV_VARS = Object.freeze([
  "QB_LIVE_READ_ENABLED",
  "QB_GATEWAY_URL",
  "QB_GATEWAY_USER",
  "QB_GATEWAY_PASSWORD",
  "QB_GATEWAY_SSL_SERVER_CERT",
  "QB_LIVE_QBXML_VERSION",
  "QB_LIVE_PROBE_TXN_LIMIT",
  "QB_LIVE_PROBE_LIST_LIMIT",
  "QB_LIVE_PROBE_FROM_TXN_DATE",
  "QB_LIVE_REQUEST_TIMEOUT_MS",
]);
