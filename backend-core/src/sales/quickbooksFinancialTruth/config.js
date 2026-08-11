/**
 * Env + capability detection for QuickBooks Financial Truth Beta.
 * Credentials stay backend-only. Never log password values.
 */

import { createRequire } from "node:module";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const defaultRequire = createRequire(import.meta.url);

export const QB_FINANCIAL_TRUTH_ENV_VARS = Object.freeze([
  "QB_FINANCIAL_TRUTH_ENABLED",
  "QB_GATEWAY_URL",
  "QB_GATEWAY_USER",
  "QB_GATEWAY_PASSWORD",
  "QB_GATEWAY_SSL_SERVER_CERT",
  "QB_FINANCIAL_TRUTH_PROVIDER"
]);

/**
 * Supported CData QuickBooks client packages we would accept if installed.
 * None of these are vendored in this repository today.
 */
export const SUPPORTED_CDATA_QUICKBOOKS_CLIENT_HINTS = Object.freeze([
  "cdata.jdbc.quickbooks",
  "@cdata/jdbc-quickbooks",
  "System.Data.CData.QuickBooks",
  "CData.QuickBooks",
  "CData.ADO.NET.QuickBooks"
]);

function isTruthy(raw) {
  return TRUTHY.has(String(raw ?? "").trim().toLowerCase());
}

/**
 * Probe whether a licensed/supported CData QuickBooks client is available
 * in this Node runtime. Does not invent Gateway protocols.
 *
 * @param {{ requireResolve?: (id: string) => string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ available: boolean, clientId: string|null, reason: string }}
 */
export function detectSupportedCDataQuickBooksClient(opts = {}) {
  const env = opts.env || process.env;
  const forced = String(env.QB_FINANCIAL_TRUTH_PROVIDER || "").trim().toLowerCase();
  if (forced === "fixture") {
    return {
      available: true,
      clientId: "fixture",
      reason: "Test/fixture provider selected via QB_FINANCIAL_TRUTH_PROVIDER=fixture."
    };
  }

  const resolve = opts.requireResolve || ((id) => defaultRequire.resolve(id));

  for (const id of [
    "cdata.jdbc.quickbooks",
    "@cdata/jdbc-quickbooks",
    "cdata-quickbooks"
  ]) {
    try {
      resolve(id);
      return {
        available: true,
        clientId: id,
        reason: `Resolved supported CData QuickBooks client module: ${id}`
      };
    } catch {
      // not installed
    }
  }

  return {
    available: false,
    clientId: null,
    reason:
      "No supported CData QuickBooks client library is installed in this runtime. " +
      "Raw HTTP QBXML POST to the Remote Connector is not a validated production transport. " +
      "Install a licensed CData QuickBooks JDBC/ODBC/ADO.NET (or documented) client, " +
      "or run reads from a Windows worker with stable egress to the Gateway allowlist."
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readQuickBooksFinancialTruthConfig(env = process.env) {
  const enabled = isTruthy(env.QB_FINANCIAL_TRUTH_ENABLED);
  const gatewayUrl = String(env.QB_GATEWAY_URL || "").trim() || null;
  const gatewayUser = String(env.QB_GATEWAY_USER || "").trim() || null;
  const hasPassword = Boolean(String(env.QB_GATEWAY_PASSWORD || "").trim());
  const sslServerCertConfigured = Boolean(String(env.QB_GATEWAY_SSL_SERVER_CERT || "").trim());
  const providerName = String(env.QB_FINANCIAL_TRUTH_PROVIDER || "").trim().toLowerCase() || "auto";
  const client = detectSupportedCDataQuickBooksClient({ env });

  return {
    enabled,
    gatewayUrlConfigured: Boolean(gatewayUrl),
    gatewayUserConfigured: Boolean(gatewayUser),
    gatewayPasswordConfigured: hasPassword,
    sslServerCertConfigured,
    providerName,
    supportedClientAvailable: client.available,
    supportedClientId: client.clientId,
    supportedClientReason: client.reason,
    // Never include password or full URL userinfo in summary objects returned to callers that may serialize to the UI.
    summary: {
      enabled,
      gateway_url_configured: Boolean(gatewayUrl),
      gateway_user_configured: Boolean(gatewayUser),
      gateway_password_configured: hasPassword,
      ssl_server_cert_configured: sslServerCertConfigured,
      provider: providerName,
      supported_client_available: client.available,
      supported_client_id: client.clientId
    }
  };
}
