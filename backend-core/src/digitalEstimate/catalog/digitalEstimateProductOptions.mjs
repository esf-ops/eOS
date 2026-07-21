/**
 * Digital Estimate room product option helpers (sink / faucet / accessory / specialty /
 * backsplash / side splash). Server-authoritative sell prices from ESF catalog seed.
 */

import { ceilBillableSquareFeet } from "../../quotes/billableSquareFeet.mjs";
import { STANDARD_BACKSPLASH_HEIGHT_IN } from "../../quotes/vanitySideSplash.js";
import { roomHasEligibleBacksplashLocations } from "../configuration/backsplashPricingAuthority.mjs";
import {
  getCutoutCatalogKeyForProduct,
  getProductById,
  listProducts,
  resolveBlancoVariant,
  toCustomerSafeProduct
} from "./esfPlumbingCatalog.mjs";
import {
  customerFacingProductCopy,
  isAccessoryFamilyHeading,
  sideSplashPieceDisplayName,
  sideSplashModeLabel
} from "./customerFacingCopy.mjs";
import {
  inferRoomEligibilityType,
  productMatchesRoomType,
  cutoutDisplayLabelForRoom
} from "./roomEligibility.mjs";

export { inferRoomEligibilityType, productMatchesRoomType, cutoutDisplayLabelForRoom };
import {
  buildAuthoritativeEdgeOptionDefinitions,
  defaultApprovedEdgeProfileTokens,
  normalizeEdgeProfileToken,
  resolveOriginalEdgeProfile
} from "./studioEdgeAuthority.mjs";

/** Local mirror of choice-group enablement (avoids Studio↔catalog import cycles). */
function choiceGroupEnabled(groups, logicalId) {
  const set = groups instanceof Set ? groups : new Set([...groups].map(String));
  const aliases = {
    material_color: ["material_color", "materialColor"],
    cooktop_cutout: ["cooktop_cutout", "cooktop"],
    side_splash: ["side_splash", "sideSplash", "sidesplash"],
    accessories: ["accessories", "accessory"]
  };
  const keys = aliases[logicalId] || [logicalId];
  return keys.some((k) => set.has(k));
}

export const SIDE_SPLASH_HEIGHT_IN = STANDARD_BACKSPLASH_HEIGHT_IN;
export const DEFAULT_ACCESSORY_MAX_QTY = 5;

/**
 * Grids, strainers, and flanges are accessories — never first-class sink cards.
 * @param {{ productId?: string, displayName?: string, category?: string }} product
 */
export function isNonSinkPlumbingRow(product) {
  const id = String(product?.productId || "").toLowerCase();
  const name = String(product?.displayName || "").toLowerCase();
  if (/strainer|flange|\bgrid\b/.test(id) || /strainer|flange|\bgrid\b/.test(name)) return true;
  return false;
}

/**
 * Parse DE product / room option keys.
 * Product ids may themselves contain colons (kansas:SKU, blanco:family).
 *
 * @param {string} optionKey
 * @returns {{
 *   kind: string,
 *   roomKey: string|null,
 *   mode: string|null,
 *   productId: string|null,
 *   pieceKey: string|null,
 *   sideMode: string|null
 * } | null}
 */
export function parseProductOptionKey(optionKey) {
  const key = String(optionKey || "").trim();
  if (!key) return null;
  const parts = key.split(":");
  const kind = parts[0];
  if (!kind) return null;

  if (kind === "sidesplash") {
    // sidesplash:{roomKey}:{pieceKey}:none|left|right|both
    if (parts.length < 4) return null;
    const sideMode = parts[parts.length - 1];
    const roomKey = parts[1];
    const pieceKey = parts.slice(2, -1).join(":");
    return {
      kind,
      roomKey,
      mode: sideMode,
      productId: null,
      pieceKey,
      sideMode
    };
  }

  if (["sink", "faucet", "accessory", "specialty", "backsplash", "edge"].includes(kind)) {
    if (parts.length < 3) return null;
    const roomKey = parts[1];
    const mode = parts[2];
    if (mode === "esf") {
      const productId = parts.slice(3).join(":");
      if (!productId) return null;
      return { kind, roomKey, mode: "esf", productId, pieceKey: null, sideMode: null };
    }
    return { kind, roomKey, mode, productId: null, pieceKey: null, sideMode: null };
  }

  return null;
}

