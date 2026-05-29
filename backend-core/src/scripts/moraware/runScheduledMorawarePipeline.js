import "dotenv/config";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Frozen at module load (after dotenv). Never re-read — child scripts must not change this. */
const PIPELINE_DRY_RUN_AT_STARTUP = (() => {
  const s = String(process.env.MORAWARE_IMPORT_DRY_RUN ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
})();

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const GENERATE_SCRIPT = path.join(REPO_ROOT, "backend-core/src/scripts/moraware/generateLiveCappedSnapshot.js");
const IMPORT_SCRIPT = path.join(REPO_ROOT, "backend-core/src/scripts/moraware/importSnapshotToBrain.js");
const DEFAULT_SNAPSHOT_FILE = "debug/moraware/baseline-2026/baseline-2026-moraware-snapshot.json";
const DEFAULT_SUMMARY_FILE = "debug/moraware/baseline-2026/baseline-2026-summary.json";
const BLOCKING_CAP_KEYS = Object.freeze(["jobs", "job_activities", "job_forms"]);

function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function envTruthy(name) {
  const s = String(process.env[name] ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function pickSecret() {
  const importSecret = String(process.env.MORAWARE_SYNC_IMPORT_SECRET ?? "").trim();
  if (importSecret) return importSecret;
  const cronSecret = String(process.env.EOS_CRON_SECRET ?? "").trim();
  if (cronSecret) return cronSecret;
  throw new Error("Missing required env var: MORAWARE_SYNC_IMPORT_SECRET or EOS_CRON_SECRET");
}

function backendBase() {
  return String(process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || "http://localhost:3001")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
}

function intEnv(name, fallback = null) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function baselineMaxFilesCap() {
  const baseline = intEnv("MORAWARE_BASELINE_MAX_FILES");
  if (baseline != null) return baseline;
  const live = intEnv("MORAWARE_LIVE_MAX_FILES");
  if (live != null) return live;
  return 10000;
}

/** Frozen boolean from pipeline startup — never re-read process.env.MORAWARE_IMPORT_DRY_RUN. */
function readPipelineDryRunAtStartup() {
  return PIPELINE_DRY_RUN_AT_STARTUP;
}

/** Whether the live pipeline may call rebuild-prepared-facts after import. */
export function shouldRebuild({ pipelineDryRun, importOk = true }) {
  if (pipelineDryRun) return false;
  return Boolean(importOk);
}

function childProcessEnv(pipelineDryRun) {
  return {
    ...process.env,
    MORAWARE_IMPORT_DRY_RUN: pipelineDryRun ? "1" : "0"
  };
}

function assertRebuildAllowed(pipelineDryRun) {
  if (pipelineDryRun) {
    throw new Error(
      "Dry run cannot rebuild prepared facts: POST /api/internal/moraware-sync/rebuild-prepared-facts is blocked when MORAWARE_IMPORT_DRY_RUN=1."
    );
  }
}

function applyPipelineDefaults() {
  process.env.MORAWARE_SNAPSHOT_MODE = process.env.MORAWARE_SNAPSHOT_MODE || "baseline_2026";
  process.env.MORAWARE_BASELINE_START_DATE = process.env.MORAWARE_BASELINE_START_DATE || "2026-01-01";
  if (!String(process.env.MORAWARE_BASELINE_END_DATE ?? "").trim()) {
    process.env.MORAWARE_BASELINE_END_DATE = todayYmd();
  }
  process.env.MORAWARE_SYNC_IMPORT_FILE = process.env.MORAWARE_SYNC_IMPORT_FILE || DEFAULT_SNAPSHOT_FILE;
  process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE = process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE || "1";
  process.env.MORAWARE_IMPORT_CHUNKED = process.env.MORAWARE_IMPORT_CHUNKED || "1";
  process.env.MORAWARE_IMPORT_MAX_PAYLOAD_BYTES = process.env.MORAWARE_IMPORT_MAX_PAYLOAD_BYTES || "3500000";
  process.env.MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK = process.env.MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK || "20";
  process.env.MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK = process.env.MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK || "1000";
  process.env.MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK = process.env.MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK || "1000";
  process.env.MORAWARE_IMPORT_MAX_FILES_PER_CHUNK = process.env.MORAWARE_IMPORT_MAX_FILES_PER_CHUNK || "250";
  process.env.MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK = process.env.MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK || "250";
}

function isResumeImport() {
  return Boolean(String(process.env.MORAWARE_IMPORT_RESUME_GROUP_ID ?? "").trim());
}

function shouldSkipGenerate() {
  return envTruthy(process.env.MORAWARE_PIPELINE_SKIP_GENERATE) || isResumeImport();
}

function runNodeScript(scriptPath, label, pipelineDryRun) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    env: childProcessEnv(pipelineDryRun),
    stdio: "inherit"
  });
  if (result.status !== 0) {
    const err = new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
    err.exitCode = result.status ?? 1;
    err.duration_ms = Date.now() - startedAt;
    throw err;
  }
  return { duration_ms: Date.now() - startedAt };
}

