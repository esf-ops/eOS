/**
 * Product Catalog — Blanco sink accessory groups for the detail modal
 * ==================================================================
 *
 * Source: ESF Plumbing workbook → “Blanco Sink Program (Non Stock)”
 * Attached by stable catalog product id during getProductCatalogItemsWithAssets().
 * Prices/costs and strainer photos are intentionally omitted (text-only).
 *
 * Groups:
 *   - grids: product-specific grids / boards / racks
 *   - drainOptions: stainless strainer + flange (all Blanco sinks)
 *   - colorMatchDrainOptions: metal color-match strainer + flange (all Blanco sinks)
 */
import type {
  ProductCatalogAccessory,
  ProductCatalogItem,
  ProductCatalogSinkAccessoryGroups,
} from "./productCatalog";

type GridList = readonly ProductCatalogAccessory[];

const NONE: GridList = [];

/** Stainless drain options — every Blanco sink (separate strainer vs flange SKUs). */
const BLANCO_STAINLESS_DRAIN_OPTIONS: readonly ProductCatalogAccessory[] = [
  { name: "Basket Strainer Stainless Steel", sku: "441093" },
  { name: "Basket Flange Stainless Steel", sku: "441098" },
  { name: "Basket Strainer 3 in 1", sku: "441231" },
];

/**
 * Metal color-match drain options — every Blanco sink.
 * Display names use “Volcano Gray” (not “Gray”); Cafe → Café Brown.
 * Text-only; no photos or pricing.
 */
const BLANCO_COLOR_MATCH_DRAIN_OPTIONS: readonly ProductCatalogAccessory[] = [
  { name: "Basket Strainer Anthracite", sku: "240323" },
  { name: "Basket Flange Anthracite", sku: "240333" },
  { name: "Basket Strainer White", sku: "240319" },
  { name: "Basket Flange White", sku: "240328" },
  { name: "Basket Strainer Café Brown", sku: "240321" },
  { name: "Basket Flange Café Brown", sku: "240330" },
  { name: "Basket Strainer Truffle", sku: "240322" },
  { name: "Basket Flange Truffle", sku: "240332" },
  { name: "Basket Strainer Cinder", sku: "240324" },
  { name: "Basket Flange Cinder", sku: "240334" },
  { name: "Basket Strainer Coal Black", sku: "240327" },
  { name: "Basket Flange Coal Black", sku: "240339" },
  { name: "Basket Strainer Soft White", sku: "203439" },
  { name: "Basket Flange Soft White", sku: "203443" },
  { name: "Basket Strainer Volcano Gray", sku: "203441" },
  { name: "Basket Flange Volcano Gray", sku: "203451" },
];

/**
 * Product-specific grids / boards / racks by catalog product id.
 * Precis 50/50: one grid only — order qty 2 for both bowls.
 */
const BLANCO_SINK_GRIDS_BY_PRODUCT_ID: Readonly<Record<string, GridList>> = {
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
    {
      name: "Precis Grid for 50/50",
      sku: "516363",
      note: "Order quantity 2 if a grid is wanted for both bowls.",
    },
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

function isBlancoSink(item: ProductCatalogItem): boolean {
  if (item.category !== "sink") return false;
  if ((item.brand || "").toLowerCase() === "blanco") return true;
  return item.id.startsWith("blanco-");
}

function gridsForProduct(item: ProductCatalogItem): GridList | undefined {
  const byId = BLANCO_SINK_GRIDS_BY_PRODUCT_ID[item.id];
  if (byId !== undefined) return byId;
  if (item.catalogSourceId) {
    return BLANCO_SINK_GRIDS_BY_PRODUCT_ID[item.catalogSourceId];
  }
  return undefined;
}

function cloneAccessories(list: readonly ProductCatalogAccessory[]): ProductCatalogAccessory[] {
  return list.map((a) => ({ ...a }));
}

function buildGroups(grids: GridList): ProductCatalogSinkAccessoryGroups {
  return {
    grids: cloneAccessories(grids),
    drainOptions: cloneAccessories(BLANCO_STAINLESS_DRAIN_OPTIONS),
    colorMatchDrainOptions: cloneAccessories(BLANCO_COLOR_MATCH_DRAIN_OPTIONS),
  };
}

/** Attach curated accessory groups to Blanco sink products (display-only). */
export function applyProductCatalogSinkAccessories(
  items: ProductCatalogItem[]
): ProductCatalogItem[] {
  return items.map((item) => {
    if (!isBlancoSink(item)) return item;

    const grids = gridsForProduct(item);
    // Known Blanco family with explicit mapping (including empty grids)
    if (grids !== undefined) {
      const accessoryGroups = buildGroups(grids);
      return {
        ...item,
        accessoryGroups,
        // Flat list for any legacy display: grids only (drain groups render separately)
        accessories: accessoryGroups.grids,
      };
    }

    // Other Blanco-branded sinks (if any) still get drain options, no grids mapping
    const accessoryGroups = buildGroups(NONE);
    return {
      ...item,
      accessoryGroups,
      accessories: [],
    };
  });
}
