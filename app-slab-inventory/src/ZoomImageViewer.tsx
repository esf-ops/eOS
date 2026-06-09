import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

export type ZoomGalleryItem = {
  src: string;
  caption: string;
  alt?: string;
  itemId?: string;
};

type ZoomImageViewerProps = {
  items: ZoomGalleryItem[];
  initialIndex?: number;
  onClose: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.35;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function ZoomImageViewer({ items, initialIndex = 0, onClose }: ZoomImageViewerProps) {
  const safeItems = items.filter((item) => Boolean(item.src));
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, safeItems.length - 1)));
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const current = safeItems[index] ?? null;

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

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    resetView();
  }, [resetView]);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(safeItems.length - 1, i + 1));
    resetView();
  }, [resetView, safeItems.length]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        resetView();
        return;
      }
      if (safeItems.length > 1 && e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (safeItems.length > 1 && e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose, resetView, safeItems.length, zoomBy]);

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    zoomBy(delta);
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

  if (!current) return null;

  const zoomPct = Math.round(scale * 100);

  return (
    <div
      className="ziv-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={current.caption || "Image viewer"}
      onClick={onClose}
    >
      <div className="ziv" onClick={(e) => e.stopPropagation()}>
        <header className="ziv-toolbar">
          <p className="ziv-caption">{current.caption}</p>
          <div className="ziv-controls" aria-label="Zoom controls">
            <button type="button" className="ziv-btn" onClick={() => zoomBy(-ZOOM_STEP)} aria-label="Zoom out">−</button>
            <span className="ziv-zoom-label" aria-live="polite">{zoomPct}%</span>
            <button type="button" className="ziv-btn" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">+</button>
            <button type="button" className="ziv-btn ziv-btn-text" onClick={resetView}>Reset</button>
            <button type="button" className="ziv-btn ziv-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>

        <div
          ref={viewportRef}
          className={`ziv-viewport${scale > 1 ? " ziv-viewport-pannable" : ""}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {safeItems.length > 1 ? (
            <>
              <button
                type="button"
                className="ziv-nav ziv-nav-prev"
                onClick={goPrev}
                disabled={index <= 0}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                className="ziv-nav ziv-nav-next"
                onClick={goNext}
                disabled={index >= safeItems.length - 1}
                aria-label="Next image"
              >
                ›
              </button>
            </>
          ) : null}

          <div
            className="ziv-stage"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          >
            <img
              src={current.src}
              alt={current.alt ?? current.caption}
              className="ziv-img"
              draggable={false}
            />
          </div>
        </div>

        {safeItems.length > 1 ? (
          <footer className="ziv-foot">
            <span>{index + 1} of {safeItems.length}</span>
            <span className="ziv-hint">Arrow keys · +/− zoom · Esc close</span>
          </footer>
        ) : (
          <footer className="ziv-foot ziv-foot-single">
            <span className="ziv-hint">Scroll or +/− to zoom · drag when zoomed · Esc close</span>
          </footer>
        )}
      </div>
    </div>
  );
}