function warningBlocksImport(warning) {
  const text = String(warning ?? "");
  for (const key of BLOCKING_CAP_KEYS) {
    if (text.startsWith(`${key} reached cap`)) return true;
  }
  if (baselineMaxFilesCap() === 0 && text.startsWith("job_files reached cap")) {
    return false;
  }
  if (text.startsWith("job_files reached cap")) return true;
  return false;
}

async function readCapWarnings() {
  const summaryPath = path.resolve(REPO_ROOT, DEFAULT_SUMMARY_FILE);
  try {
    const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
    const warnings = summary?.snapshot?.warnings;
    if (Array.isArray(warnings) && warnings.length) return warnings;
  } catch {
    /* fall through to snapshot metadata */
  }

  const snapshotPath = path.resolve(REPO_ROOT, process.env.MORAWARE_SYNC_IMPORT_FILE || DEFAULT_SNAPSHOT_FILE);
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  const warnings = snapshot?.metadata?.cap_warnings;
  return Array.isArray(warnings) ? warnings : [];
}

async function assertSnapshotCapWarningsAllowed(logger) {
  const warnings = await readCapWarnings();
  const blocking = warnings.filter((warning) => warningBlocksImport(warning));
  if (!blocking.length) {
    logger.log("cap_warnings_ok", { warnings });
    return;
  }
  logger.log("cap_warnings_blocked", { blocking_warnings: blocking, all_warnings: warnings });
  throw new Error(
    ["Snapshot cap warnings block import:", ...blocking.map((w) => `- ${w}`), "Increase MORAWARE_BASELINE_MAX_* and regenerate."].join(
      "\n"
    )
  );
}

async function postRebuildPreparedFacts({ secret, organizationId, pipelineDryRun }) {
  assertRebuildAllowed(pipelineDryRun);
  const url = `${backendBase()}/api/internal/moraware-sync/rebuild-prepared-facts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-eos-cron-secret": secret
    },
    body: JSON.stringify({ organization_id: organizationId })
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Prepared facts rebuild failed: HTTP ${res.status} ${JSON.stringify(parsed)}`);
    err.status = res.status;
    err.response = parsed;
    throw err;
  }
  return parsed;
}

function resumeCommandHint() {
  const resumeGroupId = String(process.env.MORAWARE_IMPORT_RESUME_GROUP_ID ?? "").trim();
  const startChunkIndex = String(process.env.MORAWARE_IMPORT_START_CHUNK_INDEX ?? "1").trim() || "1";
  const importFile = process.env.MORAWARE_SYNC_IMPORT_FILE || DEFAULT_SNAPSHOT_FILE;
  return [
    "Resume the failed import group with the same chunk env:",
    `MORAWARE_IMPORT_RESUME_GROUP_ID=${resumeGroupId || "<import_group_id from logs>"}`,
    `MORAWARE_IMPORT_START_CHUNK_INDEX=${startChunkIndex}`,
    "MORAWARE_PIPELINE_SKIP_GENERATE=1",
    "MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1",
    "MORAWARE_IMPORT_CHUNKED=1",
    `MORAWARE_SYNC_IMPORT_FILE=${importFile}`,
    "npm run eos:moraware:run-scheduled-pipeline"
  ].join("\n");
}

function createLogger() {
  const runId = crypto.randomUUID();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.resolve(REPO_ROOT, "debug/moraware/scheduled-runs");
  const logPath = path.join(logDir, `${stamp}.jsonl`);
  let ready = fs.mkdir(logDir, { recursive: true });

  return {
    runId,
    logPath,
    async log(event, data = {}) {
      await ready;
      const line = JSON.stringify({ event, run_id: runId, at: new Date().toISOString(), ...data });
      await fs.appendFile(logPath, `${line}\n`, "utf8");
      console.log(line);
    }
  };
}

async function finishDryRunPipeline(logger, pipelineStartedAt) {
  const message =
    "DRY RUN complete: chunk plan reviewed only. No HTTP import, no prepared facts rebuild, and no freshness verification were executed.";
  await logger.log("pipeline_dry_run_complete", {
    total_duration_ms: Date.now() - pipelineStartedAt,
    import_executed: false,
    rebuild_executed: false,
    verification_executed: false,
    note: message
  });
  console.log(`\n${message}\n`);
}

async function preflight({ skipGenerate, pipelineDryRun }) {
  if (!pipelineDryRun) {
    requiredEnv("BACKEND_URL");
    pickSecret();
  }
  requiredEnv("MORAWARE_DEFAULT_ORGANIZATION_ID");
  if (!skipGenerate) {
    requiredEnv("MORAWARE_API_URL");
    requiredEnv("MORAWARE_USERNAME");
    requiredEnv("MORAWARE_PASSWORD");
  }
}

