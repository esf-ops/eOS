/**
 * Pure gate: decide whether a processReportFeedLocal result is eligible for prepared-fact promotion.
 * No Supabase client. No IO.
 *
 * v1 policy on unmatched rows:
 *   Unmatched (needs_identity_review) rows are persisted to moraware_report_raw_rows in all cases.
 *   For prepared-fact promotion the run must be 'validated' with no ambiguous/schema-drift/duplicate
 *   conditions. Unmatched rows are promoted with identity_status='needs_identity_review' and null IDs
 *   so operators can review them in the dashboard without blocking the whole import.
 *
 * Promotion blocks hard on:
 *   - status !== 'validated'
 *   - schema drift detected
 *   - header hash mismatch (if both hashes present)
 *   - any ambiguous_identity rows
 *   - any duplicate row hashes (duplicatePreparedFacts in enrichment)
 *   - zero data rows
 */

/**
 * @param {object} processResult   - Return value of processReportFeedLocal
 * @returns {{ ok: boolean, reason: string|null, details?: object }}
 */
export function shouldPromoteReportRun(processResult) {
  if (!processResult || typeof processResult !== "object") {
    return { ok: false, reason: "invalid_process_result" };
  }

  const { runStatus, schemaDrift, enrichment, profile } = processResult;

  if (runStatus !== "validated") {
    return {
      ok: false,
      reason: "run_not_validated",
      details: { runStatus }
    };
  }

  if (schemaDrift?.detected) {
    return {
      ok: false,
      reason: "schema_drift_detected",
      details: {
        observedHash: schemaDrift.observedHash ?? null,
        expectedHash: schemaDrift.expectedHash ?? null,
        missingHeaders: schemaDrift.missingHeaders ?? [],
        unexpectedHeaders: schemaDrift.unexpectedHeaders ?? []
      }
    };
  }

  // Explicit hash mismatch check for when schemaDrift may not yet be populated.
  const { headerValidation } = processResult;
  if (
    headerValidation?.expectedHash &&
    headerValidation?.observedHash &&
    headerValidation.observedHash !== headerValidation.expectedHash
  ) {
    return {
      ok: false,
      reason: "header_hash_mismatch",
      details: {
        observedHash: headerValidation.observedHash,
        expectedHash: headerValidation.expectedHash
      }
    };
  }

  const rowCount = profile?.rowCount ?? enrichment?.rows?.length ?? 0;
  if (rowCount === 0) {
    return { ok: false, reason: "zero_rows" };
  }

  const ambiguousCount = enrichment?.counts?.ambiguous_identity ?? 0;
  if (ambiguousCount > 0) {
    return {
      ok: false,
      reason: "ambiguous_identity_rows",
      details: { ambiguousCount }
    };
  }

  const duplicates = enrichment?.duplicatePreparedFacts ?? [];
  if (duplicates.length > 0) {
    return {
      ok: false,
      reason: "duplicate_row_hashes",
      details: { duplicateCount: duplicates.length, examples: duplicates.slice(0, 3) }
    };
  }

  return { ok: true, reason: null };
}
