#!/usr/bin/env node
/**
 * Local dry-run Account Directory seed extractor.
 * Writes ignored outputs under local-imports/ only. Zero database writes.
 *
 * Usage:
 *   npm run account-directory:seed:dry-run -- \
 *     --input local-imports/account-directory/quickbooks_business_account_directory_20260723.xlsx \
 *     --output local-imports/account-directory/output
 */

import fs from "node:fs";
import path from "node:path";
import {
  extractAccountDirectoryDryRun,
  reviewRowsToCsv
} from "../accountDirectory/accountDirectoryWorkbookExtract.mjs";

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") out.input = argv[++i];
    else if (a === "--output" || a === "-o") out.output = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(
    args.input ||
      "local-imports/account-directory/quickbooks_business_account_directory_20260723.xlsx"
  );
  const outputDir = path.resolve(args.output || "local-imports/account-directory/output");

  if (!fs.existsSync(input)) {
    console.error(
      `Workbook not found at:\n  ${input}\nCopy or upload the QuickBooks business account workbook to that path.`
    );
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const bytes = fs.readFileSync(input);
  const { seed, review, report, dbWrites } = extractAccountDirectoryDryRun(bytes);

  const seedPath = path.join(outputDir, "account-directory-seed.json");
  const reviewPath = path.join(outputDir, "account-directory-review.csv");
  const reportPath = path.join(outputDir, "account-directory-import-report.json");

  fs.writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  fs.writeFileSync(reviewPath, reviewRowsToCsv(review), "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // Console: counts and paths only — never full customer rows
  console.log("Account Directory dry-run complete (no database writes).");
  console.log(`dbWrites: ${dbWrites}`);
  console.log(`Account Directory rows read: ${report.accountDirectoryRowsRead}`);
  console.log(`Blank rows skipped: ${report.blankRowsSkipped}`);
  console.log(`QB Customer Records rows: ${report.qbCustomerRecordsRowCount}`);
  console.log(`Data Notes source total: ${report.sourceRecordCountFromDataNotes}`);
  console.log(`Ignored child QB records: ${report.ignoredChildQbRecordCount}`);
  console.log(`Seed-ready: ${report.seedReadyCount}`);
  console.log(`Review: ${report.reviewCount}`);
  console.log(`Root QB IDs matched: ${report.rootQbIdsMatched}`);
  console.log(`Missing root IDs: ${report.missingRootIds}`);
  console.log(`Ambiguous root IDs: ${report.ambiguousRootIds}`);
  console.log(`Duplicate root ID refs: ${report.duplicateRootIds}`);
  console.log(`Invalid emails: ${report.primaryEmails.invalid}`);
  console.log(`Suspicious phones: ${report.primaryPhones.suspicious}`);
  console.log(`Address review: ${report.addressReviewCount}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`  ${seedPath}`);
  console.log(`  ${reviewPath}`);
  console.log(`  ${reportPath}`);
  for (const w of report.warnings || []) console.log(`Warning: ${w}`);
}

main();
