#!/usr/bin/env node
/**
 * stageElite100ManualPhotos — prepare a clean name-based staging folder for
 * importElite100ManualPhotos.js (copy only; no upload).
 *
 * Usage:
 *   node backend-core/src/scripts/slabInventory/stageElite100ManualPhotos.mjs
 *   node ... --source /path/to/source --dest /path/to/clean --duplicates /path/to/review
 *   node ... --dry-run-only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import {
  ELITE100_MATCH_STATUS,
  ELITE100_PHOTO_EXTENSIONS,
  flattenElite100Fixture,
  matchPhotoToCatalogItem,
  parsePhotoFilename,
  extractFilenameColorTokens,
  slugifyElite100ColorName,
} from "../../slabInventory/elite100ManualVisualAssets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "../../slabInventory/fixtures/elite100-2026.json");

const DEFAULT_SOURCE = path.join(
  process.env.HOME ?? "",
  "Desktop",
  "elite100-upload-batch"
);
const DEFAULT_DEST = path.join(
  process.env.HOME ?? "",
  "Desktop",
  "elite100-upload-batch-clean"
);
const DEFAULT_DUPES = path.join(
  process.env.HOME ?? "",
  "Desktop",
  "elite100-upload-batch-duplicates-review"
);

function parseArgs(argv) {
  const out = {
    source: DEFAULT_SOURCE,
    dest: DEFAULT_DEST,
    duplicates: DEFAULT_DUPES,
    dryRunOnly: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run-only") out.dryRunOnly = true;
    else if (arg === "--source") {
      out.source = argv[++i];
    } else if (arg === "--dest") {
      out.dest = argv[++i];
    } else if (arg === "--duplicates") {
      out.duplicates = argv[++i];
    }
  }
  return out;
}

/** Remove local export sequence numbers; keep color/finish tokens. */
export function cleanPhotoBasename(originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  let base = path.basename(originalFilename, path.extname(originalFilename));
  const leading = base.match(/^(\d{1,3})\.\s*(.*)$/);
  const leadingNum = leading ? parseInt(leading[1], 10) : null;
  if (leading) base = leading[2].trim();

  base = base.replace(/[\s_]+(\d{1,3})\s*$/u, (match, digits) => {
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) return match;
    if (leadingNum != null && n !== leadingNum) return match;
    return "";
  });

  base = base.replace(/\s+/g, " ").replace(/_+/g, "_").trim().replace(/^_|_$/g, "");
  return { base, ext, leadingNum };
}

