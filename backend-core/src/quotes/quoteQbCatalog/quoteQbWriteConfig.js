/**
 * Phase 1 — QuickBooks write environment / company allowlist config.
 * Fail closed. Production company must never appear on the TEST allowlist.
 */

import { QB_WRITE_ENV_TEST } from "./quoteQbWriteSafety.js";

/**
 * Parse comma/newline-separated allowlist.
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
export function parseCompanyAllowlist(raw) {
  if (raw == null || !String(raw).trim()) return [];
  return String(raw)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function loadQbWriteConfig(env = process.env) {
  const writeEnabled = String(env.QB_WRITE_ENABLED || "").trim().toLowerCase() === "true";
  const writeEnv = String(env.QB_WRITE_ENV || "").trim().toLowerCase();
  const dryRunRaw = String(env.QB_WRITE_DRY_RUN ?? "true").trim().toLowerCase();
  const dryRun = dryRunRaw !== "false" && dryRunRaw !== "0";
  const allowlist = parseCompanyAllowlist(env.QB_WRITE_TEST_COMPANY_ALLOWLIST);
  const forbidden = parseCompanyAllowlist(env.QB_WRITE_FORBIDDEN_COMPANY_IDENTITIES);
  const organizationId = String(env.QB_WRITE_ORGANIZATION_ID || "").trim();
  const testCustomerName = String(env.QB_WRITE_TEST_CUSTOMER_NAME || "ELITEOS TEST CUSTOMER").trim();
  const qbXmlVersion = String(env.QBXML_VERSION || "13.0").trim() || "13.0";

  return {
    writeEnabled,
    writeEnv,
    dryRun,
    allowlist,
    forbidden,
    organizationId,
    testCustomerName,
    qbXmlVersion
  };
}

/**
 * Validate config before any SDK session / queue claim.
 * @param {ReturnType<typeof loadQbWriteConfig>} config
 */
export function validateQbWriteConfig(config) {
  /** @type {Array<{ code: string, message: string, field?: string }>} */
  const errors = [];

  if (!config.writeEnabled) {
    errors.push({
      code: "QB_WRITE_DISABLED",
      message: 'QB_WRITE_ENABLED must be "true".',
      field: "QB_WRITE_ENABLED"
    });
  }
  if (config.writeEnv !== QB_WRITE_ENV_TEST) {
    errors.push({
      code: "QB_WRITE_ENV_NOT_TEST",
      message: 'QB_WRITE_ENV must be "test".',
      field: "QB_WRITE_ENV"
    });
  }
  if (!config.dryRun) {
    // Phase 1 hard rule: dry-run must remain true. Real transmit is a later phase.
    errors.push({
      code: "QB_WRITE_DRY_RUN_REQUIRED",
      message: "Phase 1 requires QB_WRITE_DRY_RUN=true. EstimateAdd transmission is disabled.",
      field: "QB_WRITE_DRY_RUN"
    });
  }
  if (!config.organizationId) {
    errors.push({
      code: "QB_WRITE_ORGANIZATION_ID_REQUIRED",
      message: "QB_WRITE_ORGANIZATION_ID is required.",
      field: "QB_WRITE_ORGANIZATION_ID"
    });
  }
  if (!config.allowlist.length) {
    errors.push({
      code: "QB_WRITE_TEST_ALLOWLIST_REQUIRED",
      message: "QB_WRITE_TEST_COMPANY_ALLOWLIST must list at least one TEST company identity.",
      field: "QB_WRITE_TEST_COMPANY_ALLOWLIST"
    });
  }

  for (const allowed of config.allowlist) {
    const lower = allowed.toLowerCase();
    if (config.forbidden.some((f) => f === allowed || f.toLowerCase() === lower)) {
      errors.push({
        code: "QB_ALLOWLIST_CONTAINS_FORBIDDEN",
        message: "TEST company allowlist must not include a forbidden/production company identity.",
        field: "QB_WRITE_TEST_COMPANY_ALLOWLIST"
      });
    }
    // Hard reject obvious production labels on allowlist
    if (
      !lower.includes("test") &&
      (lower.includes("elite stone fabrications") ||
        lower.includes("production") ||
        lower.includes(" live"))
    ) {
      errors.push({
        code: "QB_ALLOWLIST_LOOKS_LIKE_PRODUCTION",
        message: `Allowlist entry looks like production and lacks "test": rejected.`,
        field: "QB_WRITE_TEST_COMPANY_ALLOWLIST"
      });
    }
  }

  return { ok: errors.length === 0, errors, config };
}

/**
 * Exact allowlist match only — no fuzzy fallback.
 * @param {string} companyIdentity
 * @param {string[]} allowlist
 * @param {string[]} [forbidden]
 */
export function assertCompanyAllowlisted(companyIdentity, allowlist, forbidden = []) {
  /** @type {Array<{ code: string, message: string, field?: string }>} */
  const errors = [];
  const company = companyIdentity != null ? String(companyIdentity).trim() : "";
  if (!company) {
    errors.push({
      code: "QB_COMPANY_IDENTITY_REQUIRED",
      message: "Connected QuickBooks company identity is required.",
      field: "companyIdentity"
    });
    return { ok: false, errors };
  }
  if (forbidden.some((f) => String(f).trim() === company)) {
    errors.push({
      code: "QB_PRODUCTION_COMPANY_REJECTED",
      message: "Connected company is on the forbidden/production list.",
      field: "companyIdentity"
    });
  }
  if (!allowlist.includes(company)) {
    errors.push({
      code: "QB_COMPANY_NOT_ALLOWLISTED",
      message: "Connected company identity is not exactly on the TEST allowlist.",
      field: "companyIdentity"
    });
  }
  return { ok: errors.length === 0, errors };
}
