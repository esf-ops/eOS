/**
 * Report-feed schema drift policy.
 *
 * When expected_column_hash is null, expected_columns define required core headers only.
 * Extra columns (e.g. view 222 "First Install - ...") are allowed and preserved in raw_row.
 *
 * When acceptedHeaderHashes is set (view 219 Challenging vs Billable versions),
 * the observed header hash must match one accepted version. Unknown hashes fail
 * even if required columns are present.
 */

/**
 * @param {object} params
 * @param {string|null|undefined} params.expectedColumnHash
 * @param {{ headerHash?: string }} params.profile
 * @param {{ missingHeaders?: string[], unexpectedHeaders?: string[], ok?: boolean, contractVersion?: string|null, observedHash?: string }} params.headerValidation
 * @param {Array<{ version?: string, hash?: string }>|null} [params.acceptedHeaderHashes]
 */
export function buildSchemaDrift({ expectedColumnHash, profile, headerValidation, acceptedHeaderHashes = null }) {
  const missingHeaders = headerValidation?.missingHeaders ?? [];
  const unexpectedHeaders = headerValidation?.unexpectedHeaders ?? [];
  const accepted = Array.isArray(acceptedHeaderHashes) ? acceptedHeaderHashes.filter((v) => v?.hash) : [];
  const observedHash = profile?.headerHash ?? headerValidation?.observedHash ?? null;

  if (accepted.length > 0) {
    const match = accepted.find((v) => v.hash === observedHash) ?? null;
    if (missingHeaders.length > 0) {
      return {
        detected: true,
        observedHash,
        acceptedHashes: accepted.map((v) => v.hash),
        contractVersion: null,
        missingHeaders,
        unexpectedHeaders
      };
    }
    if (!match) {
      return {
        detected: true,
        observedHash,
        acceptedHashes: accepted.map((v) => v.hash),
        contractVersion: null,
        reason: "unknown_header_hash",
        missingHeaders,
        unexpectedHeaders
      };
    }
    return {
      detected: false,
      observedHash,
      contractVersion: match.version ?? headerValidation?.contractVersion ?? null,
      extraHeaders: unexpectedHeaders
    };
  }

  if (expectedColumnHash && observedHash !== expectedColumnHash) {
    return {
      detected: true,
      observedHash,
      expectedHash: expectedColumnHash,
      missingHeaders,
      unexpectedHeaders
    };
  }

  if (missingHeaders.length > 0) {
    return {
      detected: true,
      missingHeaders,
      unexpectedHeaders
    };
  }

  if (unexpectedHeaders.length > 0) {
    return {
      detected: false,
      extraHeaders: unexpectedHeaders
    };
  }

  return { detected: false };
}

/**
 * Whether persisted schema_drift should block promotion/staging success.
 * Unexpected-only drift (core contract satisfied, no hash lock) is non-blocking.
 * Accepted-hash contracts block on missing required columns or unknown hash.
 *
 * @param {object|null|undefined} schemaDrift
 */
export function isSchemaDriftBlocking(schemaDrift) {
  if (!schemaDrift?.detected) return false;
  if ((schemaDrift.missingHeaders ?? []).length > 0) return true;
  if (schemaDrift.reason === "unknown_header_hash") return true;
  if (
    Array.isArray(schemaDrift.acceptedHashes) &&
    schemaDrift.acceptedHashes.length > 0 &&
    schemaDrift.detected
  ) {
    return true;
  }
  if (
    schemaDrift.expectedHash &&
    schemaDrift.observedHash &&
    schemaDrift.observedHash !== schemaDrift.expectedHash
  ) {
    return true;
  }
  return false;
}
