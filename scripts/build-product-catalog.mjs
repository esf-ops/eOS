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

function isSinkAccessory(text, bowlType) {
  if (bowlType === "Accessory") return true;
  return /\b(grid|strainer|flange|accessor|wstrainer)\b/i.test(String(text || ""));
}

function extractSpecSummary(originalName) {
  const parts = [];
  const t = String(originalName || "");
  const lower = t.toLowerCase();
  if (/\bUM\b/.test(t) || lower.includes("undermount")) parts.push("Undermount");
  if (lower.includes("bar/entertainment") || lower.includes("bar / entertainment")) parts.push("Bar/Entertainment");
  if (/\b\d{2,4}\s*GA\b|\b\d{2,4}GA\b/i.test(t)) {
    const m = t.match(/\b(\d{2,4})\s*GA\b|\b(\d{2,4})GA\b/i);
    if (m) parts.push(`${m[1] || m[2]}GA`);
  }
  if (/\b\d{1,2}X\d{1,2}\b/i.test(t)) {
    const m = t.match(/\b(\d{1,2}X\d{1,2})\b/i);
    if (m) parts.push(m[1]);
  }
  if (lower.includes("workstation")) parts.push("Workstation");
  if (lower.includes("low divide")) parts.push("Low divide");
  if (lower.includes("regular divide")) parts.push("Regular divide");
  return parts.length ? parts.join(" · ") : undefined;
}

/**
 * Derive a showroom-friendly display name from raw workbook text.
 * Preserves original in originalName/sourceDescription; SKU in structured fields.
 */
function parseDisplayName(raw, skuFromColumn) {
  const originalName = String(raw || "").trim();
  if (!originalName) return { name: "", originalName: "", sourceDescription: "" };

  let text = originalName.replace(/^P:\s*/i, "").trim();
  let sku = skuFromColumn ? String(skuFromColumn).trim() : undefined;

  const parenMatch = text.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const parenVal = parenMatch[1].trim();
    if (!sku) sku = parenVal;
    text = text.replace(/\([^)]+\)\s*$/, "").trim();
  }

  if (sku) {
    const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`^${escaped}\\s+`, "i"), "");
  }

  // Remove leading model/SKU-like token when no column SKU was provided
  if (!skuFromColumn) {
    const lead = text.match(/^([A-Z0-9][A-Z0-9/-]{3,})\s+/i);
    if (lead && /[0-9]/.test(lead[1]) && /[A-Za-z]/.test(lead[1])) {
      sku = lead[1];
      text = text.slice(lead[0].length);
    }
  }

  const specSummary = extractSpecSummary(originalName);

  let displayName = text;
  const stripFromDisplay = [
    /\s+\bUM\b/gi,
    /\s+Undermount\b/gi,
    /\s+Bar\/Entertainment Sink\b/gi,
    /\s+VERTICAL\s+sink\b/gi,
    /\s+with accessories\b/gi,
    /\s+\d{1,2}X\d{1,2}\b/gi,
    /\s+\d{2,4}\s*GA\b/gi,
    /\s+\d{2,4}GA\b/gi,
    /\s+Sink\b/gi,
    /\s+\(\d{2,4}[A-Z]{2,}\d*\)\s*$/gi,
  ];
  for (const pattern of stripFromDisplay) {
    displayName = displayName.replace(pattern, "");
  }
  displayName = displayName.replace(/\s+/g, " ").trim();

  if (!displayName) displayName = text.replace(/\s+/g, " ").trim();

  return {
    name: displayName,
    originalName,
    sourceDescription: originalName,
    sku,
    specSummary,
  };
}

function parseBlancoFamilyName(family) {
  const originalName = String(family || "").trim();
  let name = originalName.replace(/^Blanco\s+/i, "").trim();
  name = name.replace(/\s+Sinks?\s*$/i, "").trim();
  name = name.replace(/\s+Accessories\s*$/i, " Accessories").trim();
  if (/^No Accessories Available$/i.test(name)) name = originalName;
  return { name: name || originalName, originalName, sourceDescription: originalName };
}

function parseFaucetDisplayName(rawName, description) {
  const originalName = String(rawName || "").trim();
  const desc = String(description || "").trim();
  const sku = originalName.replace(/\s+/g, " ").trim();
  const looksLikeModel = /^[A-Za-z0-9][A-Za-z0-9\s.-]{2,}$/.test(originalName) && originalName.split(/\s+/).length <= 5;
  const descIsTitle = desc.length > 12 && desc.split(/\s+/).length >= 3;
  const name = descIsTitle && looksLikeModel ? desc : originalName;
  return {
    name,
    originalName,
    sourceDescription: [originalName, desc].filter(Boolean).join(" — "),
    sku: looksLikeModel ? sku : undefined,
    specSummary: descIsTitle && looksLikeModel ? undefined : desc || undefined,
  };
}

