#!/usr/bin/env node
/**
 * Profile Account Master List workbook (counts only on console).
 *
 *   npm run account-directory:master-list:profile -- \
 *     --input local-imports/account-directory/master-list/Account_Master_List_1784844180.xlsx
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertAllowedMasterListInputPath,
  extractMasterListRows
} from "../accountDirectory/accountDirectoryMasterList.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") out.input = argv[++i];
    else if (a === "--output-dir" || a === "-o") out.outputDir = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: --input <path-under-local-imports/account-directory/>");
    process.exit(1);
  }
  const resolved = assertAllowedMasterListInputPath(args.input, { repoRoot: REPO_ROOT });
  const { profile } = extractMasterListRows(resolved, {
    workbookFileName: path.basename(resolved)
  });
  const outDir =
    args.outputDir ||
    path.resolve(REPO_ROOT, "local-imports/account-directory/master-list/output");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "master-list-profile.json");
  fs.writeFileSync(outPath, JSON.stringify(profile, null, 2));

  console.log("Account Master List profile (counts only)");
  console.log(`totalRows: ${profile.totalRows}`);
  console.log(`usableRows: ${profile.usableRows}`);
  console.log(`uniqueNames: ${profile.uniqueNames}`);
  console.log(`duplicateNameGroups: ${profile.duplicateNameGroups}`);
  console.log("sectionCounts:");
  for (const [k, v] of Object.entries(profile.sectionCounts || {})) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("statusCounts:");
  for (const [k, v] of Object.entries(profile.statusCounts || {})) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("excludedCounts:");
  for (const [k, v] of Object.entries(profile.excludedCounts || {})) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`wrote: ${outPath}`);
}

main();
