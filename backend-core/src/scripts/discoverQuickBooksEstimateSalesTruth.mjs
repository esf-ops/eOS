#!/usr/bin/env node
/**
 * discoverQuickBooksEstimateSalesTruth — offline, read-only discovery.
 *
 * Usage:
 *   QB_EXPORT_DIR=/path/to/materialized-export \
 *     node backend-core/src/scripts/discoverQuickBooksEstimateSalesTruth.mjs
 *
 *   node backend-core/src/scripts/discoverQuickBooksEstimateSalesTruth.mjs /path/to/materialized-export
 *
 * Optional:
 *   --out debug/quickbooks/estimate-sales-truth-discovery
 *
 * SAFETY:
 *   - Never connects to QuickBooks, CData, or any network service.
 *   - Never mutates the export directory.
 *   - Never implements EstimateAdd / InvoiceAdd / SalesOrderAdd / ReceivePaymentAdd.
 *   - Writes aggregated JSON under the output directory (gitignored debug/ by default).
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  resolveExportDir,
  runEstimateSalesTruthDiscovery,
} from "../quickbooks/estimateSalesTruth/index.js";

function printUsage() {
  console.log(`Usage:
  QB_EXPORT_DIR=/path/to/export node backend-core/src/scripts/discoverQuickBooksEstimateSalesTruth.mjs
  node backend-core/src/scripts/discoverQuickBooksEstimateSalesTruth.mjs /path/to/export [--out <dir>]

Offline read-only discovery. Does not connect to QuickBooks or CData. Does not write to QuickBooks.`);
}

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {{ exportDir?: string, outDir?: string, help?: boolean }} */
  const out = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--out") {
      out.outDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      out.outDir = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positionals.push(arg);
  }
  if (positionals[0]) out.exportDir = positionals[0];
  return out;
}

/**
 * @param {string[]} argv
 */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  let exportDir;
  try {
    exportDir = resolveExportDir(args.exportDir);
  } catch (err) {
    console.error(String(err?.message || err));
    printUsage();
    return 1;
  }

  const outDir =
    args.outDir ||
    path.resolve(process.cwd(), "debug/quickbooks/estimate-sales-truth-discovery");

  console.log("EliteOS QuickBooks Estimate + Sales Financial Truth discovery (offline, read-only)");
  console.log(`Export: ${exportDir}`);
  console.log(`Output: ${outDir}`);
  console.log("Connecting to QuickBooks/CData: NO");
  console.log("Mutating export: NO");
  console.log("Write APIs: NONE");

  const result = await runEstimateSalesTruthDiscovery(exportDir, {
    outputDir: outDir,
    onProgress: (msg) => console.log(`  … ${msg}`),
  });

  console.log("Done.");
  console.log(
    `Counts: estimates=${result.counts.estimates} estimateLines=${result.counts.estimateLines} salesOrders=${result.counts.salesOrders} invoices=${result.counts.invoices} payments=${result.counts.payments}`
  );
  console.log(`Artifacts (${result.artifacts.length}): ${result.artifacts.join(", ")}`);
  const dominant = result.flowSummary?.dominantPath;
  if (dominant) {
    console.log(`Dominant inferred path: ${dominant.path} (count=${dominant.count})`);
  }
  console.log(
    `Sold/Booked candidate: ${result.truthProposal?.strongestSoldCandidate?.candidate} [${result.truthProposal?.strongestSoldCandidate?.confidence}]`
  );
  return 0;
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirect) {
  main().then((code) => process.exit(code));
}
