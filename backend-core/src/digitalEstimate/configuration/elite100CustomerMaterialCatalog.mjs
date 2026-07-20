/**
 * Server-authoritative Elite 100 customer material catalog (Digital Estimate).
 *
 * Contract: elite100-customer-materials-v2
 *   - Generated from slabInventory/fixtures/elite100-2026.json (100 active colors).
 *   - Remnant is NOT in the fixture; remnant rows (if added) default to
 *     customerVisible:false / remnantPermitted:false and are excluded from the
 *     default list unless remnantPermitted is passed to listElite100CustomerMaterials.
 *   - Pricing group codes are internal-only — never project into public customer DTOs.
 *   - Image paths are same-origin static assets under /materials/elite100/.
 *
 * v1 → v2: catalog grew from 17 hand-maintained colors to the full Elite 100;
 * materialIds for the original 17 are preserved. Contract id bumped to v2.
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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUP_CODE_DISPLAY_NAMES } from "./approvedPricingFixtures.mjs";

/** Current catalog contract (v2 = full Elite 100 from fixture). */
export const ELITE100_MATERIAL_CATALOG_CONTRACT = "elite100-customer-materials-v2";

/** @deprecated Prefer ELITE100_MATERIAL_CATALOG_CONTRACT (v2). Kept for migration / dual-export. */
export const ELITE100_MATERIAL_CATALOG_CONTRACT_V1 = "elite100-customer-materials-v1";

/** @typedef {{
 *   materialId: string,
 *   displayName: string,
 *   pricingGroupCode: string,
 *   manufacturer?: string | null,
 *   sourceMaterialName?: string | null,
 *   imageAssetKey: string | null,
 *   imageThumbPath: string | null,
 *   imageFullPath: string | null,
 *   textureFallbackStatus: "ready" | "missing",
 *   customerVisible: boolean,
 *   active: boolean,
 *   remnantPermitted?: boolean,
 *   collectionLabel: string,
 *   colorFamily: string | null,
 *   patternType: string | null,
 * }} Elite100CustomerMaterial */

const FIXTURE_GROUP_TO_CODE = Object.freeze({
  Promo: "promo",
  A: "group_a",
  B: "group_b",
  C: "group_c",
  D: "group_d",
  E: "group_e",
  F: "group_f"
});

/**
 * Reconciled texture assets keyed by display color_name.
 * Asset keys may differ from materialId slug (e.g. classic-gray → Classic Grey).
 * @type {Record<string, string>}
 */
const IMAGE_ASSET_BY_DISPLAY_NAME = Object.freeze({
  "Antique Gray": "antique-gray",
  "Bayshore Sand": "bayshore-sand",
  "Bianco Carrara": "bianco-carrara",
  "Carrara Classic": "carrara-classic",
  "Carrara Royale": "carrara-royale",
  "Classic Grey": "classic-gray",
  "India Black Pearl": "india-black-pearl-polished",
  Sicilia: "sicilia",
  "Silver Pearl": "silver-pearl-polished",
  "Suede Brown": "suede-brown-polished",
  "White Dove": "white-dove"
});

/**
 * Optional presentation metadata preserved from the v1 hand catalog.
 * @type {Record<string, { colorFamily: string | null, patternType: string | null }>}
 */
const PRESENTATION_BY_MATERIAL_ID = Object.freeze({
  "e100-carrara-classic": { colorFamily: "White", patternType: "veined" },
  "e100-bianco-carrara": { colorFamily: "White", patternType: "veined" },
  "e100-bayshore-sand": { colorFamily: "Beige", patternType: "solid" },
  "e100-antique-gray": { colorFamily: "Gray", patternType: "solid" },
  "e100-carrara-royale": { colorFamily: "White", patternType: "veined" },
  "e100-classic-grey": { colorFamily: "Gray", patternType: "solid" },
  "e100-india-black-pearl": { colorFamily: "Black", patternType: "solid" },
  "e100-sicilia": { colorFamily: "White", patternType: "veined" },
  "e100-silver-pearl": { colorFamily: "Gray", patternType: "solid" },
  "e100-suede-brown": { colorFamily: "Brown", patternType: "solid" },
  "e100-white-dove": { colorFamily: "White", patternType: "solid" },
  "e100-axbridge": { colorFamily: "Gray", patternType: "solid" },
  "e100-bear-hug": { colorFamily: "Beige", patternType: "solid" },
  "e100-alabaster": { colorFamily: "White", patternType: "solid" },
  "e100-calacatta-gold": { colorFamily: "White", patternType: "veined" },
  "e100-belfast-gray": { colorFamily: "Gray", patternType: "solid" },
  "e100-honeydew": { colorFamily: "Beige", patternType: "solid" }
});

/**
 * @param {string} assetKey
 */
function imagePaths(assetKey) {
  return {
    imageAssetKey: assetKey,
    imageThumbPath: `/materials/elite100/thumb/${assetKey}.jpg`,
    imageFullPath: `/materials/elite100/full/${assetKey}.jpg`
  };
}

/**
 * Slugify Elite 100 color_name → materialId suffix (preserves v1 ids for the original 17).
 * @param {string} colorName
 */
