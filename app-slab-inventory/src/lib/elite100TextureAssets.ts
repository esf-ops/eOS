/**
 * Static Elite 100 material texture pilot.
 *
 * Future work: move textures to Supabase Storage and map colors via a material
 * texture catalog table (org-scoped), not this hardcoded list.
 */

export type Elite100TextureSource = "manual_static_pilot";

export type Elite100TextureAsset = {
  colorName: string;
  slug: string;
  thumbUrl: string;
  fullUrl: string;
  source: Elite100TextureSource;
};

/** Pilot textures — add new entries here until catalog storage exists. */
const ELITE100_TEXTURE_PILOT: Elite100TextureAsset[] = [
  {
    colorName: "Carrara Royale",
    slug: "carrara-royale",
    thumbUrl: "/material-textures/elite100/thumb/carrara-royale.jpg",
    fullUrl: "/material-textures/elite100/full/carrara-royale.jpg",
    source: "manual_static_pilot",
  },
  {
    colorName: "Carrara Classic",
    slug: "carrara-classic",
    thumbUrl: "/material-textures/elite100/thumb/carrara-classic.jpg",
    fullUrl: "/material-textures/elite100/full/carrara-classic.jpg",
    source: "manual_static_pilot",
  },
  {
    colorName: "Bianco Carrara",
    slug: "bianco-carrara",
    thumbUrl: "/material-textures/elite100/thumb/bianco-carrara.jpg",
    fullUrl: "/material-textures/elite100/full/bianco-carrara.jpg",
    source: "manual_static_pilot",
  },
  {
    colorName: "Bayshore Sand",
    slug: "bayshore-sand",
    thumbUrl: "/material-textures/elite100/thumb/bayshore-sand.jpg",
    fullUrl: "/material-textures/elite100/full/bayshore-sand.jpg",
    source: "manual_static_pilot",
  },
];

const PILOT_BY_SLUG = new Map(ELITE100_TEXTURE_PILOT.map((asset) => [asset.slug, asset]));
const PILOT_BY_NORMALIZED_NAME = new Map(
  ELITE100_TEXTURE_PILOT.map((asset) => [normalizeElite100ColorName(asset.colorName), asset]),
);

/** Lowercase, trim, collapse punctuation and extra spacing for safe name matching. */
export function normalizeElite100ColorName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSlug(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resolve a static pilot texture by color name and/or catalog color_key slug. */
export function lookupElite100Texture(
  colorName: string | null | undefined,
  colorKey?: string | null,
): Elite100TextureAsset | null {
  const slug = normalizeSlug(colorKey);
  if (slug) {
    const bySlug = PILOT_BY_SLUG.get(slug);
    if (bySlug) return bySlug;
  }

  const normalizedName = normalizeElite100ColorName(colorName);
  if (!normalizedName) return null;
  return PILOT_BY_NORMALIZED_NAME.get(normalizedName) ?? null;
}
