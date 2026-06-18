#!/usr/bin/env node
/**
 * Generates app-slab-inventory/src/lib/productCatalogData.ts from the local ESF workbook.
 * Source: _local/catalog-source/esf-plumbing-specialty-program.xlsx (gitignored).
 * Price/cost columns are read only to skip — never exported to the frontend module.
 *
 * Re-run when the workbook changes:
 *   node scripts/build-product-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKBOOK = path.join(ROOT, "_local/catalog-source/esf-plumbing-specialty-program.xlsx");
const OUT = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogData.ts");

const KNOWN_FINISHES = [
  "Soft White",
  "Coal Black",
  "Concrete Gray",
  "Metallic Gray",
  "Café Brown",
  "Cafe Brown",
  "Anthracite",
  "Biscuit",
  "Bisque",
  "Cinder",
  "Truffle",
  "White",
  "Cafe",
  "Gray",
  "Black",
  "Silver",
  "Black",
].sort((a, b) => b.length - a.length);

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function extractFinish(desc) {
  const d = String(desc || "");
  for (const f of KNOWN_FINISHES) {
    if (d.toLowerCase().includes(f.toLowerCase())) return f.replace("Cafe Brown", "Café Brown").replace(/^Cafe$/, "Café Brown");
  }
  return undefined;
}

function inferMaterial(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("stainless steel") || t.includes("18ga") || t.includes("16ga") || t.includes("16 gauge") || t.includes("18 gauge")) return "Stainless Steel";
  if (t.includes("composite") || t.includes("silgranit")) return "Composite";
  if (t.includes("fireclay")) return "Fireclay";
  if (t.includes("granite")) return "Granite Composite";
  if (t.includes("cast iron")) return "Cast Iron";
  if (t.includes("blanco") || t.includes("diamond") || t.includes("precis")) return "Composite";
  return undefined;
}

function inferSuggestedUse(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("bar") || t.includes("entertainment") || t.includes("prep")) return "Bar / Prep";
  if (t.includes("laundry")) return "Laundry";
  if (t.includes("vanity") || t.includes("bathroom")) return "Vanity";
  if (t.includes("apron")) return "Kitchen";
  if (t.includes("kitchen") || t.includes("pull down") || t.includes("pull-out")) return "Kitchen";
  return undefined;
}

function inferBowlType(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("50/50") || t.includes("60/40") || t.includes("double") || t.includes("low divide")) return "Double bowl";
  if (t.includes("single") || t.includes("super single")) return "Single bowl";
  if (t.includes("bar")) return "Bar sink";
  if (t.includes("grid") || t.includes("strainer") || t.includes("flange") || t.includes("accessory")) return "Accessory";
  return undefined;
}

function assetPath(category, id, kind, ext = "jpg") {
  const folder = category === "faucet" ? "faucets" : category === "specialty_add_on" ? "specialty" : "sinks";
  return `/product-catalog/${folder}/${id}-${kind}.${ext}`;
}

function computeAssetStatus(item) {
  const urls = [
    item.imageUrl,
    item.installedImageUrl,
    item.diagramUrl,
    item.specSheetUrl,
    ...(item.gallery ?? []),
    ...(item.comboPhotoUrls ?? []),
    ...(item.finishExampleUrls ?? []),
    ...(item.variants ?? []).flatMap((v) => [v.imageUrl, v.installedImageUrl, v.comboPhotoUrl].filter(Boolean)),
  ].filter(Boolean);
  if (urls.length === 0) return "missing";
  const hasHero = Boolean(item.imageUrl || item.variants?.some((v) => v.imageUrl));
  const hasSpec = Boolean(item.diagramUrl || item.specSheetUrl);
  const hasGallery = Boolean(
    (item.comboPhotoUrls?.length ?? 0) > 0 ||
    (item.gallery?.length ?? 0) > 0 ||
    item.installedImageUrl
  );
  if (hasHero && (hasSpec || hasGallery)) return "complete";
  return "partial";
}

function enrichItem(item) {
  const withPaths = { ...item, active: item.active !== false };
  if (!withPaths.imageUrl) {
    withPaths.imageUrl = undefined;
  }
  withPaths.assetStatus = computeAssetStatus(withPaths);
  return withPaths;
}

function isPricingNoise(text) {
  return /pricing calculator|input item cost|selling price|item cost|margin calculation|your selling price will populate/i.test(String(text || ""));
}

function parseBlanco(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Blanco Sink Program (Non Stock)"], { header: 1, defval: "" });
  const items = [];
  let family = "";
  let familyVariants = [];

  const flush = () => {
    if (!family || familyVariants.length === 0) return;
    const skip = /pricing calculator|input item cost/i.test(family) || isPricingNoise(family);
    if (skip) {
      family = "";
      familyVariants = [];
      return;
    }
    const isAccessory = /accessor|strainer|flange|grid/i.test(family);
    const id = slugify(`blanco-${family}`);
    const colors = [...new Set(familyVariants.map((v) => v.colorName).filter(Boolean))];
    const material = inferMaterial(family) ?? "Composite";
    const bowlType = inferBowlType(family);
    const collection = familyVariants[0]?.collection || undefined;

    const product = enrichItem({
      id,
      category: "sink",
      name: family.replace(/^Blanco\s+/i, "").trim(),
      brand: "Blanco",
      series: collection,
      type: isAccessory ? "Accessory" : bowlType,
      suggestedUse: inferSuggestedUse(family) ?? "Kitchen",
      material,
      description: `${family} — Blanco composite sink program.`,
      availableColors: colors,
      variants: familyVariants,
      sourceSheet: "Blanco Sink Program (Non Stock)",
      active: true,
    });
    items.push(product);
    family = "";
    familyVariants = [];
  };

  for (let i = 2; i < rows.length; i++) {
    const [desc, collection, model, sku] = rows[i];
    if (!desc || !String(desc).trim()) continue;
    const d = String(desc).trim();
    if (/pricing calculator|input item cost/i.test(d)) continue;
    if (isPricingNoise(d)) continue;

    if (!sku && !model) {
      flush();
      family = d;
      continue;
    }

    if (!family) continue;
    const finish = extractFinish(d);
    const variantId = slugify(`${family}-${sku || d}`);
    familyVariants.push({
      id: variantId,
      colorName: finish,
      finishName: finish,
      catalogNumber: sku ? String(sku) : undefined,
      notes: model ? `Model ${model}` : undefined,
      imageUrl: undefined,
    });
  }
  flush();
  return items;
}

function parseKansas(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Kansas Sinks Program"], { header: 1, defval: "" });
  const items = [];
  for (let i = 2; i < rows.length; i++) {
    const [desc, sku, , status] = rows[i];
    if (!desc || !String(desc).trim()) continue;
    const d = String(desc).trim();
    if (/product \/ type/i.test(d)) continue;
    if (/pricing calculator/i.test(d)) break;
    if (isPricingNoise(d)) continue;

    const cleanName = d.replace(/^P:\s*/, "").replace(/\([^)]+\)\s*$/, "").trim();
    const skuStr = sku ? String(sku).trim() : undefined;
    const id = slugify(`kansas-${skuStr || cleanName}-${i}`);
    const material = inferMaterial(d);
    const bowlType = inferBowlType(d);
    const use = inferSuggestedUse(d);

    items.push(
      enrichItem({
        id,
        category: "sink",
        name: cleanName,
        brand: "Kansas Sinks",
        type: bowlType,
        suggestedUse: use ?? (d.toLowerCase().includes("bar") ? "Bar / Prep" : "Kitchen"),
        material: material ?? "Stainless Steel",
        esfCode: skuStr,
        description: d,
        notes: status ? `Program status: ${status}` : undefined,
        sourceSheet: "Kansas Sinks Program",
        active: true,
      })
    );
  }
  return items;
}

