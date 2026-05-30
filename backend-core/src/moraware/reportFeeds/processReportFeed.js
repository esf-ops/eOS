import { parseCsvReportRows } from "./parseCsv.js";
import { profileReportColumns, validateHeaderContract } from "./profileColumns.js";
import { parseReportHtmlIdentityRows } from "./parseReportHtml.js";
import { buildIdentityMapFromHtmlRows } from "./buildIdentityMap.js";
import { enrichReportRowsWithIdentity, IDENTITY_STATUS } from "./enrichReportRows.js";
import { computeHeaderHash } from "./hashUtils.js";

export { IDENTITY_STATUS };

/**
 * End-to-end local report-feed processing for CSV + HTML inputs.
 * Dry-run friendly — no network or database writes.
 */
export function processReportFeedLocal(params) {
  const {
    csvText,
    htmlText,
    organizationId = "",
    reportType = "sales_worksheet_facts",
    expectedColumns = [],
    expectedColumnHash = null,
    morawareViewId = null
  } = params;

  const parsed = parseCsvReportRows(csvText);
  const profile = profileReportColumns(parsed);
  const headerValidation = validateHeaderContract(profile, expectedColumns, expectedColumnHash);

  const htmlIdentityRows = parseReportHtmlIdentityRows(htmlText);
  const identityMapResult = buildIdentityMapFromHtmlRows(htmlIdentityRows);
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows,
    identityMap: identityMapResult.byKey,
    duplicateKeys: identityMapResult.duplicateKeys,
    organizationId,
    reportType
  });

  const schemaDrift =
    expectedColumnHash && profile.headerHash !== expectedColumnHash
      ? {
          detected: true,
          observedHash: profile.headerHash,
          expectedHash: expectedColumnHash
        }
      : headerValidation.missingHeaders.length || headerValidation.unexpectedHeaders.length
        ? {
            detected: true,
            missingHeaders: headerValidation.missingHeaders,
            unexpectedHeaders: headerValidation.unexpectedHeaders
          }
        : { detected: false };

  const runStatus = schemaDrift.detected
    ? "needs_review"
    : enrichment.counts[IDENTITY_STATUS.AMBIGUOUS] > 0
      ? "needs_review"
      : "validated";

  return {
    morawareViewId,
    reportType,
    organizationId,
    dryRun: true,
    runStatus,
    headerValidation,
    schemaDrift,
    profile,
    htmlIdentity: {
      rowCount: htmlIdentityRows.length,
      uniqueKeyCount: identityMapResult.uniqueKeyCount,
      duplicateKeyCount: identityMapResult.duplicateKeys.length,
      rows: htmlIdentityRows
    },
    enrichment,
    promotionPreview: {
      wouldPromote: runStatus === "validated",
      preparedFactCount: enrichment.rows.length,
      duplicatePreparedFacts: enrichment.duplicatePreparedFacts,
      note:
        "Production promotion supersedes prior prepared facts for this feed; failed runs keep last successful facts visible."
    }
  };
}

export function computeExpectedColumnHash(expectedColumns) {
  return computeHeaderHash(expectedColumns);
}

export { parseCsvReportRows } from "./parseCsv.js";
export { profileReportColumns, validateHeaderContract } from "./profileColumns.js";
export { parseReportHtmlIdentityRows } from "./parseReportHtml.js";
export { buildIdentityMapFromHtmlRows } from "./buildIdentityMap.js";
export { enrichReportRowsWithIdentity } from "./enrichReportRows.js";
export { computeHeaderHash, computeReportRowHash } from "./hashUtils.js";
export { makeIdentityMatchKey, normalizeReportName } from "./textNormalize.js";
export {
  SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
  SALES_WORKSHEET_FACTS_FEED_SEED,
  SALES_WORKSHEET_FACTS_REPORT_TYPE,
  SALES_WORKSHEET_FACTS_VIEW_ID
} from "./constants.js";