export function slugifyElite100ColorName(colorName) {
  return String(colorName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a remnant catalog row (not in fixture). Defaults: not customer-visible, not permitted.
 * @param {{ materialId: string, displayName: string, manufacturer?: string | null }} input
 * @returns {Elite100CustomerMaterial}
 */
export function buildRemnantCustomerMaterial(input) {
  return {
    materialId: String(input.materialId),
    displayName: String(input.displayName),
    pricingGroupCode: "remnant",
    manufacturer: input.manufacturer ?? null,
    sourceMaterialName: input.manufacturer ?? null,
    imageAssetKey: null,
    imageThumbPath: null,
    imageFullPath: null,
    textureFallbackStatus: "missing",
    customerVisible: false,
    active: false,
    remnantPermitted: false,
    collectionLabel: "Remnant",
    colorFamily: null,
    patternType: null
  };
}

/**
 * @param {object} fixture
 * @returns {Elite100CustomerMaterial[]}
 */
function buildMaterialsFromFixture(fixture) {
  const groups = fixture?.groups || {};
  /** @type {Elite100CustomerMaterial[]} */
  const out = [];
  const seenIds = new Set();

  for (const [groupKey, items] of Object.entries(groups)) {
    const pricingGroupCode = FIXTURE_GROUP_TO_CODE[groupKey];
    if (!pricingGroupCode) {
      throw new Error(`Unknown Elite 100 fixture group key: ${groupKey}`);
    }
    const list = Array.isArray(items) ? items : [];
    for (const item of list) {
      const displayName = String(item.color_name || "").trim();
      if (!displayName) continue;
      const slug = slugifyElite100ColorName(displayName);
      if (!slug) {
        throw new Error(`Unable to slugify Elite 100 color: ${displayName}`);
      }
      const materialId = `e100-${slug}`;
      if (seenIds.has(materialId)) {
        throw new Error(`Duplicate Elite 100 materialId: ${materialId}`);
      }
      seenIds.add(materialId);

      const manufacturer = item.material_name != null ? String(item.material_name) : null;
      const assetKey = IMAGE_ASSET_BY_DISPLAY_NAME[displayName] || null;
      const images = assetKey
        ? imagePaths(assetKey)
        : { imageAssetKey: null, imageThumbPath: null, imageFullPath: null };
      const presentation = PRESENTATION_BY_MATERIAL_ID[materialId] || {
        colorFamily: null,
        patternType: null
      };

      out.push({
        materialId,
        displayName,
        pricingGroupCode,
        manufacturer,
        sourceMaterialName: manufacturer,
        ...images,
        textureFallbackStatus: assetKey ? "ready" : "missing",
        customerVisible: true,
        active: true,
        remnantPermitted: false,
        collectionLabel: "Elite 100",
        colorFamily: presentation.colorFamily,
        patternType: presentation.patternType
      });
    }
  }

  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const elite100Fixture = JSON.parse(
  readFileSync(join(__dirname, "../../slabInventory/fixtures/elite100-2026.json"), "utf8")
);

/** @type {Elite100CustomerMaterial[]} */
export const ELITE100_CUSTOMER_MATERIALS = Object.freeze(buildMaterialsFromFixture(elite100Fixture));

const LEGACY_GROUP_CODES = new Set([
  "promo",
  "group_a",
  "group_b",
  "group_c",
  "group_d",
  "group_e",
  "group_f",
  "remnant"
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
 * Default list: active + customer-visible Elite 100 colors.
 * Remnant (and inactive) rows are excluded unless explicitly opted in.
 *
 * @param {boolean} [customerVisibleOnly=true]
 * @param {{ remnantPermitted?: boolean, includeInactive?: boolean }} [opts]
 * @returns {Elite100CustomerMaterial[]}
 */
export function listElite100CustomerMaterials(customerVisibleOnly = true, opts = {}) {
  const remnantPermitted = Boolean(opts.remnantPermitted);
  const includeInactive = Boolean(opts.includeInactive);
  return ELITE100_CUSTOMER_MATERIALS.filter((m) => {
    if (!includeInactive && m.active === false) return false;
    const isRemnant = m.pricingGroupCode === "remnant";
    if (isRemnant) {
      if (!(remnantPermitted || m.remnantPermitted)) return false;
      // Remnant defaults to customerVisible:false; only surface when permitted.
      if (customerVisibleOnly && !m.customerVisible && !(remnantPermitted || m.remnantPermitted)) {
        return false;
      }
      return true;
    }
    if (customerVisibleOnly && !m.customerVisible) return false;
    return true;
  });
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
    textureFallbackStatus: m.textureFallbackStatus || (m.imageThumbPath ? "ready" : "missing"),
    customerVisible: m.customerVisible,
    active: m.active !== false,
    collectionLabel: m.collectionLabel,
    colorFamily: m.colorFamily,
    patternType: m.patternType,
    manufacturer: m.manufacturer ?? m.sourceMaterialName ?? null,
    hasImagery: Boolean(m.imageThumbPath)
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
    textureFallbackStatus: m.textureFallbackStatus || (m.imageThumbPath ? "ready" : "missing"),
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
  const inGroup = listElite100CustomerMaterials(true).filter((m) => m.pricingGroupCode === code);
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
      legacyGroupOnly: false
    };
  }

  const groupFromCompat = compat.materialGroup ? String(compat.materialGroup).toLowerCase() : null;
  const groupFromKey = parsed && LEGACY_GROUP_CODES.has(parsed.token) ? parsed.token : null;
  const materialGroup = groupFromCompat || groupFromKey;
  return {
    materialId: null,
    materialGroup,
    roomKey,
    legacyGroupOnly: true
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