/**
 * Resolve a catalog product and optional variant from an option productId token
 * and/or customer product draft fields.
 *
 * @param {string} productIdToken
 * @param {{ variantSku?: string, finish?: string, productId?: string } | null} [draft]
 * @returns {{
 *   product: import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct,
 *   variant: import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogVariant | null,
 *   sellPrice: number | null
 * } | null}
 */
export function resolveCatalogProductSelection(productIdToken, draft = null) {
  const token = String(productIdToken || draft?.productId || "").trim();
  if (!token) return null;

  let product = getProductById(token);
  /** @type {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogVariant | null} */
  let variant = null;

  if (!product) {
    for (const p of listProducts({ customerVisibleOnly: false })) {
      const match = (p.variants || []).find(
        (v) =>
          v.variantId === token ||
          String(v.sku || "").toLowerCase() === token.toLowerCase()
      );
      if (match) {
        product = p;
        variant = match;
        break;
      }
    }
  }
  if (!product || !product.active) return null;

  if (!variant && Array.isArray(product.variants) && product.variants.length > 0) {
    // Single approved finish → resolve automatically.
    if (product.variants.length === 1) {
      variant = product.variants[0];
    } else {
      const finishOrSku = String(
        draft?.variantSku || draft?.variantId || draft?.finish || ""
      ).trim();
      if (finishOrSku) {
        variant = resolveBlancoVariant(product.productId, finishOrSku);
        if (!variant) {
          const err = new Error(`Invalid finish/SKU for ${product.productId}`);
          err.code = "invalid_blanco_variant";
          throw err;
        }
      } else {
        // Multi-finish family without exact SKU — never silently use family min price.
        const err = new Error(`Exact finish/SKU required for ${product.productId}`);
        err.code = "missing_variant_sku";
        throw err;
      }
    }
  }

  const sellPrice =
    variant?.sellPrice != null
      ? Number(variant.sellPrice)
      : product.sellPrice != null
        ? Number(product.sellPrice)
        : product.installedPrice != null
          ? Number(product.installedPrice)
          : null;

  return { product, variant, sellPrice: Number.isFinite(sellPrice) ? sellPrice : null };
}

/**
 * Map product → customer-visible option projection fields (no cost/margin).
 * @param {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct} product
 */
export function toCustomerSafeOptionFields(product) {
  const safe = toCustomerSafeProduct(product);
  if (!safe) return {};
  const copy = customerFacingProductCopy(safe);
  return {
    productId: safe.productId,
    displayName: copy.displayName,
    description: copy.description,
    manufacturer: safe.manufacturer,
    model: safe.model || null,
    finish: safe.finish || null,
    color: safe.color || null,
    sku: safe.sku || null,
    imageUrl: safe.imageUrl || null,
    availability: safe.availability || null,
    availabilityText: safe.availabilityText || null,
    pricingTreatment: safe.pricingTreatment || "priced",
    requiresCutout: Boolean(safe.requiresCutout),
    relatedCutoutType: safe.relatedCutoutType || null,
    roomEligibility: safe.roomEligibility || [],
    compatibleFamilyIds: Array.isArray(safe.compatibleFamilyIds)
      ? safe.compatibleFamilyIds
      : Array.isArray(product?.compatibleFamilyIds)
        ? product.compatibleFamilyIds
        : [],
    accessoryKind: classifyAccessoryKind(product),
    variants: Array.isArray(safe.variants)
      ? safe.variants.map((v) => ({
          variantId: v.variantId,
          sku: v.sku,
          displayName: customerFacingProductCopy(v).displayName,
          finish: v.finish || v.color || null,
          availability: v.availability || null,
          availabilityText: v.availabilityText || null,
          imageUrl: v.imageUrl || null,
          sellPrice: v.sellPrice != null ? Number(v.sellPrice) : null
        }))
      : undefined,
    sellPrice: safe.sellPrice != null ? Number(safe.sellPrice) : null,
    installedPrice: safe.installedPrice != null ? Number(safe.installedPrice) : null,
    reviewRequired: copy.reviewRequired
  };
}

