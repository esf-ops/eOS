#!/usr/bin/env node
/**
 * probeQuickBooksLiveRead — bounded live read-only probe via CData QuickBooks Gateway.
 *
 * Usage:
 *   QB_LIVE_READ_ENABLED=1 \
 *   QB_GATEWAY_URL=https://qb-host:8166 \
 *   QB_GATEWAY_USER=... \
 *   QB_GATEWAY_PASSWORD=... \
 *   QB_GATEWAY_SSL_SERVER_CERT=/path/to/gateway.pem \
 *   node backend-core/src/scripts/probeQuickBooksLiveRead.mjs
 *
 * Optional:
 *   --out debug/quickbooks/live-read-probe
 *   --inferred debug/quickbooks/estimate-sales-truth-discovery/transaction-link-analysis.json
 *     (currently uses empty inferred set unless a compact inferred JSON is supplied;
 *      pass --inferred-links path/to/inferred-links.json with InferredEstimateLinks[])
 *
 * SAFETY:
 *   - Refuses to run unless QB_LIVE_READ_ENABLED=1
 *   - Never logs passwords
 *   - Query/read only — no EstimateAdd / InvoiceAdd / SalesOrderAdd / ReceivePaymentAdd
 */

import path from "node:path";
import process from "node:process";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  loadQuickBooksGatewayConfig,
  runQuickBooksLiveReadProbe,
  QUICKBOOKS_LIVE_READ_ENV_VARS,
} from "../quickbooks/live/index.js";

function printUsage() {
  console.log(`Usage:
  QB_LIVE_READ_ENABLED=1 QB_GATEWAY_URL=... QB_GATEWAY_USER=... QB_GATEWAY_PASSWORD=... \\
    node backend-core/src/scripts/probeQuickBooksLiveRead.mjs [--out <dir>] [--inferred-links <json>]

Required env:
  ${QUICKBOOKS_LIVE_READ_ENV_VARS.join("\n  ")}

Read-only. Does not write to QuickBooks.`);
}

/**
 * @param {string[]} argv
 */
export function parseProbeArgs(argv) {
  /** @type {{ outDir?: string, inferredLinksPath?: string, help?: boolean }} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--out") {
      out.outDir = argv[++i];
      continue;
    }
    if (arg.startsWith("--out=")) {
      out.outDir = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--inferred-links") {
      out.inferredLinksPath = argv[++i];
      continue;
    }
    if (arg.startsWith("--inferred-links=")) {
      out.inferredLinksPath = arg.slice("--inferred-links=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

/**
 * @param {string[]} argv
 */
export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseProbeArgs(argv);
  } catch (err) {
    console.error(String(err?.message || err));
    printUsage();
    return 1;
  }
  if (args.help) {
    printUsage();
    return 0;
  }

  const config = loadQuickBooksGatewayConfig();
  if (!config.enabled) {
    console.error("Refusing to connect: QB_LIVE_READ_ENABLED is not set to 1.");
    printUsage();
    return 1;
  }

  /** @type {import('../quickbooks/live/compareLiveLinksToInferred.js').InferredEstimateLinks[]} */
  let inferredLinks = [];
  if (args.inferredLinksPath) {
    const raw = await fs.readFile(path.resolve(args.inferredLinksPath), "utf8");
    const parsed = JSON.parse(raw);
    inferredLinks = Array.isArray(parsed) ? parsed : parsed.inferredLinks || [];
  }

  const outDir =
    args.outDir || path.resolve(process.cwd(), "debug/quickbooks/live-read-probe");

  console.log("EliteOS QuickBooks live read probe (Gateway HTTP+QBXML, read-only)");
  console.log(`Output: ${outDir}`);
  console.log(`Enabled: ${config.enabled}`);
  console.log(`Gateway URL configured: ${Boolean(config.gatewayUrl)}`);
  console.log(`User configured: ${Boolean(config.user)}`);
  console.log(`Password configured: ${Boolean(config.password)}`);
  console.log("Write APIs: NONE");

  const result = await runQuickBooksLiveReadProbe({
    config,
    outputDir: outDir,
    inferredLinks,
    onProgress: (msg) => console.log(`  … ${msg}`),
  });

  console.log("Done.");
  console.log(
    `Counts: estimates=${result.counts.estimates} salesOrders=${result.counts.salesOrders} invoices=${result.counts.invoices} payments=${result.counts.payments}`
  );
  if (Object.keys(result.sectionErrors).length) {
    console.log(`Section errors: ${Object.keys(result.sectionErrors).join(", ")}`);
  }
  console.log(`Artifacts: ${result.artifacts.join(", ")}`);
  return result.connectionSummary.success === false && Object.keys(result.sectionErrors).length
    ? 2
    : 0;
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirect) {
  main().then((code) => process.exit(code));
}
