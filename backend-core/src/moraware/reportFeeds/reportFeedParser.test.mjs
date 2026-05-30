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
  IDENTITY_STATUS,
  parseCsvReportRows,
  parseReportHtmlIdentityRows,
  processReportFeedLocal,
  profileReportColumns,
  validateHeaderContract,
  buildIdentityMapFromHtmlRows,
  SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS
} from "./processReportFeed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../../../test/fixtures/moraware-report-feeds");
const csvFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.csv"), "utf8");
const htmlFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.html"), "utf8");

function testCsvParse() {
  const parsed = parseCsvReportRows(csvFixture);
  assert.equal(parsed.headers.length, 10);
  assert.equal(parsed.rows.length, 3);
  assert.ok(parsed.headers.includes("Account Name"));
  assert.ok(parsed.headers.includes("Job Name"));
  assert.equal(parsed.rows[0]["Job Name"], "Kitchen Remodel Phase A");
}

function testColumnProfile() {
  const parsed = parseCsvReportRows(csvFixture);
  const profile = profileReportColumns(parsed);
  assert.equal(profile.rowCount, 3);
  assert.equal(profile.columnCount, 10);
  assert.equal(profile.columns[0].nonEmptyCount, 3);
  assert.ok(profile.columns[0].sampleValues.length >= 1);
  assert.equal(typeof profile.headerHash, "string");
  assert.equal(profile.headerHash.length, 64);
}

function testHeaderHashStable() {
  const parsed = parseCsvReportRows(csvFixture);
  const profileA = profileReportColumns(parsed);
  const profileB = profileReportColumns(parsed);
  assert.equal(profileA.headerHash, profileB.headerHash);
}

function testSchemaDriftDetection() {
  const parsed = parseCsvReportRows(csvFixture);
  const profile = profileReportColumns(parsed);
  const expectedHash = computeExpectedColumnHash(["Account Name", "Job Name", "Totally New Column"]);
  const validation = validateHeaderContract(profile, ["Account Name", "Job Name", "Totally New Column"], expectedHash);
  assert.equal(validation.ok, false);
  assert.ok(validation.missingHeaders.includes("Totally New Column"));
}

function testHtmlIdentityExtraction() {
  const rows = parseReportHtmlIdentityRows(htmlFixture);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].accountId, "462");
  assert.equal(rows[0].accountName, "North Branch - Sample Builders LLC");
  assert.equal(rows[0].jobId, "37780");
  assert.equal(rows[0].jobName, "Kitchen Remodel Phase A");
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

  assert.equal(enrichment.counts.matched, 3);
  assert.equal(enrichment.counts.needs_identity_review, 0);
  assert.equal(enrichment.rows[0].jobId, "37780");
  assert.equal(enrichment.rows[0].accountId, "462");
  assert.equal(enrichment.rows[1].jobId, "37781");
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
  assert.equal(enrichment.rows[0].identityStatus, IDENTITY_STATUS.AMBIGUOUS);
}

function testUnmatchedRowsRemainImportable() {
  const parsed = parseCsvReportRows(csvFixture);
  const enrichment = enrichReportRowsWithIdentity({
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 1),
    identityMap: new Map(),
    duplicateKeys: []
  });
  assert.equal(enrichment.rows.length, 1);
  assert.equal(enrichment.rows[0].identityStatus, IDENTITY_STATUS.UNMATCHED);
  assert.equal(enrichment.rows[0].jobId, null);
  assert.ok(enrichment.rows[0].rawRow);
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
  assert.equal(enrichment.duplicatePreparedFacts.length, 1);
  assert.equal(enrichment.rows[1].identityStatus, IDENTITY_STATUS.AMBIGUOUS);
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

  assert.equal(result.enrichment.rows.length, 3);
  assert.equal(result.enrichment.counts.matched, 3);
  assert.equal(result.htmlIdentity.duplicateKeyCount, 0);
  assert.equal(result.promotionPreview.wouldPromote, true);
  assert.equal(result.runStatus, "validated");
}

function testRowHashStable() {
  const hashA = computeReportRowHash({
    organizationId: "org-1",
    reportType: "sales_worksheet_facts",
    accountName: "Demo Account",
    jobName: "Demo Job",
    jobStatus: "Quoted",
    jobCreationDate: "2026-01-01"
  });
  const hashB = computeReportRowHash({
    organizationId: "org-1",
    reportType: "sales_worksheet_facts",
    accountName: "Demo Account",
    jobName: "Demo Job",
    jobStatus: "Quoted",
    jobCreationDate: "2026-01-01"
  });
  assert.equal(hashA, hashB);
}

function run() {
  testCsvParse();
  testColumnProfile();
  testHeaderHashStable();
  testSchemaDriftDetection();
  testHtmlIdentityExtraction();
  testEnrichmentMatching();
  testAmbiguousIdentityFlagged();
  testUnmatchedRowsRemainImportable();
  testDuplicatePreparedFactsDetected();
  testEndToEndLocalProcessing();
  testRowHashStable();
  console.log("reportFeedParser.test.mjs: ok");
}

run();
