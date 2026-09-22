/**
 * Cross-head permission intersection for slabOS AI operational actions.
 * slab_ai alone never grants account_directory / sales / slab_inventory / finance access.
 */
import { resolveHeadAccessContext } from "../me/launcherHeads.js";
import { isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";

/**
 * @param {{ db: any, user: { id: string, role?: string, isActive?: boolean, user_kind?: string, email?: string }, headSlug: string }} args
 * @returns {Promise<{ ok: boolean, allowed: boolean, reason?: string }>}
 */
export async function userMayAccessHead({ db, user, headSlug }) {
  const slug = String(headSlug || "").trim();
  if (!slug || !isKnownHeadSlug(slug)) {
    return { ok: false, allowed: false, reason: "unknown_head" };
  }
  if (!user?.id) return { ok: false, allowed: false, reason: "unauthenticated" };

  const role = String(user.role || "").trim();
  if (role === "admin" || role === "super_admin") {
    return { ok: true, allowed: true };
  }
  if (user.isActive === false) {
    return { ok: true, allowed: false, reason: "inactive" };
  }

  const ctx = await resolveHeadAccessContext(db, user);
  if (!ctx.ok || !ctx.active) {
    return { ok: true, allowed: false, reason: "head_context_denied" };
  }
  if (!ctx.actionableGrantSet.has(slug)) {
    return { ok: true, allowed: false, reason: `missing_head:${slug}` };
  }
  return { ok: true, allowed: true };
}

/**
 * Require both slab_ai (caller already gated) and a domain head.
 */
export async function requireDomainHead({ db, user, domainHead }) {
  const check = await userMayAccessHead({ db, user, headSlug: domainHead });
  if (!check.allowed) {
    return {
      ok: false,
      status: 403,
      code: "DOMAIN_HEAD_REQUIRED",
      error: `This action requires ${domainHead} head access in addition to slabOS AI.`,
      reason: check.reason,
    };
  }
  return { ok: true };
}
