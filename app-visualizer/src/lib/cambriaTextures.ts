/**
 * Load Cambria designs from the public Cambria showroom and adapt them into
 * the VisualizerTexture shape used by the standalone visualizer head.
 */
import { backendBaseUrl } from "./config";
import type { VisualizerTexture } from "./textureCatalog";

type CambriaDesignItem = {
  catalog_item_id?: string | null;
  color_key?: string | null;
  color_name?: string | null;
  material_name?: string | null;
  display_name?: string | null;
  price_group?: string | null;
  reference_image_url?: string | null;
  reference_image_url_1024?: string | null;
  reference_image_url_600?: string | null;
  visual_asset_url?: string | null;
  visual_asset_url_1024?: string | null;
  visual_asset_url_600?: string | null;
};

type CambriaShowroomPayload = {
  ok?: boolean;
  designs?: {
    groups?: Array<{ price_group?: string; items?: CambriaDesignItem[] }>;
  };
};

function mentionsCambria(value: unknown): boolean {
  const n = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return false;
  return n === "cambria" || n.split(" ").includes("cambria");
}

function slugify(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferColorFamily(colorName: string | null | undefined): string | null {
  const n = String(colorName ?? "")
    .trim()
    .toLowerCase();
  if (!n) return null;
  if (/\bblack\b|\bpearl\b|\bobsidian\b|\bcharcoal\b/.test(n)) return "Black";
  if (/\bbrown\b|\bespresso\b|\bchocolate\b|\bsuede\b/.test(n)) return "Brown";
  if (/\bgray\b|\bgrey\b|\bsilver\b|\bgraphite\b|\bstorm\b/.test(n)) return "Gray";
  if (/\bbeige\b|\bsand\b|\btaupe\b|\bwarm\b/.test(n)) return "Beige";
  if (/\bwhite\b|\bdove\b|\bblizzard\b|\bcarrara\b|\bbianco\b|\bcalacatta\b/.test(n)) {
    return "White";
  }
  return null;
}

function inferPatternType(colorName: string | null | undefined): VisualizerTexture["patternType"] {
  const n = String(colorName ?? "")
    .trim()
    .toLowerCase();
  if (!n) return null;
  if (/\bvein\b|\bcalacatta\b|\bcarrara\b|\bmarble\b|\bstatuario\b/.test(n)) return "veined";
  return "solid";
}

/** Prefer catalog visual/reference textures (renderable); never inventory-only photos. */
function pickTextureUrls(item: CambriaDesignItem): { thumbUrl: string; fullUrl: string } | null {
  const fullUrl =
    item.reference_image_url_1024 ||
    item.reference_image_url ||
    item.visual_asset_url_1024 ||
    item.visual_asset_url ||
    null;
  const thumbUrl =
    item.reference_image_url_600 ||
    item.visual_asset_url_600 ||
    fullUrl;
  if (!fullUrl || !thumbUrl) return null;
  if (!/^https?:\/\//i.test(fullUrl) && !fullUrl.startsWith("/")) return null;
  return { fullUrl: String(fullUrl), thumbUrl: String(thumbUrl) };
}

/**
 * Convert a Cambria public design card into a visualizer texture option.
 * Returns null when the design is not Cambria or has no usable texture URL.
 */
export function toCambriaVisualizerTexture(item: CambriaDesignItem): VisualizerTexture | null {
  if (!item) return null;
  const material = item.material_name;
  // Source is the Cambria public payload; only drop when material is set and non-Cambria.
  if (material && !mentionsCambria(material)) return null;

  const catalogItemId = String(item.catalog_item_id ?? "").trim();
  if (!catalogItemId) return null;

  const urls = pickTextureUrls(item);
  if (!urls) return null;

  const displayName =
    String(item.display_name ?? item.color_name ?? "Cambria design").trim() || "Cambria design";
  const slug = slugify(item.color_key || item.color_name || catalogItemId) || catalogItemId;
  const group = item.price_group ? `Cambria · Group ${item.price_group}` : "Cambria";

  return {
    id: `cambria-${catalogItemId}`,
    slug,
    name: displayName,
    displayName,
    collection: "Cambria",
    group,
    colorFamily: inferColorFamily(item.color_name),
    patternType: inferPatternType(item.color_name),
    finish: null,
    thumbUrl: urls.thumbUrl,
    fullUrl: urls.fullUrl,
    hasImage: true,
    active: true,
    source: "cambria_visual_asset" as VisualizerTexture["source"],
  };
}

export function toCambriaVisualizerTextures(
  groups: Array<{ items?: CambriaDesignItem[] }> | null | undefined,
): VisualizerTexture[] {
  const out: VisualizerTexture[] = [];
  const seen = new Set<string>();
  for (const group of groups ?? []) {
    for (const item of group.items ?? []) {
      const texture = toCambriaVisualizerTexture(item);
      if (!texture || seen.has(texture.id)) continue;
      seen.add(texture.id);
      out.push(texture);
    }
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return out;
}

export async function fetchCambriaVisualizerTextures(): Promise<VisualizerTexture[]> {
  const url = `${backendBaseUrl()}/api/public/cambria-showroom`;
  const res = await fetch(url, { method: "GET", credentials: "omit" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const payload = json as CambriaShowroomPayload;
  return toCambriaVisualizerTextures(payload.designs?.groups ?? []);
}
