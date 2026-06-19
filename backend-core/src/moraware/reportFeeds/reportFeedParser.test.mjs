/**
 * Run: npm run eos:test:moraware-report-feed
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeExpectedColumnHash,
  computeHeaderHash,
  computeReportRowHash,
  enrichReportRowsWithIdentity,
  buildExtraDiscriminators,
  IDENTITY_STATUS,
  parseCsvReportRows,
  parseReportHtmlIdentityRows,
  processReportFeedLocal,
  profileReportColumns,
  validateHeaderContract,
  buildIdentityMapFromHtmlRows,
  SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
  SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS,
  SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH,
  SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE
} from "./processReportFeed.js";
import {
  CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
  CALENDAR_SCHEDULE_REPORT_TYPE
} from "./calendarScheduleConstants.js";
import {
  buildSchemaDrift,
  isSchemaDriftBlocking
} from "./schemaDriftPolicy.js";
import { promoteCalendarScheduleRowsFromRun } from "./promoteCalendarScheduleRows.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../../../test/fixtures/moraware-report-feeds");
const csvFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.csv"), "utf8");
const htmlFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.html"), "utf8");
const historyFixtureCsv = readFileSync(join(fixtureDir, "sales-worksheet-history-facts.sample.csv"), "utf8");
const calendarScheduleFixtureCsv = readFileSync(join(fixtureDir, "calendar-schedule.sample.csv"), "utf8");

// Fixture layout:
// Row 0: North Branch - Sample Builders LLC | Kitchen Remodel Phase A | Countertop Form | Kitchen
// Row 1: North Branch - Sample Builders LLC | Kitchen Remodel Phase A | Backsplash Form | Kitchen Backsplash  (same job, different worksheet line)
// Row 2: North Branch - Sample Builders LLC | Laundry Counter Refresh
// Row 3: Demo Stone Partners           | Showroom Display Update
// Row 4: Fake Unmatched Account        | Unmatched Project  (no HTML match)
//
// HTML: 3 unique account+job entries → rows 0-3 matched, row 4 needs_identity_review

function testCsvParse() {
  const parsed = parseCsvReportRows(csvFixture);
  assert.equal(parsed.headers.length, 76, "csv: 76 real Moraware headers");
  assert.equal(parsed.rows.length, 5, "csv: 5 data rows");
  assert.ok(parsed.headers.includes("Account Name"), "csv: Account Name present");
  assert.ok(parsed.headers.includes("Job Name"), "csv: Job Name present");
  assert.ok(parsed.headers.includes("Job Worksheet - Room"), "csv: Job Worksheet - Room present");
  assert.ok(parsed.headers.includes("Job Worksheet - Color"), "csv: Job Worksheet - Color present");
  assert.ok(parsed.headers.includes("Job Worksheet - Form Name"), "csv: Job Worksheet - Form Name present");
  assert.ok(parsed.headers.includes("Total Job Worksheet - Sq.Ft. by Job Creation Date"), "csv: sqft column present");
  assert.ok(parsed.headers.includes("First Install - Quartz Basic in Job Status"), "csv: activity column present");
  assert.ok(parsed.headers.includes("First Customer Service - Challenging in Job Notes"), "csv: last activity column present");
  assert.ok(!parsed.headers.includes("Branch"), "csv: Branch not in real export headers");
  assert.equal(parsed.rows[0]["Job Name"], "Kitchen Remodel Phase A", "csv: first row Job Name");
  assert.equal(parsed.rows[1]["Job Name"], "Kitchen Remodel Phase A", "csv: second row same job (multi-worksheet)");
  assert.equal(parsed.rows[1]["Job Worksheet - Form Name"], "Backsplash Form", "csv: second row different form name");
}

function testColumnProfile() {
  const parsed = parseCsvReportRows(csvFixture);
  const profile = profileReportColumns(parsed);
  assert.equal(profile.rowCount, 5, "profile: 5 rows");
  assert.equal(profile.columnCount, 76, "profile: 76 columns");
  assert.equal(profile.columns[0].nonEmptyCount, 5, "profile: all 5 rows have Account Name");
  assert.ok(profile.columns[0].sampleValues.length >= 1, "profile: at least one sample value");
  assert.equal(typeof profile.headerHash, "string", "profile: headerHash is string");
  assert.equal(profile.headerHash.length, 64, "profile: headerHash is sha256 (64 hex chars)");
}

function testHeaderHashStable() {
  const parsed = parseCsvReportRows(csvFixture);
  const profileA = profileReportColumns(parsed);
  const profileB = profileReportColumns(parsed);
  assert.equal(profileA.headerHash, profileB.headerHash, "hash: stable across two calls");
}

// NBSP / trailing-space normalization: a CSV with "Account Name\u00A0" (NBSP) in the header
// row must produce the same header hash as a clean CSV (parseCsvReportRows normalizes).
// Builds the dirty CSV dynamically from SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS so it always
// matches the current column count.
function testNbspAndTrailingSpaceHeaderNormalization() {
  // Add NBSP to the first header; trailing space to the last
  const dirtyColumns = SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS.map((h, i) => {
    if (i === 0) return h + "\u00A0";
    if (i === SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS.length - 1) return h + " ";
    return h;
  });
  const fakeValues = SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS.map(() => "test");
  const dirtyHeaderRow = dirtyColumns.map((h) => `"${h}"`).join(",");
  const fakeDataRow = fakeValues.map((v) => `"${v}"`).join(",");
  const dirtyCsv = dirtyHeaderRow + "\n" + fakeDataRow + "\n";

  const parsedDirty = parseCsvReportRows(dirtyCsv);
  const parsedClean = parseCsvReportRows(csvFixture);
  const profileDirty = profileReportColumns(parsedDirty);
  const profileClean = profileReportColumns(parsedClean);

  assert.equal(profileDirty.headerHash, profileClean.headerHash,
    "normalization: NBSP/trailing-space header → same hash as clean");

  const expectedHash = computeExpectedColumnHash(SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS);
  const validation = validateHeaderContract(
    profileDirty,
    SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
    expectedHash
  );
  assert.equal(validation.ok, true,
    "normalization: NBSP/trailing-space header validates against clean expected_columns");
}

function testSchemaDriftDetection() {
  const parsed = parseCsvReportRows(csvFixture);
  const profile = profileReportColumns(parsed);
  const expectedHash = computeExpectedColumnHash(["Account Name", "Job Name", "Totally New Column"]);
  const validation = validateHeaderContract(profile, ["Account Name", "Job Name", "Totally New Column"], expectedHash);
  assert.equal(validation.ok, false, "drift: detected when expected columns differ");
  assert.ok(validation.missingHeaders.includes("Totally New Column"), "drift: missing column reported");
}

// Branch is NOT in the real export and must NOT be required for validation.
function testBranchNotRequired() {
  const parsed = parseCsvReportRows(csvFixture);
  const profile = profileReportColumns(parsed);
  const expectedHash = computeExpectedColumnHash(SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS);
  const validation = validateHeaderContract(profile, SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS, expectedHash);
  assert.equal(validation.ok, true, "branch: real headers validate without Branch");
  assert.ok(!validation.missingHeaders.includes("Branch"), "branch: Branch is not a required header");
}

function testHtmlIdentityExtraction() {
  const rows = parseReportHtmlIdentityRows(htmlFixture);
  assert.equal(rows.length, 3, "html: 3 identity rows from HTML fixture");
  assert.equal(rows[0].accountId, "462", "html: first entry account 462");
  assert.equal(rows[0].accountName, "North Branch - Sample Builders LLC", "html: first entry account name");
  assert.equal(rows[0].jobId, "37780", "html: first entry job 37780");
  assert.equal(rows[0].jobName, "Kitchen Remodel Phase A", "html: first entry job name");
}

function testEnrichmentMatching() {
  const parsed = parseCsvReportRows(csvFixture);
  const htmlRows = parseReportHtmlIdentityRows(htmlFixture);
  const identityMap = buildIdentityMapFromHtmlRows(htmlRows);
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows,
    identityMap: identityMap.byKey,
    duplicateKeys: identityMap.duplicateKeys,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: "sales_worksheet_facts"
  });

  assert.equal(enrichment.counts.matched, 4, "enrich: 4 rows matched (rows 0-3)");
  assert.equal(enrichment.counts.needs_identity_review, 1, "enrich: 1 row unmatched (row 4)");

  // Both worksheet lines for Kitchen Remodel Phase A resolve to the same job/account
  assert.equal(enrichment.rows[0].jobId, "37780", "enrich: row 0 → job 37780");
  assert.equal(enrichment.rows[0].accountId, "462", "enrich: row 0 → account 462");
  assert.equal(enrichment.rows[1].jobId, "37780", "enrich: row 1 (same job, backsplash) → same job 37780");
  assert.equal(enrichment.rows[1].accountId, "462", "enrich: row 1 → same account 462");
  assert.equal(enrichment.rows[2].jobId, "37781", "enrich: row 2 → job 37781");
  assert.equal(enrichment.rows[3].jobId, "45001", "enrich: row 3 → job 45001");
  assert.equal(enrichment.rows[4].jobId, null, "enrich: row 4 (unmatched) → null jobId");
}

// Key invariant: two worksheet lines for the same job must produce DISTINCT row_hash values.
function testMultiWorksheetRowsDistinctHashes() {
  const parsed = parseCsvReportRows(csvFixture);
  const htmlRows = parseReportHtmlIdentityRows(htmlFixture);
  const identityMap = buildIdentityMapFromHtmlRows(htmlRows);
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows,
    identityMap: identityMap.byKey,
    duplicateKeys: identityMap.duplicateKeys,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: "sales_worksheet_facts"
  });

  const row0 = enrichment.rows[0]; // Kitchen Remodel — Countertop Form
  const row1 = enrichment.rows[1]; // Kitchen Remodel — Backsplash Form

  // Same job identity
  assert.equal(row0.jobId, row1.jobId, "multi-worksheet: same jobId on both lines");
  assert.equal(row0.accountId, row1.accountId, "multi-worksheet: same accountId on both lines");

  // Different worksheet details → different hash
  assert.notEqual(row0.rowHash, row1.rowHash,
    "multi-worksheet: distinct row_hash for different worksheet lines of same job");

  // Neither should be flagged ambiguous
  assert.equal(row0.identityStatus, IDENTITY_STATUS.MATCHED, "multi-worksheet: row 0 matched");
  assert.equal(row1.identityStatus, IDENTITY_STATUS.MATCHED, "multi-worksheet: row 1 matched");
  assert.equal(enrichment.duplicatePreparedFacts.length, 0,
    "multi-worksheet: no duplicate row hashes");
}

// Real column names resolve to correct prepared-fact fields
function testRealColumnNamesMapToFields() {
  const parsed = parseCsvReportRows(csvFixture);
  const htmlRows = parseReportHtmlIdentityRows(htmlFixture);
  const identityMap = buildIdentityMapFromHtmlRows(htmlRows);
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows,
    identityMap: identityMap.byKey,
    duplicateKeys: identityMap.duplicateKeys,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: "sales_worksheet_facts"
  });

  const row = enrichment.rows[0];
  assert.equal(row.accountName, "North Branch - Sample Builders LLC", "real-cols: accountName");
  assert.equal(row.jobName, "Kitchen Remodel Phase A", "real-cols: jobName");
  assert.equal(row.jobStatus, "Quoted", "real-cols: jobStatus");
  assert.equal(row.jobCreationDate, "2026-01-15", "real-cols: jobCreationDate");
  assert.equal(row.jobSalesperson, "Alex Sample", "real-cols: jobSalesperson");
  assert.equal(row.color, "Cloud White", "real-cols: color from Job Worksheet - Color");
  assert.equal(row.room, "Kitchen", "real-cols: room from Job Worksheet - Room");
  assert.equal(row.totalWorksheetSqft, "42.50", "real-cols: sqft from Total Job Worksheet - Sq.Ft. by Job Creation Date");
  assert.equal(row.stone, "Quartz", "real-cols: stone");
  // Branch not in export → always null/empty
  assert.ok(!row.branchOrProcess, "real-cols: branchOrProcess is falsy (not in real export)");
}

function testAmbiguousIdentityFlagged() {
  const parsed = parseCsvReportRows(csvFixture);
  const htmlRows = parseReportHtmlIdentityRows(htmlFixture);
  const identityMap = buildIdentityMapFromHtmlRows(htmlRows);
  identityMap.duplicateKeys.push({
    key: [...identityMap.byKey.keys()][0],
    existing: { jobId: "1", accountId: "1", jobName: "A", accountName: "B" },
    incoming: { jobId: "2", accountId: "2", jobName: "A", accountName: "B" }
  });
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 1),
    identityMap: identityMap.byKey,
    duplicateKeys: identityMap.duplicateKeys
  });
  assert.equal(enrichment.rows[0].identityStatus, IDENTITY_STATUS.AMBIGUOUS,
    "ambiguous: duplicate HTML key flagged");
}

function testUnmatchedRowsRemainImportable() {
  const parsed = parseCsvReportRows(csvFixture);
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 1),
    identityMap: new Map(),
    duplicateKeys: []
  });
  assert.equal(enrichment.rows.length, 1, "unmatched: row is still importable");
  assert.equal(enrichment.rows[0].identityStatus, IDENTITY_STATUS.UNMATCHED, "unmatched: correct status");
  assert.equal(enrichment.rows[0].jobId, null, "unmatched: jobId is null");
  assert.ok(enrichment.rows[0].rawRow, "unmatched: rawRow preserved");
}

function testDuplicatePreparedFactsDetected() {
  const parsed = parseCsvReportRows(csvFixture);
  const duplicateRow = { ...parsed.rows[0] };
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: [parsed.rows[0], duplicateRow],
    identityMap: new Map(),
    duplicateKeys: []
  });
  assert.equal(enrichment.duplicatePreparedFacts.length, 1, "duplicate: detected for identical rows");
  assert.equal(enrichment.rows[1].identityStatus, IDENTITY_STATUS.AMBIGUOUS, "duplicate: second row flagged ambiguous");
}

function testEndToEndLocalProcessing() {
  const expectedHash = computeHeaderHash(SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS);
  const result = processReportFeedLocal({
    csvText: csvFixture,
    htmlText: htmlFixture,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: "sales_worksheet_facts",
    expectedColumns: SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
    expectedColumnHash: expectedHash,
    morawareViewId: 219
  });

  assert.equal(result.enrichment.rows.length, 5, "e2e: 5 enriched rows");
  assert.equal(result.enrichment.counts.matched, 4, "e2e: 4 matched");
  assert.equal(result.enrichment.counts.needs_identity_review, 1, "e2e: 1 unmatched");
  assert.equal(result.htmlIdentity.duplicateKeyCount, 0, "e2e: no duplicate HTML keys");
  assert.equal(result.promotionPreview.wouldPromote, true, "e2e: would promote (no ambiguous hashes)");
  assert.equal(result.runStatus, "validated", "e2e: runStatus=validated");
}

function testRowHashStable() {
  const params = {
    organizationId: "org-1",
    reportType: "sales_worksheet_facts",
    accountName: "Demo Account",
    jobName: "Demo Job",
    jobStatus: "Quoted",
    jobCreationDate: "2026-01-01",
    formName: "Countertop Form",
    room: "Kitchen",
    color: "Cloud White",
    totalWorksheetSqft: "42.50"
  };
  const hashA = computeReportRowHash(params);
  const hashB = computeReportRowHash(params);
  assert.equal(hashA, hashB, "row-hash: same inputs always produce same hash");
}

function testRowHashWorksheetDiscrimination() {
  const base = {
    organizationId: "org-1",
    reportType: "sales_worksheet_facts",
    accountName: "Demo Account",
    jobName: "Demo Job",
    jobStatus: "Quoted",
    jobCreationDate: "2026-01-01"
  };
  const hashCountertop = computeReportRowHash({ ...base, formName: "Countertop Form", room: "Kitchen", color: "White", totalWorksheetSqft: "42.50" });
  const hashBacksplash = computeReportRowHash({ ...base, formName: "Backsplash Form", room: "Kitchen Backsplash", color: "White Marble", totalWorksheetSqft: "8.00" });
  assert.notEqual(hashCountertop, hashBacksplash,
    "row-hash: worksheet-line discriminators produce distinct hashes for same job");
}

async function run() {
  testCsvParse();
  testColumnProfile();
  testHeaderHashStable();
  testNbspAndTrailingSpaceHeaderNormalization();
  testSchemaDriftDetection();
  testBranchNotRequired();
  testHtmlIdentityExtraction();
  testEnrichmentMatching();
  testMultiWorksheetRowsDistinctHashes();
  testRealColumnNamesMapToFields();
  testAmbiguousIdentityFlagged();
  testUnmatchedRowsRemainImportable();
  testDuplicatePreparedFactsDetected();
  testEndToEndLocalProcessing();
  testRowHashStable();
  testRowHashWorksheetDiscrimination();
  // ── View 220: Sales Worksheet History Facts ──────────────────────────────────

  testView220ColumnContract();
  testView220CsvParse();
  testView220ColumnProfile();
  testView220HeaderContract();
  testView220EnrichmentNoJobStatus();
  testView220ProcessFeedLocal();
  testView220RowHashDistinctFromView219();

  // ── Hash collision fix (view 220 row_hash granularity) ───────────────────────

  testView220CollisionFix_DiffEdgeProducesDifferentHash();
  testView220CollisionFix_IdenticalRowsSameHash();
  testView219HashUnchangedByCollisionFix();
  testComputeRowHashWithExtraDiscriminators();

  // ── View 222: Calendar schedule rows ─────────────────────────────────────────

  testCalendarScheduleExtraColumnsAllowedWithNullHash();
  testCalendarScheduleMissingSqftBlocks();
  testCalendarScheduleMissingActivityDateBlocks();
  testCalendarScheduleLegacyUnexpectedOnlyDriftNotBlockingPromotion();
  await testCalendarSchedulePromotionDryRunAllowsLegacyDrift();
  testSalesWorksheetExtraColumnStillBlocksWithLockedHash();

  console.log("reportFeedParser.test.mjs: ok");
}

// ── View 220 test functions ───────────────────────────────────────────────────

function testView220ColumnContract() {
  assert.equal(
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS.length,
    34,
    "v220 contract: 34 expected columns"
  );
  const computed = computeExpectedColumnHash(SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS);
  assert.equal(
    computed,
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH,
    "v220 contract: computed hash matches hardcoded constant"
  );
  assert.equal(
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH,
    "ca05eadcaeea16417f017e857f48a89ed42ee2033242d80ee635e8002d0dd000",
    "v220 contract: hash is the expected live-export value"
  );
  assert.ok(
    !SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS.includes("Job Status"),
    "v220 contract: Job Status is absent (key difference from view 219)"
  );
  assert.ok(
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS.includes("Account Status"),
    "v220 contract: Account Status present"
  );
  assert.ok(
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS.includes("Job Worksheet - Sink Type"),
    "v220 contract: Sink Type present"
  );
  assert.ok(
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS.includes("Total Job Worksheet - Sq.Ft. by Job Creation Date"),
    "v220 contract: sqft column present"
  );
}

function testView220CsvParse() {
  const parsed = parseCsvReportRows(historyFixtureCsv);
  assert.equal(parsed.headers.length, 34, "v220 csv: 34 headers");
  assert.equal(parsed.rows.length, 5, "v220 csv: 5 data rows");
  assert.ok(parsed.headers.includes("Account Name"), "v220 csv: Account Name present");
  assert.ok(parsed.headers.includes("Job Name"), "v220 csv: Job Name present");
  assert.ok(!parsed.headers.includes("Job Status"), "v220 csv: Job Status absent in view 220");
  assert.ok(parsed.headers.includes("Account Status"), "v220 csv: Account Status present");
  assert.ok(
    parsed.headers.includes("Total Job Worksheet - Sq.Ft. by Job Creation Date"),
    "v220 csv: sqft column present"
  );
  assert.equal(parsed.rows[0]["Job Name"], "Kitchen Remodel Phase A", "v220 csv: first row Job Name");
  assert.equal(parsed.rows[1]["Job Worksheet - Form Name"], "Backsplash Form", "v220 csv: second row form name");
  assert.equal(
    parsed.rows[0]["Total Job Worksheet - Sq.Ft. by Job Creation Date"],
    "42.50",
    "v220 csv: sqft value parsed"
  );
}

function testView220ColumnProfile() {
  const parsed = parseCsvReportRows(historyFixtureCsv);
  const profile = profileReportColumns(parsed);
  assert.equal(profile.columnCount, 34, "v220 profile: 34 columns");
  assert.equal(
    profile.headerHash,
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH,
    "v220 profile: header hash matches contract"
  );
  assert.equal(profile.rowCount, 5, "v220 profile: 5 rows");
}

function testView220HeaderContract() {
  const parsed = parseCsvReportRows(historyFixtureCsv);
  const profile = profileReportColumns(parsed);
  const validation = validateHeaderContract(
    profile,
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS,
    SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH
  );
  assert.equal(validation.missingHeaders.length, 0, "v220 contract: no missing headers");
  assert.equal(validation.unexpectedHeaders.length, 0, "v220 contract: no unexpected headers");
}

function testView220EnrichmentNoJobStatus() {
  const parsed = parseCsvReportRows(historyFixtureCsv);
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows,
    identityMap: new Map(),
    duplicateKeys: [],
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE
  });

  assert.equal(enrichment.rows.length, 5, "v220 enrich: 5 enriched rows");
  for (const row of enrichment.rows) {
    // jobStatus column absent from view 220 headers → resolved as empty string, never throws
    assert.equal(typeof row.jobStatus, "string", "v220 enrich: jobStatus is string (not undefined)");
    // accountName and jobName are populated
    assert.ok(row.accountName, "v220 enrich: accountName populated");
    assert.ok(row.jobName, "v220 enrich: jobName populated");
    // rowHash is always a non-empty string
    assert.ok(typeof row.rowHash === "string" && row.rowHash.length > 0, "v220 enrich: rowHash set");
  }
  // All rows are needs_identity_review (no identity map entries)
  assert.equal(
    enrichment.counts.needs_identity_review,
    5,
    "v220 enrich: all 5 rows unmatched with empty identity map"
  );
}

function testView220ProcessFeedLocal() {
  const result = processReportFeedLocal({
    csvText: historyFixtureCsv,
    htmlText: htmlFixture,   // reuse view 219 HTML fixture — same fake account/job names
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE,
    expectedColumns: SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS,
    expectedColumnHash: SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH,
    morawareViewId: 220
  });

  assert.equal(result.schemaDrift.detected, false, "v220 process: no schema drift");
  assert.equal(result.morawareViewId, 220, "v220 process: morawareViewId=220");
  assert.equal(result.reportType, SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE, "v220 process: reportType correct");
  assert.equal(result.profile.columnCount, 34, "v220 process: 34 columns");
  assert.equal(result.enrichment.rows.length, 5, "v220 process: 5 enriched rows");
  // HTML fixture has identity for the same fake account/job names used in the history fixture
  assert.ok(result.enrichment.counts.matched >= 4, "v220 process: at least 4 rows matched via HTML identity");
  assert.equal(result.enrichment.counts.needs_identity_review, 1, "v220 process: 1 unmatched row");
}

function testView220RowHashDistinctFromView219() {
  // The same worksheet line ingested via view 219 and view 220 must produce different row hashes
  // because reportType is part of the hash input. This prevents cross-feed hash collisions
  // in moraware_prepared_sales_worksheet_facts.
  const sharedParams = {
    organizationId: "org-1",
    accountName: "Sample Builders LLC",
    jobName: "Kitchen Remodel Phase A",
    jobStatus: "",
    jobCreationDate: "2025-03-01",
    formName: "Countertop Form",
    room: "Kitchen",
    color: "White",
    totalWorksheetSqft: "42.50"
  };
  const hash219 = computeReportRowHash({ ...sharedParams, reportType: "sales_worksheet_facts" });
  const hash220 = computeReportRowHash({ ...sharedParams, reportType: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE });
  assert.notEqual(hash219, hash220, "v220 hash: view 219 and view 220 produce distinct row hashes for same data");
}

// ── Hash collision fix tests ──────────────────────────────────────────────────

/**
 * Core regression test for the view 220 row_hash collision fix.
 *
 * Two view 220 rows that share ALL base hash fields (accountName, jobName,
 * jobCreationDate, formName, room, color, totalWorksheetSqft) but differ ONLY
 * in `Job Worksheet - Edge` MUST produce different hashes after the fix.
 * Before the fix these two rows would hash identically, blocking promotion.
 */
