/**
 * Canonical head slugs for `user_head_access` and future permission checks.
 * Backend must validate — do not rely on UI alone.
 */
export const EOS_HEAD_SLUGS = Object.freeze([
  "executive",
  "brain_health",
  "system_admin",
  "sales",
  "quote",
  "production",
  "shop_tv",
  "install",
  "purchasing",
  "customer_service",
  "hr",
  "safety",
  "marketing",
  "finance",
  "reports",
  "partner_quote",
  "dealer_resources"
]);

const _headSet = new Set(EOS_HEAD_SLUGS);

export function isKnownHeadSlug(slug) {
  return _headSet.has(String(slug ?? "").trim());
}

/** Application roles stored on `user_profiles.role` (ASCII lowercase). */
export const APPLICATION_ROLES = Object.freeze([
  "admin",
  "executive",
  "sales",
  "production",
  "shop_tv",
  "installer",
  "accounting",
  "purchasing",
  "customer_service",
  "hr",
  "safety",
  "marketing",
  "dealer_admin",
  "dealer_user",
  "viewer",
  "finance"
]);

const _roleSet = new Set(APPLICATION_ROLES);

export function isApplicationRole(role) {
  return _roleSet.has(String(role ?? "").trim());
}
