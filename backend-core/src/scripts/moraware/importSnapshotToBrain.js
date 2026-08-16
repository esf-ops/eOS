import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BATCH_KEYS as CANONICAL_BATCH_KEYS, isChunkedManifest } from "./morawareSnapshotCanonical.js";
import { printOperatorSummary } from "./generateChunkedFoundationSnapshot.js";
import {
  buildMorawareCensusImportMetadata,
  pickCensusScope
} from "../../moraware/morawareCurrentPopulation.mjs";
import {
  createMorawarePopulationLockOwnerToken,
  MORAWARE_POPULATION_LOCK_OWNER_ENV,
  MORAWARE_POPULATION_LOCK_OWNER_HEADER,
  postMorawarePopulationLock,
  requireLiveCensusScope
} from "../../moraware/morawarePopulationLock.mjs";

const BATCH_KEYS = CANONICAL_BATCH_KEYS;
const DEFAULT_MAX_PAYLOAD_BYTES = 3_500_000;
const LARGE_SNAPSHOT_THRESHOLDS = Object.freeze({
  fileBytes: 25 * 1024 * 1024,
  totalRows: 10_000,
  jobs: 500,
  job_activities: 5_000,
  job_forms: 5_000
});

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function backendBase() {
  return String(process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || "http://localhost:3001")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
}

function secretConfigured(secret) {
  return Boolean(String(secret ?? "").trim());
}

function envTruthy(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function intEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function positiveIntEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bytesEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function humanBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function readJsonFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  const stat = await fs.stat(abs);
  const text = await fs.readFile(abs, "utf8");
  return { abs, fileBytes: stat.size, json: JSON.parse(text) };
}

function normalizePayload(input) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {};
  body.mode = body.mode || process.env.MORAWARE_SYNC_MODE || "manual-worker-import";
  body.runner = body.runner || process.env.MORAWARE_SYNC_RUNNER || "windows-worker";
  if (!body.organization_id && process.env.MORAWARE_DEFAULT_ORGANIZATION_ID) {
    body.organization_id = process.env.MORAWARE_DEFAULT_ORGANIZATION_ID;
  }
  body.metadata = {
    ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    imported_by: "backend-core/src/scripts/moraware/importSnapshotToBrain.js",
    imported_at: new Date().toISOString()
  };
  return body;
}

function batchRows(body) {
  const source = body.batches && typeof body.batches === "object" ? body.batches : body;
  return Object.fromEntries(BATCH_KEYS.map((key) => [key, Array.isArray(source[key]) ? source[key] : []]));
}

function rowCounts(rows) {
  return Object.fromEntries(BATCH_KEYS.map((key) => [key, rows[key]?.length ?? 0]));
}

function hasEnvValue(name) {
  return process.env[name] != null && String(process.env[name]).trim() !== "";
}

export function pickImportSecret({ dryRun = false } = {}) {
  if (dryRun) return "";
  const importSecret = String(process.env.MORAWARE_SYNC_IMPORT_SECRET ?? "").trim();
  if (importSecret) return importSecret;
  const cronSecret = String(process.env.EOS_CRON_SECRET ?? "").trim();
  if (cronSecret) return cronSecret;
  throw new Error("Missing required env var: MORAWARE_SYNC_IMPORT_SECRET or EOS_CRON_SECRET");
}

function chunkLimits({ largeBaseline = false } = {}) {
  const defaults = largeBaseline
    ? {
        jobs: 50,
        job_activities: 1000,
        job_forms: 1000,
        job_files: 250,
        assignees: 250
      }
    : {
        jobs: 20,
        job_activities: 100,
        job_forms: 100,
        job_files: 50,
        assignees: 50
      };
  return {
    accounts: Number.POSITIVE_INFINITY,
    jobs: intEnv("MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK", defaults.jobs),
    job_activities: intEnv("MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK", defaults.job_activities),
    job_forms: intEnv("MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK", defaults.job_forms),
    job_files: intEnv("MORAWARE_IMPORT_MAX_FILES_PER_CHUNK", defaults.job_files),
    assignees: intEnv("MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK", defaults.assignees)
  };
}

function sliceChunk(rows, key, chunkIndex, limit) {
  if (key === "accounts") {
    return chunkIndex === 0 ? rows.accounts : [];
  }
  if (!Number.isFinite(limit) || limit <= 0) return chunkIndex === 0 ? rows[key] : [];
  const start = chunkIndex * limit;
  return rows[key].slice(start, start + limit);
}