/**
 * @param {{ category?: string, subcategory?: string } | null | undefined} product
 * @returns {'sink_accessory'|'plumbing_addon'|'specialty'|'other'}
 */
export function classifyAccessoryKind(product) {
  const cat = String(product?.category || "").toLowerCase();
  if (cat === "specialty") return "specialty";
  if (
    cat === "soap_dispenser" ||
    cat === "disposal_air_switch" ||
    cat === "disposal_button" ||
    cat === "glass_rinser"
  ) {
    return "plumbing_addon";
  }
  if (cat === "sink_accessory" || cat.includes("accessory")) return "sink_accessory";
  return "other";
}

/**
 * Cutout catalog key for a sink selection (customer-provided uses room type).
 * @param {'kitchen'|'bar_prep'|'vanity'} roomType
 * @param {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct | null} [product]
 */
export function cutoutKeyForSinkSelection(roomType, product = null) {
  if (product) {
    const fromProduct = getCutoutCatalogKeyForProduct(product);
    if (fromProduct) return fromProduct;
  }
  if (roomType === "kitchen") return "qty-sink";
  return "qty-bar";
}

function baseOption({
  groupId,
  optionKey,
  displayLabel,
  includedInBaseline = false,
  defaultQty = 0,
  minQty = 0,
  maxQty = 1,
  sellPrice = 0,
  customerPriceTreatment = "delta",
  pricingMode = "replacement",
  availabilityState = "active",
  compatibilityJson = {},
  description = null,
  imageAssetRef = null
}) {
  return {
    groupId,
    optionKey,
    displayLabel,
    description,
    includedInBaseline,
    defaultQty,
    minQty,
    maxQty,
    requiredSelection: false,
    customerPriceTreatment,
    pricingMode,
    sellPrice,
    availabilityState,
    imageAssetRef,
    compatibilityJson
  };
}

/**
 * @param {{
 *   roomKey: string,
 *   roomType?: string,
 *   groupId?: string|null,
 *   defaultMode?: 'none'|'customer_provided'|'stock',
 *   includeEsfProducts?: boolean
 * }} args
 */
export function buildSinkOptionDefinitions(args) {
  const roomKey = String(args.roomKey);
  const roomType = args.roomType || "kitchen";
  const groupId = args.groupId ?? null;
  const defaultMode = args.defaultMode || "none";
  const out = [];

  const modes = [
    { key: "none", label: "No sink" },
    { key: "customer_provided", label: "Customer-provided sink" }
  ];
  for (const m of modes) {
    out.push(
      baseOption({
        groupId,
        optionKey: `sink:${roomKey}:${m.key}`,
        displayLabel: m.label,
        includedInBaseline: defaultMode === m.key,
        defaultQty: defaultMode === m.key ? 1 : 0,
        sellPrice: 0,
        compatibilityJson: {
          roomKey,
          role: "sink_selection",
          sinkMode: m.key,
          roomType
        }
      })
    );
  }

  // Reception / office counters: none + customer-provided only (no kitchen sink catalog).
  if (roomType === "non_plumbing" || args.includeEsfProducts === false) {
    return out;
  }

  if (args.includeEsfProducts !== false) {
    const products = listProducts({
      category: "sink",
      roomType,
      customerVisibleOnly: true
    }).filter((p) => p.active && !isNonSinkPlumbingRow(p));
    for (const product of products) {
      // Seed family rows for Blanco (variants), not every color SKU.
      const safe = toCustomerSafeOptionFields(product);
      const copy = customerFacingProductCopy(product);
      out.push(
        baseOption({
          groupId,
          optionKey: `sink:${roomKey}:esf:${product.productId}`,
          displayLabel: copy.displayName,
          description: copy.description || product.description || null,
          sellPrice: Number(product.sellPrice) || 0,
          customerPriceTreatment: "absolute",
          pricingMode: "per_each",
          imageAssetRef: product.imageUrl || null,
          maxQty: 1,
          compatibilityJson: {
            roomKey,
            role: "sink_selection",
            sinkMode: "esf",
            productId: product.productId,
            roomType,
            cutoutCatalogKey: getCutoutCatalogKeyForProduct(product),
            hasVariants: Array.isArray(product.variants) && product.variants.length > 0,
            customerSafe: safe
          }
        })
      );
    }
  }

  return out;
}

