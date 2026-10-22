/**
 * Future QuickBooks write safety contracts (Phase 0).
 *
 * Pure validation — no QuickBooks session, no EstimateAdd, no network I/O.
 */

export const QB_WRITE_ENV_TEST = "test";
export const QB_WRITE_ENV_PRODUCTION = "production";
export const QB_TEST_QUOTE_PREFIX = "QBTEST-";

export const QB_WRITE_QUEUE_STATUSES = Object.freeze([
  "pending",
  "claimed",
  "succeeded",
  "failed",
  "canceled"
]);

/**
 * @typedef {{
 *   writeEnvironment: string|null|undefined,
 *   quoteNumber: string|null|undefined,
 *   companyIdentity: string|null|undefined,
 *   allowedCompanyIdentities: ReadonlyArray<string>|null|undefined,
 *   idempotencyKey: string|null|undefined,
 *   existingQueueStatus: string|null|undefined,
 *   rejectProductionCompany: boolean
 * }} QbWriteSafetyInput
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   errors: Array<{ code: string, message: string, field?: string }>
 * }} QbWriteSafetyResult
 */

/**
 * @param {QbWriteSafetyInput} input
 * @returns {QbWriteSafetyResult}
 */
export function validateQbWriteSafetyGate(input) {
  /** @type {Array<{ code: string, message: string, field?: string }>} */
  const errors = [];

  const env = input?.writeEnvironment != null ? String(input.writeEnvironment).trim().toLowerCase() : "";
  if (env !== QB_WRITE_ENV_TEST) {
    errors.push({
      code: "QB_WRITE_ENV_NOT_TEST",
      message: `QuickBooks write environment must be "${QB_WRITE_ENV_TEST}" (got "${env || "(empty)"}").`,
      field: "writeEnvironment"
    });
  }

  const quoteNumber = input?.quoteNumber != null ? String(input.quoteNumber).trim() : "";
  if (!quoteNumber.startsWith(QB_TEST_QUOTE_PREFIX)) {
    errors.push({
      code: "QB_TEST_QUOTE_PREFIX_REQUIRED",
      message: `Quote number must start with "${QB_TEST_QUOTE_PREFIX}".`,
      field: "quoteNumber"
    });
  }

  const company = input?.companyIdentity != null ? String(input.companyIdentity).trim() : "";
  const allowlist = Array.isArray(input?.allowedCompanyIdentities)
    ? input.allowedCompanyIdentities.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (!company) {
    errors.push({
      code: "QB_COMPANY_IDENTITY_REQUIRED",
      message: "Company identity is required for QuickBooks writes.",
      field: "companyIdentity"
    });
  } else if (allowlist.length === 0) {
    errors.push({
      code: "QB_COMPANY_ALLOWLIST_REQUIRED",
      message: "An explicit company allowlist is required.",
      field: "allowedCompanyIdentities"
    });
  } else if (!allowlist.includes(company)) {
    errors.push({
      code: "QB_COMPANY_NOT_ALLOWLISTED",
      message: "Company identity is not on the QuickBooks write allowlist.",
      field: "companyIdentity"
    });
  }

  if (input?.rejectProductionCompany !== false && env === QB_WRITE_ENV_TEST) {
    const lower = company.toLowerCase();
    if (lower && !lower.includes("test") && (lower.includes("prod") || lower.includes("live"))) {
      errors.push({
        code: "QB_PRODUCTION_COMPANY_REJECTED",
        message: "Production/live company identity rejected while test-only mode is active.",
        field: "companyIdentity"
      });
    }
  }

  const idempotencyKey = input?.idempotencyKey != null ? String(input.idempotencyKey).trim() : "";
  if (!idempotencyKey) {
    errors.push({
      code: "QB_IDEMPOTENCY_KEY_REQUIRED",
      message: "Idempotency key is required.",
      field: "idempotencyKey"
    });
  }

  const status = input?.existingQueueStatus != null ? String(input.existingQueueStatus).trim() : "";
  if (status === "succeeded") {
    errors.push({
      code: "QB_QUEUE_ALREADY_SUCCEEDED",
      message: "Succeeded queue items cannot be re-executed.",
      field: "existingQueueStatus"
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Intentionally unimplemented — proves Phase 0 has no write executor.
 * @param {never} [_args]
 * @returns {never}
 */
export function executeQbWriteQueueItem(_args) {
  throw new Error(
    "executeQbWriteQueueItem is disabled in Phase 0. No QuickBooks write transport is implemented."
  );
}

/**
 * @param {never} [_args]
 * @returns {never}
 */
export function claimQbWriteQueueItem(_args) {
  throw new Error(
    "claimQbWriteQueueItem is disabled in Phase 0. Queue schema only — no worker may claim jobs."
  );
}

export const FORBIDDEN_QB_WRITE_PHASE0_APIS = Object.freeze([
  "EstimateAdd",
  "EstimateMod",
  "InvoiceAdd",
  "CustomerAdd",
  "executeQbWriteQueueItem",
  "claimQbWriteQueueItem"
]);
