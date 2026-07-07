export const PUBLIC_FAUCETS_PATH = "/public/faucets";

/** Allowlisted public faucets showroom — no auth shell, static catalog data only. */
export function isPublicFaucetsPath(pathname?: string): boolean {
  const normalized = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""))
    .replace(/\/+$/, "") || "/";
  return normalized === PUBLIC_FAUCETS_PATH;
}

export { isKioskOrArreyaMode } from "./publicProductCatalogRoute";
