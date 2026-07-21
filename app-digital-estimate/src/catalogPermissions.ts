/**
 * Frontend mirror of backend customerCatalogPermissions.
 * Missing key = allowed. Never invents permissions — only reads server DTO.
 */

export const CATALOG_PERMISSION_KEYS = [
  "material",
  "sink",
  "faucet",
  "accessories",
  "specialty",
  "edge",
  "backsplash",
  "side_splash",
] as const;

export type CatalogPermissionKey = (typeof CATALOG_PERMISSION_KEYS)[number];

export type CatalogPermissions = Record<CatalogPermissionKey, boolean>;

export function normalizeCatalogPermissions(
  raw: Record<string, boolean | string | number> | null | undefined,
): CatalogPermissions {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {} as CatalogPermissions;
  for (const key of CATALOG_PERMISSION_KEYS) {
    out[key] = src[key] !== false && src[key] !== "false" && src[key] !== 0;
  }
  if (src.accessory === false) out.accessories = false;
  if (src.color === false || src.material_color === false) out.material = false;
  if (src.sidesplash === false || src.sideSplash === false) out.side_splash = false;
  return out;
}

export function isCategoryAllowed(
  permissions: CatalogPermissions | null | undefined,
  category: CatalogPermissionKey | string | null | undefined,
): boolean {
  if (!category) return true;
  const map = permissions || normalizeCatalogPermissions(null);
  return (map as Record<string, boolean>)[category] !== false;
}

/** Map modal / row role → permission key. */
export function permissionKeyForRole(role: string | null | undefined): CatalogPermissionKey | null {
  const r = String(role || "").toLowerCase();
  if (r === "color" || r === "material" || r === "material_selection") return "material";
  if (r === "backsplash" || r === "backsplash_selection") return "backsplash";
  if (r === "sidesplash" || r === "side_splash" || r === "sidesplash_selection") {
    return "side_splash";
  }
  if (r === "edge" || r === "edge_selection") return "edge";
  if (r === "sink") return "sink";
  if (r === "faucet") return "faucet";
  if (r === "accessory" || r === "accessories") return "accessories";
  if (r === "specialty") return "specialty";
  return null;
}
