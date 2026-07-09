/** slabOS Visualizer — runtime configuration from Vite env vars. */

export function backendBaseUrl(): string {
  const raw = String(import.meta.env.VITE_BACKEND_URL ?? "").trim() || "http://localhost:3001";
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

export const PRODUCT_NAME = "slabOS Visualizer";

export const HERO_HEADLINE = "Preview your new countertop";
export const HERO_SUPPORTING = "Upload a kitchen photo and explore Elite 100 colors in seconds.";

export const VISUALIZER_DISCLAIMER =
  "Concept visualization only. Final material appearance, layout, seams, and pricing may vary.";

export const WIZARD_STEPS = ["Upload", "Choose Color", "Preview"] as const;
export type WizardStepLabel = (typeof WIZARD_STEPS)[number];