function runShouldRebuildSelfTest() {
  const cases = [
    { pipelineDryRun: true, importOk: true, want: false },
    { pipelineDryRun: true, importOk: false, want: false },
    { pipelineDryRun: false, importOk: true, want: true },
    { pipelineDryRun: false, importOk: false, want: false }
  ];
  for (const { pipelineDryRun, importOk, want } of cases) {
    const got = shouldRebuild({ pipelineDryRun, importOk });
    if (got !== want) {
      throw new Error(`shouldRebuild self-test failed: pipelineDryRun=${pipelineDryRun} importOk=${importOk} got=${got} want=${want}`);
    }
  }
  console.log("shouldRebuild self-test OK");
}

async function main() {
  const pipelineDryRun = readPipelineDryRunAtStartup();
  applyPipelineDefaults();
  const skipGenerate = shouldSkipGenerate();
  const logger = createLogger();
  const organizationId = requiredEnv("MORAWARE_DEFAULT_ORGANIZATION_ID");
  const pipelineStartedAt = Date.now();

  await logger.log("pipeline_start", {
    mode: process.env.MORAWARE_SNAPSHOT_MODE,
    organization_id: organizationId,
    dry_run: pipelineDryRun,
    pipeline_dry_run: pipelineDryRun,
    skip_generate: skipGenerate,
    resume_group_id: String(process.env.MORAWARE_IMPORT_RESUME_GROUP_ID ?? "").trim() || null,
    start_chunk_index: String(process.env.MORAWARE_IMPORT_START_CHUNK_INDEX ?? "").trim() || null,
    snapshot_file: process.env.MORAWARE_SYNC_IMPORT_FILE,
    log_path: path.relative(REPO_ROOT, logger.logPath)
  });

  try {
    await preflight({ skipGenerate, pipelineDryRun });

    if (!skipGenerate) {
      await logger.log("generate_start", { script: path.relative(REPO_ROOT, GENERATE_SCRIPT), dry_run: pipelineDryRun });
      const generateResult = runNodeScript(GENERATE_SCRIPT, "Moraware snapshot generation", pipelineDryRun);
      await logger.log("generate_complete", { ...generateResult, dry_run: pipelineDryRun });
      await assertSnapshotCapWarningsAllowed(logger);
    } else {
      await logger.log("generate_skipped", {
        reason: isResumeImport() ? "resume_import" : "MORAWARE_PIPELINE_SKIP_GENERATE",
        dry_run: pipelineDryRun
      });
      const snapshotPath = path.resolve(REPO_ROOT, process.env.MORAWARE_SYNC_IMPORT_FILE || DEFAULT_SNAPSHOT_FILE);
      await fs.access(snapshotPath);
    }

    await logger.log("import_start", {
      script: path.relative(REPO_ROOT, IMPORT_SCRIPT),
      dry_run: pipelineDryRun
    });
    try {
      const importResult = runNodeScript(IMPORT_SCRIPT, "Moraware snapshot import", pipelineDryRun);
      await logger.log("import_complete", { ...importResult, dry_run: pipelineDryRun });
    } catch (e) {
      await logger.log("import_failed", {
        error: String(e?.message || e),
        dry_run: pipelineDryRun,
        resume_hint: resumeCommandHint()
      });
      console.error("\nSuggested resume command:\n", resumeCommandHint());
      throw e;
    }

    if (pipelineDryRun) {
      await finishDryRunPipeline(logger, pipelineStartedAt);
      return;
    }

    if (!shouldRebuild({ pipelineDryRun, importOk: true })) {
      throw new Error("Import did not succeed; prepared facts rebuild is not allowed.");
    }

    const secret = pickSecret();
    await logger.log("rebuild_start", { organization_id: organizationId, dry_run: pipelineDryRun });
    const rebuild = await postRebuildPreparedFacts({ secret, organizationId, pipelineDryRun });
    await logger.log("rebuild_complete", rebuild);

    if (!rebuild?.ok) {
      throw new Error(`Prepared facts rebuild returned non-ok status: ${JSON.stringify(rebuild)}`);
    }

    await logger.log("pipeline_success", {
      import_group_id: rebuild.import_group_id,
      jobs_scanned: rebuild.jobs_scanned,
      facts_upserted: rebuild.facts_upserted,
      account_rollups_upserted: rebuild.account_rollups_upserted,
      query_page_count: rebuild.query_page_count,
      compute_ms: rebuild.compute_ms,
      total_duration_ms: Date.now() - pipelineStartedAt,
      verification: {
        prepared_status: rebuild.status,
        note: "After deploy, confirm GET /api/admin/moraware/health shows prepared_facts.freshness=fresh and Sales Dashboard sync banner is recent."
      }
    });
  } catch (e) {
    await logger.log("pipeline_failed", {
      phase: String(e?.phase || "unknown"),
      error: String(e?.message || e),
      dry_run: pipelineDryRun,
      total_duration_ms: Date.now() - pipelineStartedAt
    });
    throw e;
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.cwd(), process.argv[1]);
}

if (isDirectRun()) {
  if (process.argv.includes("--self-test") || envTruthy(process.env.MORAWARE_PIPELINE_SELF_TEST)) {
    runShouldRebuildSelfTest();
  } else {
    main().catch((e) => {
      console.error(e?.stack || e);
      process.exitCode = 1;
    });
  }
}