function parseFaucets(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Faucets and Addons (Non Stock)"], { header: 1, defval: "" });
  const items = [];
  for (let i = 2; i < rows.length; i++) {
    const [name, description] = rows[i];
    if (!name || !String(name).trim()) continue;
    const n = String(name).trim();
    if (/pricing calculator|input item cost|any plumbing items/i.test(n)) break;

    const d = String(description || "").trim();
    const id = slugify(`faucet-${n}`);
    const use = inferSuggestedUse(d || n);
    const isAccessory = /dispenser|rinser|air switch|controller|button/i.test(d + n);

    items.push(
      enrichItem({
        id,
        category: "faucet",
        name: n,
        type: isAccessory ? "Accessory" : "Faucet",
        suggestedUse: use ?? (d.toLowerCase().includes("bathroom") ? "Vanity" : "Kitchen"),
        description: d || undefined,
        sourceSheet: "Faucets and Addons (Non Stock)",
        active: true,
      })
    );
  }
  return items;
}

function parseSpecialty(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Specialty Items"], { header: 1, defval: "" });
  const items = [];
  for (let i = 2; i < rows.length; i++) {
    const [name, specs, , notes, website] = rows[i];
    if (!name || !String(name).trim()) continue;
    const n = String(name).trim();
    const specStr = String(specs || "").trim();
    const id = slugify(`specialty-${n}-${specStr || i}`);

    items.push(
      enrichItem({
        id,
        category: "specialty_add_on",
        name: n,
        type: "Specialty",
        suggestedUse: inferSuggestedUse(n + " " + specStr) ?? "Kitchen",
        description: [specStr, notes ? String(notes).trim() : ""].filter(Boolean).join(" · ") || undefined,
        notes: website ? `Website: ${String(website).trim()}` : undefined,
        sourceSheet: "Specialty Items",
        active: true,
      })
    );
  }
  return items;
}

function main() {
  if (!fs.existsSync(WORKBOOK)) {
    console.error(`Workbook not found: ${WORKBOOK}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(WORKBOOK);
  const sinks = [...parseKansas(wb), ...parseBlanco(wb)];
  const faucets = parseFaucets(wb);
  const specialty = parseSpecialty(wb);
  const catalog = [...sinks, ...faucets, ...specialty].filter(
    (item) => !isPricingNoise(item.name) && !isPricingNoise(item.description)
  );

  const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: _local/catalog-source/esf-plumbing-specialty-program.xlsx
 * Regenerate: node scripts/build-product-catalog.mjs
 *
 * Display-only product catalog. No pricing fields are exported.
 * Future versions may move to Supabase Storage / catalog tables.
 */
import type { ProductCatalogItem } from "./productCatalog";

export const PRODUCT_CATALOG_ITEMS: ProductCatalogItem[] = `;

  const body = JSON.stringify(catalog, null, 2)
    .replace(/"category": "sink"/g, '"category": "sink" as const')
    .replace(/"category": "faucet"/g, '"category": "faucet" as const')
    .replace(/"category": "specialty_add_on"/g, '"category": "specialty_add_on" as const')
    .replace(/"assetStatus": "missing"/g, '"assetStatus": "missing" as const')
    .replace(/"assetStatus": "partial"/g, '"assetStatus": "partial" as const')
    .replace(/"assetStatus": "complete"/g, '"assetStatus": "complete" as const');

  fs.writeFileSync(OUT, `${header}${body};\n`);
  console.log(`Wrote ${catalog.length} items (${sinks.length} sinks, ${faucets.length} faucets, ${specialty.length} specialty) → ${OUT}`);
}

main();
