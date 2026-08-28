#!/usr/bin/env node
/**
 * Moraware view 219 Sales Worksheet Facts — live fetch → stage → API-mirror → completed-install form facts.
 *
 * Does NOT populate sales_ops_sf_attribution_facts.
 * Does NOT write to Moraware.
 *
 * Required env:
 *   MORAWARE_API_URL, MORAWARE_USERNAME, MORAWARE_PASSWORD
 *   MORAWARE_DEFAULT_ORGANIZATION_ID
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_WRITE_ENABLED=1
 */
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SALES_WORKSHEET_FACTS_ACCEPTED_HEADER_HASHES,
  SALES_WORKSHEET_FACTS_EXPORT_PATH,
  SALES_WORKSHEET_FACTS_HTML_PATH,
  SALES_WORKSHEET_FACTS_REPORT_TYPE,
  SALES_WORKSHEET_FACTS_REQUIRED_COLUMNS,
  SALES_WORKSHEET_FACTS_VIEW_ID
} from "../../moraware/reportFeeds/constants.js";
import { fetchReportFeedArtifacts } from "../../moraware/reportFeeds/fetchReportFeedArtifacts.js";
import { processReportFeedLocal } from "../../moraware/reportFeeds/processReportFeed.js";
import { enrichRunFromApiMirror } from "../../moraware/reportFeeds/enrichRunFromApiMirror.js";
import { promoteCompletedInstallFormFactsFromRun } from "../../moraware/reportFeeds/promoteCompletedInstallFormFacts.js";
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
  if (!v) throw new Error(`syncSalesWorksheetFactsFeed: missing required env var ${name}`);
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

export function buildSalesWorksheetFactsArtifactDir(baseDir, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(baseDir, `sales-worksheet-facts-${stamp}`);
}

export function buildSalesWorksheetFactsSyncSummary(parts) {
  return {
    startedAt: parts.startedAt,
    finishedAt: parts.finishedAt ?? new Date().toISOString(),
    reportType: SALES_WORKSHEET_FACTS_REPORT_TYPE,
    morawareViewId: parts.morawareViewId,
    organizationId: parts.organizationId,
    runId: parts.runId ?? null,
    runStatus: parts.runStatus ?? null,
    rawRowCount: parts.rawRowCount ?? 0,
    contractVersion: parts.contractVersion ?? null,
    observedHeaderHash: parts.observedHeaderHash ?? null,
    matchedJobs: parts.matchedJobs ?? null,
    formMatched: parts.formMatched ?? null,
    formUnresolved: parts.formUnresolved ?? null,
    jobUnresolved: parts.jobUnresolved ?? null,
    creditableFacts: parts.creditableFacts ?? null,
    replacedActive: parts.replacedActive ?? null,
    artifactDir: parts.artifactDir ?? null,
    finalStatus: parts.finalStatus,
    failureReason: parts.failureReason ?? null,
    failureStage: parts.failureStage ?? null
  };
}

