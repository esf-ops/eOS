/**
 * Normalize ESF Plumbing & Specialty Program workbook into Brain catalog products.
 * Uses `xlsx` (repo dependency). Server-authoritative — includes sellPrice for Brain use.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  ESF_PLUMBING_CATALOG_CONTRACT_ID,
  normalizeAvailability
} from "./esfPlumbingCatalogContract.mjs";

export const SHEET_KANSAS = "Kansas Sinks Program";
export const SHEET_BLANCO = "Blanco Sink Program (Non Stock)";
export const SHEET_FAUCETS = "Faucets and Addons (Non Stock)";
export const SHEET_SPECIALTY = "Specialty Items";

/**
 * @param {string} s
 */
export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

/**
 * @param {unknown} text
 */
export function isExcludedHelperText(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  return (
    /^pricing calculator$/i.test(t) ||
    /any plumbing items not included/i.test(t) ||
    /input item cost/i.test(t) ||
    /your selling price will populate/i.test(t) ||
    /margin calculation/i.test(t) ||
    /^item cost$/i.test(t) ||
    /^selling price$/i.test(t) ||
    /^product\s*\/\s*type\s*\/\s*category$/i.test(t) ||
    /^description$/i.test(t) ||
    /^elite stone fabrications?/i.test(t) ||
    /^no accessories available$/i.test(t)
  );
}

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function toMoney(n) {
  if (n == null || n === "") return null;
  if (typeof n === "number" && Number.isFinite(n)) return Math.round(n * 100) / 100;
  const cleaned = String(n).replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/**
 * Extract SKU from trailing parentheses when present.
 * @param {string} desc
 * @param {string} [columnSku]
 */
function extractKansasSku(desc, columnSku) {
  const d = String(desc || "").trim();
  const paren = d.match(/\(([^)]+)\)\s*$/);
  if (paren) {
    const p = paren[1].trim();
    if (p) return p;
  }
  const col = String(columnSku || "").trim();
  if (col) return col.replace(/\s+/g, "");
  return slugify(d).toUpperCase() || `ROW`;
}

/**
 * @param {string} desc
 */
function stripKansasDisplayName(desc) {
  let text = String(desc || "")
    .replace(/^P:\s*/i, "")
    .trim();
  text = text.replace(/\([^)]+\)\s*$/, "").trim();
  return text || String(desc || "").trim();
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isSinkAccessoryText(text) {
  return /\b(grid|strainer|flange|wstrainer|accessor)\b/i.test(String(text || ""));
}

/**
 * @param {string} text
 * @returns {import('./esfPlumbingCatalogContract.mjs').RoomEligibility[]}
 */
export function inferRoomEligibility(text) {
  const t = String(text || "").toLowerCase();
  /** @type {Set<import('./esfPlumbingCatalogContract.mjs').RoomEligibility>} */
  const rooms = new Set();
  if (/\bvanity\b|\bchina\b|\bbathroom\b|\bbath\b/.test(t)) rooms.add("vanity");
  if (/\bbar\b|\bprep\b|\bentertainment\b/.test(t)) rooms.add("bar_prep");
  if (/\blaundry\b|\butility\b/.test(t)) rooms.add("laundry_utility");
  if (/\bkitchen\b|\bworkstation\b|\bapron\b|\bdiamond\b|\bprecis\b|\bikon\b|\binteos\b/.test(t)) {
    rooms.add("kitchen");
  }
  if (rooms.size === 0) {
    if (isSinkAccessoryText(t)) {
      rooms.add("kitchen");
      rooms.add("bar_prep");
      rooms.add("vanity");
    } else {
      rooms.add("kitchen");
    }
  }
  return [...rooms];
}

/**
 * @param {import('./esfPlumbingCatalogContract.mjs').RoomEligibility[]} rooms
 * @param {boolean} requiresCutout
 * @returns {import('./esfPlumbingCatalogContract.mjs').CutoutType | null}
 */
