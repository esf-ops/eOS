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

/**
 * Authoritative max for a single plan PDF on the Quote Intake → Open Estimate path.
 * Default 50 MiB supports normal multi-page cabinet-plan PDFs. Hard ceiling 100 MiB.
 * Env: QUOTE_INTAKE_MAX_PDF_BYTES (preferred) or legacy QUOTE_INTAKE_GRAPH_MAX_ATTACHMENT_BYTES.
 */
export const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024;
export const HARD_MAX_PDF_BYTES = 100 * 1024 * 1024;
/** @deprecated Use DEFAULT_MAX_PDF_BYTES — kept for callers that still name the Graph limit. */
export const DEFAULT_GRAPH_MAX_ATTACHMENT_BYTES = DEFAULT_MAX_PDF_BYTES;
export const DEFAULT_GRAPH_MAX_TOTAL_BYTES = DEFAULT_MAX_PDF_BYTES;

function envFlagOn(env, name) {
  return String(env?.[name] ?? "").trim() === "1";
}

/**
 * Parse a positive integer env var. Empty / missing / non-numeric → fallback.
 * (Previously treated missing as 0 and clamped to `min`, silently overriding
 * multi-megabyte PDF defaults to 1024 bytes.)
 */
function envInt(env, name, fallback, { min = 1, max = 10_000 } = {}) {
  const raw = String(env?.[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Human-readable MiB for estimator-facing errors (one decimal under 10 MB).
 * @param {number} bytes
 */
export function formatPdfSizeMb(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "0";
  const mb = n / (1024 * 1024);
  if (mb >= 10) return String(Math.round(mb));
  if (mb >= 1) return mb.toFixed(1).replace(/\.0$/, "");
  if (mb >= 0.1) return mb.toFixed(1);
  return mb < 0.01 ? "<0.01" : mb.toFixed(2);
}

/**
 * Authoritative single-PDF byte limit (server env only — never from the browser).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readQuoteIntakeMaxPdfBytes(env = process.env) {
  // Prefer the product-facing name; fall back to the legacy Graph-named vars.
  const preferred = String(env?.QUOTE_INTAKE_MAX_PDF_BYTES ?? "").trim();
  const legacy = String(env?.QUOTE_INTAKE_GRAPH_MAX_ATTACHMENT_BYTES ?? "").trim();
  const raw = preferred || legacy;
  if (!raw) return DEFAULT_MAX_PDF_BYTES;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MAX_PDF_BYTES;
  return Math.min(HARD_MAX_PDF_BYTES, Math.max(1024, Math.floor(n)));
}

/**
 * Build a safe human-readable size rejection (no env var names or internal paths).
 * @param {number} actualBytes
 * @param {number} limitBytes
 */
export function pdfTooLargeError(actualBytes, limitBytes) {
  const actual = formatPdfSizeMb(actualBytes);
  const limit = formatPdfSizeMb(limitBytes);
  const err = new Error(`This PDF is ${actual} MB. The current limit is ${limit} MB.`);
  err.code = "attachment_too_large";
  err.statusCode = 413;
  err.actualBytes = Number(actualBytes);
  err.limitBytes = Number(limitBytes);
  err.actualMb = actual;
  err.limitMb = limit;
  return err;
}

/**
 * Reject from metadata before downloading bytes when Graph declares an oversized size.
 * Does not trust metadata alone for acceptance — callers must still check downloaded length.
 * @param {number|null|undefined} declaredSizeBytes
 * @param {number} limitBytes
 */
export function assertPdfMetadataWithinLimit(declaredSizeBytes, limitBytes) {
  const size = Number(declaredSizeBytes);
  if (!Number.isFinite(size) || size <= 0) return;
  if (size > limitBytes) {
    throw pdfTooLargeError(size, limitBytes);
  }
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
  const maxPdfBytes = readQuoteIntakeMaxPdfBytes(env);
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
    /** Authoritative single-PDF ceiling (QUOTE_INTAKE_MAX_PDF_BYTES). */
    maxAttachmentBytes: maxPdfBytes,
    maxPdfBytes,
    maxTotalBytes: envInt(env, "QUOTE_INTAKE_GRAPH_MAX_TOTAL_BYTES", maxPdfBytes, {
      min: 1024,
      max: HARD_MAX_PDF_BYTES
    })
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
    /** Safe display of the authoritative PDF ceiling (MB string). */
    maxPdfMb: formatPdfSizeMb(limits.maxPdfBytes),
    maxPdfBytes: limits.maxPdfBytes,
    /** Fixed mailbox display — known pilot address only when Graph sync is enabled. */
    mailboxDisplay:
      isQuoteIntakeGraphEnabled(env) && isQuoteIntakeGraphManualSyncEnabled(env)
        ? readQuoteIntakeGraphMailbox(env)
        : null
  });
}
