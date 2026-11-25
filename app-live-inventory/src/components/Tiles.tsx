import React, { useState } from "react";

export function IconSearch() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="6" />
      <path d="m13.5 13.5 4 4" strokeLinecap="round" />
    </svg>
  );
}

export function IconRuler() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2" y="6" width="16" height="8" rx="1.5" />
      <path d="M6 6v3M10 6v4M14 6v3" strokeLinecap="round" />
    </svg>
  );
}

export function IconLayout() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2" y="3" width="16" height="14" rx="1.5" />
      <rect x="4.5" y="5.5" width="7" height="4" rx="0.5" />
      <rect x="4.5" y="11" width="11" height="3.5" rx="0.5" />
    </svg>
  );
}

export function IconDownload() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconArrow() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 10h11m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type MediaKind = "swatch" | "cutout";

/**
 * Tile image with fade-in and an ordered fallback list. `swatch` fills the tile with stone
 * texture; `cutout` shows the whole piece on the tile tint (white photo field blended away).
 */
export function TileMedia({
  sources,
  kind,
  children,
  className = "",
}: {
  sources: { url: string | null | undefined; kind: MediaKind }[];
  kind?: MediaKind;
  children?: React.ReactNode;
  className?: string;
}) {
  const list = sources.filter((s): s is { url: string; kind: MediaKind } => Boolean(s.url));
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const current = list[idx];
  const mode = current?.kind ?? kind ?? "cutout";
  return (
    <div className={`li-media li-media--${mode}${loaded ? " is-loaded" : ""} ${className}`}>
      {current ? (
        <img
          key={current.url}
          src={current.url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIdx((i) => i + 1);
          }}
        />
      ) : (
        <div className="li-media-empty" aria-hidden>
          <span>No photo yet</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function TileSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="li-grid" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="li-tile li-tile--skeleton">
          <div className="li-media li-shimmer" />
          <div className="li-tile-body">
            <div className="li-shimmer li-skel-line" />
            <div className="li-shimmer li-skel-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
