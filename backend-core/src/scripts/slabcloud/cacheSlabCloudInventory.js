#!/usr/bin/env node
/**
 * SlabCloud Inventory → Supabase cache (write-gated).
 *
 * DEFAULT: dry-run. NO Supabase writes occur unless SLABCLOUD_CACHE_WRITE_ENABLED=1.
 *
 * In dry-run mode this fetches + normalizes (read-only) and reports would_write
 * counts without touching Supabase. In write mode it persists to the cache tables
 * created by backend-core/supabase/eliteos_slabcloud_inventory_cache.sql.
 *
 * Safety:
 *   - Read-only SlabCloud access (no cookies/auth, GET only).
 *   - No writeback to SlabCloud/Slabsmith. No deletes. No inactive marking.
 *   - Fails loudly if writes are enabled but org id / service-role config missing.
 *
 * Env vars:
 *   SLABCLOUD_BASE_URL             default https://slabcloud.com
 *   SLABCLOUD_COMPANY_CODE         default kbyd (legacy alias for SLABCLOUD_API_COMPANY_CODE)
 *   SLABCLOUD_API_COMPANY_CODE     default kbyd (preferred; falls back to SLABCLOUD_COMPANY_CODE)
 *   SLABCLOUD_ASSET_COMPANY_CODE   default same as SLABCLOUD_API_COMPANY_CODE
 *   SLABCLOUD_PUBLIC_SLUG          default esf (public URL slug; not used in API requests)
 *   SLABCLOUD_INVENTORY_SCOPE      default slab
 *     Options: slab    → type=Slab&edges=true (historic default, ~145 ESF rows)
 *              remnant → type=Remnant&edges=true (~689 ESF rows)
 *              all     → no type param, edges=true (~742 ESF rows — type unknown)
 *              typed   → TWO fetches: Slab lane + Remnant lane, merged.
 *                        Each record gets source_inventory_type = Slab or Remnant.
 *                        Duplicate SlabID detection runs before any write.
 *   SLABCLOUD_TYPE                 explicit type= override (ignored when SLABCLOUD_INVENTORY_SCOPE set)
 *   SLABCLOUD_FETCH_DETAILS        default 1
 *   SLABCLOUD_CONCURRENCY          default 2
 *   SLABCLOUD_MAX_DETAILS          optional cap
 *   SLABCLOUD_TIMEOUT_MS           default 15000
 *   SLABCLOUD_CACHE_WRITE_ENABLED  default off — must be "1" to write
 *   SLABCLOUD_ORGANIZATION_ID      required only when writing
 *   SUPABASE_URL                   required only when writing
 *   SUPABASE_SERVICE_ROLE_KEY      required only when writing
 *
 * IMPORTANT: Scope upgrade SQL (eliteos_slabcloud_inventory_scope_upgrade.sql)
 * MUST be applied before any write-enabled all/typed sync. Upsert payloads
 * include new scope columns that require those DB columns to exist.
 *
 * TYPED MODE SAFETY: If duplicate SlabIDs exist across Slab and Remnant lanes,
 * write-enabled typed sync ABORTS before any write. Dry-run reports the overlap.
 *
 * Examples:
 *   # Dry-run slab-only (safe, no writes — existing behavior)
 *   SLABCLOUD_COMPANY_CODE=kbyd npm run eos:slabcloud:cache
 *
 *   # Dry-run typed (safe, no writes — Slab+Remnant with type classification)
 *   SLABCLOUD_INVENTORY_SCOPE=typed SLABCLOUD_API_COMPANY_CODE=kbyd \
 *     SLABCLOUD_ASSET_COMPANY_CODE=kbyd SLABCLOUD_PUBLIC_SLUG=esf \
 *     npm run eos:slabcloud:cache
 *
 *   # Dry-run all-scope (safe, no writes — full catalog, type unknown)
 *   SLABCLOUD_INVENTORY_SCOPE=all SLABCLOUD_API_COMPANY_CODE=kbyd \
 *     SLABCLOUD_ASSET_COMPANY_CODE=kbyd SLABCLOUD_PUBLIC_SLUG=esf \
 *     npm run eos:slabcloud:cache
 */
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildClientConfig } from "../../slabcloud/slabCloudClient.js";
import { runSlabCloudInventorySync } from "../../slabcloud/slabCloudSync.js";
import { isCacheWriteEnabled } from "../../slabcloud/slabCloudPersistence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function envBool(name, fallback) {
  const v = env(name, fallback);
  return v === "1" || v.toLowerCase() === "true";
}

