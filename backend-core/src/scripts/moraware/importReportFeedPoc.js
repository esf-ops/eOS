#!/usr/bin/env node
/**
 * Moraware Report Feed — local-file POC (dry-run by default).
 *
 * Reads sanitized CSV + HTML files from disk, profiles columns, extracts HTML
 * identity links, enriches rows, and writes summary JSON under debug/moraware/report-feeds/.
 *
 * Does NOT download Moraware exports, scrape live Moraware, or POST to Supabase.
 *
 * Example:
 *   MORAWARE_REPORT_CSV_FILE=backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-facts.sample.csv \
 *   MORAWARE_REPORT_HTML_FILE=backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-facts.sample.html \
 *   MORAWARE_REPORT_VIEW_ID=219 \
 *   MORAWARE_REPORT_TYPE=sales_worksheet_facts \
 *   MORAWARE_DEFAULT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001 \
 *   npm run eos:moraware:report-feed-poc
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeExpectedColumnHash,
  processReportFeedLocal,
  SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
  SALES_WORKSHEET_FACTS_REPORT_TYPE,
  SALES_WORKSHEET_FACTS_VIEW_ID
} from "../../moraware/reportFeeds/processReportFeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requiredEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const csvFile = requiredEnv("MORAWARE_REPORT_CSV_FILE");
  const htmlFile = requiredEnv("MORAWARE_REPORT_HTML_FILE");
  const reportType = env("MORAWARE_REPORT_TYPE", SALES_WORKSHEET_FACTS_REPORT_TYPE);
  const morawareViewId = Number(env("MORAWARE_REPORT_VIEW_ID", String(SALES_WORKSHEET_FACTS_VIEW_ID)));
  const organizationId = env(
    "MORAWARE_DEFAULT_ORGANIZATION_ID",
    "00000000-0000-0000-0000-000000000000"
  );

  const csvPath = path.isAbsolute(csvFile) ? csvFile : path.join(repoRoot, csvFile);
  const htmlPath = path.isAbsolute(htmlFile) ? htmlFile : path.join(repoRoot, htmlFile);
  const [csvText, htmlText] = await Promise.all([
    fs.readFile(csvPath, "utf8"),
    fs.readFile(htmlPath, "utf8")
  ]);

  const expectedColumns =
    reportType === SALES_WORKSHEET_FACTS_REPORT_TYPE ? SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS : [];
  const expectedColumnHash = expectedColumns.length ? computeExpectedColumnHash(expectedColumns) : null;

  const result = processReportFeedLocal({
    csvText,
    htmlText,
    organizationId,
    reportType,
    expectedColumns,
    expectedColumnHash,
    morawareViewId
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(repoRoot, "debug/moraware/report-feeds");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `report-feed-poc-${reportType}-${stamp}.json`);

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: "local-file-dry-run",
    inputs: {
      csvFile: csvPath,
      htmlFile: htmlPath,
      morawareViewId,
      reportType,
      organizationId
    },
    summary: {
      runStatus: result.runStatus,
      rowCount: result.profile.rowCount,
      columnCount: result.profile.columnCount,
      headerHash: result.profile.headerHash,
      schemaDrift: result.schemaDrift,
      identityCounts: result.enrichment.counts,
      htmlIdentityRows: result.htmlIdentity.rowCount,
      duplicateHtmlIdentityKeys: result.htmlIdentity.duplicateKeyCount,
      duplicatePreparedFacts: result.enrichment.duplicatePreparedFacts.length,
      wouldPromote: result.promotionPreview.wouldPromote
    },
    headerValidation: result.headerValidation,
    sampleEnrichedRows: result.enrichment.rows.slice(0, 5),
    promotionPreview: result.promotionPreview
  };

  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("Moraware report-feed POC (dry-run)");
  console.log(`  CSV:  ${csvPath}`);
  console.log(`  HTML: ${htmlPath}`);
  console.log(`  Rows: ${result.profile.rowCount}`);
  console.log(`  Matched identities: ${result.enrichment.counts.matched ?? 0}`);
  console.log(`  Needs identity review: ${result.enrichment.counts.needs_identity_review ?? 0}`);
  console.log(`  Ambiguous identities: ${result.enrichment.counts.ambiguous_identity ?? 0}`);
  console.log(`  Run status: ${result.runStatus}`);
  console.log(`  Output: ${outPath}`);
  console.log("No live Moraware download/scrape and no Supabase writes were performed.");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
