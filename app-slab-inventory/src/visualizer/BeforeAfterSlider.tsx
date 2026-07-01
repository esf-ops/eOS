import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterCanvas: HTMLCanvasElement | null;
  width: number;
  height: number;
  enabled: boolean;
};

export function BeforeAfterSlider({
  beforeSrc,
  afterCanvas,
  width,
  height,
  enabled,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!enabled || width < 1 || height < 1) return null;

  return (
    <div
      ref={containerRef}
      className="pv-ba-slider"
      style={{ width, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
    >
      <div className="pv-ba-layer pv-ba-after">
        {afterCanvas ? (
          <img
            src={afterCanvas.toDataURL("image/jpeg", 0.85)}
            alt=""
            draggable={false}
            style={{ width, height }}
          />
        ) : null}
      </div>
      <div
        className="pv-ba-layer pv-ba-before"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={beforeSrc} alt="" draggable={false} style={{ width, height }} />
      </div>
      <div className="pv-ba-handle" style={{ left: `${position}%` }}>
        <span className="pv-ba-handle-grip" aria-hidden />
        <span className="pv-ba-handle-label pv-ba-label-before">Before</span>
        <span className="pv-ba-handle-label pv-ba-label-after">After</span>
      </div>
    </div>
  );
}
