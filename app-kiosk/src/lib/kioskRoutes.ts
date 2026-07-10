/**
 * Lightweight client-side router for the kiosk (no react-router dependency).
 *
 * Supported paths:
 *   /                                  -> same as /showroom/main (home)
 *   /showroom/:showroomSlug            -> home for that showroom
 *   /showroom/:showroomSlug/:section   -> deep link into a section
 *
 * Supported sections: home | elite100 | product-catalog | live-inventory | visualizer
 *
 * The host (Vercel) rewrites every path to index.html (see vercel.json) so any
 * of these URLs can be launched directly by Arreya in kiosk mode.
 */

import { useEffect, useState } from "react";
import type { NavSectionId } from "./kioskConfig";

export const DEFAULT_SHOWROOM_SLUG = "main";

const NAV_SECTION_IDS: NavSectionId[] = [
  "elite100",
  "product-catalog",
  "live-inventory",
  "visualizer",
];

export interface KioskRoute {
  showroomSlug: string;
  /** `null` means the home screen. */
  section: NavSectionId | null;
}

function isNavSectionId(value: string): value is NavSectionId {
  return (NAV_SECTION_IDS as string[]).includes(value);
}

function sanitizeSlug(raw: string): string {
  const slug = decodeURIComponent(raw || "").trim().toLowerCase();
  // Keep it simple + safe: alphanumerics and dashes only.
  const cleaned = slug.replace(/[^a-z0-9-]/g, "");
  return cleaned || DEFAULT_SHOWROOM_SLUG;
}

export function parseRoute(pathname: string): KioskRoute {
  const parts = pathname.split("/").filter(Boolean);

  // "/" -> default showroom home
  if (parts.length === 0) {
    return { showroomSlug: DEFAULT_SHOWROOM_SLUG, section: null };
  }

  // Anything not under /showroom falls back to the default showroom home.
  if (parts[0] !== "showroom") {
    return { showroomSlug: DEFAULT_SHOWROOM_SLUG, section: null };
  }

  const showroomSlug = sanitizeSlug(parts[1] ?? DEFAULT_SHOWROOM_SLUG);
  const rawSection = (parts[2] ?? "").toLowerCase();

  if (!rawSection || rawSection === "home") {
    return { showroomSlug, section: null };
  }

  if (isNavSectionId(rawSection)) {
    return { showroomSlug, section: rawSection };
  }

  // Unknown section -> home for that showroom.
  return { showroomSlug, section: null };
}

export function buildPath(route: KioskRoute): string {
  const base = `/showroom/${route.showroomSlug}`;
  if (!route.section) return base;
  return `${base}/${route.section}`;
}

/** React hook: current route + navigate helper backed by History API. */
export function useKioskRouter(): {
  route: KioskRoute;
  navigate: (next: KioskRoute, opts?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = useState<KioskRoute>(() =>
    parseRoute(window.location.pathname),
  );

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);

    // Normalize "/" to the canonical default showroom path on first load so the
    // address bar (when visible) reflects the real route.
    if (window.location.pathname === "/" || window.location.pathname === "") {
      const path = buildPath({
        showroomSlug: DEFAULT_SHOWROOM_SLUG,
        section: null,
      });
      window.history.replaceState({}, "", path);
    }

    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(next: KioskRoute, opts?: { replace?: boolean }) {
    const path = buildPath(next);
    if (opts?.replace) {
      window.history.replaceState({}, "", path);
    } else {
      window.history.pushState({}, "", path);
    }
    setRoute(next);
  }

  return { route, navigate };
}
