/**
 * DE.2G.0 — Synthetic-only public publication allowlist (server-authoritative).
 *
 * Default: synthetic pilot ONLY is ON (fail closed).
 * Empty allowlist ⇒ no public publication is accessible.
 * Browser/name/example.com claims never establish synthetic authority.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hard bound on allowlist size (env CSV). */
export const DIGITAL_ESTIMATE_SYNTHETIC_ALLOWLIST_MAX = 64;

/**
 * Synthetic-only public access rail. Default ON unless explicitly "0".
 * REAL_CUSTOMER_PILOT (disabling this) is prohibited in DE.2G.0 operations.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isDigitalEstimateSyntheticPilotOnly(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY ?? "1").trim() !== "0";
}

/**
 * Parse and normalize publication UUID allowlist from server env only.
 * Rejects wildcards, non-UUIDs, and oversize lists (fail closed → empty).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Set<string>} lowercase UUIDs
 */
export function readDigitalEstimateSyntheticPublicationIds(env = process.env) {
  const raw = String(env.DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS ?? "").trim();
  if (!raw) return new Set();
  if (raw === "*" || raw.toLowerCase() === "all") {
    return new Set(); // wildcard forbidden
  }
  const out = new Set();
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (!id) continue;
    if (id === "*" || id === "all") continue;
    if (!UUID_RE.test(id)) continue;
    out.add(id);
    if (out.size >= DIGITAL_ESTIMATE_SYNTHETIC_ALLOWLIST_MAX) break;
  }
  return out;
}

/**
 * @param {string|null|undefined} publicationId
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isSyntheticPublicationAllowlisted(publicationId, env = process.env) {
  if (!isDigitalEstimateSyntheticPilotOnly(env)) {
    // When synthetic-only is explicitly off, allowlist is not consulted here.
    // REAL_CUSTOMER_PILOT remains operationally blocked in DE.2G.0 diagnostics.
    return true;
  }
  const id = String(publicationId ?? "")
    .trim()
    .toLowerCase();
  if (!id || !UUID_RE.test(id)) return false;
  const allow = readDigitalEstimateSyntheticPublicationIds(env);
  if (allow.size === 0) return false; // empty ⇒ fail closed
  return allow.has(id);
}

/**
 * Reject caller-controlled synthetic / real-customer authority claims.
 * @param {unknown} body
 */
export function rejectSyntheticCallerAuthority(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const forbidden = [
    "synthetic",
    "isSynthetic",
    "syntheticPilot",
    "synthetic_publication",
    "syntheticPublicationId",
    "allowlisted",
    "realCustomer",
    "real_customer",
    "bypassSynthetic",
    "DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS",
    "DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY"
  ];
  for (const k of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      const e = new Error("Not found");
      e.code = "not_found";
      e.statusCode = 404;
      throw e;
    }
  }
}

/**
 * Assert publication may be used on public DE surfaces. Generic 404 on failure.
 * @param {string|null|undefined} publicationId
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertSyntheticPublicationPublicAccess(publicationId, env = process.env) {
  if (isSyntheticPublicationAllowlisted(publicationId, env)) return;
  const e = new Error("Not found");
  e.code = "not_found";
  e.statusCode = 404;
  // Server/ops logs only — never returned to the browser on public routes.
  e.exchangeReason = isDigitalEstimateSyntheticPilotOnly(env)
    ? "synthetic_not_allowlisted"
    : "publication_not_publicly_accessible";
  throw e;
}

/**
 * Safe staff-facing public accessibility hint (no allowlist IDs).
 * @param {string|null|undefined} publicationId
 * @param {NodeJS.ProcessEnv} [env]
 */
export function describeSyntheticPublicAccessibility(publicationId, env = process.env) {
  const syntheticOnly = isDigitalEstimateSyntheticPilotOnly(env);
  if (!syntheticOnly) {
    return {
      syntheticPilotOnly: false,
      publiclyAccessible: true,
      awaitingSyntheticAllowlist: false,
      staffNotice: null
    };
  }
  const ok = isSyntheticPublicationAllowlisted(publicationId, env);
  return {
    syntheticPilotOnly: true,
    publiclyAccessible: ok,
    awaitingSyntheticAllowlist: !ok,
    staffNotice: ok
      ? null
      : "Customer configuration is blocked while DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY is on. Set DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=0 for live customer Digital Estimates, or add this publication UUID to DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS."
  };
}

/**
 * Safe config slice — never includes allowlist IDs.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readSafeSyntheticPilotConfig(env = process.env) {
  const ids = readDigitalEstimateSyntheticPublicationIds(env);
  return {
    syntheticPilotOnly: isDigitalEstimateSyntheticPilotOnly(env),
    syntheticAllowlistConfigured: ids.size > 0,
    syntheticAllowlistCount: ids.size,
    realCustomerPilotAuthorized: false // DE.2G.0 hard prohibition
  };
}
