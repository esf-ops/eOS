import { useCallback, useEffect, useMemo, useState } from "react";
import { ZoomImageViewer, type ZoomGalleryItem } from "./ZoomImageViewer";
import { getProductCatalogItemsWithAssets } from "./lib/productCatalogAssets";
import {
  PRODUCT_CATALOG_CATEGORY_LABELS,
  PRODUCT_CATALOG_TABS,
  defaultFinishKeyForItem,
  filterProductCatalogItems,
  getCatalogNumbersForFinish,
  getFinishImageCandidatesForFinish,
  getProductHeroImageCandidates,
  getUniqueFinishOptions,
  productCatalogCountForCategory,
  resolveProductCatalogStageUrl,
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
  srcCandidates,
  alt,
  className,
  loading,
  hidden,
  onLoaded,
  onFailed,
}: {
  src?: string;
  srcCandidates?: string[];
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  hidden?: boolean;
  onLoaded: (url: string) => void;
  onFailed: (url: string) => void;
}) {
  const candidates = useMemo(() => {
    const list = srcCandidates?.length ? srcCandidates : src ? [src] : [];
    return [...new Set(list)];
  }, [src, srcCandidates]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setExhausted(false);
  }, [candidates.join("|")]);

  const currentSrc = candidates[candidateIndex];

  if (exhausted || hidden || !currentSrc) return null;

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      onLoad={() => onLoaded(currentSrc)}
      onError={() => {
        if (candidateIndex + 1 < candidates.length) {
          onFailed(currentSrc);
          setCandidateIndex((i) => i + 1);
          return;
        }
        setExhausted(true);
        onFailed(candidates[0] ?? currentSrc);
      }}
    />
  );
}

function collectFinishImageUrls(
  item: ProductCatalogItem,
  finishOptions: ProductCatalogFinishOption[]
): Set<string> {
  const urls = new Set<string>();
  for (const url of getProductHeroImageCandidates(item)) urls.add(url);
  for (const opt of finishOptions) {
    for (const url of getFinishImageCandidatesForFinish(item, opt.key)) urls.add(url);
  }
  return urls;
}

/** Supporting media only — excludes hero and finish-selector images. */
function buildSupportingGalleryThumbs(
  item: ProductCatalogItem,
  finishOptions: ProductCatalogFinishOption[]
): StageThumb[] {
  const finishUrls = collectFinishImageUrls(item, finishOptions);
  const thumbs: StageThumb[] = [];
  const seen = new Set<string>();

  const push = (id: string, url: string | undefined, caption: string) => {
    if (!url || seen.has(url) || finishUrls.has(url)) return;
    seen.add(url);
    thumbs.push({ id, url, caption });
  };

  const installedUrls = item.installedGalleryUrls?.length
    ? item.installedGalleryUrls
    : item.installedImageUrl
      ? [item.installedImageUrl]
      : [];
  installedUrls.forEach((url, i) => {
    push(`installed-${i}`, url, i === 0 ? "Installed" : `Installed ${i + 1}`);
  });
  push("diagram", item.diagramUrl, "Diagram");
  (item.comboPhotoUrls ?? []).forEach((url, i) => push(`combo-${i}`, url, `Combo ${i + 1}`));
  (item.gallery ?? []).forEach((url, i) => push(`gallery-${i}`, url, `Gallery ${i + 1}`));
  (item.finishExampleUrls ?? []).forEach((url, i) =>
    push(`finish-ex-${i}`, url, `Finish example ${i + 1}`)
  );

  return thumbs;
}

export default function ProductCatalogPanel() {
  const [category, setCategory] = useState<ProductCatalogCategory>("sink");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<ProductCatalogTagFilter[]>([]);
  const [selected, setSelected] = useState<ProductCatalogItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const catalogItems = useMemo(() => getProductCatalogItemsWithAssets(), []);

  const filtered = useMemo(
    () =>
      filterProductCatalogItems(catalogItems, {
        category,
        search,
        tags,
        assetStatus: "all",
      }),
    [category, search, tags, catalogItems]
  );

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
  const heroCandidates = useMemo(() => getProductHeroImageCandidates(item), [item]);
  const [showPlaceholder, setShowPlaceholder] = useState(false);

  useEffect(() => {
    setShowPlaceholder(false);
  }, [heroCandidates.join("|")]);

  const hasHero = heroCandidates.length > 0 && !showPlaceholder;

  return (
    <button type="button" className="pc-card" onClick={onOpen} aria-label={`View ${item.name}`}>
      <div className="pc-card-mat">
        <div className="pc-card-media">
          {hasHero ? (
            <CatalogImage
              srcCandidates={heroCandidates}
              alt={item.name}
              className="pc-card-img"
              loading="lazy"
              onLoaded={() => {}}
              onFailed={() => setShowPlaceholder(true)}
            />
          ) : (
            <div className="pc-card-placeholder" aria-hidden>
              {categoryPlaceholderIcon(item.category)}
              <span>{categoryPlaceholderLabel(item.category)}</span>
            </div>
          )}
        </div>
      </div>
      <p className="pc-card-name-only">{item.name}</p>
    </button>
  );
}