function testView220CollisionFix_DiffEdgeProducesDifferentHash() {
  // Build a synthetic view 220 row with all 34 columns.
  const baseRow = {
    "Account Name": "Sample Builders LLC",
    "Account Salesperson": "Alice Sample",
    "Account Status": "Active",
    "Job Name": "Kitchen Remodel Phase A",
    "Job Creation Date": "2025-03-01",
    "Job Salesperson": "Bob Sample",
    "Job Notes": "",
    "Stone": "Quartz",
    "Job Worksheet - Form Name": "Countertop Form",
    "Job Worksheet - Room": "Kitchen",
    "Job Worksheet - Color": "Cloud White",
    "Job Worksheet - Edge": "Eased",
    "Job Worksheet - Thickness": "3cm",
    "Job Worksheet - Back Splash Type": "None",
    "Job Worksheet - Back Splash Height": "",
    "Job Worksheet - Sink Type": "Undermount",
    "Job Worksheet - We have the sink": "Yes",
    "Job Worksheet - ESF Provided Sink Make & Model": "",
    "Job Worksheet - Faucet Type": "Pull-Down",
    "Job Worksheet - We have Faucet": "Yes",
    "Job Worksheet - ESF Provided Faucet Make & Model": "",
    "Job Worksheet - Faucet at Jobsite": "No",
    "Job Worksheet - Not Provided by ESF Sink Make & Model": "",
    "Job Worksheet - Not Provided by ESF Faucet Make & Model": "",
    "Job Worksheet - Stove Type": "None",
    "Job Worksheet - Stove Ripper Needed": "No",
    "Job Worksheet - Stove Ripper NOT Needed": "Yes",
    "Job Worksheet - Make & Model": "",
    "Job Worksheet - Stone Care Kit": "Yes",
    "Job Worksheet - Dry Treat": "Yes",
    "Job Worksheet - Shop Comments": "Standard cut required",
    "Job Worksheet - More Shop Comments": "",
    "Job Worksheet - Special Worksite Conditions": "Tight doorway",
    "Total Job Worksheet - Sq.Ft. by Job Creation Date": "42.50"
  };

  // Row B differs ONLY in Edge: "Beveled" vs "Eased".
  const rowB = { ...baseRow, "Job Worksheet - Edge": "Beveled" };

  const headers = Object.keys(baseRow);

  const result = enrichReportRowsWithIdentity({
    headers,
    rows: [baseRow, rowB],
    identityMap: new Map(),
    duplicateKeys: [],
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE
  });

  assert.equal(result.rows.length, 2, "collision-fix: 2 rows enriched");

  const [hashA, hashB] = result.rows.map((r) => r.rowHash);
  assert.notEqual(
    hashA,
    hashB,
    "collision-fix: Eased vs Beveled edge → different row_hashes (was colliding before fix)"
  );
  // Neither should be flagged ambiguous (they are genuinely distinct rows)
  assert.equal(result.rows[0].identityStatus, IDENTITY_STATUS.UNMATCHED,
    "collision-fix: row A is needs_identity_review");
  assert.equal(result.rows[1].identityStatus, IDENTITY_STATUS.UNMATCHED,
    "collision-fix: row B is needs_identity_review (not ambiguous — distinct hash)");
  assert.equal(result.duplicatePreparedFacts.length, 0,
    "collision-fix: no duplicate hash collisions between distinct rows");
}

