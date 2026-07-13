import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Elite100ShowroomSection,
  type Elite100ShowroomItem,
} from "./lib/elite100Showroom";
import { elite100CardImageSrc } from "./lib/elite100ShowroomTypes";
import { PublicElite100ColorLightbox } from "./lib/PublicElite100ColorLightbox";
import {
  fetchPublicCambriaShowroom,
  type PublicCambriaInventoryCard,
  type PublicCambriaShowroomPayload,
} from "./lib/publicCambriaApi";
import { isKioskOrArreyaMode } from "./lib/publicCambriaRoute";
import { cambriaVisualizerUrl } from "./lib/cambriaVisualizerUrl";

type CambriaView = "home" | "designs" | "inventory" | "visualizer";

const FALLBACK_SWATCHES = [
  "/material-textures/elite100/thumb/carrara-royale.jpg",
  "/material-textures/elite100/thumb/white-dove.jpg",
  "/material-textures/elite100/thumb/classic-gray.jpg",
  "/material-textures/elite100/thumb/silver-pearl-polished.jpg",
  "/material-textures/elite100/thumb/suede-brown-polished.jpg",
  "/material-textures/elite100/thumb/india-black-pearl-polished.jpg",
];

const VISUALIZER_CARD_IMAGE = "/visualizer-samples/dark-cabinet-kitchen.svg";

function parseCambriaView(search: string): CambriaView {
  const view = new URLSearchParams(search).get("view");
  if (view === "designs" || view === "inventory" || view === "visualizer") return view;
  return "home";
}

