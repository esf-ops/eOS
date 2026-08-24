import type { ProductCatalogCategory } from "./productCatalog";

export const PUBLIC_PRODUCT_CATALOG_PATH = "/public/product-catalog";

/** Fixtures & accessories catalog (sinks, faucets, specialty tabs). */
export const PUBLIC_PRODUCT_CATALOG_FIXTURES_PATH = "/public/product-catalog/fixtures";

function normalizePathname(pathname?: string): string {
  return (pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""))
    .replace(/\/+$/, "") || "/";
}

/** Products & Programs landing — two-card chooser. */
export function isPublicProductsProgramsLandingPath(pathname?: string): boolean {
  return normalizePathname(pathname) === PUBLIC_PRODUCT_CATALOG_PATH;
}

/** Public fixtures catalog (product tabs, search, cards). */
export function isPublicProductCatalogFixturesPath(pathname?: string): boolean {
  return normalizePathname(pathname) === PUBLIC_PRODUCT_CATALOG_FIXTURES_PATH;
}

/**
 * Legacy: exact `/public/product-catalog` with a `tab` query deep-links into fixtures.
 * Info routes (`/public/product-catalog/info/:id`) are handled separately.
 */
export function isPublicProductCatalogPath(pathname?: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === PUBLIC_PRODUCT_CATALOG_FIXTURES_PATH) return true;
  if (normalized !== PUBLIC_PRODUCT_CATALOG_PATH) return false;
  const sp =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  return parsePublicCatalogTabQuery(sp.get("tab")) !== null;
}

export function publicProductsProgramsLandingUrl(kiosk = false): string {
  const base = PUBLIC_PRODUCT_CATALOG_PATH;
  return kiosk ? `${base}?kiosk=1` : base;
}

export function publicProductCatalogFixturesUrl(kiosk = false, tab?: ProductCatalogCategory): string {
  const params = new URLSearchParams();
  if (kiosk) params.set("kiosk", "1");
  if (tab) params.set("tab", publicCatalogTabQueryValue(tab));
  const q = params.toString();
  return `${PUBLIC_PRODUCT_CATALOG_FIXTURES_PATH}${q ? `?${q}` : ""}`;
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
