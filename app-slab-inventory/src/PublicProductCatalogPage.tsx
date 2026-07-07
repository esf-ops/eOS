import { useCallback, useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import { getProductCatalogItemsWithAssets } from "./lib/productCatalogAssets";
import { filterCatalogReadyItems } from "./lib/productCatalogReady";
import {
  PUBLIC_PRODUCT_CATALOG_TAB_LABELS,
  filterProductCatalogItems,
  groupProductCatalogByManufacturer,
  productCatalogCountForCategory,
  productCatalogUsesManufacturerGrouping,
  publicProductCatalogTabsForItems,
  type ProductCatalogCategory,
  type ProductCatalogItem,
} from "./lib/productCatalog";
import {
  isKioskOrArreyaMode,
  parsePublicCatalogTabQuery,
  publicCatalogTabQueryValue,
} from "./lib/publicProductCatalogRoute";
import {
  ProductCatalogCard,
  ProductCatalogModal,
  categoryPlaceholderIcon,
} from "./productCatalogShowroom";

export type PublicProductCatalogPageProps = {
  /** When set, only this category is shown and tab navigation is hidden. */
  lockedCategory?: ProductCatalogCategory;
  hideCategoryTabs?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
  metaDescription?: string;
  rootClassName?: string;
};

const SEARCH_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
  </svg>
);

function readInitialCategory(tabs: ProductCatalogCategory[]): ProductCatalogCategory {
  const fromQuery = parsePublicCatalogTabQuery(new URLSearchParams(window.location.search).get("tab"));
  if (fromQuery && tabs.includes(fromQuery)) return fromQuery;
  return tabs[0] ?? "sink";
}

export default function PublicProductCatalogPage({
  lockedCategory,
  hideCategoryTabs = false,
  pageTitle = "Elite Stone Fabrication Product Catalog",
  pageSubtitle = "Sinks, faucets, and accessories",
  metaDescription = "Elite Stone Fabrication product catalog — sinks, faucets, and accessories showroom.",
  rootClassName,
}: PublicProductCatalogPageProps = {}) {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);
  const catalogItems = useMemo(
    () => filterCatalogReadyItems(getProductCatalogItemsWithAssets()),
    []
  );
  const tabs = useMemo(() => publicProductCatalogTabsForItems(catalogItems), [catalogItems]);

  const [category, setCategory] = useState<ProductCatalogCategory>(() => {
    if (lockedCategory) return lockedCategory;
    return readInitialCategory(tabs);
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductCatalogItem | null>(null);

  useEffect(() => {
    document.title = lockedCategory === "faucet"
      ? "Faucets · Elite Stone Fabrication"
      : "Product Catalog · Elite Stone Fabrication";

    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");

    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement("meta");
      desc.setAttribute("name", "description");
      document.head.appendChild(desc);
    }
    desc.setAttribute("content", metaDescription);
  }, [lockedCategory, metaDescription]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (lockedCategory) {
      setCategory(lockedCategory);
      return;
    }
    if (!tabs.includes(category)) {
      setCategory(tabs[0] ?? "sink");
    }
  }, [tabs, category, lockedCategory]);

  const setCategoryWithUrl = useCallback((cat: ProductCatalogCategory) => {
    if (lockedCategory) return;
    setCategory(cat);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", publicCatalogTabQueryValue(cat));
    window.history.replaceState(null, "", url.toString());
  }, [lockedCategory]);

  const filtered = useMemo(
    () =>
      filterProductCatalogItems(catalogItems, {
        category: lockedCategory ?? category,
        search,
        tags: [],
        assetStatus: "all",
      }),
    [catalogItems, category, lockedCategory, search]
  );

  const displayCategory = lockedCategory ?? category;
  const manufacturerGroups = useMemo(() => {
    if (!productCatalogUsesManufacturerGrouping(displayCategory)) return null;
    return groupProductCatalogByManufacturer(filtered);
  }, [displayCategory, filtered]);

  const rootClass = [
    "pc-public-page",
    kiosk ? "pc-public-kiosk" : "",
    rootClassName ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <header className="pc-public-header">
        <div className="pc-public-brand">
          {EOS_LOGO_URL ? (
            <img src={EOS_LOGO_URL} alt="" className="pc-public-logo" />
          ) : (
            <span className="pc-public-logo-mark" aria-hidden>ESF</span>
          )}
          <div className="pc-public-brand-text">
            <h1 className="pc-public-title">{pageTitle}</h1>
            <p className="pc-public-subtitle">{pageSubtitle}</p>
          </div>
        </div>
      </header>

      <main className="pc-public-main">
        {!hideCategoryTabs ? (
          <nav className="pc-tab-bar pc-public-tabs" aria-label="Product categories">
            {tabs.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`pc-tab${category === cat ? " active" : ""}`}
                onClick={() => setCategoryWithUrl(cat)}
                aria-selected={category === cat}
              >
                {PUBLIC_PRODUCT_CATALOG_TAB_LABELS[cat]}
                <span className="pc-tab-count">{productCatalogCountForCategory(catalogItems, cat)}</span>
              </button>
            ))}
          </nav>
        ) : null}

        <div className="pc-toolbar">
          <div className="pc-search-wrap">
            {SEARCH_ICON}
            <input
              type="search"
              className="pc-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products…"
              aria-label="Search product catalog"
            />
          </div>
        </div>

        <p className="pc-result-meta">
          {filtered.length} {PUBLIC_PRODUCT_CATALOG_TAB_LABELS[displayCategory].toLowerCase()}
          {search ? ` matching “${search}”` : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="empty-state pc-empty">
            <div className="empty-art" aria-hidden>{categoryPlaceholderIcon(displayCategory)}</div>
            <p className="empty-title">No products found</p>
            <p className="empty-sub">
              {search ? "Try a different search term." : "Check back as new products are added to the showroom."}
            </p>
          </div>
        ) : manufacturerGroups ? (
          <div className="pc-manufacturer-catalog">
            {manufacturerGroups.map((group) => (
              <section key={group.brand} className="pc-manufacturer-section" aria-label={group.brand}>
                <h2 className="pc-manufacturer-heading">{group.brand}</h2>
                <div className="pc-grid">
                  {group.items.map((item) => (
                    <ProductCatalogCard
                      key={item.id}
                      item={item}
                      detail="detailed"
                      onOpen={() => setSelected(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="pc-grid">
            {filtered.map((item) => (
              <ProductCatalogCard
                key={item.id}
                item={item}
                detail="detailed"
                onOpen={() => setSelected(item)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="pc-public-footer">
        <p>Elite Stone Fabrication · Showroom catalog · Display only</p>
      </footer>

      {selected ? (
        <ProductCatalogModal item={selected} onClose={() => setSelected(null)} mode="public" />
      ) : null}
    </div>
  );
}