/**
 * @param {{
 *   roomKey: string,
 *   roomType?: string,
 *   groupId?: string|null,
 *   defaultMode?: 'none'|'customer_provided',
 *   includeEsfProducts?: boolean
 * }} args
 */
export function buildFaucetOptionDefinitions(args) {
  const roomKey = String(args.roomKey);
  const roomType = args.roomType || "kitchen";
  const groupId = args.groupId ?? null;
  const defaultMode = args.defaultMode || "none";
  const out = [];

  for (const m of [
    { key: "none", label: "No faucet" },
    { key: "customer_provided", label: "Customer-provided faucet" }
  ]) {
    out.push(
      baseOption({
        groupId,
        optionKey: `faucet:${roomKey}:${m.key}`,
        displayLabel: m.label,
        includedInBaseline: defaultMode === m.key,
        defaultQty: defaultMode === m.key ? 1 : 0,
        sellPrice: 0,
        compatibilityJson: {
          roomKey,
          role: "faucet_selection",
          faucetMode: m.key,
          roomType
        }
      })
    );
  }

  if (roomType === "non_plumbing" || args.includeEsfProducts === false) {
    return out;
  }

  if (args.includeEsfProducts !== false) {
    const faucetCategories =
      roomType === "vanity" || roomType === "vanity_bath"
        ? ["bathroom_faucet"]
        : roomType === "bar_prep"
          ? ["bar_prep_faucet", "beverage_faucet", "kitchen_faucet"]
          : roomType === "laundry_utility"
            ? ["kitchen_faucet", "bar_prep_faucet"]
            : ["kitchen_faucet", "bar_prep_faucet", "beverage_faucet"];
    const seen = new Set();
    for (const category of faucetCategories) {
      for (const product of listProducts({
        category,
        roomType,
        customerVisibleOnly: true
      }).filter((p) => p.active)) {
        if (seen.has(product.productId)) continue;
        seen.add(product.productId);
        const copy = customerFacingProductCopy(product);
        out.push(
          baseOption({
            groupId,
            optionKey: `faucet:${roomKey}:esf:${product.productId}`,
            displayLabel: copy.displayName,
            description: copy.description || product.description || null,
            sellPrice: Number(product.sellPrice) || 0,
            customerPriceTreatment: "absolute",
            pricingMode: "per_each",
            imageAssetRef: product.imageUrl || null,
            compatibilityJson: {
              roomKey,
              role: "faucet_selection",
              faucetMode: "esf",
              productId: product.productId,
              roomType,
              customerSafe: toCustomerSafeOptionFields(product)
            }
          })
        );
      }
    }
  }

  return out;
}

/**
 * @param {{
 *   roomKey: string,
 *   roomType?: string,
 *   groupId?: string|null,
 *   maxQty?: number
 * }} args
 */
