/**
 * Standalone Cambria visualizer (app-visualizer /cambria).
 * Default production host matches HEAD_URL_VISUALIZER.
 */

const DEFAULT_CAMBRIA_VISUALIZER_BASE = "https://visualizer.eliteosfab.com/cambria";
const DEFAULT_CAMBRIA_SHOWCASE_URL = "https://slab-inventory.eliteosfab.com/public/cambria?arreya=1";

function currentCambriaShowcaseUrl(opts?: { arreya?: boolean; kiosk?: boolean }): string {
  if (typeof window === "undefined") return DEFAULT_CAMBRIA_SHOWCASE_URL;
  const url = new URL(`${window.location.origin}/public/cambria`);
  if (opts?.arreya ?? true) url.searchParams.set("arreya", "1");
  if (opts?.kiosk) url.searchParams.set("kiosk", "1");
  // Prefer current page origin so local/staging return to the same host.
  return url.toString();
}

export function cambriaShowcaseReturnUrl(opts?: { arreya?: boolean; kiosk?: boolean }): string {
  return currentCambriaShowcaseUrl(opts);
}

export function cambriaVisualizerUrl(opts?: {
  arreya?: boolean;
  kiosk?: boolean;
  returnUrl?: string | null;
}): string {
  const raw = String(import.meta.env.VITE_CAMBRIA_VISUALIZER_URL ?? "").trim();
  const base = (raw || DEFAULT_CAMBRIA_VISUALIZER_BASE).replace(/\/+$/, "");
  const url = new URL(base.startsWith("http") ? base : `https://${base}`);
  if (opts?.arreya) url.searchParams.set("arreya", "1");
  if (opts?.kiosk) url.searchParams.set("kiosk", "1");

  const returnUrl = String(opts?.returnUrl ?? "").trim() || currentCambriaShowcaseUrl(opts);
  if (returnUrl) url.searchParams.set("returnUrl", returnUrl);

  return url.toString();
}