function baseChunkBody(body) {
  const chunkBody = { ...body };
  for (const key of BATCH_KEYS) delete chunkBody[key];
  return chunkBody;
}

function finalizeChunkPayload(chunkBody, batches, metadata) {
  return {
    ...chunkBody,
    batches,
    metadata: {
      ...(chunkBody.metadata && typeof chunkBody.metadata === "object" ? chunkBody.metadata : {}),
      ...metadata
    }
  };
}

function chunkImportStatus(chunkIndex, chunkCount) {
  if (chunkCount <= 1) return "single_chunk";
  if (chunkIndex === 1) return "chunked_started";
  if (chunkIndex === chunkCount) return "chunked_final_chunk";
  return "chunked_in_progress";
}

function estimatePayloadBytes(payload) {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function attachEstimatedPayloadBytes(payload) {
  Object.defineProperty(payload, "estimated_payload_bytes", {
    value: estimatePayloadBytes(payload),
    enumerable: false,
    configurable: true
  });
  return payload;
}

function buildLegacyChunkPayloads(body, options = {}) {
  const rows = batchRows(body);
  const limits = chunkLimits(options);
  const parentSnapshotCounts = rowCounts(rows);
  const entityChunkCounts = BATCH_KEYS.map((key) => {
    if (key === "accounts") return rows.accounts.length > 0 ? 1 : 0;
    const limit = limits[key];
    if (!Number.isFinite(limit) || limit <= 0) return rows[key].length > 0 ? 1 : 0;
    return Math.ceil(rows[key].length / limit);
  });
  const chunkCount = Math.max(1, ...entityChunkCounts);
  const importGroupId = options.importGroupId || crypto.randomUUID();
  const chunkBody = baseChunkBody(body);

  return Array.from({ length: chunkCount }, (_, chunkIndex) => {
    const batches = Object.fromEntries(
      BATCH_KEYS.map((key) => [key, sliceChunk(rows, key, chunkIndex, limits[key])])
    );
    const chunkCounts = rowCounts(batches);
    return finalizeChunkPayload(chunkBody, batches, {
        import_group_id: importGroupId,
        chunk_index: chunkIndex + 1,
        chunk_count: chunkCount,
        import_status: chunkImportStatus(chunkIndex + 1, chunkCount),
        import_resumed: Boolean(options.resumeGroupId),
        resumed_from_chunk_index: options.startChunkIndex || null,
        chunk_counts: chunkCounts,
        parent_snapshot_counts: parentSnapshotCounts
      });
  }).map((chunk) => attachEstimatedPayloadBytes(chunk));
}

function emptyBatches() {
  return Object.fromEntries(BATCH_KEYS.map((key) => [key, []]));
}

function rowSize(row) {
  return Buffer.byteLength(JSON.stringify(row), "utf8");
}

function buildSizeAwareChunkPayloads(body, options = {}) {
  const rows = batchRows(body);
  const limits = chunkLimits(options);
  const parentSnapshotCounts = rowCounts(rows);
  const importGroupId = options.importGroupId || crypto.randomUUID();
  const maxPayloadBytes = bytesEnv("MORAWARE_IMPORT_MAX_PAYLOAD_BYTES", DEFAULT_MAX_PAYLOAD_BYTES);
  const chunkBody = baseChunkBody(body);
  const chunks = [];

  let current = emptyBatches();
  let currentCounts = rowCounts(current);
  let currentEstimatedRowsBytes = 0;
  let currentRowCount = 0;

  function currentPayloadWith(nextBatches = current) {
    return finalizeChunkPayload(chunkBody, nextBatches, {
      import_group_id: importGroupId,
      chunk_index: chunks.length + 1,
      chunk_count: 999999,
      chunk_counts: rowCounts(nextBatches),
      parent_snapshot_counts: parentSnapshotCounts
    });
  }

  function pushCurrent() {
    if (!BATCH_KEYS.some((key) => current[key].length > 0)) return;
    chunks.push({
      batches: current,
      estimatedRowsBytes: currentEstimatedRowsBytes
    });
    current = emptyBatches();
    currentCounts = rowCounts(current);
    currentEstimatedRowsBytes = 0;
    currentRowCount = 0;
  }

  const basePayloadBytes = estimatePayloadBytes(currentPayloadWith(emptyBatches())) + 2048;

  for (const key of BATCH_KEYS) {
    const limit = limits[key];
    for (const row of rows[key]) {
      const nextRowBytes = rowSize(row);
      if (Number.isFinite(limit) && limit > 0 && currentCounts[key] >= limit) {
        pushCurrent();
      }

      const estimatedBytes = basePayloadBytes + currentEstimatedRowsBytes + nextRowBytes + currentRowCount + 1;
      const hasRows = BATCH_KEYS.some((batchKey) => current[batchKey].length > 0);
      if (hasRows && estimatedBytes > maxPayloadBytes) {
        pushCurrent();
      }

      current[key].push(row);
      currentCounts[key] += 1;
      currentEstimatedRowsBytes += nextRowBytes;
      currentRowCount += 1;

      const singleRowChunkBytes = estimatePayloadBytes(currentPayloadWith(current));
      if (currentCounts[key] === 1 && BATCH_KEYS.every((batchKey) => batchKey === key || currentCounts[batchKey] === 0) && singleRowChunkBytes > maxPayloadBytes) {
        console.warn("Single Moraware row exceeds MORAWARE_IMPORT_MAX_PAYLOAD_BYTES; chunk will still be sent alone:", {
          key,
          estimated_payload_bytes: singleRowChunkBytes,
          max_payload_bytes: maxPayloadBytes
        });
        pushCurrent();
      }
    }
  }
  pushCurrent();

  const chunkCount = Math.max(1, chunks.length);
  if (!chunks.length) chunks.push({ batches: emptyBatches(), estimatedRowsBytes: 0 });

  return chunks.map((chunk, index) => {
    const batches = chunk.batches;
    const chunkCounts = rowCounts(batches);
    const payload = finalizeChunkPayload(chunkBody, batches, {
      import_group_id: importGroupId,
      chunk_index: index + 1,
      chunk_count: chunkCount,
      import_status: chunkImportStatus(index + 1, chunkCount),
      import_resumed: Boolean(options.resumeGroupId),
      resumed_from_chunk_index: options.startChunkIndex || null,
      chunk_counts: chunkCounts,
      parent_snapshot_counts: parentSnapshotCounts,
      max_payload_bytes: maxPayloadBytes
    });
    return attachEstimatedPayloadBytes(payload);
  });
}

function buildChunkPayloads(body, options = {}) {
  const useSizeAware =
    options.sizeAware || hasEnvValue("MORAWARE_IMPORT_MAX_PAYLOAD_BYTES") || options.largeBaseline;
  return useSizeAware ? buildSizeAwareChunkPayloads(body, options) : buildLegacyChunkPayloads(body, options);
}

function resolveCensusScopeForImport(manifest) {
  const envScope = pickCensusScope(process.env.MORAWARE_CENSUS_SCOPE);
  if (envScope) return envScope;
  return pickCensusScope(manifest?.census_scope ?? manifest?.metadata?.census_scope);
}

function censusMetadataFromManifest(manifest) {
  const scope = resolveCensusScopeForImport(manifest);
  if (!scope) return {};
  return buildMorawareCensusImportMetadata({
    censusScope: scope,
    snapshotMode: manifest?.snapshot_mode || null,
    capWarnings: manifest?.cap_warnings || [],
    baselineStartDate: manifest?.baseline_start_date || null,
    baselineEndDate: manifest?.baseline_end_date || null
  });
}

function assertLiveCensusScope(manifest, dryRun) {
  if (dryRun) return;
  const scope = resolveCensusScopeForImport(manifest);
  const required = requireLiveCensusScope(scope);
  if (!required.ok) {
    const err = new Error(required.error);
    err.code = required.code;
    throw err;
  }
}

async function withStandalonePopulationLock({ dryRun, usesInjectedPostFn }, fn) {
  if (dryRun || usesInjectedPostFn) return fn();
  const existing = String(process.env[MORAWARE_POPULATION_LOCK_OWNER_ENV] ?? "").trim();
  if (existing) return fn();
  const secret = pickImportSecret({ dryRun: false });
  const ownerToken = createMorawarePopulationLockOwnerToken();
  const url = `${backendBase()}/api/internal/moraware-sync/population-lock`;
  const acquired = await postMorawarePopulationLock({
    url,
    secret,
    action: "acquire",
    ownerToken,
    lockedBy: `importSnapshotToBrain:${process.pid}`,
    metadata: { runner: "standalone-importer" }
  });
  if (!acquired?.acquired) {
    throw new Error("Could not acquire moraware_population lock for live import.");
  }
  process.env[MORAWARE_POPULATION_LOCK_OWNER_ENV] = ownerToken;
  try {
    return await fn();
  } finally {
    try {
      await postMorawarePopulationLock({ url, secret, action: "release", ownerToken });
    } catch {
      /* release best-effort */
    }
    delete process.env[MORAWARE_POPULATION_LOCK_OWNER_ENV];
  }
}

function resolveImportGroupId() {
  const resumeGroupId = String(process.env.MORAWARE_IMPORT_RESUME_GROUP_ID ?? "").trim();
  return resumeGroupId || crypto.randomUUID();
}

function resolveStartChunkIndex() {
  return positiveIntEnv("MORAWARE_IMPORT_START_CHUNK_INDEX", 1);
}

function totalRowCount(counts) {
  return Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function largeSnapshotReasons({ body, counts, fileBytes }) {
  const reasons = [];
  const totalRows = totalRowCount(counts);
  const snapshotMode = String(body?.metadata?.snapshot_mode || body?.mode || "").toLowerCase();
  if (fileBytes > LARGE_SNAPSHOT_THRESHOLDS.fileBytes) {
    reasons.push(`file size ${humanBytes(fileBytes)} exceeds ${humanBytes(LARGE_SNAPSHOT_THRESHOLDS.fileBytes)}`);
  }
  if (totalRows > LARGE_SNAPSHOT_THRESHOLDS.totalRows) {
    reasons.push(`total rows ${totalRows} exceeds ${LARGE_SNAPSHOT_THRESHOLDS.totalRows}`);
  }
  if ((counts.jobs || 0) > LARGE_SNAPSHOT_THRESHOLDS.jobs) {
    reasons.push(`jobs ${counts.jobs} exceeds ${LARGE_SNAPSHOT_THRESHOLDS.jobs}`);
  }
  if ((counts.job_activities || 0) > LARGE_SNAPSHOT_THRESHOLDS.job_activities) {
    reasons.push(`job_activities ${counts.job_activities} exceeds ${LARGE_SNAPSHOT_THRESHOLDS.job_activities}`);
  }
  if ((counts.job_forms || 0) > LARGE_SNAPSHOT_THRESHOLDS.job_forms) {
    reasons.push(`job_forms ${counts.job_forms} exceeds ${LARGE_SNAPSHOT_THRESHOLDS.job_forms}`);
  }
  if (snapshotMode.includes("baseline_2026") && reasons.length) {
    reasons.unshift("snapshot is baseline_2026");
  }
  return reasons;
}

function assertLargeSnapshotAllowed({ largeReasons, dryRun, chunked }) {
  if (!largeReasons.length) return;
  if (!envTruthy(process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE)) {
    throw new Error(
      [
        "Large Moraware baseline import refused.",
        ...largeReasons.map((reason) => `- ${reason}`),
        "Set MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1 after inspecting the snapshot and run MORAWARE_IMPORT_DRY_RUN=1 first."
      ].join("\n")
    );
  }
  if (!dryRun && !chunked) {
    throw new Error("Large Moraware baseline import requires MORAWARE_IMPORT_CHUNKED=1. Run dry-run first and import only after reviewing the plan.");
  }
}

function summarizeChunkPlan({ chunks, file, fileBytes, counts, limits, largeReasons }) {
  const largestEstimatedBytes = Math.max(0, ...chunks.map((chunk) => chunk.estimated_payload_bytes || 0));
  const importGroupId = chunks[0]?.metadata?.import_group_id || "";
  console.log("Moraware chunked import plan:", {
    import_group_id: importGroupId,
    source_file: file,
    source_file_bytes: fileBytes,
    source_file_size: humanBytes(fileBytes),
    total_snapshot_counts: counts,
    planned_chunks: chunks.length,
    resume_group_id: String(process.env.MORAWARE_IMPORT_RESUME_GROUP_ID ?? "").trim() || null,
    start_chunk_index: resolveStartChunkIndex(),
    chunks_to_send: chunks.filter((chunk) => Number(chunk.metadata.chunk_index) >= resolveStartChunkIndex()).length,
    largest_estimated_payload_bytes: largestEstimatedBytes,
    largest_estimated_payload_size: humanBytes(largestEstimatedBytes),
    max_payload_bytes: bytesEnv("MORAWARE_IMPORT_MAX_PAYLOAD_BYTES", DEFAULT_MAX_PAYLOAD_BYTES),
    limits,
    large_baseline_reasons: largeReasons
  });
  for (const chunk of chunks) {
    console.log(`Moraware chunk plan ${chunk.metadata.chunk_index}/${chunk.metadata.chunk_count}:`, {
      import_group_id: importGroupId,
      estimated_payload_bytes: chunk.estimated_payload_bytes,
      estimated_payload_size: humanBytes(chunk.estimated_payload_bytes),
      chunk_counts: chunk.metadata.chunk_counts
    });
  }
}

async function postImport({ url, secret, body, label }) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-moraware-sync-secret": secret,
      "x-eos-cron-secret": secret,
      ...(process.env[MORAWARE_POPULATION_LOCK_OWNER_ENV]
        ? { [MORAWARE_POPULATION_LOCK_OWNER_HEADER]: process.env[MORAWARE_POPULATION_LOCK_OWNER_ENV] }
        : {})
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${label} failed: HTTP ${res.status} ${res.statusText} ${JSON.stringify(parsed)}`);
    err.status = res.status;
    err.statusText = res.statusText;
    err.response = parsed;
    err.syncRunId = parsed?.sync_run_id || null;
    throw err;
  }
  return parsed;
}

export function validateChunkedManifest(manifest, { manifestDir } = {}) {
  if (!isChunkedManifest(manifest)) {
    throw new Error("Not a Moraware chunked foundation manifest (missing format/chunks).");
  }
  if (!Number.isInteger(manifest.chunk_count) || manifest.chunk_count < 0) {
    throw new Error("Manifest chunk_count is invalid.");
  }
  if (manifest.chunks.length !== manifest.chunk_count) {
    throw new Error(`Manifest chunk_count ${manifest.chunk_count} does not match chunks.length ${manifest.chunks.length}.`);
  }
  const totals = manifest.totals && typeof manifest.totals === "object" ? manifest.totals : {};
  for (const key of BATCH_KEYS) {
    if (totals[key] == null) throw new Error(`Manifest totals missing ${key}.`);
  }
  const seenIndexes = new Set();
  for (const [i, chunk] of manifest.chunks.entries()) {
    if (!chunk || typeof chunk !== "object") throw new Error(`Manifest chunk ${i + 1} is invalid.`);
    const idx = Number(chunk.chunk_index);
    if (!Number.isInteger(idx) || idx !== i + 1) {
      throw new Error(`Manifest chunks must be in deterministic order; expected chunk_index ${i + 1}, got ${chunk.chunk_index}.`);
    }
    if (seenIndexes.has(idx)) throw new Error(`Duplicate chunk_index ${idx}.`);
    seenIndexes.add(idx);
    if (!chunk.file || String(chunk.file).includes("..") || path.isAbsolute(chunk.file)) {
      throw new Error(`Chunk ${idx} file must be a relative filename inside the manifest directory.`);
    }
  }
  return true;
}

async function sha256File(abs) {
  const buf = await fs.readFile(abs);
  return { buf, sha256: crypto.createHash("sha256").update(buf).digest("hex"), byteSize: buf.length };
}

function addCounts(target, add) {
  for (const key of BATCH_KEYS) target[key] = (Number(target[key]) || 0) + (Number(add?.[key]) || 0);
}

function assertCountsEqual(actual, expected, label) {
  for (const key of BATCH_KEYS) {
    const a = Number(actual[key]) || 0;
    const e = Number(expected[key]) || 0;
    if (a !== e) throw new Error(`${label}: ${key} count mismatch (chunk aggregate ${a} vs manifest ${e}).`);
  }
}

export async function importChunkedManifest({
  manifestAbs,
  manifest,
  dryRun,
  secret,
  url,
  postFn = postImport
}) {
  const manifestDir = path.dirname(manifestAbs);
  validateChunkedManifest(manifest, { manifestDir });
  const maxPayloadBytes = bytesEnv("MORAWARE_IMPORT_MAX_PAYLOAD_BYTES", DEFAULT_MAX_PAYLOAD_BYTES);
  const importGroupId = resolveImportGroupId();
  const startChunkIndex = resolveStartChunkIndex();
  const resumeGroupId = String(process.env.MORAWARE_IMPORT_RESUME_GROUP_ID ?? "").trim();
  if (startChunkIndex > 1 && !resumeGroupId) {
    throw new Error("MORAWARE_IMPORT_START_CHUNK_INDEX > 1 requires MORAWARE_IMPORT_RESUME_GROUP_ID so resumed chunks stay in the original import group.");
  }

  const parentCounts = Object.fromEntries(BATCH_KEYS.map((k) => [k, Number(manifest.totals[k]) || 0]));
  const largeReasons = largeSnapshotReasons({
    body: { metadata: { snapshot_mode: manifest.snapshot_mode }, mode: manifest.mode },
    counts: parentCounts,
    fileBytes: Number(manifest.largest_chunk_bytes) || 0
  });
  assertLargeSnapshotAllowed({ largeReasons, dryRun, chunked: true });
  assertLiveCensusScope(manifest, dryRun);

  console.log("Moraware chunked manifest import starting:", {
    file: manifestAbs,
    url,
    secret_configured: dryRun ? false : secretConfigured(secret),
    organization_id: manifest.organization_id || "(unset)",
    dry_run: dryRun ? "1" : "0",
    import_group_id: importGroupId,
    start_chunk_index: startChunkIndex,
    chunk_count: manifest.chunk_count,
    counts: parentCounts,
    cap_warnings: manifest.cap_warnings || []
  });

  const aggregate = emptyCountBag();
  let httpRequests = 0;
  const results = [];
  let largestValidatedBytes = 0;

  for (const chunkMeta of manifest.chunks) {
    const chunkIndex = Number(chunkMeta.chunk_index);
    const chunkAbs = path.resolve(manifestDir, chunkMeta.file);
    let stat;
    try {
      stat = await fs.stat(chunkAbs);
    } catch {
      throw new Error(`Missing chunk file: ${chunkMeta.file}`);
    }
    const { buf, sha256, byteSize } = await sha256File(chunkAbs);
    if (chunkMeta.sha256 && sha256 !== chunkMeta.sha256) {
      throw new Error(`Checksum mismatch for ${chunkMeta.file}: expected ${chunkMeta.sha256}, got ${sha256}.`);
    }
    if (Number(chunkMeta.byte_size) && byteSize !== Number(chunkMeta.byte_size)) {
      throw new Error(`Byte size mismatch for ${chunkMeta.file}: expected ${chunkMeta.byte_size}, got ${byteSize}.`);
    }
    largestValidatedBytes = Math.max(largestValidatedBytes, byteSize);
    let parsed;
    try {
      parsed = JSON.parse(buf.toString("utf8"));
    } catch (e) {
      throw new Error(`Malformed chunk JSON ${chunkMeta.file}: ${e?.message || e}`);
    }
    const batches = batchRows(parsed);
    const chunkCounts = rowCounts(batches);
    if (chunkMeta.row_counts) {
      assertCountsEqual(chunkCounts, chunkMeta.row_counts, `Chunk ${chunkIndex} row_counts`);
    }
    addCounts(aggregate, chunkCounts);

    const payload = finalizeChunkPayload(
      {
        organization_id: parsed.organization_id || manifest.organization_id,
        mode: parsed.mode || manifest.mode || "baseline_2026-real-snapshot",
        runner: parsed.runner || manifest.runner || "local-chunked-importer"
      },
      batches,
      {
        import_group_id: importGroupId,
        chunk_index: chunkIndex,
        chunk_count: manifest.chunk_count,
        import_status: chunkImportStatus(chunkIndex, manifest.chunk_count),
        import_resumed: Boolean(resumeGroupId),
        resumed_from_chunk_index: startChunkIndex > 1 ? startChunkIndex : null,
        chunk_counts: chunkCounts,
        parent_snapshot_counts: parentCounts,
        max_payload_bytes: maxPayloadBytes,
        chunk_file: chunkMeta.file,
        chunk_sha256: sha256,
        ...censusMetadataFromManifest(manifest)
      }
    );
    const estimated = estimatePayloadBytes(payload);
    if (estimated > maxPayloadBytes) {
      const onlyOneRow = BATCH_KEYS.reduce((n, k) => n + chunkCounts[k], 0) === 1;
      if (!onlyOneRow) {
        throw new Error(
          `Chunk ${chunkIndex} payload ${estimated} bytes exceeds MORAWARE_IMPORT_MAX_PAYLOAD_BYTES=${maxPayloadBytes}.`
        );
      }
      console.warn("Single-row chunk exceeds MORAWARE_IMPORT_MAX_PAYLOAD_BYTES; sending alone:", {
        chunk_index: chunkIndex,
        estimated_payload_bytes: estimated,
        max_payload_bytes: maxPayloadBytes
      });
    }

    const chunkLabel = `Chunk ${chunkIndex}/${manifest.chunk_count}`;
    if (chunkIndex < startChunkIndex) {
      console.log(`${chunkLabel} validated and skipped for resume`, {
        import_group_id: importGroupId,
        start_chunk_index: startChunkIndex
      });
      parsed = null;
      continue;
    }

    if (dryRun) {
      console.log(`${chunkLabel} dry-run ok:`, {
        estimated_payload_bytes: estimated,
        estimated_payload_size: humanBytes(estimated),
        chunk_counts: chunkCounts,
        byte_size: byteSize || stat.size
      });
      parsed = null;
      continue;
    }

    console.log(`${chunkLabel} import starting:`, {
      import_group_id: importGroupId,
      estimated_payload_bytes: estimated,
      chunk_counts: chunkCounts
    });
    try {
      const posted = await postFn({ url, secret, body: payload, label: chunkLabel });
      httpRequests += 1;
      results.push(posted);
      console.log(`${chunkLabel} import complete:`, {
        sync_run_id: posted?.sync_run_id || null,
        status: posted?.status || null,
        row_counts: posted?.row_counts || null
      });
    } catch (e) {
      console.error(`${chunkLabel} import failed:`, {
        import_group_id: importGroupId,
        failed_chunk_index: chunkIndex,
        chunk_count: manifest.chunk_count,
        error: String(e?.message || e)
      });
      console.error(
        "Suggested resume command:",
        [
          `MORAWARE_IMPORT_RESUME_GROUP_ID=${importGroupId}`,
          `MORAWARE_IMPORT_START_CHUNK_INDEX=${chunkIndex}`,
          "MORAWARE_PIPELINE_SKIP_GENERATE=1",
          "MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1",
          "MORAWARE_IMPORT_CHUNKED=1",
          `MORAWARE_SYNC_IMPORT_FILE=${manifestAbs}`,
          "npm run eos:moraware:import-snapshot"
        ].join(" \\\n")
      );
      throw e;
    }
    parsed = null;
  }

  assertCountsEqual(aggregate, parentCounts, "Manifest totals");

  if (dryRun) {
    printOperatorSummary(
      { ...manifest, largest_chunk_bytes: largestValidatedBytes || manifest.largest_chunk_bytes },
      { httpRequests: 0, supabaseWrites: 0, result: "SAFE_TO_IMPORT" }
    );
    console.log("Moraware import dry-run complete: no HTTP requests were sent.");
    return {
      dryRun: true,
      httpRequests: 0,
      supabaseWrites: 0,
      import_group_id: importGroupId,
      counts: parentCounts,
      chunk_count: manifest.chunk_count,
      cap_warnings: manifest.cap_warnings || []
    };
  }

  console.log("Moraware chunked snapshot import complete:", {
    import_group_id: importGroupId,
    chunk_count: manifest.chunk_count,
    http_requests: httpRequests,
    sync_run_ids: results.map((r) => r?.sync_run_id).filter(Boolean)
  });
  return { dryRun: false, httpRequests, results, import_group_id: importGroupId };
}

function emptyCountBag() {
  return Object.fromEntries(BATCH_KEYS.map((key) => [key, 0]));
}

export async function runMorawareSnapshotImport(options = {}) {
  const file = options.file || requiredEnv("MORAWARE_SYNC_IMPORT_FILE");
  const dryRun = options.dryRun ?? envTruthy(process.env.MORAWARE_IMPORT_DRY_RUN);
  const chunkedFlag = dryRun || envTruthy(process.env.MORAWARE_IMPORT_CHUNKED);
  const secret = options.secret ?? pickImportSecret({ dryRun });
  const { abs, fileBytes, json } = await readJsonFile(file);
  const url = options.url || `${backendBase()}/api/internal/moraware-sync/import`;
  const postFn = options.postFn || postImport;
  const usesInjectedPostFn = Boolean(options.postFn);

  return withStandalonePopulationLock({ dryRun, usesInjectedPostFn }, async () => {
    if (isChunkedManifest(json)) {
      assertLiveCensusScope(json, dryRun);
      return importChunkedManifest({
        manifestAbs: abs,
        manifest: json,
        dryRun,
        secret,
        url,
        postFn
      });
    }

    const body = normalizePayload(json);
    assertLiveCensusScope(
      {
        census_scope: body?.metadata?.census_scope,
        snapshot_mode: body?.metadata?.snapshot_mode,
        mode: body?.mode,
        metadata: body?.metadata
      },
      dryRun
    );
    body.metadata = {
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      ...censusMetadataFromManifest({
        census_scope: body?.metadata?.census_scope,
        snapshot_mode: body?.metadata?.snapshot_mode,
        mode: body?.mode,
        metadata: body?.metadata,
        cap_warnings: body?.metadata?.cap_warnings,
        baseline_start_date: body?.metadata?.baseline_start_date,
        baseline_end_date: body?.metadata?.baseline_end_date
      })
    };
  const counts = rowCounts(batchRows(body));
  const largeReasons = largeSnapshotReasons({ body, counts, fileBytes });
  assertLargeSnapshotAllowed({ largeReasons, dryRun, chunked: chunkedFlag });
  console.log("Moraware snapshot import starting:", {
    file: abs,
    file_bytes: fileBytes,
    file_size: humanBytes(fileBytes),
    url,
    secret_configured: dryRun ? false : secretConfigured(secret),
    organization_id: body.organization_id || "(unset)",
    dry_run: dryRun ? "1" : "0",
    chunked: chunkedFlag ? "1" : "0",
    allow_large_baseline: envTruthy(process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE) ? "1" : "0",
    counts
  });

  if (chunkedFlag) {
    const importGroupId = resolveImportGroupId();
    const startChunkIndex = resolveStartChunkIndex();
    const resumeGroupId = String(process.env.MORAWARE_IMPORT_RESUME_GROUP_ID ?? "").trim();
    if (startChunkIndex > 1 && !resumeGroupId) {
      throw new Error("MORAWARE_IMPORT_START_CHUNK_INDEX > 1 requires MORAWARE_IMPORT_RESUME_GROUP_ID so resumed chunks stay in the original import group.");
    }
    const chunks = buildChunkPayloads(body, {
      importGroupId,
      resumeGroupId,
      startChunkIndex,
      largeBaseline: largeReasons.length > 0,
      sizeAware: largeReasons.length > 0 || hasEnvValue("MORAWARE_IMPORT_MAX_PAYLOAD_BYTES")
    });
    summarizeChunkPlan({
      chunks,
      file: abs,
      fileBytes,
      counts,
      limits: chunkLimits({ largeBaseline: largeReasons.length > 0 }),
      largeReasons
    });

    if (dryRun) {
      console.log("Moraware import dry-run complete: no HTTP requests were sent.");
      return { dryRun: true, httpRequests: 0, planned_chunks: chunks.length, counts };
    }

    const results = [];
    for (const [i, chunk] of chunks.entries()) {
      const chunkIndex = Number(chunk.metadata.chunk_index) || i + 1;
      const chunkLabel = `Chunk ${chunkIndex}/${chunks.length}`;
      if (chunkIndex < startChunkIndex) {
        console.log(`${chunkLabel} skipped for resume`, {
          import_group_id: chunk.metadata.import_group_id,
          start_chunk_index: startChunkIndex
        });
        continue;
      }
      console.log(`${chunkLabel} import starting:`, {
        import_group_id: chunk.metadata.import_group_id,
        estimated_payload_bytes: chunk.estimated_payload_bytes,
        estimated_payload_size: humanBytes(chunk.estimated_payload_bytes),
        chunk_counts: chunk.metadata.chunk_counts
      });
      try {
        const parsed = await postFn({ url, secret, body: chunk, label: chunkLabel });
        results.push(parsed);
        console.log(`${chunkLabel} import complete:`, {
          sync_run_id: parsed?.sync_run_id || null,
          status: parsed?.status || null,
          row_counts: parsed?.row_counts || null,
          data_quality_findings: parsed?.data_quality_findings ?? null
        });
      } catch (e) {
        console.error(`${chunkLabel} import failed:`, {
          import_group_id: chunk.metadata.import_group_id,
          failed_chunk_index: chunkIndex,
          chunk_count: chunks.length,
          sync_run_id: e?.syncRunId || e?.response?.sync_run_id || null,
          chunk_counts: chunk.metadata.chunk_counts,
          error: String(e?.message || e)
        });
        throw e;
      }
    }
    return { dryRun: false, results, import_group_id: chunks[0]?.metadata?.import_group_id };
  }

  const parsed = await postFn({ url, secret, body, label: "Import" });
  console.log("Moraware snapshot import complete:", JSON.stringify(parsed, null, 2));
  return parsed;
  });
}

async function main() {
  await runMorawareSnapshotImport();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    console.error(e?.stack || e);
    process.exitCode = 1;
  });
}
