import { useCallback, useEffect, useMemo, useState } from "react";
import { ZoomImageViewer, type ZoomGalleryItem } from "./ZoomImageViewer";
import { getProductCatalogItemsWithAssets } from "./lib/productCatalogAssets";
import {
  PRODUCT_CATALOG_ASSET_LABELS,
  PRODUCT_CATALOG_CATEGORY_LABELS,
  PRODUCT_CATALOG_TABS,
  filterProductCatalogItems,
  getCatalogNumbersForFinish,
  getFinishImageForFinish,
  getUniqueFinishOptions,
  productCatalogCountForCategory,
  productCatalogCounts,
  productCatalogDisplayAssetStatus,
  productCatalogHeroImage,
  type ProductCatalogAssetFilter,
  type ProductCatalogCategory,
  type ProductCatalogFinishOption,
  type ProductCatalogItem,
  type ProductCatalogTagFilter,
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

type StageThumb = {
  id: string;
  url: string;
  caption: string;
};

function useCatalogImageTracker() {
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  const reset = useCallback(() => {
    setLoaded(new Set());
    setFailed(new Set());
  }, []);

  const markLoaded = useCallback((url: string) => {
    setLoaded((cur) => {
      if (cur.has(url)) return cur;
      const next = new Set(cur);
      next.add(url);
      return next;
    });
  }, []);

  const markFailed = useCallback((url: string) => {
    setFailed((cur) => {
      if (cur.has(url)) return cur;
      const next = new Set(cur);
      next.add(url);
      return next;
    });
  }, []);

  const isUsable = useCallback(
    (url?: string) => Boolean(url) && !failed.has(url!),
    [failed]
  );

  return { loaded, failed, reset, markLoaded, markFailed, isUsable };
}

function CatalogImage({
  src,
  alt,
  className,
  loading,
  hidden,
  onLoaded,
  onFailed,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  hidden?: boolean;
  onLoaded: (url: string) => void;
  onFailed: (url: string) => void;
}) {
  const [visible, setVisible] = useState(true);

  if (!visible || hidden) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onLoad={() => onLoaded(src)}
      onError={() => {
        setVisible(false);
        onFailed(src);
      }}
    />
  );
}

function buildStageThumbs(
  item: ProductCatalogItem,
  finishOptions: ProductCatalogFinishOption[],
  selectedFinishKey: string | null
): StageThumb[] {
  const thumbs: StageThumb[] = [];
  const seen = new Set<string>();

  const push = (id: string, url: string | undefined, caption: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    thumbs.push({ id, url, caption });
  };

  push("hero", item.imageUrl, "Product");

  if (selectedFinishKey) {
    push(
      `finish-${selectedFinishKey}`,
      getFinishImageForFinish(item, selectedFinishKey),
      finishOptions.find((o) => o.key === selectedFinishKey)?.label ?? "Finish"
    );
  } else {
    for (const opt of finishOptions) {
      push(`finish-${opt.key}`, opt.imageUrl, opt.label);
    }
  }

  push("installed", item.installedImageUrl, "Installed");
  (item.comboPhotoUrls ?? []).forEach((url, i) => push(`combo-${i}`, url, `Combo ${i + 1}`));
  push("diagram", item.diagramUrl, "Diagram");
  (item.finishExampleUrls ?? []).forEach((url, i) => push(`finish-ex-${i}`, url, `Finish example ${i + 1}`));
  (item.gallery ?? []).forEach((url, i) => push(`gallery-${i}`, url, `Gallery ${i + 1}`));

  return thumbs;
}

