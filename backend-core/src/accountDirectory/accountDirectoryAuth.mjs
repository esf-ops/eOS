/**
 * Account Directory capability gates.
 * Platform uses head access + roles (no separate capability table yet).
 * This module maps roles → account_directory_* capabilities for server enforcement.
 */

export const ACCOUNT_DIRECTORY_HEAD_SLUG = "account_directory";

export const ACCOUNT_DIRECTORY_CAPABILITIES = Object.freeze({
  VIEW: "account_directory_view",
  EDIT: "account_directory_edit",
  ADMIN: "account_directory_admin",
  EXTERNAL_LINK: "account_directory_external_link"
});

const ADMIN_ROLES = new Set(["admin", "super_admin", "executive"]);
const EDIT_ROLES = new Set([
  "admin",
  "super_admin",
  "executive",
  "sales",
  "estimator",
  "office",
  "customer_service"
]);
const EXTERNAL_LINK_ROLES = new Set(["admin", "super_admin", "executive"]);

/**
 * @param {string | null | undefined} role
 * @returns {Set<string>}
 */
export function capabilitiesForRole(role) {
  const r = String(role ?? "").trim().toLowerCase();
  const caps = new Set([ACCOUNT_DIRECTORY_CAPABILITIES.VIEW]);
  if (EDIT_ROLES.has(r)) caps.add(ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  if (ADMIN_ROLES.has(r)) caps.add(ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN);
  if (EXTERNAL_LINK_ROLES.has(r)) caps.add(ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
  return caps;
}

/**
 * @param {string | null | undefined} role
 * @param {string} capability
 */
export function roleHasCapability(role, capability) {
  return capabilitiesForRole(role).has(String(capability ?? "").trim());
}

/**
 * UI-facing permission flags (aligned with app-account-directory types).
 * @param {string | null | undefined} role
 */
export function permissionsForRole(role) {
  const caps = capabilitiesForRole(role);
  return {
    canView: caps.has(ACCOUNT_DIRECTORY_CAPABILITIES.VIEW),
    canCreate: caps.has(ACCOUNT_DIRECTORY_CAPABILITIES.EDIT),
    canEdit: caps.has(ACCOUNT_DIRECTORY_CAPABILITIES.EDIT),
    canArchive: caps.has(ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN),
    canRestore: caps.has(ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN),
    canLinkQuickBooks: caps.has(ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK),
    canViewAudit: caps.has(ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN),
    capabilities: Array.from(caps)
  };
}

/**
 * Express middleware factory: requires a capability after auth + head access.
 * @param {string} capability
 */
export function requireAccountDirectoryCapability(capability) {
  return function accountDirectoryCapabilityGuard(req, res, next) {
    const role = req?.user?.role ?? req?.eosProfile?.role ?? req?.profile?.role ?? null;
    if (!roleHasCapability(role, capability)) {
      return res.status(403).json({
        ok: false,
        error: "Permission denied for this Account Directory action."
      });
    }
    return next();
  };
}
