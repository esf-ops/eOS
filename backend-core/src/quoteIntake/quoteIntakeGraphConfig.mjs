/**
 * Quote Intake Microsoft Graph config — Phase 6P.4.
 * Off by default. Server-only credentials. Never expose secrets to clients.
 */

export const QUOTE_INTAKE_GRAPH_ENABLED_ENV = "QUOTE_INTAKE_GRAPH_ENABLED";
export const QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED_ENV =
  "QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED";

export const DEFAULT_QUOTE_INTAKE_GRAPH_MAILBOX = "quotes@elitestonefabrication.com";
export const DEFAULT_GRAPH_TIMEOUT_MS = 30_000;
export const DEFAULT_GRAPH_PREVIEW_LIMIT = 25;
export const DEFAULT_GRAPH_IMPORT_LIMIT = 10;
/** Align with Takeoff ~50 MiB ceiling. */
export const DEFAULT_GRAPH_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const DEFAULT_GRAPH_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

function envFlagOn(env, name) {
  return String(env?.[name] ?? "").trim() === "1";
}

function envInt(env, name, fallback, { min = 1, max = 10_000 } = {}) {
  const n = Number(String(env?.[name] ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isQuoteIntakeGraphEnabled(env = process.env) {
  return envFlagOn(env, QUOTE_INTAKE_GRAPH_ENABLED_ENV);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isQuoteIntakeGraphManualSyncEnabled(env = process.env) {
  return envFlagOn(env, QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED_ENV);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function readQuoteIntakeGraphMailbox(env = process.env) {
  const raw = String(env.QUOTE_INTAKE_GRAPH_MAILBOX ?? "").trim().toLowerCase();
  return raw || DEFAULT_QUOTE_INTAKE_GRAPH_MAILBOX;
}

/**
 * Fail-closed Graph credentials. Returns null when Graph is disabled (no credential requirement).
 * Throws graph_not_configured when Graph/manual sync is on but credentials incomplete.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readQuoteIntakeGraphCredentials(env = process.env) {
  const graphOn = isQuoteIntakeGraphEnabled(env);
  const syncOn = isQuoteIntakeGraphManualSyncEnabled(env);
  if (!graphOn || !syncOn) {
    return null;
  }

  const tenantId = String(env.QUOTE_INTAKE_GRAPH_TENANT_ID ?? "").trim();
  const clientId = String(env.QUOTE_INTAKE_GRAPH_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.QUOTE_INTAKE_GRAPH_CLIENT_SECRET ?? "").trim();
  const mailbox = readQuoteIntakeGraphMailbox(env);

  if (!tenantId || !clientId || !clientSecret || !mailbox.includes("@")) {
    const err = new Error("Quote Intake Graph is not configured");
    err.code = "graph_not_configured";
    err.statusCode = 503;
    throw err;
  }

  // Reject accidental reuse of browser/public keys.
  if (clientSecret.startsWith("eyJ") && clientSecret.length > 200) {
    const err = new Error("Quote Intake Graph is not configured");
    err.code = "graph_not_configured";
    err.statusCode = 503;
    throw err;
  }

  return Object.freeze({
    tenantId,
    clientId,
    clientSecret,
    mailbox
  });
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readQuoteIntakeGraphLimits(env = process.env) {
  return Object.freeze({
    timeoutMs: envInt(env, "QUOTE_INTAKE_GRAPH_TIMEOUT_MS", DEFAULT_GRAPH_TIMEOUT_MS, {
      min: 1000,
      max: 120_000
    }),
    previewLimit: envInt(env, "QUOTE_INTAKE_GRAPH_PREVIEW_LIMIT", DEFAULT_GRAPH_PREVIEW_LIMIT, {
      min: 1,
      max: 50
    }),
    importLimit: envInt(env, "QUOTE_INTAKE_GRAPH_IMPORT_LIMIT", DEFAULT_GRAPH_IMPORT_LIMIT, {
      min: 1,
      max: 25
    }),
    maxAttachmentBytes: envInt(
      env,
      "QUOTE_INTAKE_GRAPH_MAX_ATTACHMENT_BYTES",
      DEFAULT_GRAPH_MAX_ATTACHMENT_BYTES,
      { min: 1024, max: 100 * 1024 * 1024 }
    ),
    maxTotalBytes: envInt(
      env,
      "QUOTE_INTAKE_GRAPH_MAX_TOTAL_BYTES",
      DEFAULT_GRAPH_MAX_TOTAL_BYTES,
      { min: 1024, max: 100 * 1024 * 1024 }
    )
  });
}

/**
 * Client-safe Graph flags — never includes secrets or mailbox address with credentials.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readSafeQuoteIntakeGraphConfig(env = process.env) {
  let configured = false;
  try {
    configured = Boolean(readQuoteIntakeGraphCredentials(env));
  } catch {
    configured = false;
  }
  const limits = readQuoteIntakeGraphLimits(env);
  return Object.freeze({
    graphEnabled: isQuoteIntakeGraphEnabled(env),
    mailboxSyncEnabled:
      isQuoteIntakeGraphEnabled(env) && isQuoteIntakeGraphManualSyncEnabled(env),
    graphConfigured: configured,
    previewLimit: limits.previewLimit,
    importLimit: limits.importLimit,
    /** Fixed mailbox display — known pilot address only when Graph sync is enabled. */
    mailboxDisplay:
      isQuoteIntakeGraphEnabled(env) && isQuoteIntakeGraphManualSyncEnabled(env)
        ? readQuoteIntakeGraphMailbox(env)
        : null
  });
}