function ProductCatalogModal({ item, onClose }: { item: ProductCatalogItem; onClose: () => void }) {
  const finishOptions = useMemo(() => getUniqueFinishOptions(item), [item]);
  const [selectedFinishKey, setSelectedFinishKey] = useState<string | null>(null);
  const [activeGalleryUrl, setActiveGalleryUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const { loaded, failed, reset, markLoaded, markFailed, isUsable } = useCatalogImageTracker();

  useEffect(() => {
    setSelectedFinishKey(defaultFinishKeyForItem(item));
    setActiveGalleryUrl(null);
    reset();
  }, [item, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const supportingGalleryCandidates = useMemo(
    () => buildSupportingGalleryThumbs(item, finishOptions),
    [item, finishOptions]
  );

  const finishPreloadUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const url of getProductHeroImageCandidates(item)) urls.add(url);
    for (const opt of finishOptions) {
      for (const url of getFinishImageCandidatesForFinish(item, opt.key)) urls.add(url);
    }
    return [...urls];
  }, [item, finishOptions]);

  const stageCandidates = useMemo(() => {
    if (activeGalleryUrl) return [activeGalleryUrl];
    const finishKey = selectedFinishKey ?? item.defaultFinishKey ?? null;
    if (finishKey) return getFinishImageCandidatesForFinish(item, finishKey);
    return getProductHeroImageCandidates(item);
  }, [item, selectedFinishKey, activeGalleryUrl]);

  const loadedSupportingThumbs = useMemo(
    () => supportingGalleryCandidates.filter((t) => loaded.has(t.url) && !failed.has(t.url)),
    [supportingGalleryCandidates, loaded, failed]
  );

  const stageUrl = resolveProductCatalogStageUrl(item, selectedFinishKey, activeGalleryUrl, isUsable);

  const stageExhausted =
    stageCandidates.length > 0 && stageCandidates.every((url) => failed.has(url));
  const showStageImage = stageCandidates.length > 0 && !stageExhausted;

  const selectedFinish = finishOptions.find((o) => o.key === selectedFinishKey) ?? null;
  const selectedCatalogNumbers = selectedFinishKey
    ? getCatalogNumbersForFinish(item, selectedFinishKey)
    : [];

  const galleryItems: ZoomGalleryItem[] = useMemo(() => {
    const items: ZoomGalleryItem[] = [];
    const seen = new Set<string>();

    const add = (src: string | undefined, caption: string) => {
      if (!src || seen.has(src) || failed.has(src) || !loaded.has(src)) return;
      seen.add(src);
      items.push({ src, caption });
    };

    add(item.imageUrl, "Product");
    for (const opt of finishOptions) {
      add(opt.imageUrl, opt.label);
    }
    for (const t of loadedSupportingThumbs) {
      add(t.url, t.caption);
    }

    if (items.length === 0 && stageUrl && loaded.has(stageUrl)) {
      items.push({ src: stageUrl, caption: selectedFinish?.label ?? "Product" });
    }
    return items;
  }, [item.imageUrl, finishOptions, loadedSupportingThumbs, loaded, failed, stageUrl, selectedFinish?.label]);

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
    setActiveGalleryUrl(null);
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
                {showStageImage ? (
                  <button
                    type="button"
                    className="pc-modal-hero-btn"
                    onClick={() => openZoom(stageUrl)}
                    aria-label="Open image viewer"
                  >
                    <CatalogImage
                      key={stageCandidates.join("|")}
                      srcCandidates={stageCandidates}
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

                {/* Preload finish + supporting images; failures stay hidden */}
                <div className="pc-modal-preload" aria-hidden>
                  {finishPreloadUrls.map((url) => (
                    <CatalogImage
                      key={`finish-${url}`}
                      src={url}
                      alt=""
                      hidden={loaded.has(url) || failed.has(url)}
                      onLoaded={markLoaded}
                      onFailed={markFailed}
                    />
                  ))}
                  {supportingGalleryCandidates.map((t) => (
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

              {loadedSupportingThumbs.length > 0 ? (
                <div className="pc-modal-thumbs" aria-label="Supporting product images">
                  {loadedSupportingThumbs.map((t) => {
                    const active = activeGalleryUrl === t.url;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`pc-modal-thumb${active ? " active" : ""}`}
                        onClick={() => setActiveGalleryUrl(t.url)}
                        aria-label={t.caption}
                        aria-pressed={active}
                      >
                        <img src={t.url} alt="" className="pc-modal-thumb-img" />
                      </button>
                    );
                  })}
                </div>
              ) : null}
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
                    <p className="pc-finish-hint">Select a finish to view variant imagery.</p>
                  )}
                  <div className="pc-finish-swatches">
                    {finishOptions.map((opt) => {
                      const active = selectedFinishKey === opt.key;
                      const swatchCandidates = getFinishImageCandidatesForFinish(item, opt.key);
                      const swatchImage = swatchCandidates.find(
                        (url) => loaded.has(url) && isUsable(url)
                      );
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
                            {swatchCandidates.length > 0 && !swatchImage ? (
                              <CatalogImage
                                srcCandidates={swatchCandidates}
                                alt=""
                                className="pc-finish-swatch-preload"
                                hidden={swatchCandidates.every(
                                  (url) => loaded.has(url) || failed.has(url)
                                )}
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
