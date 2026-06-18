#!/usr/bin/env node
/**
 * Product Catalog — asset manifest / collection checklist generator
 * ================================================================
 *
 * Reads the generated static catalog (`productCatalogData.ts`) and writes a
 * developer checklist of digital assets needed for each display-only product.
 *
 * Does NOT download images, scrape vendor sites, or modify catalog data.
 * Asset files and URLs are filled in manually over time; the manifest is the
 * source of truth for what to collect and where to put it.
 *
 * Usage:
 *   1. Regenerate catalog data (when workbook changes):
 *        node scripts/build-product-catalog.mjs
 *   2. Generate / refresh asset manifest:
 *        node scripts/build-product-catalog-asset-manifest.mjs
 *
 * Outputs (gitignored `_local/` — safe for internal URLs/notes):
 *   - _local/catalog-source/product-catalog-asset-manifest.csv
 *   - _local/catalog-source/product-catalog-asset-manifest.md
 *
 * Recommended public asset layout (relative to app-slab-inventory/public/):
 *   product-catalog/sinks/<product-id>/hero.jpg
 *   product-catalog/sinks/<product-id>/installed.jpg
 *   product-catalog/sinks/<product-id>/diagram.jpg
 *   product-catalog/sinks/<product-id>/combo-01.jpg … combo-09.jpg
 *   product-catalog/sinks/<product-id>/<color-slug>.jpg   (variant finish swatches)
 *   product-catalog/faucets/<product-id>/…
 *   product-catalog/specialty/<product-id>/…
 *   product-catalog/spec-sheets/<product-id>/<product-id>.pdf
 *
 * After assets are on disk, wire URLs into productCatalogData.ts (or a future
 * asset map module) — this script does not auto-link files yet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CATALOG_TS = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogData.ts");
const OUT_DIR = path.join(ROOT, "_local/catalog-source");
const OUT_CSV = path.join(OUT_DIR, "product-catalog-asset-manifest.csv");
const OUT_MD = path.join(OUT_DIR, "product-catalog-asset-manifest.md");

const PUBLIC_ROOT = "app-slab-inventory/public";

/** @typedef {import('../app-slab-inventory/src/lib/productCatalog.ts').ProductCatalogItem} ProductCatalogItem */

function slugifyColor(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function categoryFolder(category) {
  if (category === "faucet") return "faucets";
  if (category === "specialty_add_on") return "specialty";
  return "sinks"; // sink + sink_accessory
}

function categoryLabel(category) {
  const labels = {
    sink: "Sinks",
    sink_accessory: "Sink Accessories",
    faucet: "Faucets",
    specialty_add_on: "Specialty Add-ons",
  };
  return labels[category] || category;
}

function loadCatalogItems() {
  if (!fs.existsSync(CATALOG_TS)) {
    console.error(`Catalog data not found: ${CATALOG_TS}`);
    console.error("Run: node scripts/build-product-catalog.mjs");
    process.exit(1);
  }
  const raw = fs.readFileSync(CATALOG_TS, "utf8");
  const match = raw.match(/export const PRODUCT_CATALOG_ITEMS[^=]*=\s*(\[[\s\S]*\])\s*;/);
  if (!match) {
    console.error("Could not parse PRODUCT_CATALOG_ITEMS from catalog TS file.");
    process.exit(1);
  }
  const json = match[1].replace(/ as const/g, "");
  return /** @type {ProductCatalogItem[]} */ (JSON.parse(json));
}

function variantColors(item) {
  if (item.variants?.length) {
    return item.variants
      .map((v) => v.colorName || v.finishName)
      .filter(Boolean);
  }
  return item.availableColors ?? [];
}

function variantCatalogNumbers(item) {
  if (!item.variants?.length) return [];
  return item.variants.map((v) => v.catalogNumber).filter(Boolean);
}

function recommendedVariantFilenames(item) {
  const names = [];
  if (item.variants?.length) {
    for (const v of item.variants) {
      const color = v.colorName || v.finishName;
      const slug = slugifyColor(color) || slugifyColor(v.catalogNumber) || v.id;
      names.push(`${slug}.jpg`);
    }
  } else {
    for (const c of item.availableColors ?? []) {
      names.push(`${slugifyColor(c)}.jpg`);
    }
  }
  return names;
}

function comboFilenames() {
  return Array.from({ length: 9 }, (_, i) => `combo-${String(i + 1).padStart(2, "0")}.jpg`);
}

function buildRow(item) {
  const slug = item.id;
  const folder = categoryFolder(item.category);
  const relFolder = `product-catalog/${folder}/${slug}`;
  const absFolder = `${PUBLIC_ROOT}/${relFolder}`;
  const specRel = `product-catalog/spec-sheets/${slug}`;
  const colors = variantColors(item);
  const catalogNums = variantCatalogNumbers(item);
  const variantFiles = recommendedVariantFilenames(item);
  const comboFiles = comboFilenames();

  return {
    product_id: slug,
    category: categoryLabel(item.category),
    category_key: item.category,
    display_name: item.name,
    original_name: item.originalName || item.sourceDescription || "",
    brand: item.brand || "",
    series: item.series || "",
    sku: item.sku || "",
    esf_code: item.esfCode || "",
    catalog_numbers: catalogNums.join("; "),
    variants_colors: colors.join("; "),
    asset_status: item.assetStatus,
    folder_path: absFolder,
    hero_filename: "hero.jpg",
    hero_public_path: `/${relFolder}/hero.jpg`,
    installed_filename: "installed.jpg",
    installed_public_path: `/${relFolder}/installed.jpg`,
    diagram_filename: "diagram.jpg",
    diagram_public_path: `/${relFolder}/diagram.jpg`,
    spec_sheet_filename: `${slug}.pdf`,
    spec_sheet_public_path: `/${specRel}/${slug}.pdf`,
    combo_photo_filenames: comboFiles.join("; "),
    variant_image_filenames: variantFiles.join("; "),
    notes: "", // fill: source URL, vendor URL, AppSheet path, collection status
  };
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const columns = [
    "product_id",
    "category",
    "display_name",
    "original_name",
    "brand",
    "series",
    "sku",
    "esf_code",
    "catalog_numbers",
    "variants_colors",
    "asset_status",
    "folder_path",
    "hero_filename",
    "hero_public_path",
    "installed_filename",
    "installed_public_path",
    "diagram_filename",
    "diagram_public_path",
    "spec_sheet_filename",
    "spec_sheet_public_path",
    "combo_photo_filenames",
    "variant_image_filenames",
    "notes",
  ];
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(",")),
  ];
  return lines.join("\n") + "\n";
}