/**
 * Verify that truly identical view 220 rows still produce the SAME hash (stable deduplication).
 * The second occurrence must be flagged as a duplicate prepared fact.
 */
function testView220CollisionFix_IdenticalRowsSameHash() {
  const row = {
    "Account Name": "Sample Builders LLC",
    "Account Salesperson": "Alice Sample",
    "Account Status": "Active",
    "Job Name": "Kitchen Remodel Phase A",
    "Job Creation Date": "2025-03-01",
    "Job Salesperson": "Bob Sample",
    "Job Notes": "",
    "Stone": "Quartz",
    "Job Worksheet - Form Name": "Countertop Form",
    "Job Worksheet - Room": "Kitchen",
    "Job Worksheet - Color": "Cloud White",
    "Job Worksheet - Edge": "Eased",
    "Job Worksheet - Thickness": "3cm",
    "Job Worksheet - Back Splash Type": "None",
    "Job Worksheet - Back Splash Height": "",
    "Job Worksheet - Sink Type": "Undermount",
    "Job Worksheet - We have the sink": "Yes",
    "Job Worksheet - ESF Provided Sink Make & Model": "",
    "Job Worksheet - Faucet Type": "Pull-Down",
    "Job Worksheet - We have Faucet": "Yes",
    "Job Worksheet - ESF Provided Faucet Make & Model": "",
    "Job Worksheet - Faucet at Jobsite": "No",
    "Job Worksheet - Not Provided by ESF Sink Make & Model": "",
    "Job Worksheet - Not Provided by ESF Faucet Make & Model": "",
    "Job Worksheet - Stove Type": "None",
    "Job Worksheet - Stove Ripper Needed": "No",
    "Job Worksheet - Stove Ripper NOT Needed": "Yes",
    "Job Worksheet - Make & Model": "",
    "Job Worksheet - Stone Care Kit": "Yes",
    "Job Worksheet - Dry Treat": "Yes",
    "Job Worksheet - Shop Comments": "Standard cut required",
    "Job Worksheet - More Shop Comments": "",
    "Job Worksheet - Special Worksite Conditions": "Tight doorway",
    "Total Job Worksheet - Sq.Ft. by Job Creation Date": "42.50"
  };

  const headers = Object.keys(row);
  const result = enrichReportRowsWithIdentity({
    headers,
    rows: [row, { ...row }],   // two truly identical rows
    identityMap: new Map(),
    duplicateKeys: [],
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE
  });

  const [hashA, hashB] = result.rows.map((r) => r.rowHash);
  assert.equal(hashA, hashB, "collision-fix: identical rows produce the same hash (stable)");
  assert.equal(result.duplicatePreparedFacts.length, 1,
    "collision-fix: truly identical row detected as duplicate prepared fact");
  assert.equal(result.rows[1].identityStatus, IDENTITY_STATUS.AMBIGUOUS,
    "collision-fix: second identical row flagged ambiguous (correct deduplication)");
}