export function relatedCutoutTypeForRooms(rooms, requiresCutout) {
  if (!requiresCutout) return null;
  if (rooms.includes("vanity") && !rooms.includes("kitchen") && !rooms.includes("bar_prep")) {
    return "vanity_cutout";
  }
  if (rooms.includes("bar_prep") && !rooms.includes("kitchen") && !rooms.includes("vanity")) {
    return "bar_cutout";
  }
  if (rooms.includes("laundry_utility") && !rooms.includes("kitchen") && !rooms.includes("bar_prep")) {
    return "sink_cutout";
  }
  if (rooms.includes("kitchen") || rooms.includes("laundry_utility")) return "sink_cutout";
  if (rooms.includes("vanity")) return "vanity_cutout";
  if (rooms.includes("bar_prep")) return "bar_cutout";
  return "sink_cutout";
}

/**
 * @param {string} name
 * @param {string} description
 */
export function categorizeFaucet(name, description) {
  const t = `${name} ${description}`.toLowerCase();
  if (/soap|lotion\s+dispenser|liquid\s+lotion/.test(t)) return "soap_dispenser";
  if (/glass\s+rinser/.test(t)) return "glass_rinser";
  if (/air\s+switch\s+button|disposal\s+button|as\s*4201/.test(t)) return "disposal_button";
  if (/air\s+switch|disposal\s+air/.test(t)) return "disposal_air_switch";
  if (/beverage/.test(t)) return "beverage_faucet";
  if (/bathroom|widespread|bath\s+faucet/.test(t)) return "bathroom_faucet";
  if (/bar\s*\/?\s*prep|bar\s+faucet|prep\s+faucet/.test(t)) return "bar_prep_faucet";
  if (/kitchen\s+faucet|pull\s+down\s+kitchen|pull\s*out\s+kitchen|pulldown\s+kitchen/.test(t)) {
    return "kitchen_faucet";
  }
  if (/faucet/.test(t)) {
    if (/bar/.test(t)) return "bar_prep_faucet";
    return "kitchen_faucet";
  }
  return "accessory";
}

/**
 * @param {string} category
 */
function faucetRoomEligibility(category) {
  switch (category) {
    case "bathroom_faucet":
      return /** @type {const} */ (["vanity"]);
    case "bar_prep_faucet":
      return /** @type {const} */ (["bar_prep", "kitchen"]);
    case "beverage_faucet":
    case "soap_dispenser":
    case "glass_rinser":
    case "disposal_air_switch":
    case "disposal_button":
      return /** @type {const} */ (["kitchen", "bar_prep"]);
    case "kitchen_faucet":
      return /** @type {const} */ (["kitchen"]);
    default:
      return /** @type {const} */ (["kitchen", "bar_prep", "vanity"]);
  }
}

/**
 * @param {string} familyHeader
 * @param {{ isAccessory?: boolean }} [opts]
 */
function blancoFamilyProductId(familyHeader, opts = {}) {
  const base = String(familyHeader || "")
    .replace(/^Blanco\s+/i, "")
    .replace(/\s+Accessories\s*$/i, "")
    .replace(/\s+Sinks?\s*$/i, "")
    .trim();
  const id = `blanco:${slugify(base || familyHeader)}`;
  // Accessory families must not collide with sink family IDs (same workbook header stem).
  return opts.isAccessory ? `${id}:accessories` : id;
}

/**
 * @param {string} desc
 */
function extractFinish(desc) {
  const KNOWN = [
    "Soft White",
    "Coal Black",
    "Volcano Gray",
    "Concrete Gray",
    "Metallic Gray",
    "Café Brown",
    "Cafe Brown",
    "Anthracite",
    "Biscuit",
    "Bisque",
    "Cinder",
    "Truffle",
    "Gunmetal Black",
    "White",
    "Cafe",
    "Gray",
    "Black",
    "Silver"
  ].sort((a, b) => b.length - a.length);
  const d = String(desc || "");
  for (const f of KNOWN) {
    if (d.toLowerCase().includes(f.toLowerCase())) {
      if (/^cafe\s*brown$/i.test(f)) return "Café Brown";
      if (/^cafe$/i.test(f)) return "Cafe";
      return f;
    }
  }
  return undefined;
}

