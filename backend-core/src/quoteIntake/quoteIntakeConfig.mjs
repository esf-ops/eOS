/**
 * Quote Intake — Phase 6P.1/6P.2 safe config + feature flags.
 * Off-by-default. Never exposes secrets.
 */

import { readQuoteIntakeRepositoryMode } from "./quoteIntakeRepositoryFactory.mjs";

/** Env: set exactly "1" to enable API registration and handlers. */
export const QUOTE_INTAKE_API_ENABLED_ENV = "QUOTE_INTAKE_API_ENABLED";

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isQuoteIntakeApiEnabled(env = process.env) {
  return String(env[QUOTE_INTAKE_API_ENABLED_ENV] ?? "").trim() === "1";
}

/**
 * Optional comma-separated pilot email allowlist.
 * When empty/unset, any authenticated ai_takeoff user may call the API (still org-scoped).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function readQuoteIntakePilotEmails(env = process.env) {
  const raw = String(env.QUOTE_INTAKE_PILOT_EMAILS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Client-safe config. Never includes secrets, tokens, mailbox addresses with credentials, etc.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readSafeQuoteIntakeConfig(env = process.env) {
  let repositoryMode = "memory";
  try {
    repositoryMode = readQuoteIntakeRepositoryMode(env);
  } catch {
    repositoryMode = "misconfigured";
  }
  return Object.freeze({
    phase: "6P.2",
    quoteIntakeApiEnabled: isQuoteIntakeApiEnabled(env),
    repositoryMode,
    graphEnabled: false,
    mailboxSyncEnabled: false,
    automaticTakeoffEnabled: false,
    takeoffInvocationEnabled: false,
    realPlanTransmissionEnabled: false,
    ieImportEnabled: false,
    quoteLibraryPromotionEnabled: false,
    outboundEmailEnabled: false,
    pilotAllowlistConfigured: readQuoteIntakePilotEmails(env).length > 0
  });
}
