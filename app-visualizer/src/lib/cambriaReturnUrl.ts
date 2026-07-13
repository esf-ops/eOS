/** Safe return navigation for Cambria visualizer mode only. */

const DEFAULT_CAMBRIA_SHOWCASE =
  "https://slab-inventory.eliteosfab.com/public/cambria?arreya=1";

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Prefer returnUrl query param; fall back to production Cambria showcase. */
export function resolveCambriaShowcaseReturnUrl(): string {
  if (typeof window === "undefined") return DEFAULT_CAMBRIA_SHOWCASE;
  const raw = String(new URLSearchParams(window.location.search).get("returnUrl") ?? "").trim();
  if (raw && isSafeHttpUrl(raw)) return raw;
  return DEFAULT_CAMBRIA_SHOWCASE;
}
