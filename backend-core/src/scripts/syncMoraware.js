import "dotenv/config";

import path from "node:path";
import fs from "node:fs/promises";

import { MorawareClient } from "../../../src/morawareClient.js";
import { runMorawareDiscovery } from "../../../src/morawareDiscovery.js";

import {
  acquireSyncLock,
  beginSyncRun,
  finishSyncRun,
  releaseSyncLock
} from "../brain/supabaseBrainStore.js";

function envTruthy(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function redactKey(raw) {
  const s = String(raw ?? "");
  if (!s) return "";
  if (s.length <= 8) return "[REDACTED]";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function writeLatestProductionSummary(latestDir, summary) {
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(
    path.join(latestDir, "production-sync-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  const failedByStageJson = summary.failedJobsByStage
    ? JSON.stringify(summary.failedJobsByStage, null, 2)
    : "";

  const txt =
    `EOS PRODUCTION SYNC SUMMARY\n` +
    `syncRunId: ${summary.syncRunId || "(none)"}\n` +
    `startedAt: ${summary.startedAt || ""}\n` +
    `finishedAt: ${summary.finishedAt || ""}\n` +
    `durationMs: ${summary.durationMs ?? ""}\n` +
    `jobsDiscovered: ${summary.jobIdsDiscovered ?? ""}\n` +
    `jobsDetailed: ${summary.jobsDetailed ?? ""}\n` +
    `jobsIngested: ${summary.jobsIngested ?? ""}\n` +
    `formsExtracted: ${summary.formsExtracted ?? ""}\n` +
    `fieldsExtracted: ${summary.fieldsExtracted ?? ""}\n` +
    `worksheetSqFtTotal: ${summary.worksheetSqFtTotal ?? ""}\n` +
    `ingestOperational: ${summary.ingestOperational ? "true" : "false"}\n` +
    `operationalSummaries: ${summary.operationalSummaries ?? 0}\n` +
    `activitiesExtracted: ${summary.activitiesExtracted ?? 0}\n` +
    `phasesExtracted: ${summary.phasesExtracted ?? 0}\n` +
    `contactsExtracted: ${summary.contactsExtracted ?? 0}\n` +
    `failedJobs: ${summary.failedJobs ?? 0}\n` +
    `failedJobsByStage: ${failedByStageJson ? "see below" : "{}"}\n` +
    `stoppedReason: ${summary.stoppedReason || ""}\n` +
    `syncMayBeIncomplete: ${summary.syncMayBeIncomplete ? "true" : "false"}\n` +
    (failedByStageJson ? `\nFAILED JOBS BY STAGE\n${failedByStageJson}\n` : "");

  await fs.writeFile(path.join(latestDir, "production-sync-summary.txt"), txt, "utf8");
}

async function main() {
  // Environment validation (safe output).
  const apiUrl = requiredEnv("MORAWARE_API_URL");
  const user = requiredEnv("MORAWARE_USERNAME");
  requiredEnv("MORAWARE_PASSWORD");

  const writeEnabled = String(process.env.SUPABASE_WRITE_ENABLED ?? "").trim() === "1";
  if (writeEnabled) {
    requiredEnv("SUPABASE_URL");
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  }

  console.log("eOS production sync config:", {
    MORAWARE_API_URL: apiUrl,
    MORAWARE_USERNAME: user,
    MORAWARE_ACCOUNT_ID: String(process.env.MORAWARE_ACCOUNT_ID ?? "").trim() || "(not set)",
    SUPABASE_WRITE_ENABLED: writeEnabled ? "1" : "0",
    SUPABASE_URL: writeEnabled ? process.env.SUPABASE_URL : "(n/a)",
    SUPABASE_SERVICE_ROLE_KEY: writeEnabled ? redactKey(process.env.SUPABASE_SERVICE_ROLE_KEY) : "(n/a)",
    EOS_DEBUG_RAW_XML: envTruthy(process.env.EOS_DEBUG_RAW_XML) ? "1" : "0",
    MORAWARE_SYNC_MODE: process.env.MORAWARE_SYNC_MODE ?? "global",
    MORAWARE_SYNC_START_DATE: process.env.MORAWARE_SYNC_START_DATE ?? "",
    MORAWARE_SYNC_END_DATE: process.env.MORAWARE_SYNC_END_DATE ?? "",
    MORAWARE_MAX_SEARCH_PAGES: process.env.MORAWARE_MAX_SEARCH_PAGES ?? "",
    MORAWARE_INGEST_OPERATIONAL: process.env.MORAWARE_INGEST_OPERATIONAL ?? "0"
  });

  const syncModeRaw = String(process.env.MORAWARE_SYNC_MODE ?? "global").trim().toLowerCase();
  const normalizedSyncMode = syncModeRaw === "global-sync" ? "global" : syncModeRaw;
  const discoveryMode =
    normalizedSyncMode === "global"
      ? "global-sync"
      : normalizedSyncMode === "account-sync"
        ? "account-sync"
        : normalizedSyncMode;

  if (normalizedSyncMode === "global") {
    process.env.MORAWARE_DISCOVERY = "1";
    process.env.MORAWARE_DISCOVERY_MODE = "global-sync";
  } else if (normalizedSyncMode === "account-sync") {
    process.env.MORAWARE_DISCOVERY = "1";
    process.env.MORAWARE_DISCOVERY_MODE = "account-sync";
  }

  console.log("Resolved eOS sync mode:", {
    syncMode: normalizedSyncMode,
    discoveryMode: process.env.MORAWARE_DISCOVERY_MODE || "(unset)"
  });

  if (discoveryMode !== "global-sync") {
    throw new Error(`backend-core production sync only supports global-sync right now (got: ${discoveryMode})`);
  }

  const lockName = "moraware_global_sync";
  const lockedBy = `${user}@${process.pid}`;
  const lockRes = await acquireSyncLock({ lockName, lockedBy, ttlMs: 2 * 60 * 60 * 1000, metadata: { mode: discoveryMode } });
  if (!lockRes.acquired) {
    console.log("Moraware sync already running.");
    return;
  }

  const started = new Date();
  const latestDir = path.join(process.cwd(), "debug", "moraware", "latest");

  const ingestOperational = envTruthy(process.env.MORAWARE_INGEST_OPERATIONAL ?? "0");
  const syncStartDate = String(process.env.MORAWARE_SYNC_START_DATE ?? "").trim() || null;
  const syncEndDate = String(process.env.MORAWARE_SYNC_END_DATE ?? "").trim() || null;

  let syncRunId = null;
  let failedJobs = 0;
  let stoppedReason = "";
  let finalStatus = "failed";
  let discoverySummary = null;

  try {
    const run = await beginSyncRun({
      mode: "global-sync",
      syncStartDate,
      syncEndDate,
      ingestOperational,
      rawSummary: { status: "running", note: "sync started" }
    });
    syncRunId = run.id;
    process.env.EOS_SYNC_RUN_ID = syncRunId;

    const client = new MorawareClient();
    // Run proven global-sync implementation (Moraware XML, extraction, and Sq.Ft math unchanged).
    discoverySummary = await runMorawareDiscovery({ client, jobId: null, accountId: null, entrypointProof: { markerLine: "EOS PRODUCTION SYNC" } });

    // If global-sync recorded job-level failures, treat as partial_error.
    const raw = discoverySummary?.discoverySummary ?? discoverySummary ?? null;
    const failedCount = Array.isArray(raw?.failedJobIds) ? raw.failedJobIds.length : 0;
    failedJobs = failedCount;
    finalStatus = failedCount > 0 ? "partial_error" : "success";
  } catch (e) {
    finalStatus = "failed";
    stoppedReason = "exception";
    console.error(e?.stack || e);
  } finally {
    const finished = new Date();
    const durationMs = finished.getTime() - started.getTime();

    // Attempt to extract counts from the proven summary object shape.
    const rawSummary = discoverySummary?.discoverySummary ?? discoverySummary ?? null;
    const jobIdsDiscovered = rawSummary?.jobIdsDiscovered ?? rawSummary?.job_ids_discovered ?? null;
    const jobsDetailed = rawSummary?.jobsDetailed ?? rawSummary?.jobs_detailed ?? null;
    const jobsIngested = rawSummary?.jobsIngested ?? rawSummary?.jobs_ingested ?? null;
    const formsExtracted = rawSummary?.formsExtracted ?? rawSummary?.forms_extracted ?? null;
    const fieldsExtracted = rawSummary?.fieldsExtracted ?? rawSummary?.fields_extracted ?? null;
    const worksheetSqFtTotal = rawSummary?.worksheetSqFtTotalAcrossBatch ?? rawSummary?.worksheet_sqft_total ?? null;

    const productionSummary = {
      syncRunId,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs,
      jobIdsDiscovered,
      jobsDetailed,
      jobsIngested,
      formsExtracted,
      fieldsExtracted,
      worksheetSqFtTotal,
      ingestOperational,
      operationalSummaries: null,
      activitiesExtracted: rawSummary?.activitiesExtracted ?? 0,
      phasesExtracted: rawSummary?.phasesExtracted ?? 0,
      contactsExtracted: rawSummary?.contactsExtracted ?? 0,
      failedJobs,
      failedJobsByStage: rawSummary?.failedJobsByStage ?? {},
      stoppedReason,
      syncMayBeIncomplete: finalStatus !== "success" || failedJobs > 0
    };

    try {
      await writeLatestProductionSummary(latestDir, productionSummary);
    } catch (e) {
      console.warn("Failed to write production sync summary files:", e?.message || e);
    }

    try {
      if (syncRunId) {
        const metricsPatch = {
          mode: "global-sync",
          sync_start_date: syncStartDate,
          sync_end_date: syncEndDate,
          ingest_operational: ingestOperational
        };
        if (rawSummary) {
          metricsPatch.process_count = Number(rawSummary?.processCount ?? rawSummary?.processesUsed?.length ?? 0) || 0;
          metricsPatch.job_ids_discovered = Number(rawSummary?.jobIdsDiscovered ?? 0) || 0;
          metricsPatch.jobs_detailed = Number(rawSummary?.jobsDetailed ?? 0) || 0;
          metricsPatch.jobs_ingested =
            Number(rawSummary?.jobsWithFormsIngested ?? rawSummary?.jobsIngested ?? 0) || 0;
          metricsPatch.forms_extracted = Number(rawSummary?.formsExtracted ?? 0) || 0;
          metricsPatch.fields_extracted = Number(rawSummary?.fieldsExtracted ?? 0) || 0;
          metricsPatch.activities_extracted = Number(rawSummary?.activitiesExtracted ?? 0) || 0;
          metricsPatch.phases_extracted = Number(rawSummary?.phasesExtracted ?? 0) || 0;
          metricsPatch.contacts_extracted = Number(rawSummary?.contactsExtracted ?? 0) || 0;
          metricsPatch.worksheet_sqft_total = rawSummary?.worksheetSqFtTotalAcrossBatch ?? null;
        }
        await finishSyncRun(syncRunId, {
          status: finalStatus,
          finishedAt: finished.toISOString(),
          stoppedReason: stoppedReason || null,
          errorMessage: finalStatus === "success" ? null : "sync failed (see logs)",
          rawSummaryPatch: rawSummary,
          metricsPatch
        });
      }
    } catch (e) {
      console.warn("Failed to update sync run row:", e?.message || e);
    }

    try {
      await releaseSyncLock(lockName);
    } catch (e) {
      console.warn("Failed to release sync lock:", e?.message || e);
    }
  }
}

main().catch(async (e) => {
  console.error(e?.stack || e);
  // best-effort: record to failed job table is handled inside run loop; here we only exit non-zero.
  process.exitCode = 1;
});