/**
 * Verify that view 219 row hashes are UNCHANGED by the collision fix.
 * The fix must be strictly backward-compatible for sales_worksheet_facts.
 */
function testView219HashUnchangedByCollisionFix() {
  // computeReportRowHash with no extraDiscriminators (view 219 path)
  const params = {
    organizationId: "org-1",
    reportType: "sales_worksheet_facts",
    accountName: "Demo Account",
    jobName: "Demo Job",
    jobStatus: "Quoted",
    jobCreationDate: "2026-01-01",
    formName: "Countertop Form",
    room: "Kitchen",
    color: "Cloud White",
    totalWorksheetSqft: "42.50"
  };
  const hashNoParam = computeReportRowHash(params);
  const hashExplicitNull = computeReportRowHash({ ...params, extraDiscriminators: null });
  const hashEmptyArray = computeReportRowHash({ ...params, extraDiscriminators: [] });

  assert.equal(hashNoParam, hashExplicitNull,
    "v219-stable: extraDiscriminators=null → same hash as omitting the param");
  assert.equal(hashNoParam, hashEmptyArray,
    "v219-stable: extraDiscriminators=[] → same hash (empty array has no effect)");

  // buildExtraDiscriminators returns null for view 219 — confirms no extras are passed during staging
  const extras = buildExtraDiscriminators({ "Account Name": "Demo" }, "sales_worksheet_facts");
  assert.equal(extras, null,
    "v219-stable: buildExtraDiscriminators returns null for sales_worksheet_facts");
}

