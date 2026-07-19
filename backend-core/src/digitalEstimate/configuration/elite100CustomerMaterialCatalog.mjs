/**
 * Server-authoritative Elite 100 customer material catalog (Digital Estimate).
 * Pricing group codes are internal-only — never project into public customer DTOs.
 * Image paths are same-origin static assets under /materials/elite100/.
 *
 * Texture inventory (Lovable → reconciled):
 *   antique-gray.jpg              → Antique Gray (promo) — exact name match
 *   bayshore-sand.jpg             → Bayshore Sand (promo) — exact name match
 *   bianco-carrara.jpg            → Bianco Carrara (promo) — exact name match
 *   carrara-classic.jpg           → Carrara Classic (promo) — exact name match
 *   carrara-royale.jpg            → Carrara Royale (promo) — exact name match
 *   classic-gray.jpg              → Classic Grey (promo) — approved Gray/Grey alias
 *   india-black-pearl-polished.jpg → India Black Pearl (promo) — polished finish suffix on asset
 *   sicilia.jpg                   → Sicilia (promo) — exact name match
 *   silver-pearl-polished.jpg     → Silver Pearl (promo) — polished finish suffix on asset
 *   suede-brown-polished.jpg      → Suede Brown (promo) — polished finish suffix on asset
 *   white-dove.jpg                → White Dove (promo) — exact name match
 *
 * Ambiguous / unused: none from the Lovable Elite 100 texture set (11 unique colors).
 */

import { GROUP_CODE_DISPLAY_NAMES } from "./approvedPricingFixtures.mjs";

export const ELITE100_MATERIAL_CATALOG_CONTRACT = "elite100-customer-materials-v1";

/** @typedef {{
 *   materialId: string,
 *   displayName: string,
 *   pricingGroupCode: string,
 *   imageAssetKey: string | null,
 *   imageThumbPath: string | null,
 *   imageFullPath: string | null,
 *   customerVisible: boolean,
 *   collectionLabel: string,
 *   colorFamily: string | null,
 *   patternType: string | null,
 * }} Elite100CustomerMaterial */

/**
 * @param {string} assetKey
 */
function imagePaths(assetKey) {
  return {
    imageAssetKey: assetKey,
    imageThumbPath: `/materials/elite100/thumb/${assetKey}.jpg`,
    imageFullPath: `/materials/elite100/full/${assetKey}.jpg`,
  };
}

