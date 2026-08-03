/**
 * Product Catalog — sink accessory groups for the detail modal
 * ============================================================
 *
 * Sources:
 *   - Blanco Sink Program (Non Stock)
 *   - Kansas Sinks Program
 *
 * Attached by stable catalog product id during getProductCatalogItemsWithAssets().
 * Prices/costs and strainer photos are intentionally omitted (text-only).
 *
 * Groups:
 *   - grids: product-specific grids / boards / racks
 *   - drainOptions: Blanco stainless strainer + flange (Blanco sinks)
 *   - colorMatchDrainOptions: Blanco metal color-match (Blanco sinks)
 *   - valueDrainOptions: Kansas value strainers (every sink)
 */
import type {
  ProductCatalogAccessory,
  ProductCatalogItem,
  ProductCatalogSinkAccessoryGroups,
} from "./productCatalog";

type GridList = readonly ProductCatalogAccessory[];

const NONE: GridList = [];

/** Stainless drain options — Blanco sinks (separate strainer vs flange SKUs). */
const BLANCO_STAINLESS_DRAIN_OPTIONS: readonly ProductCatalogAccessory[] = [
  { name: "Basket Strainer Stainless Steel", sku: "441093" },
  { name: "Basket Flange Stainless Steel", sku: "441098" },
  { name: "Basket Strainer 3 in 1", sku: "441231" },
];

/**
 * Metal color-match drain options — Blanco sinks.
 * Display names use “Volcano Gray” (not “Gray”); Cafe → Café Brown.
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
 * Kansas value strainers — every sink (including Blanco).
 * Item code + description only; no photos / pricing.
 */
const KANSAS_VALUE_DRAIN_OPTIONS: readonly ProductCatalogAccessory[] = [
  { name: "Wstrainer 2 Standard Strainer", sku: "Stainless Steel St Strainer" },
  { name: "Wstrainer 3 in 1 Strainer", sku: "Stainless Steel 3 in 1" },
];

/** Kansas grid SKUs from workbook parentheticals (e.g. 2317GRID). */
const KANSAS_GRID = {
  g2317: { name: "2317 Grid", sku: "2317GRID" },
  g3018: { name: "3018 Grid", sku: "3018GRID" },
  g3218_5050: { name: "3218 50/50 Grid", sku: "3218GRID5050" },
  g3218_6040_large: { name: "3218 60/40 Grid Large", sku: "3218GRID6040Large" },
  g3218_6040_small: { name: "3218 60/40 Grid Small", sku: "3218GRID6040Small" },
  g3218_ss: { name: "3218 Super Single Grid", sku: "3218GRIDSuperSingle" },
  g3221_large: { name: "3221 Large Grid", sku: "3221GRIDLARGE" },
  g3221_small: { name: "3221 Small Grid", sku: "3221GRIDSMALL" },
  r15_5050: { name: "R15 50/50 Grid", sku: "R155050GRID" },
  r15_med: { name: "R15 Medium Grid Single Bowl", sku: "R152318GRID" },
  r15_ss: { name: "R15 Super Single Grid", sku: "R153118GRID" },
} as const;

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

/**
 * Kansas sink → compatible grids (stable product ids).
 * Sinks with no workbook grid map to NONE and still receive value drain options.
 */