/**
 * Unit test for computeReportRowHash with explicit extraDiscriminators.
 * Directly verifies the new two-tier hash design independent of enrichReportRowsWithIdentity.
 */
function testComputeRowHashWithExtraDiscriminators() {
  const base = {
    organizationId: "org-1",
    reportType: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE,
    accountName: "Sample Builders",
    jobName: "Kitchen Remodel",
    jobStatus: "",
    jobCreationDate: "2025-03-01",
    formName: "Countertop Form",
    room: "Kitchen",
    color: "White",
    totalWorksheetSqft: "42.5"
  };

  // Different extra discriminators → different hashes
  const hashA = computeReportRowHash({ ...base, extraDiscriminators: ["Eased", "3cm", "Undermount"] });
  const hashB = computeReportRowHash({ ...base, extraDiscriminators: ["Beveled", "3cm", "Undermount"] });
  assert.notEqual(hashA, hashB,
    "extra-disc: different discriminator values → different hashes");

  // Same extra discriminators → same hash (stable)
  const hashC = computeReportRowHash({ ...base, extraDiscriminators: ["Eased", "3cm", "Undermount"] });
  assert.equal(hashA, hashC,
    "extra-disc: same discriminator values → same hash (stable)");

  // Extra discriminators change the hash compared to having none
  const hashNoExtras = computeReportRowHash(base);
  assert.notEqual(hashA, hashNoExtras,
    "extra-disc: having extras produces different hash than having none (as expected)");

  // buildExtraDiscriminators for view 220 returns a non-null sorted array
  const row220 = { "Account Name": "Builder", "Job Worksheet - Edge": "Eased", "Stone": "Quartz" };
  const extras220 = buildExtraDiscriminators(row220, SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE);
  assert.ok(Array.isArray(extras220) && extras220.length > 0,
    "extra-disc: buildExtraDiscriminators returns array for view 220");
  // Should be sorted by key: "Account Name" < "Job Worksheet - Edge" < "Stone"
  assert.deepEqual(
    extras220,
    ["Builder", "Eased", "Quartz"],
    "extra-disc: buildExtraDiscriminators returns values sorted by column name"
  );
}