export function proposedCleanFilename(originalFilename) {
  const { base, ext } = cleanPhotoBasename(originalFilename);
  const safe = base.includes("_")
    ? base.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
    : base.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${safe}${ext || ".jpg"}`;
}

function listPhotos(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => ELITE100_PHOTO_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function loadCatalog() {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const flat = flattenElite100Fixture(fixture);
  const catalogItems = flat.map((f) => ({
    id: `00000000-0000-4000-8000-${String(f.global_index).padStart(12, "0")}`,
    color_name: f.color_name,
    material_name: f.material_name,
    normalized_color_name: f.normalized_color_name,
    normalized_material_name: f.normalized_material_name,
    price_group: f.price_group,
    global_index: f.global_index,
    product_slug: f.product_slug,
  }));
  return { flat, catalogItems };
}

const CORRECTED_RE =
  /\b(corrected|white.?balance|whitebalance|wb_fix|wb-fix|final.?edit|revised|v2|v3)\b/i;

function duplicateScore(entry) {
  let score = 0;
  const lower = entry.original.toLowerCase();
  if (CORRECTED_RE.test(lower)) score += 1000;
  score += entry.stat.mtimeMs / 1e15;
  return score;
}

function pickDuplicateWinner(group) {
  const sorted = [...group].sort((a, b) => duplicateScore(b) - duplicateScore(a));
  const top = sorted[0];
  const second = sorted[1];
  const topCorrected = CORRECTED_RE.test(top.original.toLowerCase());
  const secondCorrected = CORRECTED_RE.test(second.original.toLowerCase());

  if (topCorrected && !secondCorrected) {
    return {
      winner: top,
      rule: "filename_indicates_corrected_or_white_balance",
      review: sorted.slice(1),
    };
  }

  const mtimeDeltaMs = Math.abs(top.stat.mtimeMs - second.stat.mtimeMs);
  const sameStem =
    slugifyElite100ColorName(cleanPhotoBasename(top.original).base) ===
    slugifyElite100ColorName(cleanPhotoBasename(second.original).base);

  if (sameStem && mtimeDeltaMs >= 24 * 60 * 60 * 1000) {
    return {
      winner: top,
      rule: `newest_mtime_delta_${Math.round(mtimeDeltaMs / 3600000)}h`,
      review: sorted.slice(1),
    };
  }

  return { winner: null, rule: "no_clear_winner", review: sorted };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

export function buildStagingPlan({ sourceDir, catalogItems, fixtureFlat }) {
  const files = listPhotos(sourceDir);
  const entries = files.map((original) => {
    const fullPath = path.join(sourceDir, original);
    const stat = fs.statSync(fullPath);
    const cleanName = proposedCleanFilename(original);
    const parsed = parsePhotoFilename(cleanName);
    const tokens = extractFilenameColorTokens(parsed);
    const match = matchPhotoToCatalogItem(cleanName, catalogItems, fixtureFlat);

    return {
      original,
      fullPath,
      proposedCleanFilename: cleanName,
      parsedColorName: tokens.raw || parsed.colorText || null,
      stat: {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        mtimeIso: stat.mtime.toISOString(),
      },
      match,
      catalogItem: match.catalogItem,
      matchStatus: match.matchStatus,
      matchMethod: match.matchMethod,
      catalogColor: match.catalogItem?.color_name ?? null,
      catalogIndex: match.catalogItem?.global_index ?? null,
      catalogItemId: match.catalogItem?.id ?? null,
      action: "block",
      reason: match.matchStatus,
    };
  });

  for (const entry of entries) {
    if (entry.matchStatus !== ELITE100_MATCH_STATUS.SAFE || !entry.catalogItemId) {
      entry.action = "block";
      entry.reason = entry.matchStatus;
      continue;
    }
    entry.action = "copy";
    entry.reason = "safe_unique_pending";
  }

  const safeEntries = entries.filter((e) => e.action === "copy");
  const byCatalog = new Map();
  for (const entry of safeEntries) {
    if (!byCatalog.has(entry.catalogItemId)) byCatalog.set(entry.catalogItemId, []);
    byCatalog.get(entry.catalogItemId).push(entry);
  }

  for (const [, group] of byCatalog) {
    if (group.length === 1) continue;
    const { winner, rule, review } = pickDuplicateWinner(group);
    if (winner) {
      for (const entry of review) {
        entry.action = "duplicate_review";
        entry.reason = `duplicate_loser:${rule};winner=${winner.original}`;
      }
      winner.action = "copy";
      winner.reason = `duplicate_winner:${rule}`;
      continue;
    }
    for (const entry of group) {
      entry.action = "duplicate_review";
      entry.reason = "duplicate_no_clear_winner";
    }
  }

  return entries;
}

function printReport(rows) {
  console.log("\n── Staging dry-run report ──");
  console.table(
    rows.map((r) => ({
      original_filename: r.original,
      proposed_clean_filename: r.proposedCleanFilename,
      parsed_color_name: r.parsedColorName,
      matched_catalog_color: r.catalogColor,
      matched_catalog_index: r.catalogIndex,
      action: r.action,
      reason: r.reason,
      mtime: r.stat.mtimeIso,
    }))
  );

  const summary = {
    total: rows.length,
    copy: rows.filter((r) => r.action === "copy").length,
    duplicate_review: rows.filter((r) => r.action === "duplicate_review").length,
    block: rows.filter((r) => r.action === "block").length,
  };
  console.log("\n── Staging summary ──");
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function applyStaging(plan, { sourceDir, destDir, duplicatesDir, dryRunOnly }) {
  if (dryRunOnly) return { copied: 0, reviewCopied: 0 };

  ensureDir(destDir);
  ensureDir(duplicatesDir);

  let copied = 0;
  let reviewCopied = 0;

  for (const entry of plan) {
    if (entry.action === "copy") {
      const destPath = path.join(destDir, entry.proposedCleanFilename);
      copyFile(entry.fullPath, destPath);
      copied += 1;
    } else if (entry.action === "duplicate_review") {
      const slug = entry.catalogItem?.product_slug ?? slugifyElite100ColorName(entry.catalogColor ?? "unknown");
      const reviewName = `${slug}__${entry.original}`;
      copyFile(entry.fullPath, path.join(duplicatesDir, reviewName));
      reviewCopied += 1;
    }
  }

  return { copied, reviewCopied };
}

function main() {
  const args = parseArgs(process.argv);
  const { flat, catalogItems } = loadCatalog();
  const plan = buildStagingPlan({
    sourceDir: args.source,
    catalogItems,
    fixtureFlat: flat,
  });
  const summary = printReport(plan);

  if (summary.block > 0) {
    console.warn(
      `\nWarning: ${summary.block} source file(s) could not be matched and will stay in the source folder only.`
    );
  }

  if (summary.copy === 0) {
    console.error("\nNo safe unique files to copy.");
    process.exit(1);
  }

  const result = applyStaging(plan, {
    sourceDir: args.source,
    destDir: args.dest,
    duplicatesDir: args.duplicates,
    dryRunOnly: args.dryRunOnly,
  });

  if (!args.dryRunOnly) {
    console.log("\n── Staging applied ──");
    console.log(JSON.stringify({ ...result, dest: args.dest, duplicates: args.duplicates }, null, 2));
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
