#!/usr/bin/env node
/**
 * Moraware calendar schedule feed — live fetch → stage → promote (view 222).
 *
 * Worker/operator script for Install Dashboard schedule rows.
 * Does NOT touch Moraware writeback, route optimization, or frontend secrets.
 *
 * Pipeline:
 *   fetchReportFeedArtifacts (Moraware view 222 CSV + HTML)
 *   → processReportFeedLocal
 *   → persistReportFeedRun (staging)
 *   → promoteCalendarScheduleRowsFromRun (--apply, idempotent replace-before-insert)
 *
 * Required env:
 *   MORAWARE_API_URL, MORAWARE_USERNAME, MORAWARE_PASSWORD
 *   MORAWARE_DEFAULT_ORGANIZATION_ID
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_WRITE_ENABLED=1
 *
 * Optional:
 *   MORAWARE_WEB_BASE_URL
 *   MORAWARE_REPORT_VIEW_ID (default 222)
 *   MORAWARE_CALENDAR_SCHEDULE_ARTIFACT_DIR
 *   MORAWARE_CALENDAR_SCHEDULE_ALLOW_EMPTY=1
 */
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CALENDAR_SCHEDULE_DEFAULT_VIEW_ID,
  CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
  CALENDAR_SCHEDULE_EXPORT_PATH,
  CALENDAR_SCHEDULE_HTML_PATH,
  CALENDAR_SCHEDULE_REPORT_TYPE
} from "../../moraware/reportFeeds/calendarScheduleConstants.js";
import { fetchReportFeedArtifacts } from "../../moraware/reportFeeds/fetchReportFeedArtifacts.js";
import { processReportFeedLocal } from "../../moraware/reportFeeds/processReportFeed.js";
import { promoteCalendarScheduleRowsFromRun } from "../../moraware/reportFeeds/promoteCalendarScheduleRows.js";
import {
  loadReportFeedContract,
  persistReportFeedRun
} from "../../moraware/reportFeeds/reportFeedPersistence.js";
import { createWriteCapableClient } from "../../moraware/reportFeeds/reportFeedDbClient.js";
import { isSchemaDriftBlocking } from "../../moraware/reportFeeds/schemaDriftPolicy.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requiredEnv(name) {
  const v = env(name);
  if (!v) throw new Error(`syncCalendarScheduleFeed: missing required env var ${name}`);
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

export function buildCalendarScheduleArtifactDir(baseDir, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(baseDir, `calendar-schedule-${stamp}`);
}

export function buildSyncLogSummary(parts) {
  return {
    startedAt: parts.startedAt,
    finishedAt: parts.finishedAt ?? new Date().toISOString(),
    reportType: CALENDAR_SCHEDULE_REPORT_TYPE,
    morawareViewId: parts.morawareViewId,
    organizationId: parts.organizationId,
    runId: parts.runId ?? null,
    runStatus: parts.runStatus ?? null,
    rawRowCount: parts.rawRowCount ?? 0,
    rawRowFetchPages: parts.rawRowFetchPages ?? null,
    scheduleStopsPlanned: parts.scheduleStopsPlanned ?? 0,
    scheduleStopsPromoted: parts.scheduleStopsPromoted ?? 0,
    replacedExistingActiveRows: parts.replacedExistingActiveRows ?? 0,
    artifactDir: parts.artifactDir ?? null,
    finalStatus: parts.finalStatus,
    failureReason: parts.failureReason ?? null,
    failureStage: parts.failureStage ?? null
  };
}

async function writeArtifactBundle(artifactDir, payload) {
  await fs.mkdir(artifactDir, { recursive: true });
  if (payload.csvText != null) {
    await fs.writeFile(path.join(artifactDir, "view-222.csv"), payload.csvText, "utf8");
  }
  if (payload.htmlText != null) {
    await fs.writeFile(path.join(artifactDir, "view-222.html"), payload.htmlText, "utf8");
  }
  await fs.writeFile(
    path.join(artifactDir, "sync-summary.json"),
    `${JSON.stringify(payload.summary, null, 2)}\n`,
    "utf8"
  );
}

function logLine(label, value) {
  console.log(`${label.padEnd(34)} ${value ?? "—"}`);
}

