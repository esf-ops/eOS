import { useEffect } from "react";
import { isKioskOrArreyaMode } from "./publicProductCatalogRoute";


/**
 * Dense kiosk mode: the showroom kiosk embeds these public pages full-bleed and floats its own
 * logo pill and Home button over them, so the page drops its duplicate header and uses the whole screen.
 * The kiosk turns it on with `?kiosk=1&dense=1`.
 */
export function isDenseKiosk(searchParams?: URLSearchParams): boolean {
  if (typeof window === "undefined") return false;
  const sp = searchParams ?? new URLSearchParams(window.location.search);
  return isKioskOrArreyaMode(sp) && sp.get("dense") === "1";
}

/** Carry dense mode across in-page links so it survives navigating between kiosk pages. */
export function keepDense(href: string): string {
  if (!isDenseKiosk()) return href;
  return href.includes("dense=1") ? href : `${href}${href.includes("?") ? "&" : "?"}dense=1`;
}

/**
 * The kiosk tells the embedded page how much room its floating pill needs on the left
 * (so the page's own top row can sit beside it). Exposed as --kiosk-inset-left.
 */
export function useKioskInset(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data as { type?: string; left?: unknown } | null;
      if (!d || d.type !== "esf-kiosk-inset" || typeof d.left !== "number" || !Number.isFinite(d.left)) return;
      const left = Math.max(0, Math.min(900, Math.round(d.left)));
      document.documentElement.style.setProperty("--kiosk-inset-left", `${left}px`);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "esf-kiosk-ready" }, "*");
    return () => {
      window.removeEventListener("message", onMessage);
      document.documentElement.style.removeProperty("--kiosk-inset-left");
    };
  }, [enabled]);
}

/**
 * Tells the kiosk which title its floating pill should show for this page (null = the section's default title).
 * Every dense page calls this once on mount so the pill is always correct after navigating between pages.
 */
export function useKioskTitle(title: string | null, enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage({ type: "esf-kiosk-title", title }, "*");
  }, [title, enabled]);
}