/**
 * @param {unknown} workbookPathOrBuffer
 * @returns {{ workbook: import('xlsx').WorkBook, sourceVersion: string, sourceLabel: string }}
 */
function loadWorkbook(workbookPathOrBuffer) {
  if (Buffer.isBuffer(workbookPathOrBuffer)) {
    return {
      workbook: XLSX.read(workbookPathOrBuffer, { type: "buffer" }),
      sourceVersion: "buffer",
      sourceLabel: "buffer"
    };
  }
  if (typeof workbookPathOrBuffer === "string") {
    const abs = path.resolve(workbookPathOrBuffer);
    if (!fs.existsSync(abs)) {
      throw new Error(`Workbook not found: ${abs}`);
    }
    const base = path.basename(abs);
    const m = base.match(/(\d{4}-\d{2}-\d{2})/);
    return {
      workbook: XLSX.readFile(abs),
      sourceVersion: m ? m[1] : base,
      sourceLabel: base
    };
  }
  throw new Error("workbookPathOrBuffer must be a file path or Buffer");
}

/**
 * @param {import('xlsx').WorkBook} workbook
 * @param {string} sheetName
 */
function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

/**
 * @param {object} args
 */
function pushExcluded(excludedRows, sheet, row, reason) {
  excludedRows.push({ sheet, row, reason });
}

/**
 * @param {import('xlsx').WorkBook} workbook
 * @param {object[]} excludedRows
 * @param {string} sourceVersion
 */
function normalizeKansas(workbook, excludedRows, sourceVersion) {
  const rows = sheetRows(workbook, SHEET_KANSAS);
  /** @type {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct[]} */
  const products = [];
  const usedIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const [descRaw, skuCol, priceRaw, statusRaw] = rows[i] || [];
    const desc = String(descRaw || "").trim();
    if (!desc) {
      pushExcluded(excludedRows, SHEET_KANSAS, rowNum, "blank_row");
      continue;
    }
    if (isExcludedHelperText(desc)) {
      pushExcluded(excludedRows, SHEET_KANSAS, rowNum, "helper_or_heading");
      continue;
    }
    const price = toMoney(priceRaw);
    // Zero-value calculator outputs (no real product status)
    if (price === 0 && !String(statusRaw || "").trim() && !String(skuCol || "").trim()) {
      pushExcluded(excludedRows, SHEET_KANSAS, rowNum, "zero_value_calculator_output");
      continue;
    }
    if (price == null) {
      pushExcluded(excludedRows, SHEET_KANSAS, rowNum, "missing_sell_price");
      continue;
    }

    const sku = extractKansasSku(desc, skuCol);
    let productId = `kansas:${sku}`;
    if (usedIds.has(productId)) {
      productId = `kansas:${sku}:${rowNum}`;
    }
    usedIds.add(productId);

    const accessory = isSinkAccessoryText(desc);
    const rooms = inferRoomEligibility(desc);
    const requiresCutout = !accessory;
    const availability = normalizeAvailability(statusRaw);

    products.push({
      productId,
      category: accessory ? "sink_accessory" : "sink",
      subcategory: accessory ? "kansas_accessory" : "kansas_sink",
      manufacturer: "Kansas Sinks",
      collection: "Kansas",
      model: sku,
      sku,
      displayName: stripKansasDisplayName(desc),
      description: desc,
      sellPrice: price,
      availability,
      customerVisible: true,
      active: true,
      roomEligibility: rooms,
      pricingTreatment: "priced",
      requiresCutout,
      relatedCutoutType: relatedCutoutTypeForRooms(rooms, requiresCutout),
      estimatorReviewRequired: false,
      sourceSheet: SHEET_KANSAS,
      sourceVersion
    });
  }

  return products;
}

/**
 * @param {import('xlsx').WorkBook} workbook
 * @param {object[]} excludedRows
 * @param {string} sourceVersion
 */
