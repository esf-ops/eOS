/**
 * Pure mapper: one enriched Sales Worksheet row → moraware_prepared_sales_worksheet_facts insert payload.
 * No Supabase client. No IO. No external dependencies.
 *
 * Field names match backend-core/supabase/eliteos_moraware_report_feeds.sql exactly.
 */

/**
 * Parse a sqft string from a Moraware CSV cell into a numeric value, or null.
 * Accepts "42.50", "42,50", "1,234.56", or blank/missing.
 * @param {string|null|undefined} raw
 * @returns {number|null}
 */
export function parseSqft(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/\u00A0/g, " ").trim();
  if (!s) return null;
  // Strip commas used as thousands separators, then parse.
  const cleaned = s.replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  // Cap at a sanity limit that prevents unit errors (e.g. raw acreage instead of sqft).
  if (n > 99_999) return null;
  return n;
}

/**
 * Map one enriched row (from enrichReportRowsWithIdentity) into a DB insert payload.
 *
 * @param {object} params
 * @param {object} params.enrichedRow     - One row from enrichment.rows
 * @param {string} params.organizationId
 * @param {string} params.reportFeedId    - UUID of the moraware_report_feeds row
 * @param {string} params.reportRunId     - UUID of the moraware_report_runs row
 * @param {Date|string|null} [params.promotedAt]  - Timestamp for promotion (defaults to now)
 * @returns {object} - Column values for moraware_prepared_sales_worksheet_facts
 */
export function mapPreparedSalesWorksheetFact(params) {
  const {
    enrichedRow,
    organizationId,
    reportFeedId,
    reportRunId,
    promotedAt = null
  } = params;

  if (!enrichedRow || typeof enrichedRow !== "object") {
    throw new TypeError("mapPreparedSalesWorksheetFact: enrichedRow is required");
  }
  if (!organizationId) throw new TypeError("mapPreparedSalesWorksheetFact: organizationId is required");
  if (!reportFeedId) throw new TypeError("mapPreparedSalesWorksheetFact: reportFeedId is required");
  if (!reportRunId) throw new TypeError("mapPreparedSalesWorksheetFact: reportRunId is required");

  const now = promotedAt ? new Date(promotedAt).toISOString() : new Date().toISOString();

  // Do not silently invent IDs — pass null when absent.
  const accountId = enrichedRow.accountId != null && String(enrichedRow.accountId).trim()
    ? String(enrichedRow.accountId).trim()
    : null;
  const jobId = enrichedRow.jobId != null && String(enrichedRow.jobId).trim()
    ? String(enrichedRow.jobId).trim()
    : null;

  return {
    organization_id: organizationId,
    report_feed_id: reportFeedId,
    report_run_id: reportRunId,
    row_hash: String(enrichedRow.rowHash ?? ""),
    account_id: accountId,
    account_name: enrichedRow.accountName || null,
    job_id: jobId,
    job_name: enrichedRow.jobName || null,
    job_status: enrichedRow.jobStatus || null,
    job_creation_date: enrichedRow.jobCreationDate || null,
    job_salesperson: enrichedRow.jobSalesperson || null,
    total_worksheet_sqft: parseSqft(enrichedRow.totalWorksheetSqft),
    color: enrichedRow.color || null,
    stone: enrichedRow.stone || null,
    room: enrichedRow.room || null,
    branch_or_process: enrichedRow.branchOrProcess || null,
    identity_status: String(enrichedRow.identityStatus ?? "needs_identity_review"),
    raw_row: enrichedRow.rawRow ?? {},
    is_active: true,
    promoted_at: now,
    superseded_at: null,
    superseded_by: null
  };
}