function envInt(name, fallback) {
  const v = env(name, "");
  if (v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Create a service-role Supabase client. Imported lazily so dry-run never needs
 * Supabase configured. Throws loudly if required config is missing.
 */
async function createServiceRoleClient() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("Write enabled but SUPABASE_URL is missing.");
  if (!key) throw new Error("Write enabled but SUPABASE_SERVICE_ROLE_KEY is missing.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  // Resolve API company code with legacy fallback.
  const apiCompanyCode =
    env("SLABCLOUD_API_COMPANY_CODE") || env("SLABCLOUD_COMPANY_CODE", "kbyd");
  const assetCompanyCode = env("SLABCLOUD_ASSET_COMPANY_CODE") || apiCompanyCode;
  const publicSlug = env("SLABCLOUD_PUBLIC_SLUG", "esf");
  const inventoryScope = env("SLABCLOUD_INVENTORY_SCOPE", "slab");

  // Build config. When SLABCLOUD_INVENTORY_SCOPE is set, it drives the type= param
  // (or absence thereof for "all"). Legacy SLABCLOUD_TYPE is accepted as a fallback
  // but is overridden by inventoryScope when both are set.
  const config = buildClientConfig({
    baseUrl: env("SLABCLOUD_BASE_URL", "https://slabcloud.com"),
    companyCode: apiCompanyCode,
    apiCompanyCode,
    assetCompanyCode,
    publicSlug,
    inventoryScope,
    timeoutMs: envInt("SLABCLOUD_TIMEOUT_MS", 15000),
  });

  const fetchDetails = envBool("SLABCLOUD_FETCH_DETAILS", "1");
  const maxDetails = envInt("SLABCLOUD_MAX_DETAILS", 0);
  const concurrency = Math.max(1, envInt("SLABCLOUD_CONCURRENCY", 2));
  const writeEnabled = isCacheWriteEnabled();
  const organizationId = env("SLABCLOUD_ORGANIZATION_ID") || null;

  console.log("SlabCloud inventory → Supabase cache");
  console.log(`  Base URL:            ${config.baseUrl}`);
  console.log(`  API company code:    ${config.apiCompanyCode}`);
  console.log(`  Asset company code:  ${config.assetCompanyCode}`);
  console.log(`  Public slug:         ${config.publicSlug}`);
  console.log(`  Inventory scope:     ${config.inventoryScope}  (type param: ${config.type ?? "(none — all inventory)"})`);
  console.log(`  Fetch detail:        ${fetchDetails ? "yes" : "no"}${maxDetails ? ` (cap ${maxDetails})` : ""}`);
  console.log(`  Concurrency:         ${concurrency}`);
  console.log(`  Write mode:          ${writeEnabled ? "ENABLED (will write to Supabase)" : "dry-run (no writes)"}`);

  if (writeEnabled && (config.inventoryScope === "all" || config.inventoryScope === "typed")) {
    console.log(
      "  ⚠  Ensure eliteos_slabcloud_inventory_scope_upgrade.sql is applied before write."
    );
  }
  if (config.inventoryScope === "typed") {
    console.log("  ℹ  Typed mode: fetches Slab lane + Remnant lane separately with type tagging.");
    console.log("     Write-enabled typed sync aborts if duplicate SlabIDs exist across lanes.");
  }

  // Fail loudly if writes are enabled but prerequisites are missing.
  let db = null;
  if (writeEnabled) {
    if (!organizationId) {
      console.error("FATAL: SLABCLOUD_CACHE_WRITE_ENABLED=1 but SLABCLOUD_ORGANIZATION_ID is missing.");
      process.exit(1);
    }
    try {
      db = await createServiceRoleClient();
    } catch (err) {
      console.error(`FATAL: ${err?.message || String(err)}`);
      process.exit(1);
    }
    console.log(`  Org id:              ${organizationId}`);
  }

  const result = await runSlabCloudInventorySync({
    config,
    fetchDetails,
    maxDetails,
    concurrency,
    organizationId,
    db,
    writeEnabled,
  });

  const p = result.persistence;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(repoRoot, "debug/slabcloud");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `slabcloud-cache-${p.mode}-${stamp}.json`);

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: p.mode,
    writeEnabled: p.writeEnabled,
    organizationId: organizationId ?? null,
    inventoryScope: config.inventoryScope,
    apiCompanyCode: config.apiCompanyCode,
    assetCompanyCode: config.assetCompanyCode,
    publicSlug: config.publicSlug,
    typeParam: config.type ?? null,
    endpoints: result.endpoints,
    fetch: result.fetch,
    normalizedCount: result.normalizedCount,
    typeBreakdown: result.typeBreakdown ?? {},
    overlapResult: result.overlapResult ?? null,
    counts: p.counts,
    wouldWrite: p.wouldWrite,
    written: p.written,
    syncRunId: p.syncRunId,
    warnings: result.warnings,
  };
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const breakdown = result.typeBreakdown ?? {};
  const breakdownStr = Object.entries(breakdown)
    .map(([t, n]) => `${t}:${n}`)
    .join(", ") || "n/a";

  const overlap = result.overlapResult ?? null;

  console.log("");
  console.log(`  Mode:               ${p.mode}`);
  console.log(`  Inventory scope:    ${config.inventoryScope}`);
  console.log(`  Normalized records: ${result.normalizedCount}`);
  console.log(`  Type breakdown:     ${breakdownStr}`);
  if (overlap) {
    console.log(`  Slab lane:          ${overlap.typed_slab_record_count} records`);
    console.log(`  Remnant lane:       ${overlap.typed_remnant_record_count} records`);
    console.log(`  Distinct SlabIDs:   ${overlap.typed_distinct_slab_id_count}`);
    if (overlap.typed_duplicate_slab_id_count > 0) {
      console.log(
        `  ⚠  DUPLICATE SlabIDs across lanes: ${overlap.typed_duplicate_slab_id_count}` +
          ` — sample: ${overlap.typed_duplicate_slab_id_sample.slice(0, 3).join(", ")}`
      );
    } else {
      console.log(`  Overlap:            none (clean — safe to write)`);
    }
  }
  console.log(`  Distinct colors:    ${p.counts.distinctColorCount}`);
  console.log(`  Distinct materials: ${p.counts.distinctMaterialCount}`);
  if (p.mode === "write") {
    console.log(`  Sync run id:        ${p.syncRunId}`);
    console.log(`  Raw written:        ${p.written.rawRecords}`);
    console.log(`  Inventory upserted: ${p.written.slabInventory}`);
    console.log(`  Materials upserted: ${p.written.slabMaterials}`);
    console.log(`  Images upserted:    ${p.written.slabImages}`);
  } else {
    console.log(`  Would write — sync runs:   ${p.wouldWrite.syncRuns}`);
    console.log(`  Would write — raw records: ${p.wouldWrite.rawRecords}`);
    console.log(`  Would write — inventory:   ${p.wouldWrite.slabInventory}`);
    console.log(`  Would write — materials:   ${p.wouldWrite.slabMaterials}`);
    console.log(`  Would write — images:      ${p.wouldWrite.slabImages}`);
  }
  console.log(`  Warnings:           ${result.warnings.length}`);
  console.log(`  Output:             ${outPath}`);
  if (p.mode !== "write") {
    console.log("No Supabase writes were performed (set SLABCLOUD_CACHE_WRITE_ENABLED=1 to write).");
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err?.stack || String(err));
  process.exit(1);
});