function parseSpecialtyDisplayName(rawName, specs) {
  const originalName = String(rawName || "").trim();
  const specStr = String(specs || "").trim();
  let name = originalName;
  if (specStr && !name.toLowerCase().includes(specStr.toLowerCase())) {
    name = `${name} (${specStr})`;
  }
  return {
    name,
    originalName,
    sourceDescription: originalName,
    specSummary: specStr || undefined,
  };
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
    const skip = /pricing calculator|input item cost|no accessories available/i.test(family) || isPricingNoise(family);
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
    const model = familyVariants[0]?.notes?.replace(/^Model\s+/, "") || undefined;
    const parsed = parseBlancoFamilyName(family);

    const product = enrichItem({
      id,
      category: isAccessory ? "sink_accessory" : "sink",
      name: parsed.name,
      originalName: parsed.originalName,
      sourceDescription: parsed.sourceDescription,
      brand: "Blanco",
      series: collection,
      model,
      type: isAccessory ? "Accessory" : bowlType,
      suggestedUse: inferSuggestedUse(family) ?? "Kitchen",
      material,
      specSummary: model ? `Model ${model}` : undefined,
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

    const skuStr = sku ? String(sku).trim() : undefined;
    const parsed = parseDisplayName(d, skuStr);
    const material = inferMaterial(d);
    const bowlType = inferBowlType(d);
    const use = inferSuggestedUse(d);
    const accessory = isSinkAccessory(d, bowlType);
    const id = slugify(`kansas-${skuStr || parsed.name}-${i}`);

    items.push(
      enrichItem({
        id,
        category: accessory ? "sink_accessory" : "sink",
        name: parsed.name,
        originalName: parsed.originalName,
        sourceDescription: parsed.sourceDescription,
        sku: parsed.sku || skuStr,
        esfCode: skuStr || parsed.sku,
        brand: "Kansas Sinks",
        type: bowlType,
        suggestedUse: use ?? (d.toLowerCase().includes("bar") ? "Bar / Prep" : "Kitchen"),
        material: material ?? "Stainless Steel",
        specSummary: parsed.specSummary,
        description: parsed.specSummary,
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
    const parsed = parseFaucetDisplayName(n, d);
    const id = slugify(`faucet-${n}`);
    const use = inferSuggestedUse(d || n);
    const isAccessory = /dispenser|rinser|air switch|controller|button/i.test(d + n);

    items.push(
      enrichItem({
        id,
        category: "faucet",
        name: parsed.name,
        originalName: parsed.originalName,
        sourceDescription: parsed.sourceDescription,
        sku: parsed.sku,
        type: isAccessory ? "Accessory" : "Faucet",
        suggestedUse: use ?? (d.toLowerCase().includes("bathroom") ? "Vanity" : "Kitchen"),
        specSummary: parsed.specSummary,
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
    const parsed = parseSpecialtyDisplayName(n, specStr);
    const id = slugify(`specialty-${n}-${specStr || i}`);

    items.push(
      enrichItem({
        id,
        category: "specialty_add_on",
        name: parsed.name,
        originalName: parsed.originalName,
        sourceDescription: parsed.sourceDescription,
        type: "Specialty",
        suggestedUse: inferSuggestedUse(n + " " + specStr) ?? "Kitchen",
        specSummary: parsed.specSummary,
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
  const kansas = parseKansas(wb);
  const blanco = parseBlanco(wb);
  const sinks = [...kansas, ...blanco].filter((i) => i.category === "sink");
  const sinkAccessories = [...kansas, ...blanco].filter((i) => i.category === "sink_accessory");
  const faucets = parseFaucets(wb);
  const specialty = parseSpecialty(wb);
  const catalog = [...sinks, ...sinkAccessories, ...faucets, ...specialty].filter(
    (item) => !isPricingNoise(item.name) && !isPricingNoise(item.description) && !isPricingNoise(item.originalName)
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
    .replace(/"category": "sink_accessory"/g, '"category": "sink_accessory" as const')
    .replace(/"category": "faucet"/g, '"category": "faucet" as const')
    .replace(/"category": "specialty_add_on"/g, '"category": "specialty_add_on" as const')
    .replace(/"assetStatus": "missing"/g, '"assetStatus": "missing" as const')
    .replace(/"assetStatus": "partial"/g, '"assetStatus": "partial" as const')
    .replace(/"assetStatus": "complete"/g, '"assetStatus": "complete" as const');

  fs.writeFileSync(OUT, `${header}${body};\n`);
  console.log(
    `Wrote ${catalog.length} items (${sinks.length} sinks, ${sinkAccessories.length} sink accessories, ${faucets.length} faucets, ${specialty.length} specialty) → ${OUT}`
  );
}

main();
