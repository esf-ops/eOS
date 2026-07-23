/**
 * Canonical head slugs for `user_head_access` and future permission checks.
 * Backend must validate — do not rely on UI alone.
 */
export const EOS_HEAD_SLUGS = Object.freeze([
  "executive",
  "brain_health",
  "system_admin",
  "org_directory",
  "pricing_admin",
  "sales",
  "quote",
  "quote_library",
  "production",
  "shop_tv",
  "install",
  "install_dashboard", // Install Dashboard v1 — read-only installer day view
  "purchasing",
  "customer_service",
  "hr",
  "safety",
  "marketing",
  "finance",
  "reports",
  "partner_quote",
  "dealer_resources",
  "ai_takeoff",   // v5.9: AI Takeoff Lab — internal preview head
  "slab_inventory", // Slab Inventory Head v1 — read-only internal slab browser (SlabCloud cache)
  "custom_quote", // Custom Quote Tool — ESF-only off-program material quotes
  "visualizer", // Countertop Visualizer MVP — concept-only AI render (standalone head)
  "quickbooks_intelligence", // QuickBooks Intelligence — AR/revenue/payment insights (read-only)
  "elite100_estimate_studio", // Elite 100 Estimate Studio — private pilot Digital Estimate publish head
  "account_directory" // Account Directory — standalone account identity + estimating contacts (not Estimate Studio)
]);

const _headSet = new Set(EOS_HEAD_SLUGS);

export function isKnownHeadSlug(slug) {
  return _headSet.has(String(slug ?? "").trim());
}

/**
 * Dealer/partner-safe heads only (`user_kind === dealer_partner`).
 *
 * "quote" (Internal Estimate) was intentionally removed:
 *   - dealer_partner users are blocked from internal estimate routes by assertInternalQuoteOperator.
 *   - Removing "quote" from this set adds a second structural layer — requireHeadAccess("quote") now also
 *     blocks dealer users at the middleware level before the partner guard even runs.
 *   - dealer_admin / dealer_user roles (user_kind "internal") are unaffected — their defaultSlugSet
 *     still grants "quote" since the dealer-safe check applies only to user_kind === "dealer_partner".
 */
export const DEALER_SAFE_HEAD_SLUGS = Object.freeze(["partner_quote", "dealer_resources"]);

/** Subset of `EOS_HEAD_SLUGS` — extend `DEALER_SAFE_HEAD_SLUGS` when new dealer-only heads ship. */
export const DEALER_SAFE_HEAD_SLUG_SET = new Set(DEALER_SAFE_HEAD_SLUGS.filter((s) => _headSet.has(s)));

export function isDealerSafeHeadSlug(slug) {
  return DEALER_SAFE_HEAD_SLUG_SET.has(String(slug ?? "").trim());
}

/** Internal ESF heads (documentation / tooling); enforcement for dealers is `isDealerSafeHeadSlug`. */
export const INTERNAL_HEAD_SLUGS_FOR_REFERENCE = Object.freeze([
  "executive",
  "brain_health",
  "system_admin",
  "production",
  "finance",
  "reports",
  "hr",
  "safety"
]);

/** Application roles stored on `user_profiles.role` (ASCII lowercase). */
export const APPLICATION_ROLES = Object.freeze([
  "admin",
  "super_admin",
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
  "finance",
  "estimator"
]);

const _roleSet = new Set(APPLICATION_ROLES);

export function isApplicationRole(role) {
  return _roleSet.has(String(role ?? "").trim());
}