function printSummary(summary) {
  console.log("");
  console.log("Calendar schedule sync summary");
  logLine("Started:", summary.startedAt);
  logLine("Finished:", summary.finishedAt);
  logLine("Report type:", summary.reportType);
  logLine("View id:", summary.morawareViewId);
  logLine("Organization:", summary.organizationId);
  logLine("Run id:", summary.runId);
  logLine("Run status:", summary.runStatus);
  logLine("Raw row count:", summary.rawRowCount);
  logLine("Fetch pages:", summary.rawRowFetchPages);
  logLine("Stops planned:", summary.scheduleStopsPlanned);
  logLine("Stops promoted:", summary.scheduleStopsPromoted);
  logLine("Active rows replaced:", summary.replacedExistingActiveRows);
  logLine("Artifact dir:", summary.artifactDir);
  logLine("Final status:", summary.finalStatus);
  if (summary.failureReason) logLine("Failure:", `${summary.failureStage ?? "unknown"} · ${summary.failureReason}`);
  console.log("");
}

/**
 * @param {{ fetchReportFeed?: Function, now?: Date }} [deps]
 */
export async function runCalendarScheduleSync(deps = {}) {
  const startedAt = (deps.now ?? new Date()).toISOString();
  const organizationId = requiredEnv("MORAWARE_DEFAULT_ORGANIZATION_ID");
  const morawareViewId = Number(env("MORAWARE_REPORT_VIEW_ID", String(CALENDAR_SCHEDULE_DEFAULT_VIEW_ID)));
  const allowEmpty = env("MORAWARE_CALENDAR_SCHEDULE_ALLOW_EMPTY") === "1";
  const artifactBase =
    env("MORAWARE_CALENDAR_SCHEDULE_ARTIFACT_DIR") ||
    path.join(REPO_ROOT, "debug/moraware/scheduled-runs/calendar-schedule");

  console.log("Moraware calendar schedule sync — fetch → stage → promote");
  logLine("Started:", startedAt);
  logLine("Report type:", CALENDAR_SCHEDULE_REPORT_TYPE);
  logLine("View id:", morawareViewId);
  logLine("Organization:", organizationId);

  const fetchReportFeed = deps.fetchReportFeed ?? fetchReportFeedArtifacts;
  const fetchResult = await fetchReportFeed({
    morawareViewId,
    csvExportPath: CALENDAR_SCHEDULE_EXPORT_PATH,
    htmlReportPath: CALENDAR_SCHEDULE_HTML_PATH
  });

  const artifactDir = buildCalendarScheduleArtifactDir(artifactBase, new Date(startedAt));

  if (!fetchResult.ok) {
    const summary = buildSyncLogSummary({
      startedAt,
      finishedAt: new Date().toISOString(),
      morawareViewId,
      organizationId,
      finalStatus: "failed",
      failureStage: fetchResult.stage ?? "fetch",
      failureReason: fetchResult.error ?? "fetch_failed"
    });
    await writeArtifactBundle(artifactDir, { summary });
    printSummary(summary);
    if (fetchResult.lastAttempt) {
      console.log("Web login last attempt (safe/redacted):");
      console.log(JSON.stringify(fetchResult.lastAttempt, null, 2));
    }
    if (fetchResult.urls?.csvUrl) logLine("CSV URL (redacted):", fetchResult.urls.csvUrl);
    if (fetchResult.status != null) logLine("CSV HTTP status:", fetchResult.status);
    if (fetchResult.contentType) logLine("CSV content-type:", fetchResult.contentType);
    if (fetchResult.bodyPreview) logLine("CSV body preview:", fetchResult.bodyPreview);
    if (fetchResult.authMode) logLine("Auth mode:", fetchResult.authMode);
    return { ok: false, summary };
  }

  await writeArtifactBundle(artifactDir, {
    csvText: fetchResult.csvText,
    htmlText: fetchResult.htmlText,
    summary: buildSyncLogSummary({
      startedAt,
      morawareViewId,
      organizationId,
      rawRowCount: fetchResult.metadata?.csvRowCount ?? 0,
      finalStatus: "fetched",
      artifactDir
    })
  });

  logLine("CSV rows fetched:", fetchResult.metadata?.csvRowCount ?? 0);

  const db = createWriteCapableClient();
  const feed = await loadReportFeedContract(db, {
    organizationId,
    reportType: CALENDAR_SCHEDULE_REPORT_TYPE,
    morawareViewId
  });

  if (!feed) {
    const summary = buildSyncLogSummary({
      startedAt,
      finishedAt: new Date().toISOString(),
      morawareViewId,
      organizationId,
      artifactDir,
      finalStatus: "failed",
      failureStage: "feed_contract",
      failureReason: "calendar_schedule_feed_not_configured"
    });
    await writeArtifactBundle(artifactDir, {
      csvText: fetchResult.csvText,
      htmlText: fetchResult.htmlText,
      summary
    });
    printSummary(summary);
    return { ok: false, summary };
  }

  const expectedColumns =
    Array.isArray(feed.expected_columns) && feed.expected_columns.length
      ? feed.expected_columns
      : CALENDAR_SCHEDULE_EXPECTED_COLUMNS;

  const processResult = processReportFeedLocal({
    csvText: fetchResult.csvText,
    htmlText: fetchResult.htmlText,
    organizationId,
    reportType: CALENDAR_SCHEDULE_REPORT_TYPE,
    expectedColumns,
    expectedColumnHash: feed.expected_column_hash ?? null,
    morawareViewId
  });

  const { runId, status: runStatus } = await persistReportFeedRun(db, {
    feed,
    processResult,
    sourceFiles: {
      csvPath: path.join(artifactDir, "view-222.csv"),
      htmlPath: path.join(artifactDir, "view-222.html"),
      fetchMode: "moraware_live"
    }
  });

  logLine("Staging run id:", runId);
  logLine("Staging status:", runStatus);
  logLine("Raw rows staged:", processResult.profile?.rowCount ?? 0);

  if (isSchemaDriftBlocking(processResult.schemaDrift)) {
    const summary = buildSyncLogSummary({
      startedAt,
      finishedAt: new Date().toISOString(),
      morawareViewId,
      organizationId,
      runId,
      runStatus,
      rawRowCount: processResult.profile?.rowCount ?? 0,
      artifactDir,
      finalStatus: "failed",
      failureStage: "schema_drift",
      failureReason: "schema_drift_blocks_promotion"
    });
    await writeArtifactBundle(artifactDir, {
      csvText: fetchResult.csvText,
      htmlText: fetchResult.htmlText,
      summary
    });
    printSummary(summary);
    return { ok: false, summary };
  }

  const promoteResult = await promoteCalendarScheduleRowsFromRun(db, runId, {
    apply: true,
    allowEmpty
  });

  if (!promoteResult.ok) {
    const summary = buildSyncLogSummary({
      startedAt,
      finishedAt: new Date().toISOString(),
      morawareViewId,
      organizationId,
      runId,
      runStatus,
      rawRowCount: promoteResult.calendarRawRowsRead ?? processResult.profile?.rowCount ?? 0,
      rawRowFetchPages: promoteResult.rawRowFetchPages ?? null,
      scheduleStopsPlanned: promoteResult.scheduleStopsPlanned ?? 0,
      artifactDir,
      finalStatus: "failed",
      failureStage: "promotion",
      failureReason: promoteResult.error ?? "promotion_failed"
    });
    await writeArtifactBundle(artifactDir, {
      csvText: fetchResult.csvText,
      htmlText: fetchResult.htmlText,
      summary
    });
    printSummary(summary);
    return { ok: false, summary };
  }

  const summary = buildSyncLogSummary({
    startedAt,
    finishedAt: new Date().toISOString(),
    morawareViewId,
    organizationId,
    runId,
    runStatus: promoteResult.runStatusUpdated ? "promoted" : runStatus,
    rawRowCount: promoteResult.calendarRawRowsRead ?? processResult.profile?.rowCount ?? 0,
    rawRowFetchPages: promoteResult.rawRowFetchPages ?? null,
    scheduleStopsPlanned: promoteResult.scheduleStopsPlanned ?? 0,
    scheduleStopsPromoted: promoteResult.scheduleStopsPromoted ?? promoteResult.promoted ?? 0,
    replacedExistingActiveRows: promoteResult.replacedExistingActiveRows ?? 0,
    artifactDir,
    finalStatus: "promoted"
  });

  await writeArtifactBundle(artifactDir, {
    csvText: fetchResult.csvText,
    htmlText: fetchResult.htmlText,
    summary
  });
  printSummary(summary);
  return { ok: true, summary };
}

async function main() {
  const result = await runCalendarScheduleSync();
  if (!result.ok) process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("\nFATAL:", formatCliError(err));
    process.exit(1);
  });
}
