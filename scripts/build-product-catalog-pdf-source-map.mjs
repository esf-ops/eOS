#!/usr/bin/env node
/**
 * Product Catalog — PDF asset source map generator
 * ================================================
 *
 * Reads local showroom/quote PDFs and the product asset manifest, then builds
 * a gitignored source map linking PDF pages to catalog products.
 *
 * **Pricing is never exported.** WinSupply quote PDFs contain sale prices;
 * this script strips dollar amounts before parsing and notes that pricing was
 * intentionally excluded.
 *
 * Prerequisites:
 *   npm install   # pdfjs-dist (devDependency)
 *   node scripts/build-product-catalog.mjs
 *   node scripts/build-product-catalog-asset-manifest.mjs
 *
 * Place source PDFs in:
 *   _local/catalog-source/pdfs/
 *
 * Usage:
 *   node scripts/build-product-catalog-pdf-source-map.mjs
 *
 * Outputs (gitignored under _local/):
 *   _local/catalog-source/pdf-source-map/pdf-source-map.csv
 *   _local/catalog-source/pdf-source-map/pdf-source-map.md
 *   _local/catalog-source/pdf-source-map/previews/<pdf-slug>.png  (first-page preview, macOS)
 *
 * Does NOT modify productCatalogData.ts or wire image URLs automatically.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PDF_DIR = path.join(ROOT, "_local/catalog-source/pdfs");
const MANIFEST_CSV = path.join(ROOT, "_local/catalog-source/product-catalog-asset-manifest.csv");
const OUT_DIR = path.join(ROOT, "_local/catalog-source/pdf-source-map");
const OUT_CSV = path.join(OUT_DIR, "pdf-source-map.csv");
const OUT_MD = path.join(OUT_DIR, "pdf-source-map.md");
const PREVIEW_DIR = path.join(OUT_DIR, "previews");

const KNOWN_COLORS = [
  "Soft White", "Coal Black", "Concrete Gray", "Metallic Gray", "Café Brown", "Cafe Brown",
  "Anthracite", "Biscuit", "Bisque", "Cinder", "Truffle", "White", "Cafe", "Gray", "Black",
  "Silver", "Volcano Gray", "Midnight", "Taupe", "Asphalt", "Gunmetal", "Chrome", "Stainless",
  "Matte Black", "Arctic Stainless", "Spotshield", "Oil Rubbed Bronze",
];

const KDC_SECTION_RULES = [
  { re: /PRECISSERIES|\bPRECIS\b/i, section: "BLANCO Precis", categories: ["Sinks", "Sink Accessories"] },
  { re: /INTEOSWORKSTATION|\bINTEOS\b/i, section: "BLANCO Inteos Workstation", categories: ["Sinks"] },
  { re: /DIAMONDSERIES|\bDIAMOND\b/i, section: "BLANCO Diamond", categories: ["Sinks", "Sink Accessories"] },
  { re: /LIVENSERIES|\bLIVEN\b/i, section: "BLANCO Liven", categories: ["Sinks"] },
  { re: /IKONSERIES|\bIKON\b/i, section: "BLANCO Ikon", categories: ["Sinks"] },
  { re: /CERANAPROFINA|\bCERANA\b|\bPROFINA\b/i, section: "BLANCO Cerana / Profina", categories: ["Sinks"] },
  { re: /VALEASERIES|\bVALEA\b|\bRONDO\b/i, section: "BLANCO Valea / Rondo", categories: ["Sinks"] },
  { re: /\bPERFORMA\b/i, section: "Composite Performa", categories: ["Sinks"] },
  { re: /\bWINGRANITE\b/i, section: "Wingranite", categories: ["Sinks"] },
  { re: /\bWINCLAY\b/i, section: "Winclay Fireclay", categories: ["Sinks"] },
  { re: /\bWINSTEEL\b|\bWINSINKS\b|\bR1[05]\b|\bT-304\b/i, section: "Winsteel / Winsinks Stainless", categories: ["Sinks", "Sink Accessories"] },
  { re: /\bVANITY\b|\bDROPIN\b|\bDROP\s*IN\b/i, section: "Vanity sinks", categories: ["Sinks"] },
  { re: /ACCESSORIES|DIAMONDGRIDS|\bGRID\b|\bSTRAINER\b/i, section: "Sink accessories & grids", categories: ["Sink Accessories"] },
  { re: /\bFAUCETS\b|\bARTONA\b|\bRIVANA\b|\bEMPRESSA\b/i, section: "Faucets (showroom)", categories: ["Faucets"] },
  { re: /\bKDCSupply\b|\bWINSINKS\b.*2026/i, section: "KDC / Winsinks cover", categories: ["Sinks"] },
];

const WINSUPPLY_SECTION_RULES = [
  { re: /\bDISPLAY FAUCETS\b/i, section: "Display faucets", categories: ["Faucets"] },
  { re: /\bBATH DISPLAY\b/i, section: "Bath display faucets", categories: ["Faucets"] },
  { re: /\bEXISTING FAUCETS\b/i, section: "Existing faucets", categories: ["Faucets"] },
  { re: /\bDISPLAY\b/i, section: "Showroom display pairings", categories: ["Faucets", "Sinks"] },
];

function dewidifyPdfText(text) {
  let out = String(text || "");
  // ALL-CAPS letter-spaced runs: "P R E C I S" -> "PRECIS"
  out = out.replace(/(?:\b[A-Z]\s+){2,}[A-Z]\b/g, (m) => m.replace(/\s+/g, ""));
  // Title-case letter-spaced words: "S u p e r S i n g l e" -> "SuperSingle" (insert space before inner caps later)
  out = out.replace(/(?:\b[A-Za-z]\s+){2,}(?:[A-Za-z]\s+){0,12}[A-Za-z]\b/g, (m) => {
    if (m.length > 80) return m;
    return m.replace(/\s+/g, "");
  });
  // Insert spaces between joined TitleCase words: "SuperSingle" -> "Super Single"
  out = out.replace(/([a-z])([A-Z])/g, "$1 $2");
  out = out.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return out.replace(/\s+/g, " ").trim();
}

/** Remove sale prices and totals — never emit dollar values. */
function stripPricing(text) {
  return String(text || "")
    .replace(/\$[\d,]+(?:\.\d{2})?/g, " ")
    .replace(/\bSALE\s+PRICE\b/gi, " ")
    .replace(/\bCATEGORY\s+TOTAL\b[^A-Z]*/gi, "CATEGORY TOTAL ")
    .replace(/\bQTY\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return rows;
  const headers = parseCsvLine(lines[0]);
  for (let li = 1; li < lines.length; li++) {
    const vals = parseCsvLine(lines[li]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normToken(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function extractBrands(text) {
  const brands = new Set();
  const names = ["Blanco", "Delta", "Moen", "Kansas", "Wingranite", "Winclay", "Winsteel", "Winsinks", "KDC", "WinSupply"];
  const lower = text.toLowerCase();
  for (const name of names) {
    if (lower.includes(name.toLowerCase())) brands.add(name);
  }
  return [...brands];
}

function extractColors(text) {
  const found = [];
  const lower = text.toLowerCase();
  for (const c of KNOWN_COLORS) {
    if (lower.includes(c.toLowerCase())) found.push(c);
  }
  return [...new Set(found)];
}

function extractCatalogNumbers(text) {
  const nums = new Set();
  for (const m of text.matchAll(/\b(\d{5,6})\b/g)) nums.add(m[1]);
  for (const m of text.matchAll(/\b(\d{4}[A-Z]{2,}\d{0,4})\b/gi)) nums.add(m[1].toUpperCase());
  for (const m of text.matchAll(/\b([A-Z]{1,3}\d{4}[A-Z0-9/-]{0,12})\b/g)) {
    const t = m[1];
    if (t.length >= 6 && /\d/.test(t)) nums.add(t);
  }
  return [...nums];
}

function extractFaucetModels(text) {
  const models = new Set();
  for (const m of text.matchAll(/\b(Delta\s+[A-Z0-9.-]+)/gi)) models.add(m[1].replace(/\s+/g, " ").trim());
  for (const m of text.matchAll(/\b(Moen\s+[A-Z0-9]+(?:SRS|ORB|BL|BLG)?)\b/gi)) models.add(m[1].replace(/\s+/g, " ").trim());
  for (const m of text.matchAll(/\b(DeltaRP[A-Z0-9]+)\b/gi)) models.add(m[1]);
  return [...models];
}

function detectSections(text, rules) {
  const hits = [];
  for (const rule of rules) {
    if (rule.re.test(text)) hits.push(rule);
  }
  if (!hits.length) return [{ section: "General / unclassified", categories: ["Sinks", "Faucets", "Specialty Add-ons"] }];
  return hits;
}

function buildManifestIndex(manifestRows) {
  return manifestRows.map((row) => {
    const catalogNums = String(row.catalog_numbers || "").split(";").map((s) => s.trim()).filter(Boolean);
    const colors = String(row.variants_colors || "").split(";").map((s) => s.trim()).filter(Boolean);
    const tokens = new Set();
    for (const v of [
      row.product_id, row.display_name, row.original_name, row.brand, row.series,
      row.sku, row.esf_code, ...catalogNums, ...colors,
    ]) {
      const t = normToken(v);
      if (t.length >= 3) tokens.add(t);
    }
    return { ...row, catalogNums, colors, tokens };
  });
}

function matchManifestProducts(pageText, manifestIndex, sectionCategories) {
  const matched = new Map();
  const pageNorm = normToken(pageText);
  const pageCatalog = extractCatalogNumbers(pageText);
  const pageFaucets = extractFaucetModels(pageText);

  for (const item of manifestIndex) {
    let score = 0;
    if (sectionCategories.length && !sectionCategories.includes(item.category)) continue;

    for (const num of pageCatalog) {
      if (item.catalogNums.includes(num) || normToken(item.sku) === normToken(num) || normToken(item.esf_code) === normToken(num)) {
        score += 10;
      }
    }
    for (const fm of pageFaucets) {
      if (normToken(item.sku).includes(normToken(fm)) || normToken(item.display_name).includes(normToken(fm)) || normToken(item.original_name).includes(normToken(fm))) {
        score += 8;
      }
    }
    for (const tok of item.tokens) {
      if (tok.length >= 5 && pageNorm.includes(tok)) score += 2;
    }
    for (const c of item.colors) {
      if (pageText.toLowerCase().includes(c.toLowerCase())) score += 1;
    }
    if (item.brand && pageText.toLowerCase().includes(item.brand.toLowerCase())) score += 1;
    if (item.series && pageText.toLowerCase().includes(item.series.toLowerCase())) score += 2;
    if (item.display_name && pageText.toLowerCase().includes(item.display_name.toLowerCase().slice(0, 12))) score += 3;

    if (score >= 3) matched.set(item.product_id, { item, score });
  }

  return [...matched.values()].sort((a, b) => b.score - a.score).map((m) => m.item);
}

function parseWinsupplyProducts(rawText) {
  const text = stripPricing(dewidifyPdfText(rawText));
  const products = [];
  const lineParts = text.split(/(?=(?:Delta|Moen)\s+[A-Z0-9])/gi);
  for (const part of lineParts) {
    const chunk = part.trim();
    if (!/^(Delta|Moen)/i.test(chunk)) continue;
    const m = chunk.match(/^(Delta\s+[A-Z0-9.-]+|Moen\s+[A-Z0-9]+(?:SRS|ORB|BL)?|DeltaRP[A-Z0-9]+)\s+(.+)/i);
    if (!m) continue;
    const model = m[1].trim();
    let desc = m[2].trim();
    const hash = desc.match(/#([^#]+)/);
    const displayTag = hash ? hash[1].trim() : "";
    desc = desc.replace(/#[^#]+/g, "").replace(/\s+\d+\s*$/, "").trim();
    products.push({ model, description: desc, displayTag });
  }
  return products;
}

async function extractPdfPages(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const raw = tc.items.map((i) => i.str).join(" ");
    pages.push({ pageNumber: p, rawText: raw, text: dewidifyPdfText(raw) });
  }
  return pages;
}

function tryFirstPagePreview(pdfPath, pdfSlug) {
  if (process.platform !== "darwin") return "";
  try {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    const tmpDir = path.join(PREVIEW_DIR, "_tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`qlmanage -t -s 1000 -o "${tmpDir}" "${pdfPath}"`, { stdio: "pipe" });
    const generated = fs.readdirSync(tmpDir).find((f) => f.endsWith(".png"));
    if (!generated) return "";
    const dest = path.join(PREVIEW_DIR, `${pdfSlug}.png`);
    fs.renameSync(path.join(tmpDir, generated), dest);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return dest;
  } catch {
    return "";
  }
}

function pdfSlug(filename) {
  return filename.replace(/\.pdf$/i, "");
}

async function processPdf(pdfPath, manifestIndex) {
  const filename = path.basename(pdfPath);
  const slug = pdfSlug(filename);
  const isWinsupply = /winsupply|quote/i.test(filename);
  const isKdc = /kdc|showroom/i.test(filename);
  const previewPath = tryFirstPagePreview(pdfPath, slug);
  const pages = await extractPdfPages(pdfPath);
  const rows = [];

  for (const page of pages) {
    const rawForPricingCheck = page.rawText;
    const hadPricing = /\$[\d,]+/.test(rawForPricingCheck);
    const text = isWinsupply ? stripPricing(page.text) : page.text;
    const sections = detectSections(text, isWinsupply ? WINSUPPLY_SECTION_RULES : KDC_SECTION_RULES);
    const primarySection = sections.map((s) => s.section).join(" · ");
    const categories = [...new Set(sections.flatMap((s) => s.categories))];
    const brands = extractBrands(text);
    const colors = extractColors(text);
    const catalogNums = extractCatalogNumbers(text);
    const faucetModels = extractFaucetModels(text);
    const modelSku = [...new Set([...catalogNums, ...faucetModels.map((m) => m.replace(/^(Delta|Moen)\s+/i, ""))])];
    const matches = matchManifestProducts(text, manifestIndex, categories);
    const winsupplyProducts = isWinsupply ? parseWinsupplyProducts(page.rawText) : [];

    let notes = [];
    if (hadPricing && isWinsupply) {
      notes.push("Sale pricing present in source PDF — values intentionally excluded from this map.");
    }
    if (isKdc) notes.push("KDC showroom page — use for hero/diagram/variant reference; pair with manifest folder paths.");
    if (winsupplyProducts.length) {
      notes.push(`Parsed ${winsupplyProducts.length} faucet product line(s) without prices.`);
    }
    if (!matches.length) notes.push("No confident manifest match — review manually or add assets from this page.");

    rows.push({
      pdf_file: filename,
      page_number: page.pageNumber,
      section_family: primarySection,
      brands_found: brands.join("; "),
      model_sku_catalog_numbers: modelSku.join("; "),
      colors_finishes: colors.join("; "),
      product_categories: categories.join("; "),
      matched_product_ids: matches.slice(0, 15).map((m) => m.product_id).join("; "),
      matched_display_names: matches.slice(0, 15).map((m) => m.display_name).join("; "),
      match_count: matches.length,
      winsupply_products: winsupplyProducts.map((p) => `${p.model} — ${p.description}${p.displayTag ? ` [${p.displayTag}]` : ""}`).join(" | "),
      asset_hints: "hero.jpg; installed.jpg; diagram.jpg; variant color JPGs; spec PDF",
      pricing_excluded: hadPricing ? "yes" : "no",
      page_preview: page.pageNumber === 1 && previewPath ? previewPath.replace(ROOT + path.sep, "") : "",
      notes: notes.join(" "),
    });
  }

  return rows;
}

function toCsv(rows) {
  const cols = [
    "pdf_file", "page_number", "section_family", "brands_found", "model_sku_catalog_numbers",
    "colors_finishes", "product_categories", "matched_product_ids", "matched_display_names",
    "match_count", "winsupply_products", "asset_hints", "pricing_excluded", "page_preview", "notes",
  ];
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")),
  ].join("\n") + "\n";
}

function toMarkdown(allRows, manifestIndex, generatedAt) {
  const matchedIds = new Set();
  for (const r of allRows) {
    for (const id of String(r.matched_product_ids || "").split(";").map((s) => s.trim()).filter(Boolean)) {
      matchedIds.add(id);
    }
  }

  let md = `# Product Catalog — PDF Source Map

> **Generated:** ${generatedAt}  
> **Pages mapped:** ${allRows.length}  
> **Manifest products with ≥1 PDF page match:** ${matchedIds.size} / ${manifestIndex.length}

Internal reference only. **No sale prices are included.** WinSupply quote PDFs had pricing redacted before parsing.

## How to use

1. Open \`pdf-source-map.csv\` to see which PDF page supports which catalog products.
2. Use \`matched_product_ids\` to find manifest rows in \`product-catalog-asset-manifest.csv\`.
3. Collect hero/diagram/variant images from the cited PDF pages into the manifest \`folder_path\`.
4. Fill manifest \`notes\` with source URL / AppSheet path when done.
5. Re-run catalog data wiring in a future pass (not automatic).

## PDFs processed

`;

  const byPdf = {};
  for (const r of allRows) {
    byPdf[r.pdf_file] = byPdf[r.pdf_file] || [];
    byPdf[r.pdf_file].push(r);
  }

  for (const [pdf, rows] of Object.entries(byPdf)) {
    md += `\n### ${pdf} (${rows.length} pages)\n\n`;
    if (rows[0]?.page_preview) md += `First-page preview: \`${rows[0].page_preview}\`\n\n`;
    for (const r of rows) {
      md += `#### Page ${r.page_number} — ${r.section_family}\n\n`;
      if (r.brands_found) md += `- **Brands:** ${r.brands_found}\n`;
      if (r.model_sku_catalog_numbers) md += `- **Models/SKUs:** ${r.model_sku_catalog_numbers}\n`;
      if (r.colors_finishes) md += `- **Colors:** ${r.colors_finishes}\n`;
      if (r.matched_product_ids) md += `- **Matched products (${r.match_count}):** ${r.matched_display_names}\n`;
      else md += `- **Matched products:** _(none — manual review)_\n`;
      if (r.winsupply_products) md += `- **Faucet lines (no prices):** ${r.winsupply_products}\n`;
      if (r.pricing_excluded === "yes") md += `- **Pricing:** excluded from output\n`;
      md += `- **Notes:** ${r.notes}\n\n`;
    }
  }

  md += `\n## Unmatched manifest products (${manifestIndex.length - matchedIds.size})\n\n`;
  const unmatched = manifestIndex.filter((m) => !matchedIds.has(m.product_id));
  for (const m of unmatched.slice(0, 40)) {
    md += `- \`${m.product_id}\` — ${m.display_name} (${m.category})\n`;
  }
  if (unmatched.length > 40) md += `\n_…and ${unmatched.length - 40} more (see CSV reverse lookup)_\n`;

  return md;
}

async function main() {
  if (!fs.existsSync(MANIFEST_CSV)) {
    console.error(`Manifest not found: ${MANIFEST_CSV}`);
    console.error("Run: node scripts/build-product-catalog-asset-manifest.mjs");
    process.exit(1);
  }
  if (!fs.existsSync(PDF_DIR)) {
    console.error(`PDF folder not found: ${PDF_DIR}`);
    process.exit(1);
  }

  const pdfs = fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) {
    console.error(`No PDFs in ${PDF_DIR}`);
    process.exit(1);
  }

  const manifestRows = parseCsv(fs.readFileSync(MANIFEST_CSV, "utf8"));
  const manifestIndex = buildManifestIndex(manifestRows);
  const allRows = [];

  for (const pdf of pdfs) {
    const pdfPath = path.join(PDF_DIR, pdf);
    console.log(`Processing ${pdf}…`);
    const rows = await processPdf(pdfPath, manifestIndex);
    allRows.push(...rows);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  fs.writeFileSync(OUT_CSV, toCsv(allRows));
  fs.writeFileSync(OUT_MD, toMarkdown(allRows, manifestIndex, generatedAt));

  const matchedIds = new Set();
  for (const r of allRows) {
    for (const id of String(r.matched_product_ids || "").split(";").map((s) => s.trim()).filter(Boolean)) {
      matchedIds.add(id);
    }
  }

  console.log(`\nWrote ${allRows.length} page rows → ${OUT_CSV}`);
  console.log(`Wrote summary       → ${OUT_MD}`);
  console.log(`Manifest matches: ${matchedIds.size} / ${manifestIndex.length} products`);
  console.log(`Pricing excluded from all WinSupply rows where present.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