export function buildAccessoryOptionDefinitions(args) {
  const roomKey = String(args.roomKey);
  const roomType = args.roomType || "kitchen";
  const groupId = args.groupId ?? null;
  const maxQty = args.maxQty ?? DEFAULT_ACCESSORY_MAX_QTY;
  if (roomType === "non_plumbing") return [];

  const sinkAccessoryCategories = ["sink_accessory"];
  const plumbingAddonCategories = [
    "soap_dispenser",
    "disposal_air_switch",
    "disposal_button",
    "glass_rinser"
  ];
  const out = [];
  const seen = new Set();

  function pushProduct(product, accessoryKind) {
    if (seen.has(product.productId)) return;
    seen.add(product.productId);
    if (isAccessoryFamilyHeading(product)) {
      // Expand family headings into buyable variant SKUs — never expose the heading row.
      for (const v of product.variants || []) {
        const variantId = String(v.variantId || v.sku || "").trim();
        if (!variantId) continue;
        const variantKey = `var:${variantId}`;
        if (seen.has(variantKey)) continue;
        seen.add(variantKey);
        const copy = customerFacingProductCopy({
          displayName: v.displayName || v.finish || v.sku,
          description: product.description
        });
        out.push(
          baseOption({
            groupId,
            // Use variantId as the esf token so resolveCatalogProductSelection can find it.
            optionKey: `accessory:${roomKey}:esf:${variantId}`,
            displayLabel: copy.displayName,
            description: copy.description,
            sellPrice: Number(v.sellPrice ?? product.sellPrice) || 0,
            customerPriceTreatment: "absolute",
            pricingMode: "per_each",
            minQty: 0,
            maxQty,
            defaultQty: 0,
            imageAssetRef: v.imageUrl || product.imageUrl || null,
            compatibilityJson: {
              roomKey,
              role: "accessory_selection",
              productId: product.productId,
              variantId,
              roomType,
              accessoryKind,
              compatibleFamilyIds: Array.isArray(product.compatibleFamilyIds)
                ? product.compatibleFamilyIds
                : [],
              customerSafe: toCustomerSafeOptionFields(product)
            }
          })
        );
      }
      return;
    }
    const copy = customerFacingProductCopy(product);
    out.push(
      baseOption({
        groupId,
        optionKey: `accessory:${roomKey}:esf:${product.productId}`,
        displayLabel: copy.displayName,
        description: copy.description,
        sellPrice: Number(product.sellPrice) || 0,
        customerPriceTreatment: "absolute",
        pricingMode: "per_each",
        minQty: 0,
        maxQty,
        defaultQty: 0,
        imageAssetRef: product.imageUrl || null,
        compatibilityJson: {
          roomKey,
          role: "accessory_selection",
          productId: product.productId,
          roomType,
          accessoryKind,
          compatibleFamilyIds: Array.isArray(product.compatibleFamilyIds)
            ? product.compatibleFamilyIds
            : [],
          customerSafe: toCustomerSafeOptionFields(product)
        }
      })
    );
  }

  for (const category of sinkAccessoryCategories) {
    for (const product of listProducts({
      category,
      roomType,
      customerVisibleOnly: true
    }).filter((p) => p.active)) {
      pushProduct(product, "sink_accessory");
    }
  }
  for (const category of plumbingAddonCategories) {
    for (const product of listProducts({
      category,
      roomType,
      customerVisibleOnly: true
    }).filter((p) => p.active)) {
      pushProduct(product, "plumbing_addon");
    }
  }
  return out;
}

/**
 * @param {{
 *   roomKey: string,
 *   roomType?: string,
 *   groupId?: string|null
 * }} args
 */
export function buildSpecialtyOptionDefinitions(args) {
  const roomKey = String(args.roomKey);
  const roomType = args.roomType || "kitchen";
  const groupId = args.groupId ?? null;
  if (roomType === "non_plumbing") return [];
  return listProducts({
    category: "specialty",
    roomType,
    customerVisibleOnly: true
  })
    .filter((p) => p.active)
    .map((product) => {
      const copy = customerFacingProductCopy(product);
      const reviewOnly =
        product.pricingTreatment === "review_only" || copy.reviewRequired;
      const price =
        product.installedPrice != null
          ? Number(product.installedPrice)
          : product.sellPrice != null
            ? Number(product.sellPrice)
            : 0;
      return baseOption({
        groupId,
        optionKey: `specialty:${roomKey}:esf:${product.productId}`,
        displayLabel: copy.displayName,
        description: copy.description || product.description || null,
        sellPrice: reviewOnly ? 0 : price,
        customerPriceTreatment: reviewOnly ? "review_required" : "absolute",
        pricingMode: "per_each",
        availabilityState: "active",
        imageAssetRef: product.imageUrl || null,
        maxQty: 1,
        compatibilityJson: {
          roomKey,
          role: "specialty_selection",
          productId: product.productId,
          roomType,
          pricingTreatment: product.pricingTreatment || "priced",
          estimatorReviewRequired: Boolean(product.estimatorReviewRequired || reviewOnly),
          customerSafe: toCustomerSafeOptionFields(product)
        }
      });
    });
}

/**
 * @param {{
 *   roomKey: string,
 *   groupId?: string|null,
 *   defaultMode?: string,
 *   includeCustomHeight?: boolean,
 *   includeFullHeight?: boolean
 * }} args
 */
