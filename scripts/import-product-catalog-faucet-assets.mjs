#!/usr/bin/env node
/**
 * import-product-catalog-faucet-assets — copy Delta/Moen faucet images + spec PDFs
 * into app-slab-inventory/public/product-catalog and publish override rows.
 *
 * Dry-run by default. Writes debug/product-catalog/faucet-asset-import-manifest.json
 *
 * Apply:
 *   PRODUCT_CATALOG_FAUCET_ASSET_WRITE_ENABLED=1 \
 *   PRODUCT_CATALOG_FAUCET_SOURCE_DIR="$HOME/Desktop/Digital Assets/Faucets" \
 *   npm run eos:import:product-catalog-faucet-assets
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FAUCET_IMPORT_ACTION,
  buildFaucetImportPlan,
  destinationPaths,
  formatFaucetImportSummaryText,
  generateFaucetOverridesTs,
  loadFaucetCatalogItems,
  loadFaucetMatchMap,
  parseExistingFaucetOverrides,
  summarizeFaucetImportPlan,
} from "./lib/productCatalogFaucetAssetImport.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = path.join(
  process.env.HOME ?? "",
  "Desktop",
  "Digital Assets",
  "Faucets"
);
const SOURCE_DIR = process.env.PRODUCT_CATALOG_FAUCET_SOURCE_DIR || DEFAULT_SOURCE;
const WRITE_ENABLED = process.env.PRODUCT_CATALOG_FAUCET_ASSET_WRITE_ENABLED === "1";
const CATALOG_DATA = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogData.ts");
const PUBLIC_ROOT = path.join(ROOT, "app-slab-inventory/public");
const OVERRIDES_TS = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogFaucetOverrides.ts");
const MATCH_MAP = path.join(ROOT, "debug/product-catalog/faucet-asset-match-map.json");
const DEBUG_DIR = path.join(ROOT, "debug/product-catalog");
const MANIFEST_PATH = path.join(DEBUG_DIR, "faucet-asset-import-manifest.json");
const SUMMARY_PATH = path.join(DEBUG_DIR, "faucet-asset-import-summary.txt");

function copyFileSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Product Catalog — Faucet Asset Import");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Source dir:     ${SOURCE_DIR}`);
  console.log(`  Write enabled:  ${WRITE_ENABLED}`);
  console.log(`  Match map:      ${fs.existsSync(MATCH_MAP) ? MATCH_MAP : "(none)"}`);
  console.log("───────────────────────────────────────────────────────\n");

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const catalogItems = loadFaucetCatalogItems(CATALOG_DATA);
  const matchMap = loadFaucetMatchMap(MATCH_MAP);
  const existingOverridesById = parseExistingFaucetOverrides(OVERRIDES_TS);

  const rows = buildFaucetImportPlan({
    sourceDir: SOURCE_DIR,
    catalogItems,
    publicRoot: PUBLIC_ROOT,
    existingOverridesById,
    matchMap,
  });

  const summary = summarizeFaucetImportPlan(rows);
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source_dir: SOURCE_DIR,
        write_enabled: WRITE_ENABLED,
        summary: {
          total_folders: summary.total_folders,
          copy_assets_and_publish: summary.copy_assets_and_publish,
          skip_already_published: summary.skip_already_published,
          unmatched: summary.unmatched,
          ambiguous: summary.ambiguous,
          duplicate_source: summary.duplicate_source,
          missing_image: summary.missing_image,
          missing_spec_sheet: summary.missing_spec_sheet,
          apply_allowed: summary.apply_allowed,
        },
        rows: summary.rows,
      },
      null,
      2
    )
  );
  fs.writeFileSync(SUMMARY_PATH, formatFaucetImportSummaryText(summary));

  console.log("── Dry-run summary ──");
  const { rows: _rows, ...summaryCounts } = summary;
  console.log(JSON.stringify(summaryCounts, null, 2));
  console.log(`\nManifest: ${MANIFEST_PATH}`);
  console.log(`Summary:  ${SUMMARY_PATH}\n`);

  if (!summary.apply_allowed) {
    console.error("── Import blocked — resolve UNMATCHED / AMBIGUOUS / DUPLICATE / MISSING rows ──");
    for (const row of summary.rows.filter((r) => r.action !== FAUCET_IMPORT_ACTION.SKIP_ALREADY_PUBLISHED && r.action !== FAUCET_IMPORT_ACTION.COPY_ASSETS_AND_PUBLISH)) {
      if ([
        FAUCET_IMPORT_ACTION.UNMATCHED,
        FAUCET_IMPORT_ACTION.AMBIGUOUS,
        FAUCET_IMPORT_ACTION.DUPLICATE_SOURCE,
        FAUCET_IMPORT_ACTION.MISSING_IMAGE,
        FAUCET_IMPORT_ACTION.MISSING_SPEC_SHEET,
      ].includes(row.action)) {
        console.error(`  ${row.action}: ${row.manufacturer}/${row.sourceFolderName}`);
      }
    }
    if (WRITE_ENABLED) process.exit(1);
    return;
  }

  if (!WRITE_ENABLED) {
    console.log("Dry-run complete. No files copied.");
    console.log("To apply: PRODUCT_CATALOG_FAUCET_ASSET_WRITE_ENABLED=1 npm run eos:import:product-catalog-faucet-assets");
    return;
  }

  let copiedImages = 0;
  let copiedSpecs = 0;

  for (const row of summary.rows) {
    if (row.action !== FAUCET_IMPORT_ACTION.COPY_ASSETS_AND_PUBLISH) continue;
    const { imagePaths, specPath } = destinationPaths(
      PUBLIC_ROOT,
      row.matchedProductId,
      row.finishImageFiles
    );
    for (let i = 0; i < row.finishImageFiles.length; i++) {
      copyFileSafe(
        path.join(row.sourceFolderPath, row.finishImageFiles[i]),
        imagePaths[i]
      );
      copiedImages += 1;
    }
    if (row.specSheetFile) {
      copyFileSafe(path.join(row.sourceFolderPath, row.specSheetFile), specPath);
      copiedSpecs += 1;
    }
    console.log(`  ✓ ${row.manufacturer}/${row.sourceFolderName} → ${row.matchedProductId}`);
  }

  const mergedOverrides = new Map(existingOverridesById);
  for (const row of summary.rows) {
    if (
      row.proposedOverride &&
      (row.action === FAUCET_IMPORT_ACTION.COPY_ASSETS_AND_PUBLISH ||
        row.action === FAUCET_IMPORT_ACTION.SKIP_ALREADY_PUBLISHED)
    ) {
      mergedOverrides.set(row.matchedProductId, row.proposedOverride);
    }
  }

  const overrideList = [...mergedOverrides.values()].sort((a, b) =>
    a.productId.localeCompare(b.productId)
  );
  fs.writeFileSync(OVERRIDES_TS, generateFaucetOverridesTs(overrideList));

  console.log("\n── Write summary ──");
  console.log(JSON.stringify({
    copied_images: copiedImages,
    copied_spec_sheets: copiedSpecs,
    override_rows: overrideList.length,
    overrides_file: OVERRIDES_TS,
  }, null, 2));
}

main();
