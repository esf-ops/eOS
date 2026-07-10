import { useEffect, useRef, useState } from "react";

interface KioskCardMediaRotatorProps {
  images: string[];
  /** ms between crossfades. Default 5000. */
  intervalMs?: number;
  /** CSS object-position for all images. Default "center". */
  objectPosition?: string;
  /** CSS object-fit. Default "cover". Use "contain" for product shots on a
   *  light background so the full product is always visible. */
  objectFit?: "cover" | "contain";
  /** Optional label describing what the images show (used in alt). */
  label?: string;
}

/**
 * Lightweight crossfading image rotator for navigation card art.
 *
 * Design constraints:
 * - pointer-events: none on every image so touch/click passes through to
 *   the parent card button without interference.
 * - All images stack via position:absolute inside the .kiosk-card-art container.
 * - Only the active image has opacity: 1; rest are 0.
 * - Respects prefers-reduced-motion: shows only the first image, no cycling.
 * - On image load error, the slot is silently skipped.
 * - Preloads the next image before crossfading to minimise pop.
 */
export function KioskCardMediaRotator({
  images,
  intervalMs = 5000,
  objectPosition = "center",
  objectFit = "cover",
  label = "",
}: KioskCardMediaRotatorProps) {
  const valid = images.filter(Boolean);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadedSet, setLoadedSet] = useState<Set<number>>(() => new Set());
  const timerRef = useRef<number | undefined>(undefined);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Start the rotation timer once at least the first image is loaded.
  useEffect(() => {
    if (prefersReduced || valid.length <= 1) return;

    timerRef.current = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % valid.length);
    }, intervalMs);

    return () => {
      if (timerRef.current !== undefined) window.clearInterval(timerRef.current);
    };
  }, [prefersReduced, valid.length, intervalMs]);

  if (valid.length === 0) return null;

  return (
    <>
      {valid.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === activeIdx ? label : ""}
          aria-hidden={i !== activeIdx}
          loading={i === 0 ? "eager" : "lazy"}
          draggable={false}
          className={`kiosk-rotator-img${i === activeIdx ? " kiosk-rotator-img--active" : ""}`}
          style={{ objectPosition, objectFit }}
          onLoad={() => setLoadedSet((s) => new Set(s).add(i))}
          onError={(e) => {
            // Hide permanently broken images so they never flash.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ))}
      {/* Subtle gradient veil at the bottom so card text reads cleanly over photos. */}
      <span className="kiosk-rotator-veil" aria-hidden />
    </>
  );
}
