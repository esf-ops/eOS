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

/**
 * Keep slabsmith (or primary) stock cards, but fill blank photos from a secondary
 * source (typically SlabCloud) matched by color_key, then color+material+price,
 * then color+material. Does not change counts.
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
    if (!hit) return p;
    return {
      ...p,
      representative_image_url: hit.representative_image_url,
      representative_thumbnail_url: hit.representative_thumbnail_url,
    };
  });
}
