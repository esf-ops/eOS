/**
 * Production Moraware Foundation snapshot: stream local per-job artifacts into
 * bounded on-disk chunks. Never JSON.stringify() the full canonical dataset.
 *
 * Reads jobs/index.json + per-job artifacts only (no live Moraware calls).
 */

import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BATCH_KEYS,
  CHUNKED_MANIFEST_FORMAT,
  CHUNKED_MANIFEST_VERSION,
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
import { CENSUS_SCOPE_FULL, pickCensusScope } from "../../moraware/morawareCurrentPopulation.mjs";

const DEFAULT_SOURCE = "debug/moraware/latest/jobs/index.json";
const DEFAULT_CHUNKED_DIR = "debug/moraware/baseline-2026/chunked";
const DEFAULT_MAX_PAYLOAD_BYTES = 3_500_000;
const CHUNK_OVERHEAD_BYTES = 4096;

function bytesEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function intEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function chunkLimits() {
  return {
    accounts: Number.POSITIVE_INFINITY,
    jobs: intEnv("MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK", 20),
    job_activities: intEnv("MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK", 1000),
    job_forms: intEnv("MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK", 1000),
    job_files: intEnv("MORAWARE_IMPORT_MAX_FILES_PER_CHUNK", 250),
    assignees: intEnv("MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK", 250)
  };
}

function rowSize(row) {
  return Buffer.byteLength(JSON.stringify(row), "utf8");
}

function humanBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
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

function indexRowsFrom(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.jobs)) return input.jobs;
  if (input?.jobInfo || input?.source || input?.forms) return [input];
  return [];
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

function chunkFileName(index) {
  return `chunk-${String(index).padStart(6, "0")}.json`;
}

function createChunkWriter({ outDir, maxPayloadBytes, limits, organizationId, mode, runner }) {
  let current = emptyBatches();
  let currentCounts = emptyCounts();
  let currentRowsBytes = 0;
  let currentRowCount = 0;
  const chunkMetas = [];
  let flushedChunks = 0;
  const singleRowOversize = [];

  function hasRows() {
    return BATCH_KEYS.some((key) => current[key].length > 0);
  }

  async function flush() {
    if (!flushedChunks && !hasRows()) return null;
    if (!hasRows()) return null;
    flushedChunks += 1;
    const file = chunkFileName(flushedChunks);
    const abs = path.join(outDir, file);
    const payload = {
      organization_id: organizationId || undefined,
      mode,
      runner,
      metadata: {
        chunk_index: flushedChunks,
        chunk_counts: { ...currentCounts }
      },
      batches: current
    };
    const text = JSON.stringify(payload);
    const buf = Buffer.from(text, "utf8");
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    await fs.writeFile(abs, buf);
    const byteSize = buf.length;
    const meta = {
      file,
      chunk_index: flushedChunks,
      sha256,
      byte_size: byteSize,
      row_counts: { ...currentCounts }
    };
    chunkMetas.push(meta);
    current = emptyBatches();
    currentCounts = emptyCounts();
    currentRowsBytes = 0;
    currentRowCount = 0;
    return meta;
  }

  async function addRow(key, row) {
    const nextRowBytes = rowSize(row);
    const limit = limits[key];
    if (Number.isFinite(limit) && limit > 0 && currentCounts[key] >= limit) {
      await flush();
    }
    const estimated = CHUNK_OVERHEAD_BYTES + currentRowsBytes + nextRowBytes + currentRowCount + 1;
    if (hasRows() && estimated > maxPayloadBytes) {
      await flush();
    }
    current[key].push(row);
    currentCounts[key] += 1;
    currentRowsBytes += nextRowBytes;
    currentRowCount += 1;

    const onlyThisEntity = BATCH_KEYS.every((batchKey) => batchKey === key || currentCounts[batchKey] === 0);
    if (onlyThisEntity && currentCounts[key] === 1) {
      const singleBytes = Buffer.byteLength(JSON.stringify({ batches: current }), "utf8") + CHUNK_OVERHEAD_BYTES;
      if (singleBytes > maxPayloadBytes) {
        singleRowOversize.push({ key, estimated_payload_bytes: singleBytes, max_payload_bytes: maxPayloadBytes });
        console.warn("Single Moraware row exceeds MORAWARE_IMPORT_MAX_PAYLOAD_BYTES; chunk will still be written alone:", {
          key,
          estimated_payload_bytes: singleBytes,
          max_payload_bytes: maxPayloadBytes
        });
        await flush();
      }
    }
  }

  return {
    addRow,
    flush,
    chunkMetas,
    singleRowOversize,
    get flushedChunkCount() {
      return flushedChunks;
    }
  };
}

