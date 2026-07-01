export const PUBLIC_ELITE100_PATH = "/public/elite100";

/** Allowlisted public Elite 100 showroom route — no auth shell. */
export function isPublicElite100Path(pathname?: string): boolean {
  const normalized = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""))
    .replace(/\/+$/, "") || "/";
  return normalized === PUBLIC_ELITE100_PATH;
}

export { isKioskOrArreyaMode } from "./publicProductCatalogRoute";