const KANSAS_SINK_GRIDS_BY_PRODUCT_ID: Readonly<Record<string, GridList>> = {
  "kansas-1512um18-2": NONE,
  "kansas-1518um18-3": NONE,
  "kansas-2317um18-4": [KANSAS_GRID.g2317],

  "kansas-3018um16-6": [KANSAS_GRID.g3018],
  "kansas-3018um18-7": [KANSAS_GRID.g3018],
  "kansas-3018um18ada-9": [KANSAS_GRID.g3018],

  // Catalog id says 60-40 but source name is 3218UM18 50/50 — map 50/50 grid.
  "kansas-3218um16-60-40-14": [KANSAS_GRID.g3218_5050],
  // Catalog id says ss but source name is 3218UM16 50/50 — map 50/50 grid.
  "kansas-3218um16-ss-15": [KANSAS_GRID.g3218_5050],
  "kansas-3218um16-ss-16": [KANSAS_GRID.g3218_ss],
  "kansas-3218um18-60-40-17": [KANSAS_GRID.g3218_6040_large, KANSAS_GRID.g3218_6040_small],
  "kansas-3218um18-ss-18": [KANSAS_GRID.g3218_ss],

  "kansas-3221um16-60-40-21": [KANSAS_GRID.g3221_large, KANSAS_GRID.g3221_small],
  "kansas-3221um18-60-40-22": [KANSAS_GRID.g3221_large, KANSAS_GRID.g3221_small],
  "kansas-3221um18r-40-60-23": [KANSAS_GRID.g3221_large, KANSAS_GRID.g3221_small],

  "kansas-r10-ss-bl-r103219um18black-24": NONE,
  "kansas-r10-ss-bl-r10medium18black-25": NONE,

  "kansas-r15-50-50um18-27": [KANSAS_GRID.r15_5050],
  // Workbook has no dedicated R15 60/40 grid row.
  "kansas-r15-60-40um18-28": NONE,
  "kansas-r15-bar-um-18-29": NONE,
  "kansas-r15-med-um-18-31": [KANSAS_GRID.r15_med],
  "kansas-r15-ss-um-18-33": [KANSAS_GRID.r15_ss],

  "kansas-vc1512-oval-white-34": NONE,
  "kansas-vc1613-oval-biscuit-35": NONE,
  "kansas-vc1613-oval-white-36": NONE,
  "kansas-vc1638-rect-white-37": NONE,
  "kansas-vc1912-rect-bisc-38": NONE,
  "kansas-vc1912-rect-white-39": NONE,

  // Workstation sinks ship “with accessories”; no separate grid SKU in the program.
  "kansas-win-ss-ws-40": NONE,
  "kansas-ws32-ss-wsum18-41": NONE,
};

function isBlancoSink(item: ProductCatalogItem): boolean {
  if (item.category !== "sink") return false;
  if ((item.brand || "").toLowerCase() === "blanco") return true;
  return item.id.startsWith("blanco-");
}

function isKansasSink(item: ProductCatalogItem): boolean {
  if (item.category !== "sink") return false;
  if ((item.brand || "").toLowerCase().includes("kansas")) return true;
  return item.id.startsWith("kansas-");
}

function gridsForBlanco(item: ProductCatalogItem): GridList | undefined {
  const byId = BLANCO_SINK_GRIDS_BY_PRODUCT_ID[item.id];
  if (byId !== undefined) return byId;
  if (item.catalogSourceId) {
    return BLANCO_SINK_GRIDS_BY_PRODUCT_ID[item.catalogSourceId];
  }
  return undefined;
}

function gridsForKansas(item: ProductCatalogItem): GridList | undefined {
  return KANSAS_SINK_GRIDS_BY_PRODUCT_ID[item.id];
}

function cloneAccessories(list: readonly ProductCatalogAccessory[]): ProductCatalogAccessory[] {
  return list.map((a) => ({ ...a }));
}

function buildGroups(opts: {
  grids: GridList;
  includeBlancoDrains: boolean;
}): ProductCatalogSinkAccessoryGroups {
  return {
    grids: cloneAccessories(opts.grids),
    drainOptions: opts.includeBlancoDrains
      ? cloneAccessories(BLANCO_STAINLESS_DRAIN_OPTIONS)
      : [],
    colorMatchDrainOptions: opts.includeBlancoDrains
      ? cloneAccessories(BLANCO_COLOR_MATCH_DRAIN_OPTIONS)
      : [],
    valueDrainOptions: cloneAccessories(KANSAS_VALUE_DRAIN_OPTIONS),
  };
}

/** Attach curated accessory groups to sink products (display-only). */
export function applyProductCatalogSinkAccessories(
  items: ProductCatalogItem[]
): ProductCatalogItem[] {
  return items.map((item) => {
    if (item.category !== "sink") return item;

    if (isBlancoSink(item)) {
      const grids = gridsForBlanco(item) ?? NONE;
      const accessoryGroups = buildGroups({ grids, includeBlancoDrains: true });
      return {
        ...item,
        accessoryGroups,
        accessories: accessoryGroups.grids,
      };
    }

    if (isKansasSink(item)) {
      const grids = gridsForKansas(item) ?? NONE;
      const accessoryGroups = buildGroups({ grids, includeBlancoDrains: false });
      return {
        ...item,
        accessoryGroups,
        accessories: accessoryGroups.grids,
      };
    }

    // Other sinks: value drain options only (Kansas strainers as universal value option).
    const accessoryGroups = buildGroups({ grids: NONE, includeBlancoDrains: false });
    return {
      ...item,
      accessoryGroups,
      accessories: [],
    };
  });
}
