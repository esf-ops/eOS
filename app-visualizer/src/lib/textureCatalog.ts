import catalogJson from "../../catalog/visualizer-textures.json";

export type TextureCatalogEntry = {
  id: string;
  slug: string;
  displayName: string;
  group: string;
  colorFamily: string;
  finish?: string;
  sourceLabel: string;
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
  group: string | null;
  colorFamily: string | null;
  finish: string | null;
  sourceLabel: string | null;
  thumbUrl: string;
  fullUrl: string;
  hasImage: boolean;
  active: boolean;
};

export type TextureCatalogMeta = {
  totalListed: number;
  totalAvailable: number;
  groups: string[];
  colorFamilies: string[];
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
    finish: entry.finish ?? null,
    sourceLabel: entry.sourceLabel ?? null,
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
  return {
    textures,
    meta: {
      totalListed: textures.length,
      totalAvailable: textures.length,
      groups: groups.sort(),
      colorFamilies: colorFamilies.sort(),
    },
  };
}

export function findTexture(id: string, textures: VisualizerTexture[]): VisualizerTexture | undefined {
  const key = id.trim();
  return textures.find((t) => t.id === key || t.slug === key);
}

export type TextureFilterState = {
  search: string;
  group: string;
  colorFamily: string;
};

export function filterTextures(textures: VisualizerTexture[], filters: TextureFilterState): VisualizerTexture[] {
  const q = filters.search.trim().toLowerCase();
  return textures.filter((t) => {
    if (!t.hasImage || !t.thumbUrl || !t.fullUrl) return false;
    if (filters.group && filters.group !== "all" && t.group !== filters.group) return false;
    if (filters.colorFamily && filters.colorFamily !== "all" && t.colorFamily !== filters.colorFamily) return false;
    if (!q) return true;
    const hay = `${t.displayName} ${t.group ?? ""} ${t.colorFamily ?? ""} ${t.finish ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function mergeApiTextures(apiTextures: VisualizerTexture[]): VisualizerTexture[] {
  return apiTextures.filter((t) => t.active !== false && t.hasImage && t.thumbUrl && t.fullUrl);
}
