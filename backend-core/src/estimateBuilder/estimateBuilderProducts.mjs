/**
 * Estimate Builder — ESF plumbing / specialty catalog products (sinks, faucets, accessories, installed
 * specialty items) for one-click adds.
 *
 * Authority: the Brain-side ESF plumbing catalog (`digitalEstimate/catalog/esfPlumbingCatalog.mjs`), the same
 * catalog Elite 100 Studio, Quote Flow and Digital Estimate price sinks from. Sell prices are customer prices;
 * cost / margin / vendor fields never leave this module (explicit DTO below).
 */

import {
  getCatalogMeta,
  getCatalogProducts,
  getCutoutCatalogKeyForProduct,
  getProductById,
  resolveBlancoVariant
} from "../digitalEstimate/catalog/esfPlumbingCatalog.mjs";
import { stripInternalChannelTerms } from "../digitalEstimate/catalog/customerFacingCopy.mjs";

export const PRODUCT_TABS = Object.freeze([
  { key: "sinks", label: "Sinks" },
  { key: "faucets", label: "Faucets" },
  { key: "accessories", label: "Accessories" },
  { key: "specialty", label: "Specialty" }
]);

const CATEGORY_META = Object.freeze({
  sink: { tab: "sinks", label: "Sink" },
  kitchen_faucet: { tab: "faucets", label: "Kitchen faucet" },
  bar_prep_faucet: { tab: "faucets", label: "Bar / prep faucet" },
  bathroom_faucet: { tab: "faucets", label: "Bathroom faucet" },
  beverage_faucet: { tab: "faucets", label: "Beverage faucet" },
  sink_accessory: { tab: "accessories", label: "Sink accessory" },
  soap_dispenser: { tab: "accessories", label: "Soap dispenser" },
  disposal_air_switch: { tab: "accessories", label: "Disposal air switch" },
  disposal_button: { tab: "accessories", label: "Disposal button" },
  glass_rinser: { tab: "accessories", label: "Glass rinser" },
  specialty: { tab: "specialty", label: "Specialty" }
});

/** Proposal "Item" column name per catalog tab (QuickBooks-style short item names). */
export const PRODUCT_ITEM_NAMES = Object.freeze({ sinks: "Sink", faucets: "Faucet", accessories: "Accessory", specialty: "Specialty" });

function positive(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function baseUnitPrice(p) {
  return positive(p.installedPrice) || positive(p.sellPrice);
}

function hasVariants(p) {
  return Array.isArray(p.variants) && p.variants.length > 0;
}

function isQuotable(p) {
  if (!p || p.active !== true || p.pricingTreatment !== "priced" || !CATEGORY_META[p.category]) return false;
  return hasVariants(p) ? p.variants.some((v) => positive(v.sellPrice)) : baseUnitPrice(p) > 0;
}

function brand(p) {
  return String(p.manufacturer || "").trim().split(/\s+/)[0] || "";
}

/** Customer-facing product line text: brand + catalog name (internal channel words stripped). */
function lineDescription(p, variant) {
  const name = stripInternalChannelTerms(variant?.displayName || p.displayName);
  const withFinish = variant && !variant.displayName && variant.finish ? `${name} — ${variant.finish}` : name;
  const b = brand(p);
  return b && !withFinish.toLowerCase().includes(b.toLowerCase()) ? `${b} ${withFinish}` : withFinish;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The configuration words that tell same-finish variants apart, e.g. "440182 Diamond 50/50 Regular Divide Cafe"
 * → "Regular Divide". Empty when the variant name adds nothing beyond family + finish.
 */
function variantStyle(p, v) {
  const plain = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let s = plain(v.displayName);
  for (const part of [v.sku, p.displayName, [p.collection, v.model].filter(Boolean).join(" "), v.finish || v.color]) {
    if (part) s = s.replace(new RegExp(`(^|\\s)${escapeRegExp(plain(part))}(?=\\s|$)`, "i"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Staff catalog for the picker. Prices are sell (customer) prices so estimators can choose; the line amount
 * still comes from `/price`.
 */
export function buildEstimateBuilderProductCatalog() {
  const products = getCatalogProducts()
    .filter(isQuotable)
    .map((p) => {
      const meta = CATEGORY_META[p.category];
      return {
        productId: p.productId,
        tab: meta.tab,
        categoryLabel: meta.label,
        manufacturer: p.manufacturer,
        collection: p.collection ?? null,
        displayName: stripInternalChannelTerms(p.displayName),
        sku: p.sku ?? null,
        price: hasVariants(p) ? null : baseUnitPrice(p),
        stock: p.availability === "stock",
        roomEligibility: Array.isArray(p.roomEligibility) ? p.roomEligibility : [],
        cutoutCode: getCutoutCatalogKeyForProduct(p),
        variants: hasVariants(p)
          ? p.variants
              .filter((v) => positive(v.sellPrice))
              .map((v) => ({
                variantId: v.variantId,
                finish: v.finish || v.color || v.sku,
                style: variantStyle(p, v),
                sku: v.sku,
                price: positive(v.sellPrice),
                stock: v.availability === "stock"
              }))
          : []
      };
    });
  const meta = getCatalogMeta();
  return { sourceVersion: meta.sourceVersion, tabs: PRODUCT_TABS, products };
}

/**
 * Resolve a product item's inputs against the catalog.
 * @param {{ productId: string | null, variantId: string | null }} inputs
 * @returns {{ ok: true, product: any, variant: any, unitPrice: number, description: string, tab: string, cutoutCode: string | null }
 *   | { ok: false, code: string, message: string, product?: any }}
 */
export function resolveCatalogProduct(inputs) {
  const product = inputs.productId ? getProductById(inputs.productId) : null;
  if (!product) {
    return { ok: false, code: "missing_product", message: inputs.productId ? "This product is no longer in the ESF catalog." : "Choose a product." };
  }
  if (!isQuotable(product)) {
    return { ok: false, code: "product_not_quotable", message: "This product needs a custom quote — add it as a custom item.", product };
  }
  let variant = null;
  if (hasVariants(product)) {
    variant = inputs.variantId ? resolveBlancoVariant(product.productId, inputs.variantId) : null;
    if (!variant || !positive(variant.sellPrice)) return { ok: false, code: "missing_variant", message: "Choose a finish.", product };
  }
  return {
    ok: true,
    product,
    variant,
    unitPrice: variant ? positive(variant.sellPrice) : baseUnitPrice(product),
    description: lineDescription(product, variant),
    tab: CATEGORY_META[product.category].tab,
    cutoutCode: getCutoutCatalogKeyForProduct(product)
  };
}
