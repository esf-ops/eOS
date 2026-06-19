/**
 * Report-feed schema drift policy.
 *
 * When expected_column_hash is null, expected_columns define required core headers only.
 * Extra columns (e.g. view 222 "First Install - ...") are allowed and preserved in raw_row.
 */

/**
 * @param {object} params
 * @param {string|null|undefined} params.expectedColumnHash
 * @param {{ headerHash?: string }} params.profile
 * @param {{ missingHeaders?: string[], unexpectedHeaders?: string[] }} params.headerValidation
 */
export function buildSchemaDrift({ expectedColumnHash, profile, headerValidation }) {
  const missingHeaders = headerValidation?.missingHeaders ?? [];
  const unexpectedHeaders = headerValidation?.unexpectedHeaders ?? [];

  if (expectedColumnHash && profile?.headerHash !== expectedColumnHash) {
    return {
      detected: true,
      observedHash: profile?.headerHash ?? null,
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
 *
 * @param {object|null|undefined} schemaDrift
 */
export function isSchemaDriftBlocking(schemaDrift) {
  if (!schemaDrift?.detected) return false;
  if ((schemaDrift.missingHeaders ?? []).length > 0) return true;
  if (
    schemaDrift.expectedHash &&
    schemaDrift.observedHash &&
    schemaDrift.observedHash !== schemaDrift.expectedHash
  ) {
    return true;
  }
  return false;
}
