import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";

export type HomeMotionPhase = "online" | "traverse" | "assemble";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function isHomeMotionEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return !prefersReducedMotion() && !isCoarsePointer() && window.innerWidth > 960;
}

function phaseForProgress(progress: number): HomeMotionPhase {
  if (progress >= 0.72) return "assemble";
  if (progress >= 0.1) return "traverse";
  return "online";
}

/**
 * Phases 1–3: scroll progress drives --home-scroll-progress on stage + .home-cc-launcher.
 * Phase online (0–0.1) → traverse (0.1–0.72) → assemble (0.72–1).
 */
export function useHomeScrollSequence(
  stageRef: RefObject<HTMLElement | null>,
): { motionEnabled: boolean } {
  const motionEnabled = isHomeMotionEnabled();

  useEffect(() => {
    if (!motionEnabled) return;
    const stage = stageRef.current;
    if (!stage) return;

    let raf = 0;

    const applyProgress = (progress: number) => {
      const clamped = Math.min(1, Math.max(0, progress));
      const progressStr = clamped.toFixed(4);
      stage.style.setProperty("--home-scroll-progress", progressStr);
      stage.style.setProperty("--home-scene-depth", String(clamped * 480));
      stage.dataset.phase = phaseForProgress(clamped);

      const launcher = stage.closest(".home-cc-launcher");
      if (launcher instanceof HTMLElement) {
        launcher.style.setProperty("--home-scroll-progress", progressStr);
        launcher.dataset.phase = phaseForProgress(clamped);
      }
    };

    const measure = () => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const stageTop = window.scrollY + rect.top;
      const stageHeight = el.offsetHeight;
      const viewport = window.innerHeight;
      const scrollable = Math.max(stageHeight - viewport, 1);
      const scrolled = window.scrollY - stageTop;
      applyProgress(scrolled / scrollable);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [motionEnabled, stageRef]);

  return { motionEnabled };
}

type ParallaxPending = {
  spotlightX: number;
  spotlightY: number;
  spotlightOpacity: number;
  parallaxX: number;
  parallaxY: number;
};

/** Spotlight accent on the 3D viewport — secondary to scroll-driven motion. */
export function useHomeParallax<T extends HTMLElement>(
  motionEnabled: boolean,
): {
  ref: RefObject<T | null>;
  onPointerMove: (event: PointerEvent<T>) => void;
  onPointerLeave: () => void;
} {
  const ref = useRef<T | null>(null);
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
    el.style.setProperty("--home-parallax-x", String(p.parallaxX));
    el.style.setProperty("--home-parallax-y", String(p.parallaxY));
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<T>) => {
      if (!motionEnabled || event.pointerType === "touch") return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      pendingRef.current = {
        spotlightX: x,
        spotlightY: y,
        spotlightOpacity: 0.85,
        parallaxX: (x / 100) * 2 - 1,
        parallaxY: (y / 100) * 2 - 1,
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyVars);
    },
    [motionEnabled, applyVars],
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

  return { ref, onPointerMove, onPointerLeave };
}

type HomeMotionLayerProps = {
  depth?: number;
  className?: string;
};

export function HomeMotionLayer({ depth = 1, className = "" }: HomeMotionLayerProps) {
  return (
    <div
      className={`home-cc-motion-layer${className ? ` ${className}` : ""}`}
      style={{ "--motion-depth": depth } as CSSProperties}
      aria-hidden
    />
  );
}
