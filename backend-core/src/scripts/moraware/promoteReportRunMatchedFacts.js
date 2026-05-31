#!/usr/bin/env node
/**
 * Moraware Report Feed — promote prepared facts from a persisted/enriched run.
 *
 * Reads moraware_report_raw_rows where identity_status = "matched" for a
 * given run, then promotes them to moraware_prepared_sales_worksheet_facts,
 * preserving supersede semantics (deactivate old → insert new → backfill).
 *
 * Modes:
 *   (default)               Dry-run: prints plan, no writes.
 *   --apply --matched-only  Apply: promotes matched rows, excludes ambiguous.
 *   --review-ambiguous      Read-only: prints ambiguous match keys and candidate IDs.
 *
 * Required env vars:
 *   MORAWARE_REPORT_RUN_ID (or --run-id)
 *   MORAWARE_DEFAULT_ORGANIZATION_ID (or --organization-id)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * For --apply, also required:
 *   SUPABASE_WRITE_ENABLED=1
 *   --matched-only  (required if the run has ambiguous_identity rows)
 *
 * Safe output:
 * - Prints counts, run status, plan summary, match keys (no raw row values).
 * - Never prints raw customer row data, credentials, or secrets.
 * - Default is always dry-run — pass --apply to write.
 */
import "dotenv/config";

import {
  reviewAmbiguousRows,
  promotePersistedRunMatchedFacts
} from "../../moraware/reportFeeds/promotePersistedRunMatchedFacts.js";
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
      `promoteReportRunMatchedFacts: missing required ${label}\n` +
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
  const matchedOnlyFlag = args.includes("--matched-only");
  const reviewAmbiguousFlag = args.includes("--review-ambiguous");

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

  // ── Mode: review ambiguous ──────────────────────────────────────────────────
  if (reviewAmbiguousFlag) {
    console.log("Moraware report-feed — ambiguity review (read-only)");
    console.log(`  Run ID:  ${runId}`);
    console.log(`  Org ID:  ${organizationId}`);
    console.log();

    const db = createReadClient();
    const review = await reviewAmbiguousRows(db, { runId, organizationId });

    console.log(`Run status:    ${review.runStatus}`);
    console.log("Identity counts:");
    console.log(`  matched:   ${review.counts.matched}`);
    console.log(`  ambiguous: ${review.counts.ambiguous}`);
    console.log(`  unmatched: ${review.counts.unmatched}`);
    console.log();

    if (review.ambiguousLinks.length === 0) {
      console.log("No ambiguous identity links found for this run.");
    } else {
      console.log(`Ambiguous identity links (${review.ambiguousLinks.length}):`);
      console.log("  (match_key is a normalised account+job string — no raw customer data)");
      console.log();
      for (const link of review.ambiguousLinks) {
        console.log(`  match_key: ${link.match_key}`);
        console.log(`    account_id: ${link.account_id ?? "(none)"}`);
        console.log(`    job_id:     ${link.job_id ?? "(none)"}`);
        console.log(`    source:     ${link.source}`);
      }
    }
    console.log();
    console.log(
      "To exclude ambiguous rows from promotion, use:\n" +
      "  --apply --matched-only"
    );
    return;
  }

  // ── Modes: dry-run or apply ─────────────────────────────────────────────────
  const dryRun = !applyFlag;
  const modeLabel = dryRun
    ? "DRY-RUN (no writes)"
    : (matchedOnlyFlag ? "APPLY matched-only (ambiguous rows excluded)" : "APPLY full");

  console.log("Moraware report-feed — promote matched prepared facts");
  console.log(`  Run ID:       ${runId}`);
  console.log(`  Org ID:       ${organizationId}`);
  console.log(`  Mode:         ${modeLabel}`);
  if (matchedOnlyFlag) {
    console.log("  matched-only: YES — ambiguous rows will be excluded from prepared facts");
  }
  console.log();

  if (applyFlag && !matchedOnlyFlag) {
    // Warn that --apply without --matched-only requires zero ambiguous rows.
    console.log(
      "NOTE: --apply without --matched-only will be blocked if the run has\n" +
      "      ambiguous_identity rows.  Pass --matched-only to exclude them."
    );
    console.log();
  }

  const db = dryRun ? createReadClient() : createWriteCapableClient();

  const result = await promotePersistedRunMatchedFacts(db, {
    runId,
    organizationId,
    matchedOnly: matchedOnlyFlag,
    dryRun
  });

  // ── Dry-run output ──────────────────────────────────────────────────────────
  if (dryRun) {
    if (result.skipped) {
      console.log(`BLOCKED — promotion would be refused.`);
      console.log(`  Reason:   ${result.reason}`);
      if (result.details) {
        console.log(`  Details:  ${JSON.stringify(result.details)}`);
      }
      console.log();
      if (result.reason === "ambiguous_rows_require_matched_only_flag") {
        console.log(
          "  Pass --matched-only to promote only identity_status='matched' rows\n" +
          "  while explicitly excluding ambiguous rows from prepared facts."
        );
      }
      return;
    }

    console.log(`Run status:         ${result.runStatus}`);
    console.log(`Report feed ID:     ${result.reportFeedId}`);
    console.log(`Schema drift:       ${result.schemaDrift ? "YES (would be blocked)" : "none"}`);
    console.log();
    console.log("Promotion plan:");
    console.log(`  Matched rows eligible:   ${result.matchedRowsEligible}`);
    console.log(`  Ambiguous rows excluded: ${result.ambiguousExcluded}`);
    console.log(`  Unmatched rows:          ${result.unmatchedCount}`);
    console.log(`  Old facts to deactivate: ${result.plan.deactivateCount}`);
    console.log(`  New facts to insert:     ${result.plan.insertCount}`);
    console.log(`  Superseded_by backfills: ${result.plan.backfillCount}`);
    console.log();
    console.log("DRY-RUN complete — no writes performed.");
    console.log(
      "To apply, run with --apply --matched-only (and SUPABASE_WRITE_ENABLED=1)."
    );
    return;
  }

  // ── Apply output ────────────────────────────────────────────────────────────
  if (result.skipped) {
    console.log(`BLOCKED — promotion refused.`);
    console.log(`  Reason:   ${result.reason}`);
    if (result.details) {
      console.log(`  Details:  ${JSON.stringify(result.details)}`);
    }
    process.exit(1);
  }

  console.log(`Run status (after):  ${result.runStatus}`);
  console.log(`Report feed ID:      ${result.reportFeedId}`);
  console.log();
  console.log("Promotion applied:");
  console.log(`  Matched rows promoted:   ${result.insertCount}`);
  console.log(`  Old facts deactivated:   ${result.deactivateCount}`);
  console.log(`  superseded_by backfills: ${result.backfillCount}`);
  console.log(`  Ambiguous rows excluded: ${result.ambiguousExcluded}`);
  console.log(`  Unmatched rows excluded: ${result.unmatchedExcluded}`);
  console.log();
  if (result.matchedOnly && result.ambiguousExcluded > 0) {
    console.log(
      `NOTE: ${result.ambiguousExcluded} ambiguous row(s) remain in moraware_report_raw_rows.\n` +
      "      Run --review-ambiguous to inspect them.\n" +
      "      Run status kept as \"" + result.runStatus + "\" (not \"promoted\") because\n" +
      "      ambiguous rows have not been resolved."
    );
  } else {
    console.log(`Run status set to "promoted".`);
  }
}

main().catch((err) => {
  console.error("\nFATAL:", formatCliError(err));
  process.exit(1);
});
