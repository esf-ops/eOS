import { useRef, useState } from "react";
import { lookupElite100Texture } from "./elite100TextureAssets";
import {
  colorInitials,
  type Elite100ShowroomGroup,
  type Elite100ShowroomItem,
} from "./elite100ShowroomTypes";

export type { Elite100ShowroomGroup, Elite100ShowroomItem, Elite100ShowroomData } from "./elite100ShowroomTypes";

export function Elite100ShowroomSection({
  group,
  onOpenItem,
  kiosk = false,
}: {
  group: Elite100ShowroomGroup;
  onOpenItem?: (item: Elite100ShowroomItem) => void;
  kiosk?: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const firstItem = rail.firstElementChild as HTMLElement | null;
    const cardW = firstItem ? firstItem.offsetWidth + 24 : 424;
    rail.scrollBy({ left: dir * cardW * 2, behavior: "smooth" });
  };

  return (
    <section
      className={`e100-section${kiosk ? " e100-section-kiosk" : ""}`}
      aria-labelledby={`e100-group-${group.price_group}`}
    >
      <div className="e100-section-head">
        <div className="e100-section-title-row">
          <span className={`e100-group-badge${group.price_group === "Promo" ? " promo" : ""}`} aria-hidden>
            {group.price_group === "Promo" ? "P" : group.price_group}
          </span>
          <h2 id={`e100-group-${group.price_group}`} className="e100-section-title">
            {group.price_group === "Promo" ? "Group Promo" : `Group ${group.price_group}`}
          </h2>
          <span className="e100-section-count">{group.items.length} color{group.items.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="e100-section-controls" aria-label="Scroll carousel">
          <button type="button" className="e100-scroll-btn" onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>
          <button type="button" className="e100-scroll-btn" onClick={() => scroll(1)} aria-label="Scroll right">›</button>
        </div>
      </div>
      <div className="e100-rail-wrap">
        <div className="e100-rail" ref={railRef} role="list" aria-label={`Group ${group.price_group} colors`}>
          {group.items.map((item) => (
            <div key={item.catalog_item_id} role="listitem">
              <Elite100ShowroomCard item={item} onOpen={onOpenItem ? () => onOpenItem(item) : undefined} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Elite100ShowroomCard({
  item,
  onOpen,
  showInventoryMeta = true,
}: {
  item: Elite100ShowroomItem;
  onOpen?: () => void;
  showInventoryMeta?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const texture = lookupElite100Texture(item.color_name, item.color_key);
  const src = texture
    ? null
    : item.reference_image_url
      || item.reference_image_url_1024
      || item.reference_image_url_600
      || item.visual_asset_url_1024
      || item.visual_asset_url_600
      || null;
  const hasImage = Boolean(src) && !imgFailed;
  const availableCount = item.current_inventory_count ?? item.total_inventory_count;

  const inner = (
    <>
      <div className={`cp-card-mat${texture ? " cp-card-mat-texture" : ""}`}>
        <div className="cp-card-img-wrap">
          {texture ? (
            <img
              src={texture.thumbUrl}
              alt={`${item.display_name ?? item.color_name ?? texture.colorName} material texture`}
              loading="lazy"
              className="cp-card-img"
            />
          ) : hasImage ? (
            <img
              src={src!}
              alt={item.display_name ?? item.color_name ?? ""}
              loading="lazy"
              className="cp-card-img"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="cp-card-placeholder" aria-hidden>
              <span>{colorInitials(item.color_name)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="cp-card-body">
        <p className="cp-card-name">{item.color_name || "—"}</p>
        {item.material_name ? <p className="cp-card-material">{item.material_name}</p> : null}
        {showInventoryMeta ? (
          item.has_inventory && availableCount > 0 ? (
            <p className="cp-card-meta">
              <span>{availableCount} current available</span>
              {(item.slab_count > 0 || item.remnant_count > 0) ? (
                <>
                  <span className="cp-dot" aria-hidden> · </span>
                  {item.slab_count > 0 ? <span>{item.slab_count} slab{item.slab_count !== 1 ? "s" : ""}</span> : null}
                  {item.slab_count > 0 && item.remnant_count > 0 ? <span className="cp-dot" aria-hidden> · </span> : null}
                  {item.remnant_count > 0 ? <span>{item.remnant_count} remnant{item.remnant_count !== 1 ? "s" : ""}</span> : null}
                </>
              ) : null}
            </p>
          ) : (
            <p className="cp-card-no-inv-text">No current inventory</p>
          )
        ) : null}
      </div>
    </>
  );

  if (!onOpen) {
    return <article className="cp-card cp-card-static">{inner}</article>;
  }

  return (
    <button
      type="button"
      className="cp-card"
      onClick={onOpen}
      aria-label={`${item.color_name ?? "Color"} · ${item.has_inventory ? `${availableCount} current available` : "No current inventory"} — Open color`}
    >
      {inner}
    </button>
  );
}