function toMarkdown(rows, generatedAt) {
  const byCategory = {};
  for (const row of rows) {
    byCategory[row.category] = byCategory[row.category] || [];
    byCategory[row.category].push(row);
  }

  let md = `# Product Catalog — Asset Collection Checklist

> **Generated:** ${generatedAt}  
> **Products:** ${rows.length}  
> **Source:** \`app-slab-inventory/src/lib/productCatalogData.ts\`

This checklist is for **internal asset collection only**. It does not modify the live catalog.
Fill in the \`notes\` column (CSV) with source URLs, vendor links, or AppSheet paths as you find assets.

## How to use

1. Regenerate when the workbook or catalog changes:
   \`\`\`bash
   node scripts/build-product-catalog.mjs
   node scripts/build-product-catalog-asset-manifest.mjs
   \`\`\`
2. Open \`product-catalog-asset-manifest.csv\` in Excel/Numbers/Sheets.
3. For each product, collect files into the **folder_path** using the recommended filenames.
4. Optional combo photos: \`combo-01.jpg\` … \`combo-09.jpg\`
5. Variant/finish images: one JPG per color (see \`variant_image_filenames\`).
6. Spec sheets go in \`app-slab-inventory/public/product-catalog/spec-sheets/<product-id>/\`.
7. After files exist, wire public URLs into catalog data in a future pass (not automatic yet).

## Folder structure

\`\`\`
app-slab-inventory/public/product-catalog/
  sinks/<product-id>/hero.jpg | installed.jpg | diagram.jpg | combo-*.jpg | <color>.jpg
  faucets/<product-id>/…
  specialty/<product-id>/…
  spec-sheets/<product-id>/<product-id>.pdf
\`\`\`

---

`;

  for (const [cat, catRows] of Object.entries(byCategory)) {
    md += `## ${cat} (${catRows.length})\n\n`;
    for (const row of catRows) {
      md += `### ${row.display_name}\n\n`;
      md += `- **ID:** \`${row.product_id}\`\n`;
      md += `- **Asset status:** ${row.asset_status}\n`;
      if (row.original_name) md += `- **Source name:** ${row.original_name}\n`;
      if (row.brand) md += `- **Brand:** ${row.brand}\n`;
      if (row.series) md += `- **Series:** ${row.series}\n`;
      if (row.sku) md += `- **SKU:** ${row.sku}\n`;
      if (row.esf_code && row.esf_code !== row.sku) md += `- **ESF#:** ${row.esf_code}\n`;
      if (row.catalog_numbers) md += `- **Catalog #s:** ${row.catalog_numbers}\n`;
      if (row.variants_colors) md += `- **Colors/finishes:** ${row.variants_colors}\n`;
      md += `- **Folder:** \`${row.folder_path}/\`\n`;
      md += `- **Hero:** \`${row.hero_filename}\` → ${row.hero_public_path}\n`;
      md += `- **Installed:** \`${row.installed_filename}\`\n`;
      md += `- **Diagram:** \`${row.diagram_filename}\`\n`;
      md += `- **Spec sheet:** \`${row.spec_sheet_filename}\` → ${row.spec_sheet_public_path}\n`;
      if (row.variant_image_filenames) md += `- **Variant images:** ${row.variant_image_filenames}\n`;
      md += `- **Notes:** _(source URL / vendor / AppSheet — fill in CSV)_\n\n`;
    }
  }

  return md;
}

function main() {
  const items = loadCatalogItems().filter((i) => i.active !== false);
  const rows = items.map(buildRow);
  const generatedAt = new Date().toISOString();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_CSV, toCsv(rows));
  fs.writeFileSync(OUT_MD, toMarkdown(rows, generatedAt));

  const counts = {};
  for (const row of rows) {
    counts[row.category] = (counts[row.category] || 0) + 1;
  }

  console.log(`Wrote ${rows.length} products → ${OUT_CSV}`);
  console.log(`Wrote checklist    → ${OUT_MD}`);
  console.log("Counts:", counts);
  console.log("\nNote: _local/ is gitignored. Use the CSV for bulk editing; MD for readable review.");
}

main();
