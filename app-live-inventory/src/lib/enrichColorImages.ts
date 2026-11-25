import { nameMaterialKey } from "./slabOutline";

export type ColorImageFields = {
  color_key: string;
  color_name: string | null;
  material_name: string | null;
  source_price_group?: string | null;
  representative_image_url: string | null;
  representative_thumbnail_url: string | null;
};

function hasPhoto(p: ColorImageFields) {
  return Boolean(p.representative_thumbnail_url || p.representative_image_url);
}

const SLABCLOUD_HOST = /^https?:\/\/(www\.)?slabcloud\.com\//i;

/**
 * SlabCloud often 404s full `.jpg` while `_thumb.jpg` works. Only SlabCloud URLs are
 * rewritten — eliteOS storage already serves `full.jpg` + `thumb.jpg` as separate objects.
 */
export function preferBrowseThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!SLABCLOUD_HOST.test(url)) return url;
  if (/_thumb\.(jpe?g|png|webp)(\?|$)/i.test(url)) return url;
  return url.replace(/\.(jpe?g|png|webp)(\?|$)/i, "_thumb.$1$2");
}

export function browseImageUrl(p: ColorImageFields): string | null {
  return preferBrowseThumb(p.representative_thumbnail_url) || preferBrowseThumb(p.representative_image_url);
}

/**
 * Primary (Slabsmith) photos live in eliteOS storage and win. SlabCloud photos only
 * fill colors with no primary photo — many SlabCloud rows are stale and 404.
 * Counts are never changed.
 */
export function enrichColorProgramImages<T extends ColorImageFields>(
  primary: T[],
  secondary: ColorImageFields[]
): T[] {
  if (!primary.length || !secondary.length) return primary;

  const byKey = new Map<string, ColorImageFields>();
  const byNamePrice = new Map<string, ColorImageFields>();
  const byName = new Map<string, ColorImageFields>();

  for (const s of secondary) {
    if (!hasPhoto(s)) continue;
    byKey.set(s.color_key, s);
    const nm = nameMaterialKey(s.color_name, s.material_name);
    byNamePrice.set(`${nm}||${String(s.source_price_group || "").trim().toLowerCase()}`, s);
    if (!byName.has(nm)) byName.set(nm, s);
  }

  return primary.map((p) => {
    if (hasPhoto(p)) return p;
    const nm = nameMaterialKey(p.color_name, p.material_name);
    const hit =
      byKey.get(p.color_key) ||
      byNamePrice.get(`${nm}||${String(p.source_price_group || "").trim().toLowerCase()}`) ||
      byName.get(nm);
    if (!hit || !hasPhoto(hit)) return p;
    return {
      ...p,
      representative_image_url: hit.representative_image_url,
      representative_thumbnail_url: hit.representative_thumbnail_url,
    };
  });
}