function normalizeBlanco(workbook, excludedRows, sourceVersion) {
  const rows = sheetRows(workbook, SHEET_BLANCO);
  /** @type {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct[]} */
  const products = [];

  /** @type {{ header: string, isAccessory: boolean, productId: string, compatibleFamilyIds: string[], variants: object[] } | null} */
  let current = null;
  /** @type {Map<string, string>} */
  const familyIdByHeaderKey = new Map();

  const flush = () => {
    if (!current) return;
    if (current.variants.length === 0) {
      pushExcluded(excludedRows, SHEET_BLANCO, -1, `empty_family:${current.header}`);
      current = null;
      return;
    }
    const prices = current.variants.map((v) => v.sellPrice).filter((p) => p != null);
    const sellPrice = prices.length ? Math.min(...prices) : undefined;
    const rooms = inferRoomEligibility(current.header);
    const requiresCutout = !current.isAccessory;

    products.push({
      productId: current.productId,
      category: current.isAccessory ? "sink_accessory" : "sink",
      subcategory: current.isAccessory ? "blanco_accessory" : "blanco_sink",
      manufacturer: "Blanco",
      collection: current.variants[0]?.collection || undefined,
      model: current.variants[0]?.model || undefined,
      displayName: current.header.replace(/^Blanco\s+/i, "").trim() || current.header,
      description: current.header,
      sellPrice,
      availability: "special_order",
      customerVisible: true,
      active: true,
      roomEligibility: rooms,
      pricingTreatment: "priced",
      requiresCutout,
      relatedCutoutType: relatedCutoutTypeForRooms(rooms, requiresCutout),
      estimatorReviewRequired: false,
      sourceSheet: SHEET_BLANCO,
      sourceVersion,
      variants: current.variants,
      compatibleFamilyIds: current.isAccessory ? current.compatibleFamilyIds : undefined
    });
    current = null;
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const [descRaw, collectionRaw, modelRaw, skuRaw, priceRaw] = rows[i] || [];
    const desc = String(descRaw || "").trim();
    if (!desc) {
      pushExcluded(excludedRows, SHEET_BLANCO, rowNum, "blank_row");
      continue;
    }
    if (isExcludedHelperText(desc)) {
      pushExcluded(excludedRows, SHEET_BLANCO, rowNum, "helper_or_heading");
      continue;
    }

    const sku = skuRaw === "" || skuRaw == null ? "" : String(skuRaw).trim();
    const model = String(modelRaw || "").trim();
    const collection = String(collectionRaw || "").trim();
    const price = toMoney(priceRaw);

    // Family / section header: description only, no SKU
    if (!sku) {
      // Skip zero calculator residue disguised as header
      if (price === 0) {
        pushExcluded(excludedRows, SHEET_BLANCO, rowNum, "zero_value_calculator_output");
        continue;
      }
      flush();
      const isAccessory = /accessor/i.test(desc);
      const productId = blancoFamilyProductId(desc, { isAccessory });
      if (!isAccessory) {
        familyIdByHeaderKey.set(slugify(desc.replace(/^Blanco\s+/i, "").replace(/\s+Sinks?\s*$/i, "")), productId);
      }
      const compatibleFamilyIds = [];
      if (isAccessory) {
        const baseKey = slugify(
          desc
            .replace(/^Blanco\s+/i, "")
            .replace(/\s+Accessories\s*$/i, "")
            .replace(/\s+Sinks?\s*$/i, "")
        );
        const match = familyIdByHeaderKey.get(baseKey);
        if (match) compatibleFamilyIds.push(match);
      }
      current = {
        header: desc,
        isAccessory,
        productId,
        compatibleFamilyIds,
        variants: []
      };
      continue;
    }

    if (!current) {
      pushExcluded(excludedRows, SHEET_BLANCO, rowNum, "sku_row_without_family");
      continue;
    }

    if (price == null) {
      pushExcluded(excludedRows, SHEET_BLANCO, rowNum, "missing_sell_price");
      continue;
    }
    if (price === 0) {
      pushExcluded(excludedRows, SHEET_BLANCO, rowNum, "zero_value_calculator_output");
      continue;
    }

    const finish = extractFinish(desc);
    const variantId = `${current.productId}:sku:${sku}`;
    current.variants.push({
      variantId,
      sku: String(sku),
      displayName: desc.replace(/^Blanco\s+/i, "").trim() || desc,
      finish,
      color: finish,
      model: model || undefined,
      collection: collection || undefined,
      sellPrice: price,
      availability: "special_order"
    });
  }
  flush();

  return products;
}

