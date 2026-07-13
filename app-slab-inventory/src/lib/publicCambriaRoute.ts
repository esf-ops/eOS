export const PUBLIC_CAMBRIA_PATH = "/public/cambria";

/** Allowlisted public Cambria showcase route — no auth shell. */
export function isPublicCambriaPath(pathname?: string): boolean {
  const normalized = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""))
    .replace(/\/+$/, "") || "/";
  return normalized === PUBLIC_CAMBRIA_PATH;
}

export { isKioskOrArreyaMode } from "./publicProductCatalogRoute";
