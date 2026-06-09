#!/usr/bin/env node
/**
 * importSlabsmithInventoryXml.js — Slabsmith XML inventory import (dry-run + write-gated).
 *
 * Reads a Slabsmith export XML file, normalizes rows, and either:
 *   - prints a dry-run summary (default),
 *   - runs read-only Supabase preflight (--preflight), or
 *   - persists to Supabase when SLABSMITH_INVENTORY_WRITE_ENABLED=1.
 *
 * NO SQL Server connection. NO API routes.
 *
 * Usage:
 *   node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js
 *   node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js --file path/to/slabs.xml
 *   node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js --preflight
 *
 * Preflight mode (read-only Supabase; requires env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SLABOS_ORGANIZATION_ID
 *
 * Write mode (requires env):
 *   SLABSMITH_INVENTORY_WRITE_ENABLED=1
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SLABOS_ORGANIZATION_ID
 *   SLABSMITH_SYNC_TRIGGERED_BY=local_script   (optional)
 *
 * Default file (when --file omitted):
 *   debug/slabsmith/source-samples/slabs.xml  (repo root, gitignored)
 *
 * npm:
 *   npm run eos:slabsmith:import-inventory:dry-run
 *   npm run eos:slabsmith:import-inventory:preflight
 *   npm run eos:slabsmith:import-inventory
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  SLABSMITH_EXTERNAL_SOURCE,
  SLABSMITH_SOURCE_SCOPE,
  normalizeSlabsmithInventory,
  summarizeSlabsmithRows,
} from "../../slabsmith/normalizeSlabsmithInventory.js";
import {
  isSlabsmithWriteEnabled,
  persistSlabsmithInventory,
  SLABSMITH_WRITE_ENV,
} from "../../slabsmith/slabsmithPersistence.js";
import {
  formatPreflightReport,
  runSlabsmithPreflight,
  validatePreflightEnv,
} from "../../slabsmith/slabsmithPreflight.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const DEFAULT_XML_PATH = join(REPO_ROOT, "debug/slabsmith/source-samples/slabs.xml");
const FIXTURE_XML_PATH = join(REPO_ROOT, "backend-core/src/slabsmith/fixtures/sample-slabs.xml");

/**
 * @param {string[]} argv
 * @returns {{ filePath: string | null, help: boolean, preflight: boolean }}
 */
