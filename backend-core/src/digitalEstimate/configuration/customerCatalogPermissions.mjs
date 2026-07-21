/**
 * Customer catalog permissions — frozen at Studio publication, enforced on
 * public Digital Estimate saves. Missing key = allowed (estimator default).
 *
 * Categories align with Pricing Setup "Customer-selectable catalogs".
 * Pure module — no I/O.
 */

export const CUSTOMER_CATALOG_PERMISSION_KEYS = Object.freeze([
  "material",
  "sink",
  "faucet",
  "accessories",
  "specialty",
  "edge",
  "backsplash",
  "side_splash"
]);

/**
 * Normalize a frozen permissions object into a complete boolean map.
 * @param {unknown} raw
 * @returns {Record<string, boolean>}
 */
export function normalizeCustomerCatalogPermissions(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const key of CUSTOMER_CATALOG_PERMISSION_KEYS) {
    // Missing key = allowed. Explicit false disables.
    out[key] = src[key] !== false && src[key] !== "false" && src[key] !== 0;
  }
  // Legacy aliases
  if (src.accessory === false || src.accessory === "false") out.accessories = false;
  if (src.color === false || src.material_color === false) out.material = false;
  if (src.sidesplash === false || src.sideSplash === false) out.side_splash = false;
  return out;
}

/**
 * Map an option key / role to a permission category.
 * @param {string} optionKey
 * @param {string|null|undefined} [role]
 * @returns {string|null}
 */
export function permissionCategoryForOption(optionKey, role = null) {
  const key = String(optionKey || "");
  const r = String(role || "").toLowerCase();
  if (key.startsWith("material:") || r === "material_selection" || r === "material") {
    return "material";
  }
  if (key.startsWith("backsplash:") || r === "backsplash_selection" || r === "backsplash") {
    return "backsplash";
  }
  if (key.startsWith("sidesplash:") || r === "sidesplash_selection" || r === "sidesplash") {
    return "side_splash";
  }
  if (key.startsWith("edge:") || r === "edge_selection" || r === "edge") {
    return "edge";
  }
  if (key.startsWith("sink:") || r === "sink") return "sink";
  if (key.startsWith("faucet:") || r === "faucet") return "faucet";
  if (key.startsWith("accessory:") || r === "accessory") return "accessories";
  if (key.startsWith("specialty:") || r === "specialty") return "specialty";
  // Legacy qty-* fabrication keys are not customer catalog permissions.
  return null;
}

/**
 * True when the category is customer-selectable.
 * @param {Record<string, boolean>|null|undefined} permissions
 * @param {string|null} category
 */
export function isCatalogCategoryAllowed(permissions, category) {
  if (!category) return true;
  const map = normalizeCustomerCatalogPermissions(permissions);
  return map[category] !== false;
}

/**
 * Collect forbidden selection keys from a quantity map.
 * Baseline/original selections (included_in_baseline with qty matching default)
 * are allowed even when the category is disabled — customers keep the frozen
 * original, they just cannot change away to another option in that category.
 *
 * @param {{
 *   selections: Record<string, number>,
 *   options: Array<object>,
 *   permissions: Record<string, boolean>|null|undefined
 * }} args
 * @returns {Array<{ optionKey: string, category: string }>}
 */
export function collectForbiddenCatalogSelections(args) {
  const permissions = normalizeCustomerCatalogPermissions(args.permissions);
  const options = Array.isArray(args.options) ? args.options : [];
  const byKey = new Map(
    options.map((o) => [String(o.option_key || o.optionKey || ""), o])
  );
  /** @type {Array<{ optionKey: string, category: string }>} */
  const forbidden = [];
  for (const [rawKey, qtyRaw] of Object.entries(args.selections || {})) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    const optionKey = String(rawKey);
    const opt = byKey.get(optionKey) || {};
    const compat =
      (opt.compatibility_json && typeof opt.compatibility_json === "object"
        ? opt.compatibility_json
        : null) ||
      (opt.compatibilityJson && typeof opt.compatibilityJson === "object"
        ? opt.compatibilityJson
        : null) ||
      {};
    const role = compat.role || opt.role || null;
    const category = permissionCategoryForOption(optionKey, role);
    if (!category || permissions[category] !== false) continue;
    // Disabled category: only the original/baseline selection may remain.
    const included = Boolean(
      opt.included_in_baseline ?? opt.includedInBaseline ?? compat.original
    );
    if (included) continue;
    forbidden.push({ optionKey, category });
  }
  return forbidden;
}
