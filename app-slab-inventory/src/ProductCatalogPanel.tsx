import { useEffect, useMemo, useState } from "react";
import { ZoomImageViewer, type ZoomGalleryItem } from "./ZoomImageViewer";
import { getProductCatalogItemsWithAssets } from "./lib/productCatalogAssets";
import {
  PRODUCT_CATALOG_ASSET_LABELS,
  PRODUCT_CATALOG_CATEGORY_LABELS,
  PRODUCT_CATALOG_TABS,
  filterProductCatalogItems,
  productCatalogCountForCategory,
  productCatalogCounts,
  productCatalogHeroImage,
  type ProductCatalogAssetFilter,
  type ProductCatalogCategory,
  type ProductCatalogItem,
  type ProductCatalogTagFilter,
  type ProductCatalogVariant,
} from "./lib/productCatalog";

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

const ASSET_FILTERS: { id: ProductCatalogAssetFilter; label: string }[] = [
  { id: "all", label: "All assets" },
  { id: "missing", label: "Missing" },
  { id: "partial", label: "Partial" },
  { id: "complete", label: "Complete" },
];

function categoryPlaceholderLabel(category: ProductCatalogItem["category"]): string {
  if (category === "faucet") return "Faucet";
  if (category === "specialty_add_on") return "Specialty";
  if (category === "sink_accessory") return "Accessory";
  return "Sink";
}

function categoryPlaceholderIcon(category: ProductCatalogItem["category"]) {
  if (category === "faucet") {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 12h12" /><path d="M12 6v12" /><path d="M8 20h8" /><path d="M10 4h4" />
      </svg>
    );
  }
  if (category === "specialty_add_on") {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="8" width="16" height="10" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }
  if (category === "sink_accessory") {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" /><path d="M12 5V3" /><path d="M12 21v-2" />
      </svg>
    );
  }
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="18" height="12" rx="2" /><path d="M7 7V5h10v2" />
    </svg>
  );
}

