/** Elite Stone Visualizer — runtime configuration from Vite env vars. */

export function backendBaseUrl(): string {
  const raw = String(import.meta.env.VITE_BACKEND_URL ?? "").trim() || "http://localhost:3001";
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

export const PRODUCT_NAME = "Elite Stone Visualizer";
export const POWERED_BY = "Powered by slabOS";

export const HERO_HEADLINE = "Preview your new countertop";
export const HERO_SUPPORTING = "Upload a kitchen photo and explore Elite 100 colors in seconds.";

export const VISUALIZER_DISCLAIMER =
  "Concept visualization only. Final material appearance, layout, seams, and pricing may vary.";

export const WIZARD_STEPS = ["Upload", "Choose Color", "Preview"] as const;
export type WizardStepLabel = (typeof WIZARD_STEPS)[number];

export type VisualizerSurfaceCopy = {
  productName: string;
  eyebrow: string;
  heroHeadline: string;
  heroSupporting: string;
  chooseColorTitle: string;
  catalogLabel: string;
  emptyTexturesTitle: string;
  emptyTexturesSub: string;
  searchPlaceholder: string;
};

export const DEFAULT_VISUALIZER_COPY: VisualizerSurfaceCopy = {
  productName: PRODUCT_NAME,
  eyebrow: "Elite 100 · Concept Preview",
  heroHeadline: HERO_HEADLINE,
  heroSupporting: HERO_SUPPORTING,
  chooseColorTitle: "Choose your color",
  catalogLabel: "Elite 100 preview colors",
  emptyTexturesTitle: "No colors available",
  emptyTexturesSub: "Preview colors will appear here when the catalog is available.",
  searchPlaceholder: "Search colors…",
};

/** Cambria-only mode — same UI, Cambria wording and textures. */
export const CAMBRIA_VISUALIZER_COPY: VisualizerSurfaceCopy = {
  productName: "Cambria Visualizer",
  eyebrow: "Cambria · Concept Preview",
  heroHeadline: "Preview Cambria designs in a real room",
  heroSupporting: "Upload a kitchen photo and explore Cambria designs in seconds.",
  chooseColorTitle: "Choose a Cambria design",
  catalogLabel: "Cambria designs",
  emptyTexturesTitle: "No Cambria textures available",
  emptyTexturesSub:
    "Cambria designs need display images before they can appear in the visualizer.",
  searchPlaceholder: "Search Cambria designs…",
};