function csvFromHeadersAndRows(headers, rows) {
  const escape = (value) => {
    const s = String(value ?? "");
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function buildCalendarScheduleCsvWithExtraInstallColumns() {
  const parsed = parseCsvReportRows(calendarScheduleFixtureCsv);
  const extraHeaders = [
    "First Install - Quartz Basic in Job Status",
    "First Install - Quartz Basic in Job Date"
  ];
  const headers = [...parsed.headers, ...extraHeaders];
  const rows = parsed.rows.map((row) => {
    const out = { ...row };
    for (const header of extraHeaders) out[header] = "";
    return out;
  });
  return csvFromHeadersAndRows(headers, rows);
}

function testCalendarScheduleExtraColumnsAllowedWithNullHash() {
  const csvText = buildCalendarScheduleCsvWithExtraInstallColumns();
  const result = processReportFeedLocal({
    csvText,
    htmlText: htmlFixture,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: CALENDAR_SCHEDULE_REPORT_TYPE,
    expectedColumns: CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
    expectedColumnHash: null,
    morawareViewId: 222
  });

  assert.equal(result.headerValidation.missingHeaders.length, 0, "calendar: no missing core headers");
  assert.ok(result.headerValidation.unexpectedHeaders.length >= 2, "calendar: extra First Install headers reported");
  assert.equal(result.schemaDrift.detected, false, "calendar: extra columns do not mark schema drift");
  assert.ok(Array.isArray(result.schemaDrift.extraHeaders), "calendar: extra headers recorded for diagnostics");
  assert.equal(result.runStatus, "validated", "calendar: run validates with null expected hash");
  assert.equal(result.promotionPreview.wouldPromote, true, "calendar: promotion preview allowed");
}

function testCalendarScheduleMissingSqftBlocks() {
  const parsed = parseCsvReportRows(calendarScheduleFixtureCsv);
  const headers = parsed.headers.filter((h) => h !== "Job Worksheet - Sq.Ft.");
  const rows = parsed.rows.map((row) => {
    const out = { ...row };
    delete out["Job Worksheet - Sq.Ft."];
    return out;
  });
  const csvText = csvFromHeadersAndRows(headers, rows);
  const result = processReportFeedLocal({
    csvText,
    htmlText: htmlFixture,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: CALENDAR_SCHEDULE_REPORT_TYPE,
    expectedColumns: CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
    expectedColumnHash: null,
    morawareViewId: 222
  });

  assert.ok(
    result.headerValidation.missingHeaders.includes("Job Worksheet - Sq.Ft."),
    "calendar: missing sqft header reported"
  );
  assert.equal(result.schemaDrift.detected, true, "calendar: missing core header blocks");
  assert.equal(result.runStatus, "needs_review", "calendar: missing sqft → needs_review");
}

function testCalendarScheduleMissingActivityDateBlocks() {
  const parsed = parseCsvReportRows(calendarScheduleFixtureCsv);
  const headers = parsed.headers.filter((h) => h !== "Activity Date");
  const rows = parsed.rows.map((row) => {
    const out = { ...row };
    delete out["Activity Date"];
    return out;
  });
  const csvText = csvFromHeadersAndRows(headers, rows);
  const result = processReportFeedLocal({
    csvText,
    htmlText: htmlFixture,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: CALENDAR_SCHEDULE_REPORT_TYPE,
    expectedColumns: CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
    expectedColumnHash: null,
    morawareViewId: 222
  });

  assert.ok(
    result.headerValidation.missingHeaders.includes("Activity Date"),
    "calendar: missing Activity Date reported"
  );
  assert.equal(result.schemaDrift.detected, true, "calendar: missing Activity Date blocks");
  assert.equal(result.runStatus, "needs_review", "calendar: missing Activity Date → needs_review");
}

function testCalendarScheduleLegacyUnexpectedOnlyDriftNotBlockingPromotion() {
  const legacyDrift = {
    detected: true,
    missingHeaders: [],
    unexpectedHeaders: ["First Install - Quartz Basic in Job Status"]
  };
  assert.equal(isSchemaDriftBlocking(legacyDrift), false, "calendar: legacy unexpected-only drift is non-blocking");

  const rebuilt = buildSchemaDrift({
    expectedColumnHash: null,
    profile: { headerHash: "abc" },
    headerValidation: {
      missingHeaders: [],
      unexpectedHeaders: ["First Install - Quartz Basic in Job Status"]
    }
  });
  assert.equal(rebuilt.detected, false, "calendar: rebuilt drift allows extras");
  assert.ok(rebuilt.extraHeaders?.length === 1, "calendar: rebuilt drift keeps extra header list");
}

async function testCalendarSchedulePromotionDryRunAllowsLegacyDrift() {
  const legacyDrift = {
    detected: true,
    missingHeaders: [],
    unexpectedHeaders: ["First Install - Quartz Basic in Job Status"]
  };
  const supabase = {
    from(table) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          if (table === "moraware_report_runs") {
            return Promise.resolve({
              data: {
                id: "run-1",
                organization_id: "org-1",
                report_feed_id: "feed-1",
                status: "needs_review",
                schema_drift: legacyDrift
              },
              error: null
            });
          }
          if (table === "moraware_report_feeds") {
            return Promise.resolve({
              data: {
                id: "feed-1",
                report_type: CALENDAR_SCHEDULE_REPORT_TYPE,
                moraware_view_id: 222,
                is_active: true
              },
              error: null
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled, onRejected) {
          if (table === "moraware_report_raw_rows") {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        }
      };
      return api;
    }
  };

  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: false });
  assert.equal(result.ok, true, "calendar promote dry-run: allowed with legacy unexpected-only drift");
  assert.equal(result.dryRun, true, "calendar promote dry-run: dry-run mode");
}

function testSalesWorksheetExtraColumnStillBlocksWithLockedHash() {
  const parsed = parseCsvReportRows(csvFixture);
  const headers = [...parsed.headers, "Totally Unexpected Column"];
  const rows = parsed.rows.map((row) => ({ ...row, "Totally Unexpected Column": "x" }));
  const csvText = csvFromHeadersAndRows(headers, rows);
  const expectedHash = computeExpectedColumnHash(SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS);
  const result = processReportFeedLocal({
    csvText,
    htmlText: htmlFixture,
    organizationId: "00000000-0000-0000-0000-000000000001",
    reportType: "sales_worksheet_facts",
    expectedColumns: SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
    expectedColumnHash: expectedHash,
    morawareViewId: 219
  });

  assert.equal(result.schemaDrift.detected, true, "sales worksheet: extra column with locked hash blocks");
  assert.equal(result.runStatus, "needs_review", "sales worksheet: extra column → needs_review");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
