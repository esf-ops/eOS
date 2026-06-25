import type { ProductCatalogCategory } from "./productCatalog";

export const PUBLIC_PRODUCT_CATALOG_PATH = "/public/product-catalog";

/** Allowlisted public catalog route — no auth, no inventory APIs. */
export function isPublicProductCatalogPath(pathname?: string): boolean {
  const normalized = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""))
    .replace(/\/+$/, "") || "/";
  return normalized === PUBLIC_PRODUCT_CATALOG_PATH;
}

export function isKioskOrArreyaMode(searchParams?: URLSearchParams): boolean {
  const sp =
    searchParams ??
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams());
  return sp.get("kiosk") === "1" || sp.get("arreya") === "1";
}

const TAB_QUERY_TO_CATEGORY: Record<string, ProductCatalogCategory> = {
  sinks: "sink",
  sink: "sink",
  faucets: "faucet",
  faucet: "faucet",
  accessories: "sink_accessory",
  accessory: "sink_accessory",
  "sink-accessories": "sink_accessory",
  specialty: "specialty_add_on",
  addons: "specialty_add_on",
  "specialty-add-ons": "specialty_add_on",
};

const CATEGORY_TO_TAB_QUERY: Record<ProductCatalogCategory, string> = {
  sink: "sinks",
  faucet: "faucets",
  sink_accessory: "accessories",
  specialty_add_on: "specialty",
};

export function parsePublicCatalogTabQuery(value: string | null): ProductCatalogCategory | null {
  if (!value?.trim()) return null;
  return TAB_QUERY_TO_CATEGORY[value.trim().toLowerCase()] ?? null;
}

export function publicCatalogTabQueryValue(category: ProductCatalogCategory): string {
  return CATEGORY_TO_TAB_QUERY[category];
}
