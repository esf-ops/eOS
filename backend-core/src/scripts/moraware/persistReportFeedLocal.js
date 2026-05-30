#!/usr/bin/env node
/**
 * Moraware Report Feed — local-file staging persistence.
 *
 * Reads CSV + HTML files from disk, runs processReportFeedLocal, and persists
 * staging data into Supabase report-feed tables.
 *
 * Does NOT promote prepared facts.
 * Does NOT write to moraware_prepared_sales_worksheet_facts.
 * Does NOT download Moraware exports or scrape live Moraware.
 *
 * Required env vars:
 *   MORAWARE_REPORT_CSV_FILE
 *   MORAWARE_REPORT_HTML_FILE
 *   MORAWARE_REPORT_VIEW_ID
 *   MORAWARE_REPORT_TYPE
 *   MORAWARE_DEFAULT_ORGANIZATION_ID
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_WRITE_ENABLED=1
 *
 * Optional:
 *   MORAWARE_REPORT_EXPECTED_COLUMN_HASH (if not set, loaded from feed contract)
 */
import "dotenv/config";

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
import {
  loadReportFeedContract,
  persistReportFeedRun
} from "../../moraware/reportFeeds/reportFeedPersistence.js";
import { createWriteCapableClient } from "../../moraware/reportFeeds/reportFeedDbClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requiredEnv(name) {
  const v = env(name);
  if (!v) throw new Error(`persistReportFeedLocal: missing required env var ${name}`);
  return v;
}

async function main() {
  const csvFile = requiredEnv("MORAWARE_REPORT_CSV_FILE");
  const htmlFile = requiredEnv("MORAWARE_REPORT_HTML_FILE");
  const reportType = env("MORAWARE_REPORT_TYPE", SALES_WORKSHEET_FACTS_REPORT_TYPE);
  const morawareViewId = Number(env("MORAWARE_REPORT_VIEW_ID", String(SALES_WORKSHEET_FACTS_VIEW_ID)));
  const organizationId = requiredEnv("MORAWARE_DEFAULT_ORGANIZATION_ID");

  const csvPath = path.isAbsolute(csvFile) ? csvFile : path.join(repoRoot, csvFile);
  const htmlPath = path.isAbsolute(htmlFile) ? htmlFile : path.join(repoRoot, htmlFile);

  console.log("Moraware report-feed staging persistence (local-file mode)");
  console.log(`  CSV:  ${csvPath}`);
  console.log(`  HTML: ${htmlPath}`);
  console.log(`  Report type: ${reportType}  View: ${morawareViewId}`);
  console.log(`  Org:  ${organizationId}`);

  // Load CSV + HTML (no Moraware network)
  const [csvText, htmlText] = await Promise.all([
    fs.readFile(csvPath, "utf8"),
    fs.readFile(htmlPath, "utf8")
  ]);

  // Build write-capable client (throws if SUPABASE_WRITE_ENABLED != "1")
  const db = createWriteCapableClient();

  // Load the active feed contract from Supabase
  console.log("\nLoading feed contract from Supabase...");
  const feed = await loadReportFeedContract(db, { organizationId, reportType, morawareViewId });

  if (!feed) {
    console.error(
      `\nERROR: No active moraware_report_feeds row found for:` +
        `\n  organization_id = ${organizationId}` +
        `\n  report_type     = ${reportType}` +
        `\n  moraware_view_id = ${morawareViewId}` +
        `\n\nSeed the feed row in Supabase before running this script.` +
        `\nSee the commented INSERT at the bottom of:` +
        `\n  backend-core/supabase/eliteos_moraware_report_feeds.sql`
    );
    process.exit(1);
  }
  console.log(`  Feed id: ${feed.id}  Name: ${feed.name}`);

  // Resolve expected column hash: prefer feed contract, fall back to known-good hash for sales_worksheet_facts
  const expectedColumnHash =
    env("MORAWARE_REPORT_EXPECTED_COLUMN_HASH") ||
    feed.expected_column_hash ||
    (reportType === SALES_WORKSHEET_FACTS_REPORT_TYPE
      ? computeExpectedColumnHash(SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS)
      : null);

  const expectedColumns =
    Array.isArray(feed.expected_columns) && feed.expected_columns.length
      ? feed.expected_columns
      : reportType === SALES_WORKSHEET_FACTS_REPORT_TYPE
        ? SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS
        : [];

  // Parse + enrich (pure, no network)
  console.log("\nProcessing CSV + HTML...");
  const processResult = processReportFeedLocal({
    csvText,
    htmlText,
    organizationId,
    reportType,
    expectedColumns,
    expectedColumnHash,
    morawareViewId
  });

  console.log(`  Run status:       ${processResult.runStatus}`);
  console.log(`  Rows:             ${processResult.profile.rowCount}`);
  console.log(`  Header hash:      ${processResult.profile.headerHash}`);
  console.log(`  Expected hash:    ${expectedColumnHash ?? "(not set)"}`);
  console.log(`  Schema drift:     ${processResult.schemaDrift?.detected ? "YES — run will be needs_review" : "none"}`);
  console.log(`  Matched:          ${processResult.enrichment.counts.matched}`);
  console.log(`  Unmatched:        ${processResult.enrichment.counts.needs_identity_review}`);
  console.log(`  Ambiguous:        ${processResult.enrichment.counts.ambiguous_identity}`);

  // Persist staging (writes run, profile, raw rows, identity links)
  console.log("\nPersisting staging data to Supabase...");
  const { runId, status } = await persistReportFeedRun(db, {
    feed,
    processResult,
    sourceFiles: { csvPath, htmlPath }
  });

  console.log("\nStaging complete.");
  console.log(`  Run id:    ${runId}`);
  console.log(`  Status:    ${status}`);
  console.log("No prepared facts were written. To promote, run the future promote step.");
}

main().catch((err) => {
  console.error("\nFATAL:", err?.stack || String(err));
  process.exit(1);
});