export async function generateChunkedFoundationSnapshot(options = {}) {
  const mode = resolveSnapshotMode();
  const caps = resolveSnapshotCaps(mode);
  const sourceFile =
    options.sourceFile || process.env.MORAWARE_TINY_SOURCE_FILE || process.env.MORAWARE_SYNC_SOURCE_FILE || DEFAULT_SOURCE;
  const outDirRel =
    options.outDir || process.env.MORAWARE_CHUNKED_OUTPUT_DIR || DEFAULT_CHUNKED_DIR;
  const maxPayloadBytes = bytesEnv("MORAWARE_IMPORT_MAX_PAYLOAD_BYTES", DEFAULT_MAX_PAYLOAD_BYTES);
  const limits = chunkLimits();
  const organizationId = String(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID || "").trim();
  const snapshotModeLabel = `${mode}-real-snapshot`;

  const { abs: sourceAbs, json } = await readJson(sourceFile);
  const root = sourceRootFor(sourceAbs);
  const { map: statusSourceMap, sourceFile: statusSourceFile } = await loadStatusSourceMap();
  const indexRows = indexRowsFrom(json);

  const outDir = path.resolve(process.cwd(), outDirRel);
  await fs.mkdir(outDir, { recursive: true });

  const writer = createChunkWriter({
    outDir,
    maxPayloadBytes,
    limits,
    organizationId,
    mode: snapshotModeLabel,
    runner: "local-chunked-generator"
  });

  const counts = emptyCounts();
  const seen = createSeenSets();
  let actualFormCount = 0;
  let failedReads = 0;
  let sourceShape = Array.isArray(json) ? "jobs-index-array" : "jobs-array";

  const pending = [];
  const emit = (key, row) => {
    pending.push({ key, row });
  };

  async function drainPending() {
    while (pending.length) {
      const item = pending.shift();
      await writer.addRow(item.key, item.row);
    }
  }

  for (const row of indexRows) {
    if (counts.jobs >= caps.jobs) break;
    const jid = jobIdFrom(row);
    const artifact = resolveArtifact(root, row.artifactPath || (jid ? `jobs/${jid}.json` : ""));
    const loaded = artifact ? await readJsonIfExists(artifact) : null;
    if (artifact && !loaded) failedReads += 1;
    const jobJson = loaded?.json ?? row;
    const rawJob = row && loaded?.json ? { ...row, ...jobJson } : jobJson;
    const opPath = jid ? resolveArtifact(root, `jobs/${jid}.operational.json`) : "";
    const op = opPath ? await readJsonIfExists(opPath) : null;
    const statusSource = statusSourceMap.get(jid) || op?.json || null;

    const mapped = appendCanonicalRowsFromJob({
      rawJob,
      operational: op?.json || null,
      statusSource,
      fallbackJobId: jid,
      caps,
      counts,
      seen,
      emit
    });
    actualFormCount += mapped.actualFormCount;
    await drainPending();
  }

  await drainPending();
  await writer.flush();

  const warnings = capWarningsFromCounts(counts, caps);
  const chunks = writer.chunkMetas;
  const largestChunkBytes = Math.max(0, ...chunks.map((c) => c.byte_size || 0));
  const manifest = {
    format: CHUNKED_MANIFEST_FORMAT,
    version: CHUNKED_MANIFEST_VERSION,
    generated_at: new Date().toISOString(),
    census_scope: pickCensusScope(process.env.MORAWARE_CENSUS_SCOPE) || CENSUS_SCOPE_FULL,
    snapshot_mode: mode,
    organization_id: organizationId || undefined,
    mode: snapshotModeLabel,
    runner: "local-chunked-generator",
    source: {
      source_file: path.relative(process.cwd(), sourceAbs),
      source_abs: sourceAbs,
      source_shape: sourceShape,
      status_source_file: statusSourceFile || null,
      source_root: path.relative(process.cwd(), root)
    },
    baseline_start_date: process.env.MORAWARE_BASELINE_START_DATE || process.env.MORAWARE_SYNC_START_DATE || null,
    baseline_end_date: process.env.MORAWARE_BASELINE_END_DATE || process.env.MORAWARE_SYNC_END_DATE || null,
    totals: { ...counts },
    actual_form_count: actualFormCount,
    failed_source_reads: failedReads,
    chunk_count: chunks.length,
    chunks,
    max_payload_bytes: maxPayloadBytes,
    chunk_limits: limits,
    caps,
    cap_warnings: warnings,
    single_row_oversize: writer.singleRowOversize,
    largest_chunk_bytes: largestChunkBytes,
    generated_by: "backend-core/src/scripts/moraware/generateChunkedFoundationSnapshot.js"
  };

  const manifestAbs = path.join(outDir, "manifest.json");
  await fs.writeFile(manifestAbs, JSON.stringify(manifest, null, 2), "utf8");

  const summary = {
    generated_at: manifest.generated_at,
    snapshot: {
      output: path.relative(process.cwd(), manifestAbs),
      format: CHUNKED_MANIFEST_FORMAT,
      source: path.relative(process.cwd(), sourceAbs),
      sourceShape,
      counts,
      actual_form_count: actualFormCount,
      failed_source_reads: failedReads,
      chunk_count: chunks.length,
      largest_chunk_bytes: largestChunkBytes,
      caps,
      mode,
      warnings
    }
  };
  const summaryAbs = path.resolve(process.cwd(), "debug/moraware/baseline-2026/baseline-2026-summary.json");
  if (mode === "baseline_2026") {
    await fs.mkdir(path.dirname(summaryAbs), { recursive: true });
    await fs.writeFile(summaryAbs, JSON.stringify(summary, null, 2), "utf8");
  }

  printOperatorSummary(manifest);

  return {
    output: manifestAbs,
    manifestPath: manifestAbs,
    source: sourceAbs,
    sourceShape,
    counts,
    caps,
    mode,
    warnings,
    chunkCount: chunks.length,
    format: "chunked",
    failedReads,
    actualFormCount,
    largestChunkBytes
  };
}

