#!/usr/bin/env node
/**
 * Moraware Report Feed — post-hoc API mirror identity enrichment.
 *
 * Resolves moraware_report_raw_rows that are still "needs_identity_review" after
 * initial staging, using the existing brain_moraware_jobs API mirror as the
 * full-coverage identity source.
 *
 * Default behavior: DRY-RUN (prints plan, no writes).
 * Pass --apply to perform writes.
 *
 * Required env vars:
 *   MORAWARE_REPORT_RUN_ID (or --run-id)
 *   MORAWARE_DEFAULT_ORGANIZATION_ID (or --organization-id)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * For --apply, also required:
 *   SUPABASE_WRITE_ENABLED=1
 *
 * Safe output:
 * - Prints counts, run status, plan summary.
 * - Never prints raw customer row data.
 * - Never prints credentials or secrets.
 */
import "dotenv/config";

import {
  enrichRunFromApiMirror
} from "../../moraware/reportFeeds/enrichRunFromApiMirror.js";
import {
  createReadClient,
  createWriteCapableClient
} from "../../moraware/reportFeeds/reportFeedDbClient.js";

const args = process.argv.slice(2);

function getArg(name) {
  const eqForm = args.find((a) => a.startsWith(`--${name}=`));
  if (eqForm) return eqForm.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return null;
}

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requiredInput(envName, argValue, label) {
  const v = argValue ?? env(envName);
  if (!v) {
    throw new Error(
      `enrichReportRunFromApiMirror: missing required ${label}\n` +
        `  Set env var ${envName} or pass --${label}`
    );
  }
  return v;
}

function formatCliError(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.stack || err.message;
  const parts = [
    err.message,
    err.code && `[code=${err.code}]`,
    err.details && `[details=${err.details}]`,
    err.hint && `[hint=${err.hint}]`
  ].filter(Boolean);
  if (parts.length) return parts.join(" ");
  try { return JSON.stringify(err); } catch { return String(err); }
}

async function main() {
  const applyFlag = args.includes("--apply");
  const runId = requiredInput(
    "MORAWARE_REPORT_RUN_ID",
    getArg("run-id"),
    "run-id"
  );
  const organizationId = requiredInput(
    "MORAWARE_DEFAULT_ORGANIZATION_ID",
    getArg("organization-id"),
    "organization-id"
  );
  const dryRun = !applyFlag;

  console.log("Moraware report-feed — API mirror identity enrichment");
  console.log(`  Run ID:        ${runId}`);
  console.log(`  Org ID:        ${organizationId}`);
  console.log(`  Mode:          ${dryRun ? "DRY-RUN (no writes)" : "APPLY (writes enabled)"}`);
  console.log();

  const db = dryRun ? createReadClient() : createWriteCapableClient();
  const result = await enrichRunFromApiMirror(db, { runId, organizationId, dryRun });

  console.log("Run status:           ", result.runStatus);
  console.log("API mirror jobs (total):", result.mapSummary.totalJobs);
  console.log("API mirror jobs (usable):", result.mapSummary.usableJobs);
  console.log("  Duplicate keys:     ", result.mapSummary.duplicateKeyCount);
  console.log();
  console.log("Eligible rows (needs_identity_review):", result.plan.eligible);
  console.log("  Would match:        ", result.plan.matched);
  console.log("  Would be ambiguous: ", result.plan.ambiguous);
  console.log("  Would skip:         ", result.plan.skipped);
  console.log();

  if (dryRun) {
    console.log("Current run counts:");
    console.log("  matched:    ", result.currentCounts.matched);
    console.log("  unmatched:  ", result.currentCounts.unmatched);
    console.log("  ambiguous:  ", result.currentCounts.ambiguous);
    console.log();
    console.log("DRY-RUN complete — no writes performed.");
    console.log(
      "Run with --apply (and SUPABASE_WRITE_ENABLED=1) to apply these changes."
    );
  } else {
    console.log("Previous run counts:");
    console.log("  matched:    ", result.previousCounts.matched);
    console.log("  unmatched:  ", result.previousCounts.unmatched);
    console.log("  ambiguous:  ", result.previousCounts.ambiguous);
    console.log();
    console.log("New run counts:");
    console.log("  matched:    ", result.newCounts.matched);
    console.log("  unmatched:  ", result.newCounts.unmatched);
    console.log("  ambiguous:  ", result.newCounts.ambiguous);
    console.log();
    console.log("Applied successfully.");
  }
}

main().catch((err) => {
  console.error("\nFATAL:", formatCliError(err));
  process.exit(1);
});
