import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const BATCH_KEYS = ["accounts", "jobs", "job_activities", "job_forms", "job_files", "assignees"];

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

async function readJsonFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(abs, "utf8");
  return { abs, json: JSON.parse(text) };
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

function chunkLimits() {
  return {
    accounts: Number.POSITIVE_INFINITY,
    jobs: intEnv("MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK", 20),
    job_activities: intEnv("MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK", 100),
    job_forms: intEnv("MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK", 100),
    job_files: intEnv("MORAWARE_IMPORT_MAX_FILES_PER_CHUNK", 50),
    assignees: intEnv("MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK", 50)
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

function buildChunkPayloads(body) {
  const rows = batchRows(body);
  const limits = chunkLimits();
  const parentSnapshotCounts = rowCounts(rows);
  const entityChunkCounts = BATCH_KEYS.map((key) => {
    if (key === "accounts") return rows.accounts.length > 0 ? 1 : 0;
    const limit = limits[key];
    if (!Number.isFinite(limit) || limit <= 0) return rows[key].length > 0 ? 1 : 0;
    return Math.ceil(rows[key].length / limit);
  });
  const chunkCount = Math.max(1, ...entityChunkCounts);
  const importGroupId = crypto.randomUUID();

  return Array.from({ length: chunkCount }, (_, chunkIndex) => {
    const chunkBody = { ...body };
    for (const key of BATCH_KEYS) delete chunkBody[key];
    const batches = Object.fromEntries(
      BATCH_KEYS.map((key) => [key, sliceChunk(rows, key, chunkIndex, limits[key])])
    );
    const chunkCounts = rowCounts(batches);
    return {
      ...chunkBody,
      batches,
      metadata: {
        ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        import_group_id: importGroupId,
        chunk_index: chunkIndex + 1,
        chunk_count: chunkCount,
        chunk_counts: chunkCounts,
        parent_snapshot_counts: parentSnapshotCounts
      }
    };
  });
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
    throw new Error(`${label} failed: HTTP ${res.status} ${res.statusText} ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function main() {
  const file = requiredEnv("MORAWARE_SYNC_IMPORT_FILE");
  const secret = requiredEnv("MORAWARE_SYNC_IMPORT_SECRET");
  const { abs, json } = await readJsonFile(file);
  const body = normalizePayload(json);
  const url = `${backendBase()}/api/internal/moraware-sync/import`;

  const counts = rowCounts(batchRows(body));
  console.log("Moraware snapshot import starting:", {
    file: abs,
    url,
    secret: redact(secret),
    organization_id: body.organization_id || "(unset)",
    chunked: envTruthy(process.env.MORAWARE_IMPORT_CHUNKED) ? "1" : "0",
    counts
  });

  if (envTruthy(process.env.MORAWARE_IMPORT_CHUNKED)) {
    const chunks = buildChunkPayloads(body);
    console.log("Moraware chunked import plan:", {
      import_group_id: chunks[0]?.metadata?.import_group_id,
      chunk_count: chunks.length,
      limits: chunkLimits(),
      parent_snapshot_counts: chunks[0]?.metadata?.parent_snapshot_counts
    });
    const results = [];
    for (const [i, chunk] of chunks.entries()) {
      const chunkLabel = `Chunk ${i + 1}/${chunks.length}`;
      console.log(`${chunkLabel} import starting:`, {
        import_group_id: chunk.metadata.import_group_id,
        chunk_counts: chunk.metadata.chunk_counts
      });
      const parsed = await postImport({ url, secret, body: chunk, label: chunkLabel });
      results.push(parsed);
      console.log(`${chunkLabel} import complete:`, JSON.stringify(parsed, null, 2));
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