export default function ProductCatalogPanel() {
  const [category, setCategory] = useState<ProductCatalogCategory>("sink");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<ProductCatalogTagFilter[]>([]);
  const [assetFilter, setAssetFilter] = useState<ProductCatalogAssetFilter>("all");
  const [selected, setSelected] = useState<ProductCatalogItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const catalogItems = useMemo(() => getProductCatalogItemsWithAssets(), []);

  const counts = useMemo(() => productCatalogCounts(catalogItems), [catalogItems]);

  const filtered = useMemo(
    () =>
      filterProductCatalogItems(catalogItems, {
        category,
        search,
        tags,
        assetStatus: assetFilter,
      }),
    [category, search, tags, assetFilter, catalogItems]
  );

  const toggleTag = (tag: ProductCatalogTagFilter) => {
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setTags([]);
    setAssetFilter("all");
  };

  const hasActiveFilters = Boolean(search) || tags.length > 0 || assetFilter !== "all";

  return (
    <div className="pc-page">
      <header className="pc-header">
        <div className="pc-header-text">
          <h1 className="pc-title">Product Catalog</h1>
          <p className="pc-subtitle">
            ESF plumbing & specialty program. Display catalog only — not a pricing authority.
          </p>
        </div>
        <div className="pc-header-stats" aria-label="Catalog summary">
          <span><strong>{counts.missingAssets}</strong> products need assets</span>
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
            <span className="pc-tab-count">{productCatalogCountForCategory(catalogItems, cat)}</span>
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
        <div className="pc-asset-filters" aria-label="Asset status filter">
          {ASSET_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`pc-filter-chip pc-asset-filter${assetFilter === f.id ? " on" : ""}`}
              onClick={() => setAssetFilter(f.id)}
              aria-pressed={assetFilter === f.id}
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
          <p className="empty-title">No products match these criteria.</p>
          <p className="empty-sub">Try a different search or remove filters.</p>
          {hasActiveFilters ? (
            <div className="empty-actions">
              <button type="button" className="btn secondary btn-sm" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="pc-grid">
          {filtered.map((item) => (
            <ProductCatalogCard key={item.id} item={item} onOpen={() => setSelected(item)} />
          ))}
        </div>
      )}

      {selected ? (
        <ProductCatalogModal item={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function ProductCatalogCard({ item, onOpen }: { item: ProductCatalogItem; onOpen: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const hero = productCatalogHeroImage(item);
  const hasImage = Boolean(hero) && !imgFailed;
  const showAssetDot = item.assetStatus !== "complete";

  return (
    <button type="button" className="pc-card" onClick={onOpen} aria-label={`View ${item.name}`}>
      <div className="pc-card-mat">
        <div className="pc-card-media">
          {hasImage ? (
            <img
              src={hero}
              alt={item.name}
              loading="lazy"
              className="pc-card-img"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="pc-card-placeholder" aria-hidden>
              {categoryPlaceholderIcon(item.category)}
              <span>{categoryPlaceholderLabel(item.category)}</span>
            </div>
          )}
          {showAssetDot ? (
            <span
              className={`pc-asset-dot ${item.assetStatus}`}
              title={PRODUCT_CATALOG_ASSET_LABELS[item.assetStatus]}
              aria-label={PRODUCT_CATALOG_ASSET_LABELS[item.assetStatus]}
            />
          ) : null}
        </div>
      </div>
      <p className="pc-card-name-only">{item.name}</p>
    </button>
  );
}

function ProductCatalogModal({ item, onClose }: { item: ProductCatalogItem; onClose: () => void }) {
  const [selectedVariant, setSelectedVariant] = useState<ProductCatalogVariant | null>(
    item.variants?.[0] ?? null
  );
  const [imgFailed, setImgFailed] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);

  useEffect(() => {
    setSelectedVariant(item.variants?.[0] ?? null);
    setImgFailed(false);
  }, [item]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hero = productCatalogHeroImage(item, selectedVariant);
  const hasHero = Boolean(hero) && !imgFailed;

  const comboUrls = [
    ...(item.comboPhotoUrls ?? []),
    ...(selectedVariant?.comboPhotoUrl ? [selectedVariant.comboPhotoUrl] : []),
  ].filter(Boolean);

  const galleryItems: ZoomGalleryItem[] = useMemo(() => {
    const urls: { src: string; caption: string }[] = [];
    if (hero) urls.push({ src: hero, caption: "Product" });
    if (item.installedImageUrl) urls.push({ src: item.installedImageUrl, caption: "Installed" });
    if (selectedVariant?.installedImageUrl) urls.push({ src: selectedVariant.installedImageUrl, caption: "Installed" });
    comboUrls.forEach((u, i) => urls.push({ src: u, caption: `Combo ${i + 1}` }));
    if (item.diagramUrl) urls.push({ src: item.diagramUrl, caption: "Diagram" });
    (item.finishExampleUrls ?? []).forEach((u, i) => urls.push({ src: u, caption: `Finish ${i + 1}` }));
    (item.gallery ?? []).forEach((u, i) => urls.push({ src: u, caption: `Gallery ${i + 1}` }));
    return urls;
  }, [hero, item, selectedVariant, comboUrls]);

  const openZoom = (index: number) => {
    if (galleryItems.length === 0) return;
    setZoomIndex(index);
    setZoomOpen(true);
  };

  const sourceDiffers =
    item.originalName &&
    item.originalName.trim().toLowerCase() !== item.name.trim().toLowerCase();

  return (
    <>
      <div className="pc-modal-overlay" role="dialog" aria-modal="true" aria-label={`${item.name} details`} onClick={onClose}>
        <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="pc-modal-close" onClick={onClose} aria-label="Close">×</button>

          <div className="pc-modal-layout">
            <div className="pc-modal-media">
              {hasHero ? (
                <button type="button" className="pc-modal-hero-btn" onClick={() => openZoom(0)} aria-label="Open image viewer">
                  <img src={hero} alt={item.name} className="pc-modal-hero" onError={() => setImgFailed(true)} />
                </button>
              ) : (
                <div className="pc-modal-placeholder" aria-hidden>
                  {categoryPlaceholderIcon(item.category)}
                  <span>{categoryPlaceholderLabel(item.category)}</span>
                  <p className="pc-modal-placeholder-note">Asset pending — details available below.</p>
                </div>
              )}
              <span className={`pc-asset-badge ${item.assetStatus}`}>{PRODUCT_CATALOG_ASSET_LABELS[item.assetStatus]}</span>
            </div>

            <div className="pc-modal-info">
              <header className="pc-modal-head">
                <p className="pc-modal-eyebrow">{PRODUCT_CATALOG_CATEGORY_LABELS[item.category]}</p>
                <h2 className="pc-modal-title">{item.name}</h2>
                <p className="pc-display-only pc-display-only-modal">Display catalog only</p>
              </header>

              <dl className="pc-detail-grid">
                {item.brand ? <><dt>Brand</dt><dd>{item.brand}</dd></> : null}
                {item.series ? <><dt>Series</dt><dd>{item.series}</dd></> : null}
                {item.type ? <><dt>Type</dt><dd>{item.type}</dd></> : null}
                {item.material ? <><dt>Material</dt><dd>{item.material}</dd></> : null}
                {item.suggestedUse ? <><dt>Suggested use</dt><dd>{item.suggestedUse}</dd></> : null}
                {item.specSummary ? <><dt>Specs</dt><dd>{item.specSummary}</dd></> : null}
                {item.sku ? <><dt>SKU / item #</dt><dd>{item.sku}</dd></> : null}
                {item.esfCode && item.esfCode !== item.sku ? <><dt>ESF#</dt><dd>{item.esfCode}</dd></> : null}
                {item.model ? <><dt>Model</dt><dd>{item.model}</dd></> : null}
                {selectedVariant?.catalogNumber ? (
                  <><dt>Catalog #</dt><dd>{selectedVariant.catalogNumber}</dd></>
                ) : null}
                <dt>Asset status</dt>
                <dd>{PRODUCT_CATALOG_ASSET_LABELS[item.assetStatus]}</dd>
              </dl>

              {sourceDiffers ? (
                <section className="pc-text-section">
                  <h3 className="pc-section-title">Source name</h3>
                  <p className="pc-body-text pc-source-text">{item.originalName}</p>
                </section>
              ) : null}

              {item.variants && item.variants.length > 0 ? (
                <section className="pc-variant-section" aria-label="Color and finish options">
                  <h3 className="pc-section-title">Colors & finishes</h3>
                  <div className="pc-variant-chips">
                    {item.variants.map((v) => {
                      const label = v.colorName || v.finishName || v.catalogNumber || "Option";
                      const active = selectedVariant?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className={`pc-variant-chip${active ? " active" : ""}`}
                          onClick={() => { setSelectedVariant(v); setImgFailed(false); }}
                          aria-pressed={active}
                        >
                          {label}
                          {v.catalogNumber ? <span className="pc-variant-sku">{v.catalogNumber}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : item.availableColors && item.availableColors.length > 0 ? (
                <section className="pc-variant-section">
                  <h3 className="pc-section-title">Available colors</h3>
                  <div className="pc-variant-chips">
                    {item.availableColors.map((c) => (
                      <span key={c} className="pc-variant-chip static">{c}</span>
                    ))}
                  </div>
                </section>
              ) : null}

              {item.description && item.description !== item.specSummary ? (
                <section className="pc-text-section">
                  <h3 className="pc-section-title">Description</h3>
                  <p className="pc-body-text">{item.description}</p>
                </section>
              ) : null}

              {item.notes ? (
                <section className="pc-text-section">
                  <h3 className="pc-section-title">Notes</h3>
                  <p className="pc-body-text">{item.notes}</p>
                </section>
              ) : null}

              {item.installedImageUrl || selectedVariant?.installedImageUrl ? (
                <ProductImageSection title="Installed picture" urls={[selectedVariant?.installedImageUrl || item.installedImageUrl!]} onOpen={openZoom} galleryOffset={hero ? 1 : 0} />
              ) : null}

              {comboUrls.length > 0 ? (
                <ProductImageSection title="Combo photos" urls={comboUrls} onOpen={openZoom} />
              ) : null}

              {item.diagramUrl ? (
                <ProductImageSection title="Diagram" urls={[item.diagramUrl]} onOpen={openZoom} />
              ) : null}

              {(item.finishExampleUrls?.length ?? 0) > 0 ? (
                <ProductImageSection title="Finish examples" urls={item.finishExampleUrls!} onOpen={openZoom} />
              ) : null}

              {item.specSheetUrl ? (
                <section className="pc-text-section">
                  <h3 className="pc-section-title">Spec sheet</h3>
                  <a href={item.specSheetUrl} target="_blank" rel="noreferrer noopener" className="pc-spec-link">View spec sheet</a>
                </section>
              ) : null}

              {item.sourceSheet ? (
                <p className="pc-source-note">Workbook: {item.sourceSheet}</p>
              ) : null}
              {item.assetSourceNotes ? (
                <section className="pc-text-section">
                  <h3 className="pc-section-title">Asset source</h3>
                  <p className="pc-body-text">{item.assetSourceNotes}</p>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {zoomOpen && galleryItems.length > 0 ? (
        <ZoomImageViewer
          items={galleryItems}
          initialIndex={zoomIndex}
          onClose={() => setZoomOpen(false)}
        />
      ) : null}
    </>
  );
}

function ProductImageSection({
  title,
  urls,
  onOpen,
  galleryOffset = 0,
}: {
  title: string;
  urls: string[];
  onOpen: (index: number) => void;
  galleryOffset?: number;
}) {
  if (!urls.length) return null;
  return (
    <section className="pc-gallery-section">
      <h3 className="pc-section-title">{title}</h3>
      <div className="pc-thumb-grid">
        {urls.map((url, i) => (
          <button key={url + i} type="button" className="pc-thumb-btn" onClick={() => onOpen(galleryOffset + i)} aria-label={`${title} ${i + 1}`}>
            <img src={url} alt="" loading="lazy" className="pc-thumb" />
          </button>
        ))}
      </div>
    </section>
  );
}
