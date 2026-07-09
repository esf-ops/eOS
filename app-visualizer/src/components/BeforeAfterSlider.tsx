import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  enabled?: boolean;
};

export function BeforeAfterSlider({ beforeSrc, afterSrc, enabled = true }: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = beforeSrc;
  }, [beforeSrc]);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(98, Math.max(2, pct)));
  }, []);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!enabled) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!dragging.current) return;
    updateFromClientX(event.clientX);
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    dragging.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPosition((p) => Math.max(2, p - 2));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPosition((p) => Math.min(98, p + 2));
    }
  };

  if (!enabled || !beforeSrc || !afterSrc) return null;

  const aspectRatio = size.width > 0 && size.height > 0 ? `${size.width} / ${size.height}` : "16 / 10";

  return (
    <div
      ref={containerRef}
      className="viz-ba"
      style={{ aspectRatio }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison. Use arrow keys to compare."
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
    >
      <div className="viz-ba-layer viz-ba-after">
        <img src={afterSrc} alt="After — with new countertop" draggable={false} />
        <span className="viz-ba-tag viz-ba-tag-after">After</span>
      </div>
      <div className="viz-ba-layer viz-ba-before" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={beforeSrc} alt="Before — your original photo" draggable={false} />
        <span className="viz-ba-tag viz-ba-tag-before">Before</span>
      </div>
      <div className="viz-ba-divider" style={{ left: `${position}%` }}>
        <span className="viz-ba-handle" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="m10 8-4 4 4 4M14 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}
