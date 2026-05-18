import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import { MorawareClient } from "../../../../src/morawareClient.js";
import { runMorawareDiscovery } from "../../../../src/morawareDiscovery.js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function setDefaultEnv(name, value) {
  if (process.env[name] == null || String(process.env[name]).trim() === "") {
    process.env[name] = String(value);
  }
}

function redact(raw) {
  const s = String(raw ?? "");
  if (!s) return "";
  return s.length <= 8 ? "[REDACTED]" : `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseYmd(raw, name) {
  const s = String(raw ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`${name} must be YYYY-MM-DD`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new Error(`${name} is not a valid calendar date`);
  }
  return { raw: s, time: d.getTime() };
}

function validateBaseline2026Range() {
  const startRaw = String(process.env.MORAWARE_BASELINE_START_DATE ?? "").trim();
  if (!startRaw) throw new Error("MORAWARE_BASELINE_START_DATE is required for MORAWARE_SNAPSHOT_MODE=baseline_2026");
  const endRaw = String(process.env.MORAWARE_BASELINE_END_DATE ?? "").trim() || todayYmd();
  const start = parseYmd(startRaw, "MORAWARE_BASELINE_START_DATE");
  const end = parseYmd(endRaw, "MORAWARE_BASELINE_END_DATE");
  const floor = parseYmd("2026-01-01", "baseline_2026 floor");
  if (start.time < floor.time) throw new Error("baseline_2026 refuses start dates before 2026-01-01");
  if (start.time > end.time) throw new Error("MORAWARE_BASELINE_START_DATE must be on or before MORAWARE_BASELINE_END_DATE");
  return { startDate: start.raw, endDate: end.raw };
}

async function main() {
  requiredEnv("MORAWARE_API_URL");
  const user = requiredEnv("MORAWARE_USERNAME");
  requiredEnv("MORAWARE_PASSWORD");

  const requestedMode = String(process.env.MORAWARE_SNAPSHOT_MODE || "baseline").trim().toLowerCase();
  const baseline2026 = requestedMode === "baseline_2026";
  const baselineRange = baseline2026 ? validateBaseline2026Range() : null;

  const maxJobs = String(process.env.MORAWARE_LIVE_MAX_JOBS || process.env.MORAWARE_BASELINE_MAX_JOBS || (baseline2026 ? "5000" : "100")).trim();
  const maxActivities = String(process.env.MORAWARE_LIVE_MAX_ACTIVITIES || process.env.MORAWARE_BASELINE_MAX_ACTIVITIES || (baseline2026 ? "50000" : "500")).trim();
  const maxForms = String(process.env.MORAWARE_LIVE_MAX_FORMS || process.env.MORAWARE_BASELINE_MAX_FORMS || (baseline2026 ? "50000" : "500")).trim();
  const maxFiles = String(process.env.MORAWARE_LIVE_MAX_FILES || process.env.MORAWARE_BASELINE_MAX_FILES || (baseline2026 ? "10000" : "250")).trim();
  const maxAssignees = String(process.env.MORAWARE_LIVE_MAX_ASSIGNEES || process.env.MORAWARE_BASELINE_MAX_ASSIGNEES || (baseline2026 ? "1000" : "100")).trim();

  // Live capped runner is read-only against Moraware and writes only ignored local debug artifacts.
  process.env.SUPABASE_WRITE_ENABLED = "0";
  setDefaultEnv("MORAWARE_DISCOVERY", "1");
  setDefaultEnv("MORAWARE_DISCOVERY_MODE", "global-sync");
  setDefaultEnv("MORAWARE_INGEST_OPERATIONAL", "1");
  setDefaultEnv("MORAWARE_INGEST_FORMS", "1");
  setDefaultEnv("MORAWARE_MAX_JOBS_TO_INGEST", maxJobs);
  setDefaultEnv("MORAWARE_MAX_SEARCH_PAGES", baseline2026 ? "400" : "50");
  setDefaultEnv("MORAWARE_SNAPSHOT_MODE", baseline2026 ? "baseline_2026" : "baseline");
  setDefaultEnv("MORAWARE_BASELINE_MAX_JOBS", maxJobs);
  setDefaultEnv("MORAWARE_BASELINE_MAX_ACTIVITIES", maxActivities);
  setDefaultEnv("MORAWARE_BASELINE_MAX_FORMS", maxForms);
  setDefaultEnv("MORAWARE_BASELINE_MAX_FILES", maxFiles);
  setDefaultEnv("MORAWARE_BASELINE_MAX_ASSIGNEES", maxAssignees);
  setDefaultEnv("MORAWARE_TINY_SOURCE_FILE", "debug/moraware/latest/jobs/index.json");
  setDefaultEnv(
    "MORAWARE_TINY_OUTPUT_FILE",
    baseline2026
      ? "debug/moraware/baseline-2026/baseline-2026-moraware-snapshot.json"
      : "debug/moraware/live-capped/live-capped-moraware-snapshot.json"
  );
  if (baseline2026) {
    process.env.MORAWARE_SYNC_START_DATE = baselineRange.startDate;
    process.env.MORAWARE_SYNC_END_DATE = baselineRange.endDate;
    process.env.MORAWARE_SYNC_YEAR = "2026";
  }

  console.log("Live capped Moraware snapshot config:", {
    MORAWARE_USERNAME: user,
    MORAWARE_ACCOUNT_ID: String(process.env.MORAWARE_ACCOUNT_ID ?? "").trim() || "(not set)",
    SUPABASE_WRITE_ENABLED: process.env.SUPABASE_WRITE_ENABLED,
    MORAWARE_DISCOVERY_MODE: process.env.MORAWARE_DISCOVERY_MODE,
    MORAWARE_INGEST_OPERATIONAL: process.env.MORAWARE_INGEST_OPERATIONAL,
    MORAWARE_INGEST_FORMS: process.env.MORAWARE_INGEST_FORMS,
    MORAWARE_SNAPSHOT_MODE: process.env.MORAWARE_SNAPSHOT_MODE,
    MORAWARE_SYNC_START_DATE: process.env.MORAWARE_SYNC_START_DATE || null,
    MORAWARE_SYNC_END_DATE: process.env.MORAWARE_SYNC_END_DATE || null,
    MORAWARE_MAX_JOBS_TO_INGEST: process.env.MORAWARE_MAX_JOBS_TO_INGEST,
    MORAWARE_MAX_SEARCH_PAGES: process.env.MORAWARE_MAX_SEARCH_PAGES,
    MORAWARE_BASELINE_MAX_ACTIVITIES: process.env.MORAWARE_BASELINE_MAX_ACTIVITIES,
    MORAWARE_BASELINE_MAX_FORMS: process.env.MORAWARE_BASELINE_MAX_FORMS,
    MORAWARE_TINY_OUTPUT_FILE: process.env.MORAWARE_TINY_OUTPUT_FILE,
    MORAWARE_PASSWORD: redact(process.env.MORAWARE_PASSWORD)
  });

  const client = new MorawareClient();
  const discovery = await runMorawareDiscovery({
    client,
    jobId: null,
    accountId: null,
    entrypointProof: { markerLine: "eliteOS live capped Moraware snapshot (read-only)" }
  });

  // Import after env defaults are set because the generator reads caps at module load.
  const { generateSnapshotFile } = await import("./generateTinySnapshot.js");
  const generated = await generateSnapshotFile();
  const summary = {
    generated_at: new Date().toISOString(),
    discovery_summary: discovery?.discoverySummary ?? null,
    snapshot: {
      output: path.relative(process.cwd(), generated.output),
      source: path.relative(process.cwd(), generated.source),
      sourceShape: generated.sourceShape,
      counts: generated.counts,
      caps: generated.caps,
      mode: generated.mode,
      warnings: generated.warnings || [],
      effectiveDateRange: baselineRange
    }
  };

  const summaryPath = path.resolve(
    process.cwd(),
    baseline2026 ? "debug/moraware/baseline-2026/baseline-2026-summary.json" : "debug/moraware/live-capped/live-capped-summary.json"
  );
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log("Live capped Moraware snapshot complete:", {
    snapshot: summary.snapshot.output,
    summary: path.relative(process.cwd(), summaryPath),
    counts: generated.counts,
    warnings: generated.warnings || []
  });
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
