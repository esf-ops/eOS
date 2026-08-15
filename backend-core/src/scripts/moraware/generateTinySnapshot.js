import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BATCH_KEYS,
  appendCanonicalRowsFromJob,
  capWarningsFromCounts,
  collectStatusRows,
  createSeenSets,
  emptyBatches,
  emptyCounts,
  extractJobProcess,
  extractJobStatus,
  jobIdFrom,
  pickStr,
  resolveArtifact,
  resolveSnapshotCaps,
  resolveSnapshotMode,
  sourceRootFor
} from "./morawareSnapshotCanonical.js";

export { extractJobProcess, extractJobStatus };

const DEFAULT_SOURCE = "debug/moraware/latest/jobs/index.json";

function defaultOutFile(mode) {
  if (mode === "baseline_2026") return "debug/moraware/baseline-2026/chunked/manifest.json";
  if (mode === "baseline") return "debug/moraware/baseline-tests/capped-baseline-moraware-snapshot.json";
  return "debug/moraware/import-tests/tiny-real-moraware-snapshot.json";
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

async function readJson(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(abs, "utf8");
  return { abs, json: JSON.parse(text) };
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

function normalizeExistingBatches(input, caps) {
  const batches = input?.batches && typeof input.batches === "object" ? input.batches : input;
  if (!batches || typeof batches !== "object") return null;
  if (!BATCH_KEYS.some((k) => Array.isArray(batches[k]))) return null;
  return Object.fromEntries(BATCH_KEYS.map((k) => [k, asArray(batches[k]).slice(0, caps[k])]));
}

async function loadJobsFromIndex(indexRows, sourceAbs, jobCap) {
  const root = sourceRootFor(sourceAbs);
  const jobs = [];
  const operationalByJob = new Map();
  for (const row of indexRows.slice(0, jobCap)) {
    const jid = jobIdFrom(row);
    const artifact = resolveArtifact(root, row.artifactPath || (jid ? `jobs/${jid}.json` : ""));
    const loaded = artifact ? await readJsonIfExists(artifact) : null;
    jobs.push({ indexRow: row, job: loaded?.json ?? row, jobId: jid });
    const opPath = jid ? resolveArtifact(root, `jobs/${jid}.operational.json`) : "";
    const op = opPath ? await readJsonIfExists(opPath) : null;
    if (op?.json) operationalByJob.set(jid, op.json);
  }
  return { jobs, operationalByJob };
}

async function loadStatusSourceMap() {
  const statusSourceFile = process.env.MORAWARE_TINY_STATUS_SOURCE_FILE || "";
  if (!statusSourceFile) return { map: new Map(), sourceFile: "" };
  const loaded = await readJson(statusSourceFile);
  const map = new Map();
  for (const row of collectStatusRows(loaded.json)) {
    const id = jobIdFrom(row) || pickStr(row.id);
    if (!id) continue;
    const status = extractJobStatus(row);
    const process = extractJobProcess(row);
    if (status || process) map.set(id, row);
  }
  return { map, sourceFile: path.relative(process.cwd(), loaded.abs) };
}

export async function buildSnapshotFromSource(sourceAbs, input, statusSourceMap = new Map(), caps = resolveSnapshotCaps()) {
  const existing = normalizeExistingBatches(input, caps);
  if (existing) {
    return { batches: existing, sourceShape: "existing-import-batches" };
  }

  let jobEntries = [];
  let operationalByJob = new Map();
  let sourceShape = "generic-json";

  if (Array.isArray(input)) {
    const loaded = await loadJobsFromIndex(input, sourceAbs, caps.jobs);
    jobEntries = loaded.jobs;
    operationalByJob = loaded.operationalByJob;
    sourceShape = "jobs-index-array";
  } else if (Array.isArray(input?.jobs)) {
    jobEntries = input.jobs.slice(0, caps.jobs).map((job) => ({ job, jobId: jobIdFrom(job) }));
    sourceShape = "jobs-array";
  } else if (input?.jobInfo || input?.source || input?.forms) {
    jobEntries = [{ job: input, jobId: jobIdFrom(input) }];
    sourceShape = "single-normalized-job";
  } else if (Array.isArray(input?.activities) || Array.isArray(input?.phases) || input?.summary) {
    const jid = pickStr(input.jobId);
    operationalByJob.set(jid, input);
    jobEntries = jid ? [{ job: { jobId: jid, raw_payload: input }, jobId: jid }] : [];
    sourceShape = "single-operational-job";
  }

  const batches = emptyBatches();
  const counts = emptyCounts();
  const seen = createSeenSets();
  const emit = (key, row) => {
    batches[key].push(row);
  };

  for (const entry of jobEntries) {
    if (counts.jobs >= caps.jobs) break;
    const rawJob = entry.indexRow ? { ...entry.indexRow, ...(entry.job || {}) } : entry.job || {};
    const jid = jobIdFrom(rawJob, entry.jobId);
    const statusSource = statusSourceMap.get(jid) || operationalByJob.get(jid);
    appendCanonicalRowsFromJob({
      rawJob,
      operational: operationalByJob.get(jid) || null,
      statusSource,
      fallbackJobId: jid,
      caps,
      counts,
      seen,
      emit
    });
  }

  if (Array.isArray(input?.activities)) {
    appendCanonicalRowsFromJob({
      rawJob: { jobId: pickStr(input.jobId) },
      extraActivities: input.activities,
      skipJobEntities: true,
      caps,
      counts,
      seen,
      emit
    });
  }

  return { batches, sourceShape, counts };
}

export async function generateSnapshotFile(options = {}) {
  const mode = resolveSnapshotMode();
  if (mode === "baseline_2026") {
    const { generateChunkedFoundationSnapshot } = await import("./generateChunkedFoundationSnapshot.js");
    return generateChunkedFoundationSnapshot({
      sourceFile: options.sourceFile,
      outDir: options.outDir || process.env.MORAWARE_CHUNKED_OUTPUT_DIR
    });
  }

  const caps = resolveSnapshotCaps(mode);
  const sourceFile = options.sourceFile || process.env.MORAWARE_TINY_SOURCE_FILE || process.env.MORAWARE_SYNC_SOURCE_FILE || DEFAULT_SOURCE;
  const outFile = options.outFile || process.env.MORAWARE_TINY_OUTPUT_FILE || defaultOutFile(mode);
  const { abs: sourceAbs, json } = await readJson(sourceFile);
  const { map: statusSourceMap, sourceFile: statusSourceFile } = await loadStatusSourceMap();
  const { batches, sourceShape, counts } = await buildSnapshotFromSource(sourceAbs, json, statusSourceMap, caps);
  const body = {
    organization_id: process.env.MORAWARE_DEFAULT_ORGANIZATION_ID || undefined,
    mode: `${mode}-real-snapshot`,
    runner: "local-generator",
    metadata: {
      generated_by: "backend-core/src/scripts/moraware/generateTinySnapshot.js",
      generated_at: new Date().toISOString(),
      snapshot_mode: mode,
      source_file: path.relative(process.cwd(), sourceAbs),
      status_source_file: statusSourceFile || null,
      source_shape: sourceShape,
      caps,
      baseline_start_date: process.env.MORAWARE_BASELINE_START_DATE || process.env.MORAWARE_SYNC_START_DATE || null,
      baseline_end_date: process.env.MORAWARE_BASELINE_END_DATE || process.env.MORAWARE_SYNC_END_DATE || null,
      cap_warnings: capWarningsFromCounts(counts || Object.fromEntries(Object.entries(batches).map(([k, v]) => [k, v.length])), caps)
    },
    batches
  };

  const outAbs = path.resolve(process.cwd(), outFile);
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, JSON.stringify(body, null, 2), "utf8");
  const rowCounts = counts || Object.fromEntries(Object.entries(batches).map(([k, v]) => [k, v.length]));
  const warnings = capWarningsFromCounts(rowCounts, caps);
  console.log(`${mode} Moraware snapshot generated:`, {
    source: path.relative(process.cwd(), sourceAbs),
    statusSource: statusSourceFile || "(per-job operational artifacts when present)",
    sourceShape,
    output: path.relative(process.cwd(), outAbs),
    caps,
    counts: rowCounts,
    warnings
  });
  return { output: outAbs, source: sourceAbs, sourceShape, counts: rowCounts, caps, mode, warnings };
}

async function main() {
  await generateSnapshotFile();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    console.error(e?.stack || e);
    process.exitCode = 1;
  });
}
