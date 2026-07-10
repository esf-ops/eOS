/**
 * app-kiosk — public showroom kiosk configuration.
 *
 * Everything in this file is PUBLIC. No secrets, no internal API URLs, no
 * Supabase keys. Section destinations are configurable via Vite env vars so the
 * same build can be pointed at whatever public tools exist per environment.
 *
 * Section rendering strategy (first pass):
 *   - If a section has a configured public `url`, it renders inside a framed
 *     presentation panel (KioskSectionFrame) with a graceful fallback.
 *   - If a section has no configured `url`, it renders a polished hero panel
 *     (KioskSectionHero) with an "Open section" action.
 *   - Visualizer additionally shows a phone-handoff QR panel, since uploading a
 *     room photo works better from a personal phone than a 65" touchscreen.
 */

export const BRAND = {
  showroomName: "Elite Stone Showroom",
  fabricationName: "Elite Stone Fabrication",
  poweredBy: "Powered by slabOS",
  helpLine: "Need help? Ask an Elite Stone associate.",
} as const;

export const HOME_COPY = {
  headline: "Explore your countertop options",
  subheadline: "Browse colors, sinks, live slabs, and design tools.",
  footnote: "Touch a category to begin.",
} as const;

/** Idle timeout before returning to the attract/home screen (ms). */
export const IDLE_TIMEOUT_MS = (() => {
  const raw = Number(import.meta.env.VITE_KIOSK_IDLE_MS);
  return Number.isFinite(raw) && raw >= 15000 ? raw : 120_000; // default 2 min
})();

/** Public base URL used to build deep links + the visualizer handoff QR. */
export function publicBaseUrl(): string {
  const raw = String(import.meta.env.VITE_KIOSK_PUBLIC_BASE_URL ?? "").trim();
  const fallback = "https://kiosk.eliteosfab.com";
  return (raw || fallback).replace(/\/+$/, "");
}

export type KioskSectionId =
  | "home"
  | "elite100"
  | "product-catalog"
  | "live-inventory"
  | "visualizer";

/** Section ids that can be navigated to as cards (everything except home). */
export type NavSectionId = Exclude<KioskSectionId, "home">;

export type KioskSectionKind = "home" | "iframe-or-hero" | "handoff";

export interface KioskSection {
  id: NavSectionId;
  /** URL slug used in /showroom/:slug/:section */
  slug: NavSectionId;
  title: string;
  /** Short card copy shown on the home screen. */
  cardCopy: string;
  /** Longer supporting copy shown on the section hero. */
  heroCopy: string;
  /** Label for the primary action button. */
  actionLabel: string;
  kind: KioskSectionKind;
  /** Configured public destination (may be empty -> hero fallback). */
  url: string;
  /** Visual accent used for the nav card artwork. */
  accent:
    | "stone"
    | "catalog"
    | "inventory"
    | "visualizer";
}

function envUrl(value: string | undefined): string {
  return String(value ?? "").trim();
}

const VISUALIZER_URL =
  envUrl(import.meta.env.VITE_KIOSK_VISUALIZER_URL) ||
  "https://visualizer.eliteosfab.com";

/**
 * Ordered nav sections (excluding home). Order drives the home card grid and
 * the section deep-link menu.
 */
export const KIOSK_SECTIONS: KioskSection[] = [
  {
    id: "elite100",
    slug: "elite100",
    title: "Elite 100",
    cardCopy: "Browse our premium showroom color collection.",
    heroCopy:
      "Discover the Elite 100 — our curated collection of premium showroom colors, from soft neutrals to dramatic statement stone.",
    actionLabel: "Browse Elite 100",
    kind: "iframe-or-hero",
    // No hard-coded production URL: set VITE_KIOSK_ELITE100_URL to a public page.
    url: envUrl(import.meta.env.VITE_KIOSK_ELITE100_URL),
    accent: "stone",
  },
  {
    id: "product-catalog",
    slug: "product-catalog",
    title: "Product Catalog",
    cardCopy: "Explore sinks, faucets, and accessories.",
    heroCopy:
      "Explore sinks, faucets, and finishing accessories that complete your countertop — mix and match to design the perfect space.",
    actionLabel: "Open Product Catalog",
    kind: "iframe-or-hero",
    // No hard-coded production URL: set VITE_KIOSK_PRODUCT_CATALOG_URL.
    url: envUrl(import.meta.env.VITE_KIOSK_PRODUCT_CATALOG_URL),
    accent: "catalog",
  },
  {
    id: "live-inventory",
    slug: "live-inventory",
    title: "Live Inventory",
    cardCopy: "View available slabs and remnants.",
    heroCopy:
      "See the slabs and remnants available now. Every piece is one of a kind — find the perfect match for your project.",
    actionLabel: "View Live Inventory",
    kind: "iframe-or-hero",
    // No hard-coded production URL: set VITE_KIOSK_LIVE_INVENTORY_URL to a
    // PUBLIC-safe inventory view (no costs, slab IDs, or availability metadata).
    url: envUrl(import.meta.env.VITE_KIOSK_LIVE_INVENTORY_URL),
    accent: "inventory",
  },
  {
    id: "visualizer",
    slug: "visualizer",
    title: "Visualizer",
    cardCopy: "Preview countertop colors in your space.",
    heroCopy:
      "Preview Elite Stone colors in a real room. Scan the code to upload a photo from your phone, or open the visualizer right here on screen.",
    actionLabel: "Open Visualizer on this screen",
    kind: "handoff",
    url: VISUALIZER_URL,
    accent: "visualizer",
  },
];

export function getSection(id: KioskSectionId): KioskSection | undefined {
  return KIOSK_SECTIONS.find((s) => s.id === id);
}