export function buildBacksplashOptionDefinitions(args) {
  const roomKey = String(args.roomKey);
  const groupId = args.groupId ?? null;
  const defaultMode = args.defaultMode || "standard_4in";
  const modes = [
    { key: "none", label: "No backsplash" },
    { key: "standard_4in", label: "4-inch backsplash" }
  ];
  if (args.includeFullHeight !== false) {
    modes.push({ key: "full_height", label: "Full-height backsplash" });
  }
  if (args.includeCustomHeight !== false) {
    modes.push({ key: "custom_height", label: "Custom-height backsplash" });
  }
  return modes.map((m) =>
    baseOption({
      groupId,
      optionKey: `backsplash:${roomKey}:${m.key}`,
      displayLabel: m.label,
      includedInBaseline: defaultMode === m.key,
      defaultQty: defaultMode === m.key ? 1 : 0,
      sellPrice: 0,
      compatibilityJson: {
        roomKey,
        role: "backsplash_selection",
        backsplashMode: m.key
      }
    })
  );
}

/**
 * Edge options from Studio Estimate Scope authority (included / w_edge / d_edge).
 * Do not invent a separate generic D/Eased/W seed with alternate labels.
 *
 * @param {{
 *   roomKey: string,
 *   groupId?: string|null,
 *   defaultMode?: string,
 *   originalEdgeMode?: string,
 *   approvedEdgeModes?: string[]|null
 * }} args
 */
/**
 * Edge options from Internal Estimate free/premium profile catalog.
 * Do not seed Studio scope classifications (W edge / D edge / Included edges).
 *
 * @param {{
 *   roomKey: string,
 *   groupId?: string|null,
 *   defaultMode?: string,
 *   originalEdgeMode?: string,
 *   originalProfileToken?: string,
 *   approvedEdgeModes?: string[]|null,
 *   approvedProfileTokens?: string[]|null,
 *   includePremium?: boolean
 * }} args
 */
export function buildEdgeOptionDefinitions(args) {
  const original = normalizeEdgeProfileToken(
    args.originalProfileToken ||
      args.originalEdgeMode ||
      args.defaultMode ||
      "edge_eased"
  );
  const approved =
    args.approvedProfileTokens != null
      ? args.approvedProfileTokens
      : args.approvedEdgeModes != null
        ? args.approvedEdgeModes
        : defaultApprovedEdgeProfileTokens(original);
  return buildAuthoritativeEdgeOptionDefinitions({
    roomKey: String(args.roomKey),
    groupId: args.groupId ?? null,
    originalProfileToken: original,
    approvedProfileTokens: approved,
    includePremium: args.includePremium !== false,
    baseOption
  });
}

/**
 * Side splash is piece-scoped. Skip ineligible pieces (backsplash-only, etc.).
 *
 * @param {{
 *   roomKey: string,
 *   groupId?: string|null,
 *   pieces?: Array<{ id?: string, key?: string, name?: string, pieceType?: string, depthIn?: number, depth?: number, included?: boolean }>
 * }} args
 */
export function buildSideSplashOptionDefinitions(args) {
  const roomKey = String(args.roomKey);
  const groupId = args.groupId ?? null;
  const pieces = Array.isArray(args.pieces) ? args.pieces : [];
  const out = [];
  let pieceIndex = 0;

  for (const piece of pieces) {
    if (!piece || piece.included === false) continue;
    const pieceType = String(piece.pieceType || piece.type || "").toLowerCase();
    if (pieceType.includes("backsplash") || pieceType.includes("splash")) continue;
    const pieceKey = String(piece.id || piece.key || piece.name || "").trim();
    if (!pieceKey) continue;
    pieceIndex += 1;
    const rawName = String(piece.name || piece.label || piece.displayName || "").trim();
    const pieceDisplayName = sideSplashPieceDisplayName(rawName, pieceIndex);
    const depth = Number(piece.depthIn ?? piece.depth);
    const depthKnown = Number.isFinite(depth) && depth > 0;

    for (const mode of [
      { key: "none", label: "No side splash" },
      { key: "left", label: "Left side splash" },
      { key: "right", label: "Right side splash" },
      { key: "both", label: "Both side splashes" }
    ]) {
      out.push(
        baseOption({
          groupId,
          optionKey: `sidesplash:${roomKey}:${pieceKey}:${mode.key}`,
          // Never put raw piece IDs in the customer-visible label.
          displayLabel: `${pieceDisplayName} — ${sideSplashModeLabel(mode.key)}`,
          includedInBaseline: mode.key === "none",
          defaultQty: mode.key === "none" ? 1 : 0,
          sellPrice: 0,
          compatibilityJson: {
            roomKey,
            pieceKey,
            pieceDisplayName,
            pieceIndex,
            role: "sidesplash_selection",
            sideSplashMode: mode.key,
            depthIn: depthKnown ? depth : null,
            heightIn: SIDE_SPLASH_HEIGHT_IN,
            geometryComplete: depthKnown
          }
        })
      );
    }
  }
  return out;
}

