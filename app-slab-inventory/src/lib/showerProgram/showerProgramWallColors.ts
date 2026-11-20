/**
 * Resolves Shower Program wall colors against Elite 100 public showroom data.
 *
 * Elite 100 supplies textures and color identity only. The Shower Program `group`
 * field on each ref is authoritative for Promo/A/B/C display — never derive it
 * from Elite 100 price_group.
 */
import type { Elite100ShowroomData, Elite100ShowroomItem } from "../elite100ShowroomTypes";
import { elite100CardImageSrc } from "../elite100ShowroomTypes";
import {
  SHOWER_PROGRAM_WALL_COLORS,
  type ShowerWallColorRef,
  type ShowerWallGroup,
} from "./showerProgramData";

export type ResolvedShowerWallColor = ShowerWallColorRef & {
  textureUrl: string | null;
  catalogItemId: string | null;
  /** The matching Elite 100 showroom item (opens the color detail), if one was found. */
  item: Elite100ShowroomItem | null;
};

const letters = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

function normalizeKey(colorName: string, materialName: string): string {
  return `${letters(colorName)}::${letters(materialName)}`;
}

/** Build lookup from Elite 100 public showroom payload. */
export function buildElite100ColorLookup(data: Elite100ShowroomData | null): Map<string, Elite100ShowroomItem> {
  const map = new Map<string, Elite100ShowroomItem>();
  for (const group of data?.groups ?? []) {
    for (const item of group.items ?? []) {
      if (item.is_finish_variant) continue;
      const key = normalizeKey(item.color_name ?? "", item.material_name ?? "");
      if (key !== "::") map.set(key, item);
    }
  }
  return map;
}

export function resolveShowerWallColors(
  refs: ShowerWallColorRef[],
  elite100: Elite100ShowroomData | null,
): ResolvedShowerWallColor[] {
  const lookup = buildElite100ColorLookup(elite100);
  // Fallback: a supplier label on the program sheet can differ from the Elite 100 material name,
  // so if the exact color + supplier is not found, match on the color name alone.
  const byColor = new Map<string, Elite100ShowroomItem>();
  for (const item of lookup.values()) {
    const k = letters(item.color_name ?? "");
    if (k && !byColor.has(k)) byColor.set(k, item);
  }
  return refs.map((ref) => {
    const hit = lookup.get(normalizeKey(ref.elite100ColorName, ref.elite100MaterialName)) ?? byColor.get(letters(ref.elite100ColorName)) ?? null;
    return {
      ...ref,
      catalogItemId: hit?.catalog_item_id ?? null,
      textureUrl: hit ? elite100CardImageSrc(hit) : null,
      item: hit,
    };
  });
}

export function filterShowerWallColors(
  colors: ResolvedShowerWallColor[],
  group: "all" | ShowerWallGroup,
): ResolvedShowerWallColor[] {
  if (group === "all") return colors;
  return colors.filter((c) => c.group === group);
}

export { SHOWER_PROGRAM_WALL_COLORS };
