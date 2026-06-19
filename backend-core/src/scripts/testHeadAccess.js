#!/usr/bin/env node
/**
 * Lightweight checks for head-access constants + middleware wiring (no live HTTP).
 *
 * Manual integration tests (with real JWT + running `npm run eos:server`):
 * 1. Admin user → GET /api/executive/summary with Bearer → 200.
 * 2. Admin user → GET /api/admin/reference with Bearer → 200.
 * 3. Internal user without `executive` in resolved actionable grants → same URL → 403
 *    `{ "ok": false, "error": "You do not have access to this head." }`.
 * 4. dealer_partner user → GET /api/executive/summary (even guessing URL) → 403.
 * 5. Inactive user → requireAuth returns 403 before head middleware; never reaches head data.
 *
 * Grant resolution matches `resolveHeadAccessContext` in `backend-core/src/me/launcherHeads.js`
 * (explicit `user_head_access` rows replace role defaults when present).
 */

import { DEALER_SAFE_HEAD_SLUG_SET, isDealerSafeHeadSlug, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(isKnownHeadSlug("executive"), "executive is a known head slug");
assert(isKnownHeadSlug("sales"), "sales is a known head slug");
assert(isKnownHeadSlug("brain_health"), "brain_health is a known head slug");
assert(isKnownHeadSlug("system_admin"), "system_admin is a known head slug");
assert(isKnownHeadSlug("pricing_admin"), "pricing_admin is a known head slug");
assert(isDealerSafeHeadSlug("partner_quote"), "partner_quote is dealer-safe");
assert(isKnownHeadSlug("quote_library"), "quote_library is a known head slug");
assert(!isDealerSafeHeadSlug("quote_library"), "quote_library must not be dealer-safe");
assert(!isDealerSafeHeadSlug("executive"), "executive must not be dealer-safe");
assert(!isDealerSafeHeadSlug("brain_health"), "brain_health must not be dealer-safe");
assert(!isDealerSafeHeadSlug("pricing_admin"), "pricing_admin must not be dealer-safe");
assert(DEALER_SAFE_HEAD_SLUG_SET.size >= 2, "dealer-safe set should list partner-facing heads");
// "quote" (Internal Estimate) was intentionally removed from DEALER_SAFE in Partner Quote security hardening v1.
// dealer_partner users are now blocked from internal estimate routes at both the partner guard AND head-access layer.
assert(!isDealerSafeHeadSlug("quote"), "quote (Internal Estimate) must not be dealer-safe after hardening");
assert(isKnownHeadSlug("custom_quote"), "custom_quote is a known head slug");
assert(!isDealerSafeHeadSlug("custom_quote"), "custom_quote must not be dealer-safe");
assert(isKnownHeadSlug("install_dashboard"), "install_dashboard is a known head slug");
assert(!isDealerSafeHeadSlug("install_dashboard"), "install_dashboard must not be dealer-safe");

console.log("testHeadAccess: constant checks OK.");