/**
 * Build all default room option definitions for createDraft / publish seeding.
 *
 * @param {{
 *   rooms: Array<object>,
 *   choiceGroups: Iterable<string>|Set<string>|string[],
 *   groupId?: string|null,
 *   estimateAddOns?: Record<string, number>,
 *   estimateEdgeMode?: string|null,
 *   approvedEdgeModes?: string[]|null
 * }} args
 */
export function buildDefaultRoomProductOptions(args) {
  const choiceGroups = new Set(
    [...(args.choiceGroups || [])].map((x) => String(x))
  );
  const groupId = args.groupId ?? null;
  const addOns = args.estimateAddOns || {};
  const originalProfile = resolveOriginalEdgeProfile({
    edgeMode: args.estimateEdgeMode,
    edgeProfileV2: args.estimateEdgeProfile,
    edgeProfile: args.estimateEdgeProfile
  });
  const approvedProfileTokens =
    args.approvedProfileTokens != null
      ? args.approvedProfileTokens
      : args.approvedEdgeModes != null
        ? args.approvedEdgeModes
        : defaultApprovedEdgeProfileTokens(originalProfile);
  /** @type {ReturnType<typeof baseOption>[]} */
  const options = [];

  for (const room of args.rooms || []) {
    if (!room) continue;
    const roomKey = String(room.roomKey || room.id || room.name || "").trim();
    if (!roomKey) continue;
    const roomType = inferRoomEligibilityType(room);

    if (choiceGroupEnabled(choiceGroups, "backsplash") && roomHasEligibleBacksplashLocations(room)) {
      const heightMode = String(room.backsplashHeightMode || "").toLowerCase();
      let defaultMode = "standard_4in";
      if (room.includeBacksplash === false) defaultMode = "none";
      else if (heightMode === "full_height") defaultMode = "full_height";
      else if (heightMode === "custom" || heightMode === "custom_height") defaultMode = "custom_height";
      options.push(
        ...buildBacksplashOptionDefinitions({
          roomKey,
          groupId,
          defaultMode,
          includeFullHeight: true,
          includeCustomHeight: true
        })
      );
    }

    if (choiceGroupEnabled(choiceGroups, "sink")) {
      const hasSinkAddon = Number(addOns["qty-sink"] || addOns["qty-bar"] || 0) > 0;
      const defaultMode =
        hasSinkAddon && roomType !== "non_plumbing" ? "customer_provided" : "none";
      options.push(
        ...buildSinkOptionDefinitions({
          roomKey,
          roomType,
          groupId,
          defaultMode,
          includeEsfProducts: roomType !== "non_plumbing"
        })
      );
    }

    if (choiceGroupEnabled(choiceGroups, "faucet")) {
      options.push(
        ...buildFaucetOptionDefinitions({
          roomKey,
          roomType,
          groupId,
          defaultMode: "none",
          includeEsfProducts: roomType !== "non_plumbing"
        })
      );
    }

    if (choiceGroupEnabled(choiceGroups, "accessories")) {
      options.push(...buildAccessoryOptionDefinitions({ roomKey, roomType, groupId }));
    }

    if (choiceGroupEnabled(choiceGroups, "specialty")) {
      options.push(...buildSpecialtyOptionDefinitions({ roomKey, roomType, groupId }));
    }

    if (choiceGroupEnabled(choiceGroups, "edge")) {
      const roomOriginal = resolveOriginalEdgeProfile({
        edgeProfileV2: room.edgeProfileV2 || room.edgeProfile,
        edgeProfile: room.edgeProfile,
        edgeMode: room.edgeMode || room.edgeDefaultMode || args.estimateEdgeMode
      });
      options.push(
        ...buildEdgeOptionDefinitions({
          roomKey,
          groupId,
          originalProfileToken: roomOriginal,
          approvedProfileTokens
        })
      );
    }

    if (choiceGroupEnabled(choiceGroups, "side_splash")) {
      options.push(
        ...buildSideSplashOptionDefinitions({
          roomKey,
          groupId,
          pieces: room.pieces || []
        })
      );
    }
  }

  return options;
}

