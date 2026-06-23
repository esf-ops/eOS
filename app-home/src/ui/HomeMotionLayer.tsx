import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(pointer: coarse)").matches;
}

type ParallaxPending = {
  spotlightX: number;
  spotlightY: number;
  spotlightOpacity: number;
  parallaxX: number;
  parallaxY: number;
};

/**
 * Lightweight pointer parallax for the Home command-center hero.
 * Sets CSS custom properties on the target element — no scroll hijacking.
 */
export function useHomeParallax<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  onPointerMove: (event: PointerEvent<T>) => void;
  onPointerLeave: () => void;
  motionDisabled: boolean;
} {
  const ref = useRef<T | null>(null);
  const motionDisabled = prefersReducedMotion() || isCoarsePointer();
  const rafRef = useRef(0);
  const pendingRef = useRef<ParallaxPending>({
    spotlightX: 50,
    spotlightY: 30,
    spotlightOpacity: 0,
    parallaxX: 0,
    parallaxY: 0,
  });

  const applyVars = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const p = pendingRef.current;
    el.style.setProperty("--spotlight-x", `${p.spotlightX}%`);
    el.style.setProperty("--spotlight-y", `${p.spotlightY}%`);
    el.style.setProperty("--spotlight-opacity", String(p.spotlightOpacity));
    el.style.setProperty("--parallax-x", String(p.parallaxX));
    el.style.setProperty("--parallax-y", String(p.parallaxY));
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<T>) => {
      if (motionDisabled || event.pointerType === "touch") return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      const nx = (x / 100) * 2 - 1;
      const ny = (y / 100) * 2 - 1;
      pendingRef.current = {
        spotlightX: x,
        spotlightY: y,
        spotlightOpacity: 1,
        parallaxX: nx,
        parallaxY: ny,
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyVars);
    },
    [motionDisabled, applyVars],
  );

  const onPointerLeave = useCallback(() => {
    pendingRef.current = {
      ...pendingRef.current,
      spotlightOpacity: 0,
      parallaxX: 0,
      parallaxY: 0,
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(applyVars);
  }, [applyVars]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { ref, onPointerMove, onPointerLeave, motionDisabled };
}

type HomeMotionLayerProps = {
  /** Parallax depth multiplier (1 = subtle, 2 = more movement) */
  depth?: number;
  className?: string;
};

/** Decorative depth layer — transform driven by hero CSS vars. */
export function HomeMotionLayer({ depth = 1, className = "" }: HomeMotionLayerProps) {
  return (
    <div
      className={`home-cc-motion-layer${className ? ` ${className}` : ""}`}
      style={{ "--motion-depth": depth } as React.CSSProperties}
      aria-hidden
    />
  );
}
