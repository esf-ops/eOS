import { useEffect, useMemo, useState } from "react";
import { getProductCatalogItemsWithAssets } from "./lib/productCatalogAssets";
import { filterCatalogReadyItems } from "./lib/productCatalogReady";
import {
  PRODUCT_CATALOG_CATEGORY_LABELS,
  PRODUCT_CATALOG_TABS,
  filterProductCatalogItems,
  groupProductCatalogByManufacturer,
  productCatalogCountForCategory,
  productCatalogUsesManufacturerGrouping,
  type ProductCatalogCategory,
  type ProductCatalogItem,
  type ProductCatalogTagFilter,
} from "./lib/productCatalog";
import {
  ProductCatalogCard,
  ProductCatalogModal,
  categoryPlaceholderIcon,
} from "./productCatalogShowroom";

const DEV_SHOW_ALL_STORAGE_KEY = "eliteos-pc-show-all-generated";

const SEARCH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
  </svg>
);

const TAG_FILTERS: { id: ProductCatalogTagFilter; label: string }[] = [
  { id: "kitchen", label: "Kitchen" },
  { id: "vanity", label: "Vanity" },
  { id: "composite", label: "Composite" },
  { id: "steel", label: "Steel / Stainless" },
  { id: "single_bowl", label: "Single bowl" },
  { id: "double_bowl", label: "Double bowl" },
  { id: "accessory", label: "Accessory" },
];

export default function ProductCatalogPanel() {
  const [category, setCategory] = useState<ProductCatalogCategory>("sink");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<ProductCatalogTagFilter[]>([]);
  const [selected, setSelected] = useState<ProductCatalogItem | null>(null);
  const [showAllGenerated, setShowAllGenerated] = useState(() => {
    if (!import.meta.env.DEV) return false;
    try {
      return localStorage.getItem(DEV_SHOW_ALL_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const catalogItems = useMemo(() => getProductCatalogItemsWithAssets(), []);

  const showroomItems = useMemo(
    () => (showAllGenerated ? catalogItems : filterCatalogReadyItems(catalogItems)),
    [catalogItems, showAllGenerated]
  );

  const filtered = useMemo(
    () =>
      filterProductCatalogItems(showroomItems, {
        category,
        search,
        tags,
        assetStatus: "all",
      }),
    [category, search, tags, showroomItems]
  );

  const manufacturerGroups = useMemo(() => {
    if (!productCatalogUsesManufacturerGrouping(category)) return null;
    return groupProductCatalogByManufacturer(filtered);
  }, [category, filtered]);

  const toggleShowAllGenerated = () => {
    setShowAllGenerated((cur) => {
      const next = !cur;
      if (import.meta.env.DEV) {
        try {
          if (next) localStorage.setItem(DEV_SHOW_ALL_STORAGE_KEY, "1");
          else localStorage.removeItem(DEV_SHOW_ALL_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  const toggleTag = (tag: ProductCatalogTagFilter) => {
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setTags([]);
  };

  const hasActiveFilters = Boolean(search) || tags.length > 0;

  return (
    <div className="pc-page">
      <header className="pc-header">
        <div className="pc-header-text">
          <h1 className="pc-title">Product Catalog</h1>
          <p className="pc-subtitle">
            ESF plumbing & specialty program. Display catalog only — not a pricing authority.
          </p>
        </div>
      </header>

      <nav className="pc-tab-bar" aria-label="Product categories">
        {PRODUCT_CATALOG_TABS.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`pc-tab${category === cat ? " active" : ""}`}
            onClick={() => setCategory(cat)}
            aria-selected={category === cat}
          >
            {PRODUCT_CATALOG_CATEGORY_LABELS[cat]}
            <span className="pc-tab-count">
              {productCatalogCountForCategory(showroomItems, cat)}
            </span>
          </button>
        ))}
      </nav>

      <div className="pc-toolbar">
        <div className="pc-search-wrap">
          {SEARCH_ICON}
          <input
            type="search"
            className="pc-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, SKU, material, color, notes…"
            aria-label="Search product catalog"
          />
        </div>
      </div>

      <div className="pc-filter-row">
        <div className="pc-filter-group" aria-label="Tag filters">
          {TAG_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`pc-filter-chip${tags.includes(f.id) ? " on" : ""}`}
              onClick={() => toggleTag(f.id)}
              aria-pressed={tags.includes(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="pc-active-filters">
          <button type="button" className="pc-clear-btn" onClick={clearFilters}>Clear filters</button>
          <span className="pc-result-count">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      ) : (
        <p className="pc-result-meta">{filtered.length} in {PRODUCT_CATALOG_CATEGORY_LABELS[category]}</p>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state pc-empty">
          <div className="empty-art" aria-hidden>{categoryPlaceholderIcon(category)}</div>
          <p className="empty-title">
            {hasActiveFilters
              ? "No catalog-ready products found for this filter."
              : "No catalog-ready products in this category yet."}
          </p>
          <p className="empty-sub">
            {hasActiveFilters
              ? "Try a different search or remove filters."
              : "Check back as new products are added to the showroom catalog."}
          </p>
          {hasActiveFilters ? (
            <div className="empty-actions">
              <button type="button" className="btn secondary btn-sm" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : null}
        </div>
      ) : manufacturerGroups ? (
        <div className="pc-manufacturer-catalog">
          {manufacturerGroups.map((group) => (
            <section key={group.brand} className="pc-manufacturer-section" aria-label={group.brand}>
              <h2 className="pc-manufacturer-heading">{group.brand}</h2>
              <div className="pc-grid">
                {group.items.map((item) => (
                  <ProductCatalogCard key={item.id} item={item} onOpen={() => setSelected(item)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="pc-grid">
          {filtered.map((item) => (
            <ProductCatalogCard key={item.id} item={item} onOpen={() => setSelected(item)} />
          ))}
        </div>
      )}

      {import.meta.env.DEV ? (
        <p className="pc-dev-toggle-wrap">
          <button type="button" className="pc-dev-toggle" onClick={toggleShowAllGenerated}>
            {showAllGenerated ? "Show catalog-ready only" : "Show all workbook products (dev)"}
          </button>
        </p>
      ) : null}

      {selected ? (
        <ProductCatalogModal item={selected} onClose={() => setSelected(null)} mode="internal" />
      ) : null}
    </div>
  );
}
