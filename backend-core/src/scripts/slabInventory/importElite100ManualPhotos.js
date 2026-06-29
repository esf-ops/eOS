#!/usr/bin/env node
/**
 * importElite100ManualPhotos — import local Elite 100 slab photos into
 * slab_color_visual_assets + Supabase Storage (eliteos-slab-images).
 *
 * SCOPE / SAFETY:
 *   - Presentation enrichment ONLY. Never reads or writes slab_inventory.
 *   - Never uses count_for_color or SlabCloud display counts.
 *   - DRY-RUN by default. Writes require ELITE100_MANUAL_PHOTO_WRITE_ENABLED=1.
 *   - Does NOT commit or copy raw 40–60 MB originals into the repo.
 *   - Uploads resized display JPEGs (thumb + hero) plus full-resolution originals.
 *   - Original bytes are uploaded unchanged (no resize/recompress).
 *
 * Usage (dry-run — match + summary only):
 *   ELITE100_PHOTO_SOURCE_DIR="$HOME/Desktop/Elite 100 Slab Photos/0. Final Edits" \
 *     npm run eos:elite100:import-manual-photos
 *
 * Usage (write — upload + DB insert):
 *   ELITE100_MANUAL_PHOTO_WRITE_ENABLED=1 \
 *   ELITE100_PHOTO_SOURCE_DIR="$HOME/Desktop/Elite 100 Slab Photos/0. Final Edits" \
 *   SLABOS_ORGANIZATION_ID=<org-uuid> \
 *   SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npm run eos:elite100:import-manual-photos
 *
 * Environment:
 *   ELITE100_MANUAL_PHOTO_WRITE_ENABLED  "1" to upload + insert (default dry-run)
 *   ELITE100_PHOTO_SOURCE_DIR            local folder of source photos
 *   SLABOS_ORGANIZATION_ID               org UUID (required for writes + catalog match)
 *   SLABCLOUD_ORGANIZATION_ID            fallback org UUID alias
 *   SUPABASE_URL                         required for catalog match + writes
 *   SUPABASE_SERVICE_ROLE_KEY            required for writes
 *   ELITE100_FIXTURE_PATH                optional fixture for global index matching
 *   ELITE100_PHOTO_MATCH_MAP              optional CSV/JSON explicit filename → catalog mapping
 *   ELITE100_MANUAL_THUMB_MAX_PX         default 600
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalogForCache } from "../slabcloud/cacheSlabCloudV2Textures.js";
import { SLABSMITH_IMAGE_BUCKET, uploadPublicJpeg, uploadPublicFile, isJpegBuffer } from "../../slabsmith/slabsmithImageStorage.mjs";
import {
  ELITE100_MANUAL_SOURCE_SYSTEM,
  ELITE100_PHOTO_EXTENSIONS,
  ELITE100_MANUAL_MAX_HERO_BYTES,
  ELITE100_MANUAL_MAX_THUMB_BYTES,
  flattenElite100Fixture,
  matchPhotoToCatalogItem,
  buildElite100ManualStoragePaths,
  buildManualVisualAssetRow,
  computeManualPhotoDryRunSummary,
  formatManualPhotoDryRunEntry,
  hashPhotoContent,
  contentTypeForPhotoExtension,
  parsePhotoMatchMapContent,
  buildPhotoMatchMapLookup,
  assessImportPlanSafety,
  applyBatchDuplicateTargets,
  printManualPhotoAuditTable,
} from "../../slabInventory/elite100ManualVisualAssets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WRITE_ENABLED = process.env.ELITE100_MANUAL_PHOTO_WRITE_ENABLED === "1";
const ORG_ID =
  process.env.SLABOS_ORGANIZATION_ID ||
  process.env.SLABCLOUD_ORGANIZATION_ID ||
  null;
const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const SOURCE_DIR =
  process.env.ELITE100_PHOTO_SOURCE_DIR ||
  path.join(os.homedir(), "Desktop", "Elite 100 Slab Photos", "0. Final Edits");
const FIXTURE_PATH =
  process.env.ELITE100_FIXTURE_PATH ||
  path.join(__dirname, "../../slabInventory/fixtures/elite100-2026.json");
const MATCH_MAP_PATH = process.env.ELITE100_PHOTO_MATCH_MAP || null;
const HERO_MAX_PX = Math.max(400, parseInt(process.env.ELITE100_MANUAL_HERO_MAX_PX || "2048", 10));
const THUMB_MAX_PX = Math.max(200, parseInt(process.env.ELITE100_MANUAL_THUMB_MAX_PX || "600", 10));
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY && ORG_ID);

function listLocalPhotos(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => ELITE100_PHOTO_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function loadFixtureFlat() {
  try {
    const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
    return flattenElite100Fixture(JSON.parse(raw));
  } catch (e) {
    console.warn(`  ⚠ Could not load fixture at ${FIXTURE_PATH}: ${e.message}`);
    return [];
  }
}

function hasSips() {
  try {
    execFileSync("which", ["sips"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resize to JPEG via macOS sips. Returns null when sips unavailable.
 */