function writeCambriaView(view: CambriaView) {
  const url = new URL(window.location.href);
  if (view === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  window.history.replaceState(null, "", url.toString());
}

function inventoryCountLabel(item: PublicCambriaInventoryCard): string {
  const n = item.total_inventory_count ?? 0;
  if (n <= 0) return "No pieces on hand";
  const parts: string[] = [`${n} piece${n === 1 ? "" : "s"}`];
  if (item.slab_count > 0) parts.push(`${item.slab_count} slab${item.slab_count === 1 ? "" : "s"}`);
  if (item.remnant_count > 0) {
    parts.push(`${item.remnant_count} remnant${item.remnant_count === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

function inventoryCardImageSrc(item: PublicCambriaInventoryCard): string | null {
  return (
    item.thumbnail_url ||
    item.representative_thumbnail_url ||
    item.image_url ||
    item.representative_image_url ||
    null
  );
}

function inventoryLightboxImageSrc(item: PublicCambriaInventoryCard): string | null {
  return (
    item.image_url ||
    item.representative_image_url ||
    item.thumbnail_url ||
    item.representative_thumbnail_url ||
    null
  );
}

function collectDesignThumbs(data: PublicCambriaShowroomPayload | null, limit = 6): string[] {
  const urls: string[] = [];
  for (const group of data?.designs?.groups ?? []) {
    for (const item of group.items) {
      const src = elite100CardImageSrc(item);
      if (src && !urls.includes(src)) urls.push(src);
      if (urls.length >= limit) return urls;
    }
  }
  return urls.length ? urls : FALLBACK_SWATCHES.slice(0, limit);
}

function collectInventoryThumbs(data: PublicCambriaShowroomPayload | null, limit = 4): string[] {
  const urls: string[] = [];
  for (const item of data?.inventory?.items ?? []) {
    const src = inventoryCardImageSrc(item);
    if (src && !urls.includes(src)) urls.push(src);
    if (urls.length >= limit) return urls;
  }
  return urls.length
    ? urls
    : [
        "/material-textures/elite100/thumb/sicilia.jpg",
        "/material-textures/elite100/thumb/india-black-pearl-polished.jpg",
        "/material-textures/elite100/thumb/suede-brown-polished.jpg",
      ];
}

function matchesInventorySearch(item: PublicCambriaInventoryCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.color_name,
    item.material_name,
    item.thickness_nominal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function ensureDisplayFonts() {
  const id = "cambria-kiosk-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap";
  document.head.appendChild(link);
}

function sectionTitleForView(view: CambriaView): string | null {
  if (view === "designs") return "Cambria Designs";
  if (view === "inventory") return "Live Cambria Inventory";
  if (view === "visualizer") return "Cambria Visualizer";
  return null;
}

function CambriaInventoryCard({
  item,
  onOpen,
}: {
  item: PublicCambriaInventoryCard;
  onOpen: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = inventoryCardImageSrc(item);
  const hasImage = Boolean(src) && !imgFailed;

  return (
    <button
      type="button"
      className="cambria-kiosk-detail-card"
      onClick={onOpen}
      aria-label={`${item.color_name ?? "Cambria color"} · ${inventoryCountLabel(item)} — Open`}
    >
      <div className="cambria-kiosk-detail-card-mat">
        {hasImage ? (
          <img
            src={src!}
            alt=""
            className="cambria-kiosk-detail-card-img"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="cambria-kiosk-detail-card-placeholder" aria-hidden>
            <span>{(item.color_name || "C").slice(0, 2).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="cambria-kiosk-detail-card-body">
        <p className="cambria-kiosk-detail-card-name">{item.color_name || "—"}</p>
        <p className="cambria-kiosk-detail-card-material">{item.material_name || "Cambria"}</p>
        <p className="cambria-kiosk-detail-card-meta">{inventoryCountLabel(item)}</p>
        {item.thickness_nominal ? (
          <p className="cambria-kiosk-detail-card-thickness">{item.thickness_nominal}</p>
        ) : null}
      </div>
    </button>
  );
}

function CambriaInventoryLightbox({
  item,
  onClose,
}: {
  item: PublicCambriaInventoryCard;
  onClose: () => void;
}) {
  const src = inventoryLightboxImageSrc(item);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="e100-public-lightbox-overlay e100-public-lightbox-kiosk cambria-theme-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.color_name ?? "Cambria"} inventory`}
      onClick={onClose}
    >
      <div className="e100-public-lightbox" onClick={(e) => e.stopPropagation()}>
        <header className="e100-public-lightbox-head">
          <div className="e100-public-lightbox-copy">
            <h2 className="e100-public-lightbox-title">{item.color_name ?? "—"}</h2>
            <p className="e100-public-lightbox-meta">
              <span>{item.material_name || "Cambria"}</span>
              {item.thickness_nominal ? (
                <>
                  <span className="e100-public-lightbox-dot" aria-hidden>·</span>
                  <span>{item.thickness_nominal}</span>
                </>
              ) : null}
            </p>
            <p className="e100-public-lightbox-avail">{inventoryCountLabel(item)}</p>
          </div>
          <div className="e100-public-lightbox-actions">
            <button type="button" className="e100-public-lightbox-close" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="e100-public-lightbox-viewport">
          {src ? (
            <div className="e100-public-lightbox-stage">
              <img src={src} alt={item.color_name ?? "Cambria slab"} className="e100-public-lightbox-img" />
            </div>
          ) : (
            <div className="e100-public-lightbox-placeholder">
              <p>No showroom image available for this color.</p>
            </div>
          )}
        </div>
        <footer className="e100-public-lightbox-foot">
          <span>Live Cambria inventory at Elite Stone Fabrication</span>
        </footer>
      </div>
    </div>
  );
}

export default function PublicCambriaPage() {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);
  const [view, setView] = useState<CambriaView>(() => parseCambriaView(window.location.search));
  const [data, setData] = useState<PublicCambriaShowroomPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDesign, setSelectedDesign] = useState<Elite100ShowroomItem | null>(null);
  const [selectedInventory, setSelectedInventory] = useState<PublicCambriaInventoryCard | null>(null);
  const [inventorySearchInput, setInventorySearchInput] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");

  const goTo = useCallback((next: CambriaView) => {
    writeCambriaView(next);
    setView(next);
    setSelectedDesign(null);
    setSelectedInventory(null);
    if (next !== "inventory") {
      setInventorySearchInput("");
      setInventorySearch("");
    }
  }, []);

  useEffect(() => {
    ensureDisplayFonts();
    document.title = "Cambria Showcase · Elite Stone Fabrication";
    document.body.classList.add("cambria-kiosk-body");

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
    desc.setAttribute(
      "content",
      "Cambria Showcase — live Cambria inventory, stocked designs, and visualizer at Elite Stone Fabrication.",
    );

    return () => {
      document.body.classList.remove("cambria-kiosk-body");
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    fetchPublicCambriaShowroom()
      .then((payload) => {
        if (!alive) return;
        setData(payload);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setInventorySearch(inventorySearchInput), 180);
    return () => window.clearTimeout(t);
  }, [inventorySearchInput]);

  const designThumbs = useMemo(() => collectDesignThumbs(data), [data]);
  const inventoryThumbs = useMemo(() => collectInventoryThumbs(data), [data]);
  const designGroups = data?.designs?.groups ?? [];
  const inventoryItems = data?.inventory?.items ?? [];
  const standaloneVisualizerUrl = useMemo(
    () =>
      cambriaVisualizerUrl({
        arreya: isKioskOrArreyaMode() || new URLSearchParams(window.location.search).get("arreya") === "1",
        kiosk: new URLSearchParams(window.location.search).get("kiosk") === "1",
      }),
    [],
  );

  function openStandaloneVisualizer() {
    window.location.assign(standaloneVisualizerUrl);
  }

  useEffect(() => {
    if (view !== "visualizer") return;
    window.location.assign(standaloneVisualizerUrl);
  }, [view, standaloneVisualizerUrl]);

  const filteredInventory = useMemo(
    () => inventoryItems.filter((item) => matchesInventorySearch(item, inventorySearch)),
    [inventoryItems, inventorySearch],
  );

  const rootClass = [
    "cambria-kiosk",
    "cambria-theme",
    view === "home" ? "cambria-kiosk--home" : "cambria-kiosk--detail",
    kiosk ? "cambria-kiosk--arreya" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sectionTitle = sectionTitleForView(view);

  return (
    <div className={rootClass} data-view={view}>
      <div className="cambria-kiosk-bg" aria-hidden>
        <div className="cambria-kiosk-bg-facility" />
        <div className="cambria-kiosk-bg-wash" />
        <div className="cambria-kiosk-bg-orb cambria-kiosk-bg-orb-1" />
        <div className="cambria-kiosk-bg-orb cambria-kiosk-bg-orb-2" />
        <div className="cambria-kiosk-bg-orb cambria-kiosk-bg-orb-3" />
        <div className="cambria-kiosk-bg-grain" />
      </div>

      <div className="cambria-kiosk-shell">
        <header className="cambria-kiosk-topbar">
          <div className="cambria-kiosk-brand">
            <img
              className={`cambria-kiosk-cambria-logo${view === "home" ? " cambria-kiosk-cambria-logo--large" : ""}`}
              src="/brand/cambria-h-rev-rgb-cusa-nav.svg"
              alt="Cambria"
              draggable={false}
            />
            <div className="cambria-kiosk-host">
              <div className={`cambria-kiosk-logo${view === "home" ? " cambria-kiosk-logo--large" : ""}`}>
                <img
                  src="/esf-logo.png"
                  alt="Elite Stone Fabrication"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const fallback = e.currentTarget.nextElementSibling;
                    if (fallback) (fallback as HTMLElement).style.display = "flex";
                  }}
                />
                <span className="cambria-kiosk-logo-fallback" style={{ display: "none" }}>
                  Elite Stone Fabrication
                </span>
              </div>
              <span className="cambria-kiosk-powered">Hosted by Elite Stone · Powered by slabOS</span>
            </div>
          </div>

          {sectionTitle ? (
            <div className="cambria-kiosk-topbar-section">
              <span className="cambria-kiosk-topbar-divider" aria-hidden />
              <span className="cambria-kiosk-topbar-title">{sectionTitle}</span>
            </div>
          ) : null}

          {view !== "home" ? (
            <button type="button" className="cambria-kiosk-home-btn" onClick={() => goTo("home")}>
              ← Back to Cambria Showcase
            </button>
          ) : null}
        </header>

        {busy && !data ? (
          <main className="cambria-kiosk-main">
            <div className="cambria-kiosk-loading" aria-live="polite">
              Loading Cambria showcase…
            </div>
          </main>
        ) : error ? (
          <main className="cambria-kiosk-main">
            <div className="banner banner-error" role="alert">{error}</div>
          </main>
        ) : view === "home" ? (
          <main className="cambria-kiosk-main cambria-kiosk-landing">
            <div className="cambria-kiosk-hero">
              <h1 className="cambria-kiosk-headline">Explore Cambria Designs</h1>
              <p className="cambria-kiosk-subhead">
                {data?.subtitle ?? "Live Cambria inventory and stocked designs at Elite Stone Fabrication"}
              </p>
              <p className="cambria-kiosk-footnote">Touch a category to begin</p>
            </div>

            <nav className="cambria-kiosk-card-grid" aria-label="Cambria showcase categories">
              <button
                type="button"
                className="cambria-kiosk-card cambria-kiosk-card--designs"
                onClick={() => goTo("designs")}
              >
                <div className="cambria-kiosk-card-art cambria-kiosk-card-art--swatches" aria-hidden>
                  {designThumbs.map((src) => (
                    <img key={src} src={src} alt="" className="cambria-kiosk-swatch" loading="eager" draggable={false} />
                  ))}
                </div>
                <span className="cambria-kiosk-card-body">
                  <span className="cambria-kiosk-card-title">Cambria Designs</span>
                  <span className="cambria-kiosk-card-copy">
                    Browse stocked Cambria colors
                    {data ? ` · ${data.designs.total} design${data.designs.total === 1 ? "" : "s"}` : ""}.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="cambria-kiosk-card cambria-kiosk-card--inventory"
                onClick={() => goTo("inventory")}
              >
                <div className="cambria-kiosk-card-art cambria-kiosk-card-art--photo" aria-hidden>
                  {inventoryThumbs.slice(0, 1).map((src) => (
                    <img key={src} src={src} alt="" className="cambria-kiosk-card-photo" loading="eager" draggable={false} />
                  ))}
                </div>
                <span className="cambria-kiosk-card-body">
                  <span className="cambria-kiosk-card-title">Live Cambria Inventory</span>
                  <span className="cambria-kiosk-card-copy">
                    View Cambria slabs and remnants on hand
                    {data ? ` · ${data.inventory.total_pieces} piece${data.inventory.total_pieces === 1 ? "" : "s"}` : ""}.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="cambria-kiosk-card cambria-kiosk-card--visualizer"
                onClick={openStandaloneVisualizer}
              >
                <div className="cambria-kiosk-card-art cambria-kiosk-card-art--photo" aria-hidden>
                  <img
                    src={VISUALIZER_CARD_IMAGE}
                    alt=""
                    className="cambria-kiosk-card-photo"
                    loading="eager"
                    draggable={false}
                  />
                  <span className="cambria-kiosk-card-badge">Visualize</span>
                </div>
                <span className="cambria-kiosk-card-body">
                  <span className="cambria-kiosk-card-title">Cambria Visualizer</span>
                  <span className="cambria-kiosk-card-copy">Preview Cambria designs in a room scene.</span>
                </span>
              </button>
            </nav>
          </main>
        ) : view === "designs" ? (
          <main className="cambria-kiosk-main cambria-kiosk-detail">
            <div className="cambria-kiosk-detail-head">
              <h2 className="cambria-kiosk-detail-title">Cambria Designs</h2>
              <p className="cambria-kiosk-detail-sub">
                Stocked Cambria designs · {data?.designs.total ?? 0} color{(data?.designs.total ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            {designGroups.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No Cambria designs available</p>
                <p className="empty-sub">{data?.note ?? "No Cambria catalog designs are configured."}</p>
              </div>
            ) : (
              <div className="cambria-kiosk-detail-sections">
                {designGroups.map((group) =>
                  group.items.length > 0 ? (
                    <Elite100ShowroomSection
                      key={group.price_group}
                      group={group}
                      kiosk
                      showInventoryMeta
                      onOpenItem={setSelectedDesign}
                    />
                  ) : null
                )}
              </div>
            )}
          </main>
        ) : view === "inventory" ? (
          <main className="cambria-kiosk-main cambria-kiosk-detail">
            <div className="cambria-kiosk-detail-head cambria-kiosk-detail-head--inventory">
              <div>
                <h2 className="cambria-kiosk-detail-title">Live Cambria Inventory</h2>
                <p className="cambria-kiosk-detail-sub">
                  {data
                    ? `${data.inventory.total_colors} color${data.inventory.total_colors === 1 ? "" : "s"} · ${data.inventory.total_pieces} piece${data.inventory.total_pieces === 1 ? "" : "s"} on hand`
                    : "Current Cambria stock at Elite Stone Fabrication"}
                </p>
              </div>
              <div className="cambria-kiosk-search">
                <input
                  type="search"
                  className="cambria-kiosk-search-input"
                  placeholder="Search color, material, or thickness…"
                  value={inventorySearchInput}
                  onChange={(e) => setInventorySearchInput(e.target.value)}
                  aria-label="Search Cambria inventory"
                />
                {inventorySearchInput ? (
                  <button
                    type="button"
                    className="cambria-kiosk-search-clear"
                    onClick={() => {
                      setInventorySearchInput("");
                      setInventorySearch("");
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            {inventoryItems.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No Cambria inventory on hand</p>
                <p className="empty-sub">Live inventory will appear here when Cambria slabs are active in slabOS.</p>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No Cambria inventory matches that search.</p>
                <p className="empty-sub">Try another color name, material, or thickness.</p>
              </div>
            ) : (
              <div className="cambria-kiosk-detail-grid">
                {filteredInventory.map((item, idx) => (
                  <CambriaInventoryCard
                    key={item.color_key || `${item.color_name ?? "color"}-${idx}`}
                    item={item}
                    onOpen={() => setSelectedInventory(item)}
                  />
                ))}
              </div>
            )}
          </main>
        ) : (
          <main className="cambria-kiosk-main cambria-kiosk-detail cambria-kiosk-visualizer-handoff">
            <div className="cambria-kiosk-detail-head">
              <h2 className="cambria-kiosk-detail-title">Cambria Visualizer</h2>
              <p className="cambria-kiosk-detail-sub">
                Opens the standalone Cambria visualizer — same experience as visualizer.eliteosfab.com,
                with Cambria designs only.
              </p>
            </div>
            <div className="cambria-kiosk-handoff">
              <button
                type="button"
                className="cambria-kiosk-handoff-btn"
                onClick={openStandaloneVisualizer}
              >
                Open Cambria Visualizer
              </button>
              <p className="cambria-kiosk-handoff-url">{standaloneVisualizerUrl}</p>
            </div>
          </main>
        )}
      </div>

      {selectedDesign ? (
        <PublicElite100ColorLightbox
          item={selectedDesign}
          kiosk
          showInventoryCount
          variant="cambria"
          onClose={() => setSelectedDesign(null)}
        />
      ) : null}

      {selectedInventory ? (
        <CambriaInventoryLightbox
          item={selectedInventory}
          onClose={() => setSelectedInventory(null)}
        />
      ) : null}
    </div>
  );
}
