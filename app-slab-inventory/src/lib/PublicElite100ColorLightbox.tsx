import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { lookupElite100Texture } from "./elite100TextureAssets";
import { currentlyAvailableLabel, elite100CardImageSrcFull, type Elite100ShowroomItem } from "./elite100ShowroomTypes";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.35;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function groupLabel(priceGroup: string): string {
  return priceGroup === "Promo" ? "Group Promo" : `Group ${priceGroup}`;
}

type PublicElite100ColorLightboxProps = {
  item: Elite100ShowroomItem;
  kiosk?: boolean;
  onClose: () => void;
  /**
   * When true (Cambria vendor showcase), show live inventory counts.
   * Homeowner Elite 100 public showroom keeps this false.
   */
  showInventoryCount?: boolean;
  /** Cambria kiosk — black/gold lightbox chrome (scoped; does not affect Elite 100). */
  variant?: "default" | "cambria";
};

/** Public-safe color detail — image zoom; inventory counts only when explicitly enabled. */
export function PublicElite100ColorLightbox({
  item,
  kiosk = false,
  onClose,
  showInventoryCount = false,
  variant = "default",
}: PublicElite100ColorLightboxProps) {
  const texture = lookupElite100Texture(item.color_name, item.color_key);
  const imageSrc = texture?.fullUrl ?? elite100CardImageSrcFull(item);
  const availableCount = item.current_inventory_count ?? item.total_inventory_count ?? 0;
  const hasInventory = Boolean(item.has_inventory) && availableCount > 0;

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    dragRef.current = null;
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((prev) => {
      const next = clampScale(Number((prev + delta).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    resetView();
  }, [item.catalog_item_id, resetView]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({
      x: drag.panX + (e.clientX - drag.x),
      y: drag.panY + (e.clientY - drag.y),
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const rootClass = [
    "e100-public-lightbox-overlay",
    kiosk ? "e100-public-lightbox-kiosk" : "",
    variant === "cambria" ? "cambria-theme-lightbox" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.color_name ?? (variant === "cambria" ? "Cambria design" : "Elite 100 color")} detail`}
      onClick={onClose}
    >
      <div className="e100-public-lightbox" onClick={(e) => e.stopPropagation()}>
        <header className="e100-public-lightbox-head">
          <div className="e100-public-lightbox-copy">
            <h2 className="e100-public-lightbox-title">{item.color_name ?? "—"}</h2>
            <p className="e100-public-lightbox-meta">
              <span className={`e100-group-badge${item.price_group === "Promo" ? " promo" : ""}`}>
                {item.price_group === "Promo" ? "P" : item.price_group}
              </span>
              <span>{groupLabel(item.price_group)}</span>
              {item.material_name ? (
                <>
                  <span className="e100-public-lightbox-dot" aria-hidden>·</span>
                  <span>{item.material_name}</span>
                </>
              ) : null}
            </p>
            {showInventoryCount ? (
              hasInventory ? (
                <p className="e100-public-lightbox-avail">{currentlyAvailableLabel(availableCount)}</p>
              ) : (
                <p className="e100-public-lightbox-avail muted">No current inventory on hand</p>
              )
            ) : variant === "cambria" ? null : (
              <p className="e100-public-lightbox-avail">Available through Elite Stone Fabrication</p>
            )}
          </div>
          <div className="e100-public-lightbox-actions">
            <button type="button" className="e100-public-lightbox-zoom" onClick={() => zoomBy(-ZOOM_STEP)} aria-label="Zoom out">−</button>
            <span className="e100-public-lightbox-zoom-label" aria-live="polite">{Math.round(scale * 100)}%</span>
            <button type="button" className="e100-public-lightbox-zoom" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">+</button>
            <button type="button" className="e100-public-lightbox-close" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div
          className={`e100-public-lightbox-viewport${scale > 1 ? " pannable" : ""}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imageSrc ? (
            <div
              className="e100-public-lightbox-stage"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
              <img
                src={imageSrc}
                alt={item.color_name ?? "Elite 100 color"}
                className="e100-public-lightbox-img"
                draggable={false}
              />
            </div>
          ) : (
            <div className="e100-public-lightbox-placeholder">
              <p>No showroom image available for this color.</p>
            </div>
          )}
        </div>

        <footer className="e100-public-lightbox-foot">
          <span>Tap outside or press Close · scroll or +/− to zoom</span>
        </footer>
      </div>
    </div>
  );
}