function resizeToJpeg(inputPath, outputPath, maxPx) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  execFileSync("sips", ["-s", "format", "jpeg", "-Z", String(maxPx), inputPath, "--out", outputPath], {
    stdio: "pipe",
  });
  return fs.readFileSync(outputPath);
}

function processPhotoBuffers(sourcePath, tmpDir) {
  const sourceStat = fs.statSync(sourcePath);
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const heroOut = path.join(tmpDir, `${base}-hero.jpg`);
  const thumbOut = path.join(tmpDir, `${base}-thumb.jpg`);
  const warnings = [];

  if (sourceStat.size > 15 * 1024 * 1024) {
    warnings.push("source_oversized");
  }

  const originalBuf = fs.readFileSync(sourcePath);
  let heroBuf;
  let thumbBuf;

  if (hasSips()) {
    warnings.push("needs_resize");
    heroBuf = resizeToJpeg(sourcePath, heroOut, HERO_MAX_PX);
    thumbBuf = resizeToJpeg(sourcePath, thumbOut, THUMB_MAX_PX);
  } else {
    if (isJpegBuffer(originalBuf) && sourceStat.size <= ELITE100_MANUAL_MAX_HERO_BYTES) {
      heroBuf = originalBuf;
      thumbBuf = originalBuf;
      warnings.push("sips_unavailable_used_original_for_display");
    } else {
      throw new Error(
        "macOS sips is required to build display thumb/hero from large or non-JPEG sources."
      );
    }
  }

  if (heroBuf.length > ELITE100_MANUAL_MAX_HERO_BYTES) {
    throw new Error(`Processed hero exceeds ${ELITE100_MANUAL_MAX_HERO_BYTES} bytes`);
  }
  if (thumbBuf.length > ELITE100_MANUAL_MAX_THUMB_BYTES) {
    throw new Error(`Processed thumb exceeds ${ELITE100_MANUAL_MAX_THUMB_BYTES} bytes`);
  }

  return { heroBuf, thumbBuf, originalBuf, warnings, sourceBytes: sourceStat.size };
}

async function findExistingManualVisualAsset(supabase, orgId, catalogItemId) {
  const { data, error } = await supabase
    .from("slab_color_visual_assets")
    .select("id, texture_hash, is_primary, updated_at")
    .eq("organization_id", orgId)
    .eq("source_system", ELITE100_MANUAL_SOURCE_SYSTEM)
    .eq("catalog_item_id", catalogItemId)
    .limit(1);
  if (error) throw new Error(`Manual visual asset lookup error: ${error.message}`);
  return data?.[0] ?? null;
}

async function demoteOtherPrimaries(supabase, orgId, catalogItemId, keepId = null) {
  let query = supabase
    .from("slab_color_visual_assets")
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("catalog_item_id", catalogItemId)
    .eq("is_primary", true);
  if (keepId) query = query.neq("id", keepId);
  const { error } = await query;
  if (error) throw new Error(`Demote primary assets error: ${error.message}`);
}

/**
 * Write one manual visual asset row (SELECT-then-INSERT/UPDATE).
 * Exported for tests.
 */
