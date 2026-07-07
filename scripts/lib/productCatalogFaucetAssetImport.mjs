/**
 * Product Catalog — Delta/Moen faucet asset import helpers (pure, no I/O in core matchers).
 */
import fs from "node:fs";
import path from "node:path";

export const FAUCET_IMPORT_ACTION = Object.freeze({
  COPY_ASSETS_AND_PUBLISH: "COPY_ASSETS_AND_PUBLISH",
  SKIP_ALREADY_PUBLISHED: "SKIP_ALREADY_PUBLISHED",
  UNMATCHED: "UNMATCHED",
  AMBIGUOUS: "AMBIGUOUS",
  DUPLICATE_SOURCE: "DUPLICATE_SOURCE",
  MISSING_IMAGE: "MISSING_IMAGE",
  MISSING_SPEC_SHEET: "MISSING_SPEC_SHEET",
});

export const FAUCET_FINISH_HERO_ORDER = Object.freeze([
  "matte-black",
  "black",
  "spotshield-stainless",
  "stainless",
  "arctic-stainless",
  "chrome",
  "champagne-bronze",
  "orb",
  "bzg",
  "srs",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SPEC_EXTENSIONS = new Set([".pdf"]);

/** Same slugify as scripts/build-product-catalog.mjs */
export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function finishKeyFromFilename(filename) {
  return slugify(path.basename(filename, path.extname(filename)));
}

export function faucetPublicBase(productId) {
  return `/product-catalog/faucets/${productId}`;
}

export function faucetSpecSheetPublicUrl(productId) {
  return `/product-catalog/spec-sheets/${productId}/${productId}.pdf`;
}

export function expectedProductIdFromFolder(folderName) {
  return slugify(`faucet-${String(folderName ?? "").trim()}`);
}

export function normalizeModelTokens(text) {
  return String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export function parseManufacturerDirName(dirName) {
  const raw = String(dirName ?? "").trim();
  if (!raw) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function manufacturerMatchesCatalogItem(manufacturer, item) {
  const m = String(manufacturer ?? "").toLowerCase();
  const id = String(item?.id ?? "").toLowerCase();
  const sku = String(item?.sku ?? item?.originalName ?? "").toLowerCase();
  if (m === "delta") return id.startsWith("faucet-delta") || sku.startsWith("delta");
  if (m === "moen") return id.startsWith("faucet-moen") || sku.startsWith("moen");
  return false;
}

/** Load faucet rows from generated productCatalogData.ts (no TS import). */
export function loadFaucetCatalogItems(catalogDataPath) {
  const text = fs.readFileSync(catalogDataPath, "utf8");
  const match = text.match(/export const PRODUCT_CATALOG_ITEMS[^=]*=\s*(\[[\s\S]*\])\s*;/);
  if (!match) throw new Error("Could not parse PRODUCT_CATALOG_ITEMS array");
  const all = JSON.parse(match[1].replace(/ as const/g, ""));
  return all.filter((item) => item.category === "faucet" && item.type !== "Accessory");
}

export function loadFaucetMatchMap(matchMapPath) {
  if (!matchMapPath || !fs.existsSync(matchMapPath)) return new Map();
  const raw = JSON.parse(fs.readFileSync(matchMapPath, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw?.entries ?? Object.entries(raw ?? {}).map(([k, v]) => ({
    sourceFolder: k,
    productId: typeof v === "string" ? v : v?.productId,
  }));
  const map = new Map();
  for (const row of entries) {
    const folder = String(row.sourceFolder ?? row.source_folder ?? row.folder ?? "").trim();
    const productId = String(row.productId ?? row.product_id ?? row.catalogItemId ?? "").trim();
    if (folder && productId) map.set(folder, productId);
  }
  return map;
}

export function scanFaucetProductFolder(folderPath) {
  const finishImages = [];
  let specSheet = null;
  for (const name of fs.readdirSync(folderPath)) {
    if (name.startsWith(".")) continue;
    const full = path.join(folderPath, name);
    if (!fs.statSync(full).isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) finishImages.push(name);
    else if (SPEC_EXTENSIONS.has(ext) && !specSheet) specSheet = name;
  }
  finishImages.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return { finishImages, specSheet };
}

export function pickDefaultFinishKey(finishImages) {
  const keys = finishImages.map(finishKeyFromFilename);
  for (const preferred of FAUCET_FINISH_HERO_ORDER) {
    if (keys.includes(preferred)) return preferred;
  }
  return keys[0] ?? null;
}

export function buildFinishImageUrlMap(productId, finishImages) {
  const base = faucetPublicBase(productId);
  const map = {};
  for (const file of finishImages) {
    map[finishKeyFromFilename(file)] = `${base}/${file}`;
  }
  return map;
}

export function buildProposedFaucetOverride({
  productId,
  finishImages,
  defaultFinishKey,
  sourceNotes,
}) {
  const finishImageUrls = buildFinishImageUrlMap(productId, finishImages);
  const heroKey = defaultFinishKey ?? pickDefaultFinishKey(finishImages);
  return {
    productId,
    imageUrl: heroKey ? finishImageUrls[heroKey] : undefined,
    finishImageUrls,
    defaultFinishKey: heroKey ?? undefined,
    specSheetUrl: faucetSpecSheetPublicUrl(productId),
    sourceNotes,
  };
}

export function findCatalogMatches(catalogItems, manufacturer, folderName, matchMap) {
  if (matchMap?.has(folderName)) {
    const id = matchMap.get(folderName);
    const hit = catalogItems.find((item) => item.id === id);
    return hit ? [{ item: hit, method: "match_map" }] : [];
  }

  const expectedId = expectedProductIdFromFolder(folderName);
  const byId = catalogItems.filter((item) => item.id === expectedId);
  if (byId.length === 1) return [{ item: byId[0], method: "folder_slug" }];
  if (byId.length > 1) return byId.map((item) => ({ item, method: "folder_slug" }));

  const folderTokens = normalizeModelTokens(folderName.replace(/^(delta|moen)\s+/i, ""));
  const tokenMatches = catalogItems.filter((item) => {
    if (!manufacturerMatchesCatalogItem(manufacturer, item)) return false;
    const skuTokens = normalizeModelTokens(item.sku || item.name || item.id.replace(/^faucet-(delta|moen)-/i, ""));
    return skuTokens && folderTokens && (skuTokens === folderTokens || skuTokens.includes(folderTokens) || folderTokens.includes(skuTokens));
  });
  return tokenMatches.map((item) => ({ item, method: "model_tokens" }));
}

export function destinationPaths(publicRoot, productId, finishImages) {
  const imagePaths = finishImages.map((file) =>
    path.join(publicRoot, "product-catalog/faucets", productId, file)
  );
  const specPath = path.join(
    publicRoot,
    "product-catalog/spec-sheets",
    productId,
    `${productId}.pdf`
  );
  return { imagePaths, specPath };
}

export function overrideAssetsPresent(publicRoot, override) {
  if (!override?.productId) return false;
  const hero = override.imageUrl?.replace(/^\//, "");
  const heroPath = hero ? path.join(publicRoot, hero) : null;
  const spec = override.specSheetUrl?.replace(/^\//, "");
  const specPath = spec ? path.join(publicRoot, spec) : null;
  const finishPaths = Object.values(override.finishImageUrls ?? {}).map((url) =>
    path.join(publicRoot, String(url).replace(/^\//, ""))
  );
  const hasHero = heroPath ? fs.existsSync(heroPath) : false;
  const hasSpec = specPath ? fs.existsSync(specPath) : false;
  const finishCount = finishPaths.filter((p) => fs.existsSync(p)).length;
  return hasHero && hasSpec && finishCount > 0;
}

export function buildFaucetImportPlan({
  sourceDir,
  catalogItems,
  publicRoot,
  existingOverridesById,
  matchMap,
}) {
  const rows = [];
  const byProductId = new Map();

  for (const manufacturerDir of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!manufacturerDir.isDirectory()) continue;
    if (manufacturerDir.name.startsWith(".")) continue;
    const manufacturer = parseManufacturerDirName(manufacturerDir.name);
    const manufacturerPath = path.join(sourceDir, manufacturerDir.name);

    for (const productDir of fs.readdirSync(manufacturerPath, { withFileTypes: true })) {
      if (!productDir.isDirectory()) continue;
      if (productDir.name.startsWith(".")) continue;

      const folderName = productDir.name;
      const folderPath = path.join(manufacturerPath, folderName);
      const { finishImages, specSheet } = scanFaucetProductFolder(folderPath);
      const defaultFinishKey = pickDefaultFinishKey(finishImages);
      const matches = findCatalogMatches(catalogItems, manufacturer, folderName, matchMap)
        .filter(({ item }) => manufacturerMatchesCatalogItem(manufacturer, item));

      let action = FAUCET_IMPORT_ACTION.UNMATCHED;
      let catalogItem = null;
      let matchMethod = null;
      let warnings = [];

      if (matches.length > 1) {
        action = FAUCET_IMPORT_ACTION.AMBIGUOUS;
        warnings.push(`ambiguous:${matches.map((m) => m.item.id).join("|")}`);
      } else if (matches.length === 1) {
        catalogItem = matches[0].item;
        matchMethod = matches[0].method;
        if (!finishImages.length) action = FAUCET_IMPORT_ACTION.MISSING_IMAGE;
        else if (!specSheet) action = FAUCET_IMPORT_ACTION.MISSING_SPEC_SHEET;
        else action = FAUCET_IMPORT_ACTION.COPY_ASSETS_AND_PUBLISH;
      }

      const productId = catalogItem?.id ?? null;
      const proposedOverride = productId && finishImages.length
        ? buildProposedFaucetOverride({
            productId,
            finishImages,
            defaultFinishKey,
            sourceNotes: `Imported from ${manufacturer}/${folderName} (Digital Assets/Faucets).`,
          })
        : null;

      if (
        action === FAUCET_IMPORT_ACTION.COPY_ASSETS_AND_PUBLISH &&
        productId &&
        proposedOverride
      ) {
        const existing = existingOverridesById.get(productId);
        if (existing && overrideAssetsPresent(publicRoot, existing)) {
          action = FAUCET_IMPORT_ACTION.SKIP_ALREADY_PUBLISHED;
        }
      }

      const row = {
        manufacturer,
        sourceFolderName: folderName,
        sourceFolderPath: folderPath,
        parsedManufacturer: manufacturer,
        parsedModelTokens: normalizeModelTokens(folderName),
        matchedProductId: productId,
        matchedProductName: catalogItem?.name ?? null,
        matchedManufacturer: catalogItem?.brand ?? catalogItem?.sku?.split(/\s+/)[0] ?? null,
        finishImageFiles: finishImages,
        specSheetFile: specSheet,
        destinationImagePaths: productId
          ? finishImages.map((f) => `${faucetPublicBase(productId)}/${f}`)
          : [],
        destinationSpecSheetPath: productId ? faucetSpecSheetPublicUrl(productId) : null,
        proposedOverride,
        matchMethod,
        action,
        warnings,
      };

      if (productId && action === FAUCET_IMPORT_ACTION.COPY_ASSETS_AND_PUBLISH) {
        if (byProductId.has(productId)) {
          row.action = FAUCET_IMPORT_ACTION.DUPLICATE_SOURCE;
          row.warnings = [...warnings, `duplicate_source:${byProductId.get(productId)}`];
        } else {
          byProductId.set(productId, folderName);
        }
      }

      rows.push(row);
    }
  }

  return rows;
}

export function summarizeFaucetImportPlan(rows) {
  const count = (action) => rows.filter((r) => r.action === action).length;
  const blockers = rows.filter((r) =>
    [
      FAUCET_IMPORT_ACTION.UNMATCHED,
      FAUCET_IMPORT_ACTION.AMBIGUOUS,
      FAUCET_IMPORT_ACTION.DUPLICATE_SOURCE,
      FAUCET_IMPORT_ACTION.MISSING_IMAGE,
      FAUCET_IMPORT_ACTION.MISSING_SPEC_SHEET,
    ].includes(r.action)
  );
  return {
    total_folders: rows.length,
    copy_assets_and_publish: count(FAUCET_IMPORT_ACTION.COPY_ASSETS_AND_PUBLISH),
    skip_already_published: count(FAUCET_IMPORT_ACTION.SKIP_ALREADY_PUBLISHED),
    unmatched: count(FAUCET_IMPORT_ACTION.UNMATCHED),
    ambiguous: count(FAUCET_IMPORT_ACTION.AMBIGUOUS),
    duplicate_source: count(FAUCET_IMPORT_ACTION.DUPLICATE_SOURCE),
    missing_image: count(FAUCET_IMPORT_ACTION.MISSING_IMAGE),
    missing_spec_sheet: count(FAUCET_IMPORT_ACTION.MISSING_SPEC_SHEET),
    apply_blocked: blockers.length > 0,
    apply_allowed: blockers.length === 0,
    rows,
  };
}

export function formatFaucetImportSummaryText(summary) {
  const lines = [
    "Product Catalog Faucet Asset Import — Dry Run Summary",
    "=====================================================",
    `Total source folders:        ${summary.total_folders}`,
    `COPY_ASSETS_AND_PUBLISH:     ${summary.copy_assets_and_publish}`,
    `SKIP_ALREADY_PUBLISHED:      ${summary.skip_already_published}`,
    `UNMATCHED:                   ${summary.unmatched}`,
    `AMBIGUOUS:                   ${summary.ambiguous}`,
    `DUPLICATE_SOURCE:            ${summary.duplicate_source}`,
    `MISSING_IMAGE:               ${summary.missing_image}`,
    `MISSING_SPEC_SHEET:          ${summary.missing_spec_sheet}`,
    "",
    `Apply allowed:               ${summary.apply_allowed ? "YES" : "NO"}`,
    "",
  ];

  const blockActions = new Set([
    FAUCET_IMPORT_ACTION.UNMATCHED,
    FAUCET_IMPORT_ACTION.AMBIGUOUS,
    FAUCET_IMPORT_ACTION.DUPLICATE_SOURCE,
    FAUCET_IMPORT_ACTION.MISSING_IMAGE,
    FAUCET_IMPORT_ACTION.MISSING_SPEC_SHEET,
  ]);

  for (const action of Object.values(FAUCET_IMPORT_ACTION)) {
    const group = summary.rows.filter((r) => r.action === action);
    if (!group.length) continue;
    lines.push(`── ${action} (${group.length}) ──`);
    for (const row of group) {
      lines.push(
        `  ${row.manufacturer}/${row.sourceFolderName} → ${row.matchedProductId ?? "?"} (${row.matchedProductName ?? "?"})`
      );
    }
    lines.push("");
  }

  if (summary.apply_blocked) {
    lines.push("── Blockers ──");
    for (const row of summary.rows.filter((r) => blockActions.has(r.action))) {
      lines.push(`  ${row.action}: ${row.manufacturer}/${row.sourceFolderName}`);
    }
  }

  return lines.join("\n");
}

export function generateFaucetOverridesTs(overrides) {
  const entries = overrides.map((o) => {
    const lines = [
      "  {",
      `    productId: ${JSON.stringify(o.productId)},`,
    ];
    if (o.imageUrl) lines.push(`    imageUrl: ${JSON.stringify(o.imageUrl)},`);
    if (o.finishImageUrls && Object.keys(o.finishImageUrls).length) {
      lines.push(`    finishImageUrls: ${JSON.stringify(o.finishImageUrls, null, 2).replace(/\n/g, "\n    ")},`);
    }
    if (o.defaultFinishKey) lines.push(`    defaultFinishKey: ${JSON.stringify(o.defaultFinishKey)},`);
    if (o.specSheetUrl) lines.push(`    specSheetUrl: ${JSON.stringify(o.specSheetUrl)},`);
    if (o.diagramUrl) lines.push(`    diagramUrl: ${JSON.stringify(o.diagramUrl)},`);
    if (o.sourceNotes) lines.push(`    sourceNotes: ${JSON.stringify(o.sourceNotes)},`);
    lines.push("  }");
    return lines.join("\n");
  });
  return `/**
 * AUTO-GENERATED — do not edit by hand.
 * Regenerate: npm run eos:import:product-catalog-faucet-assets (with write flag)
 *
 * Delta/Moen faucet asset overrides (finish images + spec sheets).
 */
import type { ProductCatalogAssetOverride } from "./productCatalogAssets";

export const PRODUCT_CATALOG_FAUCET_OVERRIDES: ProductCatalogAssetOverride[] = [
${entries.join(",\n")}
];
`;
}

export function parseExistingFaucetOverrides(overridesTsPath) {
  if (!fs.existsSync(overridesTsPath)) return new Map();
  const text = fs.readFileSync(overridesTsPath, "utf8");
  const match = text.match(/export const PRODUCT_CATALOG_FAUCET_OVERRIDES[^=]*=\s*(\[[\s\S]*\])\s*;/);
  if (!match) return new Map();
  try {
    const list = JSON.parse(match[1]);
    return new Map(list.map((o) => [o.productId, o]));
  } catch {
    return new Map();
  }
}
