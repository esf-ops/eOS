import { useEffect, useRef, useState } from "react";
import type { NavSectionId } from "../lib/kioskConfig";

interface Slide {
  id: NavSectionId;
  eyebrow: string;
  headline: string;
  body: string;
  accent: string; // CSS class suffix
}

const SLIDES: Slide[] = [
  {
    id: "elite100",
    eyebrow: "Elite 100 Collection",
    headline: "170+ premium colors",
    body: "From soft marble whites to dramatic statement stones — curated exclusively for Elite Stone.",
    accent: "stone",
  },
  {
    id: "product-catalog",
    eyebrow: "Product Catalog",
    headline: "Complete your countertop",
    body: "Explore our full range of sinks, faucets, and finishing accessories.",
    accent: "catalog",
  },
  {
    id: "live-inventory",
    eyebrow: "Live Inventory",
    headline: "One-of-a-kind slabs",
    body: "Every slab is unique. Browse available stone and remnants in our showroom today.",
    accent: "inventory",
  },
  {
    id: "visualizer",
    eyebrow: "Countertop Visualizer",
    headline: "See it in your space",
    body: "Preview Elite Stone colors in a real room photo. Scan the QR in the Visualizer to try on your phone.",
    accent: "visualizer",
  },
];

const SLIDE_DURATION_MS = 5500;
const FADE_DURATION_MS = 450;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

interface KioskHomeSlideshowProps {
  /** Fired when the user taps the current slide — navigates to that section. */
  onNavigate: (section: NavSectionId) => void;
}

export function KioskHomeSlideshow({ onNavigate }: KioskHomeSlideshowProps) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const reduced = usePrefersReducedMotion();
  const timerRef = useRef<number | undefined>(undefined);
  const fadeRef = useRef<number | undefined>(undefined);

  // Rotate slides on an interval. Skip animation when prefers-reduced-motion.
  useEffect(() => {
    if (reduced) return;

    timerRef.current = window.setInterval(() => {
      // Fade out
      setVisible(false);
      fadeRef.current = window.setTimeout(() => {
        setIdx((i) => (i + 1) % SLIDES.length);
        setVisible(true);
      }, FADE_DURATION_MS);
    }, SLIDE_DURATION_MS);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (fadeRef.current) window.clearTimeout(fadeRef.current);
    };
  }, [reduced]);

  const slide = SLIDES[idx]!;

  return (
    <div className="kiosk-slideshow" aria-live="polite" aria-atomic="true">
      <button
        type="button"
        className={`kiosk-slide kiosk-slide--${slide.accent}${visible ? " kiosk-slide--visible" : ""}`}
        onClick={() => onNavigate(slide.id)}
        aria-label={`${slide.eyebrow} — ${slide.headline}. Touch to explore.`}
      >
        <span className="kiosk-slide-eyebrow">{slide.eyebrow}</span>
        <span className="kiosk-slide-headline">{slide.headline}</span>
        <span className="kiosk-slide-body">{slide.body}</span>
        <span className="kiosk-slide-cue" aria-hidden>Explore →</span>
      </button>

      {/* Progress dots — always visible, not animated */}
      <div className="kiosk-slide-dots" aria-hidden>
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`kiosk-slide-dot${i === idx ? " kiosk-slide-dot--active" : ""}`}
            onClick={() => {
              if (timerRef.current) window.clearInterval(timerRef.current);
              if (fadeRef.current) window.clearTimeout(fadeRef.current);
              setVisible(false);
              fadeRef.current = window.setTimeout(() => {
                setIdx(i);
                setVisible(true);
                // Restart the auto-advance timer
                if (!reduced) {
                  timerRef.current = window.setInterval(() => {
                    setVisible(false);
                    fadeRef.current = window.setTimeout(() => {
                      setIdx((cur) => (cur + 1) % SLIDES.length);
                      setVisible(true);
                    }, FADE_DURATION_MS);
                  }, SLIDE_DURATION_MS);
                }
              }, FADE_DURATION_MS);
            }}
            aria-label={`Go to ${s.eyebrow}`}
          />
        ))}
      </div>
    </div>
  );
}
