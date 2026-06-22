#!/usr/bin/env node
/**
 * Product Catalog — Batch asset audit (local, gitignored output)
 * ==============================================================
 *
 * Reads asset override paths from productCatalogAssets.ts and checks whether
 * each referenced file exists under app-slab-inventory/public/.
 *
 * Does NOT download assets, scrape vendor sites, or modify catalog data.
 * Missing files are expected until Chris collects/crops assets manually.
 *
 * Usage:
 *   node scripts/audit-product-catalog-assets.mjs
 *   npm run eos:audit:product-catalog-assets
 *
 * Output (_local/, gitignored):
 *   _local/catalog-source/asset-audit/product-catalog-asset-audit.csv
 *   _local/catalog-source/asset-audit/product-catalog-asset-audit.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OVERRIDES_TS = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogAssets.ts");
const DISPLAY_SPLITS_TS = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogDisplay.ts");
const PUBLIC_DIR = path.join(ROOT, "app-slab-inventory/public");
const OUT_DIR = path.join(ROOT, "_local/catalog-source/asset-audit");
const OUT_CSV = path.join(OUT_DIR, "product-catalog-asset-audit.csv");
const OUT_MD = path.join(OUT_DIR, "product-catalog-asset-audit.md");

const RECOMMENDED_SOURCE = {
  "blanco-blanco-diamond-50-50-regular-divide":
    "BLANCO Diamond 50/50 Regular Divide — assets under blanco-blanco-diamond-50-50/.",
  "blanco-blanco-diamond-50-50-low-divide":
    "BLANCO Diamond 50/50 Low Divide — assets under blanco-blanco-diamond-50-50-low-divide-sinks/.",
  "blanco-blanco-precis-50-50-sinks":
    "BLANCO Precis 50/50 — assets under blanco-blanco-precis-50-50-sinks/.",
  "blanco-blanco-precis-60-40-sinks-regular-divide":
    "BLANCO Precis 60/40 Regular Divide — assets under blanco-blanco-precis-60-40-sinks-regular-divide/.",
  "blanco-blanco-precis-60-40-sinks-low-divide":
    "BLANCO Precis 60/40 Low Divide — assets under blanco-blanco-precis-60-40-sinks-low-divide/.",
  "blanco-blanco-diamond-60-40-sinks-regular-divide":
    "BLANCO Diamond 60/40 Regular Divide — assets under blanco-blanco-diamond-60-40-sinks/.",
  "blanco-blanco-diamond-60-40-sinks-low-divide":
    "BLANCO Diamond 60/40 Low Divide — assets under blanco-blanco-diamond-60-40-low-divide-sinks/.",
  "blanco-blanco-precis-super-single-sinks":
    "Official BLANCO Precis Super Single product page and spec sheet.",
  "faucet-delta-9176-cz-pr-dst":
    "Official Delta 9176 Stryke product page, spec sheet, and install docs (exclude retailer quotes).",
  "faucet-deltarp101629czpr":
    "Official Delta RP101629 soap/lotion dispenser product/spec assets.",
  "faucet-moen-7864srs":
    "Official Moen 7864SRS Sleek product page and spec docs.",
  "kansas-1512um18-2":
    "KDC showroom PDF / pdf-source-map and Winsinks program first; official vendor cut sheet if found.",
};

function expandTemplateHelpers(text) {
  const finishKeys = [
    "cafe-brown", "anthracite", "white", "truffle", "cinder", "coal-black",
    "soft-white", "gray", "volcano-gray",
  ];

  let expanded = text
    .replace(/\$\{sinkBase\("([^"]+)"\)\}/g, "/product-catalog/sinks/$1")
    .replace(/\$\{faucetBase\("([^"]+)"\)\}/g, "/product-catalog/faucets/$1")
    .replace(/specSheetUrl\("([^"]+)"\)/g, "/product-catalog/spec-sheets/$1/$1.pdf");

  expanded = expanded.replace(
    /finishImageUrls:\s*blancoSinkFinishImageUrls\("([^"]+)"\)/g,
    (_match, productId) => {
      const lines = finishKeys.map((key) => {
        const file = key === "gray" || key === "volcano-gray" ? "volcano-gray.jpg" : `${key}.jpg`;
        return `      "${key}": \`/product-catalog/sinks/${productId}/${file}\`,`;
      });
      return `finishImageUrls: {\n${lines.join("\n")}\n    }`;
    }
  );

  return expanded;
}

function parseOverridesFromTs(content) {
  const start = content.indexOf("const PRODUCT_CATALOG_ASSET_OVERRIDES");
  if (start < 0) throw new Error("PRODUCT_CATALOG_ASSET_OVERRIDES not found");
  const arrStart = content.indexOf("[", start);
  const arrEnd = content.indexOf("\n];", arrStart);
  if (arrStart < 0 || arrEnd < 0) throw new Error("Override array bounds not found");

  let body = expandTemplateHelpers(content.slice(arrStart + 1, arrEnd));
  const overrides = [];

  const objectChunks = body.split(/\n  \},?\n/).map((s) => s.trim()).filter(Boolean);
  for (let chunk of objectChunks) {
    chunk = chunk.replace(/^\[\s*/, "").replace(/\{\s*/, "").replace(/\}\s*$/, "");
    const productId = chunk.match(/productId:\s*"([^"]+)"/)?.[1];
    if (!productId) continue;

    const sourceNotes = chunk.match(/sourceNotes:\s*\n?\s*"([^"]+)"/s)?.[1]
      || chunk.match(/sourceNotes:\s*"([^"]+)"/)?.[1]
      || "";

    const override = { productId, sourceNotes };

    const scalarFields = [
      ["imageUrl", "hero"],
      ["installedImageUrl", "installed"],
      ["diagramUrl", "diagram"],
      ["specSheetUrl", "spec_sheet"],
    ];
    for (const [field, assetType] of scalarFields) {
      const m = chunk.match(new RegExp(`${field}:\\s*\`([^\`]+)\``));
      if (m) (override.assets ||= []).push({ assetType, url: m[1] });
      const m2 = chunk.match(new RegExp(`${field}:\\s*"([^"]+)"`));
      if (m2) (override.assets ||= []).push({ assetType, url: m2[1] });
      const m3 = chunk.match(new RegExp(`${field}:\\s*(/product-catalog/[^,\\n]+)`));
      if (m3) (override.assets ||= []).push({ assetType, url: m3[1].trim() });
    }

    const arrayFields = [
      ["comboPhotoUrls", "combo"],
      ["gallery", "gallery"],
      ["finishExampleUrls", "finish_example"],
    ];
    for (const [field, assetType] of arrayFields) {
      const block = chunk.match(new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`));
      if (!block) continue;
      const urls = [...block[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      for (let i = 0; i < urls.length; i++) {
        (override.assets ||= []).push({ assetType: `${assetType}_${String(i + 1).padStart(2, "0")}`, url: urls[i] });
      }
    }

    const variantBlock = chunk.match(/variantImageUrls:\s*\{([\s\S]*?)\}/);
    if (variantBlock) {
      for (const m of variantBlock[1].matchAll(/"([^"]+)":\s*`([^`]+)`/g)) {
        (override.assets ||= []).push({ assetType: "variant", variantId: m[1], url: m[2] });
      }
    }

    const finishBlock = chunk.match(/finishImageUrls:\s*\{([\s\S]*?)\}/);
    if (finishBlock) {
      for (const m of finishBlock[1].matchAll(/"?([^":\s]+)"?:\s*`([^`]+)`/g)) {
        (override.assets ||= []).push({ assetType: "finish", variantId: m[1], url: m[2] });
      }
    }

    const defaultFinish = chunk.match(/defaultFinishKey:\s*"([^"]+)"/)?.[1];
    if (defaultFinish) {
      (override.assets ||= []).push({
        assetType: "default_finish_key",
        variantId: defaultFinish,
        url: "",
      });
    }

    overrides.push(override);
  }

  return overrides;
}

