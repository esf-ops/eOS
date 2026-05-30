import { computeReportRowHash } from "./hashUtils.js";
import { normalizeSpaces } from "./parseCsv.js";
import { makeIdentityMatchKey } from "./textNormalize.js";

export const IDENTITY_STATUS = {
  MATCHED: "matched",
  UNMATCHED: "needs_identity_review",
  AMBIGUOUS: "ambiguous_identity"
};

function pickColumn(headers, patterns) {
  const hs = headers.map((h) => normalizeSpaces(h).toLowerCase());
  for (const pat of patterns) {
    const re = typeof pat === "string" ? new RegExp(pat, "i") : pat;
    const idx = hs.findIndex((h) => re.test(h));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

/**
 * Resolve canonical column names for Sales Worksheet Facts-style exports.
 */
export function resolveSalesWorksheetColumnNames(headers) {
  return {
    accountName: pickColumn(headers, ["^account\\s*name$"]),
    jobName: pickColumn(headers, ["^job\\s*name$"]),
    jobStatus: pickColumn(headers, ["^job\\s*status$"]),
    jobCreationDate: pickColumn(headers, ["^job\\s*creation\\s*date$"]),
    jobSalesperson: pickColumn(headers, ["^job\\s*salesperson$", "^salesperson$"]),
    totalWorksheetSqft: pickColumn(headers, ["total\\s*job\\s*worksheet\\s*sq", "worksheet.*sq", "sq\\s*\\.?\\s*ft"]),
    color: pickColumn(headers, ["^color$", "worksheet.*color"]),
    stone: pickColumn(headers, ["^stone$", "^material$"]),
    room: pickColumn(headers, ["^room$"]),
    branchOrProcess: pickColumn(headers, ["^branch$", "^process$", "branch\\s*or\\s*process"])
  };
}

function lookupIdentityMatches(key, identityMap, duplicateKeys) {
  const duplicateForKey = (duplicateKeys || []).filter((d) => d.key === key);
  if (duplicateForKey.length) {
    return { status: IDENTITY_STATUS.AMBIGUOUS, matches: duplicateForKey.map((d) => d.incoming), reason: "duplicate_html_identity_key" };
  }
  const direct = identityMap?.get?.(key);
  if (direct) return { status: IDENTITY_STATUS.MATCHED, matches: [direct], reason: null };
  return { status: IDENTITY_STATUS.UNMATCHED, matches: [], reason: "no_html_identity_match" };
}

/**
 * Enrich parsed CSV rows with Moraware account/job IDs from HTML identity map.
 */
export function enrichReportRowsWithIdentity(params) {
  const {
    headers,
    rows,
    identityMap,
    duplicateKeys = [],
    organizationId = "",
    reportType = "sales_worksheet_facts",
    columnNames = null
  } = params;

  const cols = columnNames || resolveSalesWorksheetColumnNames(headers);
  const enriched = [];
  const rowHashSeen = new Map();
  const duplicatePreparedFacts = [];

  for (const row of rows || []) {
    const accountName = cols.accountName ? normalizeSpaces(row[cols.accountName]) : "";
    const jobName = cols.jobName ? normalizeSpaces(row[cols.jobName]) : "";
    const jobStatus = cols.jobStatus ? normalizeSpaces(row[cols.jobStatus]) : "";
    const jobCreationDate = cols.jobCreationDate ? normalizeSpaces(row[cols.jobCreationDate]) : "";
    const key = makeIdentityMatchKey(accountName, jobName);
    const lookup = lookupIdentityMatches(key, identityMap, duplicateKeys);
    const match = lookup.matches[0] ?? null;

    const rowHash = computeReportRowHash({
      organizationId,
      reportType,
      accountName,
      jobName,
      jobStatus,
      jobCreationDate,
      row
    });

    let identityStatus = lookup.status;
    if (rowHashSeen.has(rowHash)) {
      identityStatus = IDENTITY_STATUS.AMBIGUOUS;
      duplicatePreparedFacts.push({
        rowHash,
        firstRowNumber: rowHashSeen.get(rowHash),
        duplicateRowNumber: enriched.length + 1
      });
    } else {
      rowHashSeen.set(rowHash, enriched.length + 1);
    }

    enriched.push({
      rowNumber: enriched.length + 1,
      rowHash,
      identityStatus,
      identityReason: lookup.reason,
      accountName,
      jobName,
      accountId: match?.accountId ?? null,
      jobId: match?.jobId ?? null,
      jobStatus,
      jobCreationDate,
      jobSalesperson: cols.jobSalesperson ? normalizeSpaces(row[cols.jobSalesperson]) : "",
      totalWorksheetSqft: cols.totalWorksheetSqft ? normalizeSpaces(row[cols.totalWorksheetSqft]) : "",
      color: cols.color ? normalizeSpaces(row[cols.color]) : "",
      stone: cols.stone ? normalizeSpaces(row[cols.stone]) : "",
      room: cols.room ? normalizeSpaces(row[cols.room]) : "",
      branchOrProcess: cols.branchOrProcess ? normalizeSpaces(row[cols.branchOrProcess]) : "",
      rawRow: row
    });
  }

  const counts = enriched.reduce(
    (acc, row) => {
      acc[row.identityStatus] = (acc[row.identityStatus] || 0) + 1;
      return acc;
    },
    { matched: 0, needs_identity_review: 0, ambiguous_identity: 0 }
  );

  return {
    columnNames: cols,
    rows: enriched,
    counts,
    duplicatePreparedFacts
  };
}
