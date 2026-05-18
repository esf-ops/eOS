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

async function main() {
  requiredEnv("MORAWARE_API_URL");
  const user = requiredEnv("MORAWARE_USERNAME");
  requiredEnv("MORAWARE_PASSWORD");

  const maxJobs = String(process.env.MORAWARE_LIVE_MAX_JOBS || "100").trim();
  const maxActivities = String(process.env.MORAWARE_LIVE_MAX_ACTIVITIES || "500").trim();
  const maxForms = String(process.env.MORAWARE_LIVE_MAX_FORMS || "500").trim();
  const maxFiles = String(process.env.MORAWARE_LIVE_MAX_FILES || "250").trim();
  const maxAssignees = String(process.env.MORAWARE_LIVE_MAX_ASSIGNEES || "100").trim();

  // Live capped runner is read-only against Moraware and writes only ignored local debug artifacts.
  process.env.SUPABASE_WRITE_ENABLED = "0";
  setDefaultEnv("MORAWARE_DISCOVERY", "1");
  setDefaultEnv("MORAWARE_DISCOVERY_MODE", "global-sync");
  setDefaultEnv("MORAWARE_INGEST_OPERATIONAL", "1");
  setDefaultEnv("MORAWARE_INGEST_FORMS", "1");
  setDefaultEnv("MORAWARE_MAX_JOBS_TO_INGEST", maxJobs);
  setDefaultEnv("MORAWARE_MAX_SEARCH_PAGES", "50");
  setDefaultEnv("MORAWARE_SNAPSHOT_MODE", "baseline");
  setDefaultEnv("MORAWARE_BASELINE_MAX_JOBS", maxJobs);
  setDefaultEnv("MORAWARE_BASELINE_MAX_ACTIVITIES", maxActivities);
  setDefaultEnv("MORAWARE_BASELINE_MAX_FORMS", maxForms);
  setDefaultEnv("MORAWARE_BASELINE_MAX_FILES", maxFiles);
  setDefaultEnv("MORAWARE_BASELINE_MAX_ASSIGNEES", maxAssignees);
  setDefaultEnv("MORAWARE_TINY_SOURCE_FILE", "debug/moraware/latest/jobs/index.json");
  setDefaultEnv("MORAWARE_TINY_OUTPUT_FILE", "debug/moraware/live-capped/live-capped-moraware-snapshot.json");

  console.log("Live capped Moraware snapshot config:", {
    MORAWARE_USERNAME: user,
    MORAWARE_ACCOUNT_ID: String(process.env.MORAWARE_ACCOUNT_ID ?? "").trim() || "(not set)",
    SUPABASE_WRITE_ENABLED: process.env.SUPABASE_WRITE_ENABLED,
    MORAWARE_DISCOVERY_MODE: process.env.MORAWARE_DISCOVERY_MODE,
    MORAWARE_INGEST_OPERATIONAL: process.env.MORAWARE_INGEST_OPERATIONAL,
    MORAWARE_INGEST_FORMS: process.env.MORAWARE_INGEST_FORMS,
    MORAWARE_MAX_JOBS_TO_INGEST: process.env.MORAWARE_MAX_JOBS_TO_INGEST,
    MORAWARE_MAX_SEARCH_PAGES: process.env.MORAWARE_MAX_SEARCH_PAGES,
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
      mode: generated.mode
    }
  };

  const summaryPath = path.resolve(process.cwd(), "debug/moraware/live-capped/live-capped-summary.json");
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log("Live capped Moraware snapshot complete:", {
    snapshot: summary.snapshot.output,
    summary: path.relative(process.cwd(), summaryPath),
    counts: generated.counts
  });
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