export function parseCliArgs(argv) {
  const args = argv.slice(2);
  /** @type {{ filePath: string | null, help: boolean, preflight: boolean }} */
  const out = { filePath: null, help: false, preflight: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--preflight") {
      out.preflight = true;
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
 * @param {Record<string, unknown>} result
 * @param {{ xmlPath: string, usedDefaultPath: boolean }} meta
 */
export function formatWriteReport(result, meta) {
  const lines = [
    "Slabsmith inventory import — WRITE MODE",
    "",
    `XML file: ${meta.xmlPath}`,
    meta.usedDefaultPath ? "  (default path)" : "  (--file override)",
    "",
    `rows_seen: ${result.rows_seen}`,
    `inserted: ${result.inserted ?? 0}`,
    `updated: ${result.updated ?? 0}`,
    `unchanged: ${result.unchanged ?? 0}`,
    `raw_records_written: ${result.raw_records_written ?? 0}`,
    `slab_inventory_upserted: ${result.slab_inventory_upserted ?? 0}`,
    `needs_review: ${result.needs_review ?? 0}`,
    `sync_run_id: ${result.syncRunId ?? "(none)"}`,
    `status: ${result.status ?? "(unknown)"}`,
    `errors: ${result.errors ?? "none"}`,
  ];

  if (Array.isArray(result.warnings) && result.warnings.length) {
    lines.push("", "warnings:", ...result.warnings.slice(0, 10).map((w) => `  - ${w}`));
    if (result.warnings.length > 10) {
      lines.push(`  … and ${result.warnings.length - 10} more`);
    }
  }

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

/**
 * Validate write-mode environment. Never prints secret values.
 */
export function validateWriteEnv() {
  /** @type {string[]} */
  const missing = [];
  if (!process.env.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!(process.env.SLABOS_ORGANIZATION_ID || process.env.SLABCLOUD_ORGANIZATION_ID)?.trim()) {
    missing.push("SLABOS_ORGANIZATION_ID");
  }
  if (missing.length) {
    throw new Error(
      `Write mode requires: ${missing.join(", ")}. Set ${SLABSMITH_WRITE_ENV}=1 only when ready to persist.`
    );
  }
}

/**
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createWriteSupabaseClient() {
  validateWriteEnv();
  return createSupabaseServiceClient();
}

export function createSupabaseServiceClient() {
  return createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function resolveOrganizationId() {
  return (
    process.env.SLABOS_ORGANIZATION_ID?.trim() ||
    process.env.SLABCLOUD_ORGANIZATION_ID?.trim() ||
    null
  );
}

export function resolvePreflightOrganizationId() {
  return process.env.SLABOS_ORGANIZATION_ID?.trim() || null;
}

function printMissingFileHelp(requestedPath, usedDefaultPath) {
  console.error("Slabsmith inventory import — XML file not found.\n");
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
  console.log(`Slabsmith inventory XML import

Usage:
  node backend-core/src/scripts/slabsmith/importSlabsmithInventoryXml.js [--file <path>] [--preflight]

Options:
  --file <path>   Slabsmith export XML (default: debug/slabsmith/source-samples/slabs.xml)
  --preflight     Read-only Supabase table/source readiness check (no mutations)
  --help, -h      Show this help

Dry-run (default):
  No Supabase writes unless ${SLABSMITH_WRITE_ENV}=1

Preflight mode:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SLABOS_ORGANIZATION_ID

Write mode:
  ${SLABSMITH_WRITE_ENV}=1
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SLABOS_ORGANIZATION_ID
  SLABSMITH_SYNC_TRIGGERED_BY=local_script   (optional)

npm:
  npm run eos:slabsmith:import-inventory:dry-run
  npm run eos:slabsmith:import-inventory:preflight
  npm run eos:slabsmith:import-inventory
`);
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function runSlabsmithImport(argv = process.argv) {
  const { filePath: cliPath, help, preflight } = parseCliArgs(argv);
  if (help) {
    printHelp();
    return 0;
  }

  const usedDefaultPath = !cliPath;
  const xmlPath = resolveXmlPath(cliPath);
  const meta = { xmlPath, usedDefaultPath };

  if (!existsSync(xmlPath)) {
    printMissingFileHelp(xmlPath, usedDefaultPath);
    return 1;
  }

  try {
    const rows = readAndNormalizeXmlFile(xmlPath);

    if (preflight) {
      validatePreflightEnv();
      const organizationId = resolvePreflightOrganizationId();
      if (!organizationId) {
        throw new Error("Preflight requires SLABOS_ORGANIZATION_ID");
      }
      const db = createSupabaseServiceClient();
      const report = await runSlabsmithPreflight({
        db,
        organizationId,
        incomingRows: rows,
        summarizeIncoming: summarizeSlabsmithRows,
      });
      console.log(formatPreflightReport(report));
      return report.recommendation.safe_to_write ? 0 : 1;
    }

    const writeEnabled = isSlabsmithWriteEnabled();

    if (!writeEnabled) {
      const summary = buildImportDryRunSummary(rows);
      console.log(formatDryRunReport(summary, meta));
      return 0;
    }

    validateWriteEnv();
    const db = createWriteSupabaseClient();
    const organizationId = resolveOrganizationId();
    const triggeredBy = process.env.SLABSMITH_SYNC_TRIGGERED_BY?.trim() || "local_script";

    const result = await persistSlabsmithInventory({
      db,
      organizationId,
      normalized: rows,
      writeEnabled: true,
      runMeta: { triggeredBy },
    });

    console.log(formatWriteReport(result, meta));
    return result.status === "completed" ? 0 : 1;
  } catch (err) {
    const { preflight: isPreflight } = parseCliArgs(argv);
    const label = isPreflight
      ? "Slabsmith inventory preflight failed:"
      : isSlabsmithWriteEnabled()
        ? "Slabsmith inventory write failed:"
        : "Slabsmith inventory dry-run failed:";
    console.error(label);
    console.error(String(err?.message || err));
    return 1;
  }
}

/** @deprecated alias */
export const runImportDryRun = runSlabsmithImport;

async function main() {
  const code = await runSlabsmithImport();
  process.exit(code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
