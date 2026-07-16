/**
 * Elite 100 Estimate Studio — server flags & pilot allowlist (Phase DE.1.1).
 * Exact "1" enables the Studio feature. Pilot lists default empty (no grants in source).
 * Never expose pilot IDs/emails via VITE_* or public responses beyond a boolean for the caller.
 */

export const ELITE100_ESTIMATE_STUDIO_HEAD_SLUG = "elite100_estimate_studio";

export function isElite100EstimateStudioEnabled(env = process.env) {
  return String(env.ELITE100_ESTIMATE_STUDIO_ENABLED ?? "").trim() === "1";
}

/**
 * @param {string|undefined|null} raw
 * @returns {Set<string>}
 */
function parseCsvSet(raw) {
  const set = new Set();
  for (const part of String(raw ?? "").split(",")) {
    const v = part.trim().toLowerCase();
    if (v) set.add(v);
  }
  return set;
}

/**
 * Pilot allowlist from server env only. Empty ⇒ nobody is pilot (fail closed).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readElite100EstimateStudioPilotConfig(env = process.env) {
  const ids = parseCsvSet(env.ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS);
  // Preserve original case for UUIDs — compare case-insensitively via lowercased set of ids.
  const emails = parseCsvSet(env.ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS);
  return {
    pilotUserIds: ids,
    pilotEmails: emails,
    hasAnyPilotConstraint: ids.size > 0 || emails.size > 0
  };
}

/**
 * Authenticated user must match server-side pilot allowlist.
 * - User ID allowlist is primary when present.
 * - Email allowlist is an additional constraint when present (must also match).
 * - If both lists empty → fail closed (no pilots configured).
 * Never trusts body/query/header claims — only `req.user` from auth middleware.
 *
 * @param {{ id?: string, email?: string }|null|undefined} user
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isElite100EstimateStudioPilotUser(user, env = process.env) {
  if (!user || !user.id) return false;
  const cfg = readElite100EstimateStudioPilotConfig(env);
  if (!cfg.hasAnyPilotConstraint) return false;

  const uid = String(user.id).trim().toLowerCase();
  const email = String(user.email ?? "")
    .trim()
    .toLowerCase();

  if (cfg.pilotUserIds.size > 0) {
    if (!cfg.pilotUserIds.has(uid)) return false;
  }
  if (cfg.pilotEmails.size > 0) {
    if (!email || !cfg.pilotEmails.has(email)) return false;
  }
  return true;
}

/**
 * Safe config for authenticated Studio callers (no pilot PII lists).
 */
export function readSafeElite100EstimateStudioConfig(env = process.env) {
  return {
    studioEnabled: isElite100EstimateStudioEnabled(env),
    headSlug: ELITE100_ESTIMATE_STUDIO_HEAD_SLUG,
    headUrl: String(env.HEAD_URL_ELITE100_ESTIMATE_STUDIO ?? "").trim() || null,
    digitalEstimatePublicBaseUrl: String(
      env.HEAD_URL_DIGITAL_ESTIMATE || env.DIGITAL_ESTIMATE_PUBLIC_BASE_URL || ""
    )
      .trim()
      .replace(/\/+$/, "") || "https://digital.eliteosfab.com"
  };
}