async function writeArtifactBundle(artifactDir, payload) {
  await fs.mkdir(artifactDir, { recursive: true });
  if (payload.csvText != null) {
    await fs.writeFile(path.join(artifactDir, "view-219.csv"), payload.csvText, "utf8");
  }
  if (payload.htmlText != null) {
    await fs.writeFile(path.join(artifactDir, "view-219.html"), payload.htmlText, "utf8");
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
  console.log("Sales worksheet facts (view 219) sync summary");
  logLine("Started:", summary.startedAt);
  logLine("Finished:", summary.finishedAt);
  logLine("View id:", summary.morawareViewId);
  logLine("Run id:", summary.runId);
  logLine("Run status:", summary.runStatus);
  logLine("Contract version:", summary.contractVersion);
  logLine("Header hash:", summary.observedHeaderHash);
  logLine("CSV rows:", summary.rawRowCount);
  logLine("Form matched:", summary.formMatched);
  logLine("Form unresolved:", summary.formUnresolved);
  logLine("Creditable facts:", summary.creditableFacts);
  logLine("Final status:", summary.finalStatus);
  if (summary.failureReason) logLine("Failure:", `${summary.failureStage ?? "unknown"} · ${summary.failureReason}`);
  console.log("");
}

export async function runSalesWorksheetFactsSync(deps = {}) {
  const startedAt = (deps.now ?? new Date()).toISOString();
  const organizationId = requiredEnv("MORAWARE_DEFAULT_ORGANIZATION_ID");
  const morawareViewId = Number(env("MORAWARE_REPORT_VIEW_ID", String(SALES_WORKSHEET_FACTS_VIEW_ID)));
  const artifactBase =
    env("MORAWARE_SALES_WORKSHEET_FACTS_ARTIFACT_DIR") ||
    path.join(REPO_ROOT, "debug/moraware/scheduled-runs/sales-worksheet-facts");
  const apply = env("MORAWARE_VIEW_219_DRY_RUN") !== "1";

  console.log("Moraware view 219 sync — fetch → stage → API-mirror → completed-install form facts");
  logLine("Started:", startedAt);
  logLine("Organization:", organizationId);

  const fetchReportFeed = deps.fetchReportFeed ?? fetchReportFeedArtifacts;
  const fetchResult = await fetchReportFeed({
    morawareViewId,
    csvExportPath: SALES_WORKSHEET_FACTS_EXPORT_PATH,
    htmlReportPath: SALES_WORKSHEET_FACTS_HTML_PATH
  });

  const artifactDir = buildSalesWorksheetFactsArtifactDir(artifactBase, new Date(startedAt));

  if (!fetchResult.ok) {
    const summary = buildSalesWorksheetFactsSyncSummary({
      startedAt,
      morawareViewId,
      organizationId,
      artifactDir,
      finalStatus: "failed",
      failureStage: fetchResult.stage ?? "fetch",
      failureReason: fetchResult.error ?? "fetch_failed"
    });
    await writeArtifactBundle(artifactDir, { summary });
    printSummary(summary);
    return { ok: false, summary };
  }

  const db = deps.db ?? createWriteCapableClient();
  const feed = await loadReportFeedContract(db, {
    organizationId,
    reportType: SALES_WORKSHEET_FACTS_REPORT_TYPE,
    morawareViewId
  });
  if (!feed) {
    const summary = buildSalesWorksheetFactsSyncSummary({
      startedAt,
      morawareViewId,
      organizationId,
      artifactDir,
      finalStatus: "failed",
      failureStage: "feed_contract",
      failureReason: "sales_worksheet_facts_feed_not_configured"
    });
    await writeArtifactBundle(artifactDir, { csvText: fetchResult.csvText, htmlText: fetchResult.htmlText, summary });
    printSummary(summary);
    return { ok: false, summary };
  }

  const acceptedHeaderHashes =
    Array.isArray(feed.accepted_header_hashes) && feed.accepted_header_hashes.length
      ? feed.accepted_header_hashes
      : SALES_WORKSHEET_FACTS_ACCEPTED_HEADER_HASHES;

  const processResult = processReportFeedLocal({
    csvText: fetchResult.csvText,
    htmlText: fetchResult.htmlText,
    organizationId,
    reportType: SALES_WORKSHEET_FACTS_REPORT_TYPE,
    expectedColumns: SALES_WORKSHEET_FACTS_REQUIRED_COLUMNS,
    expectedColumnHash: null,
    requiredColumns: SALES_WORKSHEET_FACTS_REQUIRED_COLUMNS,
    acceptedHeaderHashes,
    morawareViewId
  });

  const { runId, status: runStatus } = await persistReportFeedRun(db, {
    feed,
    processResult,
    sourceFiles: {
      csvPath: path.join(artifactDir, "view-219.csv"),
      htmlPath: path.join(artifactDir, "view-219.html"),
      fetchMode: "moraware_live"
    }
  });

  if (isSchemaDriftBlocking(processResult.schemaDrift)) {
    const summary = buildSalesWorksheetFactsSyncSummary({
      startedAt,
      morawareViewId,
      organizationId,
      runId,
      runStatus,
      rawRowCount: processResult.profile?.rowCount ?? 0,
      contractVersion: processResult.contractVersion,
      observedHeaderHash: processResult.profile?.headerHash,
      artifactDir,
      finalStatus: "failed",
      failureStage: "schema_drift",
      failureReason: processResult.schemaDrift?.reason || "schema_drift_blocks_promotion"
    });
    await writeArtifactBundle(artifactDir, { csvText: fetchResult.csvText, htmlText: fetchResult.htmlText, summary });
    printSummary(summary);
    return { ok: false, summary };
  }

  const enrich = await enrichRunFromApiMirror(db, {
    runId,
    organizationId,
    dryRun: !apply
  });

  const promote = await promoteCompletedInstallFormFactsFromRun(db, {
    runId,
    organizationId,
    dryRun: !apply
  });

  const ok = Boolean(promote.ok) && (apply ? promote.applied : true);
  const summary = buildSalesWorksheetFactsSyncSummary({
    startedAt,
    morawareViewId,
    organizationId,
    runId,
    runStatus: promote.applied ? "promoted" : runStatus,
    rawRowCount: processResult.profile?.rowCount ?? 0,
    contractVersion: processResult.contractVersion,
    observedHeaderHash: processResult.profile?.headerHash,
    matchedJobs: enrich?.plan?.matched ?? enrich?.currentCounts?.matched ?? null,
    formMatched: promote.matchedCount,
    formUnresolved: promote.formUnresolvedCount,
    jobUnresolved: promote.jobUnresolvedCount,
    creditableFacts: promote.creditableCount,
    replacedActive: promote.deactivateCount,
    artifactDir,
    finalStatus: ok ? (apply ? "promoted" : "dry_run") : "failed",
    failureStage: ok ? null : "promotion",
    failureReason: promote.error ?? null
  });
  await writeArtifactBundle(artifactDir, { csvText: fetchResult.csvText, htmlText: fetchResult.htmlText, summary });
  printSummary(summary);
  return { ok, summary, enrich, promote };
}

async function main() {
  const result = await runSalesWorksheetFactsSync();
  if (!result.ok) process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("\nFATAL:", formatCliError(err));
    process.exit(1);
  });
}
