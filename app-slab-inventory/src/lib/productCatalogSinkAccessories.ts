/**
 * Product Catalog — Blanco sink accessory lists for the detail modal
 * ==================================================================
 *
 * Source: ESF Plumbing workbook → “Blanco Sink Program (Non Stock)”
 * Accessories are attached by stable catalog product id during
 * `getProductCatalogItemsWithAssets()` (not by fragile string matching
 * inside the modal). Prices/costs are intentionally omitted.
 *
 * Display-split cards (Regular/Low Divide) inherit via `catalogSourceId`
 * or an explicit display-id entry below.
 */
import type { ProductCatalogAccessory, ProductCatalogItem } from "./productCatalog";

type AccessoryList = readonly ProductCatalogAccessory[];

const NONE: AccessoryList = [];

const BLANCO_SINK_ACCESSORIES_BY_PRODUCT_ID: Readonly<Record<string, AccessoryList>> = {
  "blanco-blanco-diamond-50-50": [
    { name: "Diamond Grid For 50/50 Left Side", sku: "221008" },
    { name: "Diamond Grid For 50/50 Right Side", sku: "221009" },
  ],
  "blanco-blanco-diamond-50-50-regular-divide": [
    { name: "Diamond Grid For 50/50 Left Side", sku: "221008" },
    { name: "Diamond Grid For 50/50 Right Side", sku: "221009" },
  ],
  "blanco-blanco-diamond-50-50-low-divide": [
    { name: "Diamond Grid For 50/50 Left Side", sku: "221008" },
    { name: "Diamond Grid For 50/50 Right Side", sku: "221009" },
  ],

  "blanco-blanco-diamond-60-40-sinks": [
    { name: "Diamond Grid For 60/40 Large Bowl", sku: "220998" },
    { name: "Diamond Grid For 60/40 Small Bowl", sku: "231342" },
    { name: "Diamond 60/40 Reverse Grid", sku: "231343" },
    { name: "Diamond Dish Rack for 60/40", sku: "236431" },
    { name: "Diamond Wood Cutting Board 60/40", sku: "440231" },
  ],
  "blanco-blanco-diamond-60-40-sinks-regular-divide": [
    { name: "Diamond Grid For 60/40 Large Bowl", sku: "220998" },
    { name: "Diamond Grid For 60/40 Small Bowl", sku: "231342" },
    { name: "Diamond 60/40 Reverse Grid", sku: "231343" },
    { name: "Diamond Dish Rack for 60/40", sku: "236431" },
    { name: "Diamond Wood Cutting Board 60/40", sku: "440231" },
  ],
  "blanco-blanco-diamond-60-40-sinks-low-divide": [
    { name: "Diamond Grid For 60/40 Large Bowl", sku: "220998" },
    { name: "Diamond Grid For 60/40 Small Bowl", sku: "231342" },
    { name: "Diamond 60/40 Reverse Grid", sku: "231343" },
    { name: "Diamond Dish Rack for 60/40", sku: "236431" },
    { name: "Diamond Wood Cutting Board 60/40", sku: "440231" },
  ],

  "blanco-blanco-super-single": [
    { name: "Diamond Grid For Super Single", sku: "221010" },
  ],

  "blanco-blanco-diamond-small-bar-sinks": NONE,

  "blanco-blanco-precis-50-50-sinks": [
    { name: "Precis Grid for 50/50", sku: "516363" },
  ],

  "blanco-blanco-precis-60-40-sinks": [
    { name: "Precis Grid for 60/40 Low Divide Large Side", sku: "236782" },
    { name: "Precis Grid for 60/40 Low Divide Small Bowl", sku: "236783" },
    { name: "Precis Grid for 60/40 Reg Divide Large Side", sku: "516364" },
    { name: "Precis Grid for 60/40 Regular Divide Small Side", sku: "516366" },
  ],
  "blanco-blanco-precis-60-40-sinks-regular-divide": [
    { name: "Precis Grid for 60/40 Low Divide Large Side", sku: "236782" },
    { name: "Precis Grid for 60/40 Low Divide Small Bowl", sku: "236783" },
    { name: "Precis Grid for 60/40 Reg Divide Large Side", sku: "516364" },
    { name: "Precis Grid for 60/40 Regular Divide Small Side", sku: "516366" },
  ],
  "blanco-blanco-precis-60-40-sinks-low-divide": [
    { name: "Precis Grid for 60/40 Low Divide Large Side", sku: "236782" },
    { name: "Precis Grid for 60/40 Low Divide Small Bowl", sku: "236783" },
    { name: "Precis Grid for 60/40 Reg Divide Large Side", sku: "516364" },
    { name: "Precis Grid for 60/40 Regular Divide Small Side", sku: "516366" },
  ],

  "blanco-blanco-precis-super-single-sinks": [
    { name: "Precis Grid for Super Single", sku: "221206" },
  ],

  "blanco-blanco-precis-21-sinks": [
    { name: "Precis Grid for 21in Single", sku: "221014" },
  ],

  "blanco-blanco-precis-24-sink": [
    { name: "Precis 24in Grid", sku: "234061" },
  ],

  "blanco-blanco-precis-27-sinks": NONE,

  "blanco-blanco-precis-30-single-bowl": [
    { name: "Precis Grid for 30 inch Single", sku: "236593" },
  ],

  "blanco-blanco-precis-bar-sinks": [
    { name: "Precis Grid for Bar Sink", sku: "221013" },
  ],

  "blanco-blanco-liven-laundry-12-depth": NONE,

  "blanco-inteos-33-workstation": [
    { name: "Inteos 33in Grid", sku: "443345" },
  ],

  "blanco-blanco-ikon-apron-front-single-bowl": [
    { name: "Wood Cutting Board for Ikon Apron Front Sink", sku: "235010" },
    { name: "Ikon Grid For 33in Single Bowl", sku: "235011" },
  ],
};

function accessoriesForProduct(item: ProductCatalogItem): AccessoryList | undefined {
  const byId = BLANCO_SINK_ACCESSORIES_BY_PRODUCT_ID[item.id];
  if (byId !== undefined) return byId;
  if (item.catalogSourceId) {
    return BLANCO_SINK_ACCESSORIES_BY_PRODUCT_ID[item.catalogSourceId];
  }
  return undefined;
}

/** Attach curated accessory lists to Blanco sink products (display-only). */
export function applyProductCatalogSinkAccessories(
  items: ProductCatalogItem[]
): ProductCatalogItem[] {
  return items.map((item) => {
    if (item.category !== "sink") return item;
    const accessories = accessoriesForProduct(item);
    if (accessories === undefined) return item;
    return { ...item, accessories: [...accessories] };
  });
}