function parseDisplaySplitsFromTs(content) {
  const splits = [];
  const block = content.match(
    /export const PRODUCT_CATALOG_DISPLAY_SPLITS[^=]*=\s*\[([\s\S]*?)\n\];/
  );
  if (!block) return splits;

  for (const chunk of block[1].split(/\n  \},?\n/)) {
    const displayId = chunk.match(/displayId:\s*"([^"]+)"/)?.[1];
    const sourceProductId = chunk.match(/sourceProductId:\s*"([^"]+)"/)?.[1];
    const displayName = chunk.match(/displayName:\s*"([^"]+)"/)?.[1];
    if (displayId && sourceProductId) {
      splits.push({ displayId, sourceProductId, displayName: displayName || "" });
    }
  }
  return splits;
}

function publicUrlToLocalPath(publicUrl) {
  const rel = String(publicUrl || "").replace(/^\//, "");
  return path.join(PUBLIC_DIR, rel);
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildRows(overrides, displaySplits) {
  const splitByDisplayId = new Map(displaySplits.map((s) => [s.displayId, s]));
  const rows = [];
  for (const o of overrides) {
    const split = splitByDisplayId.get(o.productId);
    for (const asset of o.assets || []) {
      if (asset.assetType === "default_finish_key") continue;
      const localPath = publicUrlToLocalPath(asset.url);
      const exists = asset.url ? fs.existsSync(localPath) : false;
      rows.push({
        productId: o.productId,
        catalogSourceId: split?.sourceProductId || "",
        displayName: split?.displayName || "",
        assetType: asset.assetType,
        variantId: asset.variantId || "",
        expectedPublicUrl: asset.url,
        expectedLocalPath: localPath.replace(ROOT + path.sep, ""),
        exists: exists ? "yes" : "no",
        sourceNotes: o.sourceNotes,
        recommendedSource: RECOMMENDED_SOURCE[o.productId] || "",
        notes: exists
          ? split
            ? `Display split from generated ${split.sourceProductId}.`
            : ""
          : "File not on disk yet — collect from recommended source and save to expectedLocalPath.",
      });
    }
  }
  return rows;
}

function summarize(rows) {
  const total = rows.length;
  const found = rows.filter((r) => r.exists === "yes").length;
  const missing = total - found;

  const byProduct = {};
  for (const r of rows) {
    byProduct[r.productId] = byProduct[r.productId] || { total: 0, found: 0 };
    byProduct[r.productId].total++;
    if (r.exists === "yes") byProduct[r.productId].found++;
  }

  let complete = 0;
  let partial = 0;
  let missingProducts = 0;
  for (const stats of Object.values(byProduct)) {
    if (stats.found === 0) missingProducts++;
    else if (stats.found === stats.total) complete++;
    else partial++;
  }

  return { total, found, missing, complete, partial, missingProducts, byProduct };
}

function toCsv(rows) {
  const cols = [
    "productId", "catalogSourceId", "displayName", "assetType", "variantId",
    "expectedPublicUrl", "expectedLocalPath", "exists", "sourceNotes",
    "recommendedSource", "notes",
  ];
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")),
  ].join("\n") + "\n";
}

function toMarkdown(rows, summary, generatedAt) {
  let md = `# Product Catalog — Asset Audit

> **Generated:** ${generatedAt}  
> **Overrides source:** \`app-slab-inventory/src/lib/productCatalogAssets.ts\`  
> **Display splits:** \`app-slab-inventory/src/lib/productCatalogDisplay.ts\`  
> **Public root:** \`app-slab-inventory/public/\`

Missing files are **expected** until assets are collected manually. No downloads or scraping performed.

Display split products (e.g. Diamond 60/40 Regular/Low Divide) use stable display IDs while generated catalog data keeps a single source row.

## Summary

| Metric | Count |
|---|---|
| Total expected assets | ${summary.total} |
| Found on disk | ${summary.found} |
| Missing | ${summary.missing} |
| Products complete | ${summary.complete} |
| Products partial | ${summary.partial} |
| Products missing all assets | ${summary.missingProducts} |

## By product

`;

  const byProduct = {};
  for (const r of rows) {
    byProduct[r.productId] = byProduct[r.productId] || [];
    byProduct[r.productId].push(r);
  }

  for (const [productId, productRows] of Object.entries(byProduct)) {
    const found = productRows.filter((r) => r.exists === "yes").length;
    const splitLabel = productRows[0]?.catalogSourceId
      ? ` — split from \`${productRows[0].catalogSourceId}\``
      : "";
    md += `### ${productId} (${found}/${productRows.length} on disk)${splitLabel}\n\n`;
    if (productRows[0]?.displayName) {
      md += `**Display name:** ${productRows[0].displayName}\n\n`;
    }
    if (productRows[0]?.recommendedSource) {
      md += `**Recommended source:** ${productRows[0].recommendedSource}\n\n`;
    }
    md += `| Type | Variant | URL | Exists |\n|---|---|---|---|\n`;
    for (const r of productRows) {
      md += `| ${r.assetType} | ${r.variantId || "—"} | \`${r.expectedPublicUrl}\` | ${r.exists} |\n`;
    }
    md += "\n";
  }

  const missingRows = rows.filter((r) => r.exists === "no");
  if (missingRows.length) {
    md += `## Missing files (${missingRows.length})\n\n`;
    for (const r of missingRows) {
      md += `- \`${r.expectedLocalPath}\` — ${r.productId} / ${r.assetType}${r.variantId ? ` / ${r.variantId}` : ""}\n`;
    }
  }

  return md;
}

function main() {
  if (!fs.existsSync(OVERRIDES_TS)) {
    console.error(`Overrides file not found: ${OVERRIDES_TS}`);
    process.exit(1);
  }

  const overrides = parseOverridesFromTs(fs.readFileSync(OVERRIDES_TS, "utf8"));
  const displaySplits = fs.existsSync(DISPLAY_SPLITS_TS)
    ? parseDisplaySplitsFromTs(fs.readFileSync(DISPLAY_SPLITS_TS, "utf8"))
    : [];
  const rows = buildRows(overrides, displaySplits);
  const summary = summarize(rows);
  const generatedAt = new Date().toISOString();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_CSV, toCsv(rows));
  fs.writeFileSync(OUT_MD, toMarkdown(rows, summary, generatedAt));

  console.log("Product Catalog asset audit");
  console.log(`  Display splits:        ${displaySplits.length}`);
  console.log(`  Products audited:     ${Object.keys(summary.byProduct).length}`);
  console.log(`  Total expected assets: ${summary.total}`);
  console.log(`  Found on disk:         ${summary.found}`);
  console.log(`  Missing:               ${summary.missing}`);
  console.log(`  Products complete:     ${summary.complete}`);
  console.log(`  Products partial:      ${summary.partial}`);
  console.log(`  Products missing all:  ${summary.missingProducts}`);
  console.log(`\nWrote ${OUT_CSV}`);
  console.log(`Wrote ${OUT_MD}`);
}

main();
