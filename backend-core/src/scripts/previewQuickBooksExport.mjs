#!/usr/bin/env node
/**
 * previewQuickBooksExport — Phase 1 QuickBooks ingestion (local export preview only).
 *
 * Usage:
 *   node backend-core/src/scripts/previewQuickBooksExport.mjs /path/to/export-folder
 *
 * Reads a local QuickBooks SDK connector export folder and prints a safe summary:
 * run metadata, per-entity counts, missing/unknown folders, and warnings.
 *
 * SAFETY:
 *   - No raw records are read into this script's output. No customer names, invoice
 *     numbers, addresses, emails, phone numbers, amounts, or memo text are printed.
 *   - No Supabase writes. No network calls. No QuickBooks connection of any kind.
 *
 * Exit codes:
 *   0 — manifest.json is present and valid (summary printed; warnings may still exist)
 *   1 — usage error, or manifest.json missing/invalid
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { readQuickBooksExport } from "../quickbooks/quickBooksExportReader.js";
import { buildQuickBooksExportSummary } from "../quickbooks/quickBooksExportSummary.js";

function printUsage() {
  console.log("Usage: node backend-core/src/scripts/previewQuickBooksExport.mjs /path/to/export-folder");
}

/**
 * Format a single per-entity summary line as `key=value` tokens joined by exactly one
 * space each, regardless of value width/formatting — avoids any risk of adjacent
 * tokens running together (e.g. `discoveredJsonFileCount=310discoveredRecordCount=...`).
 * Contains only safe counts/flags — never raw record content.
 *
 * @param {string} entityType
 * @param {object} entitySummary
 * @returns {string}
 */
export function formatEntitySummaryLine(entityType, entitySummary) {
  const tokens = [
    `inManifest=${entitySummary.inManifest}`,
    `folderExists=${entitySummary.folderExists}`,
    `manifestBatchCount=${entitySummary.manifestBatchCount}`,
    `manifestRecordCount=${entitySummary.manifestRecordCount}`,
    `discoveredJsonFileCount=${entitySummary.discoveredJsonFileCount}`,
    `discoveredRecordCount=${entitySummary.discoveredRecordCount}`,
    `manifestErrorCount=${entitySummary.manifestErrorCount}`,
    `unreadableFileCount=${entitySummary.unreadableFileCount}`,
    `unrecognizedShapeFileCount=${entitySummary.unrecognizedShapeFileCount}`,
    `selfReportedOnlyFileCount=${entitySummary.selfReportedOnlyFileCount}`,
  ];

  return `  ${entityType}: ${tokens.join(" ")}`;
}

/**
 * Build every line of the preview output, in print order, as an array of strings.
 * This is the single source of truth for the printed output — `printSummary` just
 * logs each line returned here, so there is exactly one place that assembles the
 * per-entity line (via `formatEntitySummaryLine`) and no separate inline/duplicate
 * formatting path can drift out of sync with it.
 *
 * @param {object} summary
 * @returns {string[]}
 */
export function buildSummaryOutputLines(summary) {
  const lines = [
    "EliteOS QuickBooks export preview (local, read-only — no Supabase writes, no network calls)",
    `Export folder: ${summary.exportFolderPath}`,
    `Manifest valid: ${summary.manifestValid}`,
    `Run ID: ${summary.runId}`,
    `QBXML version: ${summary.qbXmlVersion}`,
    `Started: ${summary.startedAt}`,
    `Completed: ${summary.completedAt}`,
    `Total entity types (manifest): ${summary.totalEntityTypesInManifest}`,
    `Total record count (manifest): ${summary.totalManifestRecordCount}`,
    `Total record count (discovered files): ${summary.totalDiscoveredRecordCount}`,
    `Manifest top-level error count: ${summary.manifestTopLevelErrorCount}`,
    "",
    "Per-entity summary:",
  ];

  for (const [entityType, entitySummary] of Object.entries(summary.perEntity)) {
    lines.push(formatEntitySummaryLine(entityType, entitySummary));
  }

  if (summary.missingFolders.length > 0) {
    lines.push("", `Missing folders: ${summary.missingFolders.join(", ")}`);
  }

  if (summary.unknownFolders.length > 0) {
    lines.push(`Unknown folders (ignored safely): ${summary.unknownFolders.join(", ")}`);
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of summary.warnings) {
      lines.push(`  - ${warning}`);
    }
  } else {
    lines.push("", "No warnings.");
  }

  return lines;
}

export function printSummary(summary) {
  for (const line of buildSummaryOutputLines(summary)) {
    console.log(line);
  }
}

async function main() {
  const exportFolderArg = process.argv[2];
  if (!exportFolderArg) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const exportFolderPath = path.resolve(exportFolderArg);
  const readResult = await readQuickBooksExport(exportFolderPath);
  const summary = buildQuickBooksExportSummary(readResult);

  printSummary(summary);

  process.exitCode = summary.manifestValid ? 0 : 1;
}

const isRunAsCliScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isRunAsCliScript) {
  main().catch((err) => {
    console.error(`previewQuickBooksExport failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
}
