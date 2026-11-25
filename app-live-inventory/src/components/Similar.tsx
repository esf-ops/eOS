import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { TileMedia } from "./Tiles";

export type SimilarColor = {
  color_key: string;
  color_name: string | null;
  material_name: string | null;
  source_price_group: string | null;
  total_inventory_count: number;
  slab_count: number;
  remnant_count: number;
  representative_image_url: string | null;
  representative_thumbnail_url: string | null;
  largest_piece_long_in?: number | null;
  largest_piece_short_in?: number | null;
  swatch_url?: string | null;
  match_distance?: number;
};

const cache = new Map<string, SimilarColor[]>();

function stockLabel(c: SimilarColor): string {
  const parts: string[] = [];
  if (c.slab_count) parts.push(`${c.slab_count} slab${c.slab_count === 1 ? "" : "s"}`);
  if (c.remnant_count) parts.push(`${c.remnant_count} remnant${c.remnant_count === 1 ? "" : "s"}`);
  return parts.join(" · ") || "In stock";
}

/** "More like this": in-stock colors closest in color and veining to the open one. Hidden when there is nothing to show. */
export function SimilarRail({
  colorKey,
  token,
  source,
  thicknessMm,
  onOpen,
}: {
  colorKey: string;
  token: string | null;
  source: string;
  thicknessMm: number | null;
  onOpen: (c: SimilarColor) => void;
}) {
  const cacheKey = `${source}|${colorKey}|${thicknessMm ?? ""}`;
  const [items, setItems] = useState<SimilarColor[] | null>(() => cache.get(cacheKey) ?? null);

  useEffect(() => {
    if (!token) return;
    const hit = cache.get(cacheKey);
    if (hit) {
      setItems(hit);
      return;
    }
    setItems(null);
    let alive = true;
    const params = new URLSearchParams({ source, limit: "12" });
    if (thicknessMm) params.set("thickness_mm", String(thicknessMm));
    (apiGet(`/api/slab-inventory/colors/${encodeURIComponent(colorKey)}/similar?${params}`, token) as Promise<{ similar?: SimilarColor[] }>)
      .then((body) => {
        const list = body.similar ?? [];
        cache.set(cacheKey, list);
        if (alive) setItems(list);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey, colorKey, source, thicknessMm, token]);

  if (items && items.length === 0) return null;

  return (
    <section className="li-similar" aria-label="More like this">
      <div className="li-similar-head">
        <h3>More like this</h3>
        <span>Closest color &amp; veining in stock</span>
      </div>
      <div className="li-similar-rail" role="list">
        {items
          ? items.map((c) => (
              <button
                key={c.color_key}
                type="button"
                role="listitem"
                className="li-similar-card"
                title={[c.color_name, c.material_name].filter(Boolean).join(" · ")}
                onClick={(e) => {
                  e.currentTarget.closest(".li-lightbox")?.scrollTo({ top: 0, behavior: "smooth" });
                  onOpen(c);
                }}
              >
                <TileMedia
                  className="li-similar-media"
                  sources={[
                    { url: c.swatch_url, kind: "swatch" },
                    { url: c.representative_thumbnail_url, kind: "cutout" },
                    { url: c.representative_image_url, kind: "cutout" },
                  ]}
                />
                <strong>{c.color_name || "Unnamed"}</strong>
                <span>{c.material_name || "—"}</span>
                <em>{stockLabel(c)}</em>
              </button>
            ))
          : Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="li-similar-card li-similar-card--skeleton" aria-hidden>
                <div className="li-media li-similar-media li-shimmer" />
                <i />
                <i />
              </div>
            ))}
      </div>
    </section>
  );
}