function resolveStageUrl(
  item: ProductCatalogItem,
  selectedFinishKey: string | null,
  activeThumbUrl: string | null,
  isUsable: (url?: string) => boolean
): string | undefined {
  if (activeThumbUrl && isUsable(activeThumbUrl)) return activeThumbUrl;

  if (selectedFinishKey) {
    const finishImage = getFinishImageForFinish(item, selectedFinishKey);
    if (isUsable(finishImage)) return finishImage;
  }

  if (isUsable(item.imageUrl)) return item.imageUrl;

  for (const opt of getUniqueFinishOptions(item)) {
    if (isUsable(opt.imageUrl)) return opt.imageUrl;
  }

  return undefined;
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
  const finishOptions = useMemo(() => getUniqueFinishOptions(item), [item]);
  const [selectedFinishKey, setSelectedFinishKey] = useState<string | null>(null);
  const [activeThumbUrl, setActiveThumbUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const { loaded, failed, reset, markLoaded, markFailed, isUsable } = useCatalogImageTracker();

  useEffect(() => {
    setSelectedFinishKey(null);
    setActiveThumbUrl(null);
    reset();
  }, [item, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stageThumbCandidates = useMemo(
    () => buildStageThumbs(item, finishOptions, selectedFinishKey),
    [item, finishOptions, selectedFinishKey]
  );

  const visibleThumbs = useMemo(
    () => stageThumbCandidates.filter((t) => !failed.has(t.url)),
    [stageThumbCandidates, failed]
  );

  const loadedThumbs = useMemo(
    () => visibleThumbs.filter((t) => loaded.has(t.url)),
    [visibleThumbs, loaded]
  );

  const stageUrl = resolveStageUrl(item, selectedFinishKey, activeThumbUrl, isUsable);

  const displayAssetStatus = productCatalogDisplayAssetStatus(item, loaded, failed);

  const selectedFinish = finishOptions.find((o) => o.key === selectedFinishKey) ?? null;
  const selectedCatalogNumbers = selectedFinishKey
    ? getCatalogNumbersForFinish(item, selectedFinishKey)
    : [];

  const galleryItems: ZoomGalleryItem[] = useMemo(() => {
    const fromThumbs = loadedThumbs.map((t) => ({ src: t.url, caption: t.caption }));
    if (fromThumbs.length > 0) return fromThumbs;
    if (stageUrl) return [{ src: stageUrl, caption: "Product" }];
    return [];
  }, [loadedThumbs, stageUrl]);

  const stageZoomIndex = useMemo(() => {
    if (!stageUrl) return 0;
    const idx = galleryItems.findIndex((g) => g.src === stageUrl);
    return idx >= 0 ? idx : 0;
  }, [galleryItems, stageUrl]);

  const openZoom = (url?: string) => {
    if (galleryItems.length === 0) return;
    const idx = url ? galleryItems.findIndex((g) => g.src === url) : stageZoomIndex;
    setZoomIndex(idx >= 0 ? idx : 0);
    setZoomOpen(true);
  };

  const selectFinish = (finishKey: string) => {
    setSelectedFinishKey(finishKey);
    setActiveThumbUrl(null);
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
            <div className="pc-modal-gallery">
              <div className="pc-modal-stage">
                {stageUrl ? (
                  <button
                    type="button"
                    className="pc-modal-hero-btn"
                    onClick={() => openZoom(stageUrl)}
                    aria-label="Open image viewer"
                  >
                    <CatalogImage
                      key={stageUrl}
                      src={stageUrl}
                      alt={selectedFinish ? `${item.name} — ${selectedFinish.label}` : item.name}
                      className="pc-modal-hero"
                      loading="eager"
                      onLoaded={markLoaded}
                      onFailed={markFailed}
                    />
                  </button>
                ) : (
                  <div className="pc-modal-placeholder" aria-hidden>
                    {categoryPlaceholderIcon(item.category)}
                    <span>{categoryPlaceholderLabel(item.category)}</span>
                    <p className="pc-modal-placeholder-note">Asset pending — select a finish or check back after assets are collected.</p>
                  </div>
                )}

                {/* Preload candidate thumbnails; hide failures without showing broken boxes */}
                <div className="pc-modal-preload" aria-hidden>
                  {stageThumbCandidates.map((t) => (
                    <CatalogImage
                      key={t.id}
                      src={t.url}
                      alt=""
                      hidden={loaded.has(t.url) || failed.has(t.url)}
                      onLoaded={markLoaded}
                      onFailed={markFailed}
                    />
                  ))}
                </div>
              </div>

              {loadedThumbs.length > 1 ? (
                <div className="pc-modal-thumbs" aria-label="Product images">
                  {loadedThumbs.map((t) => {
                    const active = (activeThumbUrl ?? stageUrl) === t.url;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`pc-modal-thumb${active ? " active" : ""}`}
                        onClick={() => setActiveThumbUrl(t.url)}
                        aria-label={t.caption}
                        aria-pressed={active}
                      >
                        <img src={t.url} alt="" className="pc-modal-thumb-img" />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <span className={`pc-asset-badge ${displayAssetStatus}`}>
                {PRODUCT_CATALOG_ASSET_LABELS[displayAssetStatus]}
              </span>
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
                {selectedFinish && selectedCatalogNumbers.length > 0 ? (
                  <><dt>Catalog #</dt><dd>{selectedCatalogNumbers.join(", ")}</dd></>
                ) : null}
                <dt>Asset status</dt>
                <dd>{PRODUCT_CATALOG_ASSET_LABELS[displayAssetStatus]}</dd>
              </dl>

              {finishOptions.length > 0 ? (
                <section className="pc-finish-section" aria-label="Color and finish options">
                  <h3 className="pc-section-title">Color / finish</h3>
                  {selectedFinish ? (
                    <p className="pc-finish-selected">
                      <strong>{selectedFinish.label}</strong>
                      {selectedCatalogNumbers.length > 0 ? (
                        <span className="pc-finish-catalog">Catalog {selectedCatalogNumbers.join(", ")}</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="pc-finish-hint">Select a finish to view variant imagery when available.</p>
                  )}
                  <div className="pc-finish-swatches">
                    {finishOptions.map((opt) => {
                      const active = selectedFinishKey === opt.key;
                      const swatchImage =
                        opt.imageUrl && loaded.has(opt.imageUrl) && isUsable(opt.imageUrl)
                          ? opt.imageUrl
                          : undefined;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          className={`pc-finish-swatch${active ? " active" : ""}`}
                          onClick={() => selectFinish(opt.key)}
                          aria-pressed={active}
                          aria-label={opt.label}
                        >
                          <span
                            className="pc-finish-swatch-dot"
                            style={
                              swatchImage
                                ? { backgroundImage: `url(${swatchImage})` }
                                : opt.swatchColor
                                  ? { backgroundColor: opt.swatchColor }
                                  : undefined
                            }
                          >
                            {!swatchImage && !opt.swatchColor ? (
                              <span className="pc-finish-swatch-fallback" aria-hidden />
                            ) : null}
                            {opt.imageUrl && !swatchImage ? (
                              <CatalogImage
                                src={opt.imageUrl}
                                alt=""
                                className="pc-finish-swatch-preload"
                                hidden={loaded.has(opt.imageUrl) || failed.has(opt.imageUrl)}
                                onLoaded={markLoaded}
                                onFailed={markFailed}
                              />
                            ) : null}
                          </span>
                          <span className="pc-finish-swatch-label">{opt.label}</span>
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

              {sourceDiffers ? (
                <section className="pc-text-section">
                  <h3 className="pc-section-title">Source name</h3>
                  <p className="pc-body-text pc-source-text">{item.originalName}</p>
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
                <p className="pc-source-note pc-asset-source-note">{item.assetSourceNotes}</p>
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
