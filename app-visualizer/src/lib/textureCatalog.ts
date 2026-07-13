import catalogJson from "../../catalog/visualizer-textures.json";

export type TextureCatalogEntry = {
  id: string;
  slug: string;
  displayName: string;
  group: string;
  colorFamily: string;
  patternType?: "veined" | "solid" | "speckled";
  finish?: string;
  thumbPath: string;
  fullPath: string;
  active: boolean;
  sortOrder?: number;
};

export type VisualizerTexture = {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  collection?: string | null;
  group: string | null;
  colorFamily: string | null;
  patternType: "veined" | "solid" | "speckled" | null;
  finish: string | null;
  thumbUrl: string;
  fullUrl: string;
  hasImage: boolean;
  active: boolean;
  source?: "static" | "elite100_visual_asset" | "cambria_visual_asset";
};

export type TextureCatalogMeta = {
  totalListed: number;
  totalAvailable: number;
  groups: string[];
  colorFamilies: string[];
  patternTypes: string[];
};

const PUBLIC_PREFIX = "/material-textures/";

function toPublicUrl(relativePath: string): string {
  return `${PUBLIC_PREFIX}${relativePath}`;
}

export function loadCatalogEntries(): TextureCatalogEntry[] {
  const list = Array.isArray(catalogJson.textures) ? catalogJson.textures : [];
  return list
    .filter((t) => t.active !== false)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

export function catalogEntriesToTextures(entries: TextureCatalogEntry[]): VisualizerTexture[] {
  return entries.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    name: entry.displayName,
    displayName: entry.displayName,
    group: entry.group ?? null,
    colorFamily: entry.colorFamily ?? null,
    patternType: entry.patternType ?? null,
    finish: entry.finish ?? null,
    thumbUrl: toPublicUrl(entry.thumbPath),
    fullUrl: toPublicUrl(entry.fullPath),
    hasImage: true,
    active: entry.active !== false,
  }));
}

export function buildLocalTextureCatalog(): { textures: VisualizerTexture[]; meta: TextureCatalogMeta } {
  const entries = loadCatalogEntries();
  const textures = catalogEntriesToTextures(entries);
  const groups = [...new Set(textures.map((t) => t.group).filter(Boolean))] as string[];
  const colorFamilies = [...new Set(textures.map((t) => t.colorFamily).filter(Boolean))] as string[];
  const patternTypes = [...new Set(textures.map((t) => t.patternType).filter(Boolean))] as string[];
  return {
    textures,
    meta: {
      totalListed: textures.length,
      totalAvailable: textures.length,
      groups: groups.sort(),
      colorFamilies: colorFamilies.sort(),
      patternTypes: patternTypes.sort(),
    },
  };
}

export type TextureFilterState = {
  search: string;
  colorFamily: string;
  patternType: string;
};

export const COLOR_FILTER_OPTIONS = ["White", "Beige", "Gray", "Black", "Brown"] as const;
export const PATTERN_FILTER_OPTIONS = [
  { value: "veined", label: "Veined" },
  { value: "solid", label: "Solid / quiet" },
] as const;

export function filterTextures(textures: VisualizerTexture[], filters: TextureFilterState): VisualizerTexture[] {
  const q = filters.search.trim().toLowerCase();
  return textures.filter((t) => {
    if (!t.hasImage || !t.thumbUrl || !t.fullUrl) return false;
    if (filters.colorFamily && filters.colorFamily !== "all" && t.colorFamily !== filters.colorFamily) {
      return false;
    }
    if (filters.patternType && filters.patternType !== "all" && t.patternType !== filters.patternType) {
      return false;
    }
    if (!q) return true;
    const hay = `${t.displayName} ${t.colorFamily ?? ""} ${t.patternType ?? ""} ${t.finish ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function mergeApiTextures(apiTextures: VisualizerTexture[]): VisualizerTexture[] {
  const localById = new Map(buildLocalTextureCatalog().textures.map((t) => [t.id, t]));
  return apiTextures
    .filter((t) => t.active !== false && t.hasImage !== false && t.thumbUrl && t.fullUrl)
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name ?? t.displayName,
      displayName: t.displayName,
      collection: t.collection ?? t.group ?? null,
      group: t.group ?? t.collection ?? null,
      colorFamily: t.colorFamily ?? localById.get(t.id)?.colorFamily ?? null,
      patternType: t.patternType ?? localById.get(t.id)?.patternType ?? null,
      finish: t.finish ?? localById.get(t.id)?.finish ?? null,
      thumbUrl: t.thumbUrl,
      fullUrl: t.fullUrl,
      hasImage: true,
      active: true,
      source: t.source,
    }));
}
