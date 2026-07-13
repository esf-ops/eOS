/**
 * Standalone Cambria visualizer (app-visualizer /cambria).
 * Default production host matches HEAD_URL_VISUALIZER.
 */

const DEFAULT_CAMBRIA_VISUALIZER_BASE = "https://visualizer.eliteosfab.com/cambria";

export function cambriaVisualizerUrl(opts?: { arreya?: boolean; kiosk?: boolean }): string {
  const raw = String(import.meta.env.VITE_CAMBRIA_VISUALIZER_URL ?? "").trim();
  const base = (raw || DEFAULT_CAMBRIA_VISUALIZER_BASE).replace(/\/+$/, "");
  const url = new URL(base.startsWith("http") ? base : `https://${base}`);
  if (opts?.arreya) url.searchParams.set("arreya", "1");
  if (opts?.kiosk) url.searchParams.set("kiosk", "1");
  return url.toString();
}