/** @type {Elite100CustomerMaterial[]} */
export const ELITE100_CUSTOMER_MATERIALS = Object.freeze([
  // Promo — reconciled textures
  {
    materialId: "e100-carrara-classic",
    displayName: "Carrara Classic",
    pricingGroupCode: "promo",
    ...imagePaths("carrara-classic"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "veined",
  },
  {
    materialId: "e100-bianco-carrara",
    displayName: "Bianco Carrara",
    pricingGroupCode: "promo",
    ...imagePaths("bianco-carrara"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "veined",
  },
  {
    materialId: "e100-bayshore-sand",
    displayName: "Bayshore Sand",
    pricingGroupCode: "promo",
    ...imagePaths("bayshore-sand"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Beige",
    patternType: "solid",
  },
  {
    materialId: "e100-antique-gray",
    displayName: "Antique Gray",
    pricingGroupCode: "promo",
    ...imagePaths("antique-gray"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Gray",
    patternType: "solid",
  },
  {
    materialId: "e100-carrara-royale",
    displayName: "Carrara Royale",
    pricingGroupCode: "promo",
    ...imagePaths("carrara-royale"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "veined",
  },
  {
    materialId: "e100-classic-grey",
    displayName: "Classic Grey",
    pricingGroupCode: "promo",
    ...imagePaths("classic-gray"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Gray",
    patternType: "solid",
  },
  {
    materialId: "e100-india-black-pearl",
    displayName: "India Black Pearl",
    pricingGroupCode: "promo",
    ...imagePaths("india-black-pearl-polished"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Black",
    patternType: "solid",
  },
  {
    materialId: "e100-sicilia",
    displayName: "Sicilia",
    pricingGroupCode: "promo",
    ...imagePaths("sicilia"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "veined",
  },
  {
    materialId: "e100-silver-pearl",
    displayName: "Silver Pearl",
    pricingGroupCode: "promo",
    ...imagePaths("silver-pearl-polished"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Gray",
    patternType: "solid",
  },
  {
    materialId: "e100-suede-brown",
    displayName: "Suede Brown",
    pricingGroupCode: "promo",
    ...imagePaths("suede-brown-polished"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Brown",
    patternType: "solid",
  },
  {
    materialId: "e100-white-dove",
    displayName: "White Dove",
    pricingGroupCode: "promo",
    ...imagePaths("white-dove"),
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "solid",
  },
  // Cross-group colors without reconciled textures (name-only cards; still customer-selectable when frozen)
  {
    materialId: "e100-axbridge",
    displayName: "Axbridge",
    pricingGroupCode: "group_a",
    imageAssetKey: null,
    imageThumbPath: null,
    imageFullPath: null,
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Gray",
    patternType: "solid",
  },
  {
    materialId: "e100-bear-hug",
    displayName: "Bear Hug",
    pricingGroupCode: "group_a",
    imageAssetKey: null,
    imageThumbPath: null,
    imageFullPath: null,
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Beige",
    patternType: "solid",
  },
  {
    materialId: "e100-alabaster",
    displayName: "Alabaster",
    pricingGroupCode: "group_b",
    imageAssetKey: null,
    imageThumbPath: null,
    imageFullPath: null,
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "solid",
  },
  {
    materialId: "e100-calacatta-gold",
    displayName: "Calacatta Gold",
    pricingGroupCode: "group_b",
    imageAssetKey: null,
    imageThumbPath: null,
    imageFullPath: null,
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "veined",
  },
  {
    materialId: "e100-belfast-gray",
    displayName: "Belfast Gray",
    pricingGroupCode: "group_c",
    imageAssetKey: null,
    imageThumbPath: null,
    imageFullPath: null,
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Gray",
    patternType: "solid",
  },
  {
    materialId: "e100-honeydew",
    displayName: "Honeydew",
    pricingGroupCode: "group_c",
    imageAssetKey: null,
    imageThumbPath: null,
    imageFullPath: null,
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "Beige",
    patternType: "solid",
  },
]);

const LEGACY_GROUP_CODES = new Set([
  "promo",
  "group_a",
  "group_b",
  "group_c",
  "group_d",
  "group_e",
  "group_f",
  "remnant",
]);

/** @type {Map<string, Elite100CustomerMaterial>} */
const BY_ID = new Map(ELITE100_CUSTOMER_MATERIALS.map((m) => [m.materialId, m]));

/**
 * @param {string|null|undefined} materialId
 * @returns {Elite100CustomerMaterial|null}
 */
export function getElite100CustomerMaterial(materialId) {
  if (!materialId) return null;
  return BY_ID.get(String(materialId).trim()) || null;
}

/**
 * @param {boolean} [customerVisibleOnly]
 * @returns {Elite100CustomerMaterial[]}
 */
export function listElite100CustomerMaterials(customerVisibleOnly = true) {
  return ELITE100_CUSTOMER_MATERIALS.filter((m) => (customerVisibleOnly ? m.customerVisible : true));
}

/**
 * Studio-safe projection (includes pricing group for envelope building).
 * @param {Elite100CustomerMaterial} m
 */
export function toStudioMaterialRecord(m) {
  return {
    materialId: m.materialId,
    displayName: m.displayName,
    pricingGroupCode: m.pricingGroupCode,
    imageThumbPath: m.imageThumbPath,
    imageFullPath: m.imageFullPath,
    customerVisible: m.customerVisible,
    collectionLabel: m.collectionLabel,
    colorFamily: m.colorFamily,
    patternType: m.patternType,
    hasImagery: Boolean(m.imageThumbPath),
  };
}

/**
 * Customer-safe projection — never includes pricingGroupCode, rates, or internal evidence.
 * @param {Elite100CustomerMaterial} m
 * @param {{ roomKey?: string, optionKey?: string, includedInBaseline?: boolean, isDefault?: boolean, selectable?: boolean }} [ctx]
 */
export function toCustomerSafeMaterialRecord(m, ctx = {}) {
  const groupLabel =
    GROUP_CODE_DISPLAY_NAMES[m.pricingGroupCode] ||
    (m.pricingGroupCode ? String(m.pricingGroupCode) : null);
  return {
    materialId: m.materialId,
    displayName: m.displayName,
    imageAssetPath: m.imageThumbPath,
    imageFullPath: m.imageFullPath,
    collectionLabel: m.collectionLabel,
    colorFamily: m.colorFamily,
    patternType: m.patternType,
    pricingGroupLabel: groupLabel,
    customerVisible: m.customerVisible,
    roomKey: ctx.roomKey ?? null,
    optionKey: ctx.optionKey ?? null,
    includedInBaseline: Boolean(ctx.includedInBaseline),
    isDefault: Boolean(ctx.isDefault),
    selectable: ctx.selectable !== false
  };
}

/**
 * Pick a default material for a baseline pricing group (prefer imagery).
 * @param {string|null|undefined} groupCode
 * @returns {Elite100CustomerMaterial|null}
 */
export function pickDefaultMaterialForGroup(groupCode) {
  const code = String(groupCode || "").trim().toLowerCase();
  if (!code) return null;
  const inGroup = ELITE100_CUSTOMER_MATERIALS.filter(
    (m) => m.customerVisible && m.pricingGroupCode === code
  );
  if (!inGroup.length) return null;
  return inGroup.find((m) => m.imageThumbPath) || inGroup[0];
}

/**
 * Parse material option key: material:{roomKey}:{materialId|groupCode}
 * @param {string} optionKey
 * @returns {{ roomKey: string, token: string } | null}
 */
export function parseMaterialOptionKey(optionKey) {
  const key = String(optionKey || "");
  if (!key.startsWith("material:")) return null;
  const parts = key.split(":");
  if (parts.length < 3) return null;
  const roomKey = parts[1];
  const token = parts.slice(2).join(":");
  if (!roomKey || !token) return null;
  return { roomKey, token };
}

/**
 * Resolve selected material group from envelope option + catalog (server authority).
 * Supports color-id keys and legacy group-code keys.
 * @param {{ optionKey?: string, option_key?: string, compatibility_json?: object, compatibilityJson?: object }} opt
 * @returns {{ materialId: string|null, materialGroup: string|null, roomKey: string|null, legacyGroupOnly: boolean }}
 */
export function resolveMaterialSelectionFromOption(opt) {
  const key = String(opt?.option_key || opt?.optionKey || "");
  const compat = opt?.compatibility_json || opt?.compatibilityJson || {};
  const parsed = parseMaterialOptionKey(key);
  const roomKey = compat.roomKey || parsed?.roomKey || null;
  const materialId =
    compat.materialColorId ||
    compat.materialId ||
    (parsed && !LEGACY_GROUP_CODES.has(parsed.token) ? parsed.token : null);

  if (materialId) {
    const mat = getElite100CustomerMaterial(materialId);
    if (!mat) {
      return { materialId, materialGroup: null, roomKey, legacyGroupOnly: false };
    }
    return {
      materialId: mat.materialId,
      materialGroup: mat.pricingGroupCode,
      roomKey,
      legacyGroupOnly: false,
    };
  }

  const groupFromCompat = compat.materialGroup ? String(compat.materialGroup).toLowerCase() : null;
  const groupFromKey = parsed && LEGACY_GROUP_CODES.has(parsed.token) ? parsed.token : null;
  const materialGroup = groupFromCompat || groupFromKey;
  return {
    materialId: null,
    materialGroup,
    roomKey,
    legacyGroupOnly: true,
  };
}

/**
 * @param {string} token — third segment of material option key or materialId
 * @returns {boolean}
 */
export function isKnownMaterialOrLegacyGroupToken(token) {
  const t = String(token || "").trim();
  if (!t) return false;
  if (LEGACY_GROUP_CODES.has(t)) return true;
  return BY_ID.has(t);
}

export function isLegacyMaterialGroupToken(token) {
  return LEGACY_GROUP_CODES.has(String(token || "").trim());
}