export function printOperatorSummary(manifest, extras = {}) {
  const totals = manifest.totals || {};
  const http = extras.httpRequests ?? "(generation only)";
  const writes = extras.supabaseWrites ?? "(generation only)";
  const result = extras.result || (Array.isArray(manifest.cap_warnings) && manifest.cap_warnings.length ? "CAP_WARNINGS" : "GENERATED");
  console.log(`
Moraware Foundation manifest
accounts: ${totals.accounts ?? 0}
jobs: ${totals.jobs ?? 0}
job_activities: ${totals.job_activities ?? 0}
job_forms: ${totals.job_forms ?? 0}
job_files: ${totals.job_files ?? 0}
assignees: ${totals.assignees ?? 0}
actual_forms: ${manifest.actual_form_count ?? 0}
failed_reads: ${manifest.failed_source_reads ?? 0}
chunks: ${manifest.chunk_count ?? 0}
largest_chunk_bytes: ${manifest.largest_chunk_bytes ?? 0} (${humanBytes(manifest.largest_chunk_bytes)})
cap_warnings: ${(manifest.cap_warnings || []).length}
HTTP requests: ${http}
Supabase writes: ${writes}

RESULT: ${result}
`);
}

async function main() {
  await generateChunkedFoundationSnapshot();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    console.error(e?.stack || e);
    process.exitCode = 1;
  });
}
