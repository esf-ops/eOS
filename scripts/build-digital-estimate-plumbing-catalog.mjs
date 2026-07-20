#!/usr/bin/env node
/**
 * Build Brain-side ESF plumbing/specialty catalog seed (with sell prices) + quality report.
 *
 * Source (authoritative for this phase):
 *   _local/catalog-source/esf-plumbing-specialty-program-2026-07-10.xlsx
 *
 * Outputs:
 *   backend-core/src/digitalEstimate/catalog/esfPlumbingCatalogSeed.mjs
 *   docs/digital-estimate/ESF_PLUMBING_CATALOG_QUALITY_REPORT.json
 *
 * Display-only frontend catalog remains separate:
 *   node scripts/build-product-catalog.mjs
 *   → app-slab-inventory/src/lib/productCatalogData.ts (no prices)
 *
 * Usage:
 *   node scripts/build-digital-estimate-plumbing-catalog.mjs
 *   node scripts/build-digital-estimate-plumbing-catalog.mjs /path/to/workbook.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_WORKBOOK = path.join(
  ROOT,
  "_local/catalog-source/esf-plumbing-specialty-program-2026-07-10.xlsx"
);
const SEED_OUT = path.join(
  ROOT,
  "backend-core/src/digitalEstimate/catalog/esfPlumbingCatalogSeed.mjs"
);
const REPORT_OUT = path.join(ROOT, "docs/digital-estimate/ESF_PLUMBING_CATALOG_QUALITY_REPORT.json");
const NORMALIZER = path.join(
  ROOT,
  "backend-core/src/digitalEstimate/catalog/normalizeEsfPlumbingWorkbook.mjs"
);

async function main() {
  const workbookPath = path.resolve(process.argv[2] || DEFAULT_WORKBOOK);
  if (!fs.existsSync(workbookPath)) {
    console.error(`Workbook not found: ${workbookPath}`);
    console.error("Prefer _local/catalog-source/esf-plumbing-specialty-program-2026-07-10.xlsx");
    process.exit(1);
  }

  const { normalizeEsfPlumbingWorkbook } = await import(pathToFileURL(NORMALIZER).href);
  const result = normalizeEsfPlumbingWorkbook(workbookPath);

  const seed = {
    contract: result.contract,
    sourceVersion: result.sourceVersion,
    sourceLabel: result.sourceLabel,
    generatedAt: new Date().toISOString(),
    products: result.products
  };

  const seedHeader = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Brain-side ESF plumbing/specialty catalog seed (includes sellPrice).
 * Source: ${path.relative(ROOT, workbookPath)}
 * Regenerate: node scripts/build-digital-estimate-plumbing-catalog.mjs
 *
 * Display-only (no prices) remains: node scripts/build-product-catalog.mjs
 */
`;

  const seedBody = `export const ESF_PLUMBING_CATALOG_SEED = ${JSON.stringify(seed, null, 2)};\n`;
  fs.mkdirSync(path.dirname(SEED_OUT), { recursive: true });
  fs.writeFileSync(SEED_OUT, seedHeader + seedBody, "utf8");

  const report = {
    contract: result.contract,
    sourceVersion: result.sourceVersion,
    sourceLabel: result.sourceLabel,
    generatedAt: seed.generatedAt,
    workbookPath: path.relative(ROOT, workbookPath),
    productCount: result.products.length,
    countsBySheet: result.qualityReport.countsBySheet,
    countsByCategory: result.qualityReport.countsByCategory,
    excludedRowCount: result.excludedRows.length,
    excludedRows: result.excludedRows,
    missingImages: result.qualityReport.missingImages,
    notes: {
      brainSeedIncludesSellPrices: true,
      displayOnlyCatalogSeparate: true,
      displayOnlyBuildScript: "scripts/build-product-catalog.mjs",
      displayOnlyOutput: "app-slab-inventory/src/lib/productCatalogData.ts"
    }
  };

  fs.mkdirSync(path.dirname(REPORT_OUT), { recursive: true });
  fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`Normalized ${result.products.length} products from ${path.relative(ROOT, workbookPath)}`);
  console.log("Counts by sheet:", result.qualityReport.countsBySheet);
  console.log("Counts by category:", result.qualityReport.countsByCategory);
  console.log(`Excluded rows: ${result.excludedRows.length}`);
  console.log(`Missing images: ${result.qualityReport.missingImages.length}`);
  console.log(`Wrote ${path.relative(ROOT, SEED_OUT)}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