/**
 * @param {import('xlsx').WorkBook} workbook
 * @param {object[]} excludedRows
 * @param {string} sourceVersion
 */
function normalizeFaucets(workbook, excludedRows, sourceVersion) {
  const rows = sheetRows(workbook, SHEET_FAUCETS);
  /** @type {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct[]} */
  const products = [];
  const usedIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const [nameRaw, descRaw, priceRaw] = rows[i] || [];
    const name = String(nameRaw || "").trim();
    if (!name) {
      pushExcluded(excludedRows, SHEET_FAUCETS, rowNum, "blank_row");
      continue;
    }
    if (isExcludedHelperText(name)) {
      pushExcluded(excludedRows, SHEET_FAUCETS, rowNum, "helper_or_heading");
      continue;
    }
    const description = String(descRaw || "").trim();
    if (isExcludedHelperText(description) && !toMoney(priceRaw)) {
      pushExcluded(excludedRows, SHEET_FAUCETS, rowNum, "helper_or_heading");
      continue;
    }
    const price = toMoney(priceRaw);
    if (price === 0 && !description) {
      pushExcluded(excludedRows, SHEET_FAUCETS, rowNum, "zero_value_calculator_output");
      continue;
    }
    if (price == null) {
      pushExcluded(excludedRows, SHEET_FAUCETS, rowNum, "missing_sell_price");
      continue;
    }

    const skuSlug = slugify(name);
    let productId = `faucet:${skuSlug}`;
    if (usedIds.has(productId)) productId = `faucet:${skuSlug}:${rowNum}`;
    usedIds.add(productId);

    const category = categorizeFaucet(name, description);
    const manufacturer = /^moen/i.test(name) ? "Moen" : /^delta/i.test(name) ? "Delta" : "Unknown";

    products.push({
      productId,
      category,
      subcategory: "faucet_program",
      manufacturer,
      model: name,
      sku: name,
      displayName: description || name,
      description: description ? `${name} — ${description}` : name,
      sellPrice: price,
      availability: "special_order",
      customerVisible: true,
      active: true,
      roomEligibility: [...faucetRoomEligibility(category)],
      pricingTreatment: "priced",
      requiresCutout: false,
      relatedCutoutType: null,
      estimatorReviewRequired: false,
      sourceSheet: SHEET_FAUCETS,
      sourceVersion
    });
  }

  return products;
}

/**
 * @param {import('xlsx').WorkBook} workbook
 * @param {object[]} excludedRows
 * @param {string} sourceVersion
 */
