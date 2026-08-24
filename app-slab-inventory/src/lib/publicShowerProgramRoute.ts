export const PUBLIC_SHOWER_PROGRAM_PATH = "/public/shower-program";

/** Allowlisted public shower program route — no auth. */
export function isPublicShowerProgramPath(pathname?: string): boolean {
  const normalized = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""))
    .replace(/\/+$/, "") || "/";
  return normalized === PUBLIC_SHOWER_PROGRAM_PATH;
}

export { isKioskOrArreyaMode } from "./publicProductCatalogRoute";
