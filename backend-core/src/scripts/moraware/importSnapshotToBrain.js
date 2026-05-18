import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

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

async function main() {
  const file = requiredEnv("MORAWARE_SYNC_IMPORT_FILE");
  const secret = requiredEnv("MORAWARE_SYNC_IMPORT_SECRET");
  const { abs, json } = await readJsonFile(file);
  const body = normalizePayload(json);
  const url = `${backendBase()}/api/internal/moraware-sync/import`;

  const counts = Object.fromEntries(
    Object.entries(body.batches || body)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, v.length])
  );
  console.log("Moraware snapshot import starting:", {
    file: abs,
    url,
    secret: redact(secret),
    organization_id: body.organization_id || "(unset)",
    counts
  });

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
    throw new Error(`Import failed: HTTP ${res.status} ${res.statusText} ${JSON.stringify(parsed)}`);
  }
  console.log("Moraware snapshot import complete:", JSON.stringify(parsed, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