export async function writeManualVisualAssetRow(supabase, payload) {
  const existing = await findExistingManualVisualAsset(
    supabase,
    payload.organization_id,
    payload.catalog_item_id
  );

  if (!existing) {
    await demoteOtherPrimaries(supabase, payload.organization_id, payload.catalog_item_id);
    const { data, error } = await supabase
      .from("slab_color_visual_assets")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(`Manual visual asset insert error: ${error.message}`);
    return { action: "inserted", id: data?.id ?? null };
  }

  const hashChanged = existing.texture_hash !== payload.texture_hash;
  if (!hashChanged) return { action: "skipped", id: existing.id };

  await demoteOtherPrimaries(supabase, payload.organization_id, payload.catalog_item_id, existing.id);
  const { error } = await supabase
    .from("slab_color_visual_assets")
    .update({
      texture_hash: payload.texture_hash,
      texture_url_600: payload.texture_url_600,
      texture_url_1024: payload.texture_url_1024,
      original_image_url: payload.original_image_url,
      thumbnail_url: payload.thumbnail_url,
      hero_url: payload.hero_url,
      review_status: payload.review_status,
      is_primary: true,
      is_active: true,
      match_method: payload.match_method,
      raw: payload.raw,
      last_seen_at: payload.last_seen_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (error) throw new Error(`Manual visual asset update error: ${error.message}`);
  return { action: "updated", id: existing.id };
}

function loadPhotoMatchMap(catalogItems) {
  if (!MATCH_MAP_PATH) return null;
  if (!fs.existsSync(MATCH_MAP_PATH)) {
    throw new Error(`ELITE100_PHOTO_MATCH_MAP not found: ${MATCH_MAP_PATH}`);
  }
  const content = fs.readFileSync(MATCH_MAP_PATH, "utf8");
  const format = MATCH_MAP_PATH.toLowerCase().endsWith(".json") ? "json" : "csv";
  const rows = parsePhotoMatchMapContent(content, format);
  return buildPhotoMatchMapLookup(rows, catalogItems);
}

export async function buildImportPlan({ sourceDir, catalogItems, fixtureFlat, orgId, heroMaxPx, matchMap }) {
  const files = listLocalPhotos(sourceDir);
  const plan = files.map((filename) => {
    const fullPath = path.join(sourceDir, filename);
    const match = matchPhotoToCatalogItem(filename, catalogItems, fixtureFlat, { matchMap });
    const {
      catalogItem,
      matchMethod,
      matchStatus,
      confidence,
      parsed,
      warnings: matchWarnings,
      conflictCatalogItem,
      candidates,
      indexCatalogItem,
    } = match;
    const originalExt = path.extname(filename).toLowerCase() || ".jpg";
    const storagePaths =
      catalogItem?.id && matchStatus === "safe"
        ? buildElite100ManualStoragePaths(orgId, catalogItem.id, catalogItem.product_slug, {
            heroMaxPx,
            originalExt,
          })
        : null;
    const stat = fs.existsSync(fullPath) ? fs.statSync(fullPath) : null;
    const warnings = [...(matchWarnings ?? [])];
    if (stat && stat.size > 15 * 1024 * 1024) warnings.push("source_oversized");

    return {
      filename,
      fullPath,
      catalogItem: matchStatus === "safe" ? catalogItem : null,
      matchMethod,
      matchStatus,
      confidence,
      parsed,
      conflictCatalogItem,
      indexCatalogItem,
      candidates,
      storagePaths,
      warnings,
      sourceBytes: stat?.size ?? null,
    };
  });

  return applyBatchDuplicateTargets(plan);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Elite 100 Manual Photo Import");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Source dir:        ${SOURCE_DIR}`);
  console.log(`  Fixture:           ${FIXTURE_PATH}`);
  console.log(`  Org ID:            ${ORG_ID ?? "(not provided)"}`);
  console.log(`  Has Supabase:      ${HAS_SUPABASE}`);
  console.log(`  Write enabled:     ${WRITE_ENABLED}`);
  console.log(`  Match map:         ${MATCH_MAP_PATH ?? "(none)"}`);
  console.log(`  Hero max px:       ${HERO_MAX_PX}`);
  console.log(`  Thumb max px:      ${THUMB_MAX_PX}`);
  console.log(`  sips available:    ${hasSips()}`);
  console.log("───────────────────────────────────────────────────────");
  console.log("  AUTHORITY REMINDER:");
  console.log("  slab_color_visual_assets is PRESENTATION ENRICHMENT ONLY.");
  console.log("  Typed slab_inventory remains the sole inventory authority.");
  console.log("═══════════════════════════════════════════════════════\n");

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    console.error("Set ELITE100_PHOTO_SOURCE_DIR to your local Elite 100 Slab Photos folder.");
    process.exit(1);
  }

  const fixtureFlat = loadFixtureFlat();
  let catalogItems = [];

  if (HAS_SUPABASE) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const loaded = await loadCatalogForCache(supabase, ORG_ID);
    catalogItems = loaded.catalogItemList ?? [];
    console.log(`Loaded ${catalogItems.length} active Elite 100 catalog items from Supabase.\n`);
  } else {
    console.warn("  ⚠ Supabase org creds not provided — matching uses fixture names only (no catalog_item_id).\n");
    catalogItems = fixtureFlat.map((f) => ({
      id: null,
      color_name: f.color_name,
      material_name: f.material_name,
      normalized_color_name: f.normalized_color_name,
      normalized_material_name: f.normalized_material_name,
      price_group: f.price_group,
      global_index: f.global_index,
      product_slug: f.product_slug,
    }));
  }

  const matchMap = loadPhotoMatchMap(catalogItems);

  const plan = await buildImportPlan({
    sourceDir: SOURCE_DIR,
    catalogItems,
    fixtureFlat,
    orgId: ORG_ID,
    heroMaxPx: HERO_MAX_PX,
    matchMap,
  });

  if (!plan.length) {
    console.log("No image files found in source directory.");
    process.exit(0);
  }

  const summary = computeManualPhotoDryRunSummary(plan);
  console.log("── Dry-run summary ──");
  console.log(JSON.stringify({
    total_files: summary.total_files,
    safe_matches: summary.safe_matches,
    conflicts: summary.conflicts,
    catalog_color_missing: summary.catalog_color_missing,
    ambiguous: summary.ambiguous,
    unmatched: summary.unmatched,
    invalid_index: summary.invalid_index,
    duplicate_targets: summary.duplicate_targets,
    oversized_sources: summary.oversized_sources,
    write_blocked: summary.write_blocked,
    write_block_reasons: summary.write_block_reasons,
  }, null, 2));
  printManualPhotoAuditTable(plan);
  console.log("");

  if (summary.write_blocked) {
    console.error("── Import blocked — unsafe matches detected ──");
    console.error(JSON.stringify({ blockers: summary.blockers }, null, 2));
    console.error(
      "Resolve catalog_color_missing, conflicts, ambiguous, or unmatched files or provide ELITE100_PHOTO_MATCH_MAP overrides before writing."
    );
    if (WRITE_ENABLED) process.exit(1);
  }

  if (!WRITE_ENABLED) {
    console.log("Dry-run complete. No uploads or DB writes performed.");
    console.log("To apply: ELITE100_MANUAL_PHOTO_WRITE_ENABLED=1 + Supabase creds + SLABOS_ORGANIZATION_ID");
    console.log("Apply is blocked until all files are safe matches (no catalog_color_missing, conflicts, ambiguous, or unmatched).");
    return;
  }

  if (!HAS_SUPABASE) {
    console.error("Write mode requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SLABOS_ORGANIZATION_ID.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "elite100-import-"));
  const results = { inserted: 0, updated: 0, skipped: 0, failed: 0, uploaded: 0, originals_uploaded: 0 };

  try {
    for (const entry of plan) {
      if (!entry.catalogItem?.id) {
        console.warn(`  skip unmatched: ${entry.filename}`);
        results.skipped += 1;
        continue;
      }

      try {
        const { heroBuf, thumbBuf, originalBuf, warnings, sourceBytes } = processPhotoBuffers(
          entry.fullPath,
          tmpDir
        );
        entry.warnings = [...(entry.warnings ?? []), ...warnings];

        const heroUrl = await uploadPublicJpeg(
          supabase,
          SLABSMITH_IMAGE_BUCKET,
          entry.storagePaths.heroPath,
          heroBuf
        );
        const thumbUrl = await uploadPublicJpeg(
          supabase,
          SLABSMITH_IMAGE_BUCKET,
          entry.storagePaths.thumbPath,
          thumbBuf
        );
        const originalExt = path.extname(entry.filename).toLowerCase() || ".jpg";
        const originalUrl = await uploadPublicFile(
          supabase,
          SLABSMITH_IMAGE_BUCKET,
          entry.storagePaths.originalPath,
          originalBuf,
          contentTypeForPhotoExtension(originalExt)
        );
        results.uploaded += 1;
        results.originals_uploaded += 1;

        const contentHash = hashPhotoContent(originalBuf);
        const payload = buildManualVisualAssetRow({
          orgId: ORG_ID,
          catalogItem: entry.catalogItem,
          publicUrls: {
            heroUrl,
            thumbUrl,
            originalUrl,
            heroBytes: heroBuf.length,
            thumbBytes: thumbBuf.length,
            originalBytes: originalBuf.length,
            storageOriginalPath: entry.storagePaths.originalPath,
          },
          contentHash,
          sourceFile: entry.filename,
          matchMethod: entry.matchMethod,
        });

        payload.raw = {
          ...payload.raw,
          source_bytes: sourceBytes,
          storage_hero_path: entry.storagePaths.heroPath,
          storage_thumb_path: entry.storagePaths.thumbPath,
          storage_original_path: entry.storagePaths.originalPath,
        };

        const writeResult = await writeManualVisualAssetRow(supabase, payload);
        results[writeResult.action === "inserted" ? "inserted" : writeResult.action === "updated" ? "updated" : "skipped"] += 1;
        console.log(`  ✓ ${entry.filename} → ${entry.catalogItem.color_name} (${writeResult.action})`);
      } catch (e) {
        results.failed += 1;
        console.error(`  ✗ ${entry.filename}: ${e.message}`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("\n── Write summary ──");
  console.log(JSON.stringify(results, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
