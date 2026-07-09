/**
 * Static demo texture catalog for the standalone visualizer MVP.
 * Copied from app-slab-inventory pilot textures — decoupled from slab inventory types.
 */

export type DemoTextureSource = "manual_static_pilot";

export type DemoTexture = {
  id: string;
  colorName: string;
  slug: string;
  thumbUrl: string;
  fullUrl: string;
  source: DemoTextureSource;
};

const DEMO_TEXTURES: DemoTexture[] = [
  { id: "carrara-royale", colorName: "Carrara Royale", slug: "carrara-royale", thumbUrl: "/material-textures/elite100/thumb/carrara-royale.jpg", fullUrl: "/material-textures/elite100/full/carrara-royale.jpg", source: "manual_static_pilot" },
  { id: "carrara-classic", colorName: "Carrara Classic", slug: "carrara-classic", thumbUrl: "/material-textures/elite100/thumb/carrara-classic.jpg", fullUrl: "/material-textures/elite100/full/carrara-classic.jpg", source: "manual_static_pilot" },
  { id: "bianco-carrara", colorName: "Bianco Carrara", slug: "bianco-carrara", thumbUrl: "/material-textures/elite100/thumb/bianco-carrara.jpg", fullUrl: "/material-textures/elite100/full/bianco-carrara.jpg", source: "manual_static_pilot" },
  { id: "bayshore-sand", colorName: "Bayshore Sand", slug: "bayshore-sand", thumbUrl: "/material-textures/elite100/thumb/bayshore-sand.jpg", fullUrl: "/material-textures/elite100/full/bayshore-sand.jpg", source: "manual_static_pilot" },
  { id: "antique-gray", colorName: "Antique Gray", slug: "antique-gray", thumbUrl: "/material-textures/elite100/thumb/antique-gray.jpg", fullUrl: "/material-textures/elite100/full/antique-gray.jpg", source: "manual_static_pilot" },
  { id: "sicilia", colorName: "Sicilia", slug: "sicilia", thumbUrl: "/material-textures/elite100/thumb/sicilia.jpg", fullUrl: "/material-textures/elite100/full/sicilia.jpg", source: "manual_static_pilot" },
  { id: "classic-gray", colorName: "Classic Grey", slug: "classic-gray", thumbUrl: "/material-textures/elite100/thumb/classic-gray.jpg", fullUrl: "/material-textures/elite100/full/classic-gray.jpg", source: "manual_static_pilot" },
  { id: "white-dove", colorName: "White Dove", slug: "white-dove", thumbUrl: "/material-textures/elite100/thumb/white-dove.jpg", fullUrl: "/material-textures/elite100/full/white-dove.jpg", source: "manual_static_pilot" },
  { id: "silver-pearl-polished", colorName: "Silver Pearl", slug: "silver-pearl-polished", thumbUrl: "/material-textures/elite100/thumb/silver-pearl-polished.jpg", fullUrl: "/material-textures/elite100/full/silver-pearl-polished.jpg", source: "manual_static_pilot" },
  { id: "suede-brown-polished", colorName: "Suede Brown", slug: "suede-brown-polished", thumbUrl: "/material-textures/elite100/thumb/suede-brown-polished.jpg", fullUrl: "/material-textures/elite100/full/suede-brown-polished.jpg", source: "manual_static_pilot" },
  { id: "india-black-pearl-polished", colorName: "India Black Pearl", slug: "india-black-pearl-polished", thumbUrl: "/material-textures/elite100/thumb/india-black-pearl-polished.jpg", fullUrl: "/material-textures/elite100/full/india-black-pearl-polished.jpg", source: "manual_static_pilot" },
];

export function listDemoTextures(): readonly DemoTexture[] {
  return DEMO_TEXTURES;
}

export function findDemoTexture(id: string): DemoTexture | undefined {
  const key = id.trim();
  return DEMO_TEXTURES.find((t) => t.id === key || t.slug === key);
}
