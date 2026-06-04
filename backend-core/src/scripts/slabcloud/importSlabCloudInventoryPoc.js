#!/usr/bin/env node
/**
 * SlabCloud Inventory — read-only dry-run POC.
 *
 * Pulls slab inventory from the observed SlabCloud JSON endpoints, normalizes
 * the records, and writes local JSON files. It NEVER writes to Supabase, NEVER
 * writes back to SlabCloud/Slabsmith, NEVER uses cookies/auth, and NEVER scrapes
 * HTML. Image URLs are guessed but not downloaded unless explicitly enabled.
 *
 * Env vars (all optional):
 *   SLABCLOUD_BASE_URL       default https://slabcloud.com
 *   SLABCLOUD_COMPANY_CODE   default kbyd       (configurable company code)
 *   SLABCLOUD_TYPE           default Slab
 *   SLABCLOUD_FETCH_DETAILS  default 1          (fetch per-color detail records)
 *   SLABCLOUD_MAX_DETAILS    optional cap on number of detail fetches
 *   SLABCLOUD_CONCURRENCY    default 2          (detail/image fetch concurrency)
 *   SLABCLOUD_VERIFY_IMAGES  default 0          (HEAD-probe guessed image URLs)
 *   SLABCLOUD_TIMEOUT_MS     default 15000
 *
 * Output:
 *   debug/slabcloud/slabcloud-inventory-dry-run.json
 *   debug/slabcloud/slabcloud-inventory-summary.json
 *
 * Example (safe, capped):
 *   SLABCLOUD_COMPANY_CODE=kbyd SLABCLOUD_MAX_DETAILS=10 npm run eos:slabcloud:inventory-poc
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildClientConfig,
  buildMaterialsUrl,
  buildSlabSummaryUrl,
  buildSlabDetailUrl,
  fetchMaterials,
  fetchSlabSummary,
  fetchSlabDetail,
  probeImage,
  buildRequestHeaders,
  mapWithConcurrency,
} from "../../slabcloud/slabCloudClient.js";
import {
  normalizeSlabRecords,
  extractDistinctColorNames,
  summarizeInventory,
} from "../../slabcloud/normalizeSlabCloudInventory.js";

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

async function main() {
  const config = buildClientConfig({
    baseUrl: env("SLABCLOUD_BASE_URL", "https://slabcloud.com"),
    companyCode: env("SLABCLOUD_COMPANY_CODE", "kbyd"),
    type: env("SLABCLOUD_TYPE", "Slab"),
    timeoutMs: envInt("SLABCLOUD_TIMEOUT_MS", 15000),
  });

  const fetchDetails = envBool("SLABCLOUD_FETCH_DETAILS", "1");
  const maxDetails = envInt("SLABCLOUD_MAX_DETAILS", 0); // 0 = no cap
  const concurrency = Math.max(1, envInt("SLABCLOUD_CONCURRENCY", 2));
  const verifyImages = envBool("SLABCLOUD_VERIFY_IMAGES", "0");

  const warnings = [];
  const normalizeOpts = { baseUrl: config.baseUrl, companyCode: config.companyCode };

  console.log("SlabCloud inventory POC (read-only dry-run)");
  console.log(`  Base URL:     ${config.baseUrl}`);
  console.log(`  Company code: ${config.companyCode}`);
  console.log(`  Type:         ${config.type}`);
  console.log(`  Fetch detail: ${fetchDetails ? "yes" : "no"}${maxDetails ? ` (cap ${maxDetails})` : ""}`);
  console.log(`  Concurrency:  ${concurrency}`);
  console.log(`  Verify imgs:  ${verifyImages ? "yes" : "no"}`);

  // 1) Materials (non-fatal if it fails).
  let materials = [];
  try {
    materials = await fetchMaterials(config);
  } catch (err) {
    warnings.push(`materials fetch failed: ${err?.message || String(err)}`);
  }

  // 2) Slab/color summary list. This is the backbone — fatal if it cannot load.
  let summaryRaw = [];
  try {
    summaryRaw = await fetchSlabSummary(config);
  } catch (err) {
    console.error(`FATAL: could not fetch slab summary list: ${err?.message || String(err)}`);
    console.error("Aborting without writing output (initial summary list is required).");
    process.exit(1);
  }

  // 3) Optional per-color detail fetches.
  let detailRecordsRaw = [];
  let detailColorNames = [];
  if (fetchDetails) {
    let names = extractDistinctColorNames(summaryRaw);
    if (maxDetails > 0) names = names.slice(0, maxDetails);
    detailColorNames = names;

    const perName = await mapWithConcurrency(names, concurrency, async (name) => {
      try {
        const rows = await fetchSlabDetail(name, config);
        return { name, rows, ok: true };
      } catch (err) {
        warnings.push(`detail fetch failed for "${name}": ${err?.message || String(err)}`);
        return { name, rows: [], ok: false };
      }
    });
    for (const r of perName) detailRecordsRaw.push(...r.rows);
  }

  // The primary normalized set: prefer detail records when available, else fall
  // back to the summary list so we always emit something useful.
  const primaryRaw = detailRecordsRaw.length > 0 ? detailRecordsRaw : summaryRaw;
  const usedSource = detailRecordsRaw.length > 0 ? "detail" : "summary";
  const normalized = normalizeSlabRecords(primaryRaw, normalizeOpts);

  // 4) Optional, best-effort image verification (HEAD only, never fatal).
  if (verifyImages) {
    const headers = buildRequestHeaders({ userAgent: config.userAgent });
    await mapWithConcurrency(normalized, concurrency, async (rec) => {
      if (!rec.image_url_guess) {
        rec.image_status = "unknown";
        return;
      }
      rec.image_status = await probeImage(rec.image_url_guess, {
        headers,
        timeoutMs: config.timeoutMs,
        fetchImpl: config.fetchImpl,
      });
    });
  } else {
    for (const rec of normalized) rec.image_status = "unknown";
  }

  const summary = summarizeInventory(normalized, { warnings, materials });

  const endpoints = {
    materials: buildMaterialsUrl(config),
    slabSummary: buildSlabSummaryUrl(config),
    detailExample: buildSlabDetailUrl({ ...config, name: detailColorNames[0] || "Alabaster" }),
  };

  const generatedAt = new Date().toISOString();
  const outDir = path.join(repoRoot, "debug/slabcloud");
  await fs.mkdir(outDir, { recursive: true });

  const dryRunPath = path.join(outDir, "slabcloud-inventory-dry-run.json");
  const summaryPath = path.join(outDir, "slabcloud-inventory-summary.json");

  const dryRunPayload = {
    generatedAt,
    mode: "read-only-dry-run",
    config: {
      baseUrl: config.baseUrl,
      companyCode: config.companyCode,
      type: config.type,
      fetchDetails,
      maxDetails: maxDetails || null,
      concurrency,
      verifyImages,
    },
    endpoints,
    usedSource,
    summary,
    warnings,
    materials,
    detailColorNames,
    slabs: normalized,
  };

  const summaryPayload = {
    generatedAt,
    mode: "read-only-dry-run",
    companyCode: config.companyCode,
    usedSource,
    endpoints,
    summary,
    warnings,
    sampleSlabs: normalized.slice(0, 5).map((r) => ({
      external_slab_id: r.external_slab_id,
      color_name: r.color_name,
      material_name: r.material_name,
      thickness_nominal: r.thickness_nominal,
      width_actual_in: r.width_actual_in,
      length_actual_in: r.length_actual_in,
      count_for_color: r.count_for_color,
      image_status: r.image_status,
    })),
  };

  await fs.writeFile(dryRunPath, `${JSON.stringify(dryRunPayload, null, 2)}\n`, "utf8");
  await fs.writeFile(summaryPath, `${JSON.stringify(summaryPayload, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`  Materials rows:     ${summary.materialsEndpointCount}`);
  console.log(`  Slab records:       ${summary.slabRecordCount} (source: ${usedSource})`);
  console.log(`  Distinct colors:    ${summary.distinctColorCount}`);
  console.log(`  Distinct materials: ${summary.distinctMaterialCount}`);
  console.log(`  Summed slab count:  ${summary.summedSlabCount}`);
  console.log(`  Warnings:           ${warnings.length}`);
  console.log("");
  console.log(`  Dry-run output: ${dryRunPath}`);
  console.log(`  Summary output: ${summaryPath}`);
  console.log("No Supabase writes, no writeback, no cookies/auth were used.");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
