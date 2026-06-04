#!/usr/bin/env node
/**
 * SlabCloud image URL verification (backend-only, write-gated).
 *
 * Reads slab_images rows for an organization and verifies the guessed image /
 * thumbnail URLs with HEAD (lightweight Range GET fallback only if HEAD is
 * unsupported). NEVER downloads image bytes. Updates only slab_images.image_status
 * and timestamps — and ONLY when SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED=1.
 *
 * Reading Supabase requires org id + service-role config (even in dry-run).
 *
 * Env vars:
 *   SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED  default off — must be "1" to update DB
 *   SLABCLOUD_ORGANIZATION_ID             required (Supabase read scope)
 *   SUPABASE_URL                          required
 *   SUPABASE_SERVICE_ROLE_KEY             required
 *   SLABCLOUD_IMAGE_VERIFY_LIMIT          default 50
 *   SLABCLOUD_IMAGE_VERIFY_CONCURRENCY    default 3
 *   SLABCLOUD_IMAGE_VERIFY_STATUS         default unknown ("all" = no filter)
 *   SLABCLOUD_IMAGE_VERIFY_KIND           default thumbnail-first
 *   SLABCLOUD_IMAGE_VERIFY_TIMEOUT_MS     default 15000
 *
 * Examples:
 *   # Dry-run (checks URLs, no DB writes)
 *   SLABCLOUD_ORGANIZATION_ID=<org-uuid> npm run eos:slabcloud:verify-images
 *
 *   # Write-enabled (run only after review)
 *   SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED=1 SLABCLOUD_ORGANIZATION_ID=<org-uuid> \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     SLABCLOUD_IMAGE_VERIFY_LIMIT=50 npm run eos:slabcloud:verify-images
 */
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifySlabCloudImages,
  isImageVerifyWriteEnabled,
  DEFAULT_VERIFY_LIMIT,
  DEFAULT_VERIFY_CONCURRENCY,
  DEFAULT_VERIFY_STATUS,
  DEFAULT_VERIFY_KIND,
  DEFAULT_VERIFY_TIMEOUT_MS,
} from "../../slabcloud/slabCloudImageVerification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function envInt(name, fallback) {
  const v = env(name, "");
  if (v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function createServiceRoleClient() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("SUPABASE_URL is missing.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  const writeEnabled = isImageVerifyWriteEnabled();
  const organizationId = env("SLABCLOUD_ORGANIZATION_ID");
  const limit = envInt("SLABCLOUD_IMAGE_VERIFY_LIMIT", DEFAULT_VERIFY_LIMIT);
  const concurrency = Math.max(1, envInt("SLABCLOUD_IMAGE_VERIFY_CONCURRENCY", DEFAULT_VERIFY_CONCURRENCY));
  const statusFilter = env("SLABCLOUD_IMAGE_VERIFY_STATUS", DEFAULT_VERIFY_STATUS);
  const kind = env("SLABCLOUD_IMAGE_VERIFY_KIND", DEFAULT_VERIFY_KIND);
  const timeoutMs = envInt("SLABCLOUD_IMAGE_VERIFY_TIMEOUT_MS", DEFAULT_VERIFY_TIMEOUT_MS);

  console.log("SlabCloud image URL verification");
  console.log(`  Write mode:   ${writeEnabled ? "ENABLED (will update slab_images)" : "dry-run (no DB writes)"}`);
  console.log(`  Status filter: ${statusFilter}`);
  console.log(`  Kind:          ${kind}`);
  console.log(`  Limit:         ${limit}`);
  console.log(`  Concurrency:   ${concurrency}`);

  if (!organizationId) {
    console.error("FATAL: SLABCLOUD_ORGANIZATION_ID is required (Supabase read scope).");
    process.exit(1);
  }

  let db;
  try {
    db = await createServiceRoleClient();
  } catch (err) {
    console.error(`FATAL: ${err?.message || String(err)}`);
    process.exit(1);
  }
  console.log(`  Org id:        ${organizationId}`);

  const result = await verifySlabCloudImages({
    db,
    organizationId,
    statusFilter,
    kind,
    limit,
    concurrency,
    timeoutMs,
    writeEnabled,
  });

  const outDir = path.join(repoRoot, "debug/slabcloud");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "slabcloud-image-verify-summary.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    mode: result.mode,
    writeEnabled: result.writeEnabled,
    organizationId,
    statusFilter,
    kind,
    limit,
    concurrency,
    rowCount: result.rowCount,
    counts: result.counts,
    sampleResults: result.results.slice(0, 20),
  };
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const c = result.counts;
  console.log("");
  console.log(`  Rows loaded:   ${result.rowCount}`);
  console.log(`  checked:       ${c.checked}`);
  console.log(`  ok:            ${c.ok}`);
  console.log(`  missing:       ${c.missing}`);
  console.log(`  error:         ${c.error}`);
  console.log(`  skipped:       ${c.skipped}`);
  console.log(`  written:       ${c.written}`);
  console.log(`  write_enabled: ${result.writeEnabled}`);
  console.log(`  Output:        ${outPath}`);
  if (!result.writeEnabled) {
    console.log("No slab_images updates were performed (set SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED=1 to write).");
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err?.stack || String(err));
  process.exit(1);
});
