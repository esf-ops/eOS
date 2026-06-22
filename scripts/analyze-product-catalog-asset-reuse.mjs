#!/usr/bin/env node
/**
 * Product Catalog — Stone Selection workbook asset reuse analysis
 * ===============================================================
 *
 * Compares legacy Stone Selection.xlsx asset path references against the
 * display-only Product Catalog (productCatalogData.ts). Local analysis only —
 * does NOT copy asset files or modify catalog data/overrides/UI.
 *
 * Usage:
 *   node scripts/analyze-product-catalog-asset-reuse.mjs
 *
 * Workbook (gitignored):
 *   _local/catalog-source/Stone Selection.xlsx
 *   (copied from ~/Downloads/Stone Selection.xlsx if missing locally)
 *
 * Outputs (_local/, gitignored):
 *   _local/catalog-source/asset-reuse/stone-selection-asset-inventory.csv
 *   _local/catalog-source/asset-reuse/stone-selection-asset-reuse-matches.csv
 *   _local/catalog-source/asset-reuse/stone-selection-asset-reuse-summary.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCAL_WORKBOOK = path.join(ROOT, "_local/catalog-source/Stone Selection.xlsx");
const DOWNLOADS_WORKBOOK = path.join(process.env.HOME || "", "Downloads/Stone Selection.xlsx");
const CATALOG_TS = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogData.ts");
const OUT_DIR = path.join(ROOT, "_local/catalog-source/asset-reuse");
const OUT_INVENTORY = path.join(OUT_DIR, "stone-selection-asset-inventory.csv");
const OUT_MATCHES = path.join(OUT_DIR, "stone-selection-asset-reuse-matches.csv");
const OUT_SUMMARY = path.join(OUT_DIR, "stone-selection-asset-reuse-summary.md");

const KNOWN_ASSET_COLUMNS = new Set([
  "faucet",
  "combo photo",
  "2nd combo photo",
  "3rd combo photo",
  "4th combo photo",
  "5th combo photo",
  "installed picture",
  "installed image",
  "2nd installed image",
  "3rd install image",
  "4th install image",
  "diagram",
  "finish examples",
  "image",
  "photo",
  "combo photo 1",
  "combo photo 2",
  "combo photo 3",
  "combo photo 4",
  "combo photo 5",
  "combo photo 6",
  "combo photo 7",
  "combo photo 8",
  "combo photo 9",
  "sink picture",
  "faucet picture",
  "sample image",
  "slab image",
  "logo image",
]);

const PLACEHOLDER_PATTERNS = [
  /photo needed/i,
  /white blank/i,
  /placeholder/i,
  /needed\.jpg/i,
  /^[\s]*$/,
];

const SHEET_PRODUCT_CONFIG = {
  Faucets: {
    categoryHint: "faucet",
    nameCol: "Faucet name",
    esfIdCol: "ESF ID#",
    serialCol: "Serial number",
    suggestedUseCol: "Suggested Use",
    finishesCol: "Available Finishes",
  },
  Sinks: {
    categoryHint: "sink",
    nameCol: "Sink name",
    esfIdCol: "ESF#",
    suggestedUseCol: "Suggested Use",
    finishesCol: "Available Colors",
    catalogCols: [
      "White Catalog #",
      "Bisque Catalog #",
    ],
  },
  "Stone Selection": {
    categoryHint: "stone",
    nameCol: "Product Name",
    esfIdCol: "ESF ID#",
    materialCol: "Material",
  },
  Backsplash: {
    categoryHint: "specialty",
    nameCol: "Series",
    esfIdCol: "Image ID#",
    partCol: "Part #",
  },
  Lighting: { categoryHint: "lighting" },
  Cabinets: { categoryHint: "cabinets" },
  "Customize Experience": {
    categoryHint: "branding",
    nameCol: "Company",
    esfIdCol: "Tag",
  },
};

function ensureWorkbook() {
  if (fs.existsSync(LOCAL_WORKBOOK)) return LOCAL_WORKBOOK;
  if (fs.existsSync(DOWNLOADS_WORKBOOK)) {
    fs.mkdirSync(path.dirname(LOCAL_WORKBOOK), { recursive: true });
    fs.copyFileSync(DOWNLOADS_WORKBOOK, LOCAL_WORKBOOK);
    console.log(`Copied workbook to ${LOCAL_WORKBOOK}`);
    return LOCAL_WORKBOOK;
  }
  console.error(`Workbook not found. Expected one of:`);
  console.error(`  ${LOCAL_WORKBOOK}`);
  console.error(`  ${DOWNLOADS_WORKBOOK}`);
  process.exit(1);
}

function loadCatalogItems() {
  if (!fs.existsSync(CATALOG_TS)) {
    console.error(`Catalog data not found: ${CATALOG_TS}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CATALOG_TS, "utf8");
  const match = raw.match(/export const PRODUCT_CATALOG_ITEMS[^=]*=\s*(\[[\s\S]*\])\s*;/);
  if (!match) {
    console.error("Could not parse PRODUCT_CATALOG_ITEMS.");
    process.exit(1);
  }
  return JSON.parse(match[1].replace(/ as const/g, ""));
}

function normalizeSku(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

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
  if (category === "sink_accessory") return "sink-accessories";
  return "sinks";
}

function looksLikeAssetPath(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!s || s.length < 4) return false;
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(s))) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/_Images\/|\\/i.test(s)) return true;
  return /\.(jpg|jpeg|png|gif|webp|pdf)(\b|$)/i.test(s);
}

function inferAssetType(columnName) {
  const c = String(columnName || "").toLowerCase().trim();
  if (c.includes("combo")) return "combo";
  if (c.includes("installed") || c.includes("install image")) return "installed";
  if (c.includes("diagram")) return "diagram";
  if (c.includes("finish example")) return "finish_example";
  if (c.includes("spec") || c.endsWith(".pdf")) return "spec_sheet";
  if (c === "faucet" || c.includes("sink picture") || c.includes("faucet picture")) return "hero";
  if (c.includes("sample image") || c.includes("slab image")) return "hero";
  if (c.includes("logo")) return "logo";
  if (c.includes("photo") || c.includes("image")) return "gallery";
  return "other";
}

function isKnownAssetColumn(columnName) {
  const c = String(columnName || "").toLowerCase().trim();
  if (KNOWN_ASSET_COLUMNS.has(c)) return true;
  return /photo|image|diagram|finish|logo|spec|\.jpg|\.png|\.pdf/i.test(c);
}

function detectAssetColumns(headers, rows) {
  const cols = [];
  for (const header of headers) {
    if (!header || String(header).trim().length === 0) continue;
    const h = String(header).trim();
    let hits = 0;
    let checked = 0;
    for (const row of rows.slice(0, Math.min(rows.length, 200))) {
      const val = row[h];
      if (val === undefined || val === null || val === "") continue;
      checked++;
      if (looksLikeAssetPath(String(val))) hits++;
    }
    const ratio = checked > 0 ? hits / checked : 0;
    if (isKnownAssetColumn(h) || ratio >= 0.25) {
      cols.push(h);
    }
  }
  return cols;
}

function extractCatalogNumbers(row, config) {
  const nums = [];
  for (const col of config.catalogCols ?? []) {
    const raw = String(row[col] || "").trim();
    if (!raw) continue;
    const m = raw.match(/\b(\d{4,}[A-Z0-9-]*)\b/i);
    if (m) nums.push(m[1]);
    else nums.push(raw);
  }
  return nums;
}

function rowLooksLikeProduct(row, config, sheetName) {
  if (!config) return false;
  const name = config.nameCol ? String(row[config.nameCol] || "").trim() : "";
  const serial = config.serialCol ? String(row[config.serialCol] || "").trim() : "";
  const esfId = config.esfIdCol ? String(row[config.esfIdCol] || "").trim() : "";
  if (name || serial || esfId) return true;
  if (sheetName === "Backsplash" && row["Photo"]) return true;
  return false;
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "with", "for", "handle", "single"].includes(w))
  );
}

function nameSimilarity(a, b) {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

function buildCatalogIndexes(items) {
  const byExactSku = new Map();
  const allItems = items.filter((i) => i.active);

  for (const item of allItems) {
    const keys = new Set();
    for (const field of [item.sku, item.model, item.esfCode, item.originalName, item.sourceDescription]) {
      const n = normalizeSku(field);
      if (n.length >= 4) keys.add(n);
    }
    for (const v of item.variants ?? []) {
      const cn = normalizeSku(v.catalogNumber);
      if (cn.length >= 4) keys.add(cn);
    }
    for (const key of keys) {
      if (!byExactSku.has(key)) byExactSku.set(key, []);
      byExactSku.get(key).push(item);
    }
  }

  return { byExactSku, allItems };
}

function sheetCategoryMatchesCatalog(sheetHint, catalogCategory) {
  if (sheetHint === "faucet") return catalogCategory === "faucet";
  if (sheetHint === "sink") return catalogCategory === "sink" || catalogCategory === "sink_accessory";
  if (sheetHint === "specialty") return catalogCategory === "specialty_add_on";
  return false;
}

function matchWorkbookRowToCatalog(row, sheetName, config, indexes) {
  const serial = config.serialCol ? String(row[config.serialCol] || "").trim() : "";
  const catalogNums = extractCatalogNumbers(row, config);
  const name = config.nameCol ? String(row[config.nameCol] || "").trim() : "";
  const candidates = new Map();

  const probeKeys = [
    ...catalogNums.map(normalizeSku),
    normalizeSku(serial),
  ].filter((k) => k.length >= 4);

  for (const key of probeKeys) {
    const hits = indexes.byExactSku.get(key) ?? [];
    for (const item of hits) {
      candidates.set(item.id, { item, confidence: "exact_model", reason: `SKU/model key ${key}` });
    }
  }

  if (candidates.size === 0 && serial) {
    const serialNorm = normalizeSku(serial);
    for (const item of indexes.allItems) {
      const fields = [item.sku, item.model, item.esfCode, item.originalName, ...(item.variants ?? []).map((v) => v.catalogNumber)];
      for (const field of fields) {
        const fn = normalizeSku(field);
        if (!fn || fn.length < 4) continue;
        if (fn.includes(serialNorm) || serialNorm.includes(fn)) {
          if (config.categoryHint && !sheetCategoryMatchesCatalog(config.categoryHint, item.category)) continue;
          candidates.set(item.id, { item, confidence: "normalized_model", reason: `${serialNorm} ~ ${fn}` });
        }
      }
    }
  }

  if (candidates.size === 0 && name) {
    for (const item of indexes.allItems) {
      if (config.categoryHint && !sheetCategoryMatchesCatalog(config.categoryHint, item.category)) continue;
      const sim = Math.max(
        nameSimilarity(name, item.name),
        nameSimilarity(name, item.originalName || ""),
        nameSimilarity(name, item.sourceDescription || "")
      );
      if (sim >= 0.45) {
        candidates.set(item.id, { item, confidence: "likely_name", reason: `name similarity ${sim.toFixed(2)}` });
      }
    }
  }

  if (candidates.size === 0 && name && config.categoryHint) {
    for (const item of indexes.allItems) {
      if (!sheetCategoryMatchesCatalog(config.categoryHint, item.category)) continue;
      const sim = nameSimilarity(name, item.name);
      if (sim >= 0.25) {
        candidates.set(item.id, { item, confidence: "manual_review", reason: `weak name similarity ${sim.toFixed(2)}` });
      }
    }
  }

  return Array.from(candidates.values()).sort((a, b) => {
    const rank = { exact_model: 0, normalized_model: 1, likely_name: 2, manual_review: 3 };
    return rank[a.confidence] - rank[b.confidence];
  });
}

function recommendedTargetUrl(item, assetType, comboIndex = 0) {
  const folder = categoryFolder(item.category);
  const base = `/product-catalog/${folder}/${item.id}`;
  switch (assetType) {
    case "hero":
      return `${base}/hero.jpg`;
    case "installed":
      return `${base}/installed.jpg`;
    case "diagram":
      return `${base}/diagram.jpg`;
    case "finish_example":
      return `${base}/finish-example-${String(comboIndex + 1).padStart(2, "0")}.jpg`;
    case "spec_sheet":
      return `/product-catalog/spec-sheets/${item.id}/${item.id}.pdf`;
    case "combo":
      return `${base}/combo-${String(comboIndex + 1).padStart(2, "0")}.jpg`;
    default:
      return `${base}/gallery-${String(comboIndex + 1).padStart(2, "0")}.jpg`;
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => csvEscape(r[c])).join(",")),
  ].join("\n") + "\n";
}

function parseWorkbook(workbookPath) {
  const wb = XLSX.readFile(workbookPath);
  const inventory = [];
  const productRows = [];
  const assetPathSet = new Set();
  const stats = {
    sheets: wb.SheetNames,
    rowsInspected: 0,
    productLikeBySheet: {},
    assetRefsBySheet: {},
    assetRefsByType: {},
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    stats.rowsInspected += rawRows.length;
    stats.productLikeBySheet[sheetName] = 0;
    stats.assetRefsBySheet[sheetName] = 0;

    const config = SHEET_PRODUCT_CONFIG[sheetName] ?? null;
    const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const assetColumns = detectAssetColumns(headers, rawRows);

    for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
      const row = rawRows[rowIndex];
      if (!rowLooksLikeProduct(row, config, sheetName)) continue;

      const name = config?.nameCol ? String(row[config.nameCol] || "").trim() : "";
      const esfId = config?.esfIdCol ? String(row[config.esfIdCol] || "").trim() : "";
      const serial = config?.serialCol ? String(row[config.serialCol] || "").trim() : "";
      const suggestedUse = config?.suggestedUseCol ? String(row[config.suggestedUseCol] || "").trim() : "";
      const finishes = config?.finishesCol ? String(row[config.finishesCol] || "").trim() : "";
      const catalogNumbers = extractCatalogNumbers(row, config ?? {}).join("; ");

      let assetCountForRow = 0;
      for (const col of assetColumns) {
        const raw = String(row[col] || "").trim();
        if (!looksLikeAssetPath(raw)) continue;

        const assetType = inferAssetType(col);
        assetPathSet.add(raw);
        assetCountForRow++;
        stats.assetRefsBySheet[sheetName]++;
        stats.assetRefsByType[assetType] = (stats.assetRefsByType[assetType] || 0) + 1;

        inventory.push({
          sheetName,
          rowIndex: rowIndex + 2,
          esfId,
          productName: name,
          serialOrSku: serial || catalogNumbers,
          suggestedUse,
          availableFinishes: finishes,
          assetColumn: col,
          assetType,
          assetPath: raw,
        });
      }

      if (name || serial || esfId || assetCountForRow > 0) {
        stats.productLikeBySheet[sheetName]++;
        productRows.push({
          sheetName,
          rowIndex: rowIndex + 2,
          esfId,
          productName: name,
          serialOrSku: serial || catalogNumbers,
          suggestedUse,
          availableFinishes: finishes,
          assetCount: assetCountForRow,
          config,
          row,
          assetColumns,
        });
      }
    }
  }

  return { inventory, productRows, assetPathSet, stats };
}

function buildMatches(productRows, indexes) {
  const matches = [];
  const matchedProductIds = new Set();
  const comboCounters = new Map();

  for (const prow of productRows) {
    if (!prow.config || !["faucet", "sink", "specialty"].includes(prow.config.categoryHint)) continue;

    const catalogMatches = matchWorkbookRowToCatalog(prow.row, prow.sheetName, prow.config, indexes);
    const best = catalogMatches[0];
    if (!best) continue;

    matchedProductIds.add(best.item.id);

    for (const col of prow.assetColumns) {
      const raw = String(prow.row[col] || "").trim();
      if (!looksLikeAssetPath(raw)) continue;

      const assetType = inferAssetType(col);
      const comboKey = `${best.item.id}:${assetType}`;
      const comboIndex = assetType === "combo" || assetType === "gallery" || assetType === "finish_example"
        ? comboCounters.get(comboKey) ?? 0
        : 0;
      if (assetType === "combo" || assetType === "gallery" || assetType === "finish_example") {
        comboCounters.set(comboKey, comboIndex + 1);
      }

      matches.push({
        productId: best.item.id,
        catalogCategory: best.item.category,
        catalogName: best.item.name,
        confidence: best.confidence,
        matchReason: best.reason,
        workbookSheet: prow.sheetName,
        workbookRow: prow.rowIndex,
        workbookProductName: prow.productName,
        workbookSerialOrSku: prow.serialOrSku,
        sourceAssetPath: raw,
        assetType,
        recommendedTargetPublicUrl: recommendedTargetUrl(best.item, assetType, comboIndex),
      });
    }
  }

  return { matches, matchedProductIds };
}

function categoryLabel(category) {
  return {
    sink: "sinks",
    sink_accessory: "sink_accessories",
    faucet: "faucets",
    specialty_add_on: "specialty",
  }[category] || category;
}

function buildSummary(stats, inventory, matches, matchedProductIds, catalogItems, assetPathSet, productRows) {
  const activeCatalog = catalogItems.filter((i) => i.active);
  const unmatchedCatalog = activeCatalog.filter((i) => !matchedProductIds.has(i.id));

  const matchedByCategory = { sinks: 0, sink_accessories: 0, faucets: 0, specialty: 0 };
  for (const id of matchedProductIds) {
    const item = activeCatalog.find((i) => i.id === id);
    if (!item) continue;
    matchedByCategory[categoryLabel(item.category)]++;
  }

  const reusableAssetsByCategory = { sinks: 0, sink_accessories: 0, faucets: 0, specialty: 0 };
  for (const m of matches) {
    reusableAssetsByCategory[categoryLabel(m.catalogCategory)]++;
  }

  const confidenceCounts = { exact_model: 0, normalized_model: 0, likely_name: 0, manual_review: 0 };
  const matchedWorkbookRows = new Set();
  const rowConfidence = new Map();
  for (const m of matches) {
    const pair = `${m.workbookSheet}:${m.workbookRow}`;
    matchedWorkbookRows.add(pair);
    if (!rowConfidence.has(pair)) rowConfidence.set(pair, m.confidence);
  }
  for (const conf of rowConfidence.values()) {
    confidenceCounts[conf] = (confidenceCounts[conf] || 0) + 1;
  }

  const plumbingRows = productRows.filter(
    (p) => p.config && ["faucet", "sink", "specialty"].includes(p.config.categoryHint)
  );
  const unmatchedWorkbookRows = plumbingRows.filter(
    (p) => !matchedWorkbookRows.has(`${p.sheetName}:${p.rowIndex}`)
  );

  const totalAssetRefs = inventory.length;
  const productLikeTotal = Object.values(stats.productLikeBySheet).reduce((a, b) => a + b, 0);

  let md = `# Stone Selection — Product Catalog Asset Reuse Summary

> **Generated:** ${new Date().toISOString()}  
> **Workbook:** \`_local/catalog-source/Stone Selection.xlsx\`  
> **New catalog:** \`app-slab-inventory/src/lib/productCatalogData.ts\` (${activeCatalog.length} active products)

Analysis only — no asset files copied, no catalog/overrides/UI changes.

## Overview

| Metric | Count |
|---|---|
| Workbook sheets analyzed | ${stats.sheets.length} |
| Total workbook rows inspected | ${stats.rowsInspected} |
| Product-like rows | ${productLikeTotal} |
| Total asset path references | ${totalAssetRefs} |
| Unique asset paths | ${assetPathSet.size} |
| New catalog products matched | ${matchedProductIds.size} |
| Unmatched new catalog products | ${unmatchedCatalog.length} |
| Reusable asset mappings (matched rows × assets) | ${matches.length} |

## Product-like rows by sheet

| Sheet | Product-like rows | Asset references |
|---|---|---|
`;

  for (const sheet of stats.sheets) {
    md += `| ${sheet} | ${stats.productLikeBySheet[sheet] || 0} | ${stats.assetRefsBySheet[sheet] || 0} |\n`;
  }

  md += `\n## Asset references by type\n\n| Asset type | Count |\n|---|---|\n`;
  for (const [type, count] of Object.entries(stats.assetRefsByType).sort((a, b) => b[1] - a[1])) {
    md += `| ${type} | ${count} |\n`;
  }

  md += `\n## Matched new catalog products by category\n\n| Category | Products matched | Reusable asset mappings |\n|---|---|---|\n`;
  for (const cat of ["sinks", "sink_accessories", "faucets", "specialty"]) {
    md += `| ${cat} | ${matchedByCategory[cat]} | ${reusableAssetsByCategory[cat]} |\n`;
  }

  md += `\n## Match confidence (unique workbook rows matched)\n\n| Confidence | Count |\n|---|---|\n`;
  for (const [conf, count] of Object.entries(confidenceCounts)) {
    md += `| ${conf} | ${count} |\n`;
  }

  md += `\n## Unmatched new catalog products (${unmatchedCatalog.length})\n\n`;
  if (unmatchedCatalog.length === 0) {
    md += `_All active catalog products had at least one workbook asset match._\n`;
  } else {
    const byCat = {};
    for (const item of unmatchedCatalog) {
      const c = categoryLabel(item.category);
      byCat[c] = byCat[c] || [];
      byCat[c].push(item);
    }
    for (const [cat, items] of Object.entries(byCat)) {
      md += `\n### ${cat} (${items.length})\n\n`;
      for (const item of items.slice(0, 40)) {
        md += `- \`${item.id}\` — ${item.name}${item.sku ? ` (${item.sku})` : ""}\n`;
      }
      if (items.length > 40) md += `- … and ${items.length - 40} more\n`;
    }
  }

  const unmatchedWorkbook = unmatchedWorkbookRows.length;
  md += `\n## Workbook products/assets without catalog match\n\n`;
  md += `${unmatchedWorkbook} Faucets/Sinks/Backsplash product rows had no catalog mapping.\n\n`;
  if (unmatchedWorkbookRows.length > 0) {
    for (const row of unmatchedWorkbookRows.slice(0, 25)) {
      md += `- ${row.sheetName} row ${row.rowIndex}: ${row.productName || "(unnamed)"}${row.serialOrSku ? ` — ${row.serialOrSku}` : ""}\n`;
    }
    if (unmatchedWorkbookRows.length > 25) {
      md += `- … and ${unmatchedWorkbookRows.length - 25} more\n`;
    }
    md += `\n`;
  }
  md += `Sheets primarily outside the new plumbing catalog scope: **Stone Selection** (quartz/granite slabs), **Backsplash**, **FAQs**, **Stores**, **Customize Experience**.\n`;

  md += `\n## Notes\n\n`;
  md += `- Placeholder paths (e.g. \`Photo needed\`, \`white blank\`) are excluded from asset counts.\n`;
  md += `- Recommended target URLs follow the \`app-slab-inventory/public/product-catalog/\` layout used by \`productCatalogAssets.ts\`.\n`;
  md += `- Review \`stone-selection-asset-reuse-matches.csv\` before copying any legacy files into \`public/\`.\n`;

  return md;
}

function main() {
  const workbookPath = ensureWorkbook();
  const catalogItems = loadCatalogItems();
  const indexes = buildCatalogIndexes(catalogItems);
  const { inventory, productRows, assetPathSet, stats } = parseWorkbook(workbookPath);
  const { matches, matchedProductIds } = buildMatches(productRows, indexes);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(
    OUT_INVENTORY,
    toCsv(inventory, [
      "sheetName", "rowIndex", "esfId", "productName", "serialOrSku",
      "suggestedUse", "availableFinishes", "assetColumn", "assetType", "assetPath",
    ])
  );

  fs.writeFileSync(
    OUT_MATCHES,
    toCsv(matches, [
      "productId", "catalogCategory", "catalogName", "confidence", "matchReason",
      "workbookSheet", "workbookRow", "workbookProductName", "workbookSerialOrSku",
      "sourceAssetPath", "assetType", "recommendedTargetPublicUrl",
    ])
  );

  fs.writeFileSync(
    OUT_SUMMARY,
    buildSummary(stats, inventory, matches, matchedProductIds, catalogItems, assetPathSet, productRows)
  );

  console.log("Stone Selection asset reuse analysis");
  console.log(`  Workbook:              ${workbookPath}`);
  console.log(`  Sheets analyzed:       ${stats.sheets.length}`);
  console.log(`  Rows inspected:        ${stats.rowsInspected}`);
  console.log(`  Asset path references: ${inventory.length}`);
  console.log(`  Unique asset paths:    ${assetPathSet.size}`);
  console.log(`  Catalog products matched: ${matchedProductIds.size} / ${catalogItems.filter((i) => i.active).length}`);
  console.log(`  Reusable asset mappings:  ${matches.length}`);
  console.log(`\nWrote ${OUT_INVENTORY}`);
  console.log(`Wrote ${OUT_MATCHES}`);
  console.log(`Wrote ${OUT_SUMMARY}`);
}

main();
