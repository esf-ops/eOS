#!/usr/bin/env node
/**
 * importSlabsmithInventoryXml.js — Slabsmith XML inventory dry-run import.
 *
 * Reads a Slabsmith export XML file, normalizes rows, and prints a summary.
 * NO Supabase writes. NO SQL Server connection. NO API routes.
 *
 * Usage:
 *   node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js
 *   node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js --file path/to/slabs.xml
 *
 * Default file (when --file omitted):
 *   debug/slabsmith/source-samples/slabs.xml  (repo root, gitignored)
 *
 * Sanitized fixture for CI/local smoke:
 *   backend-core/src/slabsmith/fixtures/sample-slabs.xml
 *
 * npm:
 *   npm run eos:slabsmith:import-inventory:dry-run
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SLABSMITH_EXTERNAL_SOURCE,
  SLABSMITH_SOURCE_SCOPE,
  normalizeSlabsmithInventory,
  summarizeSlabsmithRows,
} from "../../slabsmith/normalizeSlabsmithInventory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const DEFAULT_XML_PATH = join(REPO_ROOT, "debug/slabsmith/source-samples/slabs.xml");
const FIXTURE_XML_PATH = join(REPO_ROOT, "backend-core/src/slabsmith/fixtures/sample-slabs.xml");

/**
 * @param {string[]} argv
 * @returns {{ filePath: string | null, help: boolean }}
 */
export function parseCliArgs(argv) {
  const args = argv.slice(2);
  /** @type {{ filePath: string | null, help: boolean }} */
  const out = { filePath: null, help: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--file") {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("--file requires a path argument");
      }
      out.filePath = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

/**
 * Resolve CLI or default XML path to an absolute path.
 * @param {string | null} cliPath
 */
export function resolveXmlPath(cliPath) {
  const chosen = cliPath || DEFAULT_XML_PATH;
  return isAbsolute(chosen) ? chosen : resolve(REPO_ROOT, chosen);
}

/**
 * Strip raw_payload before printing sample records.
 * @param {Record<string, unknown>} row
 */
export function omitRawPayload(row) {
  if (!row || typeof row !== "object") return row;
  const { raw_payload: _raw, ...rest } = row;
  return rest;
}

/**
 * Build dry-run summary object from normalized rows.
 * @param {Array<Record<string, unknown>>} rows
 */
export function buildImportDryRunSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const base = summarizeSlabsmithRows(list);

  let rowsWithMissingDimensions = 0;
  let rowsWithMissingUsableSqft = 0;

  for (const row of list) {
    if (row.width_actual_in == null || row.length_actual_in == null) {
      rowsWithMissingDimensions += 1;
    }
    if (row.usable_sqft == null) {
      rowsWithMissingUsableSqft += 1;
    }
  }

  return {
    rows_seen: base.row_count,
    source_system: SLABSMITH_EXTERNAL_SOURCE,
    source_inventory_scope: SLABSMITH_SOURCE_SCOPE,
    count_by_source_inventory_type: base.by_type,
    count_by_source_price_group: base.by_source_price_group,
    missing_inventory_id: base.missing_inventory_id,
    needs_review: base.needs_review,
    rows_with_missing_dimensions: rowsWithMissingDimensions,
    rows_with_missing_usable_sqft: rowsWithMissingUsableSqft,
    sample_records: list.slice(0, 5).map((row) => omitRawPayload(row)),
  };
}

/**
 * @param {Record<string, unknown>} summary
 * @param {{ xmlPath: string, usedDefaultPath: boolean }} meta
 */
export function formatDryRunReport(summary, meta) {
  const lines = [
    "Slabsmith inventory import — DRY RUN (no Supabase writes)",
    "",
    `XML file: ${meta.xmlPath}`,
    meta.usedDefaultPath ? "  (default path)" : "  (--file override)",
    "",
    `rows_seen: ${summary.rows_seen}`,
    `source_system: ${summary.source_system}`,
    `source_inventory_scope: ${summary.source_inventory_scope}`,
    "",
    "count by source_inventory_type:",
    ...formatCountBlock(summary.count_by_source_inventory_type),
    "",
    "count by source_price_group:",
    ...formatCountBlock(summary.count_by_source_price_group),
    "",
    `missing InventoryID: ${summary.missing_inventory_id}`,
    `needs_review: ${summary.needs_review}`,
    `rows with missing dimensions: ${summary.rows_with_missing_dimensions}`,
    `rows with missing usable_sqft: ${summary.rows_with_missing_usable_sqft}`,
    "",
    "sample first 5 normalized records (raw_payload omitted):",
    JSON.stringify(summary.sample_records, null, 2),
  ];
  return lines.join("\n");
}

/**
 * @param {Record<string, number> | undefined} counts
 * @returns {string[]}
 */
function formatCountBlock(counts) {
  const entries = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) return ["  (none)"];
  return entries.map(([key, count]) => `  ${key}: ${count}`);
}

/**
 * @param {string} xmlPath
 */
export function readAndNormalizeXmlFile(xmlPath) {
  const xml = readFileSync(xmlPath, "utf8");
  if (!xml.trim()) {
    throw new Error("XML file is empty");
  }
  const { rows } = normalizeSlabsmithInventory(xml);
  if (!rows.length) {
    throw new Error("No Slabsmith.dbo.Slabs records found in XML");
  }
  return rows;
}

function printMissingFileHelp(requestedPath, usedDefaultPath) {
  console.error("Slabsmith inventory dry-run — XML file not found.\n");
  console.error(`Path: ${requestedPath}\n`);

  if (usedDefaultPath) {
    console.error(
      "The default local export is gitignored and is not checked into the repo.\n" +
        "Export slabs.xml from Slabsmith and place it at:\n" +
        `  debug/slabsmith/source-samples/slabs.xml\n\n` +
        "Or pass an explicit path:\n" +
        "  node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js --file path/to/slabs.xml\n\n" +
        "Sanitized fixture (3 fake rows):\n" +
        `  node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js --file ${FIXTURE_XML_PATH}`
    );
  } else {
    console.error("Check the --file path and try again.");
  }
}

function printHelp() {
  console.log(`Slabsmith inventory XML dry-run

Usage:
  node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js [--file <path>]

Options:
  --file <path>   Slabsmith export XML (default: debug/slabsmith/source-samples/slabs.xml)
  --help, -h      Show this help

npm:
  npm run eos:slabsmith:import-inventory:dry-run
`);
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function runImportDryRun(argv = process.argv) {
  const { filePath: cliPath, help } = parseCliArgs(argv);
  if (help) {
    printHelp();
    return 0;
  }

  const usedDefaultPath = !cliPath;
  const xmlPath = resolveXmlPath(cliPath);

  if (!existsSync(xmlPath)) {
    printMissingFileHelp(xmlPath, usedDefaultPath);
    return 1;
  }

  try {
    const rows = readAndNormalizeXmlFile(xmlPath);
    const summary = buildImportDryRunSummary(rows);
    console.log(formatDryRunReport(summary, { xmlPath, usedDefaultPath }));
    return 0;
  } catch (err) {
    console.error("Slabsmith inventory dry-run failed:");
    console.error(String(err?.message || err));
    return 1;
  }
}

async function main() {
  const code = await runImportDryRun();
  process.exit(code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
