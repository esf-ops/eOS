import { isDealerSafeHeadSlug, isKnownHeadSlug } from "./eosGovernanceConstants.js";
import { resolveHeadAccessContext } from "../me/launcherHeads.js";

const HEAD_ACCESS_DENIED = Object.freeze({
  ok: false,
  error: "You do not have access to this head."
});

/**
 * Head-level gate after `requireAuth()` (and usually `requireRole()`).
 *
 * **Admin bypass** — `role === "admin"` always passes (when active) so incomplete
 * `user_head_access` rows cannot lock operators out of recovery surfaces.
 * Explicit `user_head_access` still controls non-admin users.
 *
 * @param {string} headSlug — must exist in `EOS_HEAD_SLUGS`
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} options
 */
/**
 * Shared authz check used by requireHeadAccess / requireAnyHeadAccess.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {() => import("@supabase/supabase-js").SupabaseClient} getSupabase
 * @param {string[]} allowedSlugs — already validated known head slugs
 * @returns {Promise<boolean>} true when next() should be called
 */
async function evaluateHeadAccess(req, res, getSupabase, allowedSlugs) {
  const u = req.user;
  if (!u || !u.id) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  if (u.isActive === false) {
    res.status(403).json(HEAD_ACCESS_DENIED);
    return false;
  }

  /** Admin / super_admin bypass prevents accidental lockout; explicit head assignment still controls other users. */
  const r = String(u.role ?? "").trim();
  if (r === "admin" || r === "super_admin") {
    return true;
  }

  const supabase = getSupabase();
  const ctx = await resolveHeadAccessContext(supabase, u);

  if (!ctx.ok || !ctx.active) {
    res.status(403).json(HEAD_ACCESS_DENIED);
    return false;
  }

  const dealerBlocked = allowedSlugs.every((slug) => ctx.dealer && !isDealerSafeHeadSlug(slug));
  if (dealerBlocked) {
    res.status(403).json(HEAD_ACCESS_DENIED);
    return false;
  }

  const granted = allowedSlugs.some((slug) => ctx.actionableGrantSet.has(slug));
  if (!granted) {
    res.status(403).json(HEAD_ACCESS_DENIED);
    return false;
  }

  return true;
}

export function requireHeadAccess(headSlug, options = {}) {
  const slug = String(headSlug ?? "").trim();
  if (!isKnownHeadSlug(slug)) {
    throw new Error(`requireHeadAccess: unknown head slug "${headSlug}"`);
  }
  const getSupabase = options.getSupabase;
  if (typeof getSupabase !== "function") {
    throw new Error("requireHeadAccess: options.getSupabase must be a function () => SupabaseClient");
  }

  return async function headAccessMiddleware(req, res, next) {
    try {
      const ok = await evaluateHeadAccess(req, res, getSupabase, [slug]);
      if (ok) return next();
      return undefined;
    } catch (e) {
      console.error("requireHeadAccess failed", e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}

/**
 * Pass when the user has access to **any** of the listed heads (admin/super_admin still bypass).
 * Used when a new head reuses an existing read API without widening dealer-safe surfaces.
 *
 * @param {string[]} headSlugs — each must exist in `EOS_HEAD_SLUGS`
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} options
 */
export function requireAnyHeadAccess(headSlugs, options = {}) {
  const slugs = (Array.isArray(headSlugs) ? headSlugs : [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  if (slugs.length === 0) {
    throw new Error("requireAnyHeadAccess: at least one head slug is required");
  }
  for (const slug of slugs) {
    if (!isKnownHeadSlug(slug)) {
      throw new Error(`requireAnyHeadAccess: unknown head slug "${slug}"`);
    }
  }
  const getSupabase = options.getSupabase;
  if (typeof getSupabase !== "function") {
    throw new Error("requireAnyHeadAccess: options.getSupabase must be a function () => SupabaseClient");
  }

  return async function anyHeadAccessMiddleware(req, res, next) {
    try {
      const ok = await evaluateHeadAccess(req, res, getSupabase, slugs);
      if (ok) return next();
      return undefined;
    } catch (e) {
      console.error("requireAnyHeadAccess failed", e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}
