#!/usr/bin/env node
/**
 * Moraware Report Feed — promote calendar schedule rows from a persisted run.
 *
 * Reads moraware_report_raw_rows for report_type = calendar_schedule_rows,
 * aggregates worksheet-line duplicates, and promotes into moraware_calendar_schedule_rows.
 *
 * Modes:
 *   (default)       Dry-run: prints plan, no writes.
 *   --apply         Apply: supersedes prior active rows by row_hash, inserts aggregated stops.
 *   --allow-empty   With --apply only: allow apply even when zero stops would be promoted.
 *
 * Required env vars:
 *   MORAWARE_REPORT_RUN_ID (or --run-id)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * For --apply, also required:
 *   SUPABASE_WRITE_ENABLED=1
 *
 * Calendar promotion does NOT require identity_status=matched. View 222 rows promote
 * when Activity Date and Job Name are present on the raw CSV row.
 */
import "dotenv/config";

import { CALENDAR_SCHEDULE_REPORT_TYPE } from "../../moraware/reportFeeds/calendarScheduleConstants.js";
import { promoteCalendarScheduleRowsFromRun } from "../../moraware/reportFeeds/promoteCalendarScheduleRows.js";
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
      `promoteCalendarScheduleRows: missing required ${label}\n` +
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
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function formatStopSample(row, index) {
  const parts = [
    `#${index + 1}`,
    row.calendar_date ? `date=${row.calendar_date}` : null,
    row.scheduled_start_time ? `time=${row.scheduled_start_time}` : null,
    row.truck_or_crew_name ? `crew=${row.truck_or_crew_name}` : "crew=Unassigned",
    row.job_name ? `job=${row.job_name}` : null,
    row.sqft != null ? `sqft=${row.sqft}` : null,
    row.raw_payload?.aggregated?.sourceRowCount > 1
      ? `worksheetLines=${row.raw_payload.aggregated.sourceRowCount}`
      : null
  ].filter(Boolean);
  return parts.join(" · ");
}

function printBlockedResult(result) {
  console.log("BLOCKED — calendar schedule promotion refused.");
  console.log(`  Reason: ${result.error}`);
  if (result.detail) console.log(`  Detail: ${result.detail}`);
  console.log();
  switch (result.error) {
    case "report_run_not_found":
      console.log("  Verify --run-id matches a staged moraware_report_runs row.");
      break;
    case "not_calendar_schedule_feed":
      console.log(
        `  This script only promotes report_type="${CALENDAR_SCHEDULE_REPORT_TYPE}".`
      );
      console.log("  Use eos:moraware:promote-report-run-matched-facts for worksheet facts.");
      break;
    case "schema_drift_blocks_promotion":
      console.log("  Fix missing core expected columns before promoting.");
      if (result.detail?.unexpectedHeaders?.length && !(result.detail?.missingHeaders?.length)) {
        console.log(
          "  If this run only has extra First Install columns, promotion should now proceed."
        );
        console.log("  Re-run dry-run after deploying the schema drift policy update.");
      }
      break;
    case "calendar_schedule_table_not_installed":
      console.log("  Apply backend-core/supabase/eliteos_moraware_calendar_schedule.sql first.");
      break;
    case "zero_stops_promoted":
      console.log("  No schedule stops would be promoted for this run.");
      console.log(`  Calendar raw rows read: ${result.calendarRawRowsRead ?? 0}`);
      console.log(`  Rows skipped (missing Activity Date or Job Name): ${result.skippedMissingRequired ?? 0}`);
      console.log("  Apply was not committed. Pass --allow-empty only if an empty promotion is intentional.");
      break;
    default:
      break;
  }
}

async function main() {
  const applyFlag = args.includes("--apply");
  const allowEmptyFlag = args.includes("--allow-empty");
  const runId = requiredInput("MORAWARE_REPORT_RUN_ID", getArg("run-id"), "run-id");

  const dryRun = !applyFlag;
  const modeLabel = dryRun
    ? "DRY-RUN (no writes)"
    : allowEmptyFlag
      ? "APPLY (writes enabled, --allow-empty)"
      : "APPLY (writes enabled)";

  console.log("Moraware report-feed — promote calendar schedule rows");
  console.log(`  Run ID:   ${runId}`);
  console.log(`  Target:   moraware_calendar_schedule_rows`);
  console.log(`  Feed:     ${CALENDAR_SCHEDULE_REPORT_TYPE} only`);
  console.log(`  Mode:     ${modeLabel}`);
  console.log("  Identity: not required (view 222 schedule rows promote on calendar fields)");
  console.log();

  if (applyFlag && env("SUPABASE_WRITE_ENABLED") !== "1") {
    console.error(
      "BLOCKED — apply refused because SUPABASE_WRITE_ENABLED is not set to '1'.\n" +
        "  Set SUPABASE_WRITE_ENABLED=1 explicitly for this operation."
    );
    process.exit(1);
  }

  const db = dryRun ? createReadClient() : createWriteCapableClient();

  const result = await promoteCalendarScheduleRowsFromRun(db, runId, {
    apply: applyFlag,
    allowEmpty: allowEmptyFlag
  });

  if (!result.ok) {
    printBlockedResult(result);
    process.exit(1);
  }

  if (dryRun) {
    const pageNote =
      (result.rawRowFetchPages ?? 0) > 1 ? ` (${result.rawRowFetchPages} pages)` : "";
    console.log("Calendar raw rows read:              ", `${result.calendarRawRowsRead ?? 0}${pageNote}`);
    console.log("Promotable calendar lines:           ", result.promotableLineCount ?? 0);
    console.log("Schedule stops planned:              ", result.scheduleStopsPlanned ?? result.wouldPromote ?? 0);
    if ((result.skippedMissingRequired ?? 0) > 0) {
      console.log("Rows skipped (missing required fields):", result.skippedMissingRequired);
    }
    console.log();
    if ((result.sample?.length ?? 0) > 0) {
      console.log("Sample planned stops (up to 3):");
      for (const [i, row] of (result.sample ?? []).entries()) {
        console.log(`  ${formatStopSample(row, i)}`);
      }
      console.log();
    } else if ((result.scheduleStopsPlanned ?? 0) === 0) {
      console.log("WARNING: No calendar schedule stops would be promoted for this run.");
      console.log("  Check that raw rows include Activity Date and Job Name.");
      console.log();
    }
    console.log("DRY-RUN complete — no writes performed.");
    console.log(
      "To apply:\n" +
        "  SUPABASE_WRITE_ENABLED=1 npm run eos:moraware:promote-calendar-schedule-rows -- " +
        `--run-id ${runId} --apply`
    );
    return;
  }

  const pageNote =
    (result.rawRowFetchPages ?? 0) > 1 ? ` (${result.rawRowFetchPages} pages)` : "";
  console.log("Calendar raw rows read:              ", `${result.calendarRawRowsRead ?? 0}${pageNote}`);
  console.log("Promotable calendar lines:           ", result.promotableLineCount ?? 0);
  console.log("Schedule stops promoted:             ", result.scheduleStopsPromoted ?? result.promoted ?? 0);
  if ((result.skippedMissingRequired ?? 0) > 0) {
    console.log("Rows skipped (missing required fields):", result.skippedMissingRequired);
  }
  console.log();
  if (result.runStatusUpdated) {
    console.log('Run status set to "promoted".');
    console.log("Install Dashboard can now read moraware_calendar_schedule_rows for promoted dates.");
  } else {
    console.log('Run status unchanged (--allow-empty with zero promoted stops).');
  }
}

main().catch((err) => {
  console.error("\nFATAL:", formatCliError(err));
  process.exit(1);
});