function normalizeSpecialty(workbook, excludedRows, sourceVersion) {
  const rows = sheetRows(workbook, SHEET_SPECIALTY);
  /** @type {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct[]} */
  const products = [];
  const usedIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const [nameRaw, specsRaw, installedRaw, notesRaw, websiteRaw] = rows[i] || [];
    const name = String(nameRaw || "").trim();
    if (!name) {
      pushExcluded(excludedRows, SHEET_SPECIALTY, rowNum, "blank_row");
      continue;
    }
    if (isExcludedHelperText(name)) {
      pushExcluded(excludedRows, SHEET_SPECIALTY, rowNum, "helper_or_heading");
      continue;
    }

    const specs = String(specsRaw || "").trim();
    const notes = String(notesRaw || "").trim();
    const website = String(websiteRaw || "").trim();
    const installed = toMoney(installedRaw);
    const lower = name.toLowerCase();
    const isReviewOnly =
      installed == null || /glowback/i.test(lower) || /invisacook/i.test(lower);

    const slugBase = slugify(`${name}-${specs || rowNum}`);
    let productId = `specialty:${slugBase}`;
    if (usedIds.has(productId)) productId = `specialty:${slugBase}:${rowNum}`;
    usedIds.add(productId);

    // Customer-safe titles (never workbook paragraphs / channel labels).
    let displayName = specs ? `${name} (${specs})` : name;
    let description =
      [specs, notes, website ? `Website: ${website}` : ""].filter(Boolean).join(" · ") || name;
    if (/glowback/i.test(lower)) {
      displayName = "Glowback LED Backlighting";
      description = "Custom backlighting designed for your stone application.";
    } else if (/invisacook/i.test(lower)) {
      displayName = "InvisaCook";
      description =
        "Induction cooking technology installed beneath compatible countertop material.";
    } else if (/free\s*power/i.test(lower)) {
      displayName = "FreePower 3-Device Charging Station";
      description = "Wireless charging installed below the countertop surface.";
    } else {
      displayName = displayName
        .replace(/\b(wholesale|partner|direct)\b/gi, "")
        .replace(/\(\s*\)/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (displayName.length > 72 && /\.\s/.test(displayName)) {
        displayName = displayName.split(/\.\s/)[0].trim();
      }
    }

    /** @type {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct} */
    const product = {
      productId,
      category: "specialty",
      subcategory: isReviewOnly ? "specialty_quote" : "specialty_installed",
      manufacturer: /point\s*pod/i.test(name)
        ? "Modern Power"
        : /hubbell/i.test(name)
          ? "Hubbell"
          : /free\s*power/i.test(name)
            ? "Free Power"
            : /glowback/i.test(name)
              ? "Glowback"
              : /invisacook/i.test(name)
                ? "InvisaCook"
                : "ESF Specialty",
      displayName,
      description,
      availability: "special_order",
      customerVisible: true,
      active: true,
      roomEligibility: ["kitchen", "bar_prep", "vanity"],
      pricingTreatment: isReviewOnly ? "review_only" : "priced",
      requiresCutout: false,
      relatedCutoutType: null,
      estimatorReviewRequired: isReviewOnly,
      sourceSheet: SHEET_SPECIALTY,
      sourceVersion
    };

    if (!isReviewOnly && installed != null) {
      product.sellPrice = installed;
      product.installedPrice = installed;
    }

    products.push(product);
  }

  return products;
}

/**
 * @param {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct[]} products
 */
function buildQualityReport(products, excludedRows) {
  /** @type {Record<string, number>} */
  const countsBySheet = {};
  /** @type {Record<string, number>} */
  const countsByCategory = {};
  /** @type {{ productId: string, displayName: string, sourceSheet: string }[]} */
  const missingImages = [];

  for (const p of products) {
    countsBySheet[p.sourceSheet] = (countsBySheet[p.sourceSheet] || 0) + 1;
    countsByCategory[p.category] = (countsByCategory[p.category] || 0) + 1;
    const hasImage = Boolean(p.imageUrl) || (p.variants || []).some((v) => v.imageUrl);
    if (!hasImage && p.customerVisible) {
      missingImages.push({
        productId: p.productId,
        displayName: p.displayName,
        sourceSheet: p.sourceSheet
      });
    }
  }

  return {
    missingImages,
    countsBySheet,
    countsByCategory,
    excludedRowCount: excludedRows.length,
    productCount: products.length
  };
}

/**
 * @param {string | Buffer} workbookPathOrBuffer
 */
export function normalizeEsfPlumbingWorkbook(workbookPathOrBuffer) {
  const { workbook, sourceVersion, sourceLabel } = loadWorkbook(workbookPathOrBuffer);
  /** @type {{ sheet: string, row: number, reason: string }[]} */
  const excludedRows = [];

  const kansas = normalizeKansas(workbook, excludedRows, sourceVersion);
  const blanco = normalizeBlanco(workbook, excludedRows, sourceVersion);
  const faucets = normalizeFaucets(workbook, excludedRows, sourceVersion);
  const specialty = normalizeSpecialty(workbook, excludedRows, sourceVersion);

  const products = [...kansas, ...blanco, ...faucets, ...specialty];
  const qualityReport = buildQualityReport(products, excludedRows);

  return {
    contract: ESF_PLUMBING_CATALOG_CONTRACT_ID,
    sourceVersion,
    sourceLabel,
    products,
    excludedRows,
    qualityReport
  };
}
