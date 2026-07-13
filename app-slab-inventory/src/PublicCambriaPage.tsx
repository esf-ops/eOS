import { useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import {
  Elite100ShowroomSection,
  type Elite100ShowroomItem,
} from "./lib/elite100Showroom";
import { PublicElite100ColorLightbox } from "./lib/PublicElite100ColorLightbox";
import {
  fetchPublicCambriaShowroom,
  type PublicCambriaInventoryCard,
} from "./lib/publicCambriaApi";
import { isKioskOrArreyaMode } from "./lib/publicCambriaRoute";

type CambriaTab = "inventory" | "designs";

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

function CambriaInventoryCard({
  item,
  onOpen,
}: {
  item: PublicCambriaInventoryCard;
  onOpen: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = item.representative_thumbnail_url || item.representative_image_url;
  const hasImage = Boolean(src) && !imgFailed;

  return (
    <button
      type="button"
      className="cambria-inv-card"
      onClick={onOpen}
      aria-label={`${item.color_name ?? "Cambria color"} · ${inventoryCountLabel(item)} — Open`}
    >
      <div className="cambria-inv-card-mat">
        {hasImage ? (
          <img
            src={src!}
            alt=""
            className="cambria-inv-card-img"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="cambria-inv-card-placeholder" aria-hidden>
            <span>{(item.color_name || "C").slice(0, 2).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="cambria-inv-card-body">
        <p className="cambria-inv-card-name">{item.color_name || "—"}</p>
        <p className="cambria-inv-card-material">{item.material_name || "Cambria"}</p>
        <p className="cambria-inv-card-meta">{inventoryCountLabel(item)}</p>
        {item.thickness_nominal ? (
          <p className="cambria-inv-card-thickness">{item.thickness_nominal}</p>
        ) : null}
      </div>
    </button>
  );
}

function CambriaInventoryLightbox({
  item,
  kiosk,
  onClose,
}: {
  item: PublicCambriaInventoryCard;
  kiosk: boolean;
  onClose: () => void;
}) {
  const src = item.representative_image_url || item.representative_thumbnail_url;

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
      className={`e100-public-lightbox-overlay${kiosk ? " e100-public-lightbox-kiosk" : ""}`}
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
  const [tab, setTab] = useState<CambriaTab>("inventory");
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPublicCambriaShowroom>> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDesign, setSelectedDesign] = useState<Elite100ShowroomItem | null>(null);
  const [selectedInventory, setSelectedInventory] = useState<PublicCambriaInventoryCard | null>(null);

  useEffect(() => {
    document.title = "Cambria Showcase · Elite Stone Fabrication";

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
      "Cambria Showcase — live Cambria inventory and stocked designs at Elite Stone Fabrication.",
    );
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

  const rootClass = ["e100-public-page", "cambria-public-page", kiosk ? "e100-public-kiosk" : ""]
    .filter(Boolean)
    .join(" ");

  const designGroups = data?.designs?.groups ?? [];
  const inventoryItems = data?.inventory?.items ?? [];

  return (
    <div className={rootClass}>
      <header className="e100-public-header">
        <div className="e100-public-brand">
          {EOS_LOGO_URL ? (
            <img src={EOS_LOGO_URL} alt="" className="e100-public-logo" />
          ) : (
            <span className="e100-public-logo-mark" aria-hidden>ESF</span>
          )}
          <div className="e100-public-brand-text">
            <h1 className="e100-public-title">{data?.title ?? "Cambria Showcase"}</h1>
            <p className="e100-public-subtitle">
              {data?.subtitle ?? "Live inventory and stocked designs at Elite Stone Fabrication"}
            </p>
          </div>
        </div>

        <nav className="cambria-public-tabs" aria-label="Cambria showcase sections">
          <button
            type="button"
            className={`cambria-public-tab${tab === "inventory" ? " active" : ""}`}
            onClick={() => setTab("inventory")}
          >
            Inventory
            {data ? <span className="cambria-public-tab-count">{data.inventory.total_pieces}</span> : null}
          </button>
          <button
            type="button"
            className={`cambria-public-tab${tab === "designs" ? " active" : ""}`}
            onClick={() => setTab("designs")}
          >
            Cambria Designs
            {data ? <span className="cambria-public-tab-count">{data.designs.total}</span> : null}
          </button>
        </nav>
      </header>

      <main className="e100-public-main">
        {busy && !data ? (
          <div className="e100-public-loading" aria-live="polite">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="e100-skeleton-section" aria-hidden />
            ))}
          </div>
        ) : error ? (
          <div className="banner banner-error" role="alert">{error}</div>
        ) : (
          <>
            {tab === "inventory" ? (
              <section className="cambria-inv-section" aria-labelledby="cambria-inv-heading">
                <div className="cambria-section-head">
                  <h2 id="cambria-inv-heading" className="cambria-section-title">
                    {data?.inventory.label ?? "Cambria Live Inventory"}
                  </h2>
                  <p className="cambria-section-sub">
                    {data
                      ? `${data.inventory.total_colors} color${data.inventory.total_colors === 1 ? "" : "s"} · ${data.inventory.total_pieces} piece${data.inventory.total_pieces === 1 ? "" : "s"} on hand`
                      : "Current Cambria stock at Elite Stone Fabrication"}
                  </p>
                </div>
                {inventoryItems.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-title">No Cambria inventory on hand</p>
                    <p className="empty-sub">Live inventory will appear here when Cambria slabs are active in slabOS.</p>
                  </div>
                ) : (
                  <div className="cambria-inv-grid">
                    {inventoryItems.map((item, idx) => (
                      <CambriaInventoryCard
                        key={item.color_key || `${item.color_name ?? "color"}-${idx}`}
                        item={item}
                        onOpen={() => setSelectedInventory(item)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section className="cambria-designs-section" aria-labelledby="cambria-designs-heading">
                <div className="cambria-section-head">
                  <h2 id="cambria-designs-heading" className="cambria-section-title">
                    {data?.designs.label ?? "Cambria Designs"}
                  </h2>
                  <p className="cambria-section-sub">
                    Stocked Cambria designs · {data?.designs.total ?? 0} color{(data?.designs.total ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                {designGroups.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-title">No Cambria designs available</p>
                    <p className="empty-sub">{data?.note ?? "No Cambria catalog designs are configured."}</p>
                  </div>
                ) : (
                  <div className="e100-public-sections">
                    {designGroups.map((group) =>
                      group.items.length > 0 ? (
                        <Elite100ShowroomSection
                          key={group.price_group}
                          group={group}
                          kiosk={kiosk}
                          showInventoryMeta
                          onOpenItem={setSelectedDesign}
                        />
                      ) : null
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <footer className="e100-public-footer">
        <p>Elite Stone Fabrication · Cambria Showcase · Presentation display</p>
      </footer>

      {selectedDesign ? (
        <PublicElite100ColorLightbox
          item={selectedDesign}
          kiosk={kiosk}
          showInventoryCount
          onClose={() => setSelectedDesign(null)}
        />
      ) : null}

      {selectedInventory ? (
        <CambriaInventoryLightbox
          item={selectedInventory}
          kiosk={kiosk}
          onClose={() => setSelectedInventory(null)}
        />
      ) : null}
    </div>
  );
}
