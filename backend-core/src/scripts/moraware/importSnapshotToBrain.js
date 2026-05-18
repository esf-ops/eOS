import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const BATCH_KEYS = ["accounts", "jobs", "job_activities", "job_forms", "job_files", "assignees"];
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

function redact(raw) {
  const s = String(raw ?? "");
  if (!s) return "";
  return s.length <= 8 ? "[REDACTED]" : `${s.slice(0, 4)}...${s.slice(-4)}`;
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
      "x-moraware-sync-secret": secret
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

async function main() {
  const file = requiredEnv("MORAWARE_SYNC_IMPORT_FILE");
  const dryRun = envTruthy(process.env.MORAWARE_IMPORT_DRY_RUN);
  const chunked = dryRun || envTruthy(process.env.MORAWARE_IMPORT_CHUNKED);
  const secret = dryRun ? "" : requiredEnv("MORAWARE_SYNC_IMPORT_SECRET");
  const { abs, fileBytes, json } = await readJsonFile(file);
  const body = normalizePayload(json);
  const url = `${backendBase()}/api/internal/moraware-sync/import`;

  const counts = rowCounts(batchRows(body));
  const largeReasons = largeSnapshotReasons({ body, counts, fileBytes });
  assertLargeSnapshotAllowed({ largeReasons, dryRun, chunked });
  console.log("Moraware snapshot import starting:", {
    file: abs,
    file_bytes: fileBytes,
    file_size: humanBytes(fileBytes),
    url,
    secret: dryRun ? "(not required for dry-run)" : redact(secret),
    organization_id: body.organization_id || "(unset)",
    dry_run: dryRun ? "1" : "0",
    chunked: chunked ? "1" : "0",
    allow_large_baseline: envTruthy(process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE) ? "1" : "0",
    counts
  });

  if (chunked) {
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
      return;
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
        const parsed = await postImport({ url, secret, body: chunk, label: chunkLabel });
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
        console.error(
          "Suggested resume command:",
          [
            `MORAWARE_IMPORT_RESUME_GROUP_ID=${chunk.metadata.import_group_id}`,
            `MORAWARE_IMPORT_START_CHUNK_INDEX=${chunkIndex}`,
            "MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1",
            "MORAWARE_IMPORT_CHUNKED=1",
            `MORAWARE_IMPORT_MAX_PAYLOAD_BYTES=${bytesEnv("MORAWARE_IMPORT_MAX_PAYLOAD_BYTES", DEFAULT_MAX_PAYLOAD_BYTES)}`,
            `MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK=${chunkLimits({ largeBaseline: largeReasons.length > 0 }).jobs}`,
            `MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK=${chunkLimits({ largeBaseline: largeReasons.length > 0 }).job_activities}`,
            `MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK=${chunkLimits({ largeBaseline: largeReasons.length > 0 }).job_forms}`,
            `MORAWARE_IMPORT_MAX_FILES_PER_CHUNK=${chunkLimits({ largeBaseline: largeReasons.length > 0 }).job_files}`,
            `MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK=${chunkLimits({ largeBaseline: largeReasons.length > 0 }).assignees}`,
            `MORAWARE_SYNC_IMPORT_FILE=${file}`,
            "npm run eos:moraware:import-snapshot"
          ].join(" \\\n")
        );
        throw e;
      }
    }
    console.log(
      "Moraware chunked snapshot import complete:",
      JSON.stringify(
        {
          import_group_id: chunks[0]?.metadata?.import_group_id,
          chunk_count: chunks.length,
          sync_run_ids: results.map((r) => r?.sync_run_id).filter(Boolean),
          results
        },
        null,
        2
      )
    );
    return;
  }

  const parsed = await postImport({ url, secret, body, label: "Import" });
  console.log("Moraware snapshot import complete:", JSON.stringify(parsed, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