/**
 * Billable SF for one side splash piece (independent ceiling).
 * @param {number} depthIn
 * @param {number} [heightIn]
 */
export function sideSplashBillableSf(depthIn, heightIn = SIDE_SPLASH_HEIGHT_IN) {
  const depth = Number(depthIn);
  const height = Number(heightIn) || SIDE_SPLASH_HEIGHT_IN;
  if (!Number.isFinite(depth) || depth <= 0) return null;
  const rawSf = (depth * height) / 144;
  return ceilBillableSquareFeet(rawSf);
}

/**
 * Side splash count from mode.
 * @param {string} mode
 */
export function sideSplashQtyFromMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "both") return 2;
  if (m === "left" || m === "right") return 1;
  return 0;
}

/**
 * Whether putOptions / save should accept this room-choice prefix without the fixed catalog.
 * @param {string} optionKey
 */
export function isRoomProductOptionKey(optionKey) {
  const key = String(optionKey || "");
  return (
    key.startsWith("backsplash:") ||
    key.startsWith("sink:") ||
    key.startsWith("edge:") ||
    key.startsWith("faucet:") ||
    key.startsWith("accessory:") ||
    key.startsWith("specialty:") ||
    key.startsWith("sidesplash:")
  );
}

/**
 * Resolve server sell price for a seeded/upserted option (never trust browser).
 * Family-level Blanco keys may omit finish at seed time — use family sellPrice for
 * envelope display. Customer save still requires exact variant via resolveCatalogProductSelection.
 * @param {string} optionKey
 * @param {object} [compatibilityJson]
 */
export function resolveOptionSellPriceFromCatalog(optionKey, compatibilityJson = {}) {
  const parsed = parseProductOptionKey(optionKey);
  if (!parsed) return { sellPrice: 0, availabilityState: "active" };

  function resolveForSeed(productId) {
    try {
      return resolveCatalogProductSelection(productId);
    } catch (e) {
      if (e?.code === "missing_variant_sku" || e?.code === "invalid_blanco_variant") {
        const product = getProductById(productId);
        if (!product?.active) return null;
        const sell =
          product.sellPrice != null
            ? Number(product.sellPrice)
            : product.installedPrice != null
              ? Number(product.installedPrice)
              : 0;
        return { product, variant: null, sellPrice: Number.isFinite(sell) ? sell : 0 };
      }
      throw e;
    }
  }

  if (parsed.kind === "specialty" && parsed.mode === "esf" && parsed.productId) {
    const resolved = resolveForSeed(parsed.productId);
    if (!resolved) return { sellPrice: null, availabilityState: "unavailable" };
    if (resolved.product.pricingTreatment === "review_only") {
      return { sellPrice: 0, availabilityState: "active", pricingTreatment: "review_only" };
    }
    const price =
      resolved.product.installedPrice != null
        ? Number(resolved.product.installedPrice)
        : resolved.sellPrice;
    return {
      sellPrice: price ?? 0,
      availabilityState: "active",
      pricingTreatment: "priced"
    };
  }

  if (
    (parsed.kind === "sink" ||
      parsed.kind === "faucet" ||
      parsed.kind === "accessory") &&
    parsed.mode === "esf" &&
    parsed.productId
  ) {
    const resolved = resolveForSeed(parsed.productId);
    if (!resolved) return { sellPrice: null, availabilityState: "unavailable" };
    return {
      sellPrice: resolved.sellPrice ?? 0,
      availabilityState: "active"
    };
  }

  // Mode-only keys (none / customer_provided / backsplash modes / edge / sidesplash)
  void compatibilityJson;
  return { sellPrice: 0, availabilityState: "active" };
}
